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
  private playerName = "Player";
  private playerTimeMs = 0;
  private aiTimeMs = 0;
  private timedOutSide: PieceColor | null = null;
  private canContinueTurn: (() => boolean) | null = null;
  private stateListener: (() => void) | null = null;

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
      provider: this.decisionLayer.getProvider(),
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
    this.playerName = playerName.trim() || "Player";
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

  shouldHideHints() {
    return this.difficulty === "Boss Mode" || this.difficulty === "Nightmare Mode";
  }

  reset() {
    this.commentary = `${this.personality.name} awaits your first move.`;
    this.lastStyle = "opening";
    this.source = "stockfish";
    this.thinking = false;
    this.thinkingStage = null;
    this.notify();
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

    try {
      await this.pause(320);
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
          mate: mateScanDepth,
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
        moveTimeMs: DIFFICULTY_CONFIG[this.difficulty].moveTimeMs,
        timeoutMs: DIFFICULTY_CONFIG[this.difficulty].searchTimeoutMs
      });

      this.thinkingStage = "Choosing a move";
      this.notify();
      if (!this.canProceed()) {
        return false;
      }

      if (DIFFICULTY_CONFIG[this.difficulty].forceBestMove) {
        const selectedMove = analysis.bestMove;
        const executed = this.tryBestMove(selectedMove, {
          selectedMove,
          commentary: DIFFICULTY_CONFIG[this.difficulty].commentaryFallback,
          style: "best",
          provider: this.decisionLayer.getProvider(),
          usedFallback: true
        });

        this.commentary = executed.commentary;
        this.lastStyle = executed.style;
        this.source = executed.source;
        this.notify();

        void this.decorateCommentaryAfterMove({
          fen: this.controller.getFen(),
          moveHistory: this.controller.getMoveHistoryUci(),
          playerColor: this.playerColor,
          botColor: this.botColor,
          difficulty: this.difficulty,
          personality: this.personality,
          candidateMoves: analysis.candidates
        }, selectedMove);

        return true;
      }

      const decision = await this.decisionLayer.chooseMove({
        fen: this.controller.getFen(),
        moveHistory: this.controller.getMoveHistoryUci(),
        playerColor: this.playerColor,
        botColor: this.botColor,
        difficulty: this.difficulty,
        personality: this.personality,
        candidateMoves: analysis.candidates
      });

      await this.pause(220);
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
}
