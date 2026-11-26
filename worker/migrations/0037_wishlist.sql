-- Cards a player has hearted (the wishlist). The Worker also creates this
-- table itself at runtime (worker/wishlist.js ensureWishlistSchema).
CREATE TABLE IF NOT EXISTS wishlist (
  user_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, card_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
