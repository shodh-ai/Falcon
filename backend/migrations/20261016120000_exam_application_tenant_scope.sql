-- Examination Cell tenant isolation: make application ownership explicit.
-- This migration is intentionally schema-only; test/demo fixtures belong elsewhere.

ALTER TABLE exam_applications
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(tenant_id) ON DELETE CASCADE;

UPDATE exam_applications a
SET tenant_id = u.tenant_id
FROM users u
WHERE u.user_id = a.student_user_id
  AND a.tenant_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM exam_applications a
    JOIN users u ON u.user_id = a.student_user_id
    WHERE a.tenant_id IS NOT NULL
      AND (u.tenant_id IS NULL OR a.tenant_id <> u.tenant_id)
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce exam_applications tenant isolation: tenant mismatch exists';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM exam_applications a
    LEFT JOIN users u ON u.user_id = a.student_user_id
    WHERE u.user_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce exam_applications tenant isolation: student references are orphaned';
  END IF;
  IF EXISTS (SELECT 1 FROM exam_applications WHERE tenant_id IS NULL) THEN
    RAISE EXCEPTION
      'Cannot enforce exam_applications tenant isolation: orphan rows remain';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_exam_applications_tenant'
      AND conrelid = 'exam_applications'::regclass
  ) THEN
    ALTER TABLE exam_applications
      ADD CONSTRAINT fk_exam_applications_tenant
      FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
      ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE exam_applications
  ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_exam_applications_tenant_student
  ON exam_applications (tenant_id, student_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_exam_applications_tenant_status
  ON exam_applications (tenant_id, status);

-- Result Control updates this legacy mirror's timestamp when a re-evaluation
-- is published.  The original result table migration omitted the column.
ALTER TABLE academic_exam_results
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Legacy repository reads still select these columns.  Older foundation
-- databases omitted them, so add them as nullable expand-only columns.
ALTER TABLE academic_exam_results
  ADD COLUMN IF NOT EXISTS subject_id INT,
  ADD COLUMN IF NOT EXISTS exam_session VARCHAR(30),
  ADD COLUMN IF NOT EXISTS grade_points NUMERIC(4,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_academic_exam_results_tenant'
      AND conrelid = 'academic_exam_results'::regclass
  ) THEN
    ALTER TABLE academic_exam_results
      ADD CONSTRAINT fk_academic_exam_results_tenant
      FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_exam_schedules_tenant_date
  ON exam_schedules (tenant_id, exam_date);

CREATE INDEX IF NOT EXISTS idx_academic_exam_results_tenant_student
  ON academic_exam_results (tenant_id, student_user_id);

CREATE INDEX IF NOT EXISTS idx_academic_exam_results_student_subject
  ON academic_exam_results (student_user_id, subject_id);

CREATE INDEX IF NOT EXISTS idx_academic_exam_results_exam_session
  ON academic_exam_results (exam_session);
