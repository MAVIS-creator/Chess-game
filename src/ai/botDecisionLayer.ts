import { getApiAuthHeaders } from "../auth/apiSession";
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
type RemoteProvider = Exclude<BotProvider, "disabled">;

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
): BotDecisionResult => {
  const best = candidateMoves[0];
  return {
    selectedMove: best?.move ?? "",
    commentary: DIFFICULTY_CONFIG[difficulty].commentaryFallback,
    style: best?.label ?? "best",
    provider: "disabled",
    usedFallback: true
  };
};

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

const parseCommentaryResponse = (raw: string): Pick<BotCommentaryResult, "commentary" | "style"> | null => {
  try {
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/gim, "").trim()) as Partial<{
      commentary: string;
      comment: string;
      style: string;
    }>;

    const commentary =
      typeof parsed.commentary === "string" && parsed.commentary.trim()
        ? parsed.commentary.trim()
        : typeof parsed.comment === "string" && parsed.comment.trim()
          ? parsed.comment.trim()
          : "Your move exposed something.";

    return {
      commentary,
      style: typeof parsed.style === "string" && parsed.style.trim() ? parsed.style.trim() : "engine-backed"
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
    const chosen = this.selectCandidateByDifficulty(request.difficulty, safeCandidateMoves);

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

    if (DIFFICULTY_CONFIG[request.difficulty].forceBestMove || this.provider === "disabled") {
      return fallback;
    }

    for (const provider of this.getProviderOrderForDifficulty(request.difficulty)) {
      const raw = await this.callProxy(
        provider,
        "decision",
        buildBotUserPrompt({
          ...strictRequest,
          forceBestMove: DIFFICULTY_CONFIG[request.difficulty].forceBestMove
        }),
        DIFFICULTY_CONFIG[request.difficulty].temperature,
        DIFFICULTY_CONFIG[request.difficulty].commentaryTimeoutMs
      );

      if (!raw) {
        continue;
      }

      const parsed = parseBotResponse(raw, safeCandidateMoves);
      if (!parsed) {
        continue;
      }

      return {
        ...parsed,
        selectedMove: validateBotMove(
          parsed.selectedMove,
          safeCandidateMoves,
          DIFFICULTY_CONFIG[request.difficulty].forceBestMove
        ),
        provider,
        usedFallback: false
      };
    }

    return fallback;
  }

  getProvider() {
    return this.provider;
  }

  getProviderForDifficulty(difficulty: BotDifficulty) {
    return this.getProviderOrderForDifficulty(difficulty)[0] ?? "disabled";
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

  private getProviderOrderForDifficulty(difficulty: BotDifficulty): RemoteProvider[] {
    if (this.provider === "disabled") {
      return [];
    }

    const preferred = this.provider as RemoteProvider;
    const order: RemoteProvider[] =
      difficulty === "Nightmare Mode" || difficulty === "Impossible"
        ? ["gemini", "groq", "openrouter", preferred]
        : [preferred, "groq", "openrouter", "gemini"];

    return order.filter((candidate, index) => order.indexOf(candidate) === index);
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

  private async decorateCommentary(
    request: BotDecisionRequest,
    selectedMove: string,
    actor: CommentaryActor
  ): Promise<BotCommentaryResult | null> {
    if (this.provider === "disabled") {
      return null;
    }

    const userPrompt = buildBotCommentaryPrompt(
      {
        ...request,
        forceBestMove: DIFFICULTY_CONFIG[request.difficulty].forceBestMove
      },
      selectedMove,
      actor
    );

    for (const provider of this.getProviderOrderForDifficulty(request.difficulty)) {
      const raw = await this.callProxy(
        provider,
        "commentary",
        userPrompt,
        DIFFICULTY_CONFIG[request.difficulty].temperature,
        DIFFICULTY_CONFIG[request.difficulty].commentaryTimeoutMs
      );
      const parsed = raw ? parseCommentaryResponse(raw) : null;
      if (parsed) {
        return {
          ...parsed,
          provider,
          usedFallback: false
        };
      }
    }

    return null;
  }

  private async callProxy(
    provider: RemoteProvider,
    mode: "decision" | "commentary",
    userPrompt: string,
    temperature: number,
    timeoutMs: number
  ) {
    const headers = await getApiAuthHeaders();
    if (!headers.Authorization) {
      return null;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), Math.max(800, Math.min(6000, timeoutMs + 350)));

    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers,
        body: JSON.stringify({
          provider,
          mode,
          systemPrompt: BOT_SYSTEM_PROMPT,
          userPrompt,
          temperature,
          timeoutMs
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as { content?: string };
      return typeof data.content === "string" ? data.content : null;
    } catch {
      return null;
    } finally {
      window.clearTimeout(timeout);
    }
  }
}
