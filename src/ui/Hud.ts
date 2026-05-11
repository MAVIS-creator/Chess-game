import type { BotHudState, GameSnapshot, PieceRole } from "../game/types";

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

  renderStatus(snapshot: GameSnapshot, botState: BotHudState) {
    const capturedWhite = snapshot.pieces.filter((piece) => piece.captured && piece.color === "white").length;
    const capturedBlack = snapshot.pieces.filter((piece) => piece.captured && piece.color === "black").length;
    const moveState = snapshot.selectedSquare
      ? `Selected ${snapshot.selectedSquare.toUpperCase()}`
      : botState.thinking
        ? "The bot is calculating its reply."
        : "Pick a piece to begin.";
    const stateTone = snapshot.gameOver ? "is-finished" : snapshot.inCheck ? "is-alert" : "is-live";

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
      <div class="hud-cluster ${stateTone}">
        <div class="hero-status ${botState.thinking ? "is-thinking" : ""}">
          <span class="hero-label">${snapshot.gameOver ? "Game finished" : snapshot.inCheck ? "King under pressure" : "Match live"}</span>
          <strong>${snapshot.statusText}</strong>
          <p>${botState.thinking ? "The bot is thinking." : snapshot.gameOver ? "Reset to start a new match from the opening setup." : "Click a piece, then click a highlighted square."}</p>
        </div>
        <div class="stat-block">
          <span>Turn</span>
          <strong>${snapshot.currentTurn === "white" ? "White" : "Black"}</strong>
        </div>
        <div class="stat-block">
          <span>Difficulty</span>
          <strong>${botState.difficulty}</strong>
        </div>
        <div class="stat-block">
          <span>Selection</span>
          <strong>${moveState}</strong>
        </div>
        <div class="stat-block">
          <span>Last move</span>
          <strong>${snapshot.lastMove ? `${snapshot.lastMove.from.toUpperCase()} → ${snapshot.lastMove.to.toUpperCase()}` : "Opening position"}</strong>
        </div>
        <div class="stat-block">
          <span>Half-moves played</span>
          <strong>${snapshot.moveCount}</strong>
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
