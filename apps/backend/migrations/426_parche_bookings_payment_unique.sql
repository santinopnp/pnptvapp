-- Migration 426: unique constraint on parche_bookings.payment_id
-- Prevents duplicate booking confirmation if the IPN fires twice before the
-- processing lock in the webhook handler takes effect.

ALTER TABLE parche_bookings
  ADD CONSTRAINT uq_parche_bookings_payment_id UNIQUE (payment_id);
