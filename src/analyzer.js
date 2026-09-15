
import { getRecentMessages, saveAnalysis, getFreshAnalysis } from "./db.js";
import { callAtria } from "./atria.js";
import { safeParseJSON } from "./utils.js";

const CACHE_TTL_SEC = 600; // ۱۰ دقیقه

// قالب‌بندی پیام‌ها برای مدل
function formatMessages(rows) {
  return rows.map(function (r) {
    const name = r.username ? "@" + r.username : (r.first_name || ("user" + r.user_id));
    const time = new Date(r.created_at * 1000).toISOString().slice(11, 16);
    const reply = r.reply_to_id ? " (reply#" + r.reply_to_id + ")" : "";
    return "[" + time + "] " + name + reply + ": " + (r.text || "").slice(0, 500);
  }).join("\n");
}

/* ---------- خلاصه‌ی گروه ---------- */
export async function summarizeGroup(env, chatId, limit) {
  // cache
  const cached = await getFreshAnalysis(env, chatId, "summary", CACHE_TTL_SEC);
  if (cached) {
    return { text: cached.content, fromCache: true };
  }

  const rows = await getRecentMessages(env, chatId, limit || 100);
  if (rows.length === 0) {
    return { text: "پیامی برای خلاصه کردن پیدا نشد.", fromCache: false };
  }

  const systemPrompt =
    "تو یک تحلیل‌گر گروه تلگرام هستی. " +
    "فقط بر اساس پیام‌های داده‌شده پاسخ بده و چیزی از خودت اضافه نکن. " +
    "پاسخ را به فارسی، حداکثر ۴۰۰ کلمه، با این ساختار بده:\n\n" +
    "## موضوع فعلی\n...\n\n" +
    "## تصمیم‌های مهم\n- ...\n\n" +
    "## سؤال‌های بی‌جواب\n- ...\n\n" +
    "## افراد کلیدی بحث\n- ...";

  const userText =
    "پیام‌های اخیر گروه (از قدیم به جدید):\n\n" +
    formatMessages(rows) +
    "\n\nحالا خلاصه را طبق ساختار بده.";

  const answer = await callAtria({
    env: env,
    systemPrompt: systemPrompt,
    history: [],
    userText: userText
  });

  const text = (answer || "").trim() || "(پاسخی دریافت نشد)";

  await saveAnalysis(env, {
    chatId: chatId,
    kind: "summary",
    content: text,
    messageFrom: rows[0].message_id,
    messageTo: rows[rows.length - 1].message_id
  });

  return { text: text, fromCache: false };
}

/* ---------- تشخیص موضوع ---------- */
export async function detectTopic(env, chatId, limit) {
  const cached = await getFreshAnalysis(env, chatId, "topic", CACHE_TTL_SEC);
  if (cached) {
    return { text: cached.content, fromCache: true };
  }

  const rows = await getRecentMessages(env, chatId, limit || 60);
  if (rows.length === 0) {
    return { text: "پیامی برای تحلیل پیدا نشد.", fromCache: false };
  }

  const systemPrompt =
    "تو یک تحلیل‌گر گروه تلگرام هستی. " +
    "موضوع اصلی گفتگو را فقط بر اساس پیام‌های داده‌شده تشخیص بده. " +
    "خروجی را کوتاه و در قالب زیر بده (فقط همین سه خط):\n" +
    "موضوع فعلی: <یک جمله>\n" +
    "تغییر موضوع در پیام‌های اخیر: بله/خیر\n" +
    "موضوعات فرعی: <حداکثر ۲ مورد با کاما>";

  const userText = "پیام‌ها:\n\n" + formatMessages(rows);

  const answer = await callAtria({
    env: env,
    systemPrompt: systemPrompt,
    history: [],
    userText: userText
  });

  const text = (answer || "").trim() || "(پاسخی دریافت نشد)";

  await saveAnalysis(env, {
    chatId: chatId,
    kind: "topic",
    content: text,
    messageFrom: rows[0].message_id,
    messageTo: rows[rows.length - 1].message_id
  });

  return { text: text, fromCache: false };
}

/* ---------- سؤال‌های بی‌جواب ---------- */
export async function findUnanswered(env, chatId, limit) {
  const cached = await getFreshAnalysis(env, chatId, "unanswered", CACHE_TTL_SEC);
  if (cached) {
    return { text: cached.content, fromCache: true };
  }

  const rows = await getRecentMessages(env, chatId, limit || 150);
  if (rows.length === 0) {
    return { text: "پیامی برای تحلیل پیدا نشد.", fromCache: false };
  }

  const systemPrompt =
    "تو یک تحلیل‌گر گروه تلگرام هستی. " +
    "سؤال‌هایی که در پیام‌ها پرسیده شده ولی کسی به‌طور واضح پاسخ نداده را پیدا کن. " +
    "خروجی را در قالب JSON بده، هیچ متن اضافه‌ای ننویس:\n" +
    '{"unanswered": [{"question": "string", "asked_by": "username", "message_id": number, "reason": "string"}]}';

  const userText = "پیام‌ها:\n\n" + formatMessages(rows);

  const raw = await callAtria({
    env: env,
    systemPrompt: systemPrompt,
    history: [],
    userText: userText
  });

  const parsed = safeParseJSON(raw);
  let text;

  if (parsed && Array.isArray(parsed.unanswered)) {
    if (parsed.unanswered.length === 0) {
      text = "✅ سؤال بی‌جواب مهمی پیدا نشد.";
    } else {
      text = "❓ سؤال‌های بی‌جواب:\n\n" +
        parsed.unanswered.map(function (q, i) {
          const by = q.asked_by ? " (از " + q.asked_by + ")" : "";
          const reason = q.reason ? "\n   دلیل: " + q.reason : "";
          return (i + 1) + ". " + q.question + by + reason;
        }).join("\n\n");
    }
  } else {
    // fallback: خروجی خام
    text = (raw || "").trim() || "(نتیجه‌ای از مدل دریافت نشد)";
  }

  await saveAnalysis(env, {
    chatId: chatId,
    kind: "unanswered",
    content: text,
    messageFrom: rows[0].message_id,
    messageTo: rows[rows.length - 1].message_id
  });

  return { text: text, fromCache: false };
}
