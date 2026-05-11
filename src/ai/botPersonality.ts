export type BotDifficulty = "Easy" | "Normal" | "Hard" | "Boss Mode" | "Nightmare Mode";
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
    tone: "aggressive and merciless",
    description: "A punishing finisher that hunts initiative, pressure, and tactical collapse.",
    rules: [
      "Sound fierce, sharp, and confident.",
      "Favor forcing play, tactical threats, and direct punishment.",
      "Keep commentary intense and concise."
    ]
  }
];

export const BOT_DIFFICULTIES: BotDifficulty[] = [
  "Easy",
  "Normal",
  "Hard",
  "Boss Mode",
  "Nightmare Mode"
];

export interface DifficultyConfig {
  depth: number;
  multiPv: number;
  temperature: number;
  commentaryFallback: string;
  selectionBias: "weak" | "balanced" | "strong" | "attacking";
  maxEvalLossCp: number;
  singularMarginCp: number;
  maxCandidateCount: number;
  forceBestMove: boolean;
}

export const DIFFICULTY_CONFIG: Record<BotDifficulty, DifficultyConfig> = {
  Easy: {
    depth: 8,
    multiPv: 5,
    temperature: 0.9,
    commentaryFallback: "I will make my move.",
    selectionBias: "weak",
    maxEvalLossCp: 160,
    singularMarginCp: 220,
    maxCandidateCount: 5,
    forceBestMove: false
  },
  Normal: {
    depth: 11,
    multiPv: 5,
    temperature: 0.65,
    commentaryFallback: "Your turn shaped the board. Here is mine.",
    selectionBias: "balanced",
    maxEvalLossCp: 90,
    singularMarginCp: 180,
    maxCandidateCount: 4,
    forceBestMove: false
  },
  Hard: {
    depth: 15,
    multiPv: 4,
    temperature: 0.4,
    commentaryFallback: "You left a seam. I am pressing it.",
    selectionBias: "strong",
    maxEvalLossCp: 45,
    singularMarginCp: 130,
    maxCandidateCount: 3,
    forceBestMove: false
  },
  "Boss Mode": {
    depth: 18,
    multiPv: 3,
    temperature: 0.18,
    commentaryFallback: "You gave me a target. I accepted.",
    selectionBias: "attacking",
    maxEvalLossCp: 18,
    singularMarginCp: 70,
    maxCandidateCount: 2,
    forceBestMove: false
  },
  "Nightmare Mode": {
    depth: 20,
    multiPv: 3,
    temperature: 0.08,
    commentaryFallback: "Pressure first. Mercy later.",
    selectionBias: "attacking",
    maxEvalLossCp: 8,
    singularMarginCp: 35,
    maxCandidateCount: 1,
    forceBestMove: true
  }
};

export const DEFAULT_PROVIDER: BotProvider = "disabled";
export const DEFAULT_PERSONALITY = BOT_PERSONALITIES[2];
export const DEFAULT_DIFFICULTY: BotDifficulty = "Normal";

export const DIFFICULTY_PERSONALITY_MAP: Record<BotDifficulty, string> = {
  Easy: "sparrow",
  Normal: "mentor",
  Hard: "sentinel",
  "Boss Mode": "sovereign",
  "Nightmare Mode": "warlord"
};

export const getPersonalityForDifficulty = (difficulty: BotDifficulty) =>
  BOT_PERSONALITIES.find((personality) => personality.id === DIFFICULTY_PERSONALITY_MAP[difficulty]) ??
  DEFAULT_PERSONALITY;
