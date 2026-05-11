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
    const object = scene.getObjectByName(descriptor.nodeName);

    if (!object) {
      throw new Error(`Missing piece node: ${descriptor.nodeName}`);
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
