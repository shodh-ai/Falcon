-- HOD workflow reliability: repair status/load-table drift in long-lived databases.
-- Expand-only and safe to re-run through the migration runner.

BEGIN;

-- The faculty workspace writes section/deletion-aware timetable rows. Older
-- production databases may have been created before those columns existed.
DO $$
BEGIN
  IF to_regclass('public.academic_timetables') IS NOT NULL THEN
    ALTER TABLE academic_timetables
      ADD COLUMN IF NOT EXISTS section VARCHAR(50) DEFAULT 'A',
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
    UPDATE academic_timetables SET section = 'A' WHERE section IS NULL;
    ALTER TABLE academic_timetables ALTER COLUMN section SET DEFAULT 'A';
  END IF;
END $$;

-- Repair only exact duplicate active timetable rows. The earliest row remains
-- authoritative; duplicates are soft-deleted so attendance/audit references
-- remain intact.
DO $$
BEGIN
  IF to_regclass('public.academic_timetables') IS NOT NULL THEN
    WITH ranked AS (
      SELECT timetable_id,
             ROW_NUMBER() OVER (
               PARTITION BY tenant_id, course_id, faculty_user_id,
                            day_of_week, start_time, end_time,
                            COALESCE(room, ''), COALESCE(section, 'A')
               ORDER BY timetable_id
             ) AS duplicate_rank
      FROM academic_timetables
      WHERE deleted_at IS NULL
    )
    UPDATE academic_timetables t
       SET deleted_at = NOW()
      FROM ranked r
     WHERE t.timetable_id = r.timetable_id
       AND r.duplicate_rank > 1;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.academic_timetables') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_academic_timetables_course_slot_active
      ON academic_timetables (tenant_id, course_id, day_of_week, start_time, end_time)
      WHERE deleted_at IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.helpdesk_tickets') IS NOT NULL THEN
    ALTER TABLE helpdesk_tickets
      ADD COLUMN IF NOT EXISTS rejection_reason TEXT NULL,
      ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES users(user_id),
      ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.helpdesk_tickets') IS NOT NULL THEN
    ALTER TABLE helpdesk_tickets DROP CONSTRAINT IF EXISTS chk_helpdesk_tickets_status;
    ALTER TABLE helpdesk_tickets DROP CONSTRAINT IF EXISTS helpdesk_tickets_status_check;
    ALTER TABLE helpdesk_tickets
      ADD CONSTRAINT chk_helpdesk_tickets_status
      CHECK (status IN ('PENDING', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'));
  END IF;
END $$;

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

COMMIT;
