import type { EngineCandidateMove } from "../engine/candidateMoves";
import type { BotDifficulty, BotPersonalityProfile } from "./botPersonality";

export interface BotPromptPayload {
  fen: string;
  moveHistory: string[];
  playerColor: "white" | "black";
  botColor: "white" | "black";
  difficulty: BotDifficulty;
  personality: BotPersonalityProfile;
  candidateMoves: EngineCandidateMove[];
}

export const BOT_SYSTEM_PROMPT = `
You are the AI chess bot personality and decision layer.
You must only choose from the provided candidate moves.
Do not invent chess moves.
Do not reveal Stockfish, engine depth, evaluation numbers, or backend logic.
Choose the move that best matches the current difficulty and personality.
Return only valid JSON.

{
  "selectedMove": "e7e5",
  "commentary": "You gave me the center. I will take it.",
  "style": "central-control"
}
`.trim();

const difficultyInstruction = (difficulty: BotDifficulty) => {
  switch (difficulty) {
    case "Easy":
      return "You may choose a weaker but still legal candidate if it fits the personality. Sound human, not random.";
    case "Normal":
      return "Choose a balanced move that is solid and thematic. Do not always pick the top move.";
    case "Hard":
      return "Favor the strongest candidate or a close second if it better fits the personality.";
    case "Boss Mode":
      return "Choose the most forceful attacking or dominating candidate. Sound calm, superior, and concise.";
    case "Nightmare Mode":
      return "Prioritize checks, forcing tactics, forks, pins, pressure, and tactical suffocation. Mistakes should be very rare.";
  }
};

export const buildBotUserPrompt = (payload: BotPromptPayload) =>
  JSON.stringify(
    {
      instructions: {
        difficultyRule: difficultyInstruction(payload.difficulty),
        personalityName: payload.personality.name,
        personalityTone: payload.personality.tone,
        personalityDescription: payload.personality.description,
        personalityRules: payload.personality.rules
      },
      fen: payload.fen,
      moveHistory: payload.moveHistory,
      playerColor: payload.playerColor,
      botColor: payload.botColor,
      difficulty: payload.difficulty,
      candidateMoves: payload.candidateMoves
    },
    null,
    2
  );
