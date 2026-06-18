-- Re-evaluation workflow: faculty assignment, reassessment report, publish to student/parent.

ALTER TABLE exam_applications ADD COLUMN IF NOT EXISTS assigned_faculty_user_id UUID REFERENCES users(user_id);
ALTER TABLE exam_applications ADD COLUMN IF NOT EXISTS original_marks NUMERIC(6,2);
ALTER TABLE exam_applications ADD COLUMN IF NOT EXISTS revised_marks NUMERIC(6,2);
ALTER TABLE exam_applications ADD COLUMN IF NOT EXISTS report_notes TEXT;
ALTER TABLE exam_applications ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
ALTER TABLE exam_applications ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES users(user_id);
ALTER TABLE exam_applications ADD COLUMN IF NOT EXISTS report_submitted_at TIMESTAMPTZ;
ALTER TABLE exam_applications ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE exam_applications ADD COLUMN IF NOT EXISTS published_by UUID REFERENCES users(user_id);

ALTER TABLE exam_applications DROP CONSTRAINT IF EXISTS chk_exam_applications_status;
ALTER TABLE exam_applications ADD CONSTRAINT chk_exam_applications_status
  CHECK (status IN ('DRAFT', 'PENDING', 'ASSIGNED', 'UNDER_REVIEW', 'COMPLETED', 'APPROVED', 'REJECTED'));

CREATE INDEX IF NOT EXISTS idx_exam_applications_assigned_faculty
  ON exam_applications(assigned_faculty_user_id)
  WHERE assigned_faculty_user_id IS NOT NULL;
