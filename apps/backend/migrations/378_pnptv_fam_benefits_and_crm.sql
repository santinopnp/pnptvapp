BEGIN;

-- ── PNPtv Fam — benefits reveal + feed layout + CRM foundation ─────────────
-- Ships:
--   1. Second one-time "breathtaking" modal for benefits/consent (fires after
--      the welcome modal is dismissed).
--   2. Persistent feed layout preferences (mode + up to 3 shortcuts).
--   3. Append-only event log for CRM lifecycle tracking.
--   4. Content-credit ledger — every time a Fam member consumes exclusive
--      content, a row is logged with the credit owed to the creator. This is
--      the auditable receipt for the "creators still get paid" promise made
--      in the benefits modal.

-- ── 1. Benefits modal dismissal flag ────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pnptv_fam_benefits_seen_at TIMESTAMPTZ;

-- ── 2. Feed layout preferences ──────────────────────────────────────────────
-- mode: 'fam' | 'standard'; shortcuts: [{type, ref, label}], max 3.
-- Default = fam mode with no shortcuts (customizer prompts user to pick).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pnptv_fam_feed_layout JSONB NOT NULL
    DEFAULT '{"mode":"fam","shortcuts":[]}'::jsonb;

-- ── 3. Event log — CRM lifecycle tracking ───────────────────────────────────
CREATE TABLE IF NOT EXISTS pnptv_fam_events (
  id           BIGSERIAL PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL,      -- login|feed_toggle|shortcut_click|content_view|creator_gift|upsell_view|upsell_click|dwell_ms|benefits_dismissed|welcome_dismissed|customizer_saved
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pnptv_fam_events_user_time
  ON pnptv_fam_events(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_pnptv_fam_events_type_time
  ON pnptv_fam_events(event_type, occurred_at DESC);

-- ── 4. Content-credit ledger — creator compensation receipts ────────────────
-- Rate table (in code, apps/backend/services/pnpFamCrmService.js):
--   exclusive_video_view   → 5¢
--   exclusive_photo_view   → 1¢
--   exclusive_post_view    → 2¢
--   dm_open                → 10¢ (only for creator DMs a fam member opens)
--   live_view_minute       → 3¢
-- Payouts sweep unpaid rows monthly alongside standard creator earnings.
CREATE TABLE IF NOT EXISTS pnptv_fam_content_credits (
  id                BIGSERIAL PRIMARY KEY,
  fam_user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creator_user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_type      TEXT NOT NULL,   -- exclusive_video|exclusive_photo|exclusive_post|dm_open|live_view_minute
  content_ref       TEXT,            -- post_id, video_id, etc.
  credit_cents      INTEGER NOT NULL CHECK (credit_cents >= 0),
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_out_at       TIMESTAMPTZ,     -- set by payout batch
  payout_batch_id   TEXT             -- links to the creator_earnings batch it went out with
);

CREATE INDEX IF NOT EXISTS idx_ffcc_creator_unpaid
  ON pnptv_fam_content_credits(creator_user_id)
  WHERE paid_out_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ffcc_fam_time
  ON pnptv_fam_content_credits(fam_user_id, occurred_at DESC);
-- Dedup enforcement (one credit per fam+creator+content_ref+day) is done in
-- pnpFamCrmService.logContentCredit via a WHERE occurred_at::date = ... check
-- rather than a functional index — DATE_TRUNC on timestamptz isn't IMMUTABLE.
CREATE INDEX IF NOT EXISTS idx_ffcc_fam_creator_content
  ON pnptv_fam_content_credits(fam_user_id, creator_user_id, content_type, content_ref);

-- ── 5. Pre-mark the 3 real fam members as benefits-seen (canary gate) ───────
-- The benefits modal fires only when pnptv_fam_benefits_seen_at IS NULL.
-- Pre-marking them means only Santino (who is currently canary-flagged) will
-- see it until his approval clears their seen_at.
UPDATE users
   SET pnptv_fam_benefits_seen_at = NOW()
 WHERE is_pnptv_fam = TRUE
   AND id <> '8599671840'
   AND pnptv_fam_benefits_seen_at IS NULL;

COMMIT;
