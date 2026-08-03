-- 345_spender_online_pings.sql
-- Tracks push/DM pings sent to a creator when a "warm" token-holding viewer
-- transitions offline→online. Used to enforce per-pair debounce (1 per 6h)
-- and per-creator daily cap (10/day).

CREATE TABLE IF NOT EXISTS spender_online_pings (
  id          BIGSERIAL PRIMARY KEY,
  creator_id  VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewer_id   VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spender_online_pings_pair_sent
  ON spender_online_pings (creator_id, viewer_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_spender_online_pings_creator_sent
  ON spender_online_pings (creator_id, sent_at DESC);
