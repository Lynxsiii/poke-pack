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

-- Counts a settled battle (and each win) for the human seats. Needs 0012's
-- battle tables. Same statement as BATTLE_STATS_TRIGGER in worker/stats.js.
CREATE TRIGGER IF NOT EXISTS battle_settle_quest_stats AFTER INSERT ON battle_settlements BEGIN
  INSERT INTO quest_events (user_id, kind, amount, at)
  SELECT s.user_id, 'battles', 1, NEW.at FROM battle_seats s
  WHERE s.battle_id = NEW.battle_id AND s.bot = 0 AND s.user_id IN (SELECT id FROM users);
  INSERT INTO quest_events (user_id, kind, amount, at)
  SELECT s.user_id, 'battleWins', 1, NEW.at FROM battle_seats s JOIN battles b ON b.id = s.battle_id
  WHERE s.battle_id = NEW.battle_id AND s.bot = 0 AND s.user_id IN (SELECT id FROM users)
    AND EXISTS (SELECT 1 FROM json_each(b.result, '$.winners') w WHERE w.value = s.seat);
  INSERT INTO player_stats (user_id, key, value)
  SELECT s.user_id, 'battles', 1 FROM battle_seats s
  WHERE s.battle_id = NEW.battle_id AND s.bot = 0 AND s.user_id IN (SELECT id FROM users)
  ON CONFLICT(user_id, key) DO UPDATE SET value = value + 1;
  INSERT INTO player_stats (user_id, key, value)
  SELECT s.user_id, 'battleWins', 1 FROM battle_seats s JOIN battles b ON b.id = s.battle_id
  WHERE s.battle_id = NEW.battle_id AND s.bot = 0 AND s.user_id IN (SELECT id FROM users)
    AND EXISTS (SELECT 1 FROM json_each(b.result, '$.winners') w WHERE w.value = s.seat)
  ON CONFLICT(user_id, key) DO UPDATE SET value = value + 1;
END;
