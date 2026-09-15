
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  message_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  username TEXT,
  first_name TEXT,
  text TEXT NOT NULL,
  reply_to_id INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE(chat_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_messages_chat_message
  ON messages(chat_id, message_id DESC);
CREATE INDEX IF NOT EXISTS idx_messages_chat_user
  ON messages(chat_id, user_id);

CREATE TABLE IF NOT EXISTS group_analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  message_from INTEGER NOT NULL,
  message_to INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analyses_chat_kind_time
  ON group_analyses(chat_id, kind, created_at DESC);
