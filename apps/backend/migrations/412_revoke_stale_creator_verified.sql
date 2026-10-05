-- Migration 412: revoke stale `creator_verified` flags surfaced by the
-- 2026-09-29 badge audit.
--
-- Two buckets, both cleared (owner-approved):
--
--   A. creator_verified=true AND creator_status IN ('none','suspended')
--      21 users — no longer active creators, badge is misleading. Includes
--      6 tombstoned `deleted_*` rows.
--
--   B. creator_verified=true AND creator_status='active' AND identity_verified=false
--      47 users — flagged verified but never went through the identity
--      check. Includes some real active creators (KOBTON1, CLAYADAMSS,
--      CLOUDYDAYSPNPTV, THEDUKEOFLANDOVER, PNPLATINOBOY/Lex …). Owner's
--      call: if they legitimately verified through a legacy manual path,
--      re-set creator_verified=true individually after ID upload.
--
-- Only `creator_verified` is touched. `creator_status`, entitlements,
-- payouts and hangout memberships are left alone. Frontend `BadgeRow` will
-- stop showing the "Verified Creator" checkmark on these 68 profiles.

BEGIN;

-- Bucket A
UPDATE users
   SET creator_verified = false
 WHERE creator_verified = true
   AND creator_status IN ('none', 'suspended');

-- Bucket B
UPDATE users
   SET creator_verified = false
 WHERE creator_verified = true
   AND creator_status = 'active'
   AND identity_verified = false;

COMMIT;
