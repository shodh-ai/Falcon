-- Department Data Migration Engine — import audit + rollback support

CREATE TABLE IF NOT EXISTS department_import_runs (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  department_slug VARCHAR(80) NOT NULL,
  department_name VARCHAR(120) NOT NULL,
  academic_year VARCHAR(20) NOT NULL,
  session_label VARCHAR(80),
  status VARCHAR(30) NOT NULL DEFAULT 'RUNNING'
    CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED', 'ROLLED_BACK')),
  source_files JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  validation JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  rolled_back_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_department_import_runs_tenant_slug
  ON department_import_runs(tenant_id, department_slug, started_at DESC);

ALTER TABLE academic_course_allocations
  ADD COLUMN IF NOT EXISTS import_run_id UUID REFERENCES department_import_runs(run_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_course_allocations_import_run
  ON academic_course_allocations(import_run_id)
  WHERE import_run_id IS NOT NULL;
