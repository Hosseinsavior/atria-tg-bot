export function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// برش با احترام به مرز پاراگراف/خط/فاصله
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
    if (!env[k]) throw new Error(`Missing required env: ${k}`);
  }
  if (!/^\d+$/.test(String(env.BOT_ID))) {
    throw new Error("BOT_ID must be a numeric string");
  }
}

// نگهبان تاریخچه: هر آیتم باید شکل {role, content} داشته باشد
export function sanitizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (m) =>
      m &&
      typeof m === "object" &&
      (m.role === "user" || m.role === "assistant" || m.role === "system") &&
      typeof m.content === "string" &&
      m.content.length > 0
  );
}

// retry با exponential backoff + jitter
export async function withRetry(fn, {
  maxAttempts = 4,
  baseDelayMs = 500,
  maxDelayMs = 8000,
  shouldRetry = () => true,
  onRetry = () => {}
} = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts || !shouldRetry(err, attempt)) throw err;
      const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const jitter = Math.random() * exp * 0.3;
      const wait = exp + jitter;
      onRetry(err, attempt, wait);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}
```

---

🤖 src/atria.js

```javascript
import { withRetry } from "./utils.js";

const ATRIA_URL = "https://api.atria-asi.ai/v1/chat/completions";
const MODEL = "Atria-Dawn-Preview";

export async function callAtria({ userText, history, env }) {
  const messages = [
    { role: "system", content: "تو یک دستیار در گروه تلگرام هستی. پاسخ‌ها را کوتاه و دقیق بده." },
    ...history,
    { role: "user", content: userText }
  ];

  return withRetry(
    async () => {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 45000);

      let res;
      try {
        res = await fetch(ATRIA_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.ATRIA_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: MODEL, messages, max_tokens: 1024 }),
          signal: controller.signal
        });
      } catch (e) {
        if (e.name === "AbortError") {
          const err = new Error("timeout");
          err.code = "TIMEOUT";
          throw err;
        }
        throw e;
      } finally {
        clearTimeout(t);
      }

      if (!res.ok) {
        const err = new Error(`Atria HTTP ${res.status}`);
        err.status = res.status;
        // اگر Retry-After داشت رعایت کن
        const ra = res.headers.get("retry-after");
        if (ra) err.retryAfterSec = parseInt(ra, 10) || undefined;
        throw err;
      }

      let data;
      try {
        data = await res.json();
      } catch {
        const err = new Error("invalid json");
        err.code = "BAD_JSON";
        throw err;
      }

      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        const err = new Error("unexpected shape");
        err.code = "BAD_SHAPE";
        throw err;
      }
      return content;
    },
    {
      maxAttempts: 4,
      shouldRetry: (err) => {
        // فقط 429 و 5xx و timeout قابل retry هستند
        if (err.code === "TIMEOUT") return true;
        if (err.status === 429) return true;
        if (err.status >= 500 && err.status < 600) return true;
        return false;
      }
    }
  );
  }
