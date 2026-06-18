-- Faculty course workspace upgrades: scheduled DAs, syllabus materials, and attendance compliance helpers.

ALTER TABLE academic_assignments
  ADD COLUMN IF NOT EXISTS start_date TIMESTAMP NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_academic_assignments_start_date
  ON academic_assignments(tenant_id, course_id, start_date);

UPDATE academic_assignments
SET start_date = COALESCE(start_date, created_at, NOW())
WHERE start_date IS NULL;

ALTER TABLE course_materials
  ALTER COLUMN material_type SET DEFAULT 'NOTES';

CREATE INDEX IF NOT EXISTS idx_course_materials_type
  ON course_materials(tenant_id, course_id, material_type);
