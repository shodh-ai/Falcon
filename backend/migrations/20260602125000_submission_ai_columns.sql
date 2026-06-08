-- Phase 2: AI document validation columns on submissions (run if synchronize is off)
ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS ai_status varchar(32) NULL,
  ADD COLUMN IF NOT EXISTS ai_extracted_data jsonb NULL,
  ADD COLUMN IF NOT EXISTS ai_remarks text NULL;

CREATE INDEX IF NOT EXISTS idx_submissions_ai_status ON submissions (ai_status);
