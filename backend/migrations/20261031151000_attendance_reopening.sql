CREATE TABLE IF NOT EXISTS academic_attendance_reopen_requests (
  request_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id),
  faculty_user_id uuid NOT NULL REFERENCES users(user_id),
  course_id uuid NOT NULL REFERENCES academic_courses(course_id),
  session_key text NOT NULL,
  class_date date NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid REFERENCES users(user_id),
  decision_reason text,
  expires_at timestamptz,
  revision integer NOT NULL DEFAULT 1,
  idempotency_key varchar(128) NOT NULL,
  UNIQUE(tenant_id,faculty_user_id,idempotency_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS academic_reopen_one_pending ON academic_attendance_reopen_requests
  (tenant_id,faculty_user_id,course_id,session_key,class_date) WHERE status='PENDING';
CREATE TABLE IF NOT EXISTS academic_attendance_correction_audit (
  audit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES academic_attendance_reopen_requests(request_id),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id),
  actor_user_id uuid NOT NULL REFERENCES users(user_id),
  before_data jsonb NOT NULL,
  after_data jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
