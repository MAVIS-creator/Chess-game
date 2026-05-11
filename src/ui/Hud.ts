import type { GameSnapshot, PieceRole } from "../game/types";

const PROMOTION_CHOICES: PieceRole[] = ["queen", "rook", "bishop", "knight"];

export class Hud {
  private onReset: (() => void) | null = null;
  private onPromote: ((role: PieceRole) => void) | null = null;

  constructor(private readonly root: HTMLElement) {
    this.root.addEventListener("click", this.handleClick);
  }

  bindReset(handler: () => void) {
    this.onReset = handler;
  }

  bindPromotion(handler: (role: PieceRole) => void) {
    this.onPromote = handler;
  }

  renderStatus(snapshot: GameSnapshot) {
    const capturedWhite = snapshot.pieces.filter((piece) => piece.captured && piece.color === "white").length;
    const capturedBlack = snapshot.pieces.filter((piece) => piece.captured && piece.color === "black").length;
    const moveState = snapshot.selectedSquare
      ? `Selected ${snapshot.selectedSquare.toUpperCase()}`
      : "Pick a piece to begin.";

    const promotionMarkup = snapshot.pendingPromotion
      ? `
        <div class="promotion-panel">
          <span>Promote pawn at ${snapshot.pendingPromotion.to.toUpperCase()}</span>
          <div class="promotion-options">
            ${PROMOTION_CHOICES.map(
              (choice) => `<button type="button" data-promotion="${choice}">${choice}</button>`
            ).join("")}
          </div>
        </div>
      `
      : "";

    this.root.innerHTML = `
      <div class="hud-cluster">
        <div class="stat-block">
          <span>Turn</span>
          <strong>${snapshot.currentTurn === "white" ? "White" : "Black"}</strong>
        </div>
        <div class="stat-block">
          <span>Status</span>
          <strong>${snapshot.statusText}</strong>
        </div>
        <div class="stat-block">
          <span>Selection</span>
          <strong>${moveState}</strong>
        </div>
        <div class="stat-block">
          <span>Last move</span>
          <strong>${snapshot.lastMove ? `${snapshot.lastMove.from} → ${snapshot.lastMove.to}` : "Opening position"}</strong>
        </div>
        <div class="stat-block">
          <span>Captured pieces</span>
          <strong>White ${capturedWhite} · Black ${capturedBlack}</strong>
        </div>
        <button class="reset-button" type="button" data-action="reset">Reset game</button>
        ${promotionMarkup}
      </div>
    `;
  }

  private handleClick = (event: Event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (target.dataset.action === "reset") {
      this.onReset?.();
      return;
    }

    const promotion = target.dataset.promotion as PieceRole | undefined;
    if (promotion) {
      this.onPromote?.(promotion);
    }
  };
}
