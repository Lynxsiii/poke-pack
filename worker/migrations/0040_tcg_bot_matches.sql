-- Tickets for matches against the house bot (worker/tcg.js /api/tcg/bot/*).
-- The Worker also creates this table itself at runtime (ensureTcgSchema), with the
-- same DDL, so a deploy never needs this run by hand. Purely additive.
-- A row is made when a bot match starts and closed once when it ends; paid = 1 when
-- the win counted toward XP (counters tcgEasyWins/tcgNormalWins/tcgHardWins).
-- No coins or cards move.
CREATE TABLE IF NOT EXISTS tcg_bot_matches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  level TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  won INTEGER NOT NULL DEFAULT 0,
  paid INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS tcg_bot_matches_user ON tcg_bot_matches(user_id, ended_at);
