-- Rematches and the quick match queue for the card game (worker/tcg.js).
-- The Worker also creates these tables itself at runtime (ensureTcgSchema), with
-- the same DDL, so a deploy never needs this run by hand. Purely additive.
--
-- tcg_rematches: one row per finished match, made when either player reads the
-- finished table. seen0/seen1 are when each seat last looked (a player gone for
-- TCG_TIMING.PRESENCE_MS has left, which closes any offer). status is '' (no
-- offer), 'open' (by_seat offered, with their deck), 'accepted' (next_id is the
-- new match), 'declined', 'cancelled', 'expired' or 'left' (by_seat is then who left).
--
-- tcg_queue: one row per player looking for a quick match, with the deck they
-- chose (checked like a challenge's). seen_at is their last poll; a stale row is
-- skipped and dropped. match_id is set once the Worker pairs them.
-- No coins, cards or rewards move: nothing here pays out.
CREATE TABLE IF NOT EXISTS tcg_rematches (
  match_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT '',
  by_seat INTEGER,
  deck TEXT,
  deck_name TEXT NOT NULL DEFAULT '',
  deadline INTEGER NOT NULL DEFAULT 0,
  next_id TEXT,
  seen0 INTEGER NOT NULL DEFAULT 0,
  seen1 INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tcg_rematches_due ON tcg_rematches(status, deadline);
CREATE TABLE IF NOT EXISTS tcg_queue (
  user_id TEXT PRIMARY KEY,
  format TEXT NOT NULL,
  deck TEXT NOT NULL,
  deck_name TEXT NOT NULL DEFAULT '',
  joined_at INTEGER NOT NULL,
  seen_at INTEGER NOT NULL,
  match_id TEXT
);
CREATE INDEX IF NOT EXISTS tcg_queue_format ON tcg_queue(format, match_id, joined_at);
