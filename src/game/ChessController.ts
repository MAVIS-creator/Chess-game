import { Chess } from "chess.js";
import { INITIAL_PIECES } from "./setup";
import type {
  GamePieceState,
  GameSnapshot,
  MoveSummary,
  PieceColor,
  PieceRole,
  PromotionState,
  SquareId,
  MoveSoundCue
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
  private lastMoveSoundCue: MoveSoundCue | null = null;
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
    this.lastMoveSoundCue = null;
    this.pendingPromotion = null;
  }

  selectSquare(square: SquareId) {
    if (this.pendingPromotion) {
      return false;
    }

    // Both familiar castling gestures work: king to g/c-file (standard)
    // or king onto its own corner rook (Chess.com/Lichess style).
    const destination = this.selectedSquare
      ? this.resolveCastleDestination(this.selectedSquare, square) ?? square
      : square;

    if (this.selectedSquare && this.legalTargets.includes(destination)) {
      if (this.requiresPromotion(this.selectedSquare, destination)) {
        this.pendingPromotion = { from: this.selectedSquare, to: destination };
        return false;
      }

      return this.performMove(this.selectedSquare, destination);
    }

    const piece = this.getPieceAtSquare(square);
    const currentTurn = this.getTurn();

    if (!piece || piece.color !== currentTurn) {
      this.selectedSquare = null;
      this.legalTargets = [];
      return false;
    }

    this.selectedSquare = square;
    this.legalTargets = this.chess
      .moves({ square, verbose: true })
      .map((move) => move.to as SquareId);
    return false;
  }

  promotePiece(role: PieceRole) {
    if (!this.pendingPromotion) {
      return false;
    }

    const moved = this.performMove(this.pendingPromotion.from, this.pendingPromotion.to, role);
    this.pendingPromotion = null;
    return moved;
  }

  applyUciMove(uciMove: string) {
    const from = uciMove.slice(0, 2) as SquareId;
    const to = uciMove.slice(2, 4) as SquareId;
    const promotion = uciMove[4];

    return this.performMove(
      from,
      to,
      promotion === "q"
        ? "queen"
        : promotion === "r"
          ? "rook"
          : promotion === "b"
            ? "bishop"
            : promotion === "n"
              ? "knight"
              : undefined
    );
  }

  /** Rebuild from legal move history to restore piece identities and castling rights. */
  takeBack(plies: number): boolean {
    const moves = this.getMoveHistoryUci();
    if (plies < 1 || moves.length < plies) return false;
    const remaining = moves.slice(0, -plies);
    this.resetGame();
    for (const move of remaining) {
      if (!this.applyUciMove(move)) throw new Error("Could not restore move history.");
    }
    return true;
  }

  getFen() {
    return this.chess.fen();
  }

  getMoveHistoryUci() {
    return this.chess.history({ verbose: true }).map((move) => `${move.from}${move.to}${move.promotion ?? ""}`);
  }

  getMoveHistory() {
    return this.chess.history({ verbose: true }).map((move, index) => ({
      ply: index + 1,
      san: move.san,
      uci: `${move.from}${move.to}${move.promotion ?? ""}`,
      from: move.from as SquareId,
      to: move.to as SquareId
    }));
  }

  getPgn() {
    return this.chess.pgn();
  }

  /**
   * Review any historical ply without touching the live chess clock,
   * game position, or opponent. Ply zero is the starting position.
   */
  getReplaySnapshot(ply: number): GameSnapshot {
    const replay = new ChessController();
    const moves = this.getMoveHistoryUci();
    const end = Math.max(0, Math.min(moves.length, Math.floor(ply)));
    for (let index = 0; index < end; index += 1) {
      if (!replay.applyUciMove(moves[index])) throw new Error("Invalid replay move.");
    }
    return replay.getSnapshot();
  }

  /**
   * One queued premove can be entered during the bot's turn. We preview
   * moves by granting the human side the move on a temporary position,
   * then strictly revalidate against the REAL position after the bot moves.
   */
  getPremoveTargets(from: SquareId, color: PieceColor): SquareId[] {
    if (this.getTurn() === color || this.chess.isGameOver()) return [];
    const occupant = this.getPieceAtSquare(from);
    if (!occupant || occupant.color !== color) return [];
    const fen = this.chess.fen().split(" ");
    fen[1] = color === "white" ? "w" : "b";
    fen[3] = "-";
    try {
      const preview = new Chess(fen.join(" "));
      return preview.moves({ square: from, verbose: true }).map(move => move.to as SquareId);
    } catch {
      return [];
    }
  }

  resolveCastleDestination(from: SquareId, clicked: SquareId): SquareId | null {
    const moving = this.getPieceAtSquare(from);
    const rook = this.getPieceAtSquare(clicked);
    if (!moving || moving.role !== "king" || !rook || rook.role !== "rook" || rook.color !== moving.color) {
      return null;
    }
    const rank = moving.color === "white" ? "1" : "8";
    if (from !== `e${rank}` || !["a", "h"].includes(clicked[0]) || clicked[1] !== rank) return null;
    return `${clicked[0] === "h" ? "g" : "c"}${rank}` as SquareId;
  }

  hasLegalMove(from: SquareId, to: SquareId, promotion?: PieceRole) {
    const dest = this.resolveCastleDestination(from, to) ?? to;
    return this.chess.moves({ square: from, verbose: true }).some(
      move => move.to === dest && (!move.promotion || (promotion ? CHESS_PROMOTION_MAP[promotion] : "q") === move.promotion)
    );
  }

  getSnapshot(): GameSnapshot {
    return {
      pieces: this.pieces.map((piece) => ({ ...piece })),
      currentTurn: this.getTurn(),
      selectedSquare: this.selectedSquare,
      legalTargets: [...this.legalTargets],
      checkedKingSquare: this.getCheckedKingSquare(),
      lastMove: this.lastMove ? { ...this.lastMove } : null,
      lastMoveSoundCue: this.lastMoveSoundCue,
      pendingPromotion: this.pendingPromotion ? { ...this.pendingPromotion } : null,
      statusText: this.getStatusText(),
      moveCount: this.chess.history().length,
      inCheck: this.chess.inCheck(),
      gameOver: this.chess.isGameOver()
    };
  }

  private performMove(from: SquareId, to: SquareId, promotion?: PieceRole) {
    // chess.js throws for invalid moves. A stale premove or malformed UCI
    // should fail harmlessly, never crash a running game.
    let move: ReturnType<Chess["move"]>;
    try {
      move = this.chess.move({
        from,
        to,
        promotion: promotion ? CHESS_PROMOTION_MAP[promotion] : undefined
      });
    } catch {
      return false;
    }

    if (!move) {
      return false;
    }

    const movingPiece = this.getPieceAtSquare(from);

    if (!movingPiece) {
      throw new Error(`No piece found at ${from} while applying move.`);
    }

    let moveSoundCue: MoveSoundCue = "move";

    if (move.flags.includes("e")) {
      const capturedSquare = `${to[0]}${from[1]}` as SquareId;
      const captured = this.getPieceAtSquare(capturedSquare);
      if (captured) {
        captured.square = null;
        captured.captured = true;
        moveSoundCue = "capture";
      }
    } else if (move.flags.includes("c")) {
      const captured = this.getPieceAtSquare(to);
      if (captured) {
        captured.square = null;
        captured.captured = true;
        moveSoundCue = "capture";
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
    this.lastMoveSoundCue = moveSoundCue;
    this.selectedSquare = null;
    this.legalTargets = [];
    this.pendingPromotion = null;
    return true;
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

  private getCheckedKingSquare() {
    if (!this.chess.inCheck()) {
      return null;
    }

    const checkedColor = this.getTurn();
    const king = this.pieces.find(
      (piece) => !piece.captured && piece.color === checkedColor && piece.role === "king"
    );

    return king?.square ?? null;
  }
}
