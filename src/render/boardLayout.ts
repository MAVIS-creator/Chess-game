import { FILES, RANKS, type FileKey, type RankKey, type SquareId } from "../game/types";

const rankPositions: Record<RankKey, number> = {
  "1": -0.1238,
  "2": -0.0875,
  "3": -0.0512,
  "4": -0.0149,
  "5": 0.0214,
  "6": 0.0577,
  "7": 0.094,
  "8": 0.1303
};

const filePositions: Record<FileKey, number> = {
  a: 0.1233,
  b: 0.0874,
  c: 0.0523,
  d: 0.0172,
  e: -0.0179,
  f: -0.053,
  g: -0.0881,
  h: -0.1232
};

export const SQUARE_SIZE = 0.0359;
export const BOARD_SURFACE_Y = 0.0415;
export const PIECE_BASE_Y = 0.0399;

export const ALL_SQUARES = RANKS.flatMap((rank) =>
  FILES.map((file) => `${file}${rank}` as SquareId)
);

export const getSquarePosition = (square: SquareId) => {
  const [file, rank] = square.split("") as [FileKey, RankKey];

  return {
    x: rankPositions[rank],
    y: BOARD_SURFACE_Y,
    z: filePositions[file]
  };
};
