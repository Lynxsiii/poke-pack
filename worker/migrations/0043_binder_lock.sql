-- Binder lock (worker/binder-lock.js applies the same statements on demand).
-- A card in a binder pocket cannot be sold, staked or traded away until it is taken out.
CREATE TRIGGER IF NOT EXISTS binder_lock_cards BEFORE UPDATE OF qty ON cards
WHEN NEW.qty < OLD.qty
  AND NEW.qty + (SELECT COUNT(*) FROM graded_cards g WHERE g.user_id = OLD.user_id AND g.card_id = OLD.card_id AND g.status = 'slabbed' AND g.locked IS NULL)
    < (SELECT COUNT(*) FROM profiles p, json_each(CASE WHEN json_valid(p.binder) THEN p.binder ELSE '[]' END) s
      WHERE p.user_id = OLD.user_id AND s.type = 'object' AND json_extract(s.value, '$.id') = OLD.card_id)
BEGIN
  SELECT RAISE(ABORT, 'binder-locked');
END;

CREATE TRIGGER IF NOT EXISTS binder_lock_slabs BEFORE UPDATE ON graded_cards
WHEN OLD.status = 'slabbed' AND OLD.locked IS NULL
  AND (NEW.status NOT IN ('slabbed', 'cracked') OR NEW.locked IS NOT NULL OR NEW.user_id IS NOT OLD.user_id OR NEW.card_id IS NOT OLD.card_id)
  AND COALESCE((SELECT qty FROM cards c WHERE c.user_id = OLD.user_id AND c.card_id = OLD.card_id), 0)
    + (SELECT COUNT(*) FROM graded_cards g WHERE g.user_id = OLD.user_id AND g.card_id = OLD.card_id AND g.status = 'slabbed' AND g.locked IS NULL AND g.id != OLD.id)
    < (SELECT COUNT(*) FROM profiles p, json_each(CASE WHEN json_valid(p.binder) THEN p.binder ELSE '[]' END) s
      WHERE p.user_id = OLD.user_id AND s.type = 'object' AND json_extract(s.value, '$.id') = OLD.card_id)
BEGIN
  SELECT RAISE(ABORT, 'binder-locked');
END;
