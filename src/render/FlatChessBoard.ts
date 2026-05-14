import type { GamePieceState, MoveSummary, SquareId } from "../game/types";
import { FILES, RANKS } from "../game/types";

const PIECE_GLYPHS: Record<string, string> = {
  white_pawn: "♙",
  white_rook: "♖",
  white_knight: "♘",
  white_bishop: "♗",
  white_queen: "♕",
  white_king: "♔",
  black_pawn: "♟",
  black_rook: "♜",
  black_knight: "♞",
  black_bishop: "♝",
  black_queen: "♛",
  black_king: "♚"
};

export class FlatChessBoard {
  private readonly boardElement: HTMLDivElement;
  private readonly squareElements = new Map<SquareId, HTMLButtonElement>();
  private onSquareSelect: ((square: SquareId) => void) | null = null;
  private flipped = false;
  private lastPieces: GamePieceState[] = [];
  private lastSelected: SquareId | null = null;
  private lastLegalTargets: SquareId[] = [];
  private lastMove: MoveSummary | null = null;
  private lastCheckedKingSquare: SquareId | null = null;

  constructor(private readonly mount: HTMLElement) {
    this.mount.innerHTML = "";
    this.mount.classList.add("flat-board-host");

    const shell = document.createElement("div");
    shell.className = "flat-board-shell";

    this.boardElement = document.createElement("div");
    this.boardElement.className = "flat-board";
    shell.appendChild(this.boardElement);
    this.mount.appendChild(shell);
    this.renderBoard();
  }

  async loadScene() {
    return {
      pieceCount: 32,
      squareCount: 64
    };
  }

  setSquareSelectHandler(handler: (square: SquareId) => void) {
    this.onSquareSelect = handler;
  }

  cycleCameraPreset() {
    this.flipped = !this.flipped;
    this.renderBoard();
    this.syncBoardState(this.lastPieces);
    this.highlightSquares(
      this.lastSelected,
      this.lastLegalTargets,
      this.lastMove,
      this.lastCheckedKingSquare
    );
  }

  zoomIn() {
    // Intentionally empty for the flat board renderer.
  }

  zoomOut() {
    // Intentionally empty for the flat board renderer.
  }

  highlightSquares(
    selected: SquareId | null,
    legalTargets: SquareId[],
    lastMove: MoveSummary | null,
    checkedKingSquare: SquareId | null = null
  ) {
    this.lastSelected = selected;
    this.lastLegalTargets = [...legalTargets];
    this.lastMove = lastMove;
    this.lastCheckedKingSquare = checkedKingSquare;
    const legalSet = new Set(legalTargets);
    const lastMoveSquares = new Set<SquareId>(lastMove ? [lastMove.from, lastMove.to] : []);

    for (const [square, element] of this.squareElements) {
      element.classList.toggle("is-selected", square === selected);
      element.classList.toggle("is-legal", legalSet.has(square));
      element.classList.toggle("is-last-move", lastMoveSquares.has(square));
      element.classList.toggle("is-check", square === checkedKingSquare);
    }
  }

  syncBoardState(pieces: GamePieceState[]) {
    this.lastPieces = pieces.map((piece) => ({ ...piece }));
    for (const element of this.squareElements.values()) {
      element.textContent = "";
      element.classList.remove("is-white-piece", "is-black-piece");
    }

    for (const piece of pieces) {
      if (piece.captured || !piece.square) {
        continue;
      }

      const square = this.squareElements.get(piece.square);
      if (!square) {
        continue;
      }

      square.textContent = PIECE_GLYPHS[`${piece.color}_${piece.role}`] ?? "";
      square.classList.toggle("is-white-piece", piece.color === "white");
      square.classList.toggle("is-black-piece", piece.color === "black");
    }
  }

  dispose() {
    this.mount.innerHTML = "";
    this.mount.classList.remove("flat-board-host");
  }

  private renderBoard() {
    this.boardElement.innerHTML = "";
    this.squareElements.clear();

    const ranks = this.flipped ? [...RANKS] : [...RANKS].reverse();
    const files = this.flipped ? [...FILES].reverse() : [...FILES];

    for (const rank of ranks) {
      for (const file of files) {
        const fileIndex = FILES.indexOf(file);
        const rankIndex = RANKS.indexOf(rank);
        const square = `${file}${rank}` as SquareId;
        const squareButton = document.createElement("button");
        squareButton.type = "button";
        squareButton.className = `flat-square ${((fileIndex + rankIndex) % 2 === 0) ? "is-dark" : "is-light"}`;
        squareButton.dataset.square = square;
        squareButton.setAttribute("aria-label", square.toUpperCase());
        squareButton.addEventListener("click", () => this.onSquareSelect?.(square));
        this.squareElements.set(square, squareButton);
        this.boardElement.appendChild(squareButton);
      }
    }
  }
}
