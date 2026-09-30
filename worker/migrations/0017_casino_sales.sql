-- One-tap "sell all winnings" for every casino game. A sale is one row: the
-- cards sold (never more than the player holds), their value in cents at the
-- market rate selling always uses, and one part number so a game's winnings
-- can be sold in bounded chunks (a huge battle pot must not run D1 out of
-- memory). The triggers check ownership, take the cards and credit the coins
-- in the same transaction, so a sale can neither be repeated nor oversold.
CREATE TABLE IF NOT EXISTS casino_sales (
  source TEXT NOT NULL CHECK(source IN ('coinflip','jackpot','battle')),
  game_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  part INTEGER NOT NULL DEFAULT 0,
  items TEXT NOT NULL,
  cents INTEGER NOT NULL CHECK(cents >= 0),
  at INTEGER NOT NULL,
  PRIMARY KEY(source, game_id, user_id, part)
);

CREATE TRIGGER IF NOT EXISTS casino_sale_check BEFORE INSERT ON casino_sales BEGIN
  SELECT (CASE WHEN json_type(NEW.items) != 'array' OR json_array_length(NEW.items) < 1 OR json_array_length(NEW.items) > 200
    THEN RAISE(ABORT, 'Nothing to sell.') END);
  SELECT (CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.items) s
    WHERE typeof(json_extract(s.value, '$.qty')) != 'integer' OR json_extract(s.value, '$.qty') < 1
      OR typeof(json_extract(s.value, '$.rev')) != 'integer' OR json_extract(s.value, '$.rev') < 0
      OR json_extract(s.value, '$.rev') > json_extract(s.value, '$.qty')
      OR typeof(json_extract(s.value, '$.v')) != 'integer' OR json_extract(s.value, '$.v') < 0
  ) OR EXISTS (
    SELECT 1 FROM json_each(NEW.items) s GROUP BY json_extract(s.value, '$.id') HAVING COUNT(*) > 1
  ) THEN RAISE(ABORT, 'That sale is not valid.') END);
  SELECT (CASE WHEN NEW.cents != (SELECT COALESCE(SUM(json_extract(s.value, '$.qty') * json_extract(s.value, '$.v')), 0)
    FROM json_each(NEW.items) s) THEN RAISE(ABORT, 'That sale is not valid.') END);
  SELECT (CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.items) s
    LEFT JOIN cards c ON c.user_id = NEW.user_id AND c.card_id = json_extract(s.value, '$.id')
    WHERE c.qty IS NULL OR c.qty < json_extract(s.value, '$.qty')
      OR c.reverse_qty < json_extract(s.value, '$.rev')
      OR json_extract(s.value, '$.qty') - json_extract(s.value, '$.rev') > c.qty - c.reverse_qty
  ) THEN RAISE(ABORT, 'You no longer have those cards.') END);
END;

CREATE TRIGGER IF NOT EXISTS casino_sale_pay AFTER INSERT ON casino_sales BEGIN
  UPDATE cards SET
    qty = qty - (SELECT json_extract(s.value, '$.qty') FROM json_each(NEW.items) s
      WHERE json_extract(s.value, '$.id') = cards.card_id),
    reverse_qty = reverse_qty - (SELECT json_extract(s.value, '$.rev') FROM json_each(NEW.items) s
      WHERE json_extract(s.value, '$.id') = cards.card_id)
  WHERE user_id = NEW.user_id
    AND card_id IN (SELECT json_extract(value, '$.id') FROM json_each(NEW.items));
  DELETE FROM cards WHERE user_id = NEW.user_id AND qty <= 0
    AND card_id IN (SELECT json_extract(value, '$.id') FROM json_each(NEW.items));
  UPDATE profiles SET coins = ROUND(coins + NEW.cents / 100.0, 2) WHERE user_id = NEW.user_id;
END;
