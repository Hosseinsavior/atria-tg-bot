
import { ChatSession } from "./chat-session.js";
import { escapeRegex, validateEnv } from "./utils.js";
import { sendTelegramMessage } from "./telegram.js";
import { parseCommand, COMMANDS, helpText } from "./commands.js";

export { ChatSession };

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // ✅ Secret اجباری
    const secretToken = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (!env.WEBHOOK_SECRET || secretToken !== env.WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    // ✅ اعتبارسنجی env
    try {
      validateEnv(env);
    } catch (err) {
      console.error("ENV error:", err.message);
      return new Response("Server misconfigured", { status: 500 });
    }

    let update;
    try {
      update = await request.json();
    } catch (e) {
      return new Response("Bad Request", { status: 400 });
    }

    ctx.waitUntil(
      dispatch(update, env).catch(function (e) {
        console.error("dispatch failed:", e);
      })
    );

    return new Response("OK");
  }
};

/* ---------- dispatch اصلی ---------- */
async function dispatch(update, env) {
  const msg = update.message;
  if (!msg || !msg.text) return;

  const chatId = msg.chat.id;
  const text = msg.text;
  const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";

  /* ---------- ۱. /help ---------- */
  const helpRegex = new RegExp("^/help(?:@" + escapeRegex(env.BOT_USERNAME) + ")?\\s*$", "i");
  if (helpRegex.test(text)) {
    await sendTelegramMessage(chatId, helpText(), env, msg.message_id);
    return;
  }

  /* ---------- ۲. کامندها ---------- */
  const parsed = parseCommand(text, env.BOT_USERNAME);
  if (parsed) {
    await handleCommand(msg, env, parsed);
    return;
  }

  /* ---------- ۳. منطق عادی چت ---------- */
  if (isGroup) {
    const botUsername = env.BOT_USERNAME;
    const botId = Number(env.BOT_ID);

    const mentionRegex = new RegExp("@" + escapeRegex(botUsername) + "\\b", "i");
    const mentioned = mentionRegex.test(text);

    const replied = msg.reply_to_message && msg.reply_to_message.from;
    const repliedToMe = !!replied && replied.id === botId;

    if (!mentioned && !repliedToMe) return;
  }

  const mentionCleanupRegex = new RegExp("@" + escapeRegex(env.BOT_USERNAME) + "\\b", "gi");
  const cleanText = text.replace(mentionCleanupRegex, "").trim();
  if (!cleanText) return;

  // dedup بر اساس update_id
  if (env.DEDUP_KV) {
    const key = "u:" + update.update_id;
    const seen = await env.DEDUP_KV.get(key);
    if (seen) return;
    await env.DEDUP_KV.put(key, "1", { expirationTtl: 300 });
  }

  // مسیریابی به DO مخصوص همین chat
  const id = env.CHAT_SESSION.idFromName("chat:" + chatId);
  const stub = env.CHAT_SESSION.get(id);

  await stub.fetch("https://do/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chatId: chatId,
      text: cleanText,
      replyToMessageId: msg.message_id,
      userId: msg.from && msg.from.id
    })
  });
}

/* ---------- اجرای کامند ---------- */
async function handleCommand(msg, env, parsed) {
  const chatId = msg.chat.id;
  const cmd = parsed.cmd;
  const args = parsed.args;

  const entry = COMMANDS[cmd];
  if (!entry) return;

  // typing
  try {
    await fetch(
      "https://api.telegram.org/bot" + env.BOT_TOKEN + "/sendChatAction",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, action: "typing" })
      }
    );
  } catch (e) { /* ignore */ }

  let result;
  try {
    const fakeCtx = { chat: { id: chatId }, from: msg.from, message: msg };
    result = await entry.handler(fakeCtx, env, args);
  } catch (err) {
    console.error("Command failed:", cmd, err);
    const errMsg = err && err.message ? err.message : "خطای نامشخص";
    await sendTelegramMessage(
      chatId,
      "❌ اجرای کامند ناموفق بود: " + errMsg,
      env,
      msg.message_id
    );
    return;
  }

  if (!result || !result.text) {
    await sendTelegramMessage(chatId, "(نتیجه‌ای برگشت نشد)", env, msg.message_id);
    return;
  }

  const suffix = result.fromCache ? "\n\n_⏱ از cache_" : "";
  const finalText = result.text + suffix;

  await sendTelegramMessage(chatId, finalText, env, msg.message_id);
}
