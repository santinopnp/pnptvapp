-- Migration 314: Expand call_booking_surveys with granular rating fields
-- and open-ended feedback columns

ALTER TABLE call_booking_surveys
  ADD COLUMN IF NOT EXISTS tech_quality        INTEGER CHECK (tech_quality BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS performance_quality INTEGER CHECK (performance_quality BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS presentation        INTEGER CHECK (presentation BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS politeness          INTEGER CHECK (politeness BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS tech_improvement    TEXT,
  ADD COLUMN IF NOT EXISTS app_feedback        TEXT,
  ADD COLUMN IF NOT EXISTS equipment_feedback  TEXT,
  ADD COLUMN IF NOT EXISTS share_with_model    BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_call_booking_surveys_creator_id
  ON call_booking_surveys(creator_id);
