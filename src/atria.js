
import { withRetry } from "./utils.js";

const ATRIA_URL = "https://api.atria-asi.ai/v1/chat/completions";
const MODEL = "Atria-Dawn-Preview";

export async function callAtria(params) {
  const userText = params.userText;
  const history = params.history;
  const env = params.env;

  const messages = [
    { role: "system", content: "تو یک دستیار در گروه تلگرام هستی. پاسخ‌ها را کوتاه و دقیق بده." }
  ].concat(history).concat([
    { role: "user", content: userText }
  ]);

  return withRetry(
    async function () {
      const controller = new AbortController();
      const t = setTimeout(function () { controller.abort(); }, 45000);

      let res;
      try {
        res = await fetch(ATRIA_URL, {
          method: "POST",
          headers: {
            Authorization: "Bearer " + env.ATRIA_API_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: MODEL, messages: messages, max_tokens: 1024 }),
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
        const err = new Error("Atria HTTP " + res.status);
        err.status = res.status;
        const ra = res.headers.get("retry-after");
        if (ra) err.retryAfterSec = parseInt(ra, 10) || undefined;
        throw err;
      }

      let data;
      try {
        data = await res.json();
      } catch (e) {
        const err = new Error("invalid json");
        err.code = "BAD_JSON";
        throw err;
      }

      const content = data && data.choices && data.choices[0]
        && data.choices[0].message && data.choices[0].message.content;
      if (typeof content !== "string") {
        const err = new Error("unexpected shape");
        err.code = "BAD_SHAPE";
        throw err;
      }
      return content;
    },
    {
      maxAttempts: 4,
      shouldRetry: function (err) {
        if (err.code === "TIMEOUT") return true;
        if (err.status === 429) return true;
        if (err.status >= 500 && err.status < 600) return true;
        return false;
      }
    }
  );
}
