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
  lastStyle: string;
  source: "stockfish" | "llm";
}

export class AiMoveController {
  private readonly engine = new StockfishEngine();
  private readonly decisionLayer = new BotDecisionLayer();
  private difficulty: BotDifficulty = DEFAULT_DIFFICULTY;
  private personality: BotPersonalityProfile = DEFAULT_PERSONALITY;
  private readonly botColor: PieceColor = "black";
  private readonly playerColor: PieceColor = "white";
  private thinking = false;
  private commentary = "The board is waiting.";
  private lastStyle = "opening";
  private source: "stockfish" | "llm" = "stockfish";

  constructor(private readonly controller: ChessController) {}

  getState(): BotRuntimeState {
    return {
      difficulty: this.difficulty,
      personalityId: this.personality.id,
      personalityName: this.personality.name,
      provider: this.decisionLayer.getProvider(),
      commentary: this.commentary,
      thinking: this.thinking,
      lastStyle: this.lastStyle,
      source: this.source
    };
  }

  setDifficulty(difficulty: BotDifficulty) {
    this.difficulty = difficulty;
    this.commentary = `${difficulty} engaged.`;
  }

  setPersonality(personalityId: string) {
    this.personality =
      BOT_PERSONALITIES.find((candidate) => candidate.id === personalityId) ?? DEFAULT_PERSONALITY;
    this.commentary = `${this.personality.name} has taken the chair.`;
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
  }

  async maybeRunBotTurn() {
    const snapshot = this.controller.getSnapshot();
    if (this.thinking || snapshot.gameOver || snapshot.currentTurn !== this.botColor || snapshot.pendingPromotion) {
      return false;
    }

    this.thinking = true;
    this.commentary = `${this.personality.name} is studying the position.`;

    try {
      const analysis = await this.engine.analyzePosition({
        fen: this.controller.getFen(),
        depth: DIFFICULTY_CONFIG[this.difficulty].depth,
        multiPv: DIFFICULTY_CONFIG[this.difficulty].multiPv
      });

      const decision = await this.decisionLayer.chooseMove({
        fen: this.controller.getFen(),
        moveHistory: this.controller.getMoveHistoryUci(),
        playerColor: this.playerColor,
        botColor: this.botColor,
        difficulty: this.difficulty,
        personality: this.personality,
        candidateMoves: analysis.candidates
      });

      const executed = this.tryDecision(decision) ?? this.tryBestMove(analysis.bestMove, decision);
      this.commentary = executed.commentary;
      this.lastStyle = executed.style;
      this.source = executed.source;
      return true;
    } finally {
      this.thinking = false;
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
}
