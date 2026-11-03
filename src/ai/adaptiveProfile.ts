import { supabase } from "../auth/supabase";
import type { BotDifficulty } from "./botPersonality";

export interface AdaptiveProfile {
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  strongGames: number;
  experience: number;
  pressureIndex: number;
  endgamePrep: number;
  openingPrep: number;
}

export interface AdaptiveSearchPlan {
  moveTimeMs: number;
  extraMateDepth: number;
  openingPauseMs: number;
  finalizePauseMs: number;
}

export interface MatchHistoryEntry {
  playerId?: string | null;
  playerName: string;
  difficulty: BotDifficulty;
  result: "win" | "loss" | "draw";
  moveCount: number;
  statusText: string;
}

const DEFAULT_PROFILE: AdaptiveProfile = {
  gamesPlayed: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  strongGames: 0,
  experience: 0,
  pressureIndex: 0,
  endgamePrep: 0,
  openingPrep: 0
};

const difficultyWeight: Record<BotDifficulty, number> = {
  Easy: 1,
  Normal: 1,
  Hard: 2,
  "Boss Mode": 3,
  "Nightmare Mode": 4,
  Impossible: 5
};

const getAuthenticatedPlayerId = async () => {
  if (!supabase) {
    return null;
  }

  try {
    const {
      data: { session }
    } = await supabase.auth.getSession();
    return session?.user.id ?? null;
  } catch {
    return null;
  }
};

export const loadAdaptiveProfile = (): AdaptiveProfile => ({ ...DEFAULT_PROFILE });

export const recordAdaptiveResult = (
  profile: AdaptiveProfile,
  difficulty: BotDifficulty,
  result: "win" | "loss" | "draw"
) => {
  const next: AdaptiveProfile = {
    ...profile,
    gamesPlayed: profile.gamesPlayed + 1,
    strongGames:
      profile.strongGames +
      (difficulty === "Hard" ||
      difficulty === "Boss Mode" ||
      difficulty === "Nightmare Mode" ||
      difficulty === "Impossible"
        ? 1
        : 0),
    experience: Math.min(80, profile.experience + difficultyWeight[difficulty]),
    pressureIndex: Math.min(40, profile.pressureIndex + (result === "loss" ? 2 : 1)),
    endgamePrep: Math.min(30, profile.endgamePrep + (result === "draw" ? 2 : 1)),
    openingPrep: Math.min(30, profile.openingPrep + difficultyWeight[difficulty])
  };

  if (result === "win") {
    next.wins += 1;
  } else if (result === "loss") {
    next.losses += 1;
  } else {
    next.draws += 1;
  }

  return next;
};

export const hydrateAdaptiveProfile = async () => {
  if (!supabase) {
    return { ...DEFAULT_PROFILE };
  }

  const playerId = await getAuthenticatedPlayerId();
  if (!playerId) {
    return { ...DEFAULT_PROFILE };
  }

  try {
    const { data, error } = await supabase
      .from("cedar_ai_profiles")
      .select("games_played,wins,losses,draws,strong_games,experience,pressure_index,endgame_prep,opening_prep")
      .eq("profile_key", playerId)
      .maybeSingle();

    if (error || !data) {
      return { ...DEFAULT_PROFILE };
    }

    return {
      gamesPlayed: data.games_played ?? 0,
      wins: data.wins ?? 0,
      losses: data.losses ?? 0,
      draws: data.draws ?? 0,
      strongGames: data.strong_games ?? 0,
      experience: data.experience ?? 0,
      pressureIndex: data.pressure_index ?? 0,
      endgamePrep: data.endgame_prep ?? 0,
      openingPrep: data.opening_prep ?? 0
    };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
};

export const persistAdaptiveProfile = async (profile: AdaptiveProfile) => {
  if (!supabase) {
    return;
  }

  const playerId = await getAuthenticatedPlayerId();
  if (!playerId) {
    return;
  }

  try {
    const { error } = await supabase.from("cedar_ai_profiles").upsert(
      {
        profile_key: playerId,
        games_played: profile.gamesPlayed,
        wins: profile.wins,
        losses: profile.losses,
        draws: profile.draws,
        strong_games: profile.strongGames,
        experience: profile.experience,
        pressure_index: profile.pressureIndex,
        endgame_prep: profile.endgamePrep,
        opening_prep: profile.openingPrep,
        updated_at: new Date().toISOString()
      },
      { onConflict: "profile_key" }
    );

    if (error) {
      console.error("Failed to sync adaptive profile", error);
    }
  } catch {
    // Adaptive memory is best-effort; gameplay remains available.
  }
};

export const persistMatchHistory = async (entry: MatchHistoryEntry) => {
  if (!supabase || !entry.playerId) {
    return;
  }

  try {
    const { error } = await supabase.from("cedar_match_history").insert({
      player_id: entry.playerId,
      player_name: entry.playerName,
      difficulty: entry.difficulty,
      result: entry.result,
      move_count: entry.moveCount,
      status_text: entry.statusText,
      created_at: new Date().toISOString()
    });

    if (error) {
      console.error("Failed to write match history", error);
    }
  } catch {
    // History sync is best-effort.
  }
};

export const buildAdaptiveSearchPlan = (
  profile: AdaptiveProfile,
  difficulty: BotDifficulty,
  baseMoveTimeMs: number
): AdaptiveSearchPlan => {
  const experienceRatio = Math.min(1, profile.experience / 24);
  const strongRatio = Math.min(1, profile.strongGames / 12);
  const pressureRatio = Math.min(1, profile.pressureIndex / 20);
  const openingRatio = Math.min(1, profile.openingPrep / 18);
  const endgameRatio = Math.min(1, profile.endgamePrep / 18);

  if (difficulty === "Nightmare Mode" || difficulty === "Impossible") {
    return {
      moveTimeMs: Math.round(baseMoveTimeMs * (1 + pressureRatio * 0.08 + openingRatio * 0.06)),
      extraMateDepth: Math.min(3, Math.round((strongRatio + endgameRatio) * 3)),
      openingPauseMs: Math.max(90, Math.round(220 - experienceRatio * 110)),
      finalizePauseMs: Math.max(55, Math.round(140 - experienceRatio * 70))
    };
  }

  return {
    moveTimeMs: Math.round(baseMoveTimeMs * (1 + Math.max(0, pressureRatio * 0.03 - 0.02))),
    extraMateDepth: Math.min(2, Math.round((experienceRatio + endgameRatio) * 2)),
    openingPauseMs: Math.max(80, Math.round(180 - experienceRatio * 90)),
    finalizePauseMs: Math.max(45, Math.round(100 - experienceRatio * 45))
  };
};
