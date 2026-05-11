import type { BotHudState, GameSnapshot, PieceRole } from "../game/types";

const PROMOTION_CHOICES: PieceRole[] = ["queen", "rook", "bishop", "knight"];

export class Hud {
  private onReset: (() => void) | null = null;
  private onPromote: ((role: PieceRole) => void) | null = null;
  private onZoomIn: (() => void) | null = null;
  private onZoomOut: (() => void) | null = null;

  constructor(private readonly root: HTMLElement) {
    this.root.addEventListener("click", this.handleClick);
  }

  bindReset(handler: () => void) {
    this.onReset = handler;
  }

  bindPromotion(handler: (role: PieceRole) => void) {
    this.onPromote = handler;
  }

  bindZoomIn(handler: () => void) {
    this.onZoomIn = handler;
  }

  bindZoomOut(handler: () => void) {
    this.onZoomOut = handler;
  }

  renderStatus(snapshot: GameSnapshot, botState: BotHudState) {
    const turnTitle =
      snapshot.currentTurn === "white"
        ? `${botState.playerName}'s turn`
        : botState.thinking
          ? botState.thinkingStage ?? "AI is thinking"
          : "AI to move";

    const turnSubtitle =
      snapshot.currentTurn === "white"
        ? snapshot.selectedSquare
          ? `Selected ${snapshot.selectedSquare.toUpperCase()}. Green squares show where it can move.`
          : "Choose a piece to move."
        : botState.thinking
          ? "Please wait..."
          : "Watch the reply.";

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
      <div class="top-hud ${botState.thinking ? "is-thinking" : ""}">
        <div class="turn-badge">
          <span class="hero-label">${snapshot.inCheck ? "Check pressure" : snapshot.gameOver ? "Match finished" : "Turn"}</span>
          <strong>${turnTitle}</strong>
          <p>${snapshot.gameOver ? snapshot.statusText : turnSubtitle}</p>
        </div>
        <div class="status-pills">
          <span>${botState.playerName} vs AI</span>
          <span>${botState.difficulty}</span>
          <span>${snapshot.currentTurn === "white" ? "White to play" : "Black to play"}</span>
        </div>
      </div>
      <div class="bottom-hud">
        <div class="mini-card">
          <span>Last move</span>
          <strong>${snapshot.lastMove ? `${snapshot.lastMove.from.toUpperCase()} → ${snapshot.lastMove.to.toUpperCase()}` : "Opening position"}</strong>
        </div>
        <div class="mini-card">
          <span>Captured</span>
          <strong>White ${snapshot.pieces.filter((piece) => piece.captured && piece.color === "white").length} · Black ${snapshot.pieces.filter((piece) => piece.captured && piece.color === "black").length}</strong>
        </div>
        <div class="zoom-controls">
          <button class="zoom-button" type="button" data-action="zoom-out" aria-label="Zoom out">−</button>
          <button class="zoom-button" type="button" data-action="zoom-in" aria-label="Zoom in">+</button>
        </div>
        <button class="reset-button compact" type="button" data-action="reset">Reset</button>
      </div>
      ${promotionMarkup}
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

    if (target.dataset.action === "zoom-in") {
      this.onZoomIn?.();
      return;
    }

    if (target.dataset.action === "zoom-out") {
      this.onZoomOut?.();
      return;
    }

    const promotion = target.dataset.promotion as PieceRole | undefined;
    if (promotion) {
      this.onPromote?.(promotion);
    }
  };
}
