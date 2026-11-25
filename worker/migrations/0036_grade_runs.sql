-- Auto-regrade runs (worker/grading-auto.js). The Worker runs the same
-- statements on demand (ensureAutoSchema), so a deploy never needs this applied
-- by hand. Purely additive: no existing table or row changes.
--
-- One row is one run: regrade slab_id (which follows the newest slab of the
-- run) until it lands at target or better (11 = a Black Label 10), stopping at
-- max_attempts tries or max_spend_cents spent. attempts and spent_cents move in
-- the same batch as each try's fee and slab rows. At most one run per player
-- is 'running'.
CREATE TABLE IF NOT EXISTS grade_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  reverse INTEGER NOT NULL DEFAULT 0 CHECK(reverse IN (0,1)),
  start_slab_id INTEGER NOT NULL,
  start_grade INTEGER NOT NULL,
  start_black INTEGER NOT NULL DEFAULT 0 CHECK(start_black IN (0,1)),
  slab_id INTEGER NOT NULL,
  target INTEGER NOT NULL CHECK(target BETWEEN 2 AND 11),
  max_spend_cents INTEGER CHECK(max_spend_cents IS NULL OR max_spend_cents > 0),
  max_attempts INTEGER NOT NULL CHECK(max_attempts > 0),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  spent_cents INTEGER NOT NULL DEFAULT 0 CHECK(spent_cents >= 0),
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','hit','stopped')),
  reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, request_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_grade_runs_running ON grade_runs(user_id) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS idx_grade_runs_user ON grade_runs(user_id, id DESC);
