
/* ---------- پیام‌ها ---------- */

// ذخیره‌ی پیام گروه — امن در برابر duplicate
export async function saveMessage(env, msg) {
  if (!msg || !msg.chat || !msg.from) return false;

  const text = typeof msg.text === "string" ? msg.text.trim() : "";
  if (!text) return false;

  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  const userId = msg.from.id;
  const username = msg.from.username || null;
  const firstName = msg.from.first_name || null;
  const replyToId =
    msg.reply_to_message && msg.reply_to_message.message_id
      ? msg.reply_to_message.message_id
      : null;
  const createdAt = msg.date || Math.floor(Date.now() / 1000);

  try {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO messages " +
      "(chat_id, message_id, user_id, username, first_name, text, reply_to_id, created_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      chatId, messageId, userId, username, firstName, text, replyToId, createdAt
    ).run();
    return true;
  } catch (err) {
    console.error("saveMessage failed:", err);
    return false;
  }
}

// خواندن N پیام اخیر گروه — بر اساس message_id
export async function getRecentMessages(env, chatId, limit) {
  const n = Math.max(1, Math.min(limit || 100, 5000));
  const result = await env.DB.prepare(
    "SELECT message_id, user_id, username, first_name, text, reply_to_id, created_at " +
    "FROM messages WHERE chat_id = ? " +
    "ORDER BY message_id DESC LIMIT ?"
  ).bind(chatId, n).all();
  const rows = (result && result.results) || [];
  return rows.reverse();
}

// آخرین message_id گروه
export async function getLatestMessageId(env, chatId) {
  const result = await env.DB.prepare(
    "SELECT message_id FROM messages WHERE chat_id = ? " +
    "ORDER BY message_id DESC LIMIT 1"
  ).bind(chatId).first();
  return result ? result.message_id : 0;
}

// پیام‌های یک کاربر خاص
export async function getMessagesByUser(env, chatId, userId, limit) {
  const n = Math.max(1, Math.min(limit || 50, 500));
  const result = await env.DB.prepare(
    "SELECT message_id, text, created_at FROM messages " +
    "WHERE chat_id = ? AND user_id = ? " +
    "ORDER BY message_id DESC LIMIT ?"
  ).bind(chatId, userId, n).all();
  const rows = (result && result.results) || [];
  return rows.reverse();
}

// شمارش کل پیام‌های یک گروه
export async function countMessages(env, chatId) {
  const result = await env.DB.prepare(
    "SELECT COUNT(*) as c FROM messages WHERE chat_id = ?"
  ).bind(chatId).first();
  return (result && result.c) || 0;
}

/* ---------- تحلیل‌ها (cache) ---------- */

export async function saveAnalysis(env, params) {
  await env.DB.prepare(
    "INSERT INTO group_analyses (chat_id, kind, content, message_from, message_to, created_at) " +
    "VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(
    params.chatId,
    params.kind,
    params.content,
    params.messageFrom,
    params.messageTo,
    Math.floor(Date.now() / 1000)
  ).run();
}

// ✅ cache فقط بر اساس TTL معتبر است
// دلیل: با privacy mode، ممکن است پیام‌هایی که در D1 ذخیره نشده‌اند، آخرین پیام گروه باشند
// پس تکیه بر message_to == latestId قابل اعتماد نیست.
export async function getFreshAnalysis(env, chatId, kind, maxAgeSec) {
  const cutoff = Math.floor(Date.now() / 1000) - (maxAgeSec || 600);

  const result = await env.DB.prepare(
    "SELECT content, message_from, message_to, created_at " +
    "FROM group_analyses " +
    "WHERE chat_id = ? AND kind = ? AND created_at >= ? " +
    "ORDER BY created_at DESC LIMIT 1"
  ).bind(chatId, kind, cutoff).first();

  if (!result) return null;
  return result;
}

/* ---------- پاک‌سازی ---------- */

export async function clearChatData(env, chatId) {
  const r1 = await env.DB.prepare(
    "DELETE FROM messages WHERE chat_id = ?"
  ).bind(chatId).run();
  const r2 = await env.DB.prepare(
    "DELETE FROM group_analyses WHERE chat_id = ?"
  ).bind(chatId).run();
  return {
    messages: (r1.meta && r1.meta.changes) || 0,
    analyses: (r2.meta && r2.meta.changes) || 0
  };
}

export async function clearUserData(env, chatId, userId) {
  const r1 = await env.DB.prepare(
    "DELETE FROM messages WHERE chat_id = ? AND user_id = ?"
  ).bind(chatId, userId).run();
  return (r1.meta && r1.meta.changes) || 0;
}

export async function cleanupOldMessages(env, retentionDays) {
  const days = retentionDays || 30;
  const cutoff = Math.floor(Date.now() / 1000) - (days * 86400);
  const r1 = await env.DB.prepare(
    "DELETE FROM messages WHERE created_at < ?"
  ).bind(cutoff).run();
  const r2 = await env.DB.prepare(
    "DELETE FROM group_analyses WHERE created_at < ?"
  ).bind(cutoff).run();
  console.log(
    "Cleanup: messages=" + ((r1.meta && r1.meta.changes) || 0) +
    ", analyses=" + ((r2.meta && r2.meta.changes) || 0)
  );
}
