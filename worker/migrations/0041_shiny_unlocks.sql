-- Earned shiny profile pictures (worker/shiny.js, rules in js/shiny.js).
-- The Worker also creates these tables itself at runtime (ensureShinySchema), with
-- the same DDL, so a deploy never needs this run by hand. Purely additive.
-- shiny_unlocks: one row per Pokémon (Pokédex number) whose shiny the player may wear.
--   source is "bl:<card id>" (a Black Label of that card) or "set:<set id>" (a mastered set's pick).
-- shiny_picks: the one pick each mastered set gives; the primary key is the lock.
-- No coins or cards move.
CREATE TABLE IF NOT EXISTS shiny_unlocks (
  user_id TEXT NOT NULL,
  species INTEGER NOT NULL,
  source TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, species)
);
CREATE TABLE IF NOT EXISTS shiny_picks (
  user_id TEXT NOT NULL,
  set_id TEXT NOT NULL,
  species INTEGER NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, set_id)
);
