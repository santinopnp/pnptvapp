-- Migration 438: background policy scanner
--
-- policy_flags
--   One row per piece of user text the scanner found suspicious: off-platform
--   payment or services, paid meetups, scams (block tier, normally already
--   refused in real time but recorded here when they slipped through another
--   write path), and flag-only signals (contact sharing, external links,
--   content sales, staff impersonation, copy-paste blasts). Reviewed in
--   Admin → Compliance Queue → Policy flags.
--
-- policy_scan_cursors
--   Where the scanner left off in each source, so every row is scanned once.
--
-- anti_leakage_strikes
--   Constraints widened for the new strike categories and sources.

CREATE TABLE IF NOT EXISTS policy_flags (
  id              BIGSERIAL    PRIMARY KEY,
  user_id         VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source          VARCHAR(32)  NOT NULL,   -- 'dm' | 'chat' | 'post' | 'profile' | 'album_caption' | 'channel_video' | 'dm_blast'
  source_id       VARCHAR(64)  NOT NULL,   -- row id in the source table ('blast:<hash>' for blasts)
  source_ref      VARCHAR(255),            -- recipient, room, etc.
  categories      TEXT[]       NOT NULL,
  tier            VARCHAR(8)   NOT NULL CHECK (tier IN ('block', 'flag')),
  score           INT          NOT NULL DEFAULT 0,
  excerpt         TEXT,
  matched_terms   JSONB        NOT NULL DEFAULT '[]'::jsonb,
  is_creator      BOOLEAN      NOT NULL DEFAULT false,
  status          VARCHAR(16)  NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'actioned')),
  reviewed_by     VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (source, source_id)
);

CREATE INDEX IF NOT EXISTS idx_policy_flags_open_user
  ON policy_flags (user_id, created_at DESC)
  WHERE status = 'open';

CREATE TABLE IF NOT EXISTS policy_scan_cursors (
  source      VARCHAR(32)  PRIMARY KEY,
  last_id     BIGINT,
  last_ts     TEXT,          -- exact DB timestamp text (keeps microseconds)
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE anti_leakage_strikes DROP CONSTRAINT IF EXISTS anti_leakage_strikes_category_check;
ALTER TABLE anti_leakage_strikes ADD CONSTRAINT anti_leakage_strikes_category_check
  CHECK (category IN ('off_platform_competitor', 'off_platform_payment', 'off_platform_services', 'paid_meetup', 'scam'));

ALTER TABLE anti_leakage_strikes DROP CONSTRAINT IF EXISTS anti_leakage_strikes_source_check;
ALTER TABLE anti_leakage_strikes ADD CONSTRAINT anti_leakage_strikes_source_check
  CHECK (source_type IN ('bio', 'dm', 'mainstage_chat', 'hangout_chat', 'chat_room', 'post',
                         'channel_description', 'display_name', 'username', 'policy_review'));
