import {
  buildAdaptiveSearchPlan,
  hydrateAdaptiveProfile,
  loadAdaptiveProfile,
  persistAdaptiveProfile,
  persistMatchHistory,
  recordAdaptiveResult
} from "../ai/adaptiveProfile";
import { BotDecisionLayer, type BotDecisionResult } from "../ai/botDecisionLayer";
import {
  BOT_PERSONALITIES,
  DIFFICULTY_CONFIG,
  DEFAULT_DIFFICULTY,
  DEFAULT_PERSONALITY,
  type BotDifficulty,
  type BotPersonalityProfile
} from "../ai/botPersonality";
import { StockfishEngine } from "../engine/stockfish";
import type { PieceColor } from "./types";
import { ChessController } from "./ChessController";

const MATE_SCAN_BY_DIFFICULTY: Record<BotDifficulty, number | null> = {
  Easy: null,
  Normal: null,
  Hard: 3,
  "Boss Mode": 5,
  "Nightmare Mode": 7,
  Impossible: 9
};

export interface BotRuntimeState {
  difficulty: BotDifficulty;
  personalityId: string;
  personalityName: string;
  provider: string;
  commentary: string;
  thinking: boolean;
  thinkingStage: string | null;
  lastStyle: string;
  source: "stockfish" | "llm";
  playerName: string;
  playerColor: PieceColor;
  botColor: PieceColor;
  playerTimeMs: number;
  aiTimeMs: number;
  timedOutSide: PieceColor | null;
}

export class AiMoveController {
  private readonly engine = new StockfishEngine();
  private readonly decisionLayer = new BotDecisionLayer();
  private difficulty: BotDifficulty = DEFAULT_DIFFICULTY;
  private personality: BotPersonalityProfile = DEFAULT_PERSONALITY;
  private readonly botColor: PieceColor;
  private readonly playerColor: PieceColor;
  private thinking = false;
  private thinkingStage: string | null = null;
  private commentary = "The board is waiting.";
  private lastStyle = "opening";
  private source: "stockfish" | "llm" = "stockfish";
  private playerName = "Guest";
  private playerTimeMs = 0;
  private aiTimeMs = 0;
  private timedOutSide: PieceColor | null = null;
  private canContinueTurn: (() => boolean) | null = null;
  private stateListener: (() => void) | null = null;
  private adaptiveProfile = loadAdaptiveProfile();
  private recordedGameSignature: string | null = null;

  constructor(
    private readonly controller: ChessController,
    options?: {
      playerColor?: PieceColor;
      botColor?: PieceColor;
    }
  ) {
    this.playerColor = options?.playerColor ?? "white";
    this.botColor = options?.botColor ?? (this.playerColor === "white" ? "black" : "white");
  }

  getState(): BotRuntimeState {
    return {
      difficulty: this.difficulty,
      personalityId: this.personality.id,
      personalityName: this.personality.name,
      provider: this.decisionLayer.getProviderForDifficulty(this.difficulty),
      commentary: this.commentary,
      thinking: this.thinking,
      thinkingStage: this.thinkingStage,
      lastStyle: this.lastStyle,
      source: this.source,
      playerName: this.playerName,
      playerColor: this.playerColor,
      botColor: this.botColor,
      playerTimeMs: this.playerTimeMs,
      aiTimeMs: this.aiTimeMs,
      timedOutSide: this.timedOutSide
    };
  }

  setStateListener(listener: (() => void) | null) {
    this.stateListener = listener;
  }

  setPlayerName(playerName: string) {
    this.playerName = playerName.trim() || "Guest";
    this.notify();
  }

  async hydrateAdaptiveMemory() {
    this.adaptiveProfile = await hydrateAdaptiveProfile();
    this.notify();
  }

  setClockState(playerTimeMs: number, aiTimeMs: number, timedOutSide: PieceColor | null) {
    this.playerTimeMs = playerTimeMs;
    this.aiTimeMs = aiTimeMs;
    this.timedOutSide = timedOutSide;
    this.notify();
  }

  setTurnGuard(guard: (() => boolean) | null) {
    this.canContinueTurn = guard;
  }

  setDifficulty(difficulty: BotDifficulty) {
    this.difficulty = difficulty;
    this.commentary = `${difficulty} engaged.`;
    this.notify();
  }

  setPersonality(personalityId: string) {
    this.personality =
      BOT_PERSONALITIES.find((candidate) => candidate.id === personalityId) ?? DEFAULT_PERSONALITY;
    this.commentary = `${this.personality.name} has taken the chair.`;
    this.notify();
  }

  canPlayerInteract() {
    return !this.thinking && this.controller.getSnapshot().currentTurn === this.playerColor;
  }

  reactToPlayerMove() {
    if (this.difficulty !== "Nightmare Mode" && this.difficulty !== "Impossible") {
      return;
    }

    const snapshot = this.controller.getSnapshot();
    const lines =
      this.difficulty === "Impossible"
        ? IMPOSSIBLE_PLAYER_REACTIONS
        : NIGHTMARE_PLAYER_REACTIONS;

    this.commentary = snapshot.inCheck
      ? "You stepped into danger."
      : lines[Math.floor(Math.random() * lines.length)];
    this.lastStyle = "psychological-pressure";
    this.source = "stockfish";
    this.notify();

    const selectedMove = this.controller.getMoveHistoryUci().at(-1);
    if (!selectedMove) {
      return;
    }

    void this.decoratePlayerCommentaryAfterMove(
      {
        fen: this.controller.getFen(),
        moveHistory: this.controller.getMoveHistoryUci(),
        playerColor: this.playerColor,
        botColor: this.botColor,
        difficulty: this.difficulty,
        personality: this.personality,
        candidateMoves: []
      },
      selectedMove
    );
  }

  shouldHideHints() {
    return this.difficulty === "Boss Mode" || this.difficulty === "Nightmare Mode";
  }

  reset() {
    this.commentary = `${this.personality.name} awaits your first move.`;
    this.lastStyle = "opening";
    this.source = "stockfish";
    this.thinking = false;
    this.thinkingStage = null;
    this.recordedGameSignature = null;
    this.notify();
  }

  recordMatchOutcome(result: "win" | "loss" | "draw", signature: string) {
    if (this.recordedGameSignature === signature) {
      return;
    }

    this.recordedGameSignature = signature;
    this.adaptiveProfile = recordAdaptiveResult(this.adaptiveProfile, this.difficulty, result);
    void persistAdaptiveProfile(this.adaptiveProfile);
  }

  recordMatchHistory(result: "win" | "loss" | "draw", moveCount: number, statusText: string, signature: string) {
    if (this.recordedGameSignature !== signature) {
      return;
    }

    void persistMatchHistory({
      playerName: this.playerName,
      difficulty: this.difficulty,
      result,
      moveCount,
      statusText
    });
  }

  async maybeRunBotTurn() {
    const snapshot = this.controller.getSnapshot();
    if (this.thinking || snapshot.gameOver || snapshot.currentTurn !== this.botColor || snapshot.pendingPromotion) {
      return false;
    }

    this.thinking = true;
    this.commentary = "The board is waiting for the reply.";
    this.thinkingStage = "AI is thinking";
    this.notify();
    const adaptivePlan = buildAdaptiveSearchPlan(
      this.adaptiveProfile,
      this.difficulty,
      DIFFICULTY_CONFIG[this.difficulty].moveTimeMs
    );

    try {
      await this.pause(adaptivePlan.openingPauseMs);
      this.thinkingStage = "Scanning for forced mate";
      this.notify();
      if (!this.canProceed()) {
        return false;
      }
      const mateScanDepth = MATE_SCAN_BY_DIFFICULTY[this.difficulty];
      if (mateScanDepth && DIFFICULTY_CONFIG[this.difficulty].mateScanTimeoutMs > 0) {
        const mateScan = await this.engine.analyzePosition({
          fen: this.controller.getFen(),
          depth: DIFFICULTY_CONFIG[this.difficulty].depth,
          multiPv: 1,
          mate: mateScanDepth + adaptivePlan.extraMateDepth,
          timeoutMs: DIFFICULTY_CONFIG[this.difficulty].mateScanTimeoutMs
        });

        const matingMove = mateScan.candidates[0];
        if (matingMove?.mateIn !== null && matingMove.mateIn > 0) {
          if (!this.canProceed()) {
            return false;
          }
          this.thinkingStage = `Forcing mate in ${matingMove.mateIn}`;
          this.notify();
          const executed = this.tryBestMove(mateScan.bestMove, {
            selectedMove: mateScan.bestMove,
            commentary: "The finish is already written.",
            style: "forced-mate",
            provider: this.decisionLayer.getProvider(),
            usedFallback: true
          });
          this.commentary = executed.commentary;
          this.lastStyle = executed.style;
          this.source = "stockfish";
          this.notify();
          return true;
        }
      }

      this.thinkingStage = "Analyzing lines";
      this.notify();
      if (!this.canProceed()) {
        return false;
      }
      const analysis = await this.engine.analyzePosition({
        fen: this.controller.getFen(),
        depth: DIFFICULTY_CONFIG[this.difficulty].depth,
        multiPv: DIFFICULTY_CONFIG[this.difficulty].multiPv,
        moveTimeMs: adaptivePlan.moveTimeMs,
        timeoutMs: DIFFICULTY_CONFIG[this.difficulty].searchTimeoutMs
      });

      this.thinkingStage = "Choosing a move";
      this.notify();
      if (!this.canProceed()) {
        return false;
      }

      const moveRequest = {
        fen: this.controller.getFen(),
        moveHistory: this.controller.getMoveHistoryUci(),
        playerColor: this.playerColor,
        botColor: this.botColor,
        difficulty: this.difficulty,
        personality: this.personality,
        candidateMoves: analysis.candidates
      };
      const decision = this.decisionLayer.pickLocalMove(moveRequest);

      await this.pause(adaptivePlan.finalizePauseMs);
      this.thinkingStage = "Finalizing";
      this.notify();
      if (!this.canProceed()) {
        return false;
      }
      const executed = this.tryDecision(decision) ?? this.tryBestMove(analysis.bestMove, decision);
      this.commentary = executed.commentary;
      this.lastStyle = executed.style;
      this.source = executed.source;
      this.notify();
      void this.decorateCommentaryAfterMove(moveRequest, decision.selectedMove);
      return true;
    } finally {
      this.thinking = false;
      this.thinkingStage = null;
      this.notify();
    }
  }

  dispose() {
    this.engine.dispose();
  }

  private tryDecision(decision: BotDecisionResult) {
    const move = this.controller.applyUciMove(decision.selectedMove);
    if (!move) {
      return null;
    }

    return {
      commentary: decision.commentary,
      style: decision.style,
      source: decision.usedFallback ? "stockfish" as const : "llm" as const
    };
  }

  private tryBestMove(bestMove: string, decision: BotDecisionResult) {
    const move = this.controller.applyUciMove(bestMove);
    if (!move) {
      throw new Error(`Bot fallback move was invalid: ${bestMove}`);
    }

    return {
      commentary: decision.usedFallback
        ? decision.commentary
        : "Your line cracked. I chose certainty.",
      style: "best",
      source: "stockfish" as const
    };
  }

  private notify() {
    this.stateListener?.();
  }

  private pause(durationMs: number) {
    return new Promise<void>((resolve) => {
      window.setTimeout(resolve, durationMs);
    });
  }

  private canProceed() {
    return this.canContinueTurn?.() ?? true;
  }

  private async decorateCommentaryAfterMove(
    request: Parameters<BotDecisionLayer["decorateMoveCommentary"]>[0],
    selectedMove: string
  ) {
    const commentary = await this.decisionLayer.decorateMoveCommentary(request, selectedMove);
    if (!commentary) {
      return;
    }

    this.commentary = commentary.commentary;
    this.lastStyle = commentary.style;
    this.source = commentary.usedFallback ? "stockfish" : "llm";
    this.notify();
  }

  private async decoratePlayerCommentaryAfterMove(
    request: Parameters<BotDecisionLayer["decoratePlayerMoveCommentary"]>[0],
    selectedMove: string
  ) {
    const commentary = await this.decisionLayer.decoratePlayerMoveCommentary(request, selectedMove);
    if (!commentary || this.thinking) {
      return;
    }

    this.commentary = commentary.commentary;
    this.lastStyle = commentary.style;
    this.source = commentary.usedFallback ? "stockfish" : "llm";
    this.notify();
  }
}

const NIGHTMARE_PLAYER_REACTIONS = [
  "A weakness appears.",
  "Interesting.",
  "You moved too quickly.",
  "That will be tested.",
  "The board remembers.",
  "Pressure is coming."
];

const IMPOSSIBLE_PLAYER_REACTIONS = [
  "A weakness appears.",
  "You moved too quickly.",
  "That changes nothing.",
  "The pressure grows.",
  "Your space is shrinking.",
  "Interesting."
];
