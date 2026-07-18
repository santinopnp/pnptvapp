-- Migration 311: Local passkey credential storage
-- Authentik's admin API does not support POST /api/v3/authenticators/admin/webauthn/
-- so we store credentials in PNPtv's own DB and verify them with SimpleWebAuthn.
-- Login falls back to Authentik's flow for passkeys registered before this migration.

CREATE TABLE IF NOT EXISTS user_passkeys (
  id                BIGSERIAL PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL DEFAULT 'My Passkey',
  credential_id     TEXT NOT NULL,
  public_key        TEXT NOT NULL,
  sign_count        BIGINT NOT NULL DEFAULT 0,
  aaguid            TEXT,
  rp_id             TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at      TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS user_passkeys_credential_id_uidx
  ON user_passkeys (credential_id);

CREATE INDEX IF NOT EXISTS user_passkeys_user_id_idx
  ON user_passkeys (user_id);
