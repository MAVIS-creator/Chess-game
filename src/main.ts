import "./styles.css";
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

app.innerHTML = `
  <main class="app-shell">
    <section class="stage-panel">
      <div class="stage-copy">
        <p class="eyebrow">Playable 3D Chess</p>
        <div>
          <h1>Wooden Chess</h1>
          <p class="lede">
            Click a piece, then click a highlighted destination. The imported wooden set now
            runs on a real chess engine with move validation, captures, castling, en passant,
            promotion, endgame detection, and a bot decision layer that can talk back without
            inventing illegal moves.
          </p>
        </div>
      </div>
      <div class="board-stage" id="board-stage">
        <div class="board-badge">
          <span>Board-ready GLB</span>
          <strong>Guided orbit · full rules · wooden set</strong>
        </div>
      </div>
    </section>
    <aside class="info-panel" id="hud-root"></aside>
  </main>
`;

const boardStage = document.querySelector<HTMLElement>("#board-stage");
const hudRoot = document.querySelector<HTMLElement>("#hud-root");

if (!boardStage || !hudRoot) {
  throw new Error("Required UI nodes were not found.");
}

const chessScene = new ChessScene(boardStage);
const controller = new ChessController();
const aiController = new AiMoveController(controller);
const hud = new Hud(hudRoot);

const sync = () => {
  const snapshot = controller.getSnapshot();
  const displayTargets =
    aiController.shouldHideHints() && snapshot.currentTurn === "white" ? [] : snapshot.legalTargets;
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
  sync();
});

hud.bindPromotion((role: PieceRole) => {
  controller.promotePiece(role);
  sync();
  void syncAndRunBotTurn();
});

hud.bindDifficultyChange((difficulty) => {
  aiController.setDifficulty(difficulty);
  sync();
});

hud.bindPersonalityChange((personalityId) => {
  aiController.setPersonality(personalityId);
  sync();
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

void chessScene.loadScene().then(() => {
  aiController.reset();
  sync();

  if (import.meta.env.DEV) {
    window.__WOODEN_CHESS_DEBUG__ = {
      controller,
      aiController,
      sync,
      syncAndRunBotTurn
    };
  }
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  hudRoot.innerHTML = `<div class="hero-status is-error"><span class="hero-label">Runtime error</span><strong>Scene initialization failed</strong><p>${message}</p></div>`;
  console.error(error);
});
