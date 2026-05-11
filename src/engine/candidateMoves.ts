import type { PieceRole } from "../game/types";

export interface EngineCandidateMove {
  move: string;
  score: number;
  depth: number;
  label: string;
  pv: string[];
  mateIn: number | null;
}

export interface RawEngineLine {
  depth: number;
  multipv: number;
  scoreCp: number | null;
  mateIn: number | null;
  pv: string[];
}

const labelForMove = (move: string, rank: number) => {
  if (rank === 1) {
    return "best";
  }

  const toFile = move[2];
  const toRank = move[3];

  if (["d", "e"].includes(toFile)) {
    return "central-control";
  }

  if (["c", "f"].includes(toFile) || ["3", "6"].includes(toRank)) {
    return "developing";
  }

  if (rank === 2) {
    return "aggressive";
  }

  return "solid";
};

const normalizedScore = (raw: RawEngineLine) => {
  if (raw.mateIn !== null) {
    return raw.mateIn > 0 ? 100000 - raw.mateIn : -100000 - raw.mateIn;
  }

  return raw.scoreCp ?? 0;
};

export const normalizeCandidateMoves = (lines: RawEngineLine[]): EngineCandidateMove[] =>
  [...lines]
    .filter((line) => line.pv.length > 0)
    .sort((left, right) => normalizedScore(right) - normalizedScore(left))
    .map((line, index) => ({
      move: line.pv[0],
      score: normalizedScore(line),
      depth: line.depth,
      label: labelForMove(line.pv[0], index + 1),
      pv: line.pv,
      mateIn: line.mateIn
    }));

export const promotionRoleFromUci = (uci: string): PieceRole | undefined => {
  const promotion = uci[4];
  switch (promotion) {
    case "q":
      return "queen";
    case "r":
      return "rook";
    case "b":
      return "bishop";
    case "n":
      return "knight";
    default:
      return undefined;
  }
};
