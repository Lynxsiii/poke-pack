-- Terms and the age screen (worker/terms.js). ensureTermsSchema adds the same
-- columns lazily, because no session can run remote migrations; this file is
-- for whoever applies migrations later. Purely additive: nullable columns.
ALTER TABLE users ADD COLUMN born TEXT;
ALTER TABLE users ADD COLUMN terms_version TEXT;
ALTER TABLE users ADD COLUMN terms_at INTEGER;
