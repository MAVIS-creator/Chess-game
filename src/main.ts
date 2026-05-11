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
let playerName = "Player";
const searchParams = new URLSearchParams(window.location.search);

const renderMenu = () => {
  app.innerHTML = `
    <main class="menu-shell">
      <section class="menu-hero">
        <p class="eyebrow">Wooden Chess</p>
        <h1>Enter your name, choose a difficulty, then start the match.</h1>
        <p class="lede">
          The board will open cleanly on start, with only a light in-game overlay. Difficulty is
          set before the match begins.
        </p>
        <div class="menu-notes">
          <div class="menu-chip"><span>Board</span><strong>Floating 3D chess set</strong></div>
          <div class="menu-chip"><span>Sound</span><strong>Move and capture audio</strong></div>
          <div class="menu-chip"><span>Play</span><strong>Human vs AI</strong></div>
        </div>
      </section>
      <aside class="menu-panel">
        <div class="hero-status">
          <span class="hero-label">Match setup</span>
          <strong>Everything important is chosen before the board loads.</strong>
          <p>Your name appears in the match HUD and the difficulty controls how strong the AI feels.</p>
        </div>
        <label class="select-block">
          <span>Player name</span>
          <input id="menu-player-name" class="menu-input" type="text" maxlength="20" placeholder="Enter your name" value="${playerName}" />
        </label>
        <label class="select-block">
          <span>Difficulty</span>
          <select id="menu-difficulty">
            ${BOT_DIFFICULTIES.map(
              (difficulty) =>
                `<option value="${difficulty}" ${difficulty === selectedDifficulty ? "selected" : ""}>${difficulty}</option>`
            ).join("")}
          </select>
        </label>
        <div class="difficulty-note">
          <span>Current challenge</span>
          <strong>${selectedDifficulty}</strong>
          <p>${difficultyDescription(selectedDifficulty)}</p>
        </div>
        <button class="start-button" id="start-match" type="button">Start match</button>
      </aside>
    </main>
  `;

  const difficultySelect = document.querySelector<HTMLSelectElement>("#menu-difficulty");
  const playerNameInput = document.querySelector<HTMLInputElement>("#menu-player-name");
  const difficultyNote = document.querySelector<HTMLElement>(".difficulty-note");
  const startButton = document.querySelector<HTMLButtonElement>("#start-match");

  difficultySelect?.addEventListener("change", () => {
    selectedDifficulty = difficultySelect.value as BotDifficulty;
    if (difficultyNote) {
      difficultyNote.innerHTML = `
        <span>Current challenge</span>
        <strong>${selectedDifficulty}</strong>
        <p>${difficultyDescription(selectedDifficulty)}</p>
      `;
    }
  });

  playerNameInput?.addEventListener("input", () => {
    playerName = playerNameInput.value.trim() || "Player";
  });

  startButton?.addEventListener("click", () => {
    playerName = playerNameInput?.value.trim() || "Player";
    soundboard.prime();
    void startGame();
  });
};

const difficultyDescription = (difficulty: BotDifficulty) => {
  switch (difficulty) {
    case "Easy":
      return "Very forgiving and light pressure.";
    case "Normal":
      return "Balanced and solid.";
    case "Hard":
      return "Sharper and more consistent.";
    case "Boss Mode":
      return "Strong, aggressive, and punishing.";
    case "Nightmare Mode":
      return "Extremely hard with heavy tactical pressure.";
  }
};

const renderGameShell = () => {
  app.innerHTML = `
    <main class="play-shell">
      <div class="space-stage" id="board-stage"></div>
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

  aiController.setPlayerName(playerName);
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

  aiController.setStateListener(sync);

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
    hudRoot.innerHTML = `<div class="top-hud"><div class="turn-badge"><span class="hero-label">Runtime error</span><strong>Scene initialization failed</strong><p>${message}</p></div></div>`;
    console.error(error);
  }
};

if (searchParams.get("autostart") === "1") {
  soundboard.prime();
  void startGame();
} else {
  renderMenu();
}
