-- Additive, no existing enrollment, timetable or attendance data is rewritten.
CREATE TABLE IF NOT EXISTS academic_event_class_cohorts (
  cohort_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(tenant_id),
  event_id uuid NOT NULL REFERENCES campus_events(event_id), timetable_id uuid NOT NULL REFERENCES academic_timetables(timetable_id),
  course_id uuid NOT NULL REFERENCES academic_courses(course_id), faculty_user_id uuid NOT NULL REFERENCES users(user_id),
  class_date date NOT NULL, coordinator_user_id uuid NOT NULL REFERENCES users(user_id),
  student_ids uuid[] NOT NULL, session_snapshot jsonb NOT NULL, reason text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),
  created_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz, decided_by uuid REFERENCES users(user_id), decision_reason text,
  revision integer NOT NULL DEFAULT 1, idempotency_key text NOT NULL,
  attendance_data jsonb, attendance_marked_at timestamptz, attendance_marked_by uuid REFERENCES users(user_id),
  UNIQUE(tenant_id,faculty_user_id,idempotency_key), CHECK(cardinality(student_ids)>0)
);
CREATE UNIQUE INDEX IF NOT EXISTS academic_event_class_cohorts_active ON academic_event_class_cohorts(tenant_id,timetable_id,class_date) WHERE status IN ('PENDING','APPROVED');
CREATE TABLE IF NOT EXISTS academic_event_class_audit (
  audit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(tenant_id),
  cohort_id uuid NOT NULL REFERENCES academic_event_class_cohorts(cohort_id), actor_user_id uuid NOT NULL REFERENCES users(user_id),
  action text NOT NULL, before_data jsonb, after_data jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE course_attendance_logs ADD COLUMN IF NOT EXISTS event_cohort_id uuid REFERENCES academic_event_class_cohorts(cohort_id);
CREATE UNIQUE INDEX IF NOT EXISTS course_attendance_logs_event_cohort ON course_attendance_logs(event_cohort_id) WHERE event_cohort_id IS NOT NULL;
