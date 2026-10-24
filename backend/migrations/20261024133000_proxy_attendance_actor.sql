-- Preserve the timetable owner as the academic record while recording who
-- actually took attendance for an approved, date-specific substitute class.
ALTER TABLE course_attendance_logs
  ADD COLUMN IF NOT EXISTS marked_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL;

ALTER TABLE academic_proxy_requests
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS decided_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE academic_proxy_requests
  DROP CONSTRAINT IF EXISTS academic_proxy_requests_status_check;
ALTER TABLE academic_proxy_requests
  ADD CONSTRAINT academic_proxy_requests_status_check
  CHECK (status IN ('PENDING_SUBSTITUTE_ACCEPTANCE', 'PENDING_HOD_APPROVAL', 'APPROVED', 'REJECTED'));

-- Existing tenant/date indexes remain sufficient for the initial pilot.
-- Avoid building a new index on the potentially large attendance table in
-- the deployment migration. Add one concurrently in an operations window if
-- query plans show it is needed.
