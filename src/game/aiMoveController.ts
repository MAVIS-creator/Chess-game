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
}

export class AiMoveController {
  private readonly engine = new StockfishEngine();
  private readonly decisionLayer = new BotDecisionLayer();
  private difficulty: BotDifficulty = DEFAULT_DIFFICULTY;
  private personality: BotPersonalityProfile = DEFAULT_PERSONALITY;
  private readonly botColor: PieceColor = "black";
  private readonly playerColor: PieceColor = "white";
  private thinking = false;
  private thinkingStage: string | null = null;
  private commentary = "The board is waiting.";
  private lastStyle = "opening";
  private source: "stockfish" | "llm" = "stockfish";
  private playerName = "Player";
  private stateListener: (() => void) | null = null;

  constructor(private readonly controller: ChessController) {}

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
      playerName: this.playerName
    };
  }

  setStateListener(listener: (() => void) | null) {
    this.stateListener = listener;
  }

  setPlayerName(playerName: string) {
    this.playerName = playerName.trim() || "Player";
    this.notify();
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
      this.thinkingStage = "Analyzing lines";
      this.notify();
      const analysis = await this.engine.analyzePosition({
        fen: this.controller.getFen(),
        depth: DIFFICULTY_CONFIG[this.difficulty].depth,
        multiPv: DIFFICULTY_CONFIG[this.difficulty].multiPv
      });

      this.thinkingStage = "Choosing a move";
      this.notify();
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
}
