-- Migration 335 — Per-user "hide from these regions" privacy toggle
--
-- Adds users.hide_from_regions text[] holding ISO region tags the user does
-- NOT want to be seen from. Two granularities are stored side by side:
--   * "US"        — hide from every viewer geolocating to the US
--   * "US-FL"     — hide only from viewers geolocating to Florida
-- The array-overlap operator (&&) matches either form against the viewer's
-- tag set ['US','US-FL'], so a single filter clause covers both.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS hide_from_regions TEXT[] NOT NULL DEFAULT '{}';

-- GIN accelerates the array-overlap (&&) and contains (?) operators used
-- by the nearby / discover / feed filters.
CREATE INDEX IF NOT EXISTS idx_users_hide_from_regions
  ON users USING GIN (hide_from_regions)
  WHERE hide_from_regions <> '{}';

COMMIT;
