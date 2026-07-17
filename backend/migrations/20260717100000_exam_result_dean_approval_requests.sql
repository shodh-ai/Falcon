-- Dean result declaration approval workflow (replaces simulated COE-only dean approval).

CREATE TABLE IF NOT EXISTS exam_result_dean_approval_requests (
  request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES exam_result_sessions(session_id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  requested_by UUID NOT NULL REFERENCES users(user_id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_summary JSONB,
  decided_by UUID REFERENCES users(user_id),
  decided_at TIMESTAMPTZ,
  decision_comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_result_dean_approval_tenant_status
  ON exam_result_dean_approval_requests(tenant_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_result_dean_approval_pending_session
  ON exam_result_dean_approval_requests(session_id)
  WHERE status = 'PENDING';

CREATE TABLE IF NOT EXISTS exam_result_dean_approval_history (
  history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES exam_result_dean_approval_requests(request_id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES exam_result_sessions(session_id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(user_id),
  actor_role VARCHAR(50),
  action VARCHAR(40) NOT NULL,
  status VARCHAR(20),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_result_dean_approval_history_session
  ON exam_result_dean_approval_history(session_id, created_at DESC);
