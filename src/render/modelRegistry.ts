import * as THREE from "three";
import type { PieceDescriptor, PieceRole, SquareId } from "../game/types";

export interface PieceView {
  descriptor: PieceDescriptor;
  baseObject: THREE.Object3D;
  activeObject: THREE.Object3D;
  baseQuaternion: THREE.Quaternion;
  baseY: number;
  promotionClone: THREE.Object3D | null;
  currentSquare: SquareId | null;
  currentRole: PieceRole;
}

export interface ModelRegistry {
  board: THREE.Object3D;
  pieceViews: Map<string, PieceView>;
  templates: Map<string, THREE.Object3D>;
}

const templateKey = (color: string, role: string) => `${color}:${role}`;
const sanitizeNodeName = (nodeName: string) => nodeName.replace(/[^\w]/g, "_");
const normalizeNodeName = (nodeName: string) => nodeName.replace(/[^a-z0-9]/gi, "").toLowerCase();

const prepareShadows = (object: THREE.Object3D) => {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
};

export const buildModelRegistry = (
  scene: THREE.Object3D,
  descriptors: PieceDescriptor[]
): ModelRegistry => {
  const board = scene.getObjectByName("ChessBoard_0");

  if (!board) {
    throw new Error("Chess board node was not found in the GLB.");
  }

  const pieceViews = new Map<string, PieceView>();
  const templates = new Map<string, THREE.Object3D>();

  for (const descriptor of descriptors) {
    const object =
      scene.getObjectByName(descriptor.nodeName) ??
      scene.getObjectByName(sanitizeNodeName(descriptor.nodeName)) ??
      findNodeByNormalizedName(scene, descriptor.nodeName);

    if (!object) {
      const similarNames: string[] = [];
      scene.traverse((node) => {
        if (node.name && node.name.toLowerCase().includes(descriptor.role)) {
          similarNames.push(node.name);
        }
      });
      throw new Error(`Missing piece node: ${descriptor.nodeName}. Similar loaded names: ${similarNames.slice(0, 8).join(", ")}`);
    }

    prepareShadows(object);

    pieceViews.set(descriptor.id, {
      descriptor,
      baseObject: object,
      activeObject: object,
      baseQuaternion: object.quaternion.clone(),
      baseY: object.position.y,
      promotionClone: null,
      currentSquare: descriptor.square,
      currentRole: descriptor.role
    });

    const key = templateKey(descriptor.color, descriptor.role);
    if (!templates.has(key)) {
      templates.set(key, object);
    }
  }

  return { board, pieceViews, templates };
};

export const getTemplateKey = templateKey;

const findNodeByNormalizedName = (scene: THREE.Object3D, nodeName: string) => {
  const target = normalizeNodeName(nodeName);
  let match: THREE.Object3D | null = null;

  scene.traverse((node) => {
    if (!match && node.name && normalizeNodeName(node.name) === target) {
      match = node;
    }
  });

  return match;
};
