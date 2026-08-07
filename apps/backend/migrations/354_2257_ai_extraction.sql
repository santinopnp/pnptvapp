-- Migration 354: AI-assisted document extraction on creator_2257_records
-- Populated by identityVerificationService.analyzeDocumentWithAI (xAI grok-4.3 vision).
-- Admin review UI shows these side-by-side with creator-submitted fields.

ALTER TABLE creator_2257_records
  ADD COLUMN IF NOT EXISTS ai_extracted_name TEXT,
  ADD COLUMN IF NOT EXISTS ai_extracted_dob DATE,
  ADD COLUMN IF NOT EXISTS ai_extracted_doc_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS ai_extracted_expiry DATE,
  ADD COLUMN IF NOT EXISTS ai_extracted_country VARCHAR(3),
  ADD COLUMN IF NOT EXISTS ai_confidence_score DECIMAL(4,3),
  ADD COLUMN IF NOT EXISTS ai_flags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ai_raw_response JSONB,
  ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_error TEXT;

CREATE INDEX IF NOT EXISTS idx_2257_ai_analyzed_at ON creator_2257_records(ai_analyzed_at);
CREATE INDEX IF NOT EXISTS idx_2257_ai_flags ON creator_2257_records USING GIN(ai_flags);
