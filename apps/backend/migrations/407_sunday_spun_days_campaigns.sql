-- Sunday Spun Days — recurring weekly $15 → 1 month PRIME promo.
-- One row per weekly campaign fire. Landing visits + conversions come from
-- side tables and checkout_intents (JOIN on metadata->>'campaign_id').

CREATE TABLE IF NOT EXISTS sunday_spun_days_campaigns (
  id BIGSERIAL PRIMARY KEY,
  week_iso TEXT NOT NULL UNIQUE,                 -- '2026-W39'
  fired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  audience_size INTEGER NOT NULL DEFAULT 0,
  tg_sent INTEGER NOT NULL DEFAULT 0,
  tg_failed INTEGER NOT NULL DEFAULT 0,
  tg_blocked INTEGER NOT NULL DEFAULT 0,
  dm_sent INTEGER NOT NULL DEFAULT 0,
  dm_failed INTEGER NOT NULL DEFAULT 0,
  redeem_url TEXT,
  redemption_deadline TIMESTAMPTZ,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_ssd_campaigns_fired_at
  ON sunday_spun_days_campaigns (fired_at DESC);

-- Landing page visits (one row per pageview; dedup by user+campaign).
CREATE TABLE IF NOT EXISTS sunday_spun_days_visits (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  week_iso TEXT NOT NULL,
  visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_id TEXT,
  ip_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_ssd_visits_week
  ON sunday_spun_days_visits (week_iso, visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_ssd_visits_user_week
  ON sunday_spun_days_visits (user_id, week_iso);
