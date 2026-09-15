
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  message_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  username TEXT,
  first_name TEXT,
  text TEXT,
  reply_to_id INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_chat_time ON messages(chat_id, created_at DESC);

-- جدول جدید فاز ۲: cache تحلیل‌ها
CREATE TABLE IF NOT EXISTS group_analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  kind TEXT NOT NULL,          -- 'summary' | 'topic' | 'unanswered'
  content TEXT NOT NULL,       -- خروجی مدل (متن یا JSON)
  message_from INTEGER NOT NULL, -- از چه message_id
  message_to INTEGER NOT NULL,   -- تا چه message_id
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analyses_chat_kind_time
  ON group_analyses(chat_id, kind, created_at DESC);
