-- Bots are free. A new bot seat stores the sentinel payer 'free': it passes no
-- coin check, debits nothing and refunds nothing. Bot seats paid for under
-- 0012 keep their real payer and still refund it when they are deleted.
-- The Worker applies these same statements to itself at runtime
-- (worker/battles.js ensureBattleSchema, one atomic D1 batch), so this file
-- only matters for a fresh database; replaying it after the runtime step is a
-- no-op rewrite. Keep it identical to FREE_BOT_DDL in worker/battles.js.
-- Order: refund first (a moment without it can only withhold coins, never mint).
DROP TRIGGER IF EXISTS battle_seat_refund;
CREATE TRIGGER battle_seat_refund AFTER DELETE ON battle_seats
WHEN OLD.payer_id != 'free' AND (SELECT status FROM battles WHERE id = OLD.battle_id) IN ('lobby','cancelled') BEGIN
  UPDATE profiles SET coins = ROUND(coins + (SELECT entry_cost FROM battles WHERE id = OLD.battle_id), 2)
  WHERE user_id = OLD.payer_id;
END;
DROP TRIGGER IF EXISTS battle_seat_validate;
CREATE TRIGGER battle_seat_validate BEFORE INSERT ON battle_seats BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM battles b WHERE b.id = NEW.battle_id AND b.status = 'lobby'
    AND b.expires_at > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
    AND NEW.seat < json_extract(b.settings, '$.players')
  ) THEN RAISE(ABORT, 'Battle is no longer accepting players.') END);
  SELECT (CASE WHEN (NEW.payer_id = 'free') != (NEW.bot = 1)
  THEN RAISE(ABORT, 'Bots play free and players pay their own entry.') END);
  SELECT (CASE WHEN NEW.payer_id != 'free' AND NOT EXISTS (
    SELECT 1 FROM profiles p JOIN battles b ON b.id = NEW.battle_id
    WHERE p.user_id = NEW.payer_id AND p.coins >= b.entry_cost
  ) THEN RAISE(ABORT, 'Not enough coins.') END);
END;
DROP TRIGGER IF EXISTS battle_seat_debit;
CREATE TRIGGER battle_seat_debit AFTER INSERT ON battle_seats
WHEN NEW.payer_id != 'free' BEGIN
  UPDATE profiles SET coins = ROUND(coins - (SELECT entry_cost FROM battles WHERE id = NEW.battle_id), 2)
  WHERE user_id = NEW.payer_id;
END;
CREATE UNIQUE INDEX IF NOT EXISTS battle_bot_persona ON battle_seats(battle_id, handle)
WHERE bot = 1 AND payer_id = 'free';
