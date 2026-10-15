-- Migration 425: Parche bookings — buyer purchases of group calls

CREATE TABLE IF NOT EXISTS parche_bookings (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  parche_id        UUID         NOT NULL REFERENCES parches(id),
  package_id       INTEGER      NOT NULL REFERENCES parche_packages(id),
  buyer_id         VARCHAR      NOT NULL REFERENCES users(id),
  payment_id       UUID         REFERENCES payments(id),
  status           TEXT         NOT NULL DEFAULT 'awaiting_payment'
                                CHECK (status IN (
                                  'awaiting_payment','confirmed','completed',
                                  'cancelled','no_show'
                                )),
  scheduled_at     TIMESTAMPTZ,
  duration_minutes INTEGER      NOT NULL,
  price_cents      INTEGER      NOT NULL CHECK (price_cents > 0),
  livekit_room_name TEXT,
  buyer_note       TEXT,
  metadata         JSONB        NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parche_bookings_parche  ON parche_bookings(parche_id);
CREATE INDEX IF NOT EXISTS idx_parche_bookings_buyer   ON parche_bookings(buyer_id);
CREATE INDEX IF NOT EXISTS idx_parche_bookings_status  ON parche_bookings(status);
CREATE INDEX IF NOT EXISTS idx_parche_bookings_payment ON parche_bookings(payment_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_parche_bookings_updated_at'
  ) THEN
    CREATE TRIGGER trg_parche_bookings_updated_at
      BEFORE UPDATE ON parche_bookings
      FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
  END IF;
END $$;
