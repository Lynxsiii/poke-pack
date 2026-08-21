CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  handle TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'gold',
  bio TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT 'Rookie',
  created_at INTEGER NOT NULL,
  last_played INTEGER NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY,
  coins REAL NOT NULL,
  last_daily INTEGER,
  packs_opened INTEGER NOT NULL DEFAULT 0,
  pulls INTEGER NOT NULL DEFAULT 0,
  packs_since_hit INTEGER NOT NULL DEFAULT 0,
  pack_trick INTEGER NOT NULL DEFAULT 0,
  granted REAL NOT NULL,
  active_set_id TEXT NOT NULL DEFAULT 'me5',
  created_at INTEGER NOT NULL,
  binder TEXT,
  worth_log TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE cards (
  user_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 0,
  reverse_qty INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, card_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  name TEXT NOT NULL,
  rarity TEXT NOT NULL,
  reverse INTEGER NOT NULL DEFAULT 0,
  was_new INTEGER NOT NULL DEFAULT 0,
  pack_id TEXT,
  at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE pack_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  set_id TEXT NOT NULL,
  wrapper_id TEXT,
  cost REAL NOT NULL,
  cards TEXT NOT NULL,
  at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
CREATE INDEX idx_history_user ON history(user_id, at DESC);
CREATE INDEX idx_cards_user ON cards(user_id);
CREATE INDEX idx_pack_log_user ON pack_log(user_id, at DESC);
