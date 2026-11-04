import { Chess } from "chess.js";

/**
 * A lightweight time manager for Impossible. Stockfish stays the sole authority
 * for the actual move; this planner only decides how long it may search.
 *
 * Both /api/engine and the browser fallback cap a single main search:
 * cloud at 6000ms and local at 8000ms, so never request more than 6000ms.
 */
export interface ImpossibleSearchBudget {
  moveTimeMs: number;
  timeoutMs: number;
  hasForcingMoves: boolean;
}

export const planImpossibleSearch = (
  fen: string,
  remainingMs: number,
  moveCount: number,
  adaptiveBaseTimeMs: number
): ImpossibleSearchBudget => {
  const position = new Chess(fen);
  const moves = position.moves({ verbose: true });
  const forcingCount = moves.filter((move) =>
    Boolean(move.captured || move.promotion || move.san.includes("+") || move.san.includes("#"))
  ).length;
  const hasForcingMoves = position.inCheck() || forcingCount >= 3;

  // Retain time for the expected remainder of the game, rather than spending
  // many seconds per move when the chess clock is nearly empty.
  const expectedTurnsLeft = Math.max(10, 42 - Math.floor(moveCount / 2));
  const reserveMs = Math.max(4000, Math.min(60_000, remainingMs * 0.08));
  const fairShareMs = Math.max(0, (remainingMs - reserveMs) / expectedTurnsLeft);

  // More time for tactical positions; quiet moves also get a healthy budget.
  const desiredMs = adaptiveBaseTimeMs * (hasForcingMoves ? 1.35 : 1.08);
  const availableMs = Math.max(150, remainingMs - 600);
  const moveTimeMs = Math.max(
    150,
    Math.min(6000, Math.round(desiredMs), Math.max(150, Math.round(fairShareMs)), Math.round(availableMs))
  );

  // The request has transport/processing overhead and can fail over to WASM.
  // Cap it well below the 15-minute clock and under the remote 8s limit.
  const timeoutMs = Math.max(700, Math.min(7800, moveTimeMs + 1600, remainingMs - 200));

  return { moveTimeMs, timeoutMs, hasForcingMoves };
};
