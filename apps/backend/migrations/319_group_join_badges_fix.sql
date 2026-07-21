-- Migration 319: correct hangout "group-*" badges to be awarded on real
-- unique-link joins, and revoke the badges that were mis-awarded.
--
-- Root cause: an ad-hoc one-off script (never committed to the repo, note
-- left behind as 'group-membership-seed') snapshotted CURRENT membership of
-- three hangouts' linked Telegram groups and blindly awarded each member the
-- matching badge -- with zero regard for HOW they became a member. That
-- includes group admins/creators (e.g. the two creator accounts backing
-- these hangouts), anyone manually added, and anyone who joined via a
-- generic/shared link rather than their own personal PNPtv referral link.
--
-- The legitimate signal already exists and was simply never wired to badge
-- awarding: group_migration_tracking is populated exclusively by
-- completeCreatorOnboarding() in bot/handlers/user/onboarding.js, which only
-- fires when a user completes onboarding after using a group's own unique
-- `/start grp_<chatId>` deep link. That table has zero rows for these three
-- groups (in fact zero rows at all, platform-wide) -- meaning none of the
-- 311 mis-awarded badges correspond to any real recorded join-via-link
-- event. There's no legitimate subset to preserve; all of them are revoked.
--
-- badge_slug maps a hangout to its optional per-group "you joined our
-- community the right way" badge. NULL for hangouts with no configured
-- badge (the vast majority). The application code (see the paired change in
-- completeCreatorOnboarding) now awards this badge at the same moment it
-- records the group_migration_tracking row, so it can only ever apply to a
-- genuine unique-link join going forward.

ALTER TABLE hangout_groups ADD COLUMN IF NOT EXISTS badge_slug TEXT;

UPDATE hangout_groups SET badge_slug = 'group-cloudy-days'  WHERE id = 88  AND badge_slug IS NULL;
UPDATE hangout_groups SET badge_slug = 'group-lads-up-late' WHERE id = 87  AND badge_slug IS NULL;
UPDATE hangout_groups SET badge_slug = 'group-clay-adams'   WHERE id = 123 AND badge_slug IS NULL;

-- Revoke every badge award that came from the flawed membership-snapshot
-- seed. Scoped to the three known group-* slugs and the exact note left by
-- that script, so this can't touch any unrelated badge (e.g. founder,
-- parche) awarded through a legitimate path.
DELETE FROM user_badges
WHERE note = 'group-membership-seed'
  AND badge_id IN (
    SELECT id FROM gamification_badges
    WHERE slug IN ('group-cloudy-days', 'group-lads-up-late', 'group-clay-adams')
  );
