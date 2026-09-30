-- Sleeves and coins: the cosmetics that come in sealed products.
-- worker/gear.js runs the same statements on demand (ensureGearSchema), so a
-- deploy never needs this applied by hand; running it later replays harmlessly.
-- Purely additive: no existing table or row changes.

CREATE TABLE IF NOT EXISTS user_gear (
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  item_id TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  first_at INTEGER NOT NULL,
  last_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, kind, item_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS gear_equipped (
  user_id TEXT PRIMARY KEY,
  sleeve TEXT,
  coin TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_gear_user ON user_gear(user_id, first_at DESC);
