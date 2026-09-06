-- Migration 393: ad_events instrumentation table for monetization analytics.
--
-- Records every AdSlot impression, click, dismiss + upgrade CTA events so we
-- can measure conversion cohort (users who saw ads then upgraded), slot
-- performance, and revenue attribution. Anonymous visitors record NULL
-- user_id — session_id keeps their journey linkable within a single visit.
--
-- Volume estimate: ~5-20 events per active user per session. Sample if we
-- grow (impressions become dominant). Indexes are minimal — we query mostly
-- by user_id for exposure lookups and by (created_at, event_type) for daily
-- reports. Anything heavier goes through a materialized view.

CREATE TABLE IF NOT EXISTS ad_events (
  id            BIGSERIAL PRIMARY KEY,
  user_id       VARCHAR(255)                REFERENCES users(id) ON DELETE SET NULL,
  session_id    VARCHAR(64)                 NOT NULL,
  slot_id       VARCHAR(64)                 NOT NULL,
  event_type    VARCHAR(32)                 NOT NULL,
  metadata      JSONB                       NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),

  CONSTRAINT ad_events_event_type_chk CHECK (event_type IN (
    'impression',
    'click',
    'dismiss',
    'upgrade_shown',
    'upgrade_click',
    'popunder_fired',
    'push_subscribed'
  ))
);

CREATE INDEX IF NOT EXISTS idx_ad_events_user_created
  ON ad_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ad_events_slot_created
  ON ad_events (slot_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ad_events_created
  ON ad_events (created_at DESC);

-- Fast anonymous session lookups for cohort analysis (do session's events
-- eventually land under a user_id when they sign up?)
CREATE INDEX IF NOT EXISTS idx_ad_events_session
  ON ad_events (session_id, created_at DESC);
