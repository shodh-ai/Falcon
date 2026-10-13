-- Durable maker/checker evidence for staff leave, OD and regularization steps.
-- Historical requests are not rewritten; new decisions are inserted atomically
-- with the request transition.
CREATE TABLE IF NOT EXISTS hr_staff_request_decisions (
  decision_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  leave_id uuid NOT NULL REFERENCES staff_leave_requests(leave_id) ON DELETE RESTRICT,
  step_order integer NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  action varchar(10) NOT NULL CHECK (action IN ('APPROVE', 'REJECT')),
  was_override boolean NOT NULL DEFAULT false,
  decided_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (leave_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_hr_staff_request_decisions_actor
  ON hr_staff_request_decisions (tenant_id, leave_id, actor_user_id, action);
