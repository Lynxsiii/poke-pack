-- Shopping cart checkouts and the sealed collection (kept, unopened product).
-- worker/orders.js runs the same statements on demand (ensureOrdersSchema), so a
-- deploy never needs this applied by hand; running it later replays harmlessly.
-- Purely additive: no existing table or row changes.

-- Sealed product a player bought and kept unopened, one row per product.
CREATE TABLE IF NOT EXISTS sealed_vault (
  user_id TEXT NOT NULL,
  set_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
  first_at INTEGER NOT NULL,
  last_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, set_id, product_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- One checkout or one vault open. The insert is the charge's guard: the unique
-- request id stops a double submit, the coins_after check an unaffordable one.
-- `plan` holds every row the opening writes, so it can be applied (or resumed)
-- from this row alone; `result` is what the player is shown, replayed as is.
CREATE TABLE IF NOT EXISTS sealed_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('checkout', 'open')),
  fingerprint TEXT NOT NULL,
  cost_cents INTEGER NOT NULL CHECK (cost_cents >= 0),
  coins_after REAL NOT NULL CHECK (coins_after >= 0),
  status TEXT NOT NULL CHECK (status IN ('paid', 'done')),
  plan TEXT,
  result TEXT,
  created_at INTEGER NOT NULL,
  done_at INTEGER,
  UNIQUE (user_id, request_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Which chunks of an order's plan are applied: a replayed chunk hits the key and aborts.
CREATE TABLE IF NOT EXISTS sealed_order_chunks (
  order_id TEXT NOT NULL,
  chunk INTEGER NOT NULL,
  PRIMARY KEY (order_id, chunk),
  FOREIGN KEY (order_id) REFERENCES sealed_orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sealed_orders_user_status ON sealed_orders(user_id, status);
