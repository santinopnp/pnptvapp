-- Weekly creator payout approval workflow.
--   Monday 09:00 America/Bogota -> runWeeklyPayoutProposals()
--   Monday 16:00 America/Bogota -> runWeeklyApprovalDeadline() (rollover)
--   Admin marks paid on Tuesday, uploads receipt to R2.

CREATE TABLE IF NOT EXISTS creator_weekly_payout_approvals (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start                DATE NOT NULL,
  creator_id                VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance_usd               NUMERIC(12,2) NOT NULL,
  balance_cop               NUMERIC(14,0),
  usd_cop_rate              NUMERIC(10,2),
  payout_method_snapshot    JSONB NOT NULL,
  source_earning_ids        UUID[] NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'proposed'
                            CHECK (status IN ('proposed','approved','rejected','expired','paid')),
  approved_at               TIMESTAMPTZ,
  approved_method_override  JSONB,
  processed_at              TIMESTAMPTZ,
  processed_by_admin_id     VARCHAR(255),
  receipt_url               TEXT,
  receipt_uploaded_at       TIMESTAMPTZ,
  tx_reference              TEXT,
  admin_notes               TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_cwpa_week_creator UNIQUE (week_start, creator_id)
);

CREATE INDEX IF NOT EXISTS idx_cwpa_status_week   ON creator_weekly_payout_approvals (status, week_start);
CREATE INDEX IF NOT EXISTS idx_cwpa_creator       ON creator_weekly_payout_approvals (creator_id, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_cwpa_proposed_open ON creator_weekly_payout_approvals (creator_id) WHERE status = 'proposed';

COMMENT ON TABLE creator_weekly_payout_approvals IS
  'Weekly payout proposals: sent Mondays 09:00 Bogota, creator approves by 16:00 same day, admin processes Tuesdays.';
