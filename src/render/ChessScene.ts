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
  private readonly squareIndicators = new Map<SquareId, THREE.Mesh>();
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
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
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
        this.tuneMeshMaterial(child);
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
    this.adjustZoom(-0.08);
    this.controls.update();
  }

  zoomOut() {
    this.adjustZoom(0.08);
    this.controls.update();
  }

  highlightSquares(
    selected: SquareId | null,
    legalTargets: SquareId[],
    lastMove: MoveSummary | null,
    checkedKingSquare: SquareId | null = null
  ) {
    const legalSet = new Set(legalTargets);

    for (const [square, mesh] of this.squareMeshes) {
      const material = mesh.material as THREE.MeshBasicMaterial;
      const indicator = this.squareIndicators.get(square);

      if (selected === square) {
        material.color.set("#f3d67d");
        material.opacity = 0.26;
        if (indicator) {
          indicator.visible = true;
          (indicator.material as THREE.MeshBasicMaterial).color.set("#f6d978");
          (indicator.material as THREE.MeshBasicMaterial).opacity = 0.92;
          indicator.scale.setScalar(1.08);
        }
      } else if (legalSet.has(square)) {
        material.color.set("#6ebb7b");
        material.opacity = 0.18;
        if (indicator) {
          indicator.visible = true;
          (indicator.material as THREE.MeshBasicMaterial).color.set("#63d879");
          (indicator.material as THREE.MeshBasicMaterial).opacity = 0.95;
          indicator.scale.setScalar(0.74);
        }
      } else if (checkedKingSquare === square) {
        material.color.set("#d96464");
        material.opacity = 0.28;
        if (indicator) {
          indicator.visible = true;
          (indicator.material as THREE.MeshBasicMaterial).color.set("#ff6868");
          (indicator.material as THREE.MeshBasicMaterial).opacity = 0.98;
          indicator.scale.setScalar(0.92);
        }
      } else if (lastMove && (lastMove.from === square || lastMove.to === square)) {
        material.color.set("#d6a05c");
        material.opacity = 0.24;
        if (indicator) {
          indicator.visible = true;
          (indicator.material as THREE.MeshBasicMaterial).color.set("#e4a95b");
          (indicator.material as THREE.MeshBasicMaterial).opacity = 0.42;
          indicator.scale.setScalar(0.58);
        }
      } else if (this.isLightSquare(square)) {
        material.color.set("#efd9b2");
        material.opacity = 0.08;
        if (indicator) {
          indicator.visible = false;
        }
      } else {
        material.color.set("#7a5736");
        material.opacity = 0.08;
        if (indicator) {
          indicator.visible = false;
        }
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

    const key = new THREE.DirectionalLight("#ffe6b8", 2.15);
    key.position.set(-0.22, 0.72, 0.22);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.1;
    key.shadow.camera.far = 2;
    key.shadow.camera.left = -0.5;
    key.shadow.camera.right = 0.5;
    key.shadow.camera.top = 0.5;
    key.shadow.camera.bottom = -0.5;
    this.scene.add(key);

    const fill = new THREE.PointLight("#f7c78c", 0.85, 2.2);
    fill.position.set(0.15, 0.26, 0.24);
    this.scene.add(fill);

    const rim = new THREE.PointLight("#d8904f", 1.25, 2.8);
    rim.position.set(0.36, 0.2, -0.24);
    this.scene.add(rim);
  }

  private addSquareTargets() {
    const geometry = new THREE.PlaneGeometry(SQUARE_SIZE, SQUARE_SIZE);
    const markerGeometry = new THREE.CircleGeometry(SQUARE_SIZE * 0.22, 32);

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

      const indicator = new THREE.Mesh(
        markerGeometry,
        new THREE.MeshBasicMaterial({
          color: "#63d879",
          transparent: true,
          opacity: 0.92
        })
      );
      indicator.rotation.x = -Math.PI / 2;
      indicator.position.set(position.x, BOARD_SURFACE_Y + 0.0016, position.z);
      indicator.visible = false;
      this.squareIndicators.set(square, indicator);
      this.scene.add(indicator);
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

  private adjustZoom(delta: number) {
    const offset = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    const currentDistance = offset.length();
    const nextDistance = THREE.MathUtils.clamp(
      currentDistance + delta,
      this.controls.minDistance,
      this.controls.maxDistance
    );

    if (Math.abs(nextDistance - currentDistance) < 0.0001) {
      return;
    }

    offset.setLength(nextDistance);
    this.camera.position.copy(this.controls.target).add(offset);
  }

  private tuneMeshMaterial(mesh: THREE.Mesh) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial)) {
        continue;
      }

      material.roughness = Math.max(0.22, material.roughness * 0.88);
      material.metalness = Math.min(0.08, material.metalness);
      material.envMapIntensity = 0.95;

      const textures = [
        material.map,
        material.normalMap,
        material.roughnessMap,
        material.metalnessMap,
        material.aoMap
      ];

      for (const texture of textures) {
        if (!texture) {
          continue;
        }

        texture.colorSpace = texture === material.map ? THREE.SRGBColorSpace : texture.colorSpace;
        texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        texture.needsUpdate = true;
      }

      material.needsUpdate = true;
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
