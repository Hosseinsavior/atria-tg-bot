=== FILE: src/telegram.js ===
import { splitMessage, withRetry } from "./utils.js";

export async function sendTelegramMessage(chatId, text, env, replyToMessageId) {
  const chunks = splitMessage(text, 4000);
  if (chunks.length === 0) return;

  for (let i = 0; i < chunks.length; i++) {
    const body = { chat_id: chatId, text: chunks[i] };
    if (i === 0 && replyToMessageId) body.reply_to_message_id = replyToMessageId;

    await withRetry(
      async function () {
        const res = await fetch(
          "https://api.telegram.org/bot" + env.BOT_TOKEN + "/sendMessage",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
          }
        );

        if (res.ok) return;

        const errText = await res.text().catch(function () { return ""; });
        const err = new Error("TG " + res.status + ": " + errText);
        err.status = res.status;

        if (res.status === 429) {
          try {
            const parsed = JSON.parse(errText);
            if (parsed && parsed.parameters && parsed.parameters.retry_after) {
              err.retryAfterSec = parsed.parameters.retry_after;
            }
          } catch (e) { /* ignore */ }
        }
        throw err;
      },
      {
        maxAttempts: 4,
        baseDelayMs: 1000,
        shouldRetry: function (err) {
          return err.status === 429 || (err.status >= 500 && err.status < 600);
        }
      }
    );
  }
}
=== END FILE ===
