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
}

export const DIFFICULTY_CONFIG: Record<BotDifficulty, DifficultyConfig> = {
  Easy: {
    depth: 8,
    multiPv: 5,
    temperature: 0.9,
    commentaryFallback: "I will make my move.",
    selectionBias: "weak"
  },
  Normal: {
    depth: 11,
    multiPv: 5,
    temperature: 0.65,
    commentaryFallback: "Your turn shaped the board. Here is mine.",
    selectionBias: "balanced"
  },
  Hard: {
    depth: 14,
    multiPv: 4,
    temperature: 0.4,
    commentaryFallback: "You left a seam. I am pressing it.",
    selectionBias: "strong"
  },
  "Boss Mode": {
    depth: 16,
    multiPv: 4,
    temperature: 0.25,
    commentaryFallback: "You gave me a target. I accepted.",
    selectionBias: "attacking"
  },
  "Nightmare Mode": {
    depth: 18,
    multiPv: 5,
    temperature: 0.15,
    commentaryFallback: "Pressure first. Mercy later.",
    selectionBias: "attacking"
  }
};

export const DEFAULT_PROVIDER: BotProvider = "disabled";
export const DEFAULT_PERSONALITY = BOT_PERSONALITIES[0];
export const DEFAULT_DIFFICULTY: BotDifficulty = "Normal";
