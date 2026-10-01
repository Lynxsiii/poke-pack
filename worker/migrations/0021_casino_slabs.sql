-- Graded slabs in the casino (coinflip and jackpot). worker/casino-slabs.js
-- applies this same file to itself once per isolate (SLABS_COLUMNS and
-- SLABS_DDL in worker/casino-ddl.js, generated from it by
-- scripts/gen-casino-ddl.mjs), because no session can run remote migrations.
-- Purely additive: three new columns and new triggers; nothing is dropped, and
-- every row that exists keeps working (a NULL slab column means "no slabs").
--
-- A stake is raw cards and/or slabs. A slab is a graded_cards row. Staking it
-- sets graded_cards.locked = '<game>:<gameId>' and shown = 0 (escrow: every
-- "my active slabs" query adds `locked IS NULL`, so it leaves its owner's
-- slabs exactly like a staked raw card leaves `cards`). The stake's slab list
-- is a JSON array of snapshots
--   { id, cardId, name, number, rarity, image, small, grade, reverse, guard, v }
-- (v is the graded value in cents, frozen at stake time; id is graded_cards.id).
-- Slabs only ever change hands in the triggers below, in the same transaction
-- as the game: a cancel, expiry or leave unlocks them, a settle gives them to
-- the winner (guard stripped, the guard unit stays with the old owner as free
-- stock; request_id becomes 'won:<id>' so UNIQUE(user_id, request_id) can never
-- collide), and a bot or house win closes them like cards that vanish into the
-- house (status 'sold', sold_cents 0). Bots and the house never carry slabs.
--
-- The three triggers that already existed (coinflip_stake_check,
-- coinflip_settle_check, jackpot_entry_check) are replaced inside one atomic
-- batch; the marker comment below is how the Worker knows it already ran. An
-- open game created before this migration has NULL slab columns and settles,
-- cancels and expires exactly as before.
ALTER TABLE graded_cards ADD COLUMN locked TEXT;
ALTER TABLE coinflips ADD COLUMN host_slabs TEXT;
ALTER TABLE coinflips ADD COLUMN guest_slabs TEXT;
ALTER TABLE jackpot_entries ADD COLUMN slabs TEXT;

-- ---- Coinflip ---------------------------------------------------------------
DROP TRIGGER IF EXISTS coinflip_stake_check;
CREATE TRIGGER coinflip_stake_check BEFORE INSERT ON coinflips BEGIN
  /* slabs-v1 */
  SELECT (CASE WHEN NEW.status != 'open' OR NEW.guest_id IS NOT NULL OR NEW.winner IS NOT NULL OR NEW.guest_slabs IS NOT NULL
    THEN RAISE(ABORT, 'A flip starts open.') END);
  SELECT (CASE WHEN NEW.host_slabs IS NOT NULL AND (json_type(NEW.host_slabs) != 'array' OR json_array_length(NEW.host_slabs) > 10)
    THEN RAISE(ABORT, 'That stake is not valid.') END);
  SELECT (CASE WHEN json_type(NEW.host_stake) != 'array'
    OR json_array_length(NEW.host_stake) + COALESCE(json_array_length(NEW.host_slabs), 0) < 1
    THEN RAISE(ABORT, 'Put up at least one card.') END);
  SELECT (CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.host_stake) s
    WHERE typeof(json_extract(s.value, '$.qty')) != 'integer' OR json_extract(s.value, '$.qty') < 1
      OR typeof(json_extract(s.value, '$.rev')) != 'integer' OR json_extract(s.value, '$.rev') < 0
      OR json_extract(s.value, '$.rev') > json_extract(s.value, '$.qty')
  ) OR EXISTS (
    SELECT 1 FROM json_each(NEW.host_stake) s GROUP BY json_extract(s.value, '$.id') HAVING COUNT(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM json_each(NEW.host_slabs) s
    WHERE typeof(json_extract(s.value, '$.id')) != 'integer' OR json_extract(s.value, '$.id') < 1
      OR typeof(json_extract(s.value, '$.v')) != 'integer' OR json_extract(s.value, '$.v') < 0
  ) OR EXISTS (
    SELECT 1 FROM json_each(NEW.host_slabs) s GROUP BY json_extract(s.value, '$.id') HAVING COUNT(*) > 1
  ) THEN RAISE(ABORT, 'That stake is not valid.') END);
  SELECT (CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.host_stake) s
    LEFT JOIN cards c ON c.user_id = NEW.host_id AND c.card_id = json_extract(s.value, '$.id')
    WHERE c.qty IS NULL OR c.qty < json_extract(s.value, '$.qty')
      OR c.reverse_qty < json_extract(s.value, '$.rev')
      OR json_extract(s.value, '$.qty') - json_extract(s.value, '$.rev') > c.qty - c.reverse_qty
  ) THEN RAISE(ABORT, 'You no longer have those cards.') END);
  -- Every slab is the host's own, still slabbed, in no other game, and is what the snapshot says.
  SELECT (CASE WHEN NEW.host_slabs IS NOT NULL AND (
    SELECT COUNT(*) FROM json_each(NEW.host_slabs) s
    JOIN graded_cards g ON g.id = json_extract(s.value, '$.id') AND g.user_id = NEW.host_id
      AND g.status = 'slabbed' AND g.locked IS NULL
      AND g.card_id = json_extract(s.value, '$.cardId') AND g.grade = json_extract(s.value, '$.grade')
      AND g.reverse = json_extract(s.value, '$.reverse') AND g.guard IS json_extract(s.value, '$.guard')
  ) != json_array_length(NEW.host_slabs) THEN RAISE(ABORT, 'You no longer have those slabs.') END);
END;

DROP TRIGGER IF EXISTS coinflip_settle_check;
CREATE TRIGGER coinflip_settle_check BEFORE UPDATE ON coinflips
WHEN OLD.status = 'open' AND NEW.status = 'done' BEGIN
  /* slabs-v1 */
  SELECT (CASE WHEN NEW.guest_id IS NULL OR NEW.guest_id = OLD.host_id OR NEW.winner IS NULL
    OR NEW.guest_stake IS NULL OR NEW.guest_value IS NULL OR NEW.host_stake != OLD.host_stake
    OR NEW.host_slabs IS NOT OLD.host_slabs
    OR json_type(NEW.guest_stake) != 'array'
    OR json_array_length(NEW.guest_stake) + COALESCE(json_array_length(NEW.guest_slabs), 0) < 1
    THEN RAISE(ABORT, 'That flip cannot be settled.') END);
  SELECT (CASE WHEN NEW.guest_id != 'house' AND OLD.expires_at <=
    CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
    THEN RAISE(ABORT, 'That flip has expired.') END);
  -- The house never carries slabs; a human guest carries at most 10.
  SELECT (CASE WHEN NEW.guest_slabs IS NOT NULL AND (json_type(NEW.guest_slabs) != 'array' OR json_array_length(NEW.guest_slabs) > 10
    OR (NEW.guest_id = 'house' AND json_array_length(NEW.guest_slabs) > 0))
    THEN RAISE(ABORT, 'That stake is not valid.') END);
  SELECT (CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.guest_stake) s
    WHERE typeof(json_extract(s.value, '$.qty')) != 'integer' OR json_extract(s.value, '$.qty') < 1
      OR typeof(json_extract(s.value, '$.rev')) != 'integer' OR json_extract(s.value, '$.rev') < 0
      OR json_extract(s.value, '$.rev') > json_extract(s.value, '$.qty')
  ) OR EXISTS (
    SELECT 1 FROM json_each(NEW.guest_stake) s GROUP BY json_extract(s.value, '$.id') HAVING COUNT(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM json_each(NEW.guest_slabs) s
    WHERE typeof(json_extract(s.value, '$.id')) != 'integer' OR json_extract(s.value, '$.id') < 1
      OR typeof(json_extract(s.value, '$.v')) != 'integer' OR json_extract(s.value, '$.v') < 0
  ) OR EXISTS (
    SELECT 1 FROM json_each(NEW.guest_slabs) s GROUP BY json_extract(s.value, '$.id') HAVING COUNT(*) > 1
  ) THEN RAISE(ABORT, 'That stake is not valid.') END);
  SELECT (CASE WHEN NEW.guest_id != 'house' AND EXISTS (
    SELECT 1 FROM json_each(NEW.guest_stake) s
    LEFT JOIN cards c ON c.user_id = NEW.guest_id AND c.card_id = json_extract(s.value, '$.id')
    WHERE c.qty IS NULL OR c.qty < json_extract(s.value, '$.qty')
      OR c.reverse_qty < json_extract(s.value, '$.rev')
      OR json_extract(s.value, '$.qty') - json_extract(s.value, '$.rev') > c.qty - c.reverse_qty
  ) THEN RAISE(ABORT, 'You no longer have those cards.') END);
  SELECT (CASE WHEN NEW.guest_slabs IS NOT NULL AND (
    SELECT COUNT(*) FROM json_each(NEW.guest_slabs) s
    JOIN graded_cards g ON g.id = json_extract(s.value, '$.id') AND g.user_id = NEW.guest_id
      AND g.status = 'slabbed' AND g.locked IS NULL
      AND g.card_id = json_extract(s.value, '$.cardId') AND g.grade = json_extract(s.value, '$.grade')
      AND g.reverse = json_extract(s.value, '$.reverse') AND g.guard IS json_extract(s.value, '$.guard')
  ) != json_array_length(NEW.guest_slabs) THEN RAISE(ABORT, 'You no longer have those slabs.') END);
END;

-- The slab lists of a flip never change after the insert (the guest's list is written once, by the settle).
DROP TRIGGER IF EXISTS coinflip_slabs_frozen;
CREATE TRIGGER coinflip_slabs_frozen BEFORE UPDATE ON coinflips
WHEN NEW.host_slabs IS NOT OLD.host_slabs OR (NEW.status != 'done' AND NEW.guest_slabs IS NOT OLD.guest_slabs) BEGIN
  /* slabs-v1 */
  SELECT RAISE(ABORT, 'That flip cannot be settled.');
END;

DROP TRIGGER IF EXISTS coinflip_slab_lock;
CREATE TRIGGER coinflip_slab_lock AFTER INSERT ON coinflips
WHEN COALESCE(json_array_length(NEW.host_slabs), 0) > 0 BEGIN
  /* slabs-v1 */
  UPDATE graded_cards SET locked = 'coinflip:' || NEW.id, shown = 0
  WHERE user_id = NEW.host_id AND status = 'slabbed' AND locked IS NULL
    AND id IN (SELECT json_extract(value, '$.id') FROM json_each(NEW.host_slabs));
END;

-- The winner takes every slab. A slab that changes owner loses its guard (the unit stays with the old owner,
-- free) and gets request_id 'won:<id>'; one that stays with its owner keeps both. The house keeps nothing:
-- a host's slabs that lose to the bot are closed.
DROP TRIGGER IF EXISTS coinflip_slab_settle;
CREATE TRIGGER coinflip_slab_settle AFTER UPDATE ON coinflips
WHEN OLD.status = 'open' AND NEW.status = 'done'
  AND COALESCE(json_array_length(NEW.host_slabs), 0) + COALESCE(json_array_length(NEW.guest_slabs), 0) > 0 BEGIN
  /* slabs-v1 */
  UPDATE graded_cards SET
    guard = CASE WHEN user_id = (CASE NEW.winner WHEN 'host' THEN NEW.host_id ELSE NEW.guest_id END) THEN guard ELSE NULL END,
    request_id = CASE WHEN user_id = (CASE NEW.winner WHEN 'host' THEN NEW.host_id ELSE NEW.guest_id END) THEN request_id ELSE 'won:' || id END,
    user_id = (CASE NEW.winner WHEN 'host' THEN NEW.host_id ELSE NEW.guest_id END),
    locked = NULL, shown = 0
  WHERE (CASE NEW.winner WHEN 'host' THEN NEW.host_id ELSE NEW.guest_id END) != 'house' AND status = 'slabbed' AND (
    (locked = 'coinflip:' || NEW.id AND id IN (SELECT json_extract(value, '$.id') FROM json_each(NEW.host_slabs)))
    OR (locked IS NULL AND user_id = NEW.guest_id AND id IN (SELECT json_extract(value, '$.id') FROM json_each(NEW.guest_slabs))));
  UPDATE graded_cards SET status = 'sold', closed_at = COALESCE(NEW.flipped_at, OLD.created_at), guard = NULL, shown = 0, locked = NULL,
    sold_cents = 0, sell_request_id = 'casino:coinflip:' || NEW.id
  WHERE NEW.winner = 'guest' AND NEW.guest_id = 'house' AND status = 'slabbed' AND locked = 'coinflip:' || NEW.id
    AND id IN (SELECT json_extract(value, '$.id') FROM json_each(NEW.host_slabs));
END;

DROP TRIGGER IF EXISTS coinflip_slab_return;
CREATE TRIGGER coinflip_slab_return AFTER UPDATE ON coinflips
WHEN OLD.status = 'open' AND NEW.status = 'cancelled' AND COALESCE(json_array_length(NEW.host_slabs), 0) > 0 BEGIN
  /* slabs-v1 */
  UPDATE graded_cards SET locked = NULL
  WHERE locked = 'coinflip:' || NEW.id AND id IN (SELECT json_extract(value, '$.id') FROM json_each(NEW.host_slabs));
END;

-- ---- Jackpot ----------------------------------------------------------------
DROP TRIGGER IF EXISTS jackpot_entry_check;
CREATE TRIGGER jackpot_entry_check BEFORE INSERT ON jackpot_entries BEGIN
  /* slabs-v1 */
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM jackpots WHERE id = NEW.jackpot_id AND status = 'open')
    THEN RAISE(ABORT, 'That jackpot is over.') END);
  SELECT (CASE WHEN EXISTS (SELECT 1 FROM jackpots WHERE id = NEW.jackpot_id
    AND expires_at <= CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
    THEN RAISE(ABORT, 'That jackpot has expired.') END);
  SELECT (CASE WHEN NEW.seat >= (SELECT max_players FROM jackpots WHERE id = NEW.jackpot_id)
    THEN RAISE(ABORT, 'That jackpot is full.') END);
  SELECT (CASE WHEN (SELECT COUNT(*) FROM jackpot_entries WHERE jackpot_id = NEW.jackpot_id)
    >= (SELECT max_players FROM jackpots WHERE id = NEW.jackpot_id)
    THEN RAISE(ABORT, 'That jackpot is full.') END);
  SELECT (CASE WHEN (NEW.bot = 1) != (NEW.user_id IS NULL) OR (NEW.bot = 1) != (NEW.bot_persona IS NOT NULL)
    OR (NEW.bot = 1 AND NEW.slabs IS NOT NULL AND json_array_length(NEW.slabs) > 0)
    THEN RAISE(ABORT, 'That entry is not valid.') END);
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
  -- The entry's value is exactly what its cards and slabs add up to.
  SELECT (CASE WHEN NEW.value != COALESCE((SELECT SUM(json_extract(s.value, '$.v') * json_extract(s.value, '$.qty')) FROM json_each(NEW.stake) s), 0)
    + COALESCE((SELECT SUM(json_extract(s.value, '$.v')) FROM json_each(NEW.slabs) s), 0)
    THEN RAISE(ABORT, 'That stake is not valid.') END);
  -- Seat 0 is the host and sets the pot's minimum; nobody else may take it.
  SELECT (CASE WHEN NEW.seat = 0 AND NOT EXISTS (
    SELECT 1 FROM jackpots WHERE id = NEW.jackpot_id AND host_id = NEW.user_id AND min_value = NEW.value) OR NEW.bot = 1 AND NEW.seat = 0
    THEN RAISE(ABORT, 'The host holds the first seat.') END);
  SELECT (CASE WHEN NEW.seat != 0 AND NEW.user_id = (SELECT host_id FROM jackpots WHERE id = NEW.jackpot_id)
    THEN RAISE(ABORT, 'You are already in this jackpot.') END);
  -- A bot never puts up more than the host; a human puts up between 1x and 5x.
  SELECT (CASE WHEN NEW.bot = 1 AND NEW.value > (SELECT min_value FROM jackpots WHERE id = NEW.jackpot_id)
    THEN RAISE(ABORT, 'That entry is outside the pot''s value window.') END);
  SELECT (CASE WHEN NEW.bot = 0 AND NEW.seat != 0 AND NOT EXISTS (
    SELECT 1 FROM jackpots WHERE id = NEW.jackpot_id AND NEW.value >= min_value AND NEW.value <= min_value * 5)
    THEN RAISE(ABORT, 'That entry is outside the pot''s value window.') END);
  SELECT (CASE WHEN NEW.bot = 0 AND EXISTS (
    SELECT 1 FROM json_each(NEW.stake) s
    LEFT JOIN cards c ON c.user_id = NEW.user_id AND c.card_id = json_extract(s.value, '$.id')
    WHERE c.qty IS NULL OR c.qty < json_extract(s.value, '$.qty')
      OR c.reverse_qty < json_extract(s.value, '$.rev')
      OR json_extract(s.value, '$.qty') - json_extract(s.value, '$.rev') > c.qty - c.reverse_qty
  ) THEN RAISE(ABORT, 'You no longer have those cards.') END);
  -- Every slab is the player's own, still slabbed, in no other game, and is what the snapshot says.
  SELECT (CASE WHEN NEW.bot = 0 AND NEW.slabs IS NOT NULL AND (
    SELECT COUNT(*) FROM json_each(NEW.slabs) s
    JOIN graded_cards g ON g.id = json_extract(s.value, '$.id') AND g.user_id = NEW.user_id
      AND g.status = 'slabbed' AND g.locked IS NULL
      AND g.card_id = json_extract(s.value, '$.cardId') AND g.grade = json_extract(s.value, '$.grade')
      AND g.reverse = json_extract(s.value, '$.reverse') AND g.guard IS json_extract(s.value, '$.guard')
  ) != json_array_length(NEW.slabs) THEN RAISE(ABORT, 'You no longer have those slabs.') END);
END;

DROP TRIGGER IF EXISTS jackpot_entry_slab_lock;
CREATE TRIGGER jackpot_entry_slab_lock AFTER INSERT ON jackpot_entries
WHEN NEW.user_id IS NOT NULL AND COALESCE(json_array_length(NEW.slabs), 0) > 0 BEGIN
  /* slabs-v1 */
  UPDATE graded_cards SET locked = 'jackpot:' || NEW.jackpot_id, shown = 0
  WHERE user_id = NEW.user_id AND status = 'slabbed' AND locked IS NULL
    AND id IN (SELECT json_extract(value, '$.id') FROM json_each(NEW.slabs));
END;

-- A player who leaves an open pot takes their slabs back (still wearing their guards).
DROP TRIGGER IF EXISTS jackpot_entry_slab_leave;
CREATE TRIGGER jackpot_entry_slab_leave AFTER DELETE ON jackpot_entries
WHEN OLD.user_id IS NOT NULL AND COALESCE(json_array_length(OLD.slabs), 0) > 0 BEGIN
  /* slabs-v1 */
  UPDATE graded_cards SET locked = NULL
  WHERE locked = 'jackpot:' || OLD.jackpot_id AND user_id = OLD.user_id
    AND id IN (SELECT json_extract(value, '$.id') FROM json_each(OLD.slabs));
END;

-- The draw: the winning human takes every slab in the pot (same rules as the coinflip); a bot winner closes them.
DROP TRIGGER IF EXISTS jackpot_slab_settle;
CREATE TRIGGER jackpot_slab_settle AFTER UPDATE ON jackpots
WHEN OLD.status = 'open' AND NEW.status = 'done'
  AND EXISTS (SELECT 1 FROM jackpot_entries WHERE jackpot_id = NEW.id AND COALESCE(json_array_length(slabs), 0) > 0) BEGIN
  /* slabs-v1 */
  UPDATE graded_cards SET
    guard = CASE WHEN user_id = (SELECT user_id FROM jackpot_entries WHERE jackpot_id = NEW.id AND seat = NEW.winner_seat) THEN guard ELSE NULL END,
    request_id = CASE WHEN user_id = (SELECT user_id FROM jackpot_entries WHERE jackpot_id = NEW.id AND seat = NEW.winner_seat)
      THEN request_id ELSE 'won:' || id END,
    user_id = (SELECT user_id FROM jackpot_entries WHERE jackpot_id = NEW.id AND seat = NEW.winner_seat),
    locked = NULL, shown = 0
  WHERE status = 'slabbed' AND locked = 'jackpot:' || NEW.id
    AND (SELECT user_id FROM jackpot_entries WHERE jackpot_id = NEW.id AND seat = NEW.winner_seat) IS NOT NULL
    AND id IN (SELECT json_extract(j.value, '$.id') FROM jackpot_entries e, json_each(e.slabs) j WHERE e.jackpot_id = NEW.id);
  UPDATE graded_cards SET status = 'sold', closed_at = COALESCE(NEW.drawn_at, OLD.created_at), guard = NULL, shown = 0, locked = NULL,
    sold_cents = 0, sell_request_id = 'casino:jackpot:' || NEW.id
  WHERE status = 'slabbed' AND locked = 'jackpot:' || NEW.id
    AND (SELECT user_id FROM jackpot_entries WHERE jackpot_id = NEW.id AND seat = NEW.winner_seat) IS NULL
    AND id IN (SELECT json_extract(j.value, '$.id') FROM jackpot_entries e, json_each(e.slabs) j WHERE e.jackpot_id = NEW.id);
END;

DROP TRIGGER IF EXISTS jackpot_slab_return;
CREATE TRIGGER jackpot_slab_return AFTER UPDATE ON jackpots
WHEN OLD.status = 'open' AND NEW.status = 'cancelled' BEGIN
  /* slabs-v1 */
  UPDATE graded_cards SET locked = NULL
  WHERE locked = 'jackpot:' || NEW.id
    AND id IN (SELECT json_extract(j.value, '$.id') FROM jackpot_entries e, json_each(e.slabs) j WHERE e.jackpot_id = NEW.id AND e.user_id IS NOT NULL);
END;
