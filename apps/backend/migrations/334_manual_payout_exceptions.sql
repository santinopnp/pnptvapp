-- Migration 333 — Manual (off-cycle) creator payout proposals
--
-- Adds an admin-initiated exception path on top of the Monday-cron weekly
-- workflow (see migration 329). A manual proposal:
--   * lives in the same table + status machine as the weekly ones
--   * is NOT expired by runWeeklyApprovalDeadline (admin controls its lifecycle)
--   * can coexist with the automatic weekly proposal in the same week
--
-- The previous UNIQUE (week_start, creator_id) constraint is replaced with a
-- partial unique index that only enforces uniqueness for automatic rows.

BEGIN;

ALTER TABLE creator_weekly_payout_approvals
  ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_note TEXT,
  ADD COLUMN IF NOT EXISTS created_by_admin_id VARCHAR(64);

-- Drop the old blanket unique constraint(s) if present, then install a partial
-- unique that only applies to automatic (non-manual) proposals.
ALTER TABLE creator_weekly_payout_approvals
  DROP CONSTRAINT IF EXISTS creator_weekly_payout_approvals_week_start_creator_id_key;
ALTER TABLE creator_weekly_payout_approvals
  DROP CONSTRAINT IF EXISTS uq_cwpa_week_creator;

CREATE UNIQUE INDEX IF NOT EXISTS cwpa_weekly_auto_unique
  ON creator_weekly_payout_approvals (week_start, creator_id)
  WHERE is_manual = false;

-- Small helper index for admin queries filtering manual rows.
CREATE INDEX IF NOT EXISTS cwpa_manual_status
  ON creator_weekly_payout_approvals (is_manual, status)
  WHERE is_manual = true;

COMMIT;
