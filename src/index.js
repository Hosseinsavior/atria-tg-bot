import { ChatSession } from "./chat-session.js";
import { escapeRegex, validateEnv } from "./utils.js";

export { ChatSession };

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // ✅ اصلاح امنیتی: Secret اجباری
    const secretToken = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (!env.WEBHOOK_SECRET || secretToken !== env.WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    // ✅ اعتبارسنجی env در همان ابتدا
    try {
      validateEnv(env);
    } catch (err) {
      console.error("ENV error:", err.message);
      return new Response("Server misconfigured", { status: 500 });
    }

    let update;
    try {
      update = await request.json();
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    ctx.waitUntil(dispatch(update, env).catch((e) => console.error("dispatch failed:", e)));
    return new Response("OK");
  }
};

async function dispatch(update, env) {
  const msg = update.message;
  if (!msg || !msg.text) return;

  const chatId = msg.chat.id;
  const text   = msg.text;
  const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";

  if (isGroup) {
    const botUsername = env.BOT_USERNAME;
    const botId       = Number(env.BOT_ID);

    const mentioned = new RegExp(`@${escapeRegex(botUsername)}\\b`, "i").test(text);

    // ✅ اصلاح: حتی بدون username، با BOT_ID پاسخ به پیام خودمان را تشخیص بده
    const replied = msg.reply_to_message?.from;
    const repliedToMe = !!replied && replied.id === botId;

    if (!mentioned && !repliedToMe) return;
  }

  const cleanText = text
    .replace(new RegExp(`@${escapeRegex(env.BOT_USERNAME)}\\b`, "gi"), "")
    .trim();
  if (!cleanText) return;

  // ✅ dedup بر اساس update_id (TTL کوتاه در KV)
  if (env.DEDUP_KV) {
    const key = `u:${update.update_id}`;
    const seen = await env.DEDUP_KV.get(key);
    if (seen) return;
    await env.DEDUP_KV.put(key, "1", { expirationTtl: 300 });
  }

  // مسیریابی به DO مخصوص همین chat
  const id = env.CHAT_SESSION.idFromName(`chat:${chatId}`);
  const stub = env.CHAT_SESSION.get(id);

  await stub.fetch("https://do/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chatId,
      text: cleanText,
      replyToMessageId: msg.message_id,
      userId: msg.from?.id
    })
  });
}
