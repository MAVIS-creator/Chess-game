import { ChessController } from "../game/ChessController";
import { ChessScene } from "../render/ChessScene";
import type { SquareId } from "../game/types";

const OPENING: readonly (readonly [SquareId, SquareId])[] = [
  ["e2", "e4"], ["e7", "e5"], ["g1", "f3"], ["b8", "c6"],
  ["f1", "b5"], ["a7", "a6"], ["b5", "a4"], ["g8", "f6"],
  ["e1", "g1"], ["f8", "e7"], ["f1", "e1"], ["b7", "b5"],
  ["a4", "b3"], ["d7", "d6"], ["c2", "c3"], ["e8", "g8"]
];

/**
 * Render the exact wooden_chess_set.glb used in a real desktop match.
 * A ChessController validates every demonstration move. The camera is fixed
 * and the GLB scene remains mounted while pieces animate (no board flashes).
 */
export class LandingModelDemo {
  private readonly controller = new ChessController();
  private scene: ChessScene | null = null;
  private timer: number | null = null;
  private disposed = false;
  private moveIndex = 0;

  constructor(private readonly root: HTMLElement) {
    void this.load();
  }

  private async load() {
    try {
      const scene = new ChessScene(this.root, { preview: true });
      this.scene = scene;
      const loaded = await scene.loadScene();

      if (this.disposed || loaded.pieceCount < 32) {
        return;
      }

      scene.setCameraPreset("perspective");
      scene.syncBoardState(this.controller.getSnapshot().pieces, null);

      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        this.timer = window.setInterval(() => this.step(), 1550);
      }
    } catch (error) {
      if (this.disposed) return;
      console.warn("Cedar Chess 3D preview unavailable", error);
      this.scene?.dispose();
      this.scene = null;
      this.root.innerHTML = '<p class="landing-model-error">3D preview unavailable. The game is still accessible through Play.</p>';
    }
  }

  private step() {
    if (this.disposed || document.hidden) return;
    if (this.moveIndex >= OPENING.length) {
      this.stopTimer();
      return;
    }

    const [from, to] = OPENING[this.moveIndex];
    if (!this.controller.applyUciMove(`${from}${to}`)) {
      this.stopTimer();
      return;
    }

    const snapshot = this.controller.getSnapshot();
    this.scene?.syncBoardState(snapshot.pieces, snapshot.lastMove);
    this.scene?.highlightSquares(null, [], [], snapshot.lastMove);
    this.moveIndex += 1;
    if (this.moveIndex >= OPENING.length) this.stopTimer();
  }

  private stopTimer() {
    if (this.timer === null) return;
    window.clearInterval(this.timer);
    this.timer = null;
  }

  dispose() {
    this.disposed = true;
    this.stopTimer();
    this.scene?.dispose();
    this.scene = null;
  }
}
