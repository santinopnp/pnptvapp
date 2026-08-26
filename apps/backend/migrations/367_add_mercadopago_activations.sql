-- Migration 367: MercadoPago (mpago.li hosted link) pending activation tracking
-- Mirror of 350 (Nequi Negocios). Stores buyer registrations from the
-- /mercadopago post-payment landing page so admins can verify payment in the
-- MercadoPago dashboard and grant lifetime access in one click.
-- Link on /lifetime100 → https://mpago.li/2hvNVkH → charges ~320,000 COP (≈ $100 USD).

CREATE TABLE IF NOT EXISTS mercadopago_activations (
  id                    SERIAL PRIMARY KEY,
  email                 TEXT NOT NULL,
  user_id               TEXT REFERENCES users(id) ON DELETE SET NULL,
  mp_reference          TEXT,
  mp_transaction_id     TEXT,
  mp_status             TEXT,
  status                TEXT NOT NULL DEFAULT 'pending',  -- pending | activated | rejected
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at          TIMESTAMPTZ,
  notes                 TEXT
);

CREATE INDEX IF NOT EXISTS idx_mercadopago_status  ON mercadopago_activations (status);
CREATE INDEX IF NOT EXISTS idx_mercadopago_email   ON mercadopago_activations (email);
CREATE INDEX IF NOT EXISTS idx_mercadopago_user_id ON mercadopago_activations (user_id);
