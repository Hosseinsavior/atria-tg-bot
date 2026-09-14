import { splitMessage, withRetry } from "./utils.js";

export async function sendTelegramMessage(chatId, text, env, replyToMessageId) {
  const chunks = splitMessage(text, 4000);
  if (chunks.length === 0) return;

  for (let i = 0; i < chunks.length; i++) {
    const body = { chat_id: chatId, text: chunks[i] };
    if (i === 0 && replyToMessageId) body.reply_to_message_id = replyToMessageId;

    await withRetry(
      async () => {
        const res = await fetch(
          `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
          }
        );

        if (res.ok) return;

        const errText = await res.text().catch(() => "");
        const err = new Error(`TG ${res.status}: ${errText}`);
        err.status = res.status;

        // رعایت retry_after برای 429
        if (res.status === 429) {
          try {
            const parsed = JSON.parse(errText);
            err.retryAfterSec = parsed?.parameters?.retry_after;
          } catch {}
        }
        throw err;
      },
      {
        maxAttempts: 4,
        shouldRetry: (err) => err.status === 429 || (err.status >= 500 && err.status < 600),
        // اگر retry_after داشت، از همان استفاده کن
        baseDelayMs: 1000
      }
    );
  }
}
