import type { GamePieceState, MoveSummary, PieceColor, SquareId } from "../game/types";
import { FILES, RANKS } from "../game/types";
import { renderFlatPiece } from "./flatPieceArtwork";

export class FlatChessBoard {
  private readonly boardElement: HTMLDivElement;
  private readonly squareElements = new Map<SquareId, HTMLButtonElement>();
  private onSquareSelect: ((square: SquareId) => void) | null = null;
  private flipped = false;
  private lastPieces: GamePieceState[] = [];
  private lastSelected: SquareId | null = null;
  private lastLegalTargets: SquareId[] = [];
  private lastCaptureTargets: SquareId[] = [];
  private lastMove: MoveSummary | null = null;
  private lastCheckedKingSquare: SquareId | null = null;

  constructor(private readonly mount: HTMLElement) {
    this.mount.innerHTML = "";
    this.mount.classList.add("flat-board-host");

    const shell = document.createElement("div");
    shell.className = "flat-board-shell";

    this.boardElement = document.createElement("div");
    this.boardElement.className = "flat-board";
    this.boardElement.setAttribute("role", "group");
    this.boardElement.setAttribute("aria-label", "Cedar Chess, interactive 2D chessboard");
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

  setPlayerColor(color: PieceColor) {
    const shouldFlip = color === "black";
    if (this.flipped === shouldFlip) return;
    this.flipped = shouldFlip;
    this.renderBoard();
    this.syncBoardState(this.lastPieces);
    this.highlightSquares(this.lastSelected, this.lastLegalTargets, this.lastCaptureTargets, this.lastMove, this.lastCheckedKingSquare);
  }

  cycleCameraPreset() {
    this.flipped = !this.flipped;
    this.renderBoard();
    this.syncBoardState(this.lastPieces);
    this.highlightSquares(
      this.lastSelected,
      this.lastLegalTargets,
      this.lastCaptureTargets,
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
    captureTargets: SquareId[],
    lastMove: MoveSummary | null,
    checkedKingSquare: SquareId | null = null
  ) {
    this.lastSelected = selected;
    this.lastLegalTargets = [...legalTargets];
    this.lastCaptureTargets = [...captureTargets];
    this.lastMove = lastMove;
    this.lastCheckedKingSquare = checkedKingSquare;
    const legalSet = new Set(legalTargets);
    const captureSet = new Set(captureTargets);
    const lastMoveSquares = new Set<SquareId>(lastMove ? [lastMove.from, lastMove.to] : []);

    for (const [square, element] of this.squareElements) {
      element.classList.toggle("is-selected", square === selected);
      element.classList.toggle("is-legal", legalSet.has(square));
      element.classList.toggle("is-capture", captureSet.has(square));
      element.classList.toggle("is-last-move", lastMoveSquares.has(square));
      element.classList.toggle("is-check", square === checkedKingSquare);
    }
  }

  syncBoardState(pieces: GamePieceState[]) {
    this.lastPieces = pieces.map((piece) => ({ ...piece }));
    const bySquare = new Map<SquareId, GamePieceState>();

    for (const piece of pieces) {
      if (!piece.captured && piece.square) {
        bySquare.set(piece.square, piece);
      }
    }

    // Retain stable SVG and coordinate nodes between clock updates.
    // Only replace artwork when a square's occupant actually changes.
    for (const [square, button] of this.squareElements) {
      const piece = bySquare.get(square);
      const pieceKey = piece ? `${piece.color}_${piece.role}` : "";
      if (button.dataset.pieceKey !== pieceKey) {
        const slot = button.querySelector<HTMLElement>(".flat-piece-slot");
        if (slot) {
          slot.innerHTML = piece ? renderFlatPiece(piece.color, piece.role) : "";
        }
        button.dataset.pieceKey = pieceKey;
      }
      button.classList.toggle("is-white-piece", piece?.color === "white");
      button.classList.toggle("is-black-piece", piece?.color === "black");
      button.setAttribute(
        "aria-label",
        `${square.toUpperCase()}${piece ? `, ${piece.color} ${piece.role}` : ", empty"}`
      );
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
        const slot = document.createElement("span");
        slot.className = "flat-piece-slot";
        slot.setAttribute("aria-hidden", "true");
        squareButton.appendChild(slot);

        if (file === files[0]) {
          const rankLabel = document.createElement("span");
          rankLabel.className = "flat-coordinate flat-rank";
          rankLabel.textContent = rank;
          rankLabel.setAttribute("aria-hidden", "true");
          squareButton.appendChild(rankLabel);
        }
        if (rank === ranks[ranks.length - 1]) {
          const fileLabel = document.createElement("span");
          fileLabel.className = "flat-coordinate flat-file";
          fileLabel.textContent = file;
          fileLabel.setAttribute("aria-hidden", "true");
          squareButton.appendChild(fileLabel);
        }

        squareButton.addEventListener("click", () => this.onSquareSelect?.(square));
        this.squareElements.set(square, squareButton);
        this.boardElement.appendChild(squareButton);
      }
    }
  }
}
