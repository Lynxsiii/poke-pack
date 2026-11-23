-- Player-to-player trading. Generated from worker/trades-ddl.js by scripts/gen-trades-ddl.mjs
-- (read that file for what each table and trigger does). worker/trades.js applies
-- the same statements on demand, so a deploy never needs this run by hand;
-- running it later replays harmlessly. Purely additive.
CREATE TABLE IF NOT EXISTS trades (
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
);

CREATE INDEX IF NOT EXISTS trades_to ON trades(to_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS trades_from ON trades(from_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS trades_gift_from ON trades(gift_from, closed_at);

CREATE INDEX IF NOT EXISTS trades_gift_to ON trades(gift_to, closed_at);

CREATE TABLE IF NOT EXISTS trade_settings (
  user_id TEXT PRIMARY KEY,
  accept_from TEXT NOT NULL DEFAULT 'all' CHECK(accept_from IN ('all','friends','none')),
  updated_at INTEGER NOT NULL
);

CREATE TRIGGER IF NOT EXISTS trade_offer_check BEFORE INSERT ON trades BEGIN
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
  SELECT (CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.give_cards) s
    WHERE typeof(json_extract(s.value, '$.id')) != 'text'
      OR typeof(json_extract(s.value, '$.qty')) != 'integer' OR json_extract(s.value, '$.qty') < 1
      OR typeof(json_extract(s.value, '$.rev')) != 'integer' OR json_extract(s.value, '$.rev') < 0
      OR json_extract(s.value, '$.rev') > json_extract(s.value, '$.qty')
  ) OR EXISTS (
    SELECT 1 FROM json_each(NEW.give_cards) s GROUP BY json_extract(s.value, '$.id') HAVING COUNT(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM json_each(NEW.take_cards) s
    WHERE typeof(json_extract(s.value, '$.id')) != 'text'
      OR typeof(json_extract(s.value, '$.qty')) != 'integer' OR json_extract(s.value, '$.qty') < 1
      OR typeof(json_extract(s.value, '$.rev')) != 'integer' OR json_extract(s.value, '$.rev') < 0
      OR json_extract(s.value, '$.rev') > json_extract(s.value, '$.qty')
  ) OR EXISTS (
    SELECT 1 FROM json_each(NEW.take_cards) s GROUP BY json_extract(s.value, '$.id') HAVING COUNT(*) > 1
  )
    OR EXISTS (
    SELECT 1 FROM json_each(NEW.give_slabs) s
    WHERE typeof(json_extract(s.value, '$.id')) != 'integer' OR json_extract(s.value, '$.id') < 1
      OR typeof(json_extract(s.value, '$.cardId')) != 'text'
      OR typeof(json_extract(s.value, '$.grade')) != 'integer'
      OR json_extract(s.value, '$.reverse') NOT IN (0, 1) OR json_extract(s.value, '$.bl') NOT IN (0, 1)
  ) OR EXISTS (
    SELECT 1 FROM json_each(NEW.give_slabs) s GROUP BY json_extract(s.value, '$.id') HAVING COUNT(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM json_each(NEW.take_slabs) s
    WHERE typeof(json_extract(s.value, '$.id')) != 'integer' OR json_extract(s.value, '$.id') < 1
      OR typeof(json_extract(s.value, '$.cardId')) != 'text'
      OR typeof(json_extract(s.value, '$.grade')) != 'integer'
      OR json_extract(s.value, '$.reverse') NOT IN (0, 1) OR json_extract(s.value, '$.bl') NOT IN (0, 1)
  ) OR EXISTS (
    SELECT 1 FROM json_each(NEW.take_slabs) s GROUP BY json_extract(s.value, '$.id') HAVING COUNT(*) > 1
  )
    OR EXISTS (
      SELECT 1 FROM json_each(NEW.give_cards) a JOIN json_each(NEW.take_cards) b
        ON json_extract(a.value, '$.id') = json_extract(b.value, '$.id')
    ) OR EXISTS (
      SELECT 1 FROM json_each(NEW.give_slabs) a JOIN json_each(NEW.take_slabs) b
        ON json_extract(a.value, '$.id') = json_extract(b.value, '$.id')
    ) THEN RAISE(ABORT, 'trade:not-valid') END);
END;

CREATE TRIGGER IF NOT EXISTS trade_final BEFORE UPDATE ON trades
WHEN OLD.status != 'open' BEGIN
  SELECT RAISE(ABORT, 'trade:closed');
END;

CREATE TRIGGER IF NOT EXISTS trade_frozen BEFORE UPDATE ON trades
WHEN NEW.id IS NOT OLD.id OR NEW.from_id IS NOT OLD.from_id OR NEW.to_id IS NOT OLD.to_id
  OR NEW.request_id IS NOT OLD.request_id OR NEW.parent_id IS NOT OLD.parent_id
  OR NEW.give_cards IS NOT OLD.give_cards OR NEW.give_slabs IS NOT OLD.give_slabs OR NEW.give_coins IS NOT OLD.give_coins
  OR NEW.take_cards IS NOT OLD.take_cards OR NEW.take_slabs IS NOT OLD.take_slabs OR NEW.take_coins IS NOT OLD.take_coins
  OR NEW.created_at IS NOT OLD.created_at OR NEW.expires_at IS NOT OLD.expires_at
  OR NEW.closed_at IS NULL
  OR (NEW.status != 'accepted' AND (NEW.gift_cents != 0 OR NEW.gift_from IS NOT NULL OR NEW.gift_to IS NOT NULL)) BEGIN
  SELECT RAISE(ABORT, 'trade:frozen');
END;

CREATE TRIGGER IF NOT EXISTS trade_accept_check BEFORE UPDATE ON trades
WHEN OLD.status = 'open' AND NEW.status = 'accepted' BEGIN
  SELECT (CASE WHEN OLD.expires_at <= NEW.closed_at THEN RAISE(ABORT, 'trade:expired') END);
  SELECT (CASE WHEN (SELECT COUNT(*) FROM profiles WHERE user_id IN (OLD.from_id, OLD.to_id)) != 2
    THEN RAISE(ABORT, 'trade:no-account') END);
  SELECT (CASE WHEN EXISTS (
    SELECT 1 FROM json_each(OLD.give_cards) s
    LEFT JOIN cards c ON c.user_id = OLD.from_id AND c.card_id = json_extract(s.value, '$.id')
    WHERE c.qty IS NULL OR c.qty < json_extract(s.value, '$.qty')
      OR c.reverse_qty < json_extract(s.value, '$.rev')
      OR json_extract(s.value, '$.qty') - json_extract(s.value, '$.rev') > c.qty - c.reverse_qty
  ) THEN RAISE(ABORT, 'trade:from-cards') END);
  SELECT (CASE WHEN EXISTS (
    SELECT 1 FROM json_each(OLD.take_cards) s
    LEFT JOIN cards c ON c.user_id = OLD.to_id AND c.card_id = json_extract(s.value, '$.id')
    WHERE c.qty IS NULL OR c.qty < json_extract(s.value, '$.qty')
      OR c.reverse_qty < json_extract(s.value, '$.rev')
      OR json_extract(s.value, '$.qty') - json_extract(s.value, '$.rev') > c.qty - c.reverse_qty
  ) THEN RAISE(ABORT, 'trade:to-cards') END);
  SELECT (CASE WHEN (
    SELECT COUNT(*) FROM json_each(OLD.give_slabs) s
    JOIN graded_cards g ON g.id = json_extract(s.value, '$.id') AND g.user_id = OLD.from_id
      AND g.status = 'slabbed' AND g.locked IS NULL
      AND g.card_id = json_extract(s.value, '$.cardId') AND g.grade = json_extract(s.value, '$.grade')
      AND g.reverse = json_extract(s.value, '$.reverse') AND g.black_label = json_extract(s.value, '$.bl')
  ) != json_array_length(OLD.give_slabs) THEN RAISE(ABORT, 'trade:from-slabs') END);
  SELECT (CASE WHEN (
    SELECT COUNT(*) FROM json_each(OLD.take_slabs) s
    JOIN graded_cards g ON g.id = json_extract(s.value, '$.id') AND g.user_id = OLD.to_id
      AND g.status = 'slabbed' AND g.locked IS NULL
      AND g.card_id = json_extract(s.value, '$.cardId') AND g.grade = json_extract(s.value, '$.grade')
      AND g.reverse = json_extract(s.value, '$.reverse') AND g.black_label = json_extract(s.value, '$.bl')
  ) != json_array_length(OLD.take_slabs) THEN RAISE(ABORT, 'trade:to-slabs') END);
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
END;

CREATE TRIGGER IF NOT EXISTS trade_accept AFTER UPDATE ON trades
WHEN OLD.status = 'open' AND NEW.status = 'accepted' BEGIN
  UPDATE cards SET
    qty = qty - (SELECT json_extract(s.value, '$.qty') FROM json_each(NEW.give_cards) s
      WHERE json_extract(s.value, '$.id') = cards.card_id),
    reverse_qty = reverse_qty - (SELECT json_extract(s.value, '$.rev') FROM json_each(NEW.give_cards) s
      WHERE json_extract(s.value, '$.id') = cards.card_id)
  WHERE user_id = NEW.from_id
    AND card_id IN (SELECT json_extract(value, '$.id') FROM json_each(NEW.give_cards));
  UPDATE cards SET
    qty = qty - (SELECT json_extract(s.value, '$.qty') FROM json_each(NEW.take_cards) s
      WHERE json_extract(s.value, '$.id') = cards.card_id),
    reverse_qty = reverse_qty - (SELECT json_extract(s.value, '$.rev') FROM json_each(NEW.take_cards) s
      WHERE json_extract(s.value, '$.id') = cards.card_id)
  WHERE user_id = NEW.to_id
    AND card_id IN (SELECT json_extract(value, '$.id') FROM json_each(NEW.take_cards));
  INSERT INTO cards(user_id, card_id, qty, reverse_qty)
  SELECT NEW.to_id, json_extract(value, '$.id'), json_extract(value, '$.qty'), json_extract(value, '$.rev')
  FROM json_each(NEW.give_cards) WHERE true
  ON CONFLICT(user_id, card_id) DO UPDATE SET qty = cards.qty + excluded.qty,
    reverse_qty = cards.reverse_qty + excluded.reverse_qty;
  INSERT INTO cards(user_id, card_id, qty, reverse_qty)
  SELECT NEW.from_id, json_extract(value, '$.id'), json_extract(value, '$.qty'), json_extract(value, '$.rev')
  FROM json_each(NEW.take_cards) WHERE true
  ON CONFLICT(user_id, card_id) DO UPDATE SET qty = cards.qty + excluded.qty,
    reverse_qty = cards.reverse_qty + excluded.reverse_qty;
  DELETE FROM cards WHERE user_id = NEW.from_id AND qty <= 0
    AND card_id IN (SELECT json_extract(value, '$.id') FROM json_each(NEW.give_cards));
  DELETE FROM cards WHERE user_id = NEW.to_id AND qty <= 0
    AND card_id IN (SELECT json_extract(value, '$.id') FROM json_each(NEW.take_cards));
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
END;
