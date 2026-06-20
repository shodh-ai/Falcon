-- Attendance policy relaxation + individual exemption workflow.
-- Lets HODs request a lower department attendance bar (75 -> 70 / 65) with Dean sign-off,
-- and lets students with genuine reasons (medical, accident, internship) get an individual
-- exemption (HOD recommends, Dean / Exam Cell approves) so admit cards unlock despite low %.

-- 1) Department-level threshold relaxation requests (HOD -> Dean).
CREATE TABLE IF NOT EXISTS attendance_threshold_requests (
  request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  dept_id INT REFERENCES departments(dept_id) ON DELETE CASCADE,
  requested_min_percent INT NOT NULL CHECK (requested_min_percent BETWEEN 1 AND 100),
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING_DEAN'
    CHECK (status IN ('PENDING_DEAN', 'APPROVED', 'REJECTED')),
  requested_by UUID NOT NULL REFERENCES users(user_id),
  decided_by UUID REFERENCES users(user_id),
  decision_remarks TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_threshold_requests_dept
  ON attendance_threshold_requests(tenant_id, dept_id, status, decided_at DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_threshold_requests_pending
  ON attendance_threshold_requests(tenant_id, status, created_at DESC)
  WHERE status = 'PENDING_DEAN';

-- 2) Individual student attendance exemptions (Student -> HOD -> Dean / Exam Cell).
CREATE TABLE IF NOT EXISTS student_attendance_exemptions (
  exemption_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  reason_category VARCHAR(20) NOT NULL
    CHECK (reason_category IN ('MEDICAL', 'ACCIDENT', 'INTERNSHIP', 'BEREAVEMENT', 'OTHER')),
  description TEXT NOT NULL,
  supporting_doc_url TEXT,
  attendance_percent_at_request NUMERIC(5,2) NOT NULL DEFAULT 0,
  semester INT,
  status VARCHAR(24) NOT NULL DEFAULT 'PENDING_HOD'
    CHECK (status IN ('PENDING_HOD', 'RECOMMENDED', 'APPROVED', 'REJECTED')),
  hod_user_id UUID REFERENCES users(user_id),
  hod_remarks TEXT,
  hod_decided_at TIMESTAMPTZ,
  final_approver_id UUID REFERENCES users(user_id),
  final_remarks TEXT,
  final_decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_attendance_exemptions_student
  ON student_attendance_exemptions(tenant_id, student_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_student_attendance_exemptions_status
  ON student_attendance_exemptions(tenant_id, status, created_at DESC);

-- 3) Audit trail for every admit-card eligibility decision (especially very-low-% exemptions).
CREATE TABLE IF NOT EXISTS attendance_eligibility_audit (
  audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  attendance_percent NUMERIC(5,2) NOT NULL,
  effective_threshold INT NOT NULL,
  threshold_source VARCHAR(16) NOT NULL DEFAULT 'DEFAULT'
    CHECK (threshold_source IN ('DEFAULT', 'POLICY', 'EXEMPTION')),
  exemption_id UUID REFERENCES student_attendance_exemptions(exemption_id) ON DELETE SET NULL,
  eligible BOOLEAN NOT NULL,
  reason TEXT,
  context VARCHAR(32) NOT NULL DEFAULT 'ADMIT_CARD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_eligibility_audit_student
  ON attendance_eligibility_audit(tenant_id, student_user_id, created_at DESC);
