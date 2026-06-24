-- Course Allocation Matrix: teaching load catalog extensions + allocation table

ALTER TABLE academic_subjects ADD COLUMN IF NOT EXISTS subject_shortname VARCHAR(50);
ALTER TABLE academic_subjects ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS academic_course_allocations (
  allocation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  subject_id INT NOT NULL REFERENCES academic_subjects(subject_id),
  program_name VARCHAR(100),
  semester VARCHAR(20),
  faculty_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  academic_year VARCHAR(20) NOT NULL,
  course_id UUID REFERENCES academic_courses(course_id) ON DELETE SET NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_allocations_tenant_year
  ON academic_course_allocations(tenant_id, academic_year);
CREATE INDEX IF NOT EXISTS idx_course_allocations_unassigned
  ON academic_course_allocations(tenant_id, faculty_user_id)
  WHERE faculty_user_id IS NULL AND status = 'ACTIVE';
CREATE UNIQUE INDEX IF NOT EXISTS uq_course_allocations_slot
  ON academic_course_allocations(tenant_id, subject_id, program_name, semester, academic_year);
