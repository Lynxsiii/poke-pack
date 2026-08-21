ALTER TABLE users ADD COLUMN avatar TEXT NOT NULL DEFAULT '25';
ALTER TABLE users ADD COLUMN banner TEXT NOT NULL DEFAULT 'me5:darkrai';
ALTER TABLE users ADD COLUMN showcase TEXT;
ALTER TABLE users ADD COLUMN shown_stats TEXT;

CREATE TABLE friends (
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (from_id, to_id),
  FOREIGN KEY (from_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (to_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE profile_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE presence (
  user_id TEXT PRIMARY KEY,
  seen_at INTEGER NOT NULL,
  last_chat_at INTEGER NOT NULL DEFAULT 0,
  last_comment_at INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_friends_to ON friends(to_id, status);
CREATE INDEX idx_friends_from ON friends(from_id, status);
CREATE INDEX idx_comments_profile ON profile_comments(profile_id, created_at DESC);
CREATE INDEX idx_chat_created ON chat_messages(created_at DESC);
CREATE INDEX idx_presence_seen ON presence(seen_at DESC);
