-- The runtime also adds this column idempotently for existing deployments.
ALTER TABLE bots ADD COLUMN profile_version INTEGER NOT NULL DEFAULT 0;
