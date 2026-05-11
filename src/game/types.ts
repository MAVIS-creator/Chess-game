export const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
export const RANKS = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;

export type FileKey = (typeof FILES)[number];
export type RankKey = (typeof RANKS)[number];
export type SquareId = `${FileKey}${RankKey}`;

export type PieceColor = "white" | "black";
export type PieceRole = "pawn" | "rook" | "knight" | "bishop" | "queen" | "king";

export interface BotHudState {
  difficulty: string;
  personalityId: string;
  personalityName: string;
  provider: string;
  commentary: string;
  thinking: boolean;
  thinkingStage: string | null;
  lastStyle: string;
  source: "stockfish" | "llm";
  playerName: string;
}

export interface PieceDescriptor {
  id: string;
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

export interface GamePieceState {
  id: string;
  color: PieceColor;
  role: PieceRole;
  square: SquareId | null;
  captured: boolean;
}

export interface MoveSummary {
  from: SquareId;
  to: SquareId;
}

export type MoveSoundCue = "move" | "capture";

export interface PromotionState {
  from: SquareId;
  to: SquareId;
}

export interface GameSnapshot {
  pieces: GamePieceState[];
  currentTurn: PieceColor;
  selectedSquare: SquareId | null;
  legalTargets: SquareId[];
  lastMove: MoveSummary | null;
  lastMoveSoundCue: MoveSoundCue | null;
  pendingPromotion: PromotionState | null;
  statusText: string;
  moveCount: number;
  inCheck: boolean;
  gameOver: boolean;
}
