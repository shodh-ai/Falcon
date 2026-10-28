-- Keep attendance for an approved extra class attached to that exact dated
-- request, independently of recurring timetable attendance on the same day.
ALTER TABLE course_attendance_logs
  ADD COLUMN IF NOT EXISTS class_adjustment_id UUID
    REFERENCES class_adjustments(adjustment_id) ON DELETE RESTRICT;

ALTER TABLE course_attendance_logs
  DROP CONSTRAINT IF EXISTS course_attendance_logs_one_session_reference;
ALTER TABLE course_attendance_logs
  ADD CONSTRAINT course_attendance_logs_one_session_reference
  CHECK (timetable_id IS NULL OR class_adjustment_id IS NULL);

DROP INDEX IF EXISTS idx_course_attendance_logs_session_unique;
CREATE UNIQUE INDEX idx_course_attendance_logs_session_unique
  ON course_attendance_logs (
    tenant_id, course_id, faculty_user_id, date,
    COALESCE(timetable_id, class_adjustment_id,
      '00000000-0000-0000-0000-000000000000'::uuid)
  );
