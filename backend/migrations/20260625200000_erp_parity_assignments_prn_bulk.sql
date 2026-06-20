-- Digital assignment return loop, PRN vs semester roll, exam coordinator flag

ALTER TABLE assignment_submissions
  ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'SUBMITTED';

ALTER TABLE assignment_submissions
  ADD COLUMN IF NOT EXISTS revision_due_at TIMESTAMPTZ NULL;

UPDATE assignment_submissions
SET status = 'GRADED'
WHERE marks_awarded IS NOT NULL AND status = 'SUBMITTED';

ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS prn_number VARCHAR(50) NULL;

UPDATE student_profiles sp
SET prn_number = COALESCE(
  NULLIF(BTRIM(sp.enrollment_no), ''),
  NULLIF(BTRIM(sp.enrollment_number), ''),
  NULLIF(BTRIM(sp.admission_number), '')
)
WHERE prn_number IS NULL;

ALTER TABLE student_course_enrollments
  ADD COLUMN IF NOT EXISTS roll_number VARCHAR(50) NULL;

ALTER TABLE exam_invigilation_duties
  ADD COLUMN IF NOT EXISTS is_coordinator BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_student_profiles_prn
  ON student_profiles(tenant_id, prn_number)
  WHERE prn_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sce_roll_number
  ON student_course_enrollments(tenant_id, semester, roll_number)
  WHERE roll_number IS NOT NULL;
