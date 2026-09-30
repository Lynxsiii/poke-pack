-- RIP Grading: graded copies ("slabs") and the coin purchases of slab guards.
-- worker/grading.js runs the same statements on demand (ensureGradingSchema),
-- so a deploy never needs this applied by hand; running it later replays
-- harmlessly. Purely additive: no existing table or row changes.
--
-- One row of graded_cards is one copy that left `cards` for a slab. While it
-- is 'slabbed' the copy still counts as owned (worker/index.js ownedCardsFor
-- unions active slabs). Cracking it puts the copy back into `cards` and sets
-- 'cracked'; selling credits the graded value and sets 'sold'. A slab never
-- returns to 'slabbed'. sell_request_id / sold_cents make a sell idempotent:
-- the same requestId on a sold slab answers with the value it already paid.
CREATE TABLE IF NOT EXISTS graded_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  reverse INTEGER NOT NULL DEFAULT 0 CHECK(reverse IN (0,1)),
  grade INTEGER NOT NULL CHECK(grade BETWEEN 1 AND 10),
  band TEXT NOT NULL,
  fee_cents INTEGER NOT NULL CHECK(fee_cents >= 0),
  request_id TEXT NOT NULL,
  guard TEXT,
  status TEXT NOT NULL DEFAULT 'slabbed' CHECK(status IN ('slabbed','cracked','sold')),
  created_at INTEGER NOT NULL,
  closed_at INTEGER,
  sell_request_id TEXT,
  sold_cents INTEGER,
  UNIQUE(user_id, request_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_graded_cards_user ON graded_cards(user_id, status);

-- One row per coin purchase of gear (today: slab guards), keyed by the
-- client's requestId so a retried purchase is a no-op.
CREATE TABLE IF NOT EXISTS gear_purchases (
  user_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  item_id TEXT NOT NULL,
  qty INTEGER NOT NULL CHECK(qty > 0),
  cents INTEGER NOT NULL CHECK(cents >= 0),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, request_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_gear_purchases_user ON gear_purchases(user_id, created_at DESC);
