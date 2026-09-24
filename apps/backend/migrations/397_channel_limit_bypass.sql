BEGIN;

-- Per-creator bypass flag: when true, skips MAX_CHANNELS_PER_CREATOR count limit,
-- ONE_PAID_CHANNEL_LIMIT, and unlocks all access types (paid, subscription, bts, prime).
ALTER TABLE users ADD COLUMN IF NOT EXISTS channel_limit_bypass BOOLEAN NOT NULL DEFAULT false;

-- Grant cloudcomputa unlimited channels of all types.
UPDATE users SET channel_limit_bypass = true WHERE id = '5643392748';

COMMIT;
