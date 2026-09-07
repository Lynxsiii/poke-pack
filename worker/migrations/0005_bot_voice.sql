-- Written voice for the ambient roster (worker/llm.js).
--
-- line_pool holds idle lines already generated and not yet said; a bot shifts
-- one off each time it speaks and refills when it runs low, so the common case
-- costs no request. pool_at and bio_at pace the two calls that write them.
--
-- All three are inert without NVIDIA_API_KEY — the roster falls back to the
-- hand-written pools in bots.js and nothing here is read.
ALTER TABLE bots ADD COLUMN line_pool TEXT;
ALTER TABLE bots ADD COLUMN pool_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bots ADD COLUMN bio_at INTEGER NOT NULL DEFAULT 0;

-- Cached stats so a tick can brief the model on numbers the bot can actually
-- back up, and the two stamps that stop a person's message or DM being
-- answered twice.
ALTER TABLE bots ADD COLUMN packs INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bots ADD COLUMN cards INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bots ADD COLUMN last_human_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bots ADD COLUMN last_dm_at INTEGER NOT NULL DEFAULT 0;
