import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { INITIAL_PIECES } from "../game/setup";
import type { GamePieceState, MoveSummary, PieceRole, SquareId } from "../game/types";
import { ALL_SQUARES, BOARD_SURFACE_Y, SQUARE_SIZE, getSquarePosition } from "./boardLayout";
import { buildModelRegistry, getTemplateKey, type ModelRegistry, type PieceView } from "./modelRegistry";

const ASSET_PATH = "/wooden_chess_set.glb";

interface PieceAnimation {
  pieceId: string;
  object: THREE.Object3D;
  start: THREE.Vector3;
  end: THREE.Vector3;
  elapsed: number;
  duration: number;
}

export class ChessScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly clock = new THREE.Clock();
  private readonly loader = new GLTFLoader();
  private readonly squareMeshes = new Map<SquareId, THREE.Mesh>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly animations = new Map<string, PieceAnimation>();
  private frameHandle = 0;
  private registry: ModelRegistry | null = null;
  private onSquareSelect: ((square: SquareId) => void) | null = null;

  constructor(private readonly mount: HTMLElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#100d0a");
    this.scene.fog = new THREE.Fog("#100d0a", 1.2, 3.6);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
    this.camera.position.set(-0.42, 0.34, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.mount.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.minDistance = 0.38;
    this.controls.maxDistance = 0.85;
    this.controls.minPolarAngle = 0.7;
    this.controls.maxPolarAngle = 1.42;
    this.controls.target.set(0, 0.02, 0);

    this.addLights();
    this.addSquareTargets();
    this.handleResize();
    this.renderer.domElement.addEventListener("pointerdown", this.handlePointerDown);
    window.addEventListener("resize", this.handleResize);
  }

  async loadScene() {
    const gltf = await this.loader.loadAsync(ASSET_PATH);
    gltf.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    this.scene.add(gltf.scene);
    this.registry = buildModelRegistry(gltf.scene, INITIAL_PIECES);
    this.start();

    return {
      pieceCount: this.registry.pieceViews.size,
      squareCount: this.squareMeshes.size
    };
  }

  setSquareSelectHandler(handler: (square: SquareId) => void) {
    this.onSquareSelect = handler;
  }

  zoomIn() {
    this.controls.dollyIn(1.2);
    this.controls.update();
  }

  zoomOut() {
    this.controls.dollyOut(1.2);
    this.controls.update();
  }

  highlightSquares(
    selected: SquareId | null,
    legalTargets: SquareId[],
    lastMove: MoveSummary | null
  ) {
    const legalSet = new Set(legalTargets);

    for (const [square, mesh] of this.squareMeshes) {
      const material = mesh.material as THREE.MeshBasicMaterial;

      if (selected === square) {
        material.color.set("#f3d67d");
        material.opacity = 0.42;
      } else if (legalSet.has(square)) {
        material.color.set("#5fa06f");
        material.opacity = 0.36;
      } else if (lastMove && (lastMove.from === square || lastMove.to === square)) {
        material.color.set("#d6a05c");
        material.opacity = 0.24;
      } else if (this.isLightSquare(square)) {
        material.color.set("#efd9b2");
        material.opacity = 0.08;
      } else {
        material.color.set("#7a5736");
        material.opacity = 0.08;
      }
    }
  }

  syncBoardState(pieces: GamePieceState[], animateMove: MoveSummary | null) {
    if (!this.registry) {
      return;
    }
    const capturedCounts: Record<GamePieceState["color"], number> = {
      white: 0,
      black: 0
    };

    for (const piece of pieces) {
      const view = this.registry.pieceViews.get(piece.id);

      if (!view) {
        continue;
      }

      this.ensureRoleMesh(view, piece.role, piece.color);

      if (piece.captured || !piece.square) {
        const captureIndex = capturedCounts[piece.color];
        capturedCounts[piece.color] += 1;
        const capturedPosition = this.getCapturedPiecePosition(piece.color, captureIndex, view.baseY);
        view.activeObject.visible = true;

        const shouldAnimateCapture = !view.isCaptured && !this.animations.has(piece.id);

        if (shouldAnimateCapture) {
          this.animations.set(piece.id, {
            pieceId: piece.id,
            object: view.activeObject,
            start: view.activeObject.position.clone(),
            end: capturedPosition,
            elapsed: 0,
            duration: 0.32
          });
        } else if (!this.animations.has(piece.id)) {
          view.activeObject.position.copy(capturedPosition);
        }

        view.activeObject.quaternion.copy(view.baseQuaternion);
        view.currentSquare = null;
        view.isCaptured = true;
        continue;
      }

      const targetPosition = getSquarePosition(piece.square);
      const next = new THREE.Vector3(targetPosition.x, view.baseY, targetPosition.z);
      view.activeObject.visible = true;

      const shouldAnimate =
        animateMove !== null &&
        piece.square === animateMove.to &&
        view.currentSquare === animateMove.from &&
        !this.animations.has(piece.id);

      if (shouldAnimate) {
        this.animations.set(piece.id, {
          pieceId: piece.id,
          object: view.activeObject,
          start: view.activeObject.position.clone(),
          end: next,
          elapsed: 0,
          duration: 0.22
        });
      } else if (!this.animations.has(piece.id)) {
        view.activeObject.position.copy(next);
      }

      view.activeObject.quaternion.copy(view.baseQuaternion);
      view.currentSquare = piece.square;
      view.isCaptured = false;
    }
  }

  dispose() {
    cancelAnimationFrame(this.frameHandle);
    this.controls.dispose();
    this.renderer.domElement.removeEventListener("pointerdown", this.handlePointerDown);
    this.renderer.dispose();
    window.removeEventListener("resize", this.handleResize);
    this.mount.removeChild(this.renderer.domElement);
  }

  private addLights() {
    const ambient = new THREE.HemisphereLight("#f8ebcf", "#24160a", 1.2);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight("#ffe6b8", 1.8);
    key.position.set(-0.3, 0.65, 0.28);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.1;
    key.shadow.camera.far = 2;
    key.shadow.camera.left = -0.5;
    key.shadow.camera.right = 0.5;
    key.shadow.camera.top = 0.5;
    key.shadow.camera.bottom = -0.5;
    this.scene.add(key);

    const rim = new THREE.PointLight("#d8904f", 1.1, 2.5);
    rim.position.set(0.36, 0.2, -0.24);
    this.scene.add(rim);
  }

  private addSquareTargets() {
    const geometry = new THREE.PlaneGeometry(SQUARE_SIZE, SQUARE_SIZE);

    for (const square of ALL_SQUARES) {
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          color: this.isLightSquare(square) ? "#efd9b2" : "#7a5736",
          opacity: 0.08,
          transparent: true
        })
      );
      const position = getSquarePosition(square);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(position.x, BOARD_SURFACE_Y, position.z);
      mesh.userData.square = square;
      this.squareMeshes.set(square, mesh);
      this.scene.add(mesh);
    }
  }

  private ensureRoleMesh(view: PieceView, role: PieceRole, color: GamePieceState["color"]) {
    if (!this.registry || view.currentRole === role) {
      return;
    }

    if (role === view.descriptor.role) {
      if (view.promotionClone) {
        this.scene.remove(view.promotionClone);
        view.promotionClone = null;
      }
      view.baseObject.visible = true;
      view.activeObject = view.baseObject;
      view.currentRole = role;
      return;
    }

    if (!view.promotionClone) {
      const template = this.registry.templates.get(getTemplateKey(color, role));
      if (!template) {
        return;
      }

      view.promotionClone = template.clone(true);
      view.promotionClone.name = `${view.descriptor.nodeName}:${role}:promotion`;
      view.promotionClone.visible = true;
      this.scene.add(view.promotionClone);
    }

    view.baseObject.visible = false;
    view.activeObject = view.promotionClone;
    view.currentRole = role;
  }

  private isLightSquare(square: SquareId) {
    const fileCode = square.charCodeAt(0) - 97;
    const rank = Number(square[1]) - 1;
    return (fileCode + rank) % 2 === 0;
  }

  private handleResize = () => {
    const { clientWidth, clientHeight } = this.mount;
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight);
  };

  private handlePointerDown = (event: PointerEvent) => {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    this.pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const hits = this.raycaster.intersectObjects([...this.squareMeshes.values()], false);
    const square = hits[0]?.object.userData.square as SquareId | undefined;

    if (square) {
      this.onSquareSelect?.(square);
    }
  };

  private start() {
    const render = () => {
      const delta = this.clock.getDelta();
      this.controls.update();
      this.updateAnimations(delta);
      this.renderer.render(this.scene, this.camera);
      this.frameHandle = requestAnimationFrame(render);
    };

    render();
  }

  private updateAnimations(delta: number) {
    for (const [pieceId, animation] of this.animations) {
      animation.elapsed += delta;
      const progress = Math.min(animation.elapsed / animation.duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      animation.object.position.lerpVectors(animation.start, animation.end, eased);
      animation.object.position.y += Math.sin(progress * Math.PI) * 0.01;

      if (progress >= 1) {
        animation.object.position.copy(animation.end);
        this.animations.delete(pieceId);
      }
    }
  }

  private getCapturedPiecePosition(
    color: GamePieceState["color"],
    index: number,
    baseY: number
  ) {
    const columns = 4;
    const spacingX = 0.05;
    const spacingZ = 0.034;
    const row = Math.floor(index / columns);
    const column = index % columns;
    const x = 0.155 - row * spacingX;
    const zStart = color === "white" ? 0.18 : -0.18;
    const zDirection = color === "white" ? -1 : 1;
    const z = zStart + column * spacingZ * zDirection;

    return new THREE.Vector3(x, baseY, z);
  }
}
