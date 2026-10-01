-- The avatar frame a player chose to wear (an id from js/levels.js FRAMES).
-- NULL or empty means "the best frame my level has earned". worker/social.js
-- ensureSocialSchema adds the same column lazily, because no session can run
-- remote migrations; this file is for whoever applies migrations later.
-- Purely additive: one nullable column, nothing dropped, every row keeps working.
ALTER TABLE users ADD COLUMN frame TEXT;
