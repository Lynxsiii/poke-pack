-- Apply after deploying the Worker without its cron trigger, so the roster
-- cannot recreate accounts while this migration runs. The dms table was
-- created lazily and has no foreign keys, so remove those rows explicitly.
CREATE TABLE IF NOT EXISTS dms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
DELETE FROM dms WHERE from_id IN (SELECT id FROM users WHERE bot = 1)
  OR to_id IN (SELECT id FROM users WHERE bot = 1);
-- Some older installations created social tables before their FK migrations.
DELETE FROM friends WHERE from_id IN (SELECT id FROM users WHERE bot = 1)
  OR to_id IN (SELECT id FROM users WHERE bot = 1);
DELETE FROM profile_comments WHERE profile_id IN (SELECT id FROM users WHERE bot = 1)
  OR author_id IN (SELECT id FROM users WHERE bot = 1);
DELETE FROM chat_messages WHERE user_id IN (SELECT id FROM users WHERE bot = 1);
DELETE FROM presence WHERE user_id IN (SELECT id FROM users WHERE bot = 1);
-- Core account tables have cascading foreign keys.
DELETE FROM users WHERE bot = 1;
DROP TABLE bots;
DROP INDEX idx_users_bot;
ALTER TABLE users DROP COLUMN bot;
