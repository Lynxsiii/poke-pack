-- Ambient population. `users.bot` is internal only — publicUser() never reads
-- it, so nothing about it reaches a browser; it exists so these rows can be
-- found, excluded, or purged without guessing from handles.
ALTER TABLE users ADD COLUMN bot INTEGER NOT NULL DEFAULT 0;

CREATE TABLE bots (
  user_id TEXT PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  cookie TEXT,
  online_until INTEGER NOT NULL DEFAULT 0,
  next_wake INTEGER NOT NULL DEFAULT 0,
  last_chat_at INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_users_bot ON users(bot);
