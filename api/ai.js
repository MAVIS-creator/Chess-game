import { allowRequest, requirePlayer, sendJson } from "./_auth.js";

const ALLOWED_PROVIDERS = new Set(["groq", "openrouter", "gemini"]);

const clampNumber = (value, min, max, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, numeric));
};

const decisionSchema = {
  type: "json_schema",
  json_schema: {
    name: "bot_move_choice",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["selectedMove", "commentary", "style"],
      properties: {
        selectedMove: { type: "string", pattern: "^[a-h][1-8][a-h][1-8][qrbn]?$" },
        commentary: { type: "string" },
        style: { type: "string" }
      }
    }
  }
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

const providerConfig = (provider) => {
  if (provider === "groq") {
    return {
      key: process.env.VITE_GROQ_API_KEY ?? "",
      model: process.env.VITE_GROQ_MODEL || "llama-3.1-8b-instant"
    };
  }

  if (provider === "openrouter") {
    return {
      key: process.env.VITE_OPENROUTER_API_KEY ?? "",
      model: process.env.VITE_OPENROUTER_MODEL || "openai/gpt-4.1"
    };
  }

  return {
    key: process.env.VITE_GEMINI_API_KEY ?? "",
    model: process.env.VITE_GEMINI_MODEL || "gemini-2.5-flash"
  };
};

const callOpenAiCompatible = async ({ provider, key, model, systemPrompt, userPrompt, temperature, mode, signal, origin }) => {
  const isGroq = provider === "groq";
  const response = await fetch(
    isGroq ? "https://api.groq.com/openai/v1/chat/completions" : "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        ...(isGroq
          ? {}
          : {
              "HTTP-Referer": origin || "https://cedar-chess.app",
              "X-Title": "Cedar Chess"
            })
      },
      body: JSON.stringify({
        model,
        temperature,
        response_format: mode === "decision" ? decisionSchema : commentarySchema,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      }),
      signal
    }
  );

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content ?? null;
};

const callGemini = async ({ key, model, systemPrompt, userPrompt, temperature, signal }) => {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        generationConfig: {
          temperature,
          responseMimeType: "application/json"
        },
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        contents: [
          {
            role: "user",
            parts: [{ text: userPrompt }]
          }
        ]
      }),
      signal
    }
  );

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  const user = await requirePlayer(req, res);
  if (!user) {
    return;
  }

  if (!allowRequest(user.id, "ai", 45, 60_000)) {
    return sendJson(res, 429, { error: "Too many AI requests." });
  }

  let payload;
  try {
    payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON." });
  }

  const provider = typeof payload.provider === "string" ? payload.provider : "";
  const mode = payload.mode === "decision" ? "decision" : "commentary";
  const systemPrompt = typeof payload.systemPrompt === "string" ? payload.systemPrompt : "";
  const userPrompt = typeof payload.userPrompt === "string" ? payload.userPrompt : "";

  if (!ALLOWED_PROVIDERS.has(provider)) {
    return sendJson(res, 400, { error: "Unsupported provider." });
  }

  if (!systemPrompt || !userPrompt || systemPrompt.length > 12_000 || userPrompt.length > 24_000) {
    return sendJson(res, 400, { error: "Prompt payload rejected." });
  }

  const config = providerConfig(provider);
  if (!config.key) {
    return sendJson(res, 503, { error: "Provider is not configured." });
  }

  const temperature = clampNumber(payload.temperature, 0, 1.2, 0.2);
  const timeoutMs = Math.round(clampNumber(payload.timeoutMs, 800, 6000, 2600));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const originHeader = Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin;
    const content =
      provider === "gemini"
        ? await callGemini({
            key: config.key,
            model: config.model,
            systemPrompt,
            userPrompt,
            temperature,
            signal: controller.signal
          })
        : await callOpenAiCompatible({
            provider,
            key: config.key,
            model: config.model,
            systemPrompt,
            userPrompt,
            temperature,
            mode,
            signal: controller.signal,
            origin: originHeader
          });

    if (!content || typeof content !== "string") {
      return sendJson(res, 502, { error: "Provider returned no usable response." });
    }

    return sendJson(res, 200, { content });
  } catch {
    return sendJson(res, 503, { error: "Provider request unavailable." });
  } finally {
    clearTimeout(timeout);
  }
}
