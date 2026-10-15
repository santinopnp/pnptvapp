-- Migration 424: Parche packages — group call offerings

CREATE TABLE IF NOT EXISTS parche_packages (
  id               SERIAL       PRIMARY KEY,
  parche_id        UUID         NOT NULL REFERENCES parches(id) ON DELETE CASCADE,
  title            VARCHAR(100) NOT NULL,
  description      TEXT,
  duration_minutes INTEGER      NOT NULL CHECK (duration_minutes IN (30,60,90,120)),
  price_usd        NUMERIC(10,2) NOT NULL CHECK (price_usd > 0),
  sku              TEXT         UNIQUE NOT NULL,
  is_active        BOOLEAN      NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parche_packages_parche
  ON parche_packages(parche_id) WHERE is_active = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_parche_packages_updated_at'
  ) THEN
    CREATE TRIGGER trg_parche_packages_updated_at
      BEFORE UPDATE ON parche_packages
      FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
  END IF;
END $$;
