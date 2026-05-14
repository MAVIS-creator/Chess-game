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

type CommentaryActor = "player" | "bot";

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
      comment: string;
      style: string;
    }>;

    const commentaryText =
      typeof parsed.commentary === "string" && parsed.commentary.trim().length > 0
        ? parsed.commentary.trim()
        : typeof parsed.comment === "string" && parsed.comment.trim().length > 0
          ? parsed.comment.trim()
          : "Your move exposed something.";

    return {
      commentary: commentaryText,
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

  pickLocalMove(request: BotDecisionRequest): BotDecisionResult {
    const safeCandidateMoves = buildSafeCandidateSet(request.difficulty, request.candidateMoves);
    const fallback = neutralFallback(request.difficulty, safeCandidateMoves);
    const pickFrom = safeCandidateMoves.length > 0 ? safeCandidateMoves : request.candidateMoves;
    const chosen = this.selectCandidateByDifficulty(request.difficulty, pickFrom) ?? pickFrom[0];

    if (!chosen) {
      return fallback;
    }

    return {
      selectedMove: chosen.move,
      commentary: DIFFICULTY_CONFIG[request.difficulty].commentaryFallback,
      style: chosen.label,
      provider: "disabled",
      usedFallback: true
    };
  }

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
      for (const provider of this.getProviderOrderForDifficulty(request.difficulty)) {
        switch (provider) {
          case "groq": {
            const result = await this.callGroq(strictRequest, fallback);
            if (!result.usedFallback) {
              return result;
            }
            break;
          }
          case "openrouter": {
            const result = await this.callOpenRouter(strictRequest, fallback);
            if (!result.usedFallback) {
              return result;
            }
            break;
          }
          case "gemini": {
            const result = await this.callGemini(strictRequest, fallback);
            if (!result.usedFallback) {
              return result;
            }
            break;
          }
          default:
            break;
        }
      }

      return fallback;
    } catch {
      return fallback;
    }
  }

  getProvider() {
    return this.provider;
  }

  getProviderForDifficulty(difficulty: BotDifficulty) {
    return this.getProviderOrderForDifficulty(difficulty)[0] ?? "disabled";
  }

  private getProviderOrderForDifficulty(difficulty: BotDifficulty): BotProvider[] {
    const available: BotProvider[] = [];
    const pushIfAvailable = (provider: BotProvider) => {
      if (available.includes(provider)) {
        return;
      }

      if (provider === "groq" && import.meta.env.VITE_GROQ_API_KEY) {
        available.push(provider);
      }

      if (provider === "openrouter" && import.meta.env.VITE_OPENROUTER_API_KEY) {
        available.push(provider);
      }

      if (provider === "gemini" && import.meta.env.VITE_GEMINI_API_KEY) {
        available.push(provider);
      }
    };

    if (difficulty === "Nightmare Mode" || difficulty === "Impossible") {
      pushIfAvailable("gemini");
      pushIfAvailable("groq");
      pushIfAvailable("openrouter");
      pushIfAvailable(this.provider);
      return available.length > 0 ? available : ["disabled"];
    }

    pushIfAvailable(this.provider);
    pushIfAvailable("groq");
    pushIfAvailable("openrouter");
    pushIfAvailable("gemini");
    return available.length > 0 ? available : ["disabled"];
  }

  private selectCandidateByDifficulty(
    difficulty: BotDifficulty,
    candidateMoves: EngineCandidateMove[]
  ) {
    if (candidateMoves.length === 0) {
      return null;
    }

    if (difficulty === "Impossible" || difficulty === "Nightmare Mode") {
      return candidateMoves[0];
    }

    const windowSize =
      difficulty === "Boss Mode" ? 2 : difficulty === "Hard" ? 2 : difficulty === "Normal" ? 3 : 4;
    const pool = candidateMoves.slice(0, Math.min(windowSize, candidateMoves.length));
    const random = Math.random();

    if (difficulty === "Boss Mode") {
      return random < 0.82 || pool.length === 1 ? pool[0] : pool[1];
    }

    if (difficulty === "Hard") {
      return random < 0.78 || pool.length === 1 ? pool[0] : pool[Math.min(1, pool.length - 1)];
    }

    if (difficulty === "Normal") {
      if (random < 0.58 || pool.length === 1) {
        return pool[0];
      }
      if (random < 0.84 || pool.length === 2) {
        return pool[Math.min(1, pool.length - 1)];
      }
      return pool[Math.min(2, pool.length - 1)];
    }

    if (random < 0.36 || pool.length === 1) {
      return pool[0];
    }
    if (random < 0.63 || pool.length === 2) {
      return pool[Math.min(1, pool.length - 1)];
    }
    if (random < 0.84 || pool.length === 3) {
      return pool[Math.min(2, pool.length - 1)];
    }
    return pool[Math.min(3, pool.length - 1)];
  }

  async decorateMoveCommentary(
    request: BotDecisionRequest,
    selectedMove: string
  ): Promise<BotCommentaryResult | null> {
    return this.decorateCommentary(request, selectedMove, "bot");
  }

  async decoratePlayerMoveCommentary(
    request: BotDecisionRequest,
    selectedMove: string
  ): Promise<BotCommentaryResult | null> {
    return this.decorateCommentary(request, selectedMove, "player");
  }

  private async decorateCommentary(
    request: BotDecisionRequest,
    selectedMove: string,
    actor: CommentaryActor
  ): Promise<BotCommentaryResult | null> {
    const providers = this.getProviderOrderForDifficulty(request.difficulty);

    if (providers[0] === "disabled") {
      return null;
    }

    try {
      for (const provider of providers) {
        switch (provider) {
          case "groq": {
            const result = await this.callGroqCommentary(request, selectedMove, actor);
            if (result) {
              return result;
            }
            break;
          }
          case "openrouter": {
            const result = await this.callOpenRouterCommentary(request, selectedMove, actor);
            if (result) {
              return result;
            }
            break;
          }
          case "gemini": {
            const result = await this.callGeminiCommentary(request, selectedMove, actor);
            if (result) {
              return result;
            }
            break;
          }
          default:
            break;
        }
      }

      return null;
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

  private async callGroqCommentary(
    request: BotDecisionRequest,
    selectedMove: string,
    actor: CommentaryActor
  ) {
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
                selectedMove,
                actor
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

  private async callOpenRouterCommentary(
    request: BotDecisionRequest,
    selectedMove: string,
    actor: CommentaryActor
  ) {
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
                selectedMove,
                actor
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

  private async callGeminiCommentary(
    request: BotDecisionRequest,
    selectedMove: string,
    actor: CommentaryActor
  ) {
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
                    selectedMove,
                    actor
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
