-- Canonical university academic calendar with multi-event days and source lineage.
-- The legacy campus_master_calendar remains a blocked-date projection only.

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

DO $$
BEGIN
  ALTER TABLE admin_academic_calendar_events
    ADD CONSTRAINT chk_admin_calendar_event_scope
    CHECK (event_scope IN ('UNIVERSITY', 'CAMPUS', 'SCHOOL', 'DEPARTMENT', 'PROGRAMME', 'AUDIENCE'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE admin_academic_calendar_events
    ADD CONSTRAINT chk_admin_calendar_scope_ids_array
    CHECK (jsonb_typeof(applicable_scope_ids) = 'array');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE admin_academic_calendar_events
    ADD CONSTRAINT chk_admin_calendar_source_hash
    CHECK (source_hash IS NULL OR source_hash ~ '^[0-9a-fA-F]{64}$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_calendar_event_source_hash
  ON admin_academic_calendar_events (tenant_id, source_hash)
  WHERE source_hash IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_admin_calendar_tenant_year_dates
  ON admin_academic_calendar_events (tenant_id, academic_year, starts_on, ends_on)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE academic_calendar_days IS
  'One university-wide day classification per date; events remain separate multi-event records.';
COMMENT ON COLUMN admin_academic_calendar_events.applicable_scope_ids IS
  'Explicit university, campus, school, department, programme or audience scope identifiers.';
COMMENT ON COLUMN admin_academic_calendar_events.source_hash IS
  'SHA-256 idempotency key for a source event record.';
