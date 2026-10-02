-- Bots may stake a Black Label (slabs-v3). A bot's generated slab snapshot gains `bl` (1 for a Black Label; a Black Label is a
-- grade 10), and the two triggers that mint a bot's slab for a human winner now copy it into graded_cards.black_label
-- (migration 0029). Applied lazily by the Worker like 0022 and 0027 (worker/casino-slabs.js: SLABS_V3_DDL in
-- worker/casino-ddl.js, generated from this file by scripts/gen-casino-ddl.mjs): one atomic batch that replaces the
-- two triggers, run only while one of them lacks the black_label code. Each keeps its slabs-v2 marker and adds slabs-v3.
-- A snapshot without `bl` (every game that exists now) mints a plain slab exactly as before.

DROP TRIGGER IF EXISTS coinflip_slab_settle;
CREATE TRIGGER coinflip_slab_settle AFTER UPDATE ON coinflips
WHEN OLD.status = 'open' AND NEW.status = 'done'
  AND COALESCE(json_array_length(NEW.host_slabs), 0) + COALESCE(json_array_length(NEW.guest_slabs), 0) > 0 BEGIN
  /* slabs-v2 */
  /* slabs-v3 */
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
  INSERT INTO graded_cards(user_id, card_id, reverse, grade, band, fee_cents, request_id, guard, status, created_at, shown, locked, black_label)
  SELECT NEW.host_id, json_extract(s.value, '$.cardId'), 0, json_extract(s.value, '$.grade'), json_extract(s.value, '$.band'), 0,
    'casino:coinflip:' || NEW.id || ':' || s.key, NULL, 'slabbed', COALESCE(NEW.flipped_at, OLD.created_at), 0, NULL,
    CASE WHEN json_extract(s.value, '$.bl') = 1 AND json_extract(s.value, '$.grade') = 10 THEN 1 ELSE 0 END
  FROM json_each(NEW.guest_slabs) s
  WHERE NEW.winner = 'host' AND NEW.guest_id = 'house';
END;

DROP TRIGGER IF EXISTS jackpot_slab_settle;
CREATE TRIGGER jackpot_slab_settle AFTER UPDATE ON jackpots
WHEN OLD.status = 'open' AND NEW.status = 'done'
  AND EXISTS (SELECT 1 FROM jackpot_entries WHERE jackpot_id = NEW.id AND COALESCE(json_array_length(slabs), 0) > 0) BEGIN
  /* slabs-v2 */
  /* slabs-v3 */
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
  INSERT INTO graded_cards(user_id, card_id, reverse, grade, band, fee_cents, request_id, guard, status, created_at, shown, locked, black_label)
  SELECT w.uid, json_extract(j.value, '$.cardId'), 0, json_extract(j.value, '$.grade'), json_extract(j.value, '$.band'), 0,
    'casino:jackpot:' || NEW.id || ':' || (e.seat * 10 + j.key), NULL, 'slabbed', COALESCE(NEW.drawn_at, OLD.created_at), 0, NULL,
    CASE WHEN json_extract(j.value, '$.bl') = 1 AND json_extract(j.value, '$.grade') = 10 THEN 1 ELSE 0 END
  FROM (SELECT user_id AS uid FROM jackpot_entries WHERE jackpot_id = NEW.id AND seat = NEW.winner_seat) w,
    jackpot_entries e, json_each(e.slabs) j
  WHERE w.uid IS NOT NULL AND e.jackpot_id = NEW.id AND e.bot = 1;
END;
