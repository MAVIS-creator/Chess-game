import "./styles.css";
import {
  BOT_DIFFICULTIES,
  DEFAULT_DIFFICULTY,
  DIFFICULTY_CONFIG,
  getPersonalityForDifficulty,
  type BotDifficulty
} from "./ai/botPersonality";
import { ChessSoundboard } from "./audio/chessSounds";
import { AiMoveController } from "./game/aiMoveController";
import { ChessController } from "./game/ChessController";
import type { PieceColor, PieceRole } from "./game/types";
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
  document.body.classList.remove("game-mode");
  app.innerHTML = `
    <main class="menu-shell">
      <section class="menu-hero">
        <div class="brand-mark" aria-hidden="true">
          <div class="brand-emblem">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
          </div>
          <div class="brand-copy">
            <p class="eyebrow">Cedar Chess</p>
            <strong>Classic Match</strong>
          </div>
        </div>
        <h1>A clean wooden chess table, a focused match, and a strong AI opponent.</h1>
        <p class="lede">
          Start from a simple match menu, choose your name and difficulty, then step straight into
          the board. The game keeps the screen calm, the moves legal, and the match easy to read.
        </p>
        <div class="menu-notes">
          <div class="menu-chip"><span>Board</span><strong>Floating 3D wooden set</strong></div>
          <div class="menu-chip"><span>Audio</span><strong>Classic move and capture sounds</strong></div>
          <div class="menu-chip"><span>Opponent</span><strong>Single-player vs AI</strong></div>
        </div>
        <div class="hero-footnote">
          <div class="hero-status compact">
            <span class="hero-label">How it plays</span>
            <strong>Click a piece, then click its highlighted destination.</strong>
          </div>
          <div class="hero-status compact">
            <span class="hero-label">During the match</span>
            <strong>Captured pieces slide to the board edge and stay visible.</strong>
          </div>
        </div>
      </section>
      <aside class="menu-panel">
        <div class="hero-status">
          <span class="hero-label">Match setup</span>
          <strong>Set the match once, then go straight into play.</strong>
          <p>Your name appears in the top HUD, and difficulty decides how sharp the AI will be.</p>
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
        <button class="start-button" id="start-match" type="button">Start game</button>
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
    case "Impossible":
      return "Final boss chess. The AI starts as White, you defend as Black, and both clocks are brutal.";
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
  document.body.classList.add("game-mode");
  renderGameShell();

  const boardStage = document.querySelector<HTMLElement>("#board-stage");
  const hudRoot = document.querySelector<HTMLElement>("#hud-root");

  if (!boardStage || !hudRoot) {
    throw new Error("Required game UI nodes were not found.");
  }

  const playerColor: PieceColor = selectedDifficulty === "Impossible" ? "black" : "white";
  const chessScene = new ChessScene(boardStage);
  const controller = new ChessController();
  const aiController = new AiMoveController(controller, {
    playerColor,
    botColor: playerColor === "white" ? "black" : "white"
  });
  const hud = new Hud(hudRoot);
  let lastAudibleMoveCount = 0;
  let lastAlertSignature = "";
  const baseClockMs = DIFFICULTY_CONFIG[selectedDifficulty].clockSeconds * 1000;
  const remainingMs: Record<PieceColor, number> = {
    white: baseClockMs,
    black: baseClockMs
  };
  let timedOutSide: PieceColor | null = null;
  let lastTickAt = performance.now();
  let activeTurnColor: PieceColor = controller.getSnapshot().currentTurn;
  let recordedOutcomeSignature = "";
  const botColor: PieceColor = playerColor === "white" ? "black" : "white";

  aiController.setPlayerName(playerName);
  aiController.setDifficulty(selectedDifficulty);
  aiController.setPersonality(getPersonalityForDifficulty(selectedDifficulty).id);
  aiController.setTurnGuard(() => timedOutSide === null);
  aiController.setClockState(
    remainingMs[playerColor],
    remainingMs[playerColor === "white" ? "black" : "white"],
    timedOutSide
  );
  aiController.reset();
  void aiController.hydrateAdaptiveMemory();

  const tickClock = () => {
    const snapshot = controller.getSnapshot();
    const now = performance.now();
    const delta = now - lastTickAt;
    lastTickAt = now;

    if (!timedOutSide && snapshot.currentTurn !== activeTurnColor) {
      activeTurnColor = snapshot.currentTurn;
      remainingMs.white = baseClockMs;
      remainingMs.black = baseClockMs;
    }

    if (!snapshot.gameOver && !timedOutSide && !snapshot.pendingPromotion) {
      const activeColor = snapshot.currentTurn;
      remainingMs[activeColor] = Math.max(0, remainingMs[activeColor] - delta);
      if (remainingMs[activeColor] <= 0) {
        timedOutSide = activeColor;
      }
    }

    aiController.setClockState(
      remainingMs[playerColor],
      remainingMs[playerColor === "white" ? "black" : "white"],
      timedOutSide
    );

    window.requestAnimationFrame(tickClock);
  };

  const sync = () => {
    const snapshot = controller.getSnapshot();
    const displayTargets = snapshot.legalTargets;

    if (snapshot.moveCount > lastAudibleMoveCount && snapshot.lastMoveSoundCue) {
      soundboard.playCue(snapshot.lastMoveSoundCue);
      lastAudibleMoveCount = snapshot.moveCount;
    }

    if (snapshot.moveCount === 0) {
      lastAudibleMoveCount = 0;
      lastAlertSignature = "";
    }

    const nextAlertSignature = `${snapshot.moveCount}:${snapshot.statusText}:${snapshot.inCheck}:${snapshot.gameOver}`;
    if (nextAlertSignature !== lastAlertSignature) {
      if (timedOutSide) {
      } else if (snapshot.gameOver) {
        if (snapshot.statusText.toLowerCase().includes("checkmate")) {
          soundboard.playCue("checkmate");
        } else if (snapshot.statusText.toLowerCase().includes("stalemate")) {
          soundboard.playCue("stalemate");
        }
      } else if (snapshot.inCheck && snapshot.moveCount > 0) {
        soundboard.playCue("check");
      }

      lastAlertSignature = nextAlertSignature;
    }

    if (timedOutSide || snapshot.gameOver) {
      const outcomeSignature = `${snapshot.moveCount}:${snapshot.statusText}:${timedOutSide ?? "none"}`;
      if (outcomeSignature !== recordedOutcomeSignature) {
        if (timedOutSide) {
          aiController.recordMatchOutcome(timedOutSide === playerColor ? "win" : "loss", outcomeSignature);
          aiController.recordMatchHistory(
            timedOutSide === playerColor ? "win" : "loss",
            snapshot.moveCount,
            `${timedOutSide === playerColor ? "AI" : playerName} wins on time.`,
            outcomeSignature
          );
        } else if (snapshot.statusText.toLowerCase().startsWith("draw")) {
          aiController.recordMatchOutcome("draw", outcomeSignature);
          aiController.recordMatchHistory("draw", snapshot.moveCount, snapshot.statusText, outcomeSignature);
        } else if (snapshot.statusText.startsWith("White wins")) {
          const result = botColor === "white" ? "win" : "loss";
          aiController.recordMatchOutcome(result, outcomeSignature);
          aiController.recordMatchHistory(result, snapshot.moveCount, snapshot.statusText, outcomeSignature);
        } else if (snapshot.statusText.startsWith("Black wins")) {
          const result = botColor === "black" ? "win" : "loss";
          aiController.recordMatchOutcome(result, outcomeSignature);
          aiController.recordMatchHistory(result, snapshot.moveCount, snapshot.statusText, outcomeSignature);
        }

        recordedOutcomeSignature = outcomeSignature;
      }
    }

    chessScene.syncBoardState(snapshot.pieces, snapshot.lastMove);
    chessScene.highlightSquares(
      snapshot.selectedSquare,
      displayTargets,
      snapshot.lastMove,
      snapshot.checkedKingSquare
    );
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
    remainingMs.white = baseClockMs;
    remainingMs.black = baseClockMs;
    timedOutSide = null;
    activeTurnColor = controller.getSnapshot().currentTurn;
    lastTickAt = performance.now();
    recordedOutcomeSignature = "";
    aiController.setClockState(
      remainingMs[playerColor],
      remainingMs[playerColor === "white" ? "black" : "white"],
      timedOutSide
    );
    sync();

    if (controller.getSnapshot().currentTurn === botColor) {
      void syncAndRunBotTurn();
    }
  });

  hud.bindPromotion((role: PieceRole) => {
    controller.promotePiece(role);
    sync();
    void syncAndRunBotTurn();
  });

  hud.bindZoomIn(() => {
    chessScene.zoomIn();
  });

  hud.bindZoomOut(() => {
    chessScene.zoomOut();
  });

  chessScene.setSquareSelectHandler((square) => {
    if (timedOutSide || !aiController.canPlayerInteract()) {
      return;
    }

    const moved = controller.selectSquare(square);
    if (moved) {
      aiController.reactToPlayerMove();
    }
    sync();
    if (moved) {
      void syncAndRunBotTurn();
    }
  });

  try {
    await chessScene.loadScene();
    sync();
    lastTickAt = performance.now();
    window.requestAnimationFrame(tickClock);
    if (controller.getSnapshot().currentTurn === (playerColor === "white" ? "black" : "white")) {
      void syncAndRunBotTurn();
    }

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
