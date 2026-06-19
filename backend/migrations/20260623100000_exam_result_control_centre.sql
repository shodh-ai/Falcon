-- Result Control Centre: session windows, locks, declaration, per-student exam reports.

CREATE TABLE IF NOT EXISTS exam_result_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES academic_courses(course_id) ON DELETE CASCADE,
  exam_type VARCHAR(30) NOT NULL,
  semester INT NOT NULL DEFAULT 4,
  max_marks NUMERIC(6,2) NOT NULL DEFAULT 100,
  entry_status VARCHAR(20) NOT NULL DEFAULT 'CLOSED'
    CHECK (entry_status IN ('CLOSED', 'OPEN', 'LOCKED')),
  entry_open_at TIMESTAMPTZ,
  entry_close_at TIMESTAMPTZ,
  marks_locked BOOLEAN NOT NULL DEFAULT FALSE,
  marks_locked_at TIMESTAMPTZ,
  marks_locked_by UUID REFERENCES users(user_id),
  reopen_reason TEXT,
  pass_marks NUMERIC(6,2),
  grading_policy_id INT REFERENCES academic_grading_policies(policy_id),
  processed_at TIMESTAMPTZ,
  processed_by UUID REFERENCES users(user_id),
  declared_at TIMESTAMPTZ,
  declared_by UUID REFERENCES users(user_id),
  declaration_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, course_id, exam_type, semester)
);

CREATE INDEX IF NOT EXISTS idx_exam_result_sessions_tenant_status
  ON exam_result_sessions(tenant_id, entry_status);

CREATE TABLE IF NOT EXISTS student_exam_reports (
  report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES exam_result_sessions(session_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES academic_courses(course_id) ON DELETE CASCADE,
  exam_type VARCHAR(30) NOT NULL,
  marks_obtained NUMERIC(6,2) NOT NULL,
  max_marks NUMERIC(6,2) NOT NULL,
  percent NUMERIC(5,2),
  grade VARCHAR(5),
  grade_points NUMERIC(4,2),
  result_status VARCHAR(20) NOT NULL DEFAULT 'PASS'
    CHECK (result_status IN ('PASS', 'FAIL', 'WITHHELD', 'ABSENT')),
  report_summary TEXT,
  declared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, student_user_id)
);

CREATE INDEX IF NOT EXISTS idx_student_exam_reports_student
  ON student_exam_reports(tenant_id, student_user_id, declared_at DESC);
