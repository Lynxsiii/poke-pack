-- Earlier production social tables lacked foreign keys. Remove records whose
-- accounts were deleted during the bot cleanup (or previously deleted users).
DELETE FROM dms WHERE from_id NOT IN (SELECT id FROM users)
  OR to_id NOT IN (SELECT id FROM users);
DELETE FROM friends WHERE from_id NOT IN (SELECT id FROM users)
  OR to_id NOT IN (SELECT id FROM users);
DELETE FROM profile_comments WHERE profile_id NOT IN (SELECT id FROM users)
  OR author_id NOT IN (SELECT id FROM users);
DELETE FROM chat_messages WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM presence WHERE user_id NOT IN (SELECT id FROM users);
