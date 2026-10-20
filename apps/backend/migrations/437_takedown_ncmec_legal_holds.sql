-- Migration 437: removal requests, NCMEC case tracking, legal holds
--
-- removal_requests
--   Public intake for (a) non-consensual intimate imagery, which the federal
--   TAKE IT DOWN Act requires platforms to remove within 48 hours of a valid
--   request, and (b) other complaints / removal requests from people depicted,
--   which card-network rules require resolving within 7 business days.
--
-- ncmec_cases
--   18 U.S.C. § 2258A: on actual knowledge of apparent CSAM a provider must
--   report to NCMEC's CyberTipline and preserve the report contents for one
--   year after submission (REPORT Act 2024). A case opens automatically for
--   every 'csam' user report; moderators record the CyberTip report id.
--
-- creator_2257_records FK
--   28 C.F.R. § 75.4 requires keeping 2257 records for 7 years. Deleting a
--   user used to CASCADE-delete them; RESTRICT makes that impossible even if
--   the application-level legal-hold check in hardDeleteUser is bypassed.

CREATE TABLE IF NOT EXISTS removal_requests (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                VARCHAR(16)  NOT NULL CHECK (kind IN ('ncii', 'complaint')),
  requester_name      TEXT         NOT NULL,
  requester_email     TEXT         NOT NULL,
  is_depicted_person  BOOLEAN      NOT NULL DEFAULT false,
  content_urls        TEXT[]       NOT NULL,
  description         TEXT,
  signature           TEXT         NOT NULL,
  good_faith_statement BOOLEAN     NOT NULL DEFAULT false,
  status              VARCHAR(16)  NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'removed', 'rejected')),
  due_at              TIMESTAMPTZ  NOT NULL,
  resolved_at         TIMESTAMPTZ,
  resolved_by         VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  resolution_note     TEXT,
  ip                  VARCHAR(45),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_removal_requests_open_due
  ON removal_requests (due_at)
  WHERE status = 'open';

CREATE TABLE IF NOT EXISTS ncmec_cases (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_report_id     VARCHAR(64),
  reported_user_id   VARCHAR(255) NOT NULL,
  evidence_type      VARCHAR(32),
  evidence_id        VARCHAR(64),
  status             VARCHAR(16)  NOT NULL DEFAULT 'pending_review'
                       CHECK (status IN ('pending_review', 'reported', 'not_csam')),
  cybertip_report_id VARCHAR(64),
  reported_at        TIMESTAMPTZ,
  preserve_until     TIMESTAMPTZ,
  notes              TEXT,
  handled_by         VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- reported_user_id intentionally has no FK: the case must outlive the account.
CREATE INDEX IF NOT EXISTS idx_ncmec_cases_user ON ncmec_cases (reported_user_id);
CREATE INDEX IF NOT EXISTS idx_ncmec_cases_open ON ncmec_cases (created_at) WHERE status = 'pending_review';

ALTER TABLE creator_2257_records
  DROP CONSTRAINT IF EXISTS creator_2257_records_user_id_fkey;
ALTER TABLE creator_2257_records
  ADD CONSTRAINT creator_2257_records_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;
