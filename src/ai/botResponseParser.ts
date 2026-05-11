import type { EngineCandidateMove } from "../engine/candidateMoves";

export interface ParsedBotResponse {
  selectedMove: string;
  commentary: string;
  style: string;
}

const stripCodeFences = (raw: string) => raw.replace(/^```(?:json)?\s*|\s*```$/gim, "").trim();

export const parseBotResponse = (
  raw: string,
  candidateMoves: EngineCandidateMove[]
): ParsedBotResponse | null => {
  try {
    const parsed = JSON.parse(stripCodeFences(raw)) as Partial<ParsedBotResponse>;
    const candidateSet = new Set(candidateMoves.map((candidate) => candidate.move));

    if (!parsed.selectedMove || typeof parsed.selectedMove !== "string") {
      return null;
    }

    if (!candidateSet.has(parsed.selectedMove)) {
      return null;
    }

    return {
      selectedMove: parsed.selectedMove,
      commentary:
        typeof parsed.commentary === "string" && parsed.commentary.trim().length > 0
          ? parsed.commentary.trim()
          : "A move, then silence.",
      style:
        typeof parsed.style === "string" && parsed.style.trim().length > 0
          ? parsed.style.trim()
          : "engine-backed"
    };
  } catch {
    return null;
  }
};
