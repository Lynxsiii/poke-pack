CREATE TABLE quest_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  amount INTEGER NOT NULL,
  at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_quest_events_user_at ON quest_events(user_id, at);

CREATE TABLE quest_claims (
  user_id TEXT NOT NULL,
  quest_id TEXT NOT NULL,
  period_start INTEGER NOT NULL,
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, quest_id, period_start),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
