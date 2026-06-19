-- Align academic_exam_results with Result Control Centre declare path.

ALTER TABLE academic_exam_results ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(tenant_id);
ALTER TABLE academic_exam_results ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES academic_courses(course_id);
ALTER TABLE academic_exam_results ADD COLUMN IF NOT EXISTS exam_type VARCHAR(30);
ALTER TABLE academic_exam_results ADD COLUMN IF NOT EXISTS grade VARCHAR(5);
ALTER TABLE academic_exam_results ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'PUBLISHED';
ALTER TABLE academic_exam_results ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'academic_exam_results' AND column_name = 'subject_id'
  ) THEN
    ALTER TABLE academic_exam_results ALTER COLUMN subject_id DROP NOT NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'academic_exam_results' AND column_name = 'exam_session'
  ) THEN
    ALTER TABLE academic_exam_results ALTER COLUMN exam_session DROP NOT NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_academic_exam_results_course_exam
  ON academic_exam_results (tenant_id, student_user_id, course_id, exam_type)
  WHERE tenant_id IS NOT NULL AND course_id IS NOT NULL AND exam_type IS NOT NULL;
