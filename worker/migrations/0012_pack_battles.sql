-- All mutations below run in D1 transactions; triggers enforce escrow even
-- when a competing API request was based on an older inventory/battle snapshot.
CREATE TABLE battles (
  id TEXT PRIMARY KEY, host_id TEXT NOT NULL, request_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'lobby' CHECK(status IN ('lobby','running','finished','cancelled')),
  settings TEXT NOT NULL, lineup TEXT NOT NULL, plan TEXT NOT NULL,
  entry_cost REAL NOT NULL CHECK(entry_cost > 0), created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL, starts_at INTEGER, ends_at INTEGER, round_ms INTEGER,
  outcomes TEXT, result TEXT, UNIQUE(host_id, request_id)
);
CREATE INDEX battles_recent ON battles(status, created_at DESC);
CREATE TABLE battle_seats (
  battle_id TEXT NOT NULL REFERENCES battles(id), seat INTEGER NOT NULL,
  user_id TEXT, payer_id TEXT NOT NULL, name TEXT NOT NULL, handle TEXT NOT NULL,
  color TEXT NOT NULL, bot INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(battle_id, seat), CHECK(seat >= 0 AND seat < 4),
  CHECK((bot = 1 AND user_id IS NULL) OR (bot = 0 AND user_id IS NOT NULL))
);
CREATE UNIQUE INDEX battle_one_seat ON battle_seats(battle_id, user_id) WHERE user_id IS NOT NULL;
CREATE TABLE battle_settlements (battle_id TEXT PRIMARY KEY REFERENCES battles(id), at INTEGER NOT NULL);

CREATE TRIGGER battle_seat_validate BEFORE INSERT ON battle_seats BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM battles b WHERE b.id = NEW.battle_id AND b.status = 'lobby'
    AND b.expires_at > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
    AND NEW.seat < json_extract(b.settings, '$.players')
  ) THEN RAISE(ABORT, 'Battle is no longer accepting players.') END);
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM profiles p JOIN battles b ON b.id = NEW.battle_id
    WHERE p.user_id = NEW.payer_id AND p.coins >= b.entry_cost
  ) THEN RAISE(ABORT, 'Not enough coins.') END);
END;
CREATE TRIGGER battle_seat_debit AFTER INSERT ON battle_seats BEGIN
  UPDATE profiles SET coins = ROUND(coins - (SELECT entry_cost FROM battles WHERE id = NEW.battle_id), 2)
  WHERE user_id = NEW.payer_id;
END;
CREATE TRIGGER battle_seat_no_running_leave BEFORE DELETE ON battle_seats
WHEN (SELECT status FROM battles WHERE id = OLD.battle_id) = 'running' BEGIN
  SELECT RAISE(ABORT, 'A running battle cannot be left.');
END;
CREATE TRIGGER battle_seat_refund AFTER DELETE ON battle_seats
WHEN (SELECT status FROM battles WHERE id = OLD.battle_id) IN ('lobby','cancelled') BEGIN
  UPDATE profiles SET coins = ROUND(coins + (SELECT entry_cost FROM battles WHERE id = OLD.battle_id), 2)
  WHERE user_id = OLD.payer_id;
END;
CREATE TRIGGER battle_start_validate BEFORE UPDATE OF status ON battles
WHEN NEW.status = 'running' AND OLD.status = 'lobby' BEGIN
  SELECT (CASE WHEN (SELECT COUNT(*) FROM battle_seats WHERE battle_id = OLD.id) != json_extract(OLD.settings, '$.players')
  THEN RAISE(ABORT, 'Fill every seat before starting.') END);
END;
CREATE TRIGGER battle_settle_validate BEFORE INSERT ON battle_settlements BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM battles WHERE id = NEW.battle_id AND status = 'running' AND ends_at <= NEW.at)
  THEN RAISE(ABORT, 'Battle is not ready to settle.') END);
END;
CREATE TRIGGER battle_settle_award AFTER INSERT ON battle_settlements BEGIN
  UPDATE battles SET status = 'finished' WHERE id = NEW.battle_id;
  INSERT INTO cards(user_id, card_id, qty, reverse_qty)
  SELECT json_extract(a.value, '$.userId'), json_extract(c.value, '$.id'), COUNT(*),
    SUM(COALESCE(json_extract(c.value, '$.reverse'), 0))
  FROM battles b, json_each(b.result, '$.allocations') a, json_each(a.value, '$.cards') c
  WHERE b.id = NEW.battle_id AND json_extract(a.value, '$.userId') IS NOT NULL
  GROUP BY json_extract(a.value, '$.userId'), json_extract(c.value, '$.id')
  ON CONFLICT(user_id, card_id) DO UPDATE SET qty = cards.qty + excluded.qty,
    reverse_qty = cards.reverse_qty + excluded.reverse_qty;
  UPDATE profiles SET packs_opened = packs_opened + (
    SELECT COUNT(*) FROM battles b, json_each(b.plan) r
    WHERE b.id = NEW.battle_id AND json_extract(r.value, '$.kind') = 'pack'
  ), pulls = pulls + COALESCE((
    SELECT SUM(json_array_length(p.value, '$.cards')) FROM battles b,
      json_each(b.outcomes) r, json_each(r.value, '$.pulls') p, battle_seats s
    WHERE b.id = NEW.battle_id AND s.battle_id = b.id AND s.user_id = profiles.user_id
      AND json_extract(p.value, '$.seat') = s.seat
  ), 0)
  WHERE user_id IN (SELECT user_id FROM battle_seats WHERE battle_id = NEW.battle_id AND bot = 0);
  INSERT INTO pack_log(user_id, set_id, wrapper_id, cost, cards, at)
  SELECT s.user_id, json_extract(plan.value, '$.setId'), json_extract(plan.value, '$.wrapperId'),
    0, json_extract(p.value, '$.cards'), NEW.at
  FROM battles b, json_each(b.plan) plan, json_each(b.outcomes) r,
    json_each(r.value, '$.pulls') p, battle_seats s
  WHERE b.id = NEW.battle_id AND s.battle_id = b.id AND s.bot = 0
    AND json_extract(plan.value, '$.kind') = 'pack'
    AND json_extract(r.value, '$.index') = json_extract(plan.value, '$.index')
    AND json_extract(p.value, '$.seat') = s.seat;
  UPDATE users SET last_played = NEW.at WHERE id IN
    (SELECT user_id FROM battle_seats WHERE battle_id = NEW.battle_id AND bot = 0);
END;

CREATE TRIGGER battle_no_account_delete BEFORE DELETE ON profiles
WHEN EXISTS (SELECT 1 FROM battle_seats s JOIN battles b ON b.id = s.battle_id
  WHERE (s.user_id = OLD.user_id OR s.payer_id = OLD.user_id) AND b.status IN ('lobby','running')) BEGIN
  SELECT RAISE(ABORT, 'Leave or finish your active battles before deleting your account.');
END;
CREATE TRIGGER battle_no_account_reset BEFORE UPDATE OF created_at ON profiles
WHEN EXISTS (
  SELECT 1 FROM battle_seats s JOIN battles b ON b.id = s.battle_id
  WHERE (s.user_id = OLD.user_id OR s.payer_id = OLD.user_id) AND b.status IN ('lobby','running')) BEGIN
  SELECT RAISE(ABORT, 'Leave or finish your active battles before resetting your account.');
END;
