const rateBuckets = new Map();

const firstHeader = (value) => (Array.isArray(value) ? value[0] : value ?? "");

export const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
};

const sameOriginRequest = (req) => {
  const origin = firstHeader(req.headers.origin);
  const host = firstHeader(req.headers.host);
  if (!origin || !host) {
    return true;
  }

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
};

export const requirePlayer = async (req, res) => {
  if (!sameOriginRequest(req)) {
    sendJson(res, 403, { error: "Cross-origin request rejected." });
    return null;
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
  const authorization = firstHeader(req.headers.authorization);

  if (!supabaseUrl || !publishableKey || !authorization.startsWith("Bearer ")) {
    sendJson(res, 401, { error: "Authentication required." });
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: publishableKey,
        Authorization: authorization
      },
      signal: controller.signal
    });

    if (!response.ok) {
      sendJson(res, 401, { error: "Invalid or expired session." });
      return null;
    }

    const user = await response.json();
    if (!user?.id || typeof user.id !== "string") {
      sendJson(res, 401, { error: "Invalid session." });
      return null;
    }

    return user;
  } catch {
    sendJson(res, 503, { error: "Authentication service unavailable." });
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

export const allowRequest = (userId, bucket, limit = 60, windowMs = 60_000) => {
  const now = Date.now();
  const key = `${bucket}:${userId}`;
  const existing = rateBuckets.get(key);

  if (!existing || existing.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (existing.count >= limit) {
    return false;
  }

  existing.count += 1;
  return true;
};
