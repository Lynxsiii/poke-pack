-- A Black Label 10: a 10 whose four subgrades are all perfect. Still grade 10 to every table; it only changes the label and the value.
-- Additive: every existing slab is 0. Applied lazily by ensureGradingSchema too (worker/grading.js GRADING_COLUMNS).
ALTER TABLE graded_cards ADD COLUMN black_label INTEGER NOT NULL DEFAULT 0 CHECK(black_label IN (0,1));
