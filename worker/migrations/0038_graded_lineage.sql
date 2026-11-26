-- Regrade lineage: the slab each regraded slab came out of. A regrade is a new cert with a new date (the old cert is
-- cracked); this keeps the chain, so a cert page can say when the copy was first graded and how many times since.
-- Additive: a new nullable column and an index. Applied lazily by ensureGradingSchema too (worker/grading.js), which
-- runs the same backfill once, from records only (auto-regrade tries name their run; a manual regrade is a crack of
-- the same copy at most 30 seconds before the new submit). A slab with no such record keeps NULL.
ALTER TABLE graded_cards ADD COLUMN regrade_of INTEGER;
CREATE INDEX IF NOT EXISTS idx_graded_cards_regrade ON graded_cards(regrade_of);
-- The auto-regrade table (0036, also made lazily by worker/grading-auto.js), so the backfill below can read it.
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
UPDATE graded_cards SET regrade_of = (
  SELECT CASE WHEN CAST(substr(graded_cards.request_id, instr(substr(graded_cards.request_id, 6), ':') + 6) AS INTEGER) = 1
    THEN r.start_slab_id
    ELSE (SELECT p.id FROM graded_cards p WHERE p.user_id = graded_cards.user_id AND p.request_id =
      'auto:' || r.id || ':' || (CAST(substr(graded_cards.request_id, instr(substr(graded_cards.request_id, 6), ':') + 6) AS INTEGER) - 1)) END
  FROM grade_runs r
  WHERE r.user_id = graded_cards.user_id
    AND r.id = substr(graded_cards.request_id, 6, instr(substr(graded_cards.request_id, 6), ':') - 1))
WHERE regrade_of IS NULL AND request_id LIKE 'auto:%:%';
UPDATE graded_cards SET regrade_of = (
  SELECT p.id FROM graded_cards p
  WHERE p.user_id = graded_cards.user_id AND p.card_id = graded_cards.card_id AND p.reverse = graded_cards.reverse
    AND p.status = 'cracked' AND p.id < graded_cards.id
    AND p.closed_at BETWEEN graded_cards.created_at - 30000 AND graded_cards.created_at
    AND NOT EXISTS (SELECT 1 FROM graded_cards s WHERE s.regrade_of = p.id)
  ORDER BY p.closed_at DESC, p.id DESC LIMIT 1)
WHERE regrade_of IS NULL AND request_id NOT LIKE 'auto:%' AND request_id NOT LIKE 'casino:%' AND fee_cents > 0;
