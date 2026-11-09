
import type { BotHudState, GameSnapshot, PieceRole, SquareId } from "../game/types";

const PROMOTION_CHOICES: PieceRole[] = ["queen", "rook", "bishop", "knight"];

export interface MoveRecord {
  ply: number;
  san: string;
  uci: string;
  from: SquareId;
  to: SquareId;
}

export interface BoardPreferences {
  premoves: boolean;
  sounds: boolean;
  legalMoves: boolean;
  coordinates: boolean;
  highlights: boolean;
}

export interface MatchHudExtras {
  history: MoveRecord[];
  reviewPly: number | null;
  premove: { from: SquareId; to: SquareId } | null;
  selectingPremove: SquareId | null;
  externalResult: string | null;
}

const defaultPreferences: BoardPreferences = {
  premoves: true, sounds: true, legalMoves: true, coordinates: true, highlights: true
};

const escapeHtml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

const formatClock = (ms: number) => {
  const n = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
};
const difficultyIcon = (d: string) =>
  ({ Impossible: "💀", "Nightmare Mode": "☠", "Boss Mode": "♛", Hard: "⚔", Normal: "◈", Easy: "☘" } as Record<string, string>)[d] ?? "♟";

export class Hud {
  private onReset: (() => void) | null = null;
  private onPromote: ((role: PieceRole) => void) | null = null;
  private onCycleCamera: (() => void) | null = null;
  private onCameraView: ((view: "perspective" | "top-down") => void) | null = null;
  private onZoomIn: (() => void) | null = null;
  private onZoomOut: (() => void) | null = null;
  private onBackToMenu: (() => void) | null = null;
  private onResign: (() => void) | null = null;
  private onReplay: ((ply: number | null) => void) | null = null;
  private onUndo: (() => void) | null = null;
  private onCopyPgn: (() => void) | null = null;
  private onDownloadPgn: (() => void) | null = null;
  private onCancelPremove: (() => void) | null = null;
  private onPreference: ((key: keyof BoardPreferences, enabled: boolean) => void) | null = null;
  private menuOpen = false;
  private historyOpen = false;
  private confirmAction: "resign" | "leave" | null = null;
  private endDismissed = false;
  private cameraView: "perspective" | "top-down" = "perspective";
  private preferences: BoardPreferences = { ...defaultPreferences };
  private previous: { snapshot: GameSnapshot; botState: BotHudState; compactLayout: boolean; extras: MatchHudExtras } | null = null;

  constructor(private readonly root: HTMLElement) {
    try {
      const saved = JSON.parse(localStorage.getItem("cedar-board-preferences") ?? "{}") as Partial<BoardPreferences>;
      for (const key of Object.keys(defaultPreferences) as Array<keyof BoardPreferences>) {
        if (typeof saved[key] === "boolean") this.preferences[key] = saved[key];
      }
    } catch { /* Keep defaults on storage failure. */ }
    this.root.addEventListener("click", this.handleClick);
  }

  getPreferences() { return { ...this.preferences }; }
  bindReset(fn: () => void) { this.onReset = fn; }
  bindPromotion(fn: (role: PieceRole) => void) { this.onPromote = fn; }
  bindCycleCamera(fn: () => void) { this.onCycleCamera = fn; }
  bindCameraView(fn: (view: "perspective" | "top-down") => void) { this.onCameraView = fn; }
  bindZoomIn(fn: () => void) { this.onZoomIn = fn; }
  bindZoomOut(fn: () => void) { this.onZoomOut = fn; }
  bindBackToMenu(fn: () => void) { this.onBackToMenu = fn; }
  bindResign(fn: () => void) { this.onResign = fn; }
  bindReplay(fn: (ply: number | null) => void) { this.onReplay = fn; }
  bindUndo(fn: () => void) { this.onUndo = fn; }
  bindCopyPgn(fn: () => void) { this.onCopyPgn = fn; }
  bindDownloadPgn(fn: () => void) { this.onDownloadPgn = fn; }
  bindCancelPremove(fn: () => void) { this.onCancelPremove = fn; }
  bindPreference(fn: (key: keyof BoardPreferences, enabled: boolean) => void) { this.onPreference = fn; }

  resetForNewMatch() {
    this.menuOpen = false;
    this.historyOpen = false;
    this.confirmAction = null;
    this.endDismissed = false;
  }

  private rerender() {
    if (!this.previous) return;
    const { snapshot, botState, compactLayout, extras } = this.previous;
    this.renderStatus(snapshot, botState, compactLayout, extras);
  }

  renderStatus(snapshot: GameSnapshot, botState: BotHudState, compactLayout = false, extras?: Partial<MatchHudExtras>) {
    const details: MatchHudExtras = {
      history: extras?.history ?? [],
      reviewPly: extras?.reviewPly ?? null,
      premove: extras?.premove ?? null,
      selectingPremove: extras?.selectingPremove ?? null,
      externalResult: extras?.externalResult ?? null
    };
    this.previous = { snapshot, botState, compactLayout, extras: details };
    const timeoutWinner = botState.timedOutSide === null ? null :
      botState.timedOutSide === botState.playerColor ? "AI" : botState.playerName;
    const ended = Boolean(snapshot.gameOver || timeoutWinner || details.externalResult);
    const title = details.externalResult ? "Match finished" :
      timeoutWinner ? "Time expired" : snapshot.gameOver ? "Match finished" :
      details.reviewPly !== null ? "Reviewing moves" :
      snapshot.currentTurn === botState.playerColor ? `${botState.playerName}'s turn` :
      botState.thinking ? botState.thinkingStage ?? "AI is thinking" : "AI to move";
    const result = escapeHtml(details.externalResult ??
      (timeoutWinner ? `${timeoutWinner} wins on time.` : snapshot.statusText));
    const humanInCheck = snapshot.inCheck && snapshot.currentTurn === botState.playerColor;
    const aiInCheck = snapshot.inCheck && snapshot.currentTurn === botState.botColor;
    const turnNotes = details.reviewPly !== null
      ? `Reviewing move ${details.reviewPly}/${details.history.length} · clocks keep running during a live game.`
      : details.premove
        ? `Premove queued: ${details.premove.from.toUpperCase()} → ${details.premove.to.toUpperCase()}`
        : details.selectingPremove
          ? `Choose a destination for your premove from ${details.selectingPremove.toUpperCase()}.`
          : snapshot.currentTurn === botState.playerColor
            ? humanInCheck ? "Your king is in check. Only legal escapes are available." :
              snapshot.selectedSquare ? "Select a highlighted square. Castle by king to g/c-file or to your rook." :
              "Select a piece. All legal moves are available."
            : "AI is thinking. You can queue one premove while it thinks.";

    const promotion = snapshot.pendingPromotion ? `
      <div class="promotion-panel" role="dialog" aria-label="Choose pawn promotion">
        <span>Promote your pawn on ${snapshot.pendingPromotion.to.toUpperCase()}</span>
        <div class="promotion-options">
          ${PROMOTION_CHOICES.map(role => `<button type="button" data-promotion="${role}">${role}</button>`).join("")}
        </div>
      </div>` : "";

    const checkNote = !ended && details.reviewPly === null && (humanInCheck || aiInCheck) ?
      `<div class="match-alert match-alert-check ${compactLayout ? "match-alert-check-compact" : ""}">
        <strong>${humanInCheck ? "Your king is in check" : "AI king in check"}</strong>
        <p>${humanInCheck ? "Choose a legal escape." : "The engine must respond to the check."}</p>
      </div>` : "";

    const modal = this.confirmAction
      ? `<div class="cedar-modal-backdrop"><div class="cedar-game-modal" role="dialog" aria-modal="true" aria-label="Confirm action">
          <h2>${this.confirmAction === "resign" ? "Resign the match?" : "Leave the match?"}</h2>
          <p>${this.confirmAction === "resign" ? "Resigning records this game as a win for the AI." :
            "Leaving will end your current game and return to the match menu."}</p>
          <div class="cedar-modal-actions">
            <button type="button" data-action="cancel-confirm">Keep playing</button>
            <button type="button" class="is-danger" data-action="confirm-${this.confirmAction}">Confirm</button>
          </div>
        </div></div>`
      : ended && !this.endDismissed
        ? `<div class="cedar-modal-backdrop cedar-result-backdrop"><div class="cedar-game-modal" role="dialog" aria-modal="true" aria-label="Match complete">
            <span class="hero-label">Game over</span>
            <h2>${result}</h2>
            <p>${details.history.length} moves played · 15+0 rapid</p>
            <div class="cedar-modal-actions">
              <button type="button" data-action="reset">Play again</button>
              <button type="button" data-action="review-end">Replay game</button>
              <button type="button" data-action="back-to-menu">Match menu</button>
              <button type="button" data-action="download-pgn">Save PGN</button>
            </div>
          </div></div>` : "";

    const compactInfo = `
      <div class="info-bar ${compactLayout ? "compact-info-bar" : ""}">
        <span class="info-pill">${escapeHtml(title)}</span>
        <span class="info-pill">${difficultyIcon(botState.difficulty)} ${escapeHtml(botState.difficulty)}</span>
        <span class="info-pill">15+0 rapid</span>
        <span class="info-pill">${snapshot.currentTurn === "white" ? "⚪ White" : "⚫ Black"}</span>
      </div>`;
    const clocks = {
      top: `<div class="timer-bar timer-bar-top ${snapshot.currentTurn === botState.botColor && !ended ? "is-active" : ""}">
        <span class="timer-side">AI · ${botState.botColor.toUpperCase()}</span><strong>${formatClock(botState.aiTimeMs)}</strong></div>`,
      bottom: `<div class="timer-bar timer-bar-bottom ${snapshot.currentTurn === botState.playerColor && !ended ? "is-active" : ""}">
        <span class="timer-side">${escapeHtml(botState.playerName)} · ${botState.playerColor.toUpperCase()}</span>
        <strong>${formatClock(botState.playerTimeMs)}</strong></div>`
    };
    const settings = `
      <section class="cedar-settings" aria-label="Chess settings">
        <div class="cedar-settings-title"><strong>⚙ Game options</strong>
          <button data-action="toggle-settings" aria-label="Close settings" type="button">×</button></div>
        <p>Board faces your pieces automatically. You can flip it manually.</p>
        <div class="cedar-settings-toggles">
          ${(Object.keys(this.preferences) as Array<keyof BoardPreferences>).map(key => `
            <button type="button" data-pref="${key}" aria-pressed="${this.preferences[key]}">
              <span>${({ premoves: "Premoves", sounds: "Move sounds", legalMoves: "Show legal moves", coordinates: "Coordinates", highlights: "Move highlights" })[key]}</span>
              <strong>${this.preferences[key] ? "On" : "Off"}</strong>
            </button>`).join("")}
        </div>
        <div class="cedar-settings-actions">
          <button type="button" data-action="cycle-camera">↻ Flip board</button>
          ${!compactLayout ? `
            <button type="button" data-action="view-perspective">3D view</button>
            <button type="button" data-action="view-top-down">Top view</button>
            <button type="button" data-action="zoom-in">Zoom +</button>
            <button type="button" data-action="zoom-out">Zoom −</button>` : ""}
          <button type="button" data-action="open-history">↶ Replay board positions</button>
          <button type="button" data-action="copy-pgn">Copy PGN</button>
          <button type="button" data-action="download-pgn">Download PGN</button>
          ${details.premove ? '<button type="button" data-action="cancel-premove">Cancel premove</button>' : ""}
          ${ended ? '<button type="button" data-action="reset">Play again</button>' :
            '<button type="button" data-action="ask-resign" class="is-danger">Resign game</button>'}
          <button type="button" data-action="${ended ? "back-to-menu" : "ask-leave"}">Match menu</button>
        </div>
      </section>`;

    const history = `
      <section class="cedar-history-panel" role="region" aria-label="Moves and replay">
        <div class="cedar-history-heading">
          <strong>Board replay</strong>
          <button type="button" data-action="close-history">×</button>
        </div>
        <p>${details.reviewPly === null ? "Live position" : `Position ${details.reviewPly} of ${details.history.length}`}
        · ${ended ? "Review this finished game." : "Your game clock continues while reviewing."}</p>
        <!-- Replay controls step through positions without obstructing the board with move notation. -->
        <div class="cedar-replay-controls">
          <button type="button" data-action="review-start" title="Rewind to opening">⏮ Start</button>
          <button type="button" data-action="review-prev" title="Step back one move">← Back</button>
          <button type="button" data-action="review-next" title="Step forward one move">Forward →</button>
          <button type="button" data-action="review-end" title="Jump to latest move">End ⏭</button>
          <button type="button" data-action="review-live">Live board</button>
        </div>
      </section>`;

    const historyScrollTop = this.root.querySelector(".cedar-history-panel")?.scrollTop ?? 0;
    const settingsScrollTop = this.root.querySelector(".cedar-settings")?.scrollTop ?? 0;

    this.root.innerHTML = `
      <div class="hud-frame">
        ${clocks.top}
        ${compactInfo}
        ${!compactLayout ? `<div class="desktop-card-row">
            <div class="mini-card commentary-card"><span>Commentary</span><strong>${escapeHtml(botState.commentary)}</strong></div>
            <div class="mini-card last-move-card"><span>Last move</span>
              <strong>${snapshot.lastMove ? `${snapshot.lastMove.from.toUpperCase()} → ${snapshot.lastMove.to.toUpperCase()}` : "Opening position"}</strong></div>
            <div class="mini-card captured-card"><span>Captured</span>
              <strong>White ${snapshot.pieces.filter(p => p.captured && p.color === "white").length}
              · Black ${snapshot.pieces.filter(p => p.captured && p.color === "black").length}</strong></div>
          </div>` : ""}
        ${!compactLayout || details.premove || details.selectingPremove || details.reviewPly !== null
          ? `<div class="info-note cedar-play-hint"><strong>${escapeHtml(turnNotes)}</strong></div>`
          : ""}
        ${clocks.bottom}
        <div class="action-strip ${compactLayout ? "compact-actions" : "desktop-actions cedar-main-actions"}">
          <button class="icon-button" data-action="toggle-settings" type="button" aria-label="Open game options" aria-expanded="${this.menuOpen}">⚙</button>
          <button class="pill-button secondary" data-action="open-history" type="button">Replay</button>
          ${!ended && details.history.length >= (snapshot.currentTurn === botState.playerColor ? 2 : 1) ? '<button class="pill-button secondary" data-action="undo-move" type="button" title="Undo your last move (and the AI response, if already played)">↶ Undo</button>' : ""}
          ${details.premove ? '<button class="icon-button" data-action="cancel-premove" type="button" title="Cancel premove">✕</button>' : ""}
        </div>
      </div>
      ${this.menuOpen ? settings : ""}
      ${this.historyOpen ? history : ""}
      ${checkNote}
      ${promotion}
      ${modal}
    `;
    const historyPanel = this.root.querySelector(".cedar-history-panel");
    if (historyPanel) historyPanel.scrollTop = historyScrollTop;
    const settingsPanel = this.root.querySelector(".cedar-settings");
    if (settingsPanel) settingsPanel.scrollTop = settingsScrollTop;
  }

  private handleClick = (event: Event) => {
    const clicked = event.target;
    if (!(clicked instanceof HTMLElement)) return;
    const prefButton = clicked.closest<HTMLElement>("[data-pref]");
    if (prefButton) {
      const key = prefButton.dataset.pref as keyof BoardPreferences;
      if (!(key in this.preferences)) return;
      this.preferences[key] = !this.preferences[key];
      try { localStorage.setItem("cedar-board-preferences", JSON.stringify(this.preferences)); } catch { /* optional */ }
      this.onPreference?.(key, this.preferences[key]);
      this.rerender();
      return;
    }
    const target = clicked.closest<HTMLElement>("[data-action], [data-promotion]");
    if (!target) return;
    const action = target.dataset.action;
    if (action === "toggle-settings") { this.menuOpen = !this.menuOpen; this.historyOpen = false; this.rerender(); return; }
    if (action === "open-history") { this.historyOpen = true; this.menuOpen = false; this.rerender(); return; }
    if (action === "close-history") {
      this.historyOpen = false;
      this.onReplay?.(null);
      this.rerender();
      return;
    }
    if (action === "cancel-confirm") { this.confirmAction = null; this.rerender(); return; }
    if (action === "ask-resign") { this.confirmAction = "resign"; this.menuOpen = false; this.rerender(); return; }
    if (action === "ask-leave") { this.confirmAction = "leave"; this.menuOpen = false; this.rerender(); return; }
    if (action === "confirm-resign") { this.confirmAction = null; this.onResign?.(); return; }
    if (action === "confirm-leave") { this.confirmAction = null; this.onBackToMenu?.(); return; }
    if (action === "undo-move") { this.onUndo?.(); return; }
    if (action === "reset") { this.resetForNewMatch(); this.onReset?.(); return; }
    if (action === "back-to-menu") { this.onBackToMenu?.(); return; }
    if (action === "cycle-camera") { this.onCycleCamera?.(); return; }
    if (action === "view-perspective" || action === "view-top-down") {
      this.cameraView = action === "view-top-down" ? "top-down" : "perspective";
      this.onCameraView?.(this.cameraView);
      return;
    }
    if (action === "zoom-in") { this.onZoomIn?.(); return; }
    if (action === "zoom-out") { this.onZoomOut?.(); return; }
    if (action === "copy-pgn") { this.onCopyPgn?.(); return; }
    if (action === "download-pgn") { this.onDownloadPgn?.(); return; }
    if (action === "cancel-premove") { this.onCancelPremove?.(); return; }
    if (action?.startsWith("review-") || action === "replay-ply") {
      if (action === "review-end") this.endDismissed = true;
      const size = this.previous?.extras.history.length ?? 0;
      const current = this.previous?.extras.reviewPly ?? size;
      const ply = action === "review-start" ? 0 : action === "review-end" ? size :
        action === "review-prev" ? Math.max(0, current - 1) :
        action === "review-next" ? Math.min(size, current + 1) :
        action === "review-live" ? null : Number(target.dataset.ply);
      this.historyOpen = true;
      this.menuOpen = false;
      this.onReplay?.(ply);
      return;
    }
    const role = target.dataset.promotion as PieceRole | undefined;
    if (role && PROMOTION_CHOICES.includes(role)) this.onPromote?.(role);
  };
}
