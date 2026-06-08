-- HR Document Vault, onboarding status, and async bulk export jobs

ALTER TABLE hr_employee_documents
  ADD COLUMN IF NOT EXISTS file_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES users(user_id) ON DELETE SET NULL;

UPDATE hr_employee_documents
SET file_name = split_part(regexp_replace(file_url, '^.*/', ''), '?', 1)
WHERE file_name IS NULL AND file_url IS NOT NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_onboarding_status'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT chk_users_onboarding_status
      CHECK (onboarding_status IN ('PENDING_ONBOARDING', 'IN_PROGRESS', 'ACTIVE', 'EXITED'));
  END IF;
END $$;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20) NULL;

CREATE TABLE IF NOT EXISTS hr_document_export_jobs (
  job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  entity_id INT NULL REFERENCES org_entities(entity_id) ON DELETE SET NULL,
  requested_by UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED')),
  file_key TEXT NULL,
  file_name VARCHAR(255) NULL,
  error_message TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_hr_document_export_jobs_tenant
  ON hr_document_export_jobs(tenant_id, requested_by, created_at DESC);
