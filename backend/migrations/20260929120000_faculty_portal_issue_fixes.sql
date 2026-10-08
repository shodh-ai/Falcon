-- Reliability guardrails for Faculty Portal workflows.
-- Safe on both freshly migrated and long-running databases.

ALTER TABLE course_attendance_logs
  ADD COLUMN IF NOT EXISTS timetable_id UUID
    REFERENCES academic_timetables(timetable_id) ON DELETE SET NULL;

ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS profile_unlocked_until TIMESTAMPTZ NULL;

ALTER TABLE exam_applications
  ADD COLUMN IF NOT EXISTS assigned_faculty_user_id UUID REFERENCES users(user_id),
  ADD COLUMN IF NOT EXISTS original_marks NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS revised_marks NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS report_notes TEXT,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES users(user_id),
  ADD COLUMN IF NOT EXISTS report_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_by UUID REFERENCES users(user_id);

ALTER TABLE exam_applications DROP CONSTRAINT IF EXISTS chk_exam_applications_status;
ALTER TABLE exam_applications ADD CONSTRAINT chk_exam_applications_status
  CHECK (status IN ('DRAFT', 'PENDING', 'ASSIGNED', 'UNDER_REVIEW', 'COMPLETED', 'APPROVED', 'REJECTED'));
