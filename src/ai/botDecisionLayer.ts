import type { EngineCandidateMove } from "../engine/candidateMoves";
import {
  DEFAULT_PROVIDER,
  DIFFICULTY_CONFIG,
  type BotDifficulty,
  type BotPersonalityProfile,
  type BotProvider
} from "./botPersonality";
import { buildBotUserPrompt, BOT_SYSTEM_PROMPT } from "./botPrompts";
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

const openAiCompatiblePayload = (
  request: BotDecisionRequest,
  model: string,
  temperature: number
) => ({
  model,
  temperature,
  response_format: { type: "json_object" },
  messages: [
    { role: "system", content: BOT_SYSTEM_PROMPT },
    {
      role: "user",
      content: buildBotUserPrompt({
        ...request,
        candidateMoves: request.candidateMoves
      })
    }
  ]
});

export class BotDecisionLayer {
  private provider = (import.meta.env.VITE_AI_PROVIDER as BotProvider | undefined) ?? DEFAULT_PROVIDER;

  async chooseMove(request: BotDecisionRequest): Promise<BotDecisionResult> {
    if (request.candidateMoves.length === 0) {
      throw new Error("No candidate moves were provided to the decision layer.");
    }

    const fallback = neutralFallback(request.difficulty, request.candidateMoves);

    try {
      switch (this.provider) {
        case "groq":
          return await this.callGroq(request, fallback);
        case "openrouter":
          return await this.callOpenRouter(request, fallback);
        case "gemini":
          return await this.callGemini(request, fallback);
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

  private async callGroq(request: BotDecisionRequest, fallback: BotDecisionResult) {
    const apiKey = import.meta.env.VITE_GROQ_API_KEY;
    const model = import.meta.env.VITE_GROQ_MODEL ?? "llama-3.1-8b-instant";

    if (!apiKey) {
      return fallback;
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(
        openAiCompatiblePayload(request, model, DIFFICULTY_CONFIG[request.difficulty].temperature)
      )
    });

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
      ? { ...parsed, provider: "groq" as const, usedFallback: false }
      : fallback;
  }

  private async callOpenRouter(request: BotDecisionRequest, fallback: BotDecisionResult) {
    const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
    const model = import.meta.env.VITE_OPENROUTER_MODEL ?? "openai/gpt-4o-mini";

    if (!apiKey) {
      return fallback;
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": window.location.origin,
        "X-Title": "Wooden Chess"
      },
      body: JSON.stringify(
        openAiCompatiblePayload(request, model, DIFFICULTY_CONFIG[request.difficulty].temperature)
      )
    });

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
      ? { ...parsed, provider: "openrouter" as const, usedFallback: false }
      : fallback;
  }

  private async callGemini(request: BotDecisionRequest, fallback: BotDecisionResult) {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    const model = import.meta.env.VITE_GEMINI_MODEL ?? "gemini-1.5-flash";

    if (!apiKey) {
      return fallback;
    }

    const response = await fetch(
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
              parts: [{ text: buildBotUserPrompt(request) }]
            }
          ]
        })
      }
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
      ? { ...parsed, provider: "gemini" as const, usedFallback: false }
      : fallback;
  }
}
