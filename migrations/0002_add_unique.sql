
CREATE TABLE IF NOT EXISTS messages_new (
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

INSERT OR IGNORE INTO messages_new
  (chat_id, message_id, user_id, username, first_name, text, reply_to_id, created_at)
SELECT chat_id, message_id, user_id, username, first_name, text, reply_to_id, created_at
FROM messages
WHERE text IS NOT NULL AND text != '';

DROP TABLE messages;
ALTER TABLE messages_new RENAME TO messages;

CREATE INDEX IF NOT EXISTS idx_messages_chat_message
  ON messages(chat_id, message_id DESC);
CREATE INDEX IF NOT EXISTS idx_messages_chat_user
  ON messages(chat_id, user_id);
