-- Crypto guide completion tracking.
-- crypto_guide_progress_step is 0..7 mirroring the wizard screen; last-write-wins.
-- crypto_guide_completed_at is set on the wizard's final screen (screen 7)
-- or when the user explicitly taps "I already have a wallet" (skip flow).
-- crypto_guide_reward_granted_at gates the one-time 100-token grant so a user
-- who bounces through the wizard multiple times still gets the reward once.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS crypto_guide_completed_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS crypto_guide_reward_granted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS crypto_guide_progress_step   SMALLINT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_users_crypto_guide_completed
  ON users (crypto_guide_completed_at)
  WHERE crypto_guide_completed_at IS NOT NULL;
