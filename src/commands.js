
import { summarizeGroup, detectTopic, findUnanswered } from "./analyzer.js";

// ساختار کامندها
export const COMMANDS = {
  summary: {
    name: "summary",
    description: "خلاصه‌ی پیام‌های اخیر گروه",
    handler: async function (ctx, env, args) {
      const limit = parseInt(args[0], 10) || 100;
      const r = await summarizeGroup(env, ctx.chat.id, limit);
      return { text: r.text, fromCache: r.fromCache };
    }
  },
  topic: {
    name: "topic",
    description: "تشخیص موضوع فعلی گروه",
    handler: async function (ctx, env, args) {
      const limit = parseInt(args[0], 10) || 60;
      const r = await detectTopic(env, ctx.chat.id, limit);
      return { text: r.text, fromCache: r.fromCache };
    }
  },
  unanswered: {
    name: "unanswered",
    description: "سؤال‌های بی‌جواب گروه",
    handler: async function (ctx, env, args) {
      const limit = parseInt(args[0], 10) || 150;
      const r = await findUnanswered(env, ctx.chat.id, limit);
      return { text: r.text, fromCache: r.fromCache };
    }
  }
};

// استخراج نام کامند و args از متن پیام
export function parseCommand(text, botUsername) {
  if (!text || text[0] !== "/") return null;

  // حذف /command@BotUsername اگر وجود داشت
  let clean = text;
  const mentionSuffix = "@" + botUsername;
  const firstSpace = clean.indexOf(" ");
  const firstWord = firstSpace === -1 ? clean : clean.slice(0, firstSpace);

  if (firstWord.indexOf(mentionSuffix) !== -1) {
    clean = firstWord.replace(mentionSuffix, "") + (firstSpace === -1 ? "" : clean.slice(firstSpace));
  }

  const parts = clean.trim().split(/\s+/);
  const cmd = parts[0].slice(1).toLowerCase(); // حذف اسلش
  const args = parts.slice(1);

  if (!COMMANDS[cmd]) return null;
  return { cmd: cmd, args: args };
}

// ساخت لیست کامندها برای /help
export function helpText() {
  const lines = ["📖 کامندهای موجود:"];
  for (const key in COMMANDS) {
    lines.push("/" + key + " — " + COMMANDS[key].description);
  }
  lines.push("");
  lines.push("مثال: /summary 200");
  return lines.join("\n");
}
