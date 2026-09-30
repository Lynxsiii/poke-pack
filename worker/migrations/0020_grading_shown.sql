-- A slab the player chose to show in the Graded section of their public profile.
ALTER TABLE graded_cards ADD COLUMN shown INTEGER NOT NULL DEFAULT 0 CHECK(shown IN (0,1));
