-- Bots stake graded slabs (slabs-v2), and the casino has no value ceiling. Applied lazily by the Worker like 0022
-- (worker/casino-slabs.js: BOT_SLABS_DDL in worker/casino-ddl.js, generated from this file by scripts/gen-casino-ddl.mjs),
-- because no session can run remote migrations. Purely additive: no column, table or row is touched; five triggers that
-- 0022 created are replaced inside one atomic batch (each carries /* slabs-v2 */; the Worker detects the upgrade by the
-- slab-v2 code in their SQL, never by the comment).
--
-- A bot's slab is generated, never a row of graded_cards while it is staked: the snapshot has no `id`, only
--   { cardId, name, number, rarity, image, small, grade, reverse: false, guard: null, band, v }
-- (v is the graded value in cents, rolled from the card's band odds like real grading). A bot (coinflip guest 'house', or a
-- jackpot entry with bot = 1) may carry up to 10 of them, within the value it may already stake (never more than the
-- host). When a HUMAN wins, the settle trigger mints one graded_cards row per bot slab for the winner, in the same
-- transaction as the game: request_id 'casino:coinflip:<game>:<n>' (n = place in guest_slabs) or
-- 'casino:jackpot:<pot>:<n>' (n = seat * 10 + place in that entry's slabs), fee 0, unguarded, unlocked, not shown.
-- A house win mints nothing, and a human's staked slabs still close when a bot wins (0022). Cards and values have no
-- ceiling in the triggers: a stake is limited only by what the Worker builds (100 different cards, any copies, 10 slabs).
-- Games that already exist have NULL bot slabs and settle exactly as before.

-- ---- Coinflip ---------------------------------------------------------------
DROP TRIGGER IF EXISTS coinflip_settle_check;
CREATE TRIGGER coinflip_settle_check BEFORE UPDATE ON coinflips
WHEN OLD.status = 'open' AND NEW.status = 'done' BEGIN
  /* slabs-v2 */
  SELECT (CASE WHEN NEW.guest_id IS NULL OR NEW.guest_id = OLD.host_id OR NEW.winner IS NULL
    OR NEW.guest_stake IS NULL OR NEW.guest_value IS NULL OR NEW.host_stake != OLD.host_stake
    OR NEW.host_slabs IS NOT OLD.host_slabs
    OR json_type(NEW.guest_stake) != 'array'
    OR json_array_length(NEW.guest_stake) + COALESCE(json_array_length(NEW.guest_slabs), 0) < 1
    THEN RAISE(ABORT, 'That flip cannot be settled.') END);
  SELECT (CASE WHEN NEW.guest_id != 'house' AND OLD.expires_at <=
    CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
    THEN RAISE(ABORT, 'That flip has expired.') END);
  -- Every slab the host put up is still escrowed in THIS flip (slabbed, the host's, locked to it). A flip whose
  -- slabs were tampered with cannot settle short; it expires and is handed back like any other.
  SELECT (CASE WHEN OLD.host_slabs IS NOT NULL AND (
    SELECT COUNT(*) FROM json_each(OLD.host_slabs) s
    JOIN graded_cards g ON g.id = json_extract(s.value, '$.id') AND g.user_id = OLD.host_id
      AND g.status = 'slabbed' AND g.locked = 'coinflip:' || OLD.id
  ) != json_array_length(OLD.host_slabs) THEN RAISE(ABORT, 'The host no longer has those slabs.') END);
  -- A guest, human or the house, carries at most 10 slabs.
  SELECT (CASE WHEN NEW.guest_slabs IS NOT NULL AND (json_type(NEW.guest_slabs) != 'array' OR json_array_length(NEW.guest_slabs) > 10)
    THEN RAISE(ABORT, 'That stake is not valid.') END);
  -- The house's slabs are generated (no graded_cards row, so no id): a card, a grade, a band and a value, worth exactly what
  -- the bot's whole stake says, and never more than the host put up. The winner is minted these slabs only if the host wins.
  SELECT (CASE WHEN NEW.guest_id = 'house' AND COALESCE(json_array_length(NEW.guest_slabs), 0) > 0 AND (
    EXISTS (
      SELECT 1 FROM json_each(NEW.guest_slabs) s
      WHERE typeof(json_extract(s.value, '$.cardId')) != 'text' OR typeof(json_extract(s.value, '$.band')) != 'text'
        OR typeof(json_extract(s.value, '$.grade')) != 'integer' OR json_extract(s.value, '$.grade') < 1 OR json_extract(s.value, '$.grade') > 10
        OR typeof(json_extract(s.value, '$.v')) != 'integer' OR json_extract(s.value, '$.v') < 0
        OR json_extract(s.value, '$.id') IS NOT NULL
    )
    OR NEW.guest_value != COALESCE((SELECT SUM(json_extract(s.value, '$.v') * json_extract(s.value, '$.qty')) FROM json_each(NEW.guest_stake) s), 0)
      + COALESCE((SELECT SUM(json_extract(s.value, '$.v')) FROM json_each(NEW.guest_slabs) s), 0)
    OR NEW.guest_value > OLD.host_value
  ) THEN RAISE(ABORT, 'That stake is not valid.') END);
  SELECT (CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.guest_stake) s
    WHERE typeof(json_extract(s.value, '$.qty')) != 'integer' OR json_extract(s.value, '$.qty') < 1
      OR typeof(json_extract(s.value, '$.rev')) != 'integer' OR json_extract(s.value, '$.rev') < 0
      OR json_extract(s.value, '$.rev') > json_extract(s.value, '$.qty')
  ) OR EXISTS (
    SELECT 1 FROM json_each(NEW.guest_stake) s GROUP BY json_extract(s.value, '$.id') HAVING COUNT(*) > 1
  ) OR (NEW.guest_id != 'house' AND EXISTS (
    SELECT 1 FROM json_each(NEW.guest_slabs) s
    WHERE typeof(json_extract(s.value, '$.id')) != 'integer' OR json_extract(s.value, '$.id') < 1
      OR typeof(json_extract(s.value, '$.v')) != 'integer' OR json_extract(s.value, '$.v') < 0
  )) OR (NEW.guest_id != 'house' AND EXISTS (
    SELECT 1 FROM json_each(NEW.guest_slabs) s GROUP BY json_extract(s.value, '$.id') HAVING COUNT(*) > 1
  )) THEN RAISE(ABORT, 'That stake is not valid.') END);
  SELECT (CASE WHEN NEW.guest_id != 'house' AND EXISTS (
    SELECT 1 FROM json_each(NEW.guest_stake) s
    LEFT JOIN cards c ON c.user_id = NEW.guest_id AND c.card_id = json_extract(s.value, '$.id')
    WHERE c.qty IS NULL OR c.qty < json_extract(s.value, '$.qty')
      OR c.reverse_qty < json_extract(s.value, '$.rev')
      OR json_extract(s.value, '$.qty') - json_extract(s.value, '$.rev') > c.qty - c.reverse_qty
  ) THEN RAISE(ABORT, 'You no longer have those cards.') END);
  SELECT (CASE WHEN NEW.guest_id != 'house' AND NEW.guest_slabs IS NOT NULL AND (
    SELECT COUNT(*) FROM json_each(NEW.guest_slabs) s
    JOIN graded_cards g ON g.id = json_extract(s.value, '$.id') AND g.user_id = NEW.guest_id
      AND g.status = 'slabbed' AND g.locked IS NULL
      AND g.card_id = json_extract(s.value, '$.cardId') AND g.grade = json_extract(s.value, '$.grade')
      AND g.reverse = json_extract(s.value, '$.reverse') AND g.guard IS json_extract(s.value, '$.guard')
  ) != json_array_length(NEW.guest_slabs) THEN RAISE(ABORT, 'You no longer have those slabs.') END);
END;

DROP TRIGGER IF EXISTS coinflip_slab_settle;
CREATE TRIGGER coinflip_slab_settle AFTER UPDATE ON coinflips
WHEN OLD.status = 'open' AND NEW.status = 'done'
  AND COALESCE(json_array_length(NEW.host_slabs), 0) + COALESCE(json_array_length(NEW.guest_slabs), 0) > 0 BEGIN
  /* slabs-v2 */
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
  -- The house lost: its generated slabs become real ones, one graded_cards row each (n = its place in the list), for the host.
  -- Nothing is minted when the house wins, and request_id is unique per owner, so a replay can never mint twice.
  INSERT INTO graded_cards(user_id, card_id, reverse, grade, band, fee_cents, request_id, guard, status, created_at, shown, locked)
  SELECT NEW.host_id, json_extract(s.value, '$.cardId'), 0, json_extract(s.value, '$.grade'), json_extract(s.value, '$.band'), 0,
    'casino:coinflip:' || NEW.id || ':' || s.key, NULL, 'slabbed', COALESCE(NEW.flipped_at, OLD.created_at), 0, NULL
  FROM json_each(NEW.guest_slabs) s
  WHERE NEW.winner = 'host' AND NEW.guest_id = 'house';
END;

-- ---- Jackpot ----------------------------------------------------------------
DROP TRIGGER IF EXISTS jackpot_entry_check;
CREATE TRIGGER jackpot_entry_check BEFORE INSERT ON jackpot_entries BEGIN
  /* slabs-v2 */
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
  ) OR (NEW.bot = 0 AND EXISTS (
    SELECT 1 FROM json_each(NEW.slabs) s
    WHERE typeof(json_extract(s.value, '$.id')) != 'integer' OR json_extract(s.value, '$.id') < 1
      OR typeof(json_extract(s.value, '$.v')) != 'integer' OR json_extract(s.value, '$.v') < 0
  )) OR (NEW.bot = 0 AND EXISTS (
    SELECT 1 FROM json_each(NEW.slabs) s GROUP BY json_extract(s.value, '$.id') HAVING COUNT(*) > 1
  )) THEN RAISE(ABORT, 'That stake is not valid.') END);
  -- A bot's slabs are generated (no graded_cards row, so no id): a card, a grade, a band and a value. The winner is
  -- minted them only if a human wins; the entry's value (checked below) is at most the host's, so nothing is created
  -- beyond the value a bot may put up.
  SELECT (CASE WHEN NEW.bot = 1 AND EXISTS (
    SELECT 1 FROM json_each(NEW.slabs) s
    WHERE typeof(json_extract(s.value, '$.cardId')) != 'text' OR typeof(json_extract(s.value, '$.band')) != 'text'
      OR typeof(json_extract(s.value, '$.grade')) != 'integer' OR json_extract(s.value, '$.grade') < 1 OR json_extract(s.value, '$.grade') > 10
      OR typeof(json_extract(s.value, '$.v')) != 'integer' OR json_extract(s.value, '$.v') < 0
      OR json_extract(s.value, '$.id') IS NOT NULL
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

DROP TRIGGER IF EXISTS jackpot_settle_check;
CREATE TRIGGER jackpot_settle_check BEFORE UPDATE ON jackpots
WHEN OLD.status = 'open' AND NEW.status = 'done' BEGIN
  /* slabs-v2 */
  SELECT (CASE WHEN NEW.winner_seat IS NULL OR NEW.drawn_at IS NULL
    OR NOT EXISTS (SELECT 1 FROM jackpot_entries WHERE jackpot_id = OLD.id AND seat = NEW.winner_seat)
    OR (SELECT COUNT(*) FROM jackpot_entries WHERE jackpot_id = OLD.id) < 2
    THEN RAISE(ABORT, 'That jackpot cannot be drawn yet.') END);
  SELECT (CASE WHEN OLD.expires_at <= CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
    THEN RAISE(ABORT, 'That jackpot has expired.') END);
  SELECT (CASE WHEN (
    SELECT COUNT(*) FROM jackpot_entries e, json_each(e.slabs) j
    JOIN graded_cards g ON g.id = json_extract(j.value, '$.id') AND g.user_id = e.user_id
      AND g.status = 'slabbed' AND g.locked = 'jackpot:' || OLD.id
    WHERE e.jackpot_id = OLD.id AND e.bot = 0
  ) != (SELECT COALESCE(SUM(CASE WHEN bot = 0 THEN json_array_length(slabs) ELSE 0 END), 0) FROM jackpot_entries WHERE jackpot_id = OLD.id)
    THEN RAISE(ABORT, 'That jackpot cannot be drawn yet.') END);
END;

DROP TRIGGER IF EXISTS jackpot_slab_settle;
CREATE TRIGGER jackpot_slab_settle AFTER UPDATE ON jackpots
WHEN OLD.status = 'open' AND NEW.status = 'done'
  AND EXISTS (SELECT 1 FROM jackpot_entries WHERE jackpot_id = NEW.id AND COALESCE(json_array_length(slabs), 0) > 0) BEGIN
  /* slabs-v2 */
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
  -- A human won: every generated slab of every bot entry becomes a real one for the winner (n = seat * 10 + its place in
  -- the entry, unique within the pot). Nothing is minted when a bot wins, and a replay cannot mint twice.
  INSERT INTO graded_cards(user_id, card_id, reverse, grade, band, fee_cents, request_id, guard, status, created_at, shown, locked)
  SELECT w.uid, json_extract(j.value, '$.cardId'), 0, json_extract(j.value, '$.grade'), json_extract(j.value, '$.band'), 0,
    'casino:jackpot:' || NEW.id || ':' || (e.seat * 10 + j.key), NULL, 'slabbed', COALESCE(NEW.drawn_at, OLD.created_at), 0, NULL
  FROM (SELECT user_id AS uid FROM jackpot_entries WHERE jackpot_id = NEW.id AND seat = NEW.winner_seat) w,
    jackpot_entries e, json_each(e.slabs) j
  WHERE w.uid IS NOT NULL AND e.jackpot_id = NEW.id AND e.bot = 1;
END;
