-- Migration 423: Parche — creator collectives for group calls
-- A Parche is a named group of 2–5 creators who offer joint private calls.
-- It appears in /live and has its own booking page at /book/parche/:slug.

-- ── parches ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS parches (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          VARCHAR(50) UNIQUE NOT NULL,
  name          VARCHAR(100) NOT NULL,
  description   TEXT,
  location_city VARCHAR(100),
  created_by    VARCHAR     REFERENCES users(id) ON DELETE SET NULL,
  status        TEXT        NOT NULL DEFAULT 'forming'
                            CHECK (status IN ('forming','active','paused','disbanded')),
  is_open       BOOLEAN     NOT NULL DEFAULT false,
  preview_media JSONB       NOT NULL DEFAULT '[]',
  max_members   SMALLINT    NOT NULL DEFAULT 5 CHECK (max_members BETWEEN 2 AND 10),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parches_slug   ON parches(slug);
CREATE INDEX IF NOT EXISTS idx_parches_status ON parches(status);
CREATE INDEX IF NOT EXISTS idx_parches_open   ON parches(is_open) WHERE status = 'active';

-- ── parche_members ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS parche_members (
  id            SERIAL      PRIMARY KEY,
  parche_id     UUID        NOT NULL REFERENCES parches(id) ON DELETE CASCADE,
  creator_id    VARCHAR     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          TEXT        NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  invite_status TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (invite_status IN ('pending','accepted','declined')),
  invited_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at  TIMESTAMPTZ,
  UNIQUE (parche_id, creator_id)
);

CREATE INDEX IF NOT EXISTS idx_parche_members_creator  ON parche_members(creator_id);
CREATE INDEX IF NOT EXISTS idx_parche_members_parche   ON parche_members(parche_id);
CREATE INDEX IF NOT EXISTS idx_parche_members_pending  ON parche_members(parche_id)
  WHERE invite_status = 'pending';

-- ── updated_at trigger for parches ───────────────────────────────────────────
-- fn_set_updated_at() is created in migration 173 (CREATE OR REPLACE), safe to reference.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_parches_updated_at'
  ) THEN
    CREATE TRIGGER trg_parches_updated_at
      BEFORE UPDATE ON parches
      FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
  END IF;
END $$;
