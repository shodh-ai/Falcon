-- Repair migration for deployments that stopped before the faculty load
-- declaration migration completed.  This migration is intentionally
-- idempotent and contains no department-specific seed assumptions so a
-- partially migrated production database can recover safely.

BEGIN;

CREATE TABLE IF NOT EXISTS academic_faculty_load_declarations (
  declaration_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  faculty_user_id UUID NOT NULL REFERENCES users(user_id),
  academic_year VARCHAR(20) NOT NULL,
  status VARCHAR(40) NOT NULL CHECK (status IN ('NO_TEACHING_LOAD', 'AVAILABLE_FOR_ALLOCATION')),
  reason TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  declared_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, faculty_user_id, academic_year)
);

CREATE TABLE IF NOT EXISTS academic_faculty_load_declaration_history (
  history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  declaration_id UUID NOT NULL REFERENCES academic_faculty_load_declarations(declaration_id),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  faculty_user_id UUID NOT NULL REFERENCES users(user_id),
  academic_year VARCHAR(20) NOT NULL,
  status VARCHAR(40) NOT NULL CHECK (status IN ('NO_TEACHING_LOAD', 'AVAILABLE_FOR_ALLOCATION')),
  reason TEXT,
  revision INTEGER NOT NULL CHECK (revision > 0),
  changed_by UUID REFERENCES users(user_id),
  idempotency_key VARCHAR(160) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, changed_by, idempotency_key),
  UNIQUE (declaration_id, revision)
);

CREATE INDEX IF NOT EXISTS idx_faculty_load_declarations_scope
  ON academic_faculty_load_declarations(tenant_id, academic_year, status);

-- Older images may have created the table but not the timetable soft-delete
-- column used when a declared no-load member is unassigned.
DO $$
BEGIN
  IF to_regclass('public.academic_timetables') IS NOT NULL THEN
    ALTER TABLE academic_timetables
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION prevent_declared_no_load_allocation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'ACTIVE'
     AND NEW.faculty_user_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM academic_faculty_load_declarations d
       WHERE d.tenant_id = NEW.tenant_id
         AND d.faculty_user_id = NEW.faculty_user_id
         AND d.academic_year = NEW.academic_year
         AND d.status = 'NO_TEACHING_LOAD'
     ) THEN
    RAISE EXCEPTION 'Faculty % is declared NO_TEACHING_LOAD for %',
      NEW.faculty_user_id, NEW.academic_year
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_declared_no_load_allocation
  ON academic_course_allocations;
CREATE TRIGGER trg_prevent_declared_no_load_allocation
BEFORE INSERT OR UPDATE OF faculty_user_id, academic_year, status
ON academic_course_allocations
FOR EACH ROW EXECUTE FUNCTION prevent_declared_no_load_allocation();

COMMIT;
