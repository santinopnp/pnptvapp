-- 385_creator_application_lifecycle.sql
--
-- Structured rejection reasons + lifecycle timestamps for the creator
-- application funnel. Feeds Zoho CRM Contact custom fields and Campaigns
-- segmentation (Creator_Applicants, Rejected_Applicants).
--
-- Idempotent. Safe to re-run.

-- Rejection reason picklist on model_applications (full-time application path)
ALTER TABLE model_applications
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT
  CHECK (rejection_reason IS NULL OR rejection_reason IN (
    'identity_issue',
    'underage_docs',
    'duplicate_account',
    'off_platform_solicitation',
    'incomplete_docs',
    'other'
  ));

-- Rejection reason picklist on creator_2257_records (KYC path)
ALTER TABLE creator_2257_records
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT
  CHECK (rejection_reason IS NULL OR rejection_reason IN (
    'identity_issue',
    'underage_docs',
    'duplicate_account',
    'off_platform_solicitation',
    'incomplete_docs',
    'other'
  ));

-- Application lifecycle timestamps on users (Zoho CRM syncs these)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS application_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS application_reviewed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS application_rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS creator_onboarded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS creator_suspended_at TIMESTAMPTZ;

-- Partial index for the applicant funnel query (pending/rejected only —
-- approved/active rows dominate the table and don't need this index).
CREATE INDEX IF NOT EXISTS idx_users_application_status_pending
  ON users (application_submitted_at)
  WHERE creator_status IN ('pending_review','approved_hold');

-- Backfill lifecycle timestamps from existing model_applications rows so
-- the first Zoho sync after this migration doesn't leave every pre-existing
-- applicant with a null Application_Submitted_At.
UPDATE users u
   SET application_submitted_at = COALESCE(u.application_submitted_at, ma.created_at)
  FROM model_applications ma
 WHERE ma.user_id = u.id
   AND u.application_submitted_at IS NULL;

UPDATE users u
   SET application_reviewed_at = COALESCE(u.application_reviewed_at, ma.reviewed_at)
  FROM model_applications ma
 WHERE ma.user_id = u.id
   AND ma.reviewed_at IS NOT NULL
   AND u.application_reviewed_at IS NULL;

UPDATE users u
   SET creator_onboarded_at = COALESCE(u.creator_onboarded_at, u.creator_enabled_at)
 WHERE u.creator_status = 'active'
   AND u.creator_enabled_at IS NOT NULL
   AND u.creator_onboarded_at IS NULL;
