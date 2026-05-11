import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { INITIAL_PIECES } from "../game/setup";
import type { SquareId } from "../game/types";
import { ALL_SQUARES, BOARD_SURFACE_Y, SQUARE_SIZE, getSquarePosition } from "./boardLayout";
import { buildModelRegistry, type ModelRegistry } from "./modelRegistry";

const ASSET_PATH = "/wooden_chess_set.glb";

export interface SceneLoadResult {
  registry: ModelRegistry;
  squareMeshes: Map<SquareId, THREE.Mesh>;
}

export class ChessScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly clock = new THREE.Clock();
  private readonly loader = new GLTFLoader();
  private readonly squareMeshes = new Map<SquareId, THREE.Mesh>();
  private frameHandle = 0;
  private registry: ModelRegistry | null = null;

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
    window.addEventListener("resize", this.handleResize);
  }

  async loadScene(): Promise<SceneLoadResult> {
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
      registry: this.registry,
      squareMeshes: this.squareMeshes
    };
  }

  dispose() {
    cancelAnimationFrame(this.frameHandle);
    this.controls.dispose();
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
    const lightMaterial = new THREE.MeshBasicMaterial({
      color: "#efd9b2",
      opacity: 0.08,
      transparent: true
    });
    const darkMaterial = new THREE.MeshBasicMaterial({
      color: "#7a5736",
      opacity: 0.08,
      transparent: true
    });
    const geometry = new THREE.PlaneGeometry(SQUARE_SIZE, SQUARE_SIZE);

    for (const square of ALL_SQUARES) {
      const mesh = new THREE.Mesh(
        geometry,
        this.isLightSquare(square) ? lightMaterial.clone() : darkMaterial.clone()
      );
      const position = getSquarePosition(square);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(position.x, BOARD_SURFACE_Y, position.z);
      mesh.userData.square = square;
      this.squareMeshes.set(square, mesh);
      this.scene.add(mesh);
    }
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

  private start() {
    const render = () => {
      const delta = this.clock.getDelta();
      this.controls.update();
      this.scene.rotation.y += 0;
      this.renderer.render(this.scene, this.camera);
      this.frameHandle = requestAnimationFrame(render);
      void delta;
    };

    render();
  }
}
