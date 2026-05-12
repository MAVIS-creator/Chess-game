import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

const readEnvFile = async () => {
  const raw = await readFile(new URL("../.env", import.meta.url), "utf8");
  const env = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    env[key] = value;
  }

  return env;
};

const commentarySchema = {
  type: "json_schema",
  json_schema: {
    name: "bot_commentary",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["commentary", "style"],
      properties: {
        commentary: { type: "string" },
        style: { type: "string" }
      }
    }
  }
};

const impossiblePrompt = JSON.stringify(
  {
    instructions: {
      role: "Comment on the bot's already selected move without changing it.",
      commentaryMode: "Vague intimidation only. No coaching, no explanation, no tactical hints."
    },
    actor: "bot",
    fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
    moveHistory: ["e2e4", "e7e5"],
    difficulty: "Impossible",
    selectedMove: "e7e5",
    candidateMoves: [{ move: "e7e5", label: "best", depth: 18 }]
  },
  null,
  2
);

const baseSystemPrompt =
  "You are the move-selection personality layer for a chess bot. Keep commentary short, vague, intimidating, and return only valid JSON.";

const callGroq = async (env) => {
  const started = performance.now();
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.VITE_GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: env.VITE_GROQ_MODEL || "llama-3.1-8b-instant",
      temperature: 0,
      response_format: commentarySchema,
      messages: [
        { role: "system", content: baseSystemPrompt },
        { role: "user", content: impossiblePrompt }
      ]
    })
  });

  const elapsedMs = Math.round(performance.now() - started);
  const text = await response.text();
  return { provider: "groq", ok: response.ok, elapsedMs, body: text };
};

const callOpenRouter = async (env) => {
  const started = performance.now();
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.VITE_OPENROUTER_API_KEY}`,
      "HTTP-Referer": "http://localhost",
      "X-Title": "Wooden Chess Provider Test"
    },
    body: JSON.stringify({
      model: env.VITE_OPENROUTER_MODEL || "openai/gpt-4.1",
      temperature: 0,
      response_format: commentarySchema,
      messages: [
        { role: "system", content: baseSystemPrompt },
        { role: "user", content: impossiblePrompt }
      ]
    })
  });

  const elapsedMs = Math.round(performance.now() - started);
  const text = await response.text();
  return { provider: "openrouter", ok: response.ok, elapsedMs, body: text };
};

const callGemini = async (env) => {
  const started = performance.now();
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${env.VITE_GEMINI_MODEL || "gemini-2.5-flash"}:generateContent?key=${env.VITE_GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json"
        },
        systemInstruction: {
          parts: [{ text: baseSystemPrompt }]
        },
        contents: [
          {
            role: "user",
            parts: [{ text: impossiblePrompt }]
          }
        ]
      })
    }
  );

  const elapsedMs = Math.round(performance.now() - started);
  const text = await response.text();
  return { provider: "gemini", ok: response.ok, elapsedMs, body: text };
};

const run = async () => {
  const env = await readEnvFile();
  const results = [];

  if (env.VITE_GROQ_API_KEY) {
    results.push(await callGroq(env));
  }

  if (env.VITE_OPENROUTER_API_KEY) {
    results.push(await callOpenRouter(env));
  }

  if (env.VITE_GEMINI_API_KEY) {
    results.push(await callGemini(env));
  }

  for (const result of results) {
    console.log(`\n[${result.provider}] ok=${result.ok} latency_ms=${result.elapsedMs}`);
    console.log(result.body);
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
