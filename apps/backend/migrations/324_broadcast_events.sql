-- Migration 324: Broadcast event log
-- Records every attempt (sent / failed / skipped) by the PNPtv auto-amplification
-- pipeline so admins can see per-creator ROI and diagnose failures.
--
-- Written to by announceVideoOnX / announceVideoToTelegramGroups /
-- broadcastNewVideo DM path (channelVideoService.js) and announceStreamLive
-- (pnpLiveNotificationService.js). Fire-and-forget writes — a failed insert
-- must never block the actual broadcast.

CREATE TABLE IF NOT EXISTS broadcast_events (
  id            BIGSERIAL PRIMARY KEY,
  creator_id    TEXT NOT NULL,
  content_type  VARCHAR(20) NOT NULL,  -- 'video' | 'stream'
  content_ref   TEXT NULL,             -- video_id (int as text) or channel_ref
  promo_post_id BIGINT NULL,
  channel       VARCHAR(30) NOT NULL,  -- 'x' | 'telegram_group' | 'telegram_dm' | 'discord'
  target        TEXT NULL,             -- specific group_id, handle, or aggregate label
  status        VARCHAR(20) NOT NULL,  -- 'sent' | 'failed' | 'skipped'
  reason        TEXT NULL,             -- reason code for status='skipped' or 'failed'
  error_message TEXT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_events_creator_created
  ON broadcast_events (creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_broadcast_events_channel_status
  ON broadcast_events (channel, status);
CREATE INDEX IF NOT EXISTS idx_broadcast_events_created_at
  ON broadcast_events (created_at DESC);
