import "./styles.css";
import { BOT_DIFFICULTIES, DEFAULT_DIFFICULTY, getPersonalityForDifficulty, type BotDifficulty } from "./ai/botPersonality";
import { ChessSoundboard } from "./audio/chessSounds";
import { AiMoveController } from "./game/aiMoveController";
import { ChessController } from "./game/ChessController";
import type { PieceRole } from "./game/types";
import { ChessScene } from "./render/ChessScene";
import { Hud } from "./ui/Hud";

declare global {
  interface Window {
    __WOODEN_CHESS_DEBUG__?: {
      controller: ChessController;
      aiController: AiMoveController;
      sync: () => void;
      syncAndRunBotTurn: () => Promise<void>;
    };
  }
}

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root was not found.");
}

const soundboard = new ChessSoundboard();
let selectedDifficulty: BotDifficulty = DEFAULT_DIFFICULTY;
const searchParams = new URLSearchParams(window.location.search);

const renderMenu = () => {
  app.innerHTML = `
    <main class="menu-shell">
      <section class="menu-hero">
        <p class="eyebrow">Wooden Chess</p>
        <h1>Pick your opponent, then step onto the board.</h1>
        <p class="lede">
          This opening screen is now the match lobby. Choose the bot difficulty here, then launch
          straight into a clean floating-board match view.
        </p>
        <div class="menu-notes">
          <div class="menu-chip"><span>Board</span><strong>3D wooden GLB set</strong></div>
          <div class="menu-chip"><span>Rules</span><strong>Full legal chess</strong></div>
          <div class="menu-chip"><span>View</span><strong>Floating board in open space</strong></div>
        </div>
      </section>
      <aside class="menu-panel">
        <div class="hero-status">
          <span class="hero-label">Match setup</span>
          <strong>Set the challenge level before the board loads.</strong>
          <span>Difficulty</span>
          <select id="menu-difficulty">
            ${BOT_DIFFICULTIES.map(
              (difficulty) =>
                `<option value="${difficulty}" ${difficulty === selectedDifficulty ? "selected" : ""}>${difficulty}</option>`
            ).join("")}
          </select>
        </label>
        <button class="start-button" id="start-match" type="button">Start match</button>
      </aside>
    </main>
  `;

  const difficultySelect = document.querySelector<HTMLSelectElement>("#menu-difficulty");
  const startButton = document.querySelector<HTMLButtonElement>("#start-match");

  difficultySelect?.addEventListener("change", () => {
    selectedDifficulty = difficultySelect.value as BotDifficulty;
  });

  startButton?.addEventListener("click", () => {
    soundboard.prime();
    void startGame();
  });
};

const renderGameShell = () => {
  app.innerHTML = `
    <main class="play-shell">
      <div class="space-stage" id="board-stage">
        <div class="board-badge">
          <span>Wooden match</span>
          <strong>Floating board · full rules · move audio</strong>
        </div>
      </div>
      <aside class="play-hud" id="hud-root"></aside>
    </main>
  `;
};

const startGame = async () => {
  renderGameShell();

  const boardStage = document.querySelector<HTMLElement>("#board-stage");
  const hudRoot = document.querySelector<HTMLElement>("#hud-root");

  if (!boardStage || !hudRoot) {
    throw new Error("Required game UI nodes were not found.");
  }

  const chessScene = new ChessScene(boardStage);
  const controller = new ChessController();
  const aiController = new AiMoveController(controller);
  const hud = new Hud(hudRoot);
  let lastAudibleMoveCount = 0;

  aiController.setDifficulty(selectedDifficulty);
  aiController.setPersonality(getPersonalityForDifficulty(selectedDifficulty).id);
  aiController.reset();

  const sync = () => {
    const snapshot = controller.getSnapshot();
    const displayTargets =
      aiController.shouldHideHints() && snapshot.currentTurn === "white" ? [] : snapshot.legalTargets;

    if (snapshot.moveCount > lastAudibleMoveCount && snapshot.lastMoveSoundCue) {
      soundboard.playCue(snapshot.lastMoveSoundCue);
      lastAudibleMoveCount = snapshot.moveCount;
    }

    if (snapshot.moveCount === 0) {
      lastAudibleMoveCount = 0;
    }

    chessScene.syncBoardState(snapshot.pieces, snapshot.lastMove);
    chessScene.highlightSquares(snapshot.selectedSquare, displayTargets, snapshot.lastMove);
    hud.renderStatus(snapshot, aiController.getState());
  };

  const syncAndRunBotTurn = async () => {
    sync();
    const moved = await aiController.maybeRunBotTurn();
    if (moved) {
      sync();
    }
  };

  hud.bindReset(() => {
    controller.resetGame();
    aiController.reset();
    lastAudibleMoveCount = 0;
    sync();
  });

  hud.bindPromotion((role: PieceRole) => {
    controller.promotePiece(role);
    sync();
    void syncAndRunBotTurn();
  });

  chessScene.setSquareSelectHandler((square) => {
    if (!aiController.canPlayerInteract()) {
      return;
    }

    const moved = controller.selectSquare(square);
    sync();
    if (moved) {
      void syncAndRunBotTurn();
    }
  });

  try {
    await chessScene.loadScene();
    sync();

    if (import.meta.env.DEV) {
      window.__WOODEN_CHESS_DEBUG__ = {
        controller,
        aiController,
        sync,
        syncAndRunBotTurn
      };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    hudRoot.innerHTML = `<div class="hero-status is-error"><span class="hero-label">Runtime error</span><strong>Scene initialization failed</strong><p>${message}</p></div>`;
    console.error(error);
  }
};

if (searchParams.get("autostart") === "1") {
  soundboard.prime();
  void startGame();
} else {
  renderMenu();
}
