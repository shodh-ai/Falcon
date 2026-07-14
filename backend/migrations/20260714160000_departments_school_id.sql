-- Direct department-to-school mapping for Super Admin hierarchy management.

ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS school_id INT NULL REFERENCES schools(school_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_departments_school ON departments(school_id);

-- Backfill from program links where department has no direct school yet.
UPDATE departments d
SET school_id = sub.school_id
FROM (
  SELECT DISTINCT ON (p.dept_id) p.dept_id, p.school_id
  FROM iam_programs p
  WHERE p.deleted_at IS NULL
    AND p.dept_id IS NOT NULL
    AND p.school_id IS NOT NULL
  ORDER BY p.dept_id, p.program_id ASC
) sub
WHERE d.dept_id = sub.dept_id
  AND d.school_id IS NULL
  AND d.deleted_at IS NULL;
