-- Hardening for crypto_payments (from 2026-08-08 audit)
-- 1. Add expected_amount_native for token-agnostic on-chain matching
--    (USDC: USD dollars; ETH: ETH units). expected_amount_usdc is kept
--    populated for USDC intents only, and left NULL for ETH.
-- 2. Add CHECK constraint on status so 'grant_failed' is legal.
-- 3. Partial index for grant_failed reconciler queries.

ALTER TABLE crypto_payments
  ADD COLUMN IF NOT EXISTS expected_amount_native NUMERIC(24, 12);

-- Backfill: USDC amounts match dollars 1:1.
UPDATE crypto_payments
  SET expected_amount_native = expected_amount_usdc
  WHERE expected_amount_native IS NULL AND token = 'USDC';

-- Any pre-existing ETH intents without native amount are unrecoverable — mark failed.
UPDATE crypto_payments
  SET status = 'failed',
      grant_result = COALESCE(grant_result, '{}'::jsonb) ||
        jsonb_build_object('error', 'migration_360_eth_native_missing', 'ts', NOW())
  WHERE token = 'ETH' AND expected_amount_native IS NULL AND status = 'pending';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_crypto_payments_status'
  ) THEN
    ALTER TABLE crypto_payments
      ADD CONSTRAINT chk_crypto_payments_status
      CHECK (status IN ('pending','confirmed','expired','failed','grant_failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crypto_payments_grant_failed
  ON crypto_payments(status) WHERE status = 'grant_failed';
