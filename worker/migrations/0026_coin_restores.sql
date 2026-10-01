-- One-off coin restores (worker/restores.js). Each restore id is paid once: the row is the receipt.
-- Created at runtime too, so an old database upgrades itself. Additive and safe to re-run.
CREATE TABLE IF NOT EXISTS coin_restores (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  coins REAL NOT NULL,
  reason TEXT NOT NULL,
  applied_at INTEGER NOT NULL
);
