import type { PieceDescriptor, SquareId } from "./types";

const makeSquare = (file: string, rank: string) => `${file}${rank}` as SquareId;

const whiteBackRank: PieceDescriptor[] = [
  { id: "WhiteRook_6", color: "white", role: "rook", nodeName: "WhiteRook_6", square: "a1" },
  { id: "WhiteKnight_3", color: "white", role: "knight", nodeName: "WhiteKnight_3", square: "b1" },
  { id: "WhiteBishop_8", color: "white", role: "bishop", nodeName: "WhiteBishop_8", square: "c1" },
  { id: "WhiteQueen_5", color: "white", role: "queen", nodeName: "WhiteQueen_5", square: "d1" },
  { id: "WhiteKing_10", color: "white", role: "king", nodeName: "WhiteKing_10", square: "e1" },
  { id: "WhiteBishop.001_15", color: "white", role: "bishop", nodeName: "WhiteBishop.001_15", square: "f1" },
  { id: "WhiteKnight.001_16", color: "white", role: "knight", nodeName: "WhiteKnight.001_16", square: "g1" },
  { id: "WhiteRook.001_17", color: "white", role: "rook", nodeName: "WhiteRook.001_17", square: "h1" }
];

const whitePawns: PieceDescriptor[] = [
  "WhitePawn_1",
  "WhitePawn.001_18",
  "WhitePawn.002_19",
  "WhitePawn.003_20",
  "WhitePawn.004_21",
  "WhitePawn.005_22",
  "WhitePawn.006_23",
  "WhitePawn.007_24"
].map((nodeName, index) => ({
  id: nodeName,
  color: "white" as const,
  role: "pawn" as const,
  nodeName,
  square: makeSquare(String.fromCharCode(97 + index), "2")
}));

const blackBackRank: PieceDescriptor[] = [
  { id: "BlackRook.001_14", color: "black", role: "rook", nodeName: "BlackRook.001_14", square: "a8" },
  { id: "BlackKnight.001_13", color: "black", role: "knight", nodeName: "BlackKnight.001_13", square: "b8" },
  { id: "BlackBishop.001_12", color: "black", role: "bishop", nodeName: "BlackBishop.001_12", square: "c8" },
  { id: "BlackQueen_7", color: "black", role: "queen", nodeName: "BlackQueen_7", square: "d8" },
  { id: "BlackKing_11", color: "black", role: "king", nodeName: "BlackKing_11", square: "e8" },
  { id: "BlackBishop_4", color: "black", role: "bishop", nodeName: "BlackBishop_4", square: "f8" },
  { id: "BlackKnight_9", color: "black", role: "knight", nodeName: "BlackKnight_9", square: "g8" },
  { id: "BlackRook_2", color: "black", role: "rook", nodeName: "BlackRook_2", square: "h8" }
];

const blackPawns: PieceDescriptor[] = [
  "BlackPawn.007_25",
  "BlackPawn.001_26",
  "BlackPawn.002_27",
  "BlackPawn.003_28",
  "BlackPawn.004_29",
  "BlackPawn.005_30",
  "BlackPawn.006_31",
  "BlackPawn.008_32"
].map((nodeName, index) => ({
  id: nodeName,
  color: "black" as const,
  role: "pawn" as const,
  nodeName,
  square: makeSquare(String.fromCharCode(97 + index), "7")
}));

export const INITIAL_PIECES: PieceDescriptor[] = [
  ...whiteBackRank,
  ...whitePawns,
  ...blackPawns,
  ...blackBackRank
];
