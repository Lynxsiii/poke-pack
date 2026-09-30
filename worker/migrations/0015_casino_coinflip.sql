-- Casino coinflip. worker/casino.js applies this same DDL to itself once per
-- isolate (CASINO_DDL), because no session can run remote migrations; every
-- statement is IF NOT EXISTS, so running this file later is harmless.
--
-- One row is one flip. The host's cards move into escrow when the row is
-- inserted (the triggers take them out of `cards`), the challenger's when the
-- row settles, and the winner is paid both piles in the same transaction. A
-- flip that is cancelled or expires returns the host's pile. Nothing else ever
-- writes cards for a flip, so cards are conserved by construction. A bot
-- challenger (guest_id 'house') stakes generated cards worth a little less than
-- the host's, so a lost flip removes cards from the game and a won one adds
-- slightly fewer than were risked: never a free-card source.
CREATE TABLE IF NOT EXISTS coinflips (
  id TEXT PRIMARY KEY,
  host_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','done','cancelled')),
  bot INTEGER NOT NULL DEFAULT 0,
  bot_persona TEXT,
  host_stake TEXT NOT NULL,
  host_value INTEGER NOT NULL CHECK(host_value > 0),
  guest_id TEXT,
  guest_stake TEXT,
  guest_value INTEGER,
  winner TEXT CHECK(winner IN ('host','guest')),
  host_coin TEXT,
  guest_coin TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  flipped_at INTEGER,
  UNIQUE(host_id, request_id)
);
CREATE INDEX IF NOT EXISTS coinflips_recent ON coinflips(status, created_at DESC);
CREATE INDEX IF NOT EXISTS coinflips_host ON coinflips(host_id, status);
CREATE INDEX IF NOT EXISTS coinflips_guest ON coinflips(guest_id, status);

CREATE TRIGGER IF NOT EXISTS coinflip_stake_check BEFORE INSERT ON coinflips BEGIN
  SELECT (CASE WHEN NEW.status != 'open' OR NEW.guest_id IS NOT NULL OR NEW.winner IS NOT NULL
    THEN RAISE(ABORT, 'A flip starts open.') END);
  SELECT (CASE WHEN json_type(NEW.host_stake) != 'array' OR json_array_length(NEW.host_stake) < 1
    THEN RAISE(ABORT, 'Put up at least one card.') END);
  SELECT (CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.host_stake) s
    WHERE typeof(json_extract(s.value, '$.qty')) != 'integer' OR json_extract(s.value, '$.qty') < 1
      OR typeof(json_extract(s.value, '$.rev')) != 'integer' OR json_extract(s.value, '$.rev') < 0
      OR json_extract(s.value, '$.rev') > json_extract(s.value, '$.qty')
  ) OR EXISTS (
    SELECT 1 FROM json_each(NEW.host_stake) s GROUP BY json_extract(s.value, '$.id') HAVING COUNT(*) > 1
  ) THEN RAISE(ABORT, 'That stake is not valid.') END);
  SELECT (CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.host_stake) s
    LEFT JOIN cards c ON c.user_id = NEW.host_id AND c.card_id = json_extract(s.value, '$.id')
    WHERE c.qty IS NULL OR c.qty < json_extract(s.value, '$.qty')
      OR c.reverse_qty < json_extract(s.value, '$.rev')
      OR json_extract(s.value, '$.qty') - json_extract(s.value, '$.rev') > c.qty - c.reverse_qty
  ) THEN RAISE(ABORT, 'You no longer have those cards.') END);
END;

CREATE TRIGGER IF NOT EXISTS coinflip_stake_take AFTER INSERT ON coinflips BEGIN
  UPDATE cards SET
    qty = qty - (SELECT json_extract(s.value, '$.qty') FROM json_each(NEW.host_stake) s
      WHERE json_extract(s.value, '$.id') = cards.card_id),
    reverse_qty = reverse_qty - (SELECT json_extract(s.value, '$.rev') FROM json_each(NEW.host_stake) s
      WHERE json_extract(s.value, '$.id') = cards.card_id)
  WHERE user_id = NEW.host_id
    AND card_id IN (SELECT json_extract(value, '$.id') FROM json_each(NEW.host_stake));
  DELETE FROM cards WHERE user_id = NEW.host_id AND qty <= 0
    AND card_id IN (SELECT json_extract(value, '$.id') FROM json_each(NEW.host_stake));
END;

-- A flip that is not open never changes again: no second settlement, no cancel
-- after a flip, no refund of a paid-out pile.
CREATE TRIGGER IF NOT EXISTS coinflip_final BEFORE UPDATE ON coinflips
WHEN OLD.status != 'open' BEGIN
  SELECT RAISE(ABORT, 'That flip is already settled.');
END;

CREATE TRIGGER IF NOT EXISTS coinflip_settle_check BEFORE UPDATE ON coinflips
WHEN OLD.status = 'open' AND NEW.status = 'done' BEGIN
  SELECT (CASE WHEN NEW.guest_id IS NULL OR NEW.guest_id = OLD.host_id OR NEW.winner IS NULL
    OR NEW.guest_stake IS NULL OR NEW.guest_value IS NULL OR NEW.host_stake != OLD.host_stake
    OR json_type(NEW.guest_stake) != 'array' OR json_array_length(NEW.guest_stake) < 1
    THEN RAISE(ABORT, 'That flip cannot be settled.') END);
  SELECT (CASE WHEN NEW.guest_id != 'house' AND OLD.expires_at <=
    CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
    THEN RAISE(ABORT, 'That flip has expired.') END);
  SELECT (CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.guest_stake) s
    WHERE typeof(json_extract(s.value, '$.qty')) != 'integer' OR json_extract(s.value, '$.qty') < 1
      OR typeof(json_extract(s.value, '$.rev')) != 'integer' OR json_extract(s.value, '$.rev') < 0
      OR json_extract(s.value, '$.rev') > json_extract(s.value, '$.qty')
  ) OR EXISTS (
    SELECT 1 FROM json_each(NEW.guest_stake) s GROUP BY json_extract(s.value, '$.id') HAVING COUNT(*) > 1
  ) THEN RAISE(ABORT, 'That stake is not valid.') END);
  SELECT (CASE WHEN NEW.guest_id != 'house' AND EXISTS (
    SELECT 1 FROM json_each(NEW.guest_stake) s
    LEFT JOIN cards c ON c.user_id = NEW.guest_id AND c.card_id = json_extract(s.value, '$.id')
    WHERE c.qty IS NULL OR c.qty < json_extract(s.value, '$.qty')
      OR c.reverse_qty < json_extract(s.value, '$.rev')
      OR json_extract(s.value, '$.qty') - json_extract(s.value, '$.rev') > c.qty - c.reverse_qty
  ) THEN RAISE(ABORT, 'You no longer have those cards.') END);
END;

CREATE TRIGGER IF NOT EXISTS coinflip_settle AFTER UPDATE ON coinflips
WHEN OLD.status = 'open' AND NEW.status = 'done' BEGIN
  UPDATE cards SET
    qty = qty - (SELECT json_extract(s.value, '$.qty') FROM json_each(NEW.guest_stake) s
      WHERE json_extract(s.value, '$.id') = cards.card_id),
    reverse_qty = reverse_qty - (SELECT json_extract(s.value, '$.rev') FROM json_each(NEW.guest_stake) s
      WHERE json_extract(s.value, '$.id') = cards.card_id)
  WHERE NEW.guest_id != 'house' AND user_id = NEW.guest_id
    AND card_id IN (SELECT json_extract(value, '$.id') FROM json_each(NEW.guest_stake));
  DELETE FROM cards WHERE NEW.guest_id != 'house' AND user_id = NEW.guest_id AND qty <= 0
    AND card_id IN (SELECT json_extract(value, '$.id') FROM json_each(NEW.guest_stake));
  INSERT INTO cards(user_id, card_id, qty, reverse_qty)
  SELECT w.uid, p.id, SUM(p.q), SUM(p.r)
  FROM (SELECT CASE NEW.winner WHEN 'host' THEN NEW.host_id ELSE NEW.guest_id END AS uid) w,
    (SELECT json_extract(value, '$.id') AS id, json_extract(value, '$.qty') AS q, json_extract(value, '$.rev') AS r
       FROM json_each(NEW.host_stake)
     UNION ALL
     SELECT json_extract(value, '$.id'), json_extract(value, '$.qty'), json_extract(value, '$.rev')
       FROM json_each(NEW.guest_stake)) p
  WHERE w.uid != 'house'
  GROUP BY p.id
  ON CONFLICT(user_id, card_id) DO UPDATE SET qty = cards.qty + excluded.qty,
    reverse_qty = cards.reverse_qty + excluded.reverse_qty;
  UPDATE users SET last_played = COALESCE(NEW.flipped_at, last_played)
  WHERE id IN (NEW.host_id, NEW.guest_id);
END;

CREATE TRIGGER IF NOT EXISTS coinflip_return AFTER UPDATE ON coinflips
WHEN OLD.status = 'open' AND NEW.status = 'cancelled' BEGIN
  INSERT INTO cards(user_id, card_id, qty, reverse_qty)
  SELECT NEW.host_id, json_extract(value, '$.id'), json_extract(value, '$.qty'), json_extract(value, '$.rev')
  FROM json_each(NEW.host_stake) WHERE true
  ON CONFLICT(user_id, card_id) DO UPDATE SET qty = cards.qty + excluded.qty,
    reverse_qty = cards.reverse_qty + excluded.reverse_qty;
END;

CREATE TRIGGER IF NOT EXISTS coinflip_no_account_delete BEFORE DELETE ON profiles
WHEN EXISTS (SELECT 1 FROM coinflips WHERE host_id = OLD.user_id AND status = 'open') BEGIN
  SELECT RAISE(ABORT, 'Cancel your open coin flips before deleting your account.');
END;
CREATE TRIGGER IF NOT EXISTS coinflip_no_account_reset BEFORE UPDATE OF created_at ON profiles
WHEN EXISTS (SELECT 1 FROM coinflips WHERE host_id = OLD.user_id AND status = 'open') BEGIN
  SELECT RAISE(ABORT, 'Cancel your open coin flips before resetting your account.');
END;
