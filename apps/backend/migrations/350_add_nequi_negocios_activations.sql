-- Migration 350: Nequi Negocios (Wompi) pending activation tracking
-- Stores buyer registrations from /nequinegocios post-payment landing page
-- so admins can verify payment in Wompi dashboard and grant access in one click.

CREATE TABLE IF NOT EXISTS nequi_negocios_activations (
  id                    SERIAL PRIMARY KEY,
  email                 TEXT NOT NULL,
  user_id               TEXT REFERENCES users(id) ON DELETE SET NULL,
  wompi_reference       TEXT,
  wompi_transaction_id  TEXT,
  wompi_status          TEXT,
  status                TEXT NOT NULL DEFAULT 'pending',  -- pending | activated | rejected
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at          TIMESTAMPTZ,
  notes                 TEXT
);

CREATE INDEX IF NOT EXISTS idx_nequi_negocios_status  ON nequi_negocios_activations (status);
CREATE INDEX IF NOT EXISTS idx_nequi_negocios_email   ON nequi_negocios_activations (email);
CREATE INDEX IF NOT EXISTS idx_nequi_negocios_user_id ON nequi_negocios_activations (user_id);
