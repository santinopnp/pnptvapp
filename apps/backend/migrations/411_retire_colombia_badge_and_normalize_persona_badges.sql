-- Migration 411: retire the Colombia (Socio Colombia) badge and normalize
-- the legacy Telegram-era persona badges (users.badges TEXT[]).
--
-- Colombia badge:
--   No longer awarded and no longer rendered on profiles. 153 users had
--   `colombia_badge = true` from historical `co_only` invite-link redemptions
--   (see inviteLinkService.redeemLink). We clear the flag and drop the
--   column — no service is expected to read it after this migration ships
--   (paired code edits in the same deploy).
--
-- Legacy persona badges (users.badges TEXT[]):
--   These came from the "Cloudy Days" Telegram group era: meth_alpha,
--   slam_slut, spun_royal, chem_mermaids. Some rows still have emoji-prefixed
--   variants ("🔥 Slam Slut", "👑 Spun Royal", "🧠 Meth Alpha",
--   "🐚 Chem Mermaid") because the label got written into the array instead
--   of the canonical slug. Also two garbage rows: "6" and
--   "🔥 Santino's fav slut of the week" (1 user each). We normalize to the
--   four canonical slugs and drop the rest so the frontend BadgeRow can
--   render them consistently.
--
-- No new writes to users.badges from application code — badges are legacy
-- and are NOT offered to new users. This migration is purely a data cleanup.

BEGIN;

-- ── Colombia badge: clear + drop ─────────────────────────────────────────────
UPDATE users SET colombia_badge = false WHERE colombia_badge = true;
ALTER TABLE users DROP COLUMN IF EXISTS colombia_badge;

-- ── Persona badges: normalize emoji labels → canonical slugs ────────────────
UPDATE users SET badges = ARRAY(
  SELECT DISTINCT CASE
    WHEN b = '🔥 Slam Slut' THEN 'slam_slut'
    WHEN b = '👑 Spun Royal' THEN 'spun_royal'
    WHEN b = '🧠 Meth Alpha' THEN 'meth_alpha'
    WHEN b = '🐚 Chem Mermaid' THEN 'chem_mermaids'
    ELSE b
  END
  FROM UNNEST(badges) AS b
  WHERE b IN (
    'meth_alpha', 'slam_slut', 'spun_royal', 'chem_mermaids',
    '🔥 Slam Slut', '👑 Spun Royal', '🧠 Meth Alpha', '🐚 Chem Mermaid'
  )
)
WHERE array_length(badges, 1) > 0;

COMMIT;
