-- Migration 435: optional face matching consent + policy re-acceptance
--
-- Face matching processes biometric data, which Ley 1581 de 2012 (Colombia)
-- and GDPR treat as sensitive. Consent must be optional, explicit and
-- revocable, and we must be able to prove it was given (Ley 1581 art. 8b,
-- "prueba de la autorización"). Members who decline keep their account but
-- cannot upload photos/videos or go live.
--
-- users.* holds the current state for fast gating; face_match_consent_events
-- is the append-only proof trail. users.id is VARCHAR(255).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS face_match_consent          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS face_match_consented_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS face_match_consent_version  VARCHAR(32),
  ADD COLUMN IF NOT EXISTS face_match_withdrawn_at     TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS face_match_consent_events (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action          VARCHAR(16)  NOT NULL CHECK (action IN ('grant', 'withdraw')),
  consent_version VARCHAR(32)  NOT NULL,
  ip              VARCHAR(45),
  user_agent      TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_face_match_consent_events_user
  ON face_match_consent_events (user_id, created_at DESC);
