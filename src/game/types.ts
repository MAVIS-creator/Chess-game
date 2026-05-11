export const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
export const RANKS = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;

export type FileKey = (typeof FILES)[number];
export type RankKey = (typeof RANKS)[number];
export type SquareId = `${FileKey}${RankKey}`;

export type PieceColor = "white" | "black";
export type PieceRole = "pawn" | "rook" | "knight" | "bishop" | "queen" | "king";

export interface PieceDescriptor {
  color: PieceColor;
  role: PieceRole;
  nodeName: string;
  square: SquareId;
}

export interface SquareInfo {
  id: SquareId;
  file: FileKey;
  rank: RankKey;
}
