-- 321_meru_activation_code_unique.sql
-- Enforce uniqueness on meru_payment_links.activation_code so a code-generation
-- collision (astronomically rare at 32^12) can never persist two conflicting
-- rows. Without this, a collision would create an orphaned reserved row that
-- the reconciler would attempt to process forever.
--
-- The existing btree index (idx_meru_links_activation_code) is redundant with
-- the UNIQUE constraint's implicit index, so drop it first.

DROP INDEX IF EXISTS idx_meru_links_activation_code;

ALTER TABLE meru_payment_links
  ADD CONSTRAINT uq_meru_activation_code UNIQUE (activation_code);
