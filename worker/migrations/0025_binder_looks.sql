-- Binder looks: the animated binder editions an account has bought (worker/binder-look.js).
-- Buying goes through the gear_purchases ledger from 0019 (kind 'binder-edition'), so no change there.
--
-- The two look columns, users.binder_look and users.profile_look (JSON text, NULL = the default look),
-- are NOT added here: like binder_pages and avatar_style they are added at runtime by
-- ensureSocialSchema in worker/social.js, so an old database upgrades itself on first use.
-- Only the new table is a migration. Additive and safe to re-run; nothing is dropped.
CREATE TABLE IF NOT EXISTS binder_editions (
  user_id TEXT NOT NULL,
  edition_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, edition_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
