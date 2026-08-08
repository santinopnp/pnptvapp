-- 361: Privy webhook audit trail + user↔privy_id linkage
-- Enables support/recovery lookups: "which pnptv user owns wallet 0xabc" / "what
-- events fired against privy user did:privy:xyz". Every incoming webhook is
-- persisted before dispatch so we never lose an event even if handlers throw.

CREATE TABLE IF NOT EXISTS privy_events (
  id             BIGSERIAL PRIMARY KEY,
  svix_id        TEXT NOT NULL UNIQUE,
  event_type     TEXT NOT NULL,
  privy_user_id  TEXT,
  wallet_address TEXT,
  payload        JSONB NOT NULL,
  received_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_privy_events_user_id
  ON privy_events(privy_user_id) WHERE privy_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_privy_events_wallet
  ON privy_events(lower(wallet_address)) WHERE wallet_address IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_privy_events_type_time
  ON privy_events(event_type, received_at DESC);

-- Link Privy identity to our users table. Nullable + unique — most users have
-- no Privy account yet.
ALTER TABLE users ADD COLUMN IF NOT EXISTS privy_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_privy_id
  ON users(privy_id) WHERE privy_id IS NOT NULL;
