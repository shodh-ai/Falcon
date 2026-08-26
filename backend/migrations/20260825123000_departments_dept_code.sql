-- Add optional department code for Admin Portal department management.
-- Soft-deleted rows keep history; uniqueness applies to active codes.

ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS dept_code VARCHAR(20);

CREATE UNIQUE INDEX IF NOT EXISTS uq_departments_dept_code_active
  ON departments (lower(dept_code))
  WHERE dept_code IS NOT NULL AND deleted_at IS NULL;
