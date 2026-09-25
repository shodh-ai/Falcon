-- Represent an intentional zero teaching load without disabling the faculty
-- account or inventing a placeholder course allocation.

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

-- The department has confirmed that Preeti Khulbe and Vivek Gupta must remain
-- active faculty without a 2026-2027 teaching load.
CREATE TEMP TABLE pharmacy_no_load_faculty (
  official_email TEXT PRIMARY KEY,
  reason TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO pharmacy_no_load_faculty VALUES
  ('preeti.khulbe@mygyanvihar.com', 'Department-confirmed faculty without teaching load'),
  ('vivek.gupta@mygyanvihar.com', 'Department-confirmed faculty without teaching load');

DO $$
DECLARE resolved_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO resolved_count
  FROM pharmacy_no_load_faculty n
  JOIN public.tenants t ON t.subdomain = 'sgvu' AND t.is_active = true
  JOIN users u
    ON u.tenant_id = t.tenant_id
   AND lower(u.official_email) = lower(n.official_email)
   AND u.is_active = true
   AND u.deleted_at IS NULL;
  IF resolved_count <> 2 THEN
    RAISE EXCEPTION 'Expected both Pharmacy no-load faculty identities; resolved %', resolved_count;
  END IF;
END $$;

-- Preserve the affected courses as active, unassigned teaching needs.
WITH ctx AS (
  SELECT t.tenant_id, u.user_id
  FROM public.tenants t
  JOIN pharmacy_no_load_faculty n ON true
  JOIN users u
    ON u.tenant_id = t.tenant_id
   AND lower(u.official_email) = lower(n.official_email)
  WHERE t.subdomain = 'sgvu' AND t.is_active = true
), affected AS (
  SELECT a.*
  FROM academic_course_allocations a
  JOIN ctx ON ctx.tenant_id = a.tenant_id AND ctx.user_id = a.faculty_user_id
  WHERE a.academic_year = '2026-2027' AND a.status = 'ACTIVE'
), superseded AS (
  UPDATE academic_course_allocations a
  SET status = 'SUPERSEDED', updated_at = NOW()
  FROM affected x
  WHERE a.allocation_id = x.allocation_id
  RETURNING x.*
)
INSERT INTO academic_course_allocations(
  tenant_id, subject_id, program_name, semester, faculty_user_id,
  academic_year, course_id, status
)
SELECT s.tenant_id, s.subject_id, s.program_name, s.semester, NULL,
       s.academic_year, s.course_id, 'ACTIVE'
FROM superseded s
WHERE NOT EXISTS (
  SELECT 1
  FROM academic_course_allocations existing
  WHERE existing.tenant_id = s.tenant_id
    AND existing.subject_id = s.subject_id
    AND existing.program_name IS NOT DISTINCT FROM s.program_name
    AND existing.semester IS NOT DISTINCT FROM s.semester
    AND existing.academic_year = s.academic_year
    AND existing.faculty_user_id IS NULL
    AND existing.status = 'ACTIVE'
);

WITH ctx AS (
  SELECT t.tenant_id, u.user_id
  FROM public.tenants t
  JOIN pharmacy_no_load_faculty n ON true
  JOIN users u
    ON u.tenant_id = t.tenant_id
   AND lower(u.official_email) = lower(n.official_email)
  WHERE t.subdomain = 'sgvu' AND t.is_active = true
)
UPDATE academic_timetables tt
SET deleted_at = NOW()
FROM ctx
WHERE tt.tenant_id = ctx.tenant_id
  AND tt.faculty_user_id = ctx.user_id
  AND tt.deleted_at IS NULL;

WITH resolved AS (
  SELECT t.tenant_id, u.user_id, n.reason
  FROM public.tenants t
  JOIN pharmacy_no_load_faculty n ON true
  JOIN users u
    ON u.tenant_id = t.tenant_id
   AND lower(u.official_email) = lower(n.official_email)
  WHERE t.subdomain = 'sgvu' AND t.is_active = true
)
INSERT INTO academic_faculty_load_declarations(
  tenant_id, faculty_user_id, academic_year, status, reason, revision
)
SELECT tenant_id, user_id, '2026-2027', 'NO_TEACHING_LOAD', reason, 1
FROM resolved
ON CONFLICT(tenant_id, faculty_user_id, academic_year) DO UPDATE SET
  status = 'NO_TEACHING_LOAD',
  reason = EXCLUDED.reason,
  revision = CASE
    WHEN academic_faculty_load_declarations.status IS DISTINCT FROM 'NO_TEACHING_LOAD'
      OR academic_faculty_load_declarations.reason IS DISTINCT FROM EXCLUDED.reason
    THEN academic_faculty_load_declarations.revision + 1
    ELSE academic_faculty_load_declarations.revision
  END,
  updated_at = NOW();

INSERT INTO academic_faculty_load_declaration_history(
  declaration_id, tenant_id, faculty_user_id, academic_year, status,
  reason, revision, changed_by, idempotency_key, request_hash
)
SELECT d.declaration_id, d.tenant_id, d.faculty_user_id, d.academic_year,
       d.status, d.reason, d.revision, NULL,
       'seed-pharmacy-no-load-' || d.academic_year || '-' || d.faculty_user_id,
       encode(digest(
         d.tenant_id::text || ':' || d.faculty_user_id::text || ':' ||
         d.academic_year || ':' || d.status || ':' || COALESCE(d.reason, ''),
         'sha256'
       ), 'hex')
FROM academic_faculty_load_declarations d
JOIN public.tenants t ON t.tenant_id = d.tenant_id AND t.subdomain = 'sgvu'
JOIN pharmacy_no_load_faculty n ON true
JOIN users u
  ON u.tenant_id = d.tenant_id
 AND u.user_id = d.faculty_user_id
 AND lower(u.official_email) = lower(n.official_email)
WHERE d.academic_year = '2026-2027'
ON CONFLICT(declaration_id, revision) DO NOTHING;

DO $$
DECLARE assigned_count INTEGER; declaration_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO assigned_count
  FROM academic_course_allocations a
  JOIN public.tenants t ON t.tenant_id = a.tenant_id AND t.subdomain = 'sgvu'
  JOIN users u ON u.user_id = a.faculty_user_id AND u.tenant_id = a.tenant_id
  WHERE a.academic_year = '2026-2027'
    AND a.status = 'ACTIVE'
    AND lower(u.official_email) IN (
      'preeti.khulbe@mygyanvihar.com', 'vivek.gupta@mygyanvihar.com'
    );
  SELECT COUNT(*) INTO declaration_count
  FROM academic_faculty_load_declarations d
  JOIN public.tenants t ON t.tenant_id = d.tenant_id AND t.subdomain = 'sgvu'
  WHERE d.academic_year = '2026-2027' AND d.status = 'NO_TEACHING_LOAD';
  IF assigned_count <> 0 OR declaration_count < 2 THEN
    RAISE EXCEPTION 'Pharmacy no-load reconciliation failed: assigned %, declarations %',
      assigned_count, declaration_count;
  END IF;
END $$;

COMMIT;
