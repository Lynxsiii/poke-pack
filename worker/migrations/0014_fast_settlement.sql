-- Settling a big battle (two booster boxes, one player winning the pot) took seconds under
-- 0012: the award trigger re-parsed each allocation's whole card list for every
-- card (json_extract(a.value, ...) per row) and joined every plan round to every
-- outcome round. Production D1 answered SQLITE_NOMEM settling one (a player
-- who won two booster boxes' worth: about 29 MB of SQLite memory and 3 s
-- locally, now 7 MB and 20 ms), and until PR #101 that made every battle
-- request fail. Same awards, same exactly-once gate
-- (the battle_settlements row); each JSON value is now read once in a
-- LIMIT -1 subquery, which SQLite never flattens into the join.
-- The Worker applies these same statements to itself at runtime
-- (worker/battles.js ensureBattleSchema, one atomic D1 batch). Keep this file
-- identical to AWARD_DDL there.
DROP TRIGGER IF EXISTS battle_settle_award;
CREATE TRIGGER battle_settle_award AFTER INSERT ON battle_settlements BEGIN
  UPDATE battles SET status = 'finished' WHERE id = NEW.battle_id;
  INSERT INTO cards(user_id, card_id, qty, reverse_qty)
  SELECT al.uid, json_extract(c.value, '$.id'), COUNT(*), SUM(COALESCE(json_extract(c.value, '$.reverse'), 0))
  FROM (SELECT json_extract(a.value, '$.userId') AS uid, json_extract(a.value, '$.cards') AS cards
    FROM battles b, json_each(b.result, '$.allocations') a WHERE b.id = NEW.battle_id LIMIT -1) al,
    json_each(al.cards) c
  WHERE al.uid IS NOT NULL
  GROUP BY al.uid, json_extract(c.value, '$.id')
  ON CONFLICT(user_id, card_id) DO UPDATE SET qty = cards.qty + excluded.qty,
    reverse_qty = cards.reverse_qty + excluded.reverse_qty;
  UPDATE profiles SET packs_opened = packs_opened + (
    SELECT COUNT(*) FROM battles b, json_each(b.plan) r
    WHERE b.id = NEW.battle_id AND json_extract(r.value, '$.kind') = 'pack'
  ), pulls = pulls + COALESCE((
    SELECT SUM(pu.n) FROM (SELECT json_extract(p.value, '$.seat') AS seat, json_array_length(p.value, '$.cards') AS n
      FROM battles b, json_each(b.outcomes) r, json_each(r.value, '$.pulls') p WHERE b.id = NEW.battle_id LIMIT -1) pu,
      battle_seats s
    WHERE s.battle_id = NEW.battle_id AND s.user_id = profiles.user_id AND s.seat = pu.seat
  ), 0)
  WHERE user_id IN (SELECT user_id FROM battle_seats WHERE battle_id = NEW.battle_id AND bot = 0);
  INSERT INTO pack_log(user_id, set_id, wrapper_id, cost, cards, at)
  SELECT s.user_id, pl.set_id, pl.wrapper_id, 0, pu.cards, NEW.at
  FROM (SELECT json_extract(plan.value, '$.index') AS idx, json_extract(plan.value, '$.setId') AS set_id,
      json_extract(plan.value, '$.wrapperId') AS wrapper_id
    FROM battles b, json_each(b.plan) plan
    WHERE b.id = NEW.battle_id AND json_extract(plan.value, '$.kind') = 'pack' LIMIT -1) pl,
    (SELECT json_extract(r.value, '$.index') AS idx, json_extract(p.value, '$.seat') AS seat,
      json_extract(p.value, '$.cards') AS cards
    FROM battles b, json_each(b.outcomes) r, json_each(r.value, '$.pulls') p WHERE b.id = NEW.battle_id LIMIT -1) pu,
    battle_seats s
  WHERE pu.idx = pl.idx AND s.battle_id = NEW.battle_id AND s.seat = pu.seat AND s.bot = 0;
  UPDATE users SET last_played = NEW.at WHERE id IN
    (SELECT user_id FROM battle_seats WHERE battle_id = NEW.battle_id AND bot = 0);
END;
