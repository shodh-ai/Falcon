-- Verification records contain only token hashes; printed tokens are capabilities
-- resolved exclusively by authenticated Examination Cell actions.
CREATE TABLE IF NOT EXISTS exam_hall_ticket_issues (
  issue_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  student_user_id UUID NOT NULL REFERENCES users(user_id),
  schedule_ids UUID[] NOT NULL CHECK (cardinality(schedule_ids) > 0),
  token_hash CHAR(64) NOT NULL UNIQUE,
  revision_hash CHAR(64) NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  issued_by UUID NOT NULL REFERENCES users(user_id),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES users(user_id),
  revocation_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_exam_hall_ticket_issues_student
  ON exam_hall_ticket_issues(tenant_id, student_user_id, issued_at DESC);
