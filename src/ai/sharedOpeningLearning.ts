import { supabase } from "../auth/supabase";

type SharedOpeningStats = {
  games_seen: number;
  bot_wins: number;
  human_wins: number;
  draws: number;
};

/**
 * Returns a bounded search-time multiplier signal, never a chess move.
 * Raw player histories remain private via RLS. A server-maintained,
 * anonymized opening aggregate only becomes visible with 5+ contributors.
 */
export async function loadSharedOpeningPressure(moveHistory: string[]): Promise<number> {
  if (!supabase) return 0;

  const prefixLength = moveHistory.length >= 8 ? 8 : moveHistory.length >= 6 ? 6 : moveHistory.length >= 4 ? 4 : 0;
  if (!prefixLength) return 0;
  const line = moveHistory.slice(0, prefixLength);
  if (!line.every((move) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move))) return 0;

  try {
    const { data, error } = await supabase
      .from("cedar_shared_openings")
      .select("games_seen,bot_wins,human_wins,draws")
      .eq("line_key", line.join(" "))
      .maybeSingle();
    if (error || !data) return 0;

    const stats = data as SharedOpeningStats;
    if (!Number.isFinite(stats.games_seen) || stats.games_seen < 5) return 0;
    const humanWinRate = Math.max(0, Math.min(1, stats.human_wins / stats.games_seen));

    // Search harder only where multiple *different* players historically
    // managed to beat Cedar from the same opening prefix.
    return humanWinRate > 0.3 ? Math.min(0.2, (humanWinRate - 0.3) * 0.4) : 0;
  } catch {
    return 0; // Gameplay and Stockfish must never depend on shared stats.
  }
}
