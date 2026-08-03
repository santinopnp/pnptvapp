-- 344: first-hour crypto-purchase bonus for users who just completed the tutorial.
-- If a user makes any successful NowPayments purchase within 1h of finishing the
-- guide, they get +100 Santino-only tokens (creator_gifts[SANTINO_USER_ID]).
-- Idempotent per user via the timestamp column.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS crypto_guide_bonus_granted_at TIMESTAMPTZ;
