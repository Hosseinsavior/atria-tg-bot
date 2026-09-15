
import { summarizeGroup, detectTopic, findUnanswered } from "./analyzer.js";
import { clearChatData } from "./db.js";
import { checkIsAdmin } from "./utils.js";

const USER_MAX_LIMIT = 1000;
const ADMIN_MAX_LIMIT = 5000;

export const COMMANDS = {
  /* ---------- تحلیل‌ها ---------- */
  summary: {
    name: "summary",
    description: "خلاصه‌ی پیام‌های اخیر گروه (پیش‌فرض ۱۰۰)",
    handler: async function (ctx, env, args) {
      const chatId = ctx.chat.id;
      const userId = ctx.from && ctx.from.id;
      let limit = parseInt(args[0], 10) || 100;

      const isAdmin = await checkIsAdmin(env, chatId, userId);
      const cap = isAdmin ? ADMIN_MAX_LIMIT : USER_MAX_LIMIT;
      if (limit > cap) limit = cap;

      const r = await summarizeGroup(env, chatId, limit);
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
  },

  /* ---------- مدیریت ---------- */
  clear: {
    name: "clear",
    description: "پاک کردن کل حافظه‌ی گروه (فقط ادمین)",
    handler: async function (ctx, env) {
      const chatId = ctx.chat.id;
      const userId = ctx.from && ctx.from.id;
      const isAdmin = await checkIsAdmin(env, chatId, userId);
      if (!isAdmin) return { text: "⛔ فقط ادمین‌ها." };

      const counts = await clearChatData(env, chatId);

      try {
        const id = env.CHAT_SESSION.idFromName("chat:" + chatId);
        const stub = env.CHAT_SESSION.get(id);
        await stub.fetch("https://do/clear", { method: "POST" });
      } catch (e) {
        console.error("DO clear failed:", e);
      }

      return {
        text:
          "🧹 حافظه پاک شد.\n" +
          "• پیام‌ها: " + counts.messages + "\n" +
          "• تحلیل‌ها: " + counts.analyses
      };
    }
  },

  reset_analyses: {
    name: "reset_analyses",
    description: "پاک کردن cache تحلیل‌ها (فقط ادمین)",
    handler: async function (ctx, env) {
      const isAdmin = await checkIsAdmin(env, ctx.chat.id, ctx.from && ctx.from.id);
      if (!isAdmin) return { text: "⛔ فقط ادمین‌ها." };
      await env.DB.prepare("DELETE FROM group_analyses WHERE chat_id = ?")
        .bind(ctx.chat.id).run();
      return { text: "🧹 cache تحلیل‌ها پاک شد." };
    }
  },

  forget_me: {
    name: "forget_me",
    description: "پاک کردن پیام‌های خودت از حافظه",
    handler: async function (ctx, env) {
      const userId = ctx.from && ctx.from.id;
      if (!userId) return { text: "❌ هویت شما مشخص نشد." };
      const r = await env.DB.prepare(
        "DELETE FROM messages WHERE chat_id = ? AND user_id = ?"
      ).bind(ctx.chat.id, userId).run();
      const n = (r.meta && r.meta.changes) || 0;
      return { text: "🧹 " + n + " پیام شما پاک شد." };
    }
  },

  /* ---------- راهنما ---------- */
  help: {
    name: "help",
    description: "لیست کامندها",
    handler: async function (ctx, env) {
      return { text: helpText() };
    }
  }
};

export function parseCommand(text, botUsername) {
  if (!text || text[0] !== "/") return null;

  let clean = text;
  const mentionSuffix = "@" + botUsername;
  const firstSpace = clean.indexOf(" ");
  const firstWord = firstSpace === -1 ? clean : clean.slice(0, firstSpace);

  if (firstWord.indexOf(mentionSuffix) !== -1) {
    clean = firstWord.replace(mentionSuffix, "") +
      (firstSpace === -1 ? "" : clean.slice(firstSpace));
  }

  const parts = clean.trim().split(/\s+/);
  const cmd = parts[0].slice(1).toLowerCase();
  const args = parts.slice(1);

  if (!COMMANDS[cmd]) return null;
  return { cmd: cmd, args: args };
}

export function helpText() {
  const lines = ["📖 کامندها:"];
  for (const key in COMMANDS) {
    lines.push("/" + key + " — " + COMMANDS[key].description);
  }
  lines.push("");
  lines.push("سقف /summary: ۱۰۰۰ پیام (ادمین: ۵۰۰۰)");
  lines.push("مثال: /summary 300");
  return lines.join("\n");
}
