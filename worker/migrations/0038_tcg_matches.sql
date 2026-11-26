-- Card game matches between two players (worker/tcg.js, docs/tcg-plan.md Phase 3).
-- The Worker also creates this table itself at runtime (ensureTcgSchema), with
-- the same DDL, so a deploy never needs this run by hand. Purely additive.
--
-- One row is a challenge and, once accepted, the match. p0 is the challenger
-- (seat 0 in the engine), p1 the challenged. The match is its seed plus its
-- action log (`log`, a JSON list of engine actions); `state` caches the engine
-- state after the last action so a move doesn't replay the whole game. `seq` is
-- the log length and doubles as the row version for optimistic updates.
-- No coins, cards or rewards move: nothing here pays out.
CREATE TABLE IF NOT EXISTS tcg_matches (
  id TEXT PRIMARY KEY,
  p0 TEXT NOT NULL,
  p1 TEXT NOT NULL,
  format TEXT NOT NULL,
  seed INTEGER NOT NULL,
  deck0 TEXT NOT NULL,
  deck1 TEXT,
  deck0_name TEXT NOT NULL DEFAULT '',
  deck1_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  log TEXT NOT NULL DEFAULT '[]',
  state TEXT,
  seq INTEGER NOT NULL DEFAULT 0,
  to_move TEXT NOT NULL DEFAULT '',
  deadline INTEGER NOT NULL,
  winner INTEGER,
  reason TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ended_at INTEGER
);
CREATE INDEX IF NOT EXISTS tcg_matches_p0 ON tcg_matches(p0, status);
CREATE INDEX IF NOT EXISTS tcg_matches_p1 ON tcg_matches(p1, status);
CREATE INDEX IF NOT EXISTS tcg_matches_due ON tcg_matches(status, deadline);
