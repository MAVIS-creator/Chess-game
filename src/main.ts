import "./styles.css";
import { ChessController } from "./game/ChessController";
import type { PieceRole } from "./game/types";
import { ChessScene } from "./render/ChessScene";
import { Hud } from "./ui/Hud";

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
            promotion, and endgame detection.
          </p>
        </div>
      </div>
      <div class="board-stage" id="board-stage"></div>
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
const hud = new Hud(hudRoot);

const sync = () => {
  const snapshot = controller.getSnapshot();
  chessScene.syncBoardState(snapshot.pieces, snapshot.lastMove);
  chessScene.highlightSquares(snapshot.selectedSquare, snapshot.legalTargets, snapshot.lastMove);
  hud.renderStatus(snapshot);
};

hud.bindReset(() => {
  controller.resetGame();
  sync();
});

hud.bindPromotion((role: PieceRole) => {
  controller.promotePiece(role);
  sync();
});

chessScene.setSquareSelectHandler((square) => {
  controller.selectSquare(square);
  sync();
});

void chessScene.loadScene().then(() => {
  sync();
});
