import { Chess } from "chess.js";
import { INITIAL_PIECES } from "./setup";
import type {
  GamePieceState,
  GameSnapshot,
  MoveSummary,
  PieceColor,
  PieceRole,
  PromotionState,
  SquareId
} from "./types";

const CHESS_PROMOTION_MAP: Record<PieceRole, "q" | "r" | "b" | "n"> = {
  queen: "q",
  rook: "r",
  bishop: "b",
  knight: "n",
  king: "q",
  pawn: "q"
};

const roleFromPromotion = (piece: string): PieceRole => {
  switch (piece) {
    case "q":
      return "queen";
    case "r":
      return "rook";
    case "b":
      return "bishop";
    case "n":
      return "knight";
    default:
      return "queen";
  }
};

export class ChessController {
  private chess = new Chess();
  private pieces: GamePieceState[] = [];
  private selectedSquare: SquareId | null = null;
  private legalTargets: SquareId[] = [];
  private lastMove: MoveSummary | null = null;
  private pendingPromotion: PromotionState | null = null;

  constructor() {
    this.resetGame();
  }

  resetGame() {
    this.chess = new Chess();
    this.pieces = INITIAL_PIECES.map((piece) => ({
      id: piece.id,
      color: piece.color,
      role: piece.role,
      square: piece.square,
      captured: false
    }));
    this.selectedSquare = null;
    this.legalTargets = [];
    this.lastMove = null;
    this.pendingPromotion = null;
  }

  selectSquare(square: SquareId) {
    if (this.pendingPromotion) {
      return;
    }

    if (this.selectedSquare && this.legalTargets.includes(square)) {
      if (this.requiresPromotion(this.selectedSquare, square)) {
        this.pendingPromotion = { from: this.selectedSquare, to: square };
        return;
      }

      this.performMove(this.selectedSquare, square);
      return;
    }

    const piece = this.getPieceAtSquare(square);
    const currentTurn = this.getTurn();

    if (!piece || piece.color !== currentTurn) {
      this.selectedSquare = null;
      this.legalTargets = [];
      return;
    }

    this.selectedSquare = square;
    this.legalTargets = this.chess
      .moves({ square, verbose: true })
      .map((move) => move.to as SquareId);
  }

  promotePiece(role: PieceRole) {
    if (!this.pendingPromotion) {
      return;
    }

    this.performMove(this.pendingPromotion.from, this.pendingPromotion.to, role);
    this.pendingPromotion = null;
  }

  getSnapshot(): GameSnapshot {
    return {
      pieces: this.pieces.map((piece) => ({ ...piece })),
      currentTurn: this.getTurn(),
      selectedSquare: this.selectedSquare,
      legalTargets: [...this.legalTargets],
      lastMove: this.lastMove ? { ...this.lastMove } : null,
      pendingPromotion: this.pendingPromotion ? { ...this.pendingPromotion } : null,
      statusText: this.getStatusText(),
      moveCount: this.chess.history().length,
      inCheck: this.chess.inCheck(),
      gameOver: this.chess.isGameOver()
    };
  }

  private performMove(from: SquareId, to: SquareId, promotion?: PieceRole) {
    const move = this.chess.move({
      from,
      to,
      promotion: promotion ? CHESS_PROMOTION_MAP[promotion] : undefined
    });

    if (!move) {
      return;
    }

    const movingPiece = this.getPieceAtSquare(from);

    if (!movingPiece) {
      throw new Error(`No piece found at ${from} while applying move.`);
    }

    if (move.flags.includes("e")) {
      const capturedSquare = `${to[0]}${from[1]}` as SquareId;
      const captured = this.getPieceAtSquare(capturedSquare);
      if (captured) {
        captured.square = null;
        captured.captured = true;
      }
    } else if (move.flags.includes("c")) {
      const captured = this.getPieceAtSquare(to);
      if (captured) {
        captured.square = null;
        captured.captured = true;
      }
    }

    movingPiece.square = to;

    if (move.flags.includes("p")) {
      movingPiece.role = roleFromPromotion(move.promotion ?? "q");
    }

    if (move.flags.includes("k")) {
      const rookFrom = `${"h"}${from[1]}` as SquareId;
      const rookTo = `${"f"}${from[1]}` as SquareId;
      this.moveRookForCastle(rookFrom, rookTo);
    }

    if (move.flags.includes("q")) {
      const rookFrom = `${"a"}${from[1]}` as SquareId;
      const rookTo = `${"d"}${from[1]}` as SquareId;
      this.moveRookForCastle(rookFrom, rookTo);
    }

    this.lastMove = { from, to };
    this.selectedSquare = null;
    this.legalTargets = [];
    this.pendingPromotion = null;
  }

  private moveRookForCastle(from: SquareId, to: SquareId) {
    const rook = this.getPieceAtSquare(from);
    if (rook) {
      rook.square = to;
    }
  }

  private getPieceAtSquare(square: SquareId) {
    return this.pieces.find((piece) => !piece.captured && piece.square === square) ?? null;
  }

  private requiresPromotion(from: SquareId, to: SquareId) {
    const piece = this.getPieceAtSquare(from);
    if (!piece || piece.role !== "pawn") {
      return false;
    }

    if (piece.color === "white" && to.endsWith("8")) {
      return true;
    }

    return piece.color === "black" && to.endsWith("1");
  }

  private getTurn(): PieceColor {
    return this.chess.turn() === "w" ? "white" : "black";
  }

  private getStatusText() {
    if (this.chess.isCheckmate()) {
      return `${this.getTurn() === "white" ? "Black" : "White"} wins by checkmate.`;
    }

    if (this.chess.isStalemate()) {
      return "Draw by stalemate.";
    }

    if (this.chess.isThreefoldRepetition()) {
      return "Draw by repetition.";
    }

    if (this.chess.isInsufficientMaterial()) {
      return "Draw by insufficient material.";
    }

    if (this.chess.isDraw()) {
      return "Draw.";
    }

    const side = this.getTurn() === "white" ? "White" : "Black";
    return this.chess.inCheck() ? `${side} to move · check` : `${side} to move`;
  }
}
