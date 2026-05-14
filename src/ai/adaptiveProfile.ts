import type { BotDifficulty } from "./botPersonality";

const STORAGE_KEY = "cedar-chess-ai-adaptive-profile";
const PROFILE_KEY = "global";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

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

const hasSupabaseConfig = () => Boolean(SUPABASE_URL && SUPABASE_KEY);

const supabaseHeaders = () => ({
  apikey: SUPABASE_KEY ?? "",
  Authorization: `Bearer ${SUPABASE_KEY ?? ""}`,
  "Content-Type": "application/json",
  Prefer: "return=minimal"
});

export const loadAdaptiveProfile = (): AdaptiveProfile => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_PROFILE };
    }

    const parsed = JSON.parse(raw) as Partial<AdaptiveProfile>;
    return {
      gamesPlayed: parsed.gamesPlayed ?? 0,
      wins: parsed.wins ?? 0,
      losses: parsed.losses ?? 0,
      draws: parsed.draws ?? 0,
      strongGames: parsed.strongGames ?? 0,
      experience: parsed.experience ?? 0,
      pressureIndex: parsed.pressureIndex ?? 0,
      endgamePrep: parsed.endgamePrep ?? 0,
      openingPrep: parsed.openingPrep ?? 0
    };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
};

const saveAdaptiveProfile = (profile: AdaptiveProfile) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Ignore storage failures and keep runtime behavior intact.
  }
};

export const recordAdaptiveResult = (
  profile: AdaptiveProfile,
  difficulty: BotDifficulty,
  result: "win" | "loss" | "draw"
) => {
  const next: AdaptiveProfile = {
    ...profile,
    gamesPlayed: profile.gamesPlayed + 1,
    strongGames:
      profile.strongGames + (difficulty === "Hard" || difficulty === "Boss Mode" || difficulty === "Nightmare Mode" || difficulty === "Impossible" ? 1 : 0),
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

  saveAdaptiveProfile(next);
  return next;
};

export const hydrateAdaptiveProfile = async () => {
  const localProfile = loadAdaptiveProfile();
  if (!hasSupabaseConfig()) {
    return localProfile;
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/cedar_ai_profiles?profile_key=eq.${PROFILE_KEY}&select=games_played,wins,losses,draws,strong_games,experience,pressure_index,endgame_prep,opening_prep&limit=1`,
      {
        headers: {
          apikey: SUPABASE_KEY ?? "",
          Authorization: `Bearer ${SUPABASE_KEY ?? ""}`
        }
      }
    );

    if (!response.ok) {
      return localProfile;
    }

    const rows = (await response.json()) as Array<{
      games_played: number;
      wins: number;
      losses: number;
      draws: number;
      strong_games: number;
      experience: number;
      pressure_index: number;
      endgame_prep: number;
      opening_prep: number;
    }>;

    const remote = rows[0];
    if (!remote) {
      return localProfile;
    }

    const merged: AdaptiveProfile = {
      gamesPlayed: Math.max(localProfile.gamesPlayed, remote.games_played ?? 0),
      wins: Math.max(localProfile.wins, remote.wins ?? 0),
      losses: Math.max(localProfile.losses, remote.losses ?? 0),
      draws: Math.max(localProfile.draws, remote.draws ?? 0),
      strongGames: Math.max(localProfile.strongGames, remote.strong_games ?? 0),
      experience: Math.max(localProfile.experience, remote.experience ?? 0),
      pressureIndex: Math.max(localProfile.pressureIndex, remote.pressure_index ?? 0),
      endgamePrep: Math.max(localProfile.endgamePrep, remote.endgame_prep ?? 0),
      openingPrep: Math.max(localProfile.openingPrep, remote.opening_prep ?? 0)
    };

    saveAdaptiveProfile(merged);
    return merged;
  } catch {
    return localProfile;
  }
};

export const persistAdaptiveProfile = async (profile: AdaptiveProfile) => {
  if (!hasSupabaseConfig()) {
    return;
  }

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/cedar_ai_profiles`, {
      method: "POST",
      headers: {
        ...supabaseHeaders(),
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify({
        profile_key: PROFILE_KEY,
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
      })
    });
  } catch {
    // Keep local profile even if network sync fails.
  }
};

export const persistMatchHistory = async (entry: MatchHistoryEntry) => {
  if (!hasSupabaseConfig()) {
    return;
  }

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/cedar_match_history`, {
      method: "POST",
      headers: supabaseHeaders(),
      body: JSON.stringify({
        player_name: entry.playerName,
        difficulty: entry.difficulty,
        result: entry.result,
        move_count: entry.moveCount,
        status_text: entry.statusText,
        created_at: new Date().toISOString()
      })
    });
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
