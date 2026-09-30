-- Casino jackpot. worker/jackpot.js applies this same DDL to itself once per
-- isolate (JACKPOT_DDL in worker/casino-ddl.js, generated from this file),
-- because no session can run remote migrations; every statement is IF NOT
-- EXISTS, so running this file later is harmless.
--
-- One row is one pot, one row per entry in jackpot_entries. A human entry's cards
-- leave `cards` when its row is inserted (a BEFORE trigger checks the player owns
-- them, an AFTER trigger takes them). When the pot is drawn the winner is paid
-- every entry's pile in the same transaction that marks the pot done; a pot that
-- is cancelled returns every human pile, a player who leaves gets their own back.
-- Nothing else ever writes cards for a pot, so cards are conserved by
-- construction. A bot entry (user_id NULL) stakes generated cards worth a little
-- less than the host's and never owned anything: when it loses nothing is paid
-- out of it, when it wins the cards simply vanish.
CREATE TABLE IF NOT EXISTS jackpots (
  id TEXT PRIMARY KEY,
  host_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','done','cancelled')),
  max_players INTEGER NOT NULL CHECK(max_players BETWEEN 3 AND 10),
  min_value INTEGER NOT NULL CHECK(min_value > 0),
  winner_seat INTEGER,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  drawn_at INTEGER,
  UNIQUE(host_id, request_id)
);
CREATE INDEX IF NOT EXISTS jackpots_recent ON jackpots(status, created_at DESC);
CREATE INDEX IF NOT EXISTS jackpots_host ON jackpots(host_id, status);

CREATE TABLE IF NOT EXISTS jackpot_entries (
  jackpot_id TEXT NOT NULL,
  seat INTEGER NOT NULL CHECK(seat BETWEEN 0 AND 9),
  user_id TEXT,
  bot INTEGER NOT NULL DEFAULT 0 CHECK(bot IN (0,1)),
  bot_persona TEXT,
  stake TEXT NOT NULL,
  value INTEGER NOT NULL CHECK(value > 0),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(jackpot_id, seat)
);
CREATE UNIQUE INDEX IF NOT EXISTS jackpot_entry_user ON jackpot_entries(jackpot_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS jackpot_entry_persona ON jackpot_entries(jackpot_id, bot_persona);
CREATE INDEX IF NOT EXISTS jackpot_entry_by_user ON jackpot_entries(user_id);

-- The pot's own columns never change except its status, winner and draw time.
CREATE TRIGGER IF NOT EXISTS jackpot_start_check BEFORE INSERT ON jackpots BEGIN
  SELECT (CASE WHEN NEW.status != 'open' OR NEW.winner_seat IS NOT NULL OR NEW.drawn_at IS NOT NULL
    THEN RAISE(ABORT, 'A jackpot starts open.') END);
END;

CREATE TRIGGER IF NOT EXISTS jackpot_fixed BEFORE UPDATE ON jackpots
WHEN NEW.host_id != OLD.host_id OR NEW.min_value != OLD.min_value OR NEW.max_players != OLD.max_players
  OR NEW.id != OLD.id OR NEW.created_at != OLD.created_at OR NEW.expires_at != OLD.expires_at BEGIN
  SELECT RAISE(ABORT, 'That jackpot cannot be changed.');
END;

-- A pot that is not open never changes again: no second draw, no cancel after
-- the draw, no refund of a paid-out pile.
CREATE TRIGGER IF NOT EXISTS jackpot_final BEFORE UPDATE ON jackpots
WHEN OLD.status != 'open' BEGIN
  SELECT RAISE(ABORT, 'That jackpot is already settled.');
END;

CREATE TRIGGER IF NOT EXISTS jackpot_settle_check BEFORE UPDATE ON jackpots
WHEN OLD.status = 'open' AND NEW.status = 'done' BEGIN
  SELECT (CASE WHEN NEW.winner_seat IS NULL OR NEW.drawn_at IS NULL
    OR NOT EXISTS (SELECT 1 FROM jackpot_entries WHERE jackpot_id = OLD.id AND seat = NEW.winner_seat)
    OR (SELECT COUNT(*) FROM jackpot_entries WHERE jackpot_id = OLD.id) < 2
    THEN RAISE(ABORT, 'That jackpot cannot be drawn yet.') END);
  SELECT (CASE WHEN OLD.expires_at <= CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
    THEN RAISE(ABORT, 'That jackpot has expired.') END);
END;

CREATE TRIGGER IF NOT EXISTS jackpot_settle_open BEFORE UPDATE ON jackpots
WHEN OLD.status = 'open' AND NEW.status = 'open' BEGIN
  SELECT RAISE(ABORT, 'That jackpot cannot be changed.');
END;

CREATE TRIGGER IF NOT EXISTS jackpot_cancel_check BEFORE UPDATE ON jackpots
WHEN OLD.status = 'open' AND NEW.status = 'cancelled' AND (NEW.winner_seat IS NOT NULL OR NEW.drawn_at IS NOT NULL) BEGIN
  SELECT RAISE(ABORT, 'That jackpot cannot be changed.');
END;

CREATE TRIGGER IF NOT EXISTS jackpot_entry_check BEFORE INSERT ON jackpot_entries BEGIN
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
  SELECT (CASE WHEN json_type(NEW.stake) != 'array' OR json_array_length(NEW.stake) < 1
    THEN RAISE(ABORT, 'Put up at least one card.') END);
  SELECT (CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.stake) s
    WHERE typeof(json_extract(s.value, '$.qty')) != 'integer' OR json_extract(s.value, '$.qty') < 1
      OR typeof(json_extract(s.value, '$.rev')) != 'integer' OR json_extract(s.value, '$.rev') < 0
      OR json_extract(s.value, '$.rev') > json_extract(s.value, '$.qty')
      OR typeof(json_extract(s.value, '$.v')) != 'integer' OR json_extract(s.value, '$.v') < 0
  ) OR EXISTS (
    SELECT 1 FROM json_each(NEW.stake) s GROUP BY json_extract(s.value, '$.id') HAVING COUNT(*) > 1
  ) THEN RAISE(ABORT, 'That stake is not valid.') END);
  -- The entry's value is exactly what its cards add up to.
  SELECT (CASE WHEN NEW.value != (SELECT SUM(json_extract(s.value, '$.v') * json_extract(s.value, '$.qty')) FROM json_each(NEW.stake) s)
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
END;

CREATE TRIGGER IF NOT EXISTS jackpot_entry_take AFTER INSERT ON jackpot_entries
WHEN NEW.user_id IS NOT NULL BEGIN
  UPDATE cards SET
    qty = qty - (SELECT json_extract(s.value, '$.qty') FROM json_each(NEW.stake) s
      WHERE json_extract(s.value, '$.id') = cards.card_id),
    reverse_qty = reverse_qty - (SELECT json_extract(s.value, '$.rev') FROM json_each(NEW.stake) s
      WHERE json_extract(s.value, '$.id') = cards.card_id)
  WHERE user_id = NEW.user_id
    AND card_id IN (SELECT json_extract(value, '$.id') FROM json_each(NEW.stake));
  DELETE FROM cards WHERE user_id = NEW.user_id AND qty <= 0
    AND card_id IN (SELECT json_extract(value, '$.id') FROM json_each(NEW.stake));
END;

-- Entries are history once written. The only way one goes is its owner leaving an
-- open pot (never the host, never a bot): the pile goes back with it.
CREATE TRIGGER IF NOT EXISTS jackpot_entry_frozen BEFORE UPDATE ON jackpot_entries BEGIN
  SELECT RAISE(ABORT, 'That entry cannot be changed.');
END;

CREATE TRIGGER IF NOT EXISTS jackpot_entry_leave_check BEFORE DELETE ON jackpot_entries BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM jackpots WHERE id = OLD.jackpot_id AND status = 'open')
    THEN RAISE(ABORT, 'That jackpot is already settled.') END);
  SELECT (CASE WHEN OLD.user_id IS NULL OR OLD.user_id = (SELECT host_id FROM jackpots WHERE id = OLD.jackpot_id)
    THEN RAISE(ABORT, 'That entry cannot be removed.') END);
END;

CREATE TRIGGER IF NOT EXISTS jackpot_entry_leave AFTER DELETE ON jackpot_entries
WHEN OLD.user_id IS NOT NULL BEGIN
  INSERT INTO cards(user_id, card_id, qty, reverse_qty)
  SELECT OLD.user_id, json_extract(value, '$.id'), json_extract(value, '$.qty'), json_extract(value, '$.rev')
  FROM json_each(OLD.stake) WHERE true
  ON CONFLICT(user_id, card_id) DO UPDATE SET qty = cards.qty + excluded.qty,
    reverse_qty = cards.reverse_qty + excluded.reverse_qty;
END;

-- The draw: the winning human takes every entry's cards. A bot winner takes them
-- out of the game.
CREATE TRIGGER IF NOT EXISTS jackpot_settle AFTER UPDATE ON jackpots
WHEN OLD.status = 'open' AND NEW.status = 'done' BEGIN
  INSERT INTO cards(user_id, card_id, qty, reverse_qty)
  SELECT w.uid, p.id, SUM(p.q), SUM(p.r)
  FROM (SELECT user_id AS uid FROM jackpot_entries WHERE jackpot_id = NEW.id AND seat = NEW.winner_seat) w,
    (SELECT json_extract(j.value, '$.id') AS id, json_extract(j.value, '$.qty') AS q, json_extract(j.value, '$.rev') AS r
       FROM jackpot_entries e, json_each(e.stake) j WHERE e.jackpot_id = NEW.id) p
  WHERE w.uid IS NOT NULL
  GROUP BY p.id
  ON CONFLICT(user_id, card_id) DO UPDATE SET qty = cards.qty + excluded.qty,
    reverse_qty = cards.reverse_qty + excluded.reverse_qty;
  UPDATE users SET last_played = COALESCE(NEW.drawn_at, last_played)
  WHERE id IN (SELECT user_id FROM jackpot_entries WHERE jackpot_id = NEW.id AND user_id IS NOT NULL);
END;

CREATE TRIGGER IF NOT EXISTS jackpot_return AFTER UPDATE ON jackpots
WHEN OLD.status = 'open' AND NEW.status = 'cancelled' BEGIN
  INSERT INTO cards(user_id, card_id, qty, reverse_qty)
  SELECT e.user_id, json_extract(j.value, '$.id'), json_extract(j.value, '$.qty'), json_extract(j.value, '$.rev')
  FROM jackpot_entries e, json_each(e.stake) j WHERE e.jackpot_id = NEW.id AND e.user_id IS NOT NULL
  ON CONFLICT(user_id, card_id) DO UPDATE SET qty = cards.qty + excluded.qty,
    reverse_qty = cards.reverse_qty + excluded.reverse_qty;
END;

CREATE TRIGGER IF NOT EXISTS jackpot_no_account_delete BEFORE DELETE ON profiles
WHEN EXISTS (SELECT 1 FROM jackpot_entries e JOIN jackpots j ON j.id = e.jackpot_id
  WHERE e.user_id = OLD.user_id AND j.status = 'open') BEGIN
  SELECT RAISE(ABORT, 'Cancel or leave your open jackpots before deleting your account.');
END;
CREATE TRIGGER IF NOT EXISTS jackpot_no_account_reset BEFORE UPDATE OF created_at ON profiles
WHEN EXISTS (SELECT 1 FROM jackpot_entries e JOIN jackpots j ON j.id = e.jackpot_id
  WHERE e.user_id = OLD.user_id AND j.status = 'open') BEGIN
  SELECT RAISE(ABORT, 'Cancel or leave your open jackpots before resetting your account.');
END;
