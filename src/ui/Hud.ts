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
    const humanInCheck = snapshot.inCheck && snapshot.currentTurn === "white";
    const aiInCheck = snapshot.inCheck && snapshot.currentTurn === "black";
    const turnTitle =
      snapshot.gameOver
        ? "Match finished"
        : snapshot.currentTurn === "white"
        ? `${botState.playerName}'s turn`
        : botState.thinking
          ? botState.thinkingStage ?? "AI is thinking"
          : "AI to move";

    const turnSubtitle =
      snapshot.gameOver
        ? snapshot.statusText
        : snapshot.currentTurn === "white"
        ? snapshot.selectedSquare
          ? snapshot.legalTargets.length > 0
            ? `Selected ${snapshot.selectedSquare.toUpperCase()}. Green markers show where it can move.`
            : humanInCheck
              ? `Selected ${snapshot.selectedSquare.toUpperCase()}. That piece cannot solve the check.`
              : `Selected ${snapshot.selectedSquare.toUpperCase()}. That piece has no legal move right now.`
          : humanInCheck
            ? "Your king is in check. Only escape moves will be shown."
            : "Choose a piece to move."
        : botState.thinking
          ? "Please wait..."
          : aiInCheck
            ? "The AI king is under pressure."
          : "Watch the reply.";

    const alertMarkup = snapshot.gameOver
      ? `
        <div class="match-alert match-alert-end">
          <span class="hero-label">Game Over</span>
          <strong>${snapshot.statusText}</strong>
          <p>Press reset to start a fresh match.</p>
          <button class="reset-button" type="button" data-action="reset">Play again</button>
        </div>
      `
      : humanInCheck
        ? `
          <div class="match-alert match-alert-check">
            <span class="hero-label">King In Trouble</span>
            <strong>${botState.playerName}, your king is in check.</strong>
            <p>Select a piece and only legal escape squares will appear.</p>
          </div>
        `
        : aiInCheck
          ? `
            <div class="match-alert match-alert-check ai">
              <span class="hero-label">Pressure Applied</span>
              <strong>The AI king is in check.</strong>
              <p>The reply must answer the threat.</p>
            </div>
          `
          : "";

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
      ${alertMarkup}
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
