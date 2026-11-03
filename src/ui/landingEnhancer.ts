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
  wp: "♙",
  wn: "♘",
  wb: "♗",
  wr: "♖",
  wq: "♕",
  wk: "♔",
  bp: "♟",
  bn: "♞",
  bb: "♝",
  br: "♜",
  bq: "♛",
  bk: "♚"
};

class LandingBoardDemo {
  private readonly game = new Chess();
  private timer: number | null = null;
  private index = 0;
  private lastMove: readonly [string, string] | null = null;

  constructor(private readonly root: HTMLElement) {
    this.render();
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.timer = window.setInterval(() => this.step(), 900);
    }
  }

  dispose() {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private step() {
    if (this.index >= DEMO_MOVES.length) {
      this.game.reset();
      this.index = 0;
      this.lastMove = null;
      this.render();
      return;
    }

    const move = DEMO_MOVES[this.index];
    const result = this.game.move({ from: move[0], to: move[1], promotion: "q" });
    if (!result) {
      this.game.reset();
      this.index = 0;
      this.lastMove = null;
      this.render();
      return;
    }

    this.lastMove = move;
    this.index += 1;
    this.render();
  }

  private render() {
    const cells: string[] = [];
    for (let rank = 8; rank >= 1; rank -= 1) {
      for (const file of "abcdefgh") {
        const square = `${file}${rank}` as Square;
        const piece = this.game.get(square);
        const isLight = ((file.charCodeAt(0) - 97) + rank) % 2 === 1;
        const isLastMove = this.lastMove?.includes(square) ?? false;
        const pieceText = piece ? PIECES[`${piece.color}${piece.type}`] : "";
        const pieceMarkup =
          piece && pieceText
            ? `<span class="landing-piece ${piece.color === "w" ? "is-white" : "is-black"}">${pieceText}</span>`
            : "";
        cells.push(
          `<div class="landing-square ${isLight ? "is-light" : "is-dark"} ${isLastMove ? "is-last" : ""}" data-square="${square}">` +
            pieceMarkup +
          `</div>`
        );
      }
    }

    this.root.innerHTML = cells.join("");
  }
}

const appRoot = document.querySelector<HTMLElement>("#app");
let activeDemo: LandingBoardDemo | null = null;

const focusElement = (selector: string) => {
  const target = document.querySelector<HTMLElement>(selector);
  target?.focus();
  target?.scrollIntoView({ behavior: "smooth", block: "center" });
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

  if (shell.dataset.landingEnhanced === "true") {
    return;
  }

  activeDemo?.dispose();
  activeDemo = null;
  shell.dataset.landingEnhanced = "true";

  const hero = shell.querySelector<HTMLElement>(".menu-hero");
  if (!hero) {
    return;
  }

  const isAuth = shell.classList.contains("auth-shell");
  const visual = document.createElement("div");
  visual.className = "landing-visual";
  visual.setAttribute("aria-hidden", "true");
  visual.innerHTML = `
    <div class="landing-board-frame">
      <div class="landing-board-glow"></div>
      <div class="landing-demo-board"></div>
      <div class="landing-engine-badge"><span></span> Stockfish 19 ready</div>
    </div>
  `;
  hero.prepend(visual);

  const heading = hero.querySelector<HTMLHeadingElement>("h1");
  const lede = hero.querySelector<HTMLElement>(".lede");
  if (heading) {
    heading.textContent = isAuth
      ? "Your next game starts on the board."
      : "Play the position, not the menu.";
  }
  if (lede) {
    lede.textContent = isAuth
      ? "Sign in, choose your level, and move straight into a live chess board powered by Stockfish 19."
      : "Cedar Chess keeps the board front and center: legal moves, engine-backed pressure, clean clocks, and a local fallback when the cloud engine is unavailable.";
  }

  const nav = document.createElement("nav");
  nav.className = "landing-piece-nav";
  nav.setAttribute("aria-label", "Cedar Chess shortcuts");
  nav.innerHTML = isAuth
    ? `
      <button type="button" data-landing-action="player" aria-label="Player name"><span>♔</span><small>Player</small></button>
      <button type="button" data-landing-action="access" aria-label="Switch login or sign up"><span>♞</span><small>Access</small></button>
      <button type="button" data-landing-action="play" aria-label="Continue"><span>♜</span><small>Enter</small></button>
    `
    : `
      <button type="button" data-landing-action="player" aria-label="Player name"><span>♔</span><small>Player</small></button>
      <button type="button" data-landing-action="level" aria-label="Difficulty"><span>♞</span><small>Level</small></button>
      <button type="button" data-landing-action="play" aria-label="Start game"><span>♜</span><small>Play</small></button>
    `;
  shell.prepend(nav);

  nav.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-landing-action]");
    if (!button) {
      return;
    }

    switch (button.dataset.landingAction) {
      case "player":
        focusElement(isAuth ? "#auth-player-name" : "#menu-player-name");
        break;
      case "access": {
        const inactive = document.querySelector<HTMLButtonElement>(".auth-switch-button:not(.is-active)");
        inactive?.click();
        break;
      }
      case "level":
        focusElement("#menu-difficulty");
        break;
      case "play":
        document
          .querySelector<HTMLButtonElement>(isAuth ? "#auth-submit" : "#start-match")
          ?.click();
        break;
      default:
        break;
    }
  });

  const boardRoot = visual.querySelector<HTMLElement>(".landing-demo-board");
  if (boardRoot) {
    activeDemo = new LandingBoardDemo(boardRoot);
  }
};

if (appRoot) {
  const observer = new MutationObserver(enhanceLanding);
  observer.observe(appRoot, { childList: true, subtree: true });
  enhanceLanding();
}
