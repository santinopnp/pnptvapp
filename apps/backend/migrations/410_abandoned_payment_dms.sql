-- Migration 410: Track abandonment-recovery DMs sent from SantinoFurioso
-- (user_id 8599671840) to members whose payment attempt went to
-- abandoned/expired/failed. One-line rule enforced by the sender:
-- 72h cool-off per user (only one DM per user per 72h window regardless of
-- how many abandoned attempts they made). See paymentRecoveryService.sendAbandonmentDMs.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS abandoned_payment_dms (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  triggered_by TEXT NOT NULL,          -- 'payments:abandoned' | 'checkout_intents:expired' | 'dash:expired' | ...
  triggered_ref TEXT,                  -- payment id / intent id / order id (for audit)
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dm_id BIGINT,                        -- direct_messages.id when the DM landed
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_abandoned_payment_dms_user_recent
  ON abandoned_payment_dms (user_id, sent_at DESC);
