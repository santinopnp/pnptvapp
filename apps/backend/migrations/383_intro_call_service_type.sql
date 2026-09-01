BEGIN;

-- ── Free 15-min intro call ──────────────────────────────────────────────────
-- Adds 'intro_call' to the creator_services service_type enum so opted-in
-- creators (initially Santino + Lex + all fam creators) can offer a
-- one-shot free intro to any new user.
--
-- Eligibility gate: users.intro_call_used_at — lifetime one-per-user
-- platform-wide (not per creator). Set when the booking is created; a
-- non-null value blocks any further intro-call booking.
--
-- Rooms + tokens: intro calls reuse the existing LiveKit token endpoint
-- for creator_service_bookings, with the room name
-- `intro-call-<bookingId>` and a 20-min token TTL (15 + 5 grace).

-- 1) Widen the service_type CHECK to include 'intro_call'.
ALTER TABLE creator_services DROP CONSTRAINT IF EXISTS creator_services_service_type_check;
ALTER TABLE creator_services
  ADD CONSTRAINT creator_services_service_type_check
  CHECK (service_type IN (
    'private_call','custom_content','priority_dm','private_main_stage','bts_subscription','intro_call'
  ));

-- 2) Same widen on the bookings table.
ALTER TABLE creator_service_bookings DROP CONSTRAINT IF EXISTS creator_service_bookings_service_type_check;
ALTER TABLE creator_service_bookings
  ADD CONSTRAINT creator_service_bookings_service_type_check
  CHECK (service_type IN (
    'private_call','custom_content','priority_dm','private_main_stage','bts_subscription','intro_call'
  ));

-- 3) One-shot ledger column.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS intro_call_used_at TIMESTAMPTZ;

-- 4) Seed intro_call service rows for founders + all active fam creators.
INSERT INTO creator_services
  (creator_user_id, service_type, price_cents, duration_minutes, fulfillment_days,
   description_en, description_es, min_audience, is_active)
SELECT
  u.id, 'intro_call', 0, 15, NULL,
  'Free 15-min intro. Say hi, get a feel for the vibe, no strings.',
  'Intro gratis de 15 min. Un saludo, sentir la vibra, sin compromiso.',
  'public', TRUE
FROM users u
WHERE (u.id IN ('8599671840', '8f5f4dd1-7bdb-4571-b026-e09d91113c91')
       OR (u.is_pnptv_fam = TRUE AND u.creator_status = 'active'))
  AND (u.deleted_at IS NULL)
ON CONFLICT (creator_user_id, service_type) DO NOTHING;

COMMIT;
