-- Faculty excuse requests for invigilation duties (Exam Cell review workflow).

CREATE TABLE IF NOT EXISTS invigilation_unavailability_requests (
  request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL REFERENCES faculty_invigilation_assignments(assignment_id) ON DELETE CASCADE,
  faculty_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  exam_cell_comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (assignment_id)
);

CREATE INDEX IF NOT EXISTS idx_invigilation_unavailability_tenant_status
  ON invigilation_unavailability_requests(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_invigilation_unavailability_faculty
  ON invigilation_unavailability_requests(tenant_id, faculty_user_id);
