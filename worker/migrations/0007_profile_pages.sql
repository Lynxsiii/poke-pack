-- Also added idempotently by ensureSocialSchema on existing installations.
ALTER TABLE users ADD COLUMN binder_pages TEXT;
