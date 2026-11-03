import { Chess, type Square } from "chess.js";
import "../landing.css";

const DEMO_MOVES = [
  ["e2", "e4"],
  ["e7", "e5"],
  ["g1", "f3"],
  ["b8", "c6"],
  ["f1", "b5"],
  ["a7", "a6"],
  ["b5", "a4"],
  ["g8", "f6"],
  ["e1", "g1"],
  ["f8", "e7"],
  ["f1", "e1"],
  ["b7", "b5"],
  ["a4", "b3"],
  ["d7", "d6"],
  ["c2", "c3"],
  ["e8", "g8"]
] as const;

const PIECES: Record<string, string> = {
  wp: "♙", wn: "♘", wb: "♗", wr: "♖", wq: "♕", wk: "♔",
  bp: "♟", bn: "♞", bb: "♝", br: "♜", bq: "♛", bk: "♚"
};

type PieceColor = "w" | "b";

const squarePosition = (square: string) => {
  const file = square.charCodeAt(0) - "a".charCodeAt(0);
  const rank = Number(square[1]);
  return { left: `${file * 12.5}%`, top: `${(8 - rank) * 12.5}%` };
};

class LandingBoardDemo {
  private readonly game = new Chess();
  private readonly pieces = new Map<string, HTMLElement>();
  private readonly squares = new Map<string, HTMLElement>();
  private readonly pieceLayer: HTMLDivElement;
  private timer: number | null = null;
  private index = 0;
  private lastMove: readonly [string, string] | null = null;

  constructor(private readonly root: HTMLElement) {
    const board = document.createDocumentFragment();
    for (let rank = 8; rank >= 1; rank -= 1) {
      for (const file of "abcdefgh") {
        const square = `${file}${rank}` as Square;
        const cell = document.createElement("div");
        const light = ((file.charCodeAt(0) - 97) + rank) % 2 === 1;
        cell.className = `landing-square ${light ? "is-light" : "is-dark"}`;
        cell.dataset.square = square;
        this.squares.set(square, cell);
        board.append(cell);
      }
    }

    this.pieceLayer = document.createElement("div");
    this.pieceLayer.className = "landing-piece-layer";
    this.root.replaceChildren(board, this.pieceLayer);

    for (let rank = 8; rank >= 1; rank -= 1) {
      for (const file of "abcdefgh") {
        const square = `${file}${rank}` as Square;
        const piece = this.game.get(square);
        if (piece) {
          this.addPiece(square, piece.color, piece.type);
        }
      }
    }

    // Move only the actual chess piece. Never rebuild the entire board on a timer.
    // The demonstration stops after the opening instead of visibly flashing/resetting.
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.timer = window.setInterval(() => this.step(), 1400);
    }
  }

  dispose() {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private addPiece(square: Square, color: PieceColor, type: string) {
    const element = document.createElement("span");
    element.className = `landing-piece is-${color === "w" ? "white" : "black"}`;
    element.textContent = PIECES[`${color}${type}`] ?? "";
    element.setAttribute("aria-hidden", "true");
    Object.assign(element.style, squarePosition(square));
    this.pieceLayer.append(element);
    this.pieces.set(square, element);
  }

  private movePiece(from: string, to: string) {
    const piece = this.pieces.get(from);
    if (!piece) {
      return;
    }
    const captured = this.pieces.get(to);
    if (captured) {
      captured.remove();
      this.pieces.delete(to);
    }
    this.pieces.delete(from);
    this.pieces.set(to, piece);
    Object.assign(piece.style, squarePosition(to));
  }

  private step() {
    if (document.hidden) {
      return;
    }
    if (this.index >= DEMO_MOVES.length) {
      this.dispose();
      return;
    }

    const [from, to] = DEMO_MOVES[this.index];
    const move = this.game.move({ from, to, promotion: "q" });
    if (!move) {
      this.dispose();
      return;
    }

    if (this.lastMove) {
      for (const square of this.lastMove) {
        this.squares.get(square)?.classList.remove("is-last");
      }
    }
    this.squares.get(from)?.classList.add("is-last");
    this.squares.get(to)?.classList.add("is-last");
    this.lastMove = [from, to];

    if (move.flags.includes("e")) {
      // En passant removes the captured pawn from a different square.
      const capturedSquare = `${to[0]}${from[1]}`;
      this.pieces.get(capturedSquare)?.remove();
      this.pieces.delete(capturedSquare);
    }
    this.movePiece(from, to);

    if (move.flags.includes("k")) {
      this.movePiece(move.color === "w" ? "h1" : "h8", move.color === "w" ? "f1" : "f8");
    } else if (move.flags.includes("q")) {
      this.movePiece(move.color === "w" ? "a1" : "a8", move.color === "w" ? "d1" : "d8");
    }
    if (move.promotion) {
      const promotedPiece = this.pieces.get(to);
      if (promotedPiece) {
        promotedPiece.textContent = PIECES[`${move.color}${move.promotion}`] ?? promotedPiece.textContent;
      }
    }

    this.index += 1;
    if (this.index >= DEMO_MOVES.length) {
      this.dispose();
    }
  }
}

const appRoot = document.querySelector<HTMLElement>("#app");
let activeDemo: LandingBoardDemo | null = null;

type Destination = "home" | "about" | "play" | "contact" | "account";
const TABS: ReadonlyArray<{ id: Destination; symbol: string; label: string }> = [
  { id: "home", symbol: "♚", label: "Home" },
  { id: "about", symbol: "♞", label: "About" },
  { id: "play", symbol: "♜", label: "Play" },
  { id: "contact", symbol: "♛", label: "Contact" },
  { id: "account", symbol: "♔", label: "Account" }
];

const focusInput = (selector: string) => {
  const target = document.querySelector<HTMLElement>(selector);
  target?.scrollIntoView({ behavior: "smooth", block: "center" });
  target?.focus({ preventScroll: true });
};

const enhanceLanding = () => {
  if (!appRoot) {
    return;
  }
  const shell = appRoot.querySelector<HTMLElement>(".menu-shell");
  if (!shell) {
    activeDemo?.dispose();
    activeDemo = null;
    return;
  }

  if (shell.dataset.landingEnhanced) {
    return;
  }

  activeDemo?.dispose();
  activeDemo = null;
  const isAuth = shell.classList.contains("auth-shell");
  const isRecovery = shell.classList.contains("recovery-shell");
  const isAccount = shell.classList.contains("account-shell");
  shell.dataset.landingEnhanced = isAccount ? "account" : "true";

  const nav = document.createElement("nav");
  nav.className = "landing-piece-nav";
  nav.setAttribute("aria-label", "Chess piece page navigation");
  nav.innerHTML = TABS.map(({ id, symbol, label }) =>
    `<button type="button" data-landing-action="${id}" aria-label="${label} section" aria-pressed="false"><span aria-hidden="true">${symbol}</span><small>${isAuth && id === "account" ? "Access" : label}</small></button>`
  ).join("");

  const detail = document.createElement("section");
  detail.className = "landing-section-panel";
  detail.hidden = true;
  detail.setAttribute("aria-live", "polite");
  detail.setAttribute("aria-label", "Cedar Chess information");

  const closeDetail = () => {
    detail.hidden = true;
    for (const button of nav.querySelectorAll<HTMLButtonElement>("button")) {
      button.setAttribute("aria-pressed", "false");
    }
  };

  const showDetail = (destination: "about" | "contact") => {
    const isAbout = destination === "about";
    detail.innerHTML = isAbout
      ? `<div class="landing-section-header"><span class="eyebrow">♞ Discover the game</span><button type="button" data-detail-close aria-label="Close about section">×</button></div>
         <h2>Welcome to Cedar Chess</h2>
         <p>A strategy-first chess experience with a legal interactive board, six AI challenges, and Stockfish 19 analysis. The cloud engine is preferred, but the browser's local engine keeps gameplay available if the remote service cannot respond.</p>
         <div class="landing-section-points"><div><strong>♙ Six difficulty levels</strong><span>Easy through Impossible</span></div><div><strong>♜ Engine-backed play</strong><span>Stockfish 19, with a local fallback</span></div><div><strong>♔ Your player account</strong><span>Sign in and manage credentials</span></div></div>
         <button class="landing-section-cta" type="button" data-detail-play>Go to Play</button>`
      : `<div class="landing-section-header"><span class="eyebrow">♛ Contact Cedar Chess</span><button type="button" data-detail-close aria-label="Close contact section">×</button></div>
         <h2>Questions, ideas, or a bug to report?</h2>
         <p>Use the project's GitHub issue tracker to contact the development team, suggest features, or report a problem. Please do not post passwords, private account details, or API keys.</p>
         <a class="landing-section-cta" href="https://github.com/MAVIS-creator/Chess-game/issues/new" target="_blank" rel="noopener noreferrer">Open contact and feedback</a>`;

    detail.hidden = false;
    for (const button of nav.querySelectorAll<HTMLButtonElement>("button")) {
      button.setAttribute("aria-pressed", button.dataset.landingAction === destination ? "true" : "false");
    }
    detail.querySelector<HTMLButtonElement>("[data-detail-close]")?.addEventListener("click", () => {
      closeDetail();
      nav.querySelector<HTMLButtonElement>(`[data-landing-action="${destination}"]`)?.focus();
    });
    detail.querySelector<HTMLButtonElement>("[data-detail-play]")?.addEventListener("click", () => navigate("play"));
    detail.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const navigate = (destination: Destination) => {
    if (destination === "about" || destination === "contact") {
      showDetail(destination);
      return;
    }
    closeDetail();
    if (destination === "home") {
      if (isAccount) {
        document.querySelector<HTMLButtonElement>("#account-back")?.click();
      } else {
        shell.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }
    if (destination === "play") {
      if (isAccount) {
        document.querySelector<HTMLButtonElement>("#account-back")?.click();
      } else if (isAuth) {
        focusInput(isRecovery ? "#recovery-email, #recovery-new-password" : "#auth-player-name");
      } else {
        document.querySelector<HTMLButtonElement>("#start-match")?.click();
      }
      return;
    }
    if (isAccount) {
      focusInput("#settings-new-email");
    } else if (isAuth) {
      focusInput(isRecovery ? "#recovery-email, #recovery-new-password" : "#auth-player-name");
    } else {
      document.querySelector<HTMLButtonElement>("#open-account-settings")?.click();
    }
  };

  let suppressClick = false;
  nav.addEventListener("click", (event) => {
    if (suppressClick) {
      event.preventDefault();
      suppressClick = false;
      return;
    }
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-landing-action]");
    if (button) {
      navigate(button.dataset.landingAction as Destination);
    }
  });

  // Touch/pen users can also slide the chess-piece navigation horizontally.
  // A gesture selects the neighboring piece's section; tapping still works.
  let gestureStart: { x: number; y: number; index: number } | null = null;
  nav.addEventListener("pointerdown", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-landing-action]");
    if (!button) return;
    gestureStart = {
      x: event.clientX,
      y: event.clientY,
      index: TABS.findIndex((tab) => tab.id === button.dataset.landingAction)
    };
  });
  nav.addEventListener("pointerup", (event) => {
    if (!gestureStart) return;
    const deltaX = event.clientX - gestureStart.x;
    const deltaY = event.clientY - gestureStart.y;
    if (Math.abs(deltaX) >= 45 && Math.abs(deltaY) < 60) {
      event.preventDefault();
      suppressClick = true;
      const delta = deltaX < 0 ? 1 : -1;
      const selected = TABS[Math.min(TABS.length - 1, Math.max(0, gestureStart.index + delta))];
      navigate(selected.id);
    }
    gestureStart = null;
  });
  nav.addEventListener("pointercancel", () => { gestureStart = null; });

  shell.prepend(nav);
  shell.append(detail);

  if (isAccount) {
    return;
  }

  const hero = shell.querySelector<HTMLElement>(".menu-hero");
  if (!hero) return;

  const visual = document.createElement("div");
  visual.className = "landing-visual";
  visual.setAttribute("aria-label", "Animated chess opening");
  visual.innerHTML = `
    <div class="landing-board-frame">
      <div class="landing-board-glow"></div>
      <div class="landing-demo-board"></div>
      <div class="landing-engine-badge"><span></span> Stockfish 19</div>
    </div>
  `;
  hero.prepend(visual);

  const heading = hero.querySelector<HTMLHeadingElement>("h1");
  if (heading && !isRecovery) {
    heading.textContent = isAuth ? "Every move starts here." : "The board is yours.";
  }

  const boardRoot = visual.querySelector<HTMLElement>(".landing-demo-board");
  if (boardRoot) {
    activeDemo = new LandingBoardDemo(boardRoot);
  }
};

if (appRoot) {
  const observer = new MutationObserver(enhanceLanding);
  observer.observe(appRoot, { childList: true });
  enhanceLanding();
}
