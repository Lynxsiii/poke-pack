-- The free first pack (worker/first-rip.js makes this on demand too).
CREATE TABLE IF NOT EXISTS first_rips (
  id TEXT PRIMARY KEY,
  ip_key TEXT,
  set_id TEXT NOT NULL,
  wrapper_id TEXT NOT NULL,
  cards TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  user_id TEXT,
  claimed_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS first_rips_user ON first_rips (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS first_rips_ip ON first_rips (ip_key, created_at);
