-- Lifetime counters for the quests and achievements remaster, plus the two
-- quest tables. quest_events and quest_claims arrived in 0010 but a database
-- that never applied it has neither, so this repeats them with IF NOT EXISTS.
-- The Worker runs the same DDL lazily (worker/stats.js ensureQuestSchema).
CREATE TABLE IF NOT EXISTS player_stats (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS quest_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  amount INTEGER NOT NULL,
  at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_quest_events_user_at ON quest_events(user_id, at);
CREATE TABLE IF NOT EXISTS quest_claims (
  user_id TEXT NOT NULL,
  quest_id TEXT NOT NULL,
  period_start INTEGER NOT NULL,
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, quest_id, period_start),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
