import { callAtria } from "./atria.js";
import { sendTelegramMessage } from "./telegram.js";
import { sanitizeHistory } from "./utils.js";

const MAX_HISTORY = 20;

export class ChatSession {
  constructor(state, env) {
    this.state = state;
    this.env = env;

    // زنجیره‌ی صف داخلی: هر درخواست جدید منتظر درخواست قبلی می‌ماند
    this.queue = Promise.resolve();

    // جلوگیری از اجرای همزمان چند request در حین initialize
    this.state.blockConcurrencyWhile(async () => {
      const raw = await this.state.storage.get("history");
      this.history = sanitizeHistory(raw);
    });
  }

  // درخواست‌های Worker به DO از این مسیر وارد می‌شوند
  async fetch(request) {
    const payload = await request.json();

    // صف‌بندی: هر تسک به انتهای زنجیره وصل می‌شود
    const result = this.queue.then(() => this.handle(payload));
    // زنجیره را به‌روز نگه دار تا خطا آن را قطع نکند
    this.queue = result.catch(() => {});
    return result;
  }

  async handle({ chatId, text, replyToMessageId, userId }) {
    const history = this.history;

    let answer;
    try {
      answer = await callAtria({ userText: text, history, env: this.env });
    } catch (err) {
      console.error("Atria error:", err);
      if (err.code === "TIMEOUT") {
        answer = "⏱️ پاسخ سرویس هوش مصنوعی خیلی طول کشید. دوباره تلاش کن.";
      } else if (err.status === 429) {
        answer = "🚦 محدودیت نرخ درخواست. چند لحظه بعد امتحان کن.";
      } else if (err.status >= 500) {
        answer = "🔧 سرویس هوش مصنوعی موقتاً در دسترس نیست.";
      } else {
        answer = "❌ خطا در ارتباط با سرویس هوش مصنوعی.";
      }
    }

    if (!answer || !answer.trim()) answer = "(پاسخی از مدل دریافت نشد)";

    // به‌روزرسانی تاریخچه — اینجا دیگر race نداریم چون در یک instance هستیم
    history.push({ role: "user", content: text });
    history.push({ role: "assistant", content: answer });
    while (history.length > MAX_HISTORY) history.shift();

    await this.state.storage.put("history", history);

    // ارسال به تلگرام
    await sendTelegramMessage(chatId, answer, this.env, replyToMessageId);

    return new Response(JSON.stringify({ ok: true }));
  }
}
