-- Explicitly approved local-only, additive prerequisites for the existing app.
-- Original definitions: 20260916120000_lms_independent_launch.sql,
-- 20260922120000_university_academic_calendar.sql,
-- 20261009120000_pharmacy_sem1_student_onboarding.sql.
-- Deliberately excludes record imports, deletes, resets and global activation.
CREATE TABLE IF NOT EXISTS platform_module_readiness_evidence (
  readiness_evidence_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  module_key TEXT NOT NULL REFERENCES platform_module_catalog(module_key),
  scope_type TEXT NOT NULL CHECK(scope_type IN('TENANT','CAMPUS','DEPARTMENT')),
  scope_id TEXT,
  check_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN('PASS','FAIL')),
  evidence_hash CHAR(64) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  recorded_by UUID NOT NULL REFERENCES users(user_id),
  idempotency_key TEXT NOT NULL,
  request_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK((scope_type='TENANT' AND scope_id IS NULL) OR (scope_type IN('CAMPUS','DEPARTMENT') AND scope_id IS NOT NULL)),
  UNIQUE(tenant_id,module_key,recorded_by,idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_module_readiness_latest
  ON platform_module_readiness_evidence(tenant_id,module_key,scope_type,scope_id,check_key,checked_at DESC);

CREATE TABLE IF NOT EXISTS academic_calendar_days (
  calendar_day_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  calendar_date DATE NOT NULL,
  weekday VARCHAR(9) NOT NULL,
  academic_year VARCHAR(12) NOT NULL,
  kind_of_day VARCHAR(64),
  academic_day_number INTEGER,
  source_reference TEXT,
  source_hash VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, calendar_date),
  CHECK (academic_day_number IS NULL OR academic_day_number > 0)
);
CREATE INDEX IF NOT EXISTS idx_academic_calendar_days_tenant_year
  ON academic_calendar_days (tenant_id, academic_year, calendar_date);
ALTER TABLE admin_academic_calendar_events
  ADD COLUMN IF NOT EXISTS academic_year VARCHAR(12),
  ADD COLUMN IF NOT EXISTS event_scope VARCHAR(32) NOT NULL DEFAULT 'UNIVERSITY',
  ADD COLUMN IF NOT EXISTS applicable_scope_ids JSONB NOT NULL DEFAULT '["UNIVERSITY"]'::jsonb,
  ADD COLUMN IF NOT EXISTS coordinator TEXT,
  ADD COLUMN IF NOT EXISTS activity_category TEXT,
  ADD COLUMN IF NOT EXISTS kind_of_day VARCHAR(64),
  ADD COLUMN IF NOT EXISTS source_reference TEXT,
  ADD COLUMN IF NOT EXISTS source_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS source_payload JSONB;
DO $$ BEGIN
  ALTER TABLE admin_academic_calendar_events ADD CONSTRAINT chk_admin_calendar_event_scope
    CHECK (event_scope IN ('UNIVERSITY','CAMPUS','SCHOOL','DEPARTMENT','PROGRAMME','AUDIENCE'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE admin_academic_calendar_events ADD CONSTRAINT chk_admin_calendar_scope_ids_array
    CHECK (jsonb_typeof(applicable_scope_ids)='array');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE admin_academic_calendar_events ADD CONSTRAINT chk_admin_calendar_source_hash
    CHECK (source_hash IS NULL OR source_hash ~ '^[0-9a-fA-F]{64}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_calendar_event_source_hash
  ON admin_academic_calendar_events(tenant_id,source_hash) WHERE source_hash IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_admin_calendar_tenant_year_dates
  ON admin_academic_calendar_events(tenant_id,academic_year,starts_on,ends_on) WHERE deleted_at IS NULL;

ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS student_login_id VARCHAR(80);
CREATE UNIQUE INDEX IF NOT EXISTS uq_student_profiles_tenant_login_id
  ON student_profiles(tenant_id,student_login_id)
  WHERE student_login_id IS NOT NULL AND BTRIM(student_login_id)<>'';
