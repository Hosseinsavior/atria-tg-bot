
export function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function splitMessage(text, maxLen = 4000) {
  const chunks = [];
  let remaining = text;
  while (remaining.length > maxLen) {
    let cut = remaining.lastIndexOf("\n\n", maxLen);
    if (cut < maxLen * 0.5) cut = remaining.lastIndexOf("\n", maxLen);
    if (cut < maxLen * 0.5) cut = remaining.lastIndexOf(" ", maxLen);
    if (cut < maxLen * 0.5) cut = maxLen;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export function validateEnv(env) {
  const required = ["BOT_TOKEN", "BOT_USERNAME", "BOT_ID", "ATRIA_API_KEY", "WEBHOOK_SECRET"];
  for (const k of required) {
    if (!env[k]) throw new Error("Missing required env: " + k);
  }
  if (!/^\d+$/.test(String(env.BOT_ID))) {
    throw new Error("BOT_ID must be a numeric string");
  }
}

export function sanitizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(function (m) {
    return (
      m &&
      typeof m === "object" &&
      (m.role === "user" || m.role === "assistant" || m.role === "system") &&
      typeof m.content === "string" &&
      m.content.length > 0
    );
  });
}

export async function withRetry(fn, opts) {
  const options = opts || {};
  const maxAttempts = options.maxAttempts || 4;
  const baseDelayMs = options.baseDelayMs || 500;
  const maxDelayMs = options.maxDelayMs || 8000;
  const shouldRetry = options.shouldRetry || function () { return true; };

  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts || !shouldRetry(err, attempt)) throw err;
      const exp = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1));
      const jitter = Math.random() * exp * 0.3;
      const wait = exp + jitter;
      await new Promise(function (r) { setTimeout(r, wait); });
    }
  }
  throw lastErr;
}
