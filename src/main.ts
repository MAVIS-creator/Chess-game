import "./styles.css";
import { ChessScene } from "./render/ChessScene";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root was not found.");
}

app.innerHTML = `
  <main class="app-shell">
    <section class="stage-panel">
      <div class="stage-copy">
        <p class="eyebrow">Phase 2 · Scene Runtime</p>
        <div>
          <h1>Wooden Chess</h1>
          <p class="lede">
            The imported chess set is now driving a real Three.js scene with board-aligned
            square targets, guided orbit controls, and a model registry ready for rules.
          </p>
        </div>
      </div>
      <div class="board-stage" id="board-stage"></div>
    </section>
    <aside class="info-panel">
      <div class="stat-block">
        <span>Asset</span>
        <strong>wooden_chess_set.glb</strong>
      </div>
      <div class="stat-block">
        <span>Camera</span>
        <strong>Guided orbit with capped zoom and tilt</strong>
      </div>
      <div class="stat-block">
        <span>Runtime</span>
        <strong>Square map, node registry, lighting, shadows</strong>
      </div>
      <div class="phase-note" id="phase-note">Loading the 3D scene...</div>
    </aside>
  </main>
`;

const boardStage = document.querySelector<HTMLElement>("#board-stage");
const phaseNote = document.querySelector<HTMLElement>("#phase-note");

if (!boardStage || !phaseNote) {
  throw new Error("Required UI nodes were not found.");
}

const chessScene = new ChessScene(boardStage);
void chessScene.loadScene().then(({ registry, squareMeshes }) => {
  phaseNote.textContent = `Scene ready with ${registry.piecesBySquare.size} mapped pieces and ${squareMeshes.size} board squares.`;
});
