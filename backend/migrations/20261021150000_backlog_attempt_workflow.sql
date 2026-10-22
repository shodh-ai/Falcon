-- Additive retake records. Original academic marks, result sessions and reports
-- retain their identities and values; no academic or fee policy is seeded.
CREATE TABLE exam_backlog_offerings (
  offering_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  course_id UUID NOT NULL REFERENCES academic_courses(course_id),
  semester INT NOT NULL CHECK (semester > 0),
  source_exam_type VARCHAR(30) NOT NULL CHECK (source_exam_type IN ('END_TERM', 'INTERNAL')),
  exam_session_id UUID NOT NULL REFERENCES exam_sessions(session_id),
  exam_schedule_id UUID NOT NULL REFERENCES exam_schedules(exam_schedule_id),
  faculty_user_id UUID NOT NULL REFERENCES users(user_id),
  academic_year VARCHAR(12) NOT NULL,
  opens_at TIMESTAMPTZ NOT NULL,
  closes_at TIMESTAMPTZ NOT NULL CHECK (closes_at > opens_at),
  payment_due_date DATE NOT NULL,
  fee_mode VARCHAR(12) NOT NULL CHECK (fee_mode IN ('REQUIRED', 'NO_FEE')),
  fee_amount NUMERIC(12,2) NOT NULL CHECK (fee_amount >= 0),
  attempt_limit INT NOT NULL CHECK (attempt_limit > 0),
  selection_policy VARCHAR(20) NOT NULL CHECK (selection_policy IN ('LATEST_ATTEMPT', 'BEST_ATTEMPT')),
  grading_policy_id INT NOT NULL REFERENCES academic_grading_policies(policy_id),
  grading_rules JSONB NOT NULL,
  max_marks NUMERIC(6,2) NOT NULL CHECK (max_marks > 0),
  pass_marks NUMERIC(6,2) NOT NULL CHECK (pass_marks >= 0 AND pass_marks <= max_marks),
  status VARCHAR(10) NOT NULL CHECK (status IN ('DRAFT', 'OPEN', 'CLOSED')),
  created_by UUID NOT NULL REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((fee_mode = 'NO_FEE' AND fee_amount = 0) OR (fee_mode = 'REQUIRED' AND fee_amount >= 1)),
  UNIQUE (tenant_id, offering_id)
);
CREATE FUNCTION preserve_exam_backlog_policy() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status') THEN
    RAISE EXCEPTION 'Configured backlog academic and fee rules are immutable; create a new offering';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'backlog-policy:' || NEW.tenant_id::text || ':' || NEW.course_id::text || ':' || NEW.semester::text || ':' || NEW.source_exam_type, 0));
  IF EXISTS (SELECT 1 FROM exam_backlog_offerings o WHERE o.tenant_id=NEW.tenant_id
    AND o.course_id=NEW.course_id AND o.semester=NEW.semester AND o.source_exam_type=NEW.source_exam_type
    AND o.offering_id<>NEW.offering_id AND o.selection_policy<>NEW.selection_policy) THEN
    RAISE EXCEPTION 'Backlog attempt family selection policies cannot be mixed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tr_exam_backlog_preserve_policy BEFORE INSERT OR UPDATE ON exam_backlog_offerings
  FOR EACH ROW EXECUTE FUNCTION preserve_exam_backlog_policy();
CREATE TABLE exam_backlog_attempts (
  attempt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  offering_id UUID NOT NULL,
  application_id UUID NOT NULL UNIQUE REFERENCES exam_applications(exam_application_id),
  student_user_id UUID NOT NULL REFERENCES users(user_id),
  course_id UUID NOT NULL REFERENCES academic_courses(course_id),
  semester INT NOT NULL CHECK (semester > 0),
  source_exam_type VARCHAR(30) NOT NULL CHECK (source_exam_type IN ('END_TERM', 'INTERNAL')),
  source_result_id UUID NOT NULL REFERENCES academic_exam_results(result_id),
  source_report_id UUID NOT NULL REFERENCES student_exam_reports(report_id),
  source_session_id UUID NOT NULL REFERENCES exam_result_sessions(session_id),
  original_snapshot JSONB NOT NULL,
  attempt_number INT NOT NULL CHECK (attempt_number > 0),
  status VARCHAR(20) NOT NULL CHECK (status IN ('PAYMENT_PENDING', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED')),
  reviewed_by UUID REFERENCES users(user_id),
  reviewed_at TIMESTAMPTZ,
  review_reason TEXT,
  marks_obtained NUMERIC(6,2),
  marks_status VARCHAR(20) NOT NULL CHECK (marks_status IN ('DRAFT', 'SUBMITTED', 'COE_APPROVED', 'DEAN_APPROVED', 'PUBLISHED')),
  marks_entered_by UUID REFERENCES users(user_id),
  coe_approved_by UUID REFERENCES users(user_id),
  dean_approved_by UUID REFERENCES users(user_id),
  grade VARCHAR(10),
  grade_points NUMERIC(5,2),
  percent NUMERIC(5,2),
  result_status VARCHAR(10) CHECK (result_status IN ('PASS', 'FAIL')),
  published_by UUID REFERENCES users(user_id),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, offering_id) REFERENCES exam_backlog_offerings(tenant_id, offering_id)
);
CREATE UNIQUE INDEX uq_exam_backlog_active_course ON exam_backlog_attempts
  (tenant_id, student_user_id, course_id, semester, source_exam_type)
  WHERE status NOT IN ('REJECTED', 'PUBLISHED');
CREATE UNIQUE INDEX uq_exam_backlog_offering_student ON exam_backlog_attempts
  (tenant_id, offering_id, student_user_id) WHERE status <> 'REJECTED';
CREATE INDEX idx_exam_backlog_attempt_student ON exam_backlog_attempts (tenant_id, student_user_id, created_at DESC);
CREATE FUNCTION preserve_exam_backlog_source() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.tenant_id, NEW.offering_id, NEW.application_id, NEW.student_user_id, NEW.course_id,
         NEW.semester, NEW.source_exam_type, NEW.source_result_id, NEW.source_report_id,
         NEW.source_session_id, NEW.original_snapshot, NEW.attempt_number)
     IS DISTINCT FROM
     ROW(OLD.tenant_id, OLD.offering_id, OLD.application_id, OLD.student_user_id, OLD.course_id,
         OLD.semester, OLD.source_exam_type, OLD.source_result_id, OLD.source_report_id,
         OLD.source_session_id, OLD.original_snapshot, OLD.attempt_number) THEN
    RAISE EXCEPTION 'Backlog attempt source and identity are immutable';
  END IF;
  IF OLD.status = 'PUBLISHED' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Published backlog attempts are immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tr_exam_backlog_preserve_source BEFORE UPDATE ON exam_backlog_attempts
  FOR EACH ROW EXECUTE FUNCTION preserve_exam_backlog_source();

CREATE VIEW exam_backlog_current_results AS
WITH published AS (
  SELECT a.*, o.selection_policy, o.max_marks, o.offering_id AS retake_session_id
  FROM exam_backlog_attempts a JOIN exam_backlog_offerings o
    ON o.tenant_id = a.tenant_id AND o.offering_id = a.offering_id
  WHERE a.status = 'PUBLISHED' AND a.marks_status = 'PUBLISHED'
), candidates AS (
  SELECT tenant_id, student_user_id, course_id, semester, source_exam_type,
    source_result_id, source_report_id, source_session_id,
    attempt_id AS selected_attempt_id, retake_session_id, marks_obtained, max_marks,
    percent, grade, grade_points, result_status, published_at AS declared_at,
    selection_policy, attempt_number
  FROM published
  UNION ALL
  (SELECT DISTINCT ON (tenant_id, source_report_id)
    tenant_id, student_user_id, course_id, semester, source_exam_type,
    source_result_id, source_report_id, source_session_id,
    NULL::uuid, NULL::uuid,
    (original_snapshot->>'marks_obtained')::numeric,
    (original_snapshot->>'max_marks')::numeric,
    (original_snapshot->>'percent')::numeric,
    original_snapshot->>'grade', (original_snapshot->>'grade_points')::numeric,
    original_snapshot->>'result_status', (original_snapshot->>'declared_at')::timestamptz,
    selection_policy, 0
  FROM published ORDER BY tenant_id, source_report_id, attempt_number)
), ranked AS (
  SELECT c.*, ROW_NUMBER() OVER (
    PARTITION BY tenant_id, student_user_id, course_id, semester, source_exam_type
    ORDER BY CASE WHEN selection_policy = 'BEST_ATTEMPT' THEN percent END DESC NULLS LAST,
             attempt_number DESC, declared_at DESC
  ) AS position FROM candidates c
)
SELECT tenant_id, student_user_id, course_id, semester, source_exam_type,
  source_result_id, source_report_id, source_session_id, selected_attempt_id,
  retake_session_id, marks_obtained, max_marks, percent, grade, grade_points,
  result_status, declared_at, selection_policy
FROM ranked WHERE position = 1;
