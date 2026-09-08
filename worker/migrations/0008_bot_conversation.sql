-- Runtime also adds this column idempotently.
ALTER TABLE bots ADD COLUMN reply_depth INTEGER NOT NULL DEFAULT 0;
