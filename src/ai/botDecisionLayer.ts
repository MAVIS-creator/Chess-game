import type { EngineCandidateMove } from "../engine/candidateMoves";
import {
  DEFAULT_PROVIDER,
  DIFFICULTY_CONFIG,
  type BotDifficulty,
  type BotPersonalityProfile,
  type BotProvider
} from "./botPersonality";
import { buildBotCommentaryPrompt, buildBotUserPrompt, BOT_SYSTEM_PROMPT } from "./botPrompts";
import { parseBotResponse } from "./botResponseParser";

export interface BotDecisionRequest {
  fen: string;
  moveHistory: string[];
  playerColor: "white" | "black";
  botColor: "white" | "black";
  difficulty: BotDifficulty;
  personality: BotPersonalityProfile;
  candidateMoves: EngineCandidateMove[];
}

export interface BotDecisionResult {
  selectedMove: string;
  commentary: string;
  style: string;
  provider: BotProvider;
  usedFallback: boolean;
}

export interface BotCommentaryResult {
  commentary: string;
  style: string;
  provider: BotProvider;
  usedFallback: boolean;
}

const validateBotMove = (
  selectedMove: string,
  candidateMoves: EngineCandidateMove[],
  forceBestMove: boolean
) => {
  if (!candidateMoves.length) {
    return selectedMove;
  }

  if (forceBestMove) {
    return candidateMoves[0].move;
  }

  const allowedMoves = new Set(candidateMoves.map((candidate) => candidate.move));
  return allowedMoves.has(selectedMove) ? selectedMove : candidateMoves[0].move;
};

const neutralFallback = (
  difficulty: BotDifficulty,
  candidateMoves: EngineCandidateMove[]
): BotDecisionResult => ({
  selectedMove: candidateMoves[0].move,
  commentary: DIFFICULTY_CONFIG[difficulty].commentaryFallback,
  style: candidateMoves[0].label,
  provider: "disabled",
  usedFallback: true
});

const scoreGapFromBest = (best: EngineCandidateMove, candidate: EngineCandidateMove) => {
  if (best.mateIn !== null || candidate.mateIn !== null) {
    if (best.mateIn !== null && candidate.mateIn !== null) {
      return Math.abs(best.mateIn - candidate.mateIn) * 1000;
    }

    return 100000;
  }

  return Math.max(0, best.score - candidate.score);
};

const buildSafeCandidateSet = (
  difficulty: BotDifficulty,
  candidateMoves: EngineCandidateMove[]
) => {
  const config = DIFFICULTY_CONFIG[difficulty];
  const ranked = [...candidateMoves];
  const best = ranked[0];
  const second = ranked[1];

  if (!best) {
    return [];
  }

  if (config.forceBestMove || ranked.length === 1) {
    return [best];
  }

  if (best.mateIn !== null && best.mateIn > 0) {
    return [best];
  }

  if (best.mateIn !== null && best.mateIn < 0) {
    return ranked.slice(0, Math.min(2, ranked.length));
  }

  if (second && scoreGapFromBest(best, second) >= config.singularMarginCp) {
    return [best];
  }

  const safe = ranked
    .filter((candidate) => scoreGapFromBest(best, candidate) <= config.maxEvalLossCp)
    .slice(0, config.maxCandidateCount);

  return safe.length > 0 ? safe : [best];
};

const openAiCompatiblePayload = (
  model: string,
  temperature: number,
  userPrompt: string
) => ({
  model,
  temperature,
  response_format: {
    type: "json_schema",
    json_schema: {
      name: "bot_move_choice",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["selectedMove", "commentary", "style"],
        properties: {
          selectedMove: {
            type: "string",
            pattern: "^[a-h][1-8][a-h][1-8][qrbn]?$"
          },
          commentary: {
            type: "string"
          },
          style: {
            type: "string"
          }
        }
      }
    }
  },
  messages: [
    { role: "system", content: BOT_SYSTEM_PROMPT },
    {
      role: "user",
      content: userPrompt
    }
  ]
});

const commentarySchema = {
  type: "json_schema" as const,
  json_schema: {
    name: "bot_commentary",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["commentary", "style"],
      properties: {
        commentary: {
          type: "string"
        },
        style: {
          type: "string"
        }
      }
    }
  }
};

const parseCommentaryResponse = (raw: string): Pick<BotCommentaryResult, "commentary" | "style"> | null => {
  try {
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/gim, "").trim()) as Partial<{
      commentary: string;
      style: string;
    }>;

    return {
      commentary:
        typeof parsed.commentary === "string" && parsed.commentary.trim().length > 0
          ? parsed.commentary.trim()
          : "Your move exposed something.",
      style:
        typeof parsed.style === "string" && parsed.style.trim().length > 0
          ? parsed.style.trim()
          : "engine-backed"
    };
  } catch {
    return null;
  }
};

export class BotDecisionLayer {
  private provider = (import.meta.env.VITE_AI_PROVIDER as BotProvider | undefined) ?? DEFAULT_PROVIDER;

  async chooseMove(request: BotDecisionRequest): Promise<BotDecisionResult> {
    if (request.candidateMoves.length === 0) {
      throw new Error("No candidate moves were provided to the decision layer.");
    }

    const safeCandidateMoves = buildSafeCandidateSet(request.difficulty, request.candidateMoves);
    const strictRequest: BotDecisionRequest = {
      ...request,
      candidateMoves: safeCandidateMoves
    };
    const fallback = neutralFallback(request.difficulty, safeCandidateMoves);

    // In the hardest modes, do not wait on remote providers.
    // Use Stockfish rank 1 immediately so network or API latency cannot throw the game.
    if (DIFFICULTY_CONFIG[request.difficulty].forceBestMove) {
      return fallback;
    }

    try {
      switch (this.provider) {
        case "groq":
          return await this.callGroq(strictRequest, fallback);
        case "openrouter":
          return await this.callOpenRouter(strictRequest, fallback);
        case "gemini":
          return await this.callGemini(strictRequest, fallback);
        default:
          return fallback;
      }
    } catch {
      return fallback;
    }
  }

  getProvider() {
    return this.provider;
  }

  async decorateMoveCommentary(
    request: BotDecisionRequest,
    selectedMove: string
  ): Promise<BotCommentaryResult | null> {
    if (this.provider === "disabled") {
      return null;
    }

    try {
      switch (this.provider) {
        case "groq":
          return await this.callGroqCommentary(request, selectedMove);
        case "openrouter":
          return await this.callOpenRouterCommentary(request, selectedMove);
        case "gemini":
          return await this.callGeminiCommentary(request, selectedMove);
        default:
          return null;
      }
    } catch {
      return null;
    }
  }

  private async fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal
      });
    } finally {
      window.clearTimeout(timeout);
    }
  }

  private async callGroq(request: BotDecisionRequest, fallback: BotDecisionResult) {
    const apiKey = import.meta.env.VITE_GROQ_API_KEY;
    const model = import.meta.env.VITE_GROQ_MODEL ?? "llama-3.1-8b-instant";

    if (!apiKey) {
      return fallback;
    }

    const response = await this.fetchWithTimeout(
      "https://api.groq.com/openai/v1/chat/completions",
      {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(
        openAiCompatiblePayload(
          model,
          DIFFICULTY_CONFIG[request.difficulty].temperature,
          buildBotUserPrompt({
            ...request,
            candidateMoves: request.candidateMoves,
            forceBestMove: DIFFICULTY_CONFIG[request.difficulty].forceBestMove
          })
        )
      )
      },
      DIFFICULTY_CONFIG[request.difficulty].commentaryTimeoutMs
    );

    if (!response.ok) {
      return fallback;
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return fallback;
    }

    const parsed = parseBotResponse(content, request.candidateMoves);
    return parsed
      ? {
          ...parsed,
          selectedMove: validateBotMove(
            parsed.selectedMove,
            request.candidateMoves,
            DIFFICULTY_CONFIG[request.difficulty].forceBestMove
          ),
          provider: "groq" as const,
          usedFallback: false
        }
      : fallback;
  }

  private async callOpenRouter(request: BotDecisionRequest, fallback: BotDecisionResult) {
    const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
    const model = import.meta.env.VITE_OPENROUTER_MODEL ?? "openai/gpt-4o-mini";

    if (!apiKey) {
      return fallback;
    }

    const response = await this.fetchWithTimeout(
      "https://openrouter.ai/api/v1/chat/completions",
      {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": window.location.origin,
        "X-Title": "Wooden Chess"
      },
      body: JSON.stringify(
        openAiCompatiblePayload(
          model,
          DIFFICULTY_CONFIG[request.difficulty].temperature,
          buildBotUserPrompt({
            ...request,
            candidateMoves: request.candidateMoves,
            forceBestMove: DIFFICULTY_CONFIG[request.difficulty].forceBestMove
          })
        )
      )
      },
      DIFFICULTY_CONFIG[request.difficulty].commentaryTimeoutMs
    );

    if (!response.ok) {
      return fallback;
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return fallback;
    }

    const parsed = parseBotResponse(content, request.candidateMoves);
    return parsed
      ? {
          ...parsed,
          selectedMove: validateBotMove(
            parsed.selectedMove,
            request.candidateMoves,
            DIFFICULTY_CONFIG[request.difficulty].forceBestMove
          ),
          provider: "openrouter" as const,
          usedFallback: false
        }
      : fallback;
  }

  private async callGemini(request: BotDecisionRequest, fallback: BotDecisionResult) {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    const model = import.meta.env.VITE_GEMINI_MODEL ?? "gemini-1.5-flash";

    if (!apiKey) {
      return fallback;
    }

    const response = await this.fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          generationConfig: {
            temperature: DIFFICULTY_CONFIG[request.difficulty].temperature,
            responseMimeType: "application/json"
          },
          systemInstruction: {
            parts: [{ text: BOT_SYSTEM_PROMPT }]
          },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: buildBotUserPrompt({
                    ...request,
                    forceBestMove: DIFFICULTY_CONFIG[request.difficulty].forceBestMove
                  })
                }
              ]
            }
          ]
        })
      },
      DIFFICULTY_CONFIG[request.difficulty].commentaryTimeoutMs
    );

    if (!response.ok) {
      return fallback;
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) {
      return fallback;
    }

    const parsed = parseBotResponse(content, request.candidateMoves);
    return parsed
      ? {
          ...parsed,
          selectedMove: validateBotMove(
            parsed.selectedMove,
            request.candidateMoves,
            DIFFICULTY_CONFIG[request.difficulty].forceBestMove
          ),
          provider: "gemini" as const,
          usedFallback: false
        }
      : fallback;
  }

  private async callGroqCommentary(request: BotDecisionRequest, selectedMove: string) {
    const apiKey = import.meta.env.VITE_GROQ_API_KEY;
    const model = import.meta.env.VITE_GROQ_MODEL ?? "llama-3.1-8b-instant";

    if (!apiKey) {
      return null;
    }

    const response = await this.fetchWithTimeout(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          temperature: DIFFICULTY_CONFIG[request.difficulty].temperature,
          response_format: commentarySchema,
          messages: [
            { role: "system", content: BOT_SYSTEM_PROMPT },
            {
              role: "user",
              content: buildBotCommentaryPrompt(
                {
                  ...request,
                  forceBestMove: DIFFICULTY_CONFIG[request.difficulty].forceBestMove
                },
                selectedMove
              )
            }
          ]
        })
      },
      DIFFICULTY_CONFIG[request.difficulty].commentaryTimeoutMs
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    const parsed = content ? parseCommentaryResponse(content) : null;

    return parsed
      ? { ...parsed, provider: "groq" as const, usedFallback: false }
      : null;
  }

  private async callOpenRouterCommentary(request: BotDecisionRequest, selectedMove: string) {
    const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
    const model = import.meta.env.VITE_OPENROUTER_MODEL ?? "openai/gpt-4.1";

    if (!apiKey) {
      return null;
    }

    const response = await this.fetchWithTimeout(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": window.location.origin,
          "X-Title": "Wooden Chess"
        },
        body: JSON.stringify({
          model,
          temperature: DIFFICULTY_CONFIG[request.difficulty].temperature,
          response_format: commentarySchema,
          messages: [
            { role: "system", content: BOT_SYSTEM_PROMPT },
            {
              role: "user",
              content: buildBotCommentaryPrompt(
                {
                  ...request,
                  forceBestMove: DIFFICULTY_CONFIG[request.difficulty].forceBestMove
                },
                selectedMove
              )
            }
          ]
        })
      },
      DIFFICULTY_CONFIG[request.difficulty].commentaryTimeoutMs
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    const parsed = content ? parseCommentaryResponse(content) : null;

    return parsed
      ? { ...parsed, provider: "openrouter" as const, usedFallback: false }
      : null;
  }

  private async callGeminiCommentary(request: BotDecisionRequest, selectedMove: string) {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    const model = import.meta.env.VITE_GEMINI_MODEL ?? "gemini-1.5-flash";

    if (!apiKey) {
      return null;
    }

    const response = await this.fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          generationConfig: {
            temperature: DIFFICULTY_CONFIG[request.difficulty].temperature,
            responseMimeType: "application/json"
          },
          systemInstruction: {
            parts: [{ text: BOT_SYSTEM_PROMPT }]
          },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: buildBotCommentaryPrompt(
                    {
                      ...request,
                      forceBestMove: DIFFICULTY_CONFIG[request.difficulty].forceBestMove
                    },
                    selectedMove
                  )
                }
              ]
            }
          ]
        })
      },
      DIFFICULTY_CONFIG[request.difficulty].commentaryTimeoutMs
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = content ? parseCommentaryResponse(content) : null;

    return parsed
      ? { ...parsed, provider: "gemini" as const, usedFallback: false }
      : null;
  }
}
