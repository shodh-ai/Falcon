-- Student Demerit Point System: DC review workflow and academic summary ledger.

INSERT INTO roles (role_name, description)
VALUES ('DC_MEMBER', 'Disciplinary Committee member — review and approve demerit incidents')
ON CONFLICT (role_name) DO NOTHING;

CREATE TABLE IF NOT EXISTS demerit_incidents (
  incident_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES academic_courses(course_id) ON DELETE CASCADE,
  faculty_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  category VARCHAR(40) NOT NULL
    CHECK (category IN ('PLAGIARISM', 'BEHAVIORAL', 'ATTENDANCE', 'EXAM_MALPRACTICE')),
  points INT NOT NULL CHECK (points > 0 AND points <= 6),
  description TEXT NOT NULL,
  evidence_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING_DC_REVIEW'
    CHECK (status IN ('PENDING_DC_REVIEW', 'APPROVED_BY_DC', 'REJECTED_BY_DC')),
  dc_reviewer_id UUID REFERENCES users(user_id),
  dc_committee_remarks TEXT,
  subject_back_applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demerit_incidents_pending
  ON demerit_incidents(tenant_id, status, created_at DESC)
  WHERE status = 'PENDING_DC_REVIEW';

CREATE INDEX IF NOT EXISTS idx_demerit_incidents_student
  ON demerit_incidents(tenant_id, student_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_demerit_incidents_faculty
  ON demerit_incidents(tenant_id, faculty_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS student_academic_summaries (
  summary_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  cumulative_demerit_points INT NOT NULL DEFAULT 0 CHECK (cumulative_demerit_points >= 0),
  is_subject_back_triggered BOOLEAN NOT NULL DEFAULT FALSE,
  subject_back_course_id UUID REFERENCES academic_courses(course_id),
  subject_back_triggered_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, student_user_id)
);

CREATE INDEX IF NOT EXISTS idx_student_academic_summaries_tenant
  ON student_academic_summaries(tenant_id, cumulative_demerit_points DESC);
