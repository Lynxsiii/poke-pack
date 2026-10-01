-- Casino Upgrader (js/upgrader-rules.js, worker/upgrader.js). worker/upgrader.js applies this same DDL to itself once per
-- isolate (UPGRADER_DDL in worker/casino-ddl.js, generated from this file by scripts/gen-casino-ddl.mjs), because no
-- session can run remote migrations; every statement is IF NOT EXISTS, so running this file later is harmless. Purely
-- additive: one new table, two indexes and three triggers; nothing existing is touched.
--
-- One row is one upgrade: the player puts up cards and/or graded slabs (the stake, valued like every casino stake: cards at
-- sellValue, slabs at gradedValue, frozen in cents) and picks a target worth more (any card, or any sealed product the shop
-- sells). The Worker rolls once; the row records the roll and the triggers do the rest in the same transaction:
--   chance (millionths) = MIN(800000, stake_value * 950000 / target_value)      the 5% house edge, an 80% cap
--   won                 = roll < chance                                         roll is one of the million values 0 to 999999
-- so a Worker that computes either wrongly is refused by upgrade_check, and the expected value of any upgrade is at most
-- 95% of the stake. The stake is consumed win or lose (cards leave `cards`, slabs are closed like a slab that loses to
-- a bot: status 'sold', 0 cents, sell_request_id 'casino:upgrader:<id>', guard stripped; the guard unit stays with the
-- player as free stock). A win puts one plain copy of the target card in `cards`, or one copy of the sealed product in
-- `sealed_vault`. An upgrade is over the moment it is inserted: nothing is open, so there is no expiry, cancel or
-- account-delete guard, and a row never changes (upgrade_final).
CREATE TABLE IF NOT EXISTS upgrades (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  stake TEXT NOT NULL,
  slabs TEXT,
  stake_value INTEGER NOT NULL CHECK(stake_value > 0),
  target_kind TEXT NOT NULL CHECK(target_kind IN ('card','sealed')),
  target_id TEXT NOT NULL,
  target_set TEXT,
  target TEXT NOT NULL,
  target_value INTEGER NOT NULL CHECK(target_value > stake_value),
  chance INTEGER NOT NULL CHECK(chance BETWEEN 1 AND 800000),
  roll INTEGER NOT NULL CHECK(roll BETWEEN 0 AND 999999),
  won INTEGER NOT NULL CHECK(won IN (0,1)),
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, request_id)
);
CREATE INDEX IF NOT EXISTS upgrades_recent ON upgrades(created_at DESC);
CREATE INDEX IF NOT EXISTS upgrades_user ON upgrades(user_id, created_at DESC);

CREATE TRIGGER IF NOT EXISTS upgrade_check BEFORE INSERT ON upgrades BEGIN
  -- The odds are the rules, not the Worker's word: the chance is exactly the formula and the result exactly follows the roll.
  SELECT (CASE WHEN NEW.chance IS NOT MIN(800000, (NEW.stake_value * 950000) / NEW.target_value)
    OR NEW.won IS NOT (NEW.roll < NEW.chance)
    THEN RAISE(ABORT, 'That upgrade is not valid.') END);
  SELECT (CASE WHEN NEW.target_id = '' OR json_type(NEW.target) != 'object'
    OR (NEW.target_kind = 'card' AND NEW.target_set IS NOT NULL)
    OR (NEW.target_kind = 'sealed' AND (NEW.target_set IS NULL OR NEW.target_set = ''))
    THEN RAISE(ABORT, 'That target is not valid.') END);
  SELECT (CASE WHEN NEW.slabs IS NOT NULL AND (json_type(NEW.slabs) != 'array' OR json_array_length(NEW.slabs) > 10)
    THEN RAISE(ABORT, 'That stake is not valid.') END);
  SELECT (CASE WHEN json_type(NEW.stake) != 'array'
    OR json_array_length(NEW.stake) + COALESCE(json_array_length(NEW.slabs), 0) < 1
    THEN RAISE(ABORT, 'Put up at least one card.') END);
  SELECT (CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.stake) s
    WHERE typeof(json_extract(s.value, '$.qty')) != 'integer' OR json_extract(s.value, '$.qty') < 1
      OR typeof(json_extract(s.value, '$.rev')) != 'integer' OR json_extract(s.value, '$.rev') < 0
      OR json_extract(s.value, '$.rev') > json_extract(s.value, '$.qty')
      OR typeof(json_extract(s.value, '$.v')) != 'integer' OR json_extract(s.value, '$.v') < 0
  ) OR EXISTS (
    SELECT 1 FROM json_each(NEW.stake) s GROUP BY json_extract(s.value, '$.id') HAVING COUNT(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM json_each(NEW.slabs) s
    WHERE typeof(json_extract(s.value, '$.id')) != 'integer' OR json_extract(s.value, '$.id') < 1
      OR typeof(json_extract(s.value, '$.v')) != 'integer' OR json_extract(s.value, '$.v') < 0
  ) OR EXISTS (
    SELECT 1 FROM json_each(NEW.slabs) s GROUP BY json_extract(s.value, '$.id') HAVING COUNT(*) > 1
  ) THEN RAISE(ABORT, 'That stake is not valid.') END);
  -- The stake's value is exactly what its cards and slabs add up to.
  SELECT (CASE WHEN NEW.stake_value != COALESCE((SELECT SUM(json_extract(s.value, '$.v') * json_extract(s.value, '$.qty')) FROM json_each(NEW.stake) s), 0)
    + COALESCE((SELECT SUM(json_extract(s.value, '$.v')) FROM json_each(NEW.slabs) s), 0)
    THEN RAISE(ABORT, 'That stake is not valid.') END);
  SELECT (CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.stake) s
    LEFT JOIN cards c ON c.user_id = NEW.user_id AND c.card_id = json_extract(s.value, '$.id')
    WHERE c.qty IS NULL OR c.qty < json_extract(s.value, '$.qty')
      OR c.reverse_qty < json_extract(s.value, '$.rev')
      OR json_extract(s.value, '$.qty') - json_extract(s.value, '$.rev') > c.qty - c.reverse_qty
  ) THEN RAISE(ABORT, 'You no longer have those cards.') END);
  -- Every slab is the player's own, still slabbed, in no game, and is what the snapshot says.
  SELECT (CASE WHEN NEW.slabs IS NOT NULL AND (
    SELECT COUNT(*) FROM json_each(NEW.slabs) s
    JOIN graded_cards g ON g.id = json_extract(s.value, '$.id') AND g.user_id = NEW.user_id
      AND g.status = 'slabbed' AND g.locked IS NULL
      AND g.card_id = json_extract(s.value, '$.cardId') AND g.grade = json_extract(s.value, '$.grade')
      AND g.reverse = json_extract(s.value, '$.reverse') AND g.guard IS json_extract(s.value, '$.guard')
  ) != json_array_length(NEW.slabs) THEN RAISE(ABORT, 'You no longer have those slabs.') END);
END;

CREATE TRIGGER IF NOT EXISTS upgrade_take AFTER INSERT ON upgrades BEGIN
  -- The stake leaves the player, win or lose.
  UPDATE cards SET
    qty = qty - (SELECT json_extract(s.value, '$.qty') FROM json_each(NEW.stake) s
      WHERE json_extract(s.value, '$.id') = cards.card_id),
    reverse_qty = reverse_qty - (SELECT json_extract(s.value, '$.rev') FROM json_each(NEW.stake) s
      WHERE json_extract(s.value, '$.id') = cards.card_id)
  WHERE user_id = NEW.user_id
    AND card_id IN (SELECT json_extract(value, '$.id') FROM json_each(NEW.stake));
  DELETE FROM cards WHERE user_id = NEW.user_id AND qty <= 0
    AND card_id IN (SELECT json_extract(value, '$.id') FROM json_each(NEW.stake));
  -- The stake's slabs close like a slab that loses to a bot (the guard unit stays with the player as free stock).
  UPDATE graded_cards SET status = 'sold', closed_at = NEW.created_at, guard = NULL, shown = 0, locked = NULL,
    sold_cents = 0, sell_request_id = 'casino:upgrader:' || NEW.id
  WHERE user_id = NEW.user_id AND status = 'slabbed' AND locked IS NULL
    AND id IN (SELECT json_extract(value, '$.id') FROM json_each(NEW.slabs));
  -- A win: one plain copy of the card, or one copy of the sealed product in the Sealed collection.
  INSERT INTO cards(user_id, card_id, qty, reverse_qty)
  SELECT NEW.user_id, NEW.target_id, 1, 0 WHERE NEW.won = 1 AND NEW.target_kind = 'card'
  ON CONFLICT(user_id, card_id) DO UPDATE SET qty = cards.qty + 1;
  INSERT INTO sealed_vault(user_id, set_id, product_id, qty, first_at, last_at)
  SELECT NEW.user_id, NEW.target_set, NEW.target_id, 1, NEW.created_at, NEW.created_at WHERE NEW.won = 1 AND NEW.target_kind = 'sealed'
  ON CONFLICT(user_id, set_id, product_id) DO UPDATE SET qty = sealed_vault.qty + 1, last_at = excluded.last_at;
  UPDATE users SET last_played = NEW.created_at WHERE id = NEW.user_id;
END;

-- An upgrade is over the moment it is inserted and never changes again.
CREATE TRIGGER IF NOT EXISTS upgrade_final BEFORE UPDATE ON upgrades BEGIN
  SELECT RAISE(ABORT, 'An upgrade is final.');
END;
