import type { BotHudState, GameSnapshot, PieceRole } from "../game/types";

const PROMOTION_CHOICES: PieceRole[] = ["queen", "rook", "bishop", "knight"];

const formatClock = (timeMs: number) => {
  const totalSeconds = Math.max(0, Math.ceil(timeMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const difficultyIcon = (difficulty: BotHudState["difficulty"]) => {
  switch (difficulty) {
    case "Impossible":
      return "💀";
    case "Nightmare Mode":
      return "☠";
    case "Boss Mode":
      return "♛";
    case "Hard":
      return "⚔";
    case "Normal":
      return "◈";
    default:
      return "☘";
  }
};

export class Hud {
  private onReset: (() => void) | null = null;
  private onPromote: ((role: PieceRole) => void) | null = null;
  private onCycleCamera: (() => void) | null = null;
  private onBackToMenu: (() => void) | null = null;
  private onExit: (() => void) | null = null;
  private menuOpen = false;

  constructor(private readonly root: HTMLElement) {
    this.root.addEventListener("click", this.handleClick);
  }

  bindReset(handler: () => void) {
    this.onReset = handler;
  }

  bindPromotion(handler: (role: PieceRole) => void) {
    this.onPromote = handler;
  }

  bindCycleCamera(handler: () => void) {
    this.onCycleCamera = handler;
  }

  bindBackToMenu(handler: () => void) {
    this.onBackToMenu = handler;
  }

  bindExit(handler: () => void) {
    this.onExit = handler;
  }

  renderStatus(snapshot: GameSnapshot, botState: BotHudState) {
    const humanInCheck = snapshot.inCheck && snapshot.currentTurn === botState.playerColor;
    const aiInCheck = snapshot.inCheck && snapshot.currentTurn === botState.botColor;
    const timeoutWinner =
      botState.timedOutSide === null ? null : botState.timedOutSide === botState.playerColor ? "AI" : botState.playerName;

    const infoTitle = timeoutWinner
      ? "Time expired"
      : snapshot.gameOver
        ? "Match finished"
        : snapshot.currentTurn === botState.playerColor
          ? `${botState.playerName}'s turn`
          : botState.thinking
            ? botState.thinkingStage ?? "AI is thinking"
            : "AI to move";

    const infoText = timeoutWinner
      ? `${timeoutWinner} wins on time.`
      : snapshot.gameOver
        ? snapshot.statusText
        : snapshot.currentTurn === botState.playerColor
          ? snapshot.selectedSquare
            ? snapshot.legalTargets.length > 0
              ? `Selected ${snapshot.selectedSquare.toUpperCase()}. Green markers show its legal squares.`
              : humanInCheck
                ? `Selected ${snapshot.selectedSquare.toUpperCase()}. That piece cannot answer the check.`
                : `Selected ${snapshot.selectedSquare.toUpperCase()}. That piece has no legal move now.`
            : humanInCheck
              ? "Your king is in check. Only escape moves will appear."
              : "Select a piece to see where it can move."
          : botState.thinking
            ? "Calculating the reply."
            : aiInCheck
              ? "The AI king is under pressure."
              : "Watch the response.";

    const overlayMarkup = timeoutWinner
      ? `
        <div class="match-alert match-alert-end">
          <span class="hero-label">Time Over</span>
          <strong>${timeoutWinner} wins on time.</strong>
          <p>Reset the game or return to the menu.</p>
        </div>
      `
      : snapshot.gameOver
        ? `
          <div class="match-alert match-alert-end">
            <span class="hero-label">Game Over</span>
            <strong>${snapshot.statusText}</strong>
            <p>Reset the board or return to the menu.</p>
          </div>
        `
        : humanInCheck
          ? `
            <div class="match-alert match-alert-check">
              <span class="hero-label">King In Trouble</span>
              <strong>${botState.playerName}, your king is in check.</strong>
              <p>Only legal escape squares will light up.</p>
            </div>
          `
          : aiInCheck
            ? `
              <div class="match-alert match-alert-check ai">
                <span class="hero-label">Pressure Applied</span>
                <strong>The AI king is in check.</strong>
                <p>The next move must answer the threat.</p>
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
      <div class="hud-frame">
        <div class="timer-bar timer-bar-top ${snapshot.currentTurn === botState.botColor && !timeoutWinner ? "is-active" : ""}">
          <span class="timer-side">AI · ${botState.botColor.toUpperCase()}</span>
          <strong>${formatClock(botState.aiTimeMs)}</strong>
        </div>

        <div class="info-bar">
          <span class="info-pill">${infoTitle}</span>
          <span class="info-pill">${difficultyIcon(botState.difficulty)} ${botState.difficulty}</span>
          <span class="info-pill">${snapshot.currentTurn === "white" ? "⚪ White" : "⚫ Black"}</span>
        </div>

        <div class="control-drawer ${this.menuOpen ? "is-open" : ""}">
          <div class="mini-card">
            <span>Commentary</span>
            <strong>${botState.commentary}</strong>
          </div>
          <div class="mini-card">
            <span>Last move</span>
            <strong>${snapshot.lastMove ? `${snapshot.lastMove.from.toUpperCase()} → ${snapshot.lastMove.to.toUpperCase()}` : "Opening position"}</strong>
          </div>
          <div class="mini-card">
            <span>Captured</span>
            <strong>White ${snapshot.pieces.filter((piece) => piece.captured && piece.color === "white").length} · Black ${snapshot.pieces.filter((piece) => piece.captured && piece.color === "black").length}</strong>
          </div>
          <div class="drawer-actions">
            <button class="drawer-button" type="button" data-action="back-to-menu">Back to menu</button>
            <button class="drawer-button danger" type="button" data-action="exit">Exit</button>
          </div>
        </div>

        <div class="info-note">
          <strong>${infoText}</strong>
        </div>

        <div class="timer-bar timer-bar-bottom ${snapshot.currentTurn === botState.playerColor && !timeoutWinner ? "is-active" : ""}">
          <span class="timer-side">${botState.playerName} · ${botState.playerColor.toUpperCase()}</span>
          <strong>${formatClock(botState.playerTimeMs)}</strong>
        </div>

        <div class="action-strip">
          <button class="icon-button" type="button" data-action="toggle-menu" aria-expanded="${this.menuOpen ? "true" : "false"}">☰</button>
          <button class="pill-button secondary" type="button" data-action="reset">Reset</button>
          <button class="icon-button" type="button" data-action="cycle-camera" aria-label="Switch camera view">📷</button>
        </div>
      </div>
      ${overlayMarkup}
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

    if (target.dataset.action === "cycle-camera") {
      this.onCycleCamera?.();
      return;
    }

    if (target.dataset.action === "toggle-menu") {
      this.menuOpen = !this.menuOpen;
      this.root.querySelector(".control-drawer")?.classList.toggle("is-open", this.menuOpen);
      return;
    }

    if (target.dataset.action === "back-to-menu") {
      this.onBackToMenu?.();
      return;
    }

    if (target.dataset.action === "exit") {
      this.onExit?.();
      return;
    }

    const promotion = target.dataset.promotion as PieceRole | undefined;
    if (promotion) {
      this.onPromote?.(promotion);
    }
  };
}
