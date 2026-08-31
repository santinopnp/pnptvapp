BEGIN;

-- ── Crystal Creator services — premium offerings gated by audience tier ────
-- Every Crystal Creator (users where crystal_creator_active_until is in the
-- future or 'infinity') can offer a menu of services from this catalog:
--
--   private_call          time-boxed 1-on-1 LiveKit call
--   custom_content        fan requests a photo/video, creator fulfills
--   priority_dm           guaranteed 24h response + rose-gold marker
--   private_main_stage    long private LiveKit session (1 creator + 1-3 whales)
--   bts_subscription      monthly behind-the-scenes drops
--
-- min_audience gates who can BOOK / SEE the service:
--   public      everyone
--   crystal     any Crystal-tier insider (own Crystal pass OR whale_pig OR fam)
--   whale_pig   is_whale_pig = TRUE
--   fam         is_pnptv_fam = TRUE
--
-- Access ranks: public(0) < crystal(1) < whale_pig(2) < fam(3). Fam ⊆
-- whale_pig at DB level (see trigger from migration 376), so a fam-only
-- service is strictly more exclusive than a whale-pig-only one.
--
-- Prices set 2026-08-31 per Santino:
--   private_call        $250 / 60 min       (whale_pig)
--   custom_content      $500                (whale_pig, 7-day fulfillment)
--   priority_dm         $100 / month        (fam)
--   private_main_stage  $1000 / 480 min     (fam)
--   bts_subscription    $50  / month        (crystal — any insider)

CREATE TABLE IF NOT EXISTS creator_services (
  id                 BIGSERIAL PRIMARY KEY,
  creator_user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_type       TEXT NOT NULL CHECK (service_type IN
                        ('private_call','custom_content','priority_dm','private_main_stage','bts_subscription')),
  price_cents        INTEGER NOT NULL CHECK (price_cents >= 0),
  duration_minutes   INTEGER,       -- for time-boxed types
  fulfillment_days   INTEGER,       -- for custom_content
  description_en     TEXT,
  description_es     TEXT,
  min_audience       TEXT NOT NULL DEFAULT 'public' CHECK (min_audience IN
                        ('public','crystal','whale_pig','fam')),
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (creator_user_id, service_type)
);

CREATE INDEX IF NOT EXISTS idx_creator_services_creator_active
  ON creator_services(creator_user_id)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_creator_services_audience
  ON creator_services(min_audience, is_active);

-- ── Seed default menu for the 3 founding Crystal Creators ───────────────────
-- Santino (8599671840), Lex (8f5f4dd1-…), Dejesus (8b9e2dfb-…). They can
-- edit these later in the creator studio; the seed is a working baseline.
DO $$
DECLARE
  founder TEXT;
  founders TEXT[] := ARRAY[
    '8599671840',
    '8f5f4dd1-7bdb-4571-b026-e09d91113c91',
    '8b9e2dfb-063e-4c4d-8aaa-87163f198128'
  ];
BEGIN
  FOREACH founder IN ARRAY founders LOOP
    INSERT INTO creator_services
      (creator_user_id, service_type, price_cents, duration_minutes, fulfillment_days,
       description_en, description_es, min_audience)
    VALUES
      (founder, 'private_call', 25000, 60, NULL,
       'One hour, one on one. LiveKit private room, camera on, unfiltered.',
       'Una hora, uno a uno. Sala privada LiveKit, cámara al aire, sin filtros.',
       'whale_pig'),
      (founder, 'custom_content', 50000, NULL, 7,
       'Request a custom photo or video. Delivered privately within 7 days.',
       'Pide una foto o video a la medida. Entrega privada en 7 días.',
       'whale_pig'),
      (founder, 'priority_dm', 10000, NULL, NULL,
       'Rose-gold priority marker on your DMs + guaranteed reply within 24 hours.',
       'Marcador rosé prioritario en tus DMs + respuesta garantizada en 24 horas.',
       'fam'),
      (founder, 'private_main_stage', 100000, 480, NULL,
       'Eight-hour private Main Stage. You (and up to 2 more) get the room to yourselves.',
       'Ocho horas de Main Stage privado. Tú (y hasta 2 más) tienen la sala.',
       'fam'),
      (founder, 'bts_subscription', 5000, NULL, NULL,
       'Monthly behind-the-scenes drop — private posts only Crystal insiders can see.',
       'Drop mensual detrás de cámaras — publicaciones privadas solo para insiders Crystal.',
       'crystal')
    ON CONFLICT (creator_user_id, service_type) DO NOTHING;
  END LOOP;
END $$;

COMMIT;
