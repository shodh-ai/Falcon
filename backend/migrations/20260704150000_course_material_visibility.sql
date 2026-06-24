-- Cross-section publish: one material file, many allocation visibility rows.

CREATE TABLE IF NOT EXISTS course_material_visibility (
  visibility_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES course_materials(material_id) ON DELETE CASCADE,
  allocation_id UUID NOT NULL REFERENCES academic_course_allocations(allocation_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(material_id, allocation_id)
);

CREATE INDEX IF NOT EXISTS idx_course_material_visibility_material
  ON course_material_visibility(material_id);

CREATE INDEX IF NOT EXISTS idx_course_material_visibility_allocation
  ON course_material_visibility(allocation_id);

-- Optional section label on enrollment (e.g. A, B) for section-scoped visibility.
ALTER TABLE student_course_enrollments
  ADD COLUMN IF NOT EXISTS section_code VARCHAR(10);
