import * as THREE from "three";
import type { PieceDescriptor, SquareId } from "../game/types";

export interface PieceRuntime {
  descriptor: PieceDescriptor;
  object: THREE.Object3D;
  originalQuaternion: THREE.Quaternion;
}

export interface ModelRegistry {
  board: THREE.Object3D;
  piecesBySquare: Map<SquareId, PieceRuntime>;
}

export const buildModelRegistry = (
  scene: THREE.Object3D,
  descriptors: PieceDescriptor[]
): ModelRegistry => {
  const board = scene.getObjectByName("ChessBoard_0");

  if (!board) {
    throw new Error("Chess board node was not found in the GLB.");
  }

  const piecesBySquare = new Map<SquareId, PieceRuntime>();

  for (const descriptor of descriptors) {
    const object = scene.getObjectByName(descriptor.nodeName);

    if (!object) {
      throw new Error(`Missing piece node: ${descriptor.nodeName}`);
    }

    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    piecesBySquare.set(descriptor.square, {
      descriptor,
      object,
      originalQuaternion: object.quaternion.clone()
    });
  }

  return { board, piecesBySquare };
};
