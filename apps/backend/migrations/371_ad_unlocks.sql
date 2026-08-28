-- Migration 371: ad_unlocks — temporary entitlements granted after a
-- rewarded video ad completes. Grindr-style monetization for free-tier
-- users. Basic + PRIME are exempt (enforced in adUnlockService.grantUnlock).
--
-- One row per successful ad view. surface identifies WHERE the unlock
-- applies ('mainstage_extend', 'prime_video_single', 'nearby_premium',
-- 'dm_extra'). expires_at drives all reads — cleanup cron sweeps expired
-- rows daily.
--
-- ad_txn_id is the ad network's transaction/click ID. UNIQUE constraint
-- makes callback processing idempotent — replaying a signed callback
-- (network retry, replay attack) is a no-op after first insert.

CREATE TABLE IF NOT EXISTS ad_unlocks (
  id              BIGSERIAL PRIMARY KEY,
  user_id         TEXT NOT NULL,
  surface         VARCHAR(64) NOT NULL,
  ad_network      VARCHAR(32) NOT NULL,
  ad_txn_id       VARCHAR(255) NOT NULL,
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,
  meta            JSONB DEFAULT '{}'::jsonb,
  CONSTRAINT ad_unlocks_txn_unique UNIQUE (ad_network, ad_txn_id)
);

-- Not a partial WHERE expires_at > NOW() index — Postgres refuses NOW()
-- in predicates (not IMMUTABLE). Full index on (user_id, surface,
-- expires_at DESC) — cheap because rows are small and the cleanup cron
-- purges expired ones daily.
CREATE INDEX IF NOT EXISTS idx_ad_unlocks_active
  ON ad_unlocks (user_id, surface, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_ad_unlocks_expires
  ON ad_unlocks (expires_at);
