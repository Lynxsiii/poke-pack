/* Trading schema (migration 0035_trades.sql is generated from this file by
   scripts/gen-trades-ddl.mjs; worker/trades.js applies the same statements to
   itself once per isolate, because no session can run remote migrations).
   Purely additive: two new tables and their triggers. Every statement is
   IF NOT EXISTS, so replaying it changes nothing.

   One row of `trades` is one offer from from_id to to_id. Nothing is held
   while it is open. The swap is ONE statement: the UPDATE that turns the row
   from 'open' to 'accepted'. trade_accept_check refuses it unless, at that
   instant, both players still own every card, slab and coin the offer names
   and the gap fits both daily limits; trade_accept then moves everything.
   SQLite runs the statement and its triggers as a unit, so two accepts, an
   accept racing a sale, or an accept racing a casino stake can never both
   win: nothing is ever copied and nothing is ever lost.

   give_* is what the sender hands over, take_* what the receiver hands over.
     cards  [{ id, qty, rev, name, number, rarity, image, small, v }]
            rev = how many of the qty are reverse holos; v = cents each when offered
     slabs  [{ id, cardId, grade, reverse, bl, name, number, rarity, image, small, v }]
            id = graded_cards.id; a slab changes hands without its guard
            (the guard unit stays with its owner, as in the casino)
     coins  whole cents
   give_value / take_value are each side's total in cents: written when the
   offer is made and written again, at that day's prices, by the accept.
   gift_* record the gap of an accepted trade (who was down, who was up, by how
   many cents, and the daily limit each had); the accept check sums them over
   the last 24 hours, so the limits hold even when two accepts race. */


/** "This card list is well formed" as a SQL condition that is true when it is NOT. */
const badCards = (col) => `EXISTS (
    SELECT 1 FROM json_each(NEW.${col}) s
    WHERE typeof(json_extract(s.value, '$.id')) != 'text'
      OR typeof(json_extract(s.value, '$.qty')) != 'integer' OR json_extract(s.value, '$.qty') < 1
      OR typeof(json_extract(s.value, '$.rev')) != 'integer' OR json_extract(s.value, '$.rev') < 0
      OR json_extract(s.value, '$.rev') > json_extract(s.value, '$.qty')
  ) OR EXISTS (
    SELECT 1 FROM json_each(NEW.${col}) s GROUP BY json_extract(s.value, '$.id') HAVING COUNT(*) > 1
  )`;
const badSlabs = (col) => `EXISTS (
    SELECT 1 FROM json_each(NEW.${col}) s
    WHERE typeof(json_extract(s.value, '$.id')) != 'integer' OR json_extract(s.value, '$.id') < 1
      OR typeof(json_extract(s.value, '$.cardId')) != 'text'
      OR typeof(json_extract(s.value, '$.grade')) != 'integer'
      OR json_extract(s.value, '$.reverse') NOT IN (0, 1) OR json_extract(s.value, '$.bl') NOT IN (0, 1)
  ) OR EXISTS (
    SELECT 1 FROM json_each(NEW.${col}) s GROUP BY json_extract(s.value, '$.id') HAVING COUNT(*) > 1
  )`;
/** True when `owner` does NOT hold every card of `col` right now (plain and reverse copies counted apart). */
const lacksCards = (col, owner) => `EXISTS (
    SELECT 1 FROM json_each(OLD.${col}) s
    LEFT JOIN cards c ON c.user_id = OLD.${owner} AND c.card_id = json_extract(s.value, '$.id')
    WHERE c.qty IS NULL OR c.qty < json_extract(s.value, '$.qty')
      OR c.reverse_qty < json_extract(s.value, '$.rev')
      OR json_extract(s.value, '$.qty') - json_extract(s.value, '$.rev') > c.qty - c.reverse_qty
  )`;
/** True when `owner` does NOT hold every slab of `col` right now: theirs, still slabbed, in no casino game, and the slab the offer described. */
const lacksSlabs = (col, owner) => `(
    SELECT COUNT(*) FROM json_each(OLD.${col}) s
    JOIN graded_cards g ON g.id = json_extract(s.value, '$.id') AND g.user_id = OLD.${owner}
      AND g.status = 'slabbed' AND g.locked IS NULL
      AND g.card_id = json_extract(s.value, '$.cardId') AND g.grade = json_extract(s.value, '$.grade')
      AND g.reverse = json_extract(s.value, '$.reverse') AND g.black_label = json_extract(s.value, '$.bl')
  ) != json_array_length(OLD.${col})`;
/** Take the cards of `col` out of `owner`'s collection. */
const takeCards = (col, owner) => `UPDATE cards SET
    qty = qty - (SELECT json_extract(s.value, '$.qty') FROM json_each(NEW.${col}) s
      WHERE json_extract(s.value, '$.id') = cards.card_id),
    reverse_qty = reverse_qty - (SELECT json_extract(s.value, '$.rev') FROM json_each(NEW.${col}) s
      WHERE json_extract(s.value, '$.id') = cards.card_id)
  WHERE user_id = NEW.${owner}
    AND card_id IN (SELECT json_extract(value, '$.id') FROM json_each(NEW.${col}))`;
/** Put the cards of `col` into `owner`'s collection. */
const putCards = (col, owner) => `INSERT INTO cards(user_id, card_id, qty, reverse_qty)
  SELECT NEW.${owner}, json_extract(value, '$.id'), json_extract(value, '$.qty'), json_extract(value, '$.rev')
  FROM json_each(NEW.${col}) WHERE true
  ON CONFLICT(user_id, card_id) DO UPDATE SET qty = cards.qty + excluded.qty,
    reverse_qty = cards.reverse_qty + excluded.reverse_qty`;
const dropEmpty = (col, owner) => `DELETE FROM cards WHERE user_id = NEW.${owner} AND qty <= 0
    AND card_id IN (SELECT json_extract(value, '$.id') FROM json_each(NEW.${col}))`;

export const TRADES_DDL = [
  `CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','accepted','declined','cancelled','countered','expired')),
  parent_id TEXT,
  give_cards TEXT NOT NULL DEFAULT '[]',
  give_slabs TEXT NOT NULL DEFAULT '[]',
  give_coins INTEGER NOT NULL DEFAULT 0 CHECK(typeof(give_coins) = 'integer' AND give_coins >= 0),
  take_cards TEXT NOT NULL DEFAULT '[]',
  take_slabs TEXT NOT NULL DEFAULT '[]',
  take_coins INTEGER NOT NULL DEFAULT 0 CHECK(typeof(take_coins) = 'integer' AND take_coins >= 0),
  give_value INTEGER NOT NULL CHECK(typeof(give_value) = 'integer' AND give_value >= 0),
  take_value INTEGER NOT NULL CHECK(typeof(take_value) = 'integer' AND take_value >= 0),
  gift_from TEXT,
  gift_to TEXT,
  gift_cents INTEGER NOT NULL DEFAULT 0 CHECK(typeof(gift_cents) = 'integer' AND gift_cents >= 0),
  gift_cap_from INTEGER,
  gift_cap_to INTEGER,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  closed_at INTEGER,
  UNIQUE(from_id, request_id),
  CHECK(from_id != to_id)
)`,
  "CREATE INDEX IF NOT EXISTS trades_to ON trades(to_id, status, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS trades_from ON trades(from_id, status, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS trades_gift_from ON trades(gift_from, closed_at)",
  "CREATE INDEX IF NOT EXISTS trades_gift_to ON trades(gift_to, closed_at)",

  // Who may send a player offers: 'all' (no row), 'friends' or 'none'.
  `CREATE TABLE IF NOT EXISTS trade_settings (
  user_id TEXT PRIMARY KEY,
  accept_from TEXT NOT NULL DEFAULT 'all' CHECK(accept_from IN ('all','friends','none')),
  updated_at INTEGER NOT NULL
)`,

  // An offer starts open, with well-formed lists, something in it, and no card or slab named twice.
  `CREATE TRIGGER IF NOT EXISTS trade_offer_check BEFORE INSERT ON trades BEGIN
  SELECT (CASE WHEN NEW.status != 'open' OR NEW.closed_at IS NOT NULL OR NEW.gift_cents != 0
    OR NEW.gift_from IS NOT NULL OR NEW.gift_to IS NOT NULL OR NEW.expires_at <= NEW.created_at
    THEN RAISE(ABORT, 'trade:not-open') END);
  SELECT (CASE WHEN json_type(NEW.give_cards) IS NOT 'array' OR json_type(NEW.take_cards) IS NOT 'array'
    OR json_type(NEW.give_slabs) IS NOT 'array' OR json_type(NEW.take_slabs) IS NOT 'array'
    OR json_array_length(NEW.give_cards) > 30 OR json_array_length(NEW.take_cards) > 30
    OR json_array_length(NEW.give_slabs) > 10 OR json_array_length(NEW.take_slabs) > 10
    OR (NEW.give_coins > 0 AND NEW.take_coins > 0)
    THEN RAISE(ABORT, 'trade:not-valid') END);
  SELECT (CASE WHEN json_array_length(NEW.give_cards) + json_array_length(NEW.take_cards)
    + json_array_length(NEW.give_slabs) + json_array_length(NEW.take_slabs) + NEW.give_coins + NEW.take_coins < 1
    THEN RAISE(ABORT, 'trade:empty') END);
  SELECT (CASE WHEN ${badCards("give_cards")} OR ${badCards("take_cards")}
    OR ${badSlabs("give_slabs")} OR ${badSlabs("take_slabs")}
    OR EXISTS (
      SELECT 1 FROM json_each(NEW.give_cards) a JOIN json_each(NEW.take_cards) b
        ON json_extract(a.value, '$.id') = json_extract(b.value, '$.id')
    ) OR EXISTS (
      SELECT 1 FROM json_each(NEW.give_slabs) a JOIN json_each(NEW.take_slabs) b
        ON json_extract(a.value, '$.id') = json_extract(b.value, '$.id')
    ) THEN RAISE(ABORT, 'trade:not-valid') END);
END`,

  // A closed offer never changes again: no second swap, no undo.
  `CREATE TRIGGER IF NOT EXISTS trade_final BEFORE UPDATE ON trades
WHEN OLD.status != 'open' BEGIN
  SELECT RAISE(ABORT, 'trade:closed');
END`,

  // What an offer names never changes after it is made. A counter is a new offer.
  `CREATE TRIGGER IF NOT EXISTS trade_frozen BEFORE UPDATE ON trades
WHEN NEW.id IS NOT OLD.id OR NEW.from_id IS NOT OLD.from_id OR NEW.to_id IS NOT OLD.to_id
  OR NEW.request_id IS NOT OLD.request_id OR NEW.parent_id IS NOT OLD.parent_id
  OR NEW.give_cards IS NOT OLD.give_cards OR NEW.give_slabs IS NOT OLD.give_slabs OR NEW.give_coins IS NOT OLD.give_coins
  OR NEW.take_cards IS NOT OLD.take_cards OR NEW.take_slabs IS NOT OLD.take_slabs OR NEW.take_coins IS NOT OLD.take_coins
  OR NEW.created_at IS NOT OLD.created_at OR NEW.expires_at IS NOT OLD.expires_at
  OR NEW.closed_at IS NULL
  OR (NEW.status != 'accepted' AND (NEW.gift_cents != 0 OR NEW.gift_from IS NOT NULL OR NEW.gift_to IS NOT NULL)) BEGIN
  SELECT RAISE(ABORT, 'trade:frozen');
END`,

  // The swap is allowed only if, right now, both players hold everything and the gap fits both daily limits.
  `CREATE TRIGGER IF NOT EXISTS trade_accept_check BEFORE UPDATE ON trades
WHEN OLD.status = 'open' AND NEW.status = 'accepted' BEGIN
  SELECT (CASE WHEN OLD.expires_at <= NEW.closed_at THEN RAISE(ABORT, 'trade:expired') END);
  SELECT (CASE WHEN (SELECT COUNT(*) FROM profiles WHERE user_id IN (OLD.from_id, OLD.to_id)) != 2
    THEN RAISE(ABORT, 'trade:no-account') END);
  SELECT (CASE WHEN ${lacksCards("give_cards", "from_id")} THEN RAISE(ABORT, 'trade:from-cards') END);
  SELECT (CASE WHEN ${lacksCards("take_cards", "to_id")} THEN RAISE(ABORT, 'trade:to-cards') END);
  SELECT (CASE WHEN ${lacksSlabs("give_slabs", "from_id")} THEN RAISE(ABORT, 'trade:from-slabs') END);
  SELECT (CASE WHEN ${lacksSlabs("take_slabs", "to_id")} THEN RAISE(ABORT, 'trade:to-slabs') END);
  SELECT (CASE WHEN OLD.give_coins > 0 AND (SELECT CAST(ROUND(coins * 100) AS INTEGER) FROM profiles WHERE user_id = OLD.from_id) < OLD.give_coins
    THEN RAISE(ABORT, 'trade:from-coins') END);
  SELECT (CASE WHEN OLD.take_coins > 0 AND (SELECT CAST(ROUND(coins * 100) AS INTEGER) FROM profiles WHERE user_id = OLD.to_id) < OLD.take_coins
    THEN RAISE(ABORT, 'trade:to-coins') END);
  -- The gap is the two totals' difference, given by the side that hands over more.
  SELECT (CASE WHEN NEW.gift_cents != ABS(NEW.give_value - NEW.take_value)
    OR (NEW.gift_cents > 0 AND (
      NEW.gift_from IS NOT (CASE WHEN NEW.give_value > NEW.take_value THEN OLD.from_id ELSE OLD.to_id END)
      OR NEW.gift_to IS NOT (CASE WHEN NEW.give_value > NEW.take_value THEN OLD.to_id ELSE OLD.from_id END)
      OR NEW.gift_cap_from IS NULL OR NEW.gift_cap_to IS NULL))
    OR (NEW.gift_cents = 0 AND (NEW.gift_from IS NOT NULL OR NEW.gift_to IS NOT NULL))
    THEN RAISE(ABORT, 'trade:not-valid') END);
  SELECT (CASE WHEN NEW.gift_cents > 0 AND (
    SELECT COALESCE(SUM(gift_cents), 0) FROM trades
    WHERE status = 'accepted' AND gift_from = NEW.gift_from AND closed_at > NEW.closed_at - 86400000
  ) + NEW.gift_cents > NEW.gift_cap_from THEN RAISE(ABORT, 'trade:gap-from') END);
  SELECT (CASE WHEN NEW.gift_cents > 0 AND (
    SELECT COALESCE(SUM(gift_cents), 0) FROM trades
    WHERE status = 'accepted' AND gift_to = NEW.gift_to AND closed_at > NEW.closed_at - 86400000
  ) + NEW.gift_cents > NEW.gift_cap_to THEN RAISE(ABORT, 'trade:gap-to') END);
END`,

  // The swap itself. Cards leave both collections, then land in the other; slabs change owner; coins move.
  `CREATE TRIGGER IF NOT EXISTS trade_accept AFTER UPDATE ON trades
WHEN OLD.status = 'open' AND NEW.status = 'accepted' BEGIN
  ${takeCards("give_cards", "from_id")};
  ${takeCards("take_cards", "to_id")};
  ${putCards("give_cards", "to_id")};
  ${putCards("take_cards", "from_id")};
  ${dropEmpty("give_cards", "from_id")};
  ${dropEmpty("take_cards", "to_id")};
  UPDATE graded_cards SET
    user_id = CASE WHEN user_id = NEW.from_id THEN NEW.to_id ELSE NEW.from_id END,
    guard = NULL, shown = 0, request_id = 'won:' || id
  WHERE status = 'slabbed' AND locked IS NULL AND (
    (user_id = NEW.from_id AND id IN (SELECT json_extract(value, '$.id') FROM json_each(NEW.give_slabs)))
    OR (user_id = NEW.to_id AND id IN (SELECT json_extract(value, '$.id') FROM json_each(NEW.take_slabs))));
  UPDATE profiles SET coins = ROUND(coins * 100 - NEW.give_coins + NEW.take_coins) / 100.0
  WHERE user_id = NEW.from_id AND NEW.give_coins + NEW.take_coins > 0;
  UPDATE profiles SET coins = ROUND(coins * 100 - NEW.take_coins + NEW.give_coins) / 100.0
  WHERE user_id = NEW.to_id AND NEW.give_coins + NEW.take_coins > 0;
END`,
];

/** Everything the DDL creates, by name: worker/trades.js checks these exist before trusting the schema. */
export const TRADES_OBJECTS = ["trades", "trade_settings", "trades_to", "trades_from", "trades_gift_from", "trades_gift_to",
  "trade_offer_check", "trade_final", "trade_frozen", "trade_accept_check", "trade_accept"];
