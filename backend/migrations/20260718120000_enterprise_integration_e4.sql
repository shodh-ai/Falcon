-- Phase E.4 — Enterprise integration: transcripts, bulk upload traceability

CREATE TABLE IF NOT EXISTS official_transcripts (
  transcript_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  semester INT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'REQUESTED',
  verification_code VARCHAR(64),
  pdf_url TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  approved_by_user_id UUID REFERENCES users(user_id),
  generated_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_official_transcripts_tenant_student
  ON official_transcripts (tenant_id, student_user_id);
CREATE INDEX IF NOT EXISTS idx_official_transcripts_verification_code
  ON official_transcripts (verification_code) WHERE verification_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_official_transcripts_status
  ON official_transcripts (tenant_id, status);

CREATE TABLE IF NOT EXISTS student_bulk_upload_runs (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  actor_user_id UUID NOT NULL REFERENCES users(user_id),
  filename VARCHAR(512) NOT NULL,
  rows_total INT NOT NULL DEFAULT 0,
  rows_imported INT NOT NULL DEFAULT 0,
  rows_failed INT NOT NULL DEFAULT 0,
  duplicate_rows INT NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'COMPLETED',
  error_details JSONB,
  rollback_available BOOLEAN NOT NULL DEFAULT true,
  rolled_back_at TIMESTAMPTZ,
  rolled_back_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_bulk_upload_runs_tenant
  ON student_bulk_upload_runs (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS student_bulk_upload_run_users (
  run_id UUID NOT NULL REFERENCES student_bulk_upload_runs(run_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  prn VARCHAR(64),
  PRIMARY KEY (run_id, user_id)
);
