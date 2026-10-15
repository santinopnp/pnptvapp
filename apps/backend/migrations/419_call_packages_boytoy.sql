-- Migration 419: Add boytoy call packages for Santino and Lex
-- Boytoy selection (colombian / venezuelan) stored in bookings.metadata JSONB
-- at booking creation time: {"boytoy_selection": "colombian"}
--
-- Prerequisites confirmed before writing:
--   - performers rows exist for both user_ids (active)
--   - 60-min solo packages already exist and are active:
--       Santino: CALL-85996718-60M-Q1-MUGJLH7MIOIIKP  (id 281, $100)
--       Lex:     CALL-PNPLATINOBOY-60M-Q1              (id 223, $100)
-- This migration is idempotent — ON CONFLICT DO NOTHING on sku (UNIQUE).

-- ── Santino (8599671840) ──────────────────────────────────────────────────────

INSERT INTO call_packages
  (creator_id, duration_minutes, quantity, price_usd, sku, title, is_active, created_at, updated_at)
VALUES
  (
    '8599671840',
    60, 1, 180.00,
    'CALL-8599671840-60M-BOYTOY1',
    '60-Min Call + 1 Boytoy',
    true,
    NOW(), NOW()
  ),
  (
    '8599671840',
    60, 1, 250.00,
    'CALL-8599671840-60M-BOYTOY2',
    '60-Min Call + 2 Boytoys',
    true,
    NOW(), NOW()
  )
ON CONFLICT (sku) DO NOTHING;

-- ── Lex (8f5f4dd1-7bdb-4571-b026-e09d91113c91) ───────────────────────────────

INSERT INTO call_packages
  (creator_id, duration_minutes, quantity, price_usd, sku, title, is_active, created_at, updated_at)
VALUES
  (
    '8f5f4dd1-7bdb-4571-b026-e09d91113c91',
    60, 1, 180.00,
    'CALL-8f5f4dd1-60M-BOYTOY1',
    '60-Min Call + 1 Boytoy',
    true,
    NOW(), NOW()
  ),
  (
    '8f5f4dd1-7bdb-4571-b026-e09d91113c91',
    60, 1, 250.00,
    'CALL-8f5f4dd1-60M-BOYTOY2',
    '60-Min Call + 2 Boytoys',
    true,
    NOW(), NOW()
  )
ON CONFLICT (sku) DO NOTHING;
