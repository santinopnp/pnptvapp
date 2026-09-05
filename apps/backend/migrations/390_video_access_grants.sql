-- Migration 390: Per-video Rent/Buy in Ru$h
-- Users can rent a video for 48h or buy permanent access using their Ru$h balance.
-- Grants alimentan creator_earnings con split 70/30 (same as tips + subs).
-- Idempotency: video_access_grants.ledger_id UNIQUE evita double-grants en retry.

CREATE TABLE video_access_grants (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id BIGINT NOT NULL REFERENCES channel_videos(id) ON DELETE CASCADE,
  grant_type VARCHAR(10) NOT NULL CHECK (grant_type IN ('rent','buy','admin_grant')),
  expires_at TIMESTAMPTZ,                       -- NULL = permanente (buy o admin_grant sin expiry)
  price_rush INTEGER NOT NULL DEFAULT 0,        -- Ru$h debitados (0 for admin_grant)
  price_usd_cents INTEGER NOT NULL DEFAULT 0,   -- valor USD para earnings/zoho
  ledger_id BIGINT REFERENCES token_ledger(id) ON DELETE SET NULL,
  earning_id UUID REFERENCES creator_earnings(id) ON DELETE SET NULL,
  granted_by_user_id VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,  -- admin grants
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup: does this user have an active grant on this video?
CREATE INDEX idx_video_grants_user_video ON video_access_grants(user_id, video_id);

-- Expiry sweeps + user's active-grants dashboard
CREATE INDEX idx_video_grants_expires ON video_access_grants(user_id, expires_at)
  WHERE expires_at IS NOT NULL;

-- Idempotency: one grant per token_ledger row (retry-safe purchase flow)
CREATE UNIQUE INDEX idx_video_grants_ledger ON video_access_grants(ledger_id)
  WHERE ledger_id IS NOT NULL;

-- Analytics: recent grants per video
CREATE INDEX idx_video_grants_video_created ON video_access_grants(video_id, created_at DESC);

-- Per-video pricing (nullable = feature disabled for that video)
ALTER TABLE channel_videos
  ADD COLUMN rent_price_rush INTEGER
    CHECK (rent_price_rush IS NULL OR rent_price_rush BETWEEN 6 AND 3000),
  ADD COLUMN buy_price_rush INTEGER
    CHECK (buy_price_rush IS NULL OR buy_price_rush BETWEEN 30 AND 6000);

COMMENT ON COLUMN channel_videos.rent_price_rush IS
  'Ru$h cost for 48h rental. NULL disables rental. Range 6-3000 (~$1-$500).';
COMMENT ON COLUMN channel_videos.buy_price_rush IS
  'Ru$h cost for permanent buy. NULL disables buy. Range 30-6000 (~$5-$1000).';
