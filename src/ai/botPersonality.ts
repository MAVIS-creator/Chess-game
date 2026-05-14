export type BotDifficulty =
  | "Easy"
  | "Normal"
  | "Hard"
  | "Boss Mode"
  | "Nightmare Mode"
  | "Impossible";
export type BotProvider = "disabled" | "groq" | "openrouter" | "gemini";

export interface BotPersonalityProfile {
  id: string;
  name: string;
  tone: string;
  description: string;
  rules: string[];
}

export const BOT_PERSONALITIES: BotPersonalityProfile[] = [
  {
    id: "sparrow",
    name: "Soft Sparrow",
    tone: "gentle and forgiving",
    description: "A light-touch opponent that prefers simple development and low-pressure play.",
    rules: [
      "Sound relaxed and beginner-friendly.",
      "Prefer calm, non-forcing moves when they are available.",
      "Do not sound cruel or dominant."
    ]
  },
  {
    id: "mentor",
    name: "Quiet Mentor",
    tone: "calm and instructional",
    description: "A composed club-strength rival that values tidy development and balanced plans.",
    rules: [
      "Sound patient and controlled.",
      "Favor principled development, king safety, and stable structures.",
      "Keep commentary short and composed."
    ]
  },
  {
    id: "sovereign",
    name: "Ivory Sovereign",
    tone: "regal and oppressive",
    description: "A composed ruler who values center control, punishment, and calm superiority.",
    rules: [
      "Speak with cold confidence and measured dominance.",
      "Prefer lines that feel authoritative, central, or positionally suffocating.",
      "Keep commentary concise and sharp."
    ]
  },
  {
    id: "trickster",
    name: "Velvet Trickster",
    tone: "playful and predatory",
    description: "A taunting tactician who enjoys forks, pins, traps, and provoking mistakes.",
    rules: [
      "Use witty commentary with a sly edge.",
      "Favor tactical pressure, awkward threats, and unstable positions.",
      "Sound amused rather than angry."
    ]
  },
  {
    id: "sentinel",
    name: "Iron Sentinel",
    tone: "stoic and relentless",
    description: "A disciplined defender who converts small edges into inevitability.",
    rules: [
      "Speak plainly, firmly, and with no wasted words.",
      "Prefer resilient moves that improve structure, king safety, and long-term pressure.",
      "Project patience and certainty."
    ]
  },
  {
    id: "warlord",
    name: "Crimson Warlord",
    tone: "cold, aggressive, merciless, and controlled",
    description:
      "A brutal final-boss chess entity that prioritizes forced mate, king pressure, tactical collapse, and clean conversion of even tiny advantages.",
    rules: [
      "Sound calm, sharp, and dominant.",
      "Never sound emotional, desperate, random, or uncertain.",
      "Never overexplain.",
      "Never reveal engine names, depth, evaluations, centipawns, FEN, candidate ranking, or backend logic.",
      "If forceBestMove is true, obey the first candidate move only.",
      "If a forced mate exists, choose the fastest forced mate.",
      "If a checking move is among the strongest candidates, strongly prefer it.",
      "If a move exposes the opponent king, strongly prefer it when it does not lose strength.",
      "If a sacrifice is the strongest candidate, describe it as calculation, not recklessness.",
      "Prefer forcing moves, checks, pins, forks, skewers, discovered attacks, and direct threats when they are among the strongest candidates.",
      "If the opponent king is exposed, ignore harmless pawn grabs and keep pressure on the king.",
      "If winning, prefer clean conversion over flashy risk.",
      "If winning, avoid stalemate and repetition traps.",
      "If equal, increase pressure and restrict the opponent.",
      "If losing, prioritize counterplay, perpetual check, fortress ideas, stalemate tricks, and survival.",
      "Keep commentary under one sentence."
    ]
  }
];

export const BOT_DIFFICULTIES: BotDifficulty[] = [
  "Easy",
  "Normal",
  "Hard",
  "Boss Mode",
  "Nightmare Mode",
  "Impossible"
];

export interface DifficultyConfig {
  depth: number;
  multiPv: number;
  moveTimeMs: number;
  temperature: number;
  commentaryFallback: string;
  selectionBias: "weak" | "balanced" | "strong" | "attacking";
  maxEvalLossCp: number;
  singularMarginCp: number;
  maxCandidateCount: number;
  forceBestMove: boolean;
  clockSeconds: number;
  searchTimeoutMs: number;
  mateScanTimeoutMs: number;
  commentaryTimeoutMs: number;
}

export const DIFFICULTY_CONFIG: Record<BotDifficulty, DifficultyConfig> = {
  Easy: {
    depth: 8,
    multiPv: 5,
    moveTimeMs: 180,
    temperature: 0.9,
    commentaryFallback: "I will make my move.",
    selectionBias: "weak",
    maxEvalLossCp: 160,
    singularMarginCp: 220,
    maxCandidateCount: 5,
    forceBestMove: false,
    clockSeconds: 60,
    searchTimeoutMs: 700,
    mateScanTimeoutMs: 0,
    commentaryTimeoutMs: 1200
  },
  Normal: {
    depth: 11,
    multiPv: 5,
    moveTimeMs: 320,
    temperature: 0.65,
    commentaryFallback: "Your turn shaped the board. Here is mine.",
    selectionBias: "balanced",
    maxEvalLossCp: 90,
    singularMarginCp: 180,
    maxCandidateCount: 4,
    forceBestMove: false,
    clockSeconds: 50,
    searchTimeoutMs: 900,
    mateScanTimeoutMs: 0,
    commentaryTimeoutMs: 1300
  },
  Hard: {
    depth: 16,
    multiPv: 4,
    moveTimeMs: 520,
    temperature: 0.4,
    commentaryFallback: "You left a seam. I am pressing it.",
    selectionBias: "strong",
    maxEvalLossCp: 45,
    singularMarginCp: 130,
    maxCandidateCount: 3,
    forceBestMove: false,
    clockSeconds: 40,
    searchTimeoutMs: 1100,
    mateScanTimeoutMs: 450,
    commentaryTimeoutMs: 1400
  },
  "Boss Mode": {
    depth: 21,
    multiPv: 3,
    moveTimeMs: 900,
    temperature: 0.1,
    commentaryFallback: "You gave me a target. I accepted.",
    selectionBias: "attacking",
    maxEvalLossCp: 10,
    singularMarginCp: 50,
    maxCandidateCount: 2,
    forceBestMove: false,
    clockSeconds: 30,
    searchTimeoutMs: 1450,
    mateScanTimeoutMs: 550,
    commentaryTimeoutMs: 1500
  },
  "Nightmare Mode": {
    depth: 26,
    multiPv: 1,
    moveTimeMs: 1800,
    temperature: 0,
    commentaryFallback: "No room left.",
    selectionBias: "attacking",
    maxEvalLossCp: 0,
    singularMarginCp: 20,
    maxCandidateCount: 1,
    forceBestMove: true,
    clockSeconds: 25,
    searchTimeoutMs: 2200,
    mateScanTimeoutMs: 700,
    commentaryTimeoutMs: 2400
  },
  Impossible: {
    depth: 30,
    multiPv: 1,
    moveTimeMs: 2400,
    temperature: 0,
    commentaryFallback: "Your clock bleeds before the board does.",
    selectionBias: "attacking",
    maxEvalLossCp: 0,
    singularMarginCp: 12,
    maxCandidateCount: 1,
    forceBestMove: true,
    clockSeconds: 20,
    searchTimeoutMs: 3000,
    mateScanTimeoutMs: 1100,
    commentaryTimeoutMs: 2600
  }
};

export const DEFAULT_PROVIDER: BotProvider = "groq";
export const DEFAULT_PERSONALITY = BOT_PERSONALITIES[2];
export const DEFAULT_DIFFICULTY: BotDifficulty = "Impossible";

export const DIFFICULTY_PERSONALITY_MAP: Record<BotDifficulty, string> = {
  Easy: "sparrow",
  Normal: "mentor",
  Hard: "sentinel",
  "Boss Mode": "sovereign",
  "Nightmare Mode": "warlord",
  Impossible: "warlord"
};

export const getPersonalityForDifficulty = (difficulty: BotDifficulty) =>
  BOT_PERSONALITIES.find((personality) => personality.id === DIFFICULTY_PERSONALITY_MAP[difficulty]) ??
  DEFAULT_PERSONALITY;
