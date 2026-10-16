-- Migration 428: prevent double-booking of the same Parche by the same buyer
-- A buyer should only have one active booking per Parche at a time.
-- This partial index covers only pending/confirmed states so completed/cancelled
-- bookings don't block re-booking.

CREATE UNIQUE INDEX IF NOT EXISTS uq_parche_bookings_buyer_active
  ON parche_bookings (parche_id, buyer_id)
  WHERE status IN ('awaiting_payment', 'confirmed');
