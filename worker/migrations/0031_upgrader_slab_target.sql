-- The Upgrader can aim at a graded slab (upgrader-v2; js/upgrader-rules.js, worker/upgrader.js). A slab target is still a
-- 'card' target, so the target_kind CHECK of 0028 stays as it is: its snapshot (`target` JSON) carries `grade` (1 to 10), `bl`
-- (1 for a Black Label, a 10 only) and `band` (the grade band id), and target_value is the slab's graded value in cents (what
-- selling it pays), so the odds are the same formula: chance = MIN(800000, stake * 950000 / target) and the expected value of
-- any upgrade stays at most 95% of the stake. A win mints one real graded_cards row for the player instead of a plain card.
-- Two triggers are replaced (upgrade_check validates the snapshot; upgrade_take mints the slab); each carries the marker
-- `upgrader-v2`. Applied lazily by the Worker (UPGRADER_V2_DDL in worker/casino-ddl.js, generated from this file by
-- scripts/gen-casino-ddl.mjs) in one atomic batch while either trigger lacks the marker. Rows without `grade` behave
-- exactly as before. Depends on 0029 (graded_cards.black_label), which ensureGradingSchema adds.

DROP TRIGGER IF EXISTS upgrade_check;
CREATE TRIGGER upgrade_check BEFORE INSERT ON upgrades BEGIN
  /* upgrader-v2 */
  -- The odds are the rules, not the Worker's word: the chance is exactly the formula and the result exactly follows the roll.
  SELECT (CASE WHEN NEW.chance IS NOT MIN(800000, (NEW.stake_value * 950000) / NEW.target_value)
    OR NEW.won IS NOT (NEW.roll < NEW.chance)
    THEN RAISE(ABORT, 'That upgrade is not valid.') END);
  SELECT (CASE WHEN NEW.target_id = '' OR json_type(NEW.target) != 'object'
    OR (NEW.target_kind = 'card' AND NEW.target_set IS NOT NULL)
    OR (NEW.target_kind = 'sealed' AND (NEW.target_set IS NULL OR NEW.target_set = ''))
    THEN RAISE(ABORT, 'That target is not valid.') END);
  -- A slab target (the snapshot carries `grade`): a card, any grade 1 to 10, a Black Label only on a 10, and the band it is graded in.
  SELECT (CASE WHEN json_type(NEW.target, '$.grade') IS NOT NULL AND (
    NEW.target_kind != 'card'
    OR json_type(NEW.target, '$.grade') != 'integer' OR json_extract(NEW.target, '$.grade') NOT BETWEEN 1 AND 10
    OR COALESCE(json_extract(NEW.target, '$.bl'), -1) NOT IN (0, 1)
    OR (json_extract(NEW.target, '$.bl') = 1 AND json_extract(NEW.target, '$.grade') != 10)
    OR json_type(NEW.target, '$.band') IS NOT 'text' OR json_extract(NEW.target, '$.band') = ''
  ) THEN RAISE(ABORT, 'That target is not valid.') END);
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

DROP TRIGGER IF EXISTS upgrade_take;
CREATE TRIGGER upgrade_take AFTER INSERT ON upgrades BEGIN
  /* upgrader-v2 */
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
  SELECT NEW.user_id, NEW.target_id, 1, 0 WHERE NEW.won = 1 AND NEW.target_kind = 'card' AND json_type(NEW.target, '$.grade') IS NULL
  ON CONFLICT(user_id, card_id) DO UPDATE SET qty = cards.qty + 1;
  INSERT INTO sealed_vault(user_id, set_id, product_id, qty, first_at, last_at)
  SELECT NEW.user_id, NEW.target_set, NEW.target_id, 1, NEW.created_at, NEW.created_at WHERE NEW.won = 1 AND NEW.target_kind = 'sealed'
  ON CONFLICT(user_id, set_id, product_id) DO UPDATE SET qty = sealed_vault.qty + 1, last_at = excluded.last_at;
  -- A win on a slab target: one graded slab of that card (the snapshot's grade, Black Label and band), unguarded, fee 0, minted
  -- like a bot's slab that a human wins. request_id is unique per owner, so a replay can never mint twice.
  INSERT INTO graded_cards(user_id, card_id, reverse, grade, band, fee_cents, request_id, guard, status, created_at, shown, locked, black_label)
  SELECT NEW.user_id, NEW.target_id, 0, json_extract(NEW.target, '$.grade'), json_extract(NEW.target, '$.band'), 0,
    'casino:upgrader:' || NEW.id || ':0', NULL, 'slabbed', NEW.created_at, 0, NULL, json_extract(NEW.target, '$.bl')
  WHERE NEW.won = 1 AND NEW.target_kind = 'card' AND json_type(NEW.target, '$.grade') IS NOT NULL;
  UPDATE users SET last_played = NEW.created_at WHERE id = NEW.user_id;
END;
