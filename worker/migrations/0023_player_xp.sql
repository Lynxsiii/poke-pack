-- Player XP and level rewards. worker/xp.js (ensureXpSchema) creates this same
-- table on demand, so a deploy needs no manual step; running this file later
-- replays harmlessly. Purely additive.
--
-- `xp` is the high-water mark of the XP worked out from the player's save
-- (js/xp.js), so selling cards never costs a level. `claimed_level` is the
-- highest level whose coins and gifts were paid; POST /api/levels/claim moves it
-- forward with a compare-and-swap, which is what makes a level pay once.
CREATE TABLE IF NOT EXISTS player_xp (
  user_id TEXT PRIMARY KEY,
  xp INTEGER NOT NULL DEFAULT 0,
  claimed_level INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
