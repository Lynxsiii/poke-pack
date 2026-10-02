-- Second XP curve and prestige (worker/xp.js XP_COLUMNS adds these on demand too).
ALTER TABLE player_xp ADD COLUMN xp2 INTEGER;
ALTER TABLE player_xp ADD COLUMN claimed2 INTEGER;
ALTER TABLE player_xp ADD COLUMN prestige INTEGER NOT NULL DEFAULT 0;
ALTER TABLE player_xp ADD COLUMN cycle TEXT;
ALTER TABLE player_xp ADD COLUMN original INTEGER NOT NULL DEFAULT 0;
