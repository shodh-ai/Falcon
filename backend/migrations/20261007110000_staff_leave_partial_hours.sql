-- Allow a staff leave/on-duty request to cover a same-day time window.
-- Existing full-day requests remain represented by NULL times.
ALTER TABLE staff_leave_requests
  ADD COLUMN IF NOT EXISTS start_time TIME NULL,
  ADD COLUMN IF NOT EXISTS end_time TIME NULL;

ALTER TABLE staff_leave_requests
  DROP CONSTRAINT IF EXISTS staff_leave_requests_partial_time_order_ck;

ALTER TABLE staff_leave_requests
  ADD CONSTRAINT staff_leave_requests_partial_time_order_ck
  CHECK (
    (start_time IS NULL AND end_time IS NULL)
    OR (start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < end_time)
  );

-- Keep direct/legacy attendance inserts safe as well; explicit PRESENT is
-- still required when a faculty member marks a student present.
ALTER TABLE academic_attendance_records
  ALTER COLUMN status SET DEFAULT 'ABSENT';
