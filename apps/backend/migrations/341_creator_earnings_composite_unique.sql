-- Migration 341: switch creator_earnings dedup from source_payment_id alone
-- to the composite (source_payment_id, creator_id).
--
-- Why: the promo_token_bundle IPN handler splits one payment across multiple
-- co-founders (2026-08-01 @CHASETHECLOUDS purchase → Santino + Lex). The old
-- single-column UNIQUE let Santino's earnings row through but blocked Lex's
-- insert with a duplicate-key error that got swallowed as "non-critical",
-- silently losing $16 of Lex's share. Every current row still has a unique
-- (source_payment_id, creator_id) tuple so this migration is data-safe.
--
-- Every existing INSERT path (call payments, creator subs, content-compliance
-- holds, restore-nowpayments-creator-subs, promo_token_bundle IPN) is
-- updated in the same PR to use ON CONFLICT (source_payment_id, creator_id).

BEGIN;

ALTER TABLE creator_earnings DROP CONSTRAINT IF EXISTS uq_creator_earnings_source_payment;
DROP INDEX IF EXISTS creator_earnings_source_payment_id_unique;

CREATE UNIQUE INDEX IF NOT EXISTS creator_earnings_source_payment_creator_unique
  ON creator_earnings (source_payment_id, creator_id)
  WHERE source_payment_id IS NOT NULL;

COMMIT;
