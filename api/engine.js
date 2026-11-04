import { allowRequest, requirePlayer, sendJson } from "./_auth.js";

const DEFAULT_ENGINE_URL = "https://chatgpt-stockfish-567370443508.us-central1.run.app";

const clampInt = (value, min, max, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(numeric)));
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

  if (!allowRequest(user.id, "engine", 90, 60_000)) {
    return sendJson(res, 429, { error: "Too many engine requests." });
  }

  let payload;
  try {
    payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON." });
  }

  const fen = typeof payload.fen === "string" ? payload.fen.trim() : "";

  if (!fen || fen.length > 120) {
    return sendJson(res, 400, { error: "A valid FEN is required." });
  }

  const token = process.env.MCP_AUTH_TOKEN ?? "";
  if (!token) {
    return sendJson(res, 503, { error: "Remote engine is not configured.", fallback: true });
  }

  const target = (process.env.CHESS_MCP_URL || DEFAULT_ENGINE_URL).replace(/\/$/, "");
  const timeMs = clampInt(payload.timeMs, 50, 12_000, 1200);
  const multipv = clampInt(payload.multiPv, 1, 5, 3);
  const depth = payload.depth == null ? null : clampInt(payload.depth, 1, 40, 16);
  const clientTimeoutMs = clampInt(payload.timeoutMs, 700, 16_000, Math.max(1800, timeMs + 2500));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), clientTimeoutMs);

  try {
    const response = await fetch(`${target}/api/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        fen,
        time_ms: timeMs,
        multipv,
        depth
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      return sendJson(res, 502, { error: "Remote engine request failed.", fallback: true });
    }

    const data = await response.json();
    return sendJson(res, 200, data);
  } catch {
    return sendJson(res, 503, { error: "Remote engine unavailable.", fallback: true });
  } finally {
    clearTimeout(timeout);
  }
}
