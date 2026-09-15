
// خواندن N پیام اخیر گروه
export async function getRecentMessages(env, chatId, limit) {
  const n = Math.max(1, Math.min(limit || 100, 500));
  const result = await env.DB.prepare(
    "SELECT message_id, user_id, username, first_name, text, reply_to_id, created_at " +
    "FROM messages WHERE chat_id = ? " +
    "ORDER BY created_at DESC LIMIT ?"
  ).bind(chatId, n).all();
  // برگرداندن به ترتیب زمانی
  const rows = (result && result.results) || [];
  return rows.reverse();
}

// ذخیره‌ی تحلیل در cache
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

// خواندن آخرین تحلیل، اگر تازه باشد
export async function getFreshAnalysis(env, chatId, kind, maxAgeSec) {
  const cutoff = Math.floor(Date.now() / 1000) - (maxAgeSec || 600);
  const result = await env.DB.prepare(
    "SELECT content, message_from, message_to, created_at " +
    "FROM group_analyses " +
    "WHERE chat_id = ? AND kind = ? AND created_at >= ? " +
    "ORDER BY created_at DESC LIMIT 1"
  ).bind(chatId, kind, cutoff).first();
  return result || null;
}

// پیام‌های یک کاربر خاص (برای /opinions در آینده)
export async function getMessagesByUser(env, chatId, userId, limit) {
  const n = Math.max(1, Math.min(limit || 50, 200));
  const result = await env.DB.prepare(
    "SELECT message_id, text, created_at FROM messages " +
    "WHERE chat_id = ? AND user_id = ? " +
    "ORDER BY created_at DESC LIMIT ?"
  ).bind(chatId, userId, n).all();
  const rows = (result && result.results) || [];
  return rows.reverse();
}
