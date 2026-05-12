import type { BotDifficulty } from "./botPersonality";

const STORAGE_KEY = "cedar-chess-ai-adaptive-profile";

export interface AdaptiveProfile {
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  strongGames: number;
  experience: number;
}

export interface AdaptiveSearchPlan {
  moveTimeMs: number;
  extraMateDepth: number;
  openingPauseMs: number;
  finalizePauseMs: number;
}

const DEFAULT_PROFILE: AdaptiveProfile = {
  gamesPlayed: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  strongGames: 0,
  experience: 0
};

const difficultyWeight: Record<BotDifficulty, number> = {
  Easy: 1,
  Normal: 1,
  Hard: 2,
  "Boss Mode": 3,
  "Nightmare Mode": 4,
  Impossible: 5
};

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
      experience: parsed.experience ?? 0
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
    experience: Math.min(40, profile.experience + difficultyWeight[difficulty])
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

export const buildAdaptiveSearchPlan = (
  profile: AdaptiveProfile,
  difficulty: BotDifficulty,
  baseMoveTimeMs: number
): AdaptiveSearchPlan => {
  const experienceRatio = Math.min(1, profile.experience / 24);
  const strongRatio = Math.min(1, profile.strongGames / 12);

  if (difficulty === "Nightmare Mode" || difficulty === "Impossible") {
    return {
      moveTimeMs: Math.max(900, Math.round(baseMoveTimeMs * (1 - strongRatio * 0.08))),
      extraMateDepth: strongRatio >= 0.45 ? 1 : 0,
      openingPauseMs: Math.max(150, Math.round(320 - experienceRatio * 120)),
      finalizePauseMs: Math.max(90, Math.round(220 - experienceRatio * 90))
    };
  }

  return {
    moveTimeMs: Math.round(baseMoveTimeMs * (1 + experienceRatio * 0.12 + strongRatio * 0.08)),
    extraMateDepth: Math.min(2, Math.round(experienceRatio * 2)),
    openingPauseMs: Math.max(170, Math.round(320 - experienceRatio * 90)),
    finalizePauseMs: Math.max(110, Math.round(220 - experienceRatio * 70))
  };
};
