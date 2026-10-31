-- Session-scoped HOD approval for attendance that passed the normal marking window.
CREATE TABLE IF NOT EXISTS academic_attendance_unlock_requests (
  request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  faculty_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES academic_courses(course_id) ON DELETE CASCADE,
  timetable_id UUID NULL REFERENCES academic_timetables(timetable_id) ON DELETE RESTRICT,
  class_adjustment_id UUID NULL REFERENCES class_adjustments(adjustment_id) ON DELETE RESTRICT,
  class_date DATE NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'APPLIED')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ NULL,
  decided_by_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  decision_remarks TEXT NULL,
  unlocked_until TIMESTAMPTZ NULL,
  applied_at TIMESTAMPTZ NULL,
  CHECK ((timetable_id IS NOT NULL) <> (class_adjustment_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_unlock_pending_session
  ON academic_attendance_unlock_requests (
    tenant_id, faculty_user_id, course_id, class_date,
    COALESCE(timetable_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(class_adjustment_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_attendance_unlock_hod_queue
  ON academic_attendance_unlock_requests (tenant_id, status, requested_at);

CREATE INDEX IF NOT EXISTS idx_attendance_unlock_active
  ON academic_attendance_unlock_requests (tenant_id, faculty_user_id, class_date, unlocked_until)
  WHERE status = 'APPROVED';

CREATE TABLE IF NOT EXISTS academic_attendance_workflow_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  request_id UUID NULL REFERENCES academic_attendance_unlock_requests(request_id) ON DELETE SET NULL,
  faculty_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES academic_courses(course_id) ON DELETE CASCADE,
  timetable_id UUID NULL REFERENCES academic_timetables(timetable_id) ON DELETE SET NULL,
  class_adjustment_id UUID NULL REFERENCES class_adjustments(adjustment_id) ON DELETE SET NULL,
  class_date DATE NOT NULL,
  event_type VARCHAR(40) NOT NULL,
  actor_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  details JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_session_event
  ON academic_attendance_workflow_events (
    tenant_id, faculty_user_id, course_id, class_date,
    COALESCE(timetable_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(class_adjustment_id, '00000000-0000-0000-0000-000000000000'::uuid),
    event_type
  ) WHERE event_type IN ('REMINDER_15', 'REMINDER_5', 'LOCKED_MISSING');

CREATE INDEX IF NOT EXISTS idx_attendance_workflow_request_events
  ON academic_attendance_workflow_events (tenant_id, request_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_request_lifecycle_event
  ON academic_attendance_workflow_events (request_id, event_type)
  WHERE request_id IS NOT NULL AND event_type IN ('RELOCKED');
