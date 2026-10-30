-- Expand only: existing departments keep their current leadership behaviour.
ALTER TABLE department_leadership
  DROP CONSTRAINT IF EXISTS department_leadership_structure_check;
ALTER TABLE department_leadership
  ADD CONSTRAINT department_leadership_structure_check
  CHECK (structure IN ('NONE','HOD_ONLY','PRINCIPAL_ONLY','PRINCIPAL_HOD'));
ALTER TABLE department_leadership
  ADD COLUMN IF NOT EXISTS dean_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dean_user_id uuid REFERENCES users(user_id);

-- A configured request carries its own approval chain. Existing requests remain
-- on their recorded workflow until a deliberate leadership change reroutes them.
CREATE TABLE IF NOT EXISTS hr_department_request_routes (
  leave_id uuid PRIMARY KEY REFERENCES staff_leave_requests(leave_id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  dept_id integer NOT NULL REFERENCES departments(dept_id),
  approver_ids uuid[] NOT NULL,
  current_index integer NOT NULL DEFAULT 0,
  leadership_revision integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cardinality(approver_ids) > 0),
  CHECK (current_index >= 0)
);
CREATE INDEX IF NOT EXISTS idx_hr_department_routes_scope
  ON hr_department_request_routes(tenant_id,dept_id);

ALTER TABLE hr_staff_request_decisions
  ADD COLUMN IF NOT EXISTS idempotency_key varchar(128),
  ADD COLUMN IF NOT EXISTS reason text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_decision_idempotency
  ON hr_staff_request_decisions(tenant_id,idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS department_leadership_changes (
  change_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  dept_id integer NOT NULL REFERENCES departments(dept_id),
  idempotency_key varchar(128) NOT NULL,
  request_hash varchar(64) NOT NULL,
  applied_revision integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,idempotency_key)
);

CREATE TABLE IF NOT EXISTS hr_staff_request_appeals (
  appeal_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  leave_id uuid NOT NULL REFERENCES staff_leave_requests(leave_id) ON DELETE RESTRICT,
  requester_user_id uuid NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  rejecting_user_id uuid NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  rejecting_level varchar(16),
  reviewer_user_id uuid NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  idempotency_key varchar(128) NOT NULL,
  reason text NOT NULL,
  status varchar(32) NOT NULL CHECK (status IN ('PENDING_REVIEW','PENDING_RECONSIDERATION','PENDING_FINAL','REJECTED','APPROVED')),
  reconsideration_count integer NOT NULL DEFAULT 0 CHECK (reconsideration_count BETWEEN 0 AND 1),
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_staff_request_one_appeal
  ON hr_staff_request_appeals(tenant_id,leave_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_staff_request_appeal_key
  ON hr_staff_request_appeals(tenant_id,idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_staff_request_active_appeal
  ON hr_staff_request_appeals(leave_id)
  WHERE status IN ('PENDING_REVIEW','PENDING_RECONSIDERATION','PENDING_FINAL');
CREATE TABLE IF NOT EXISTS hr_staff_request_appeal_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appeal_id uuid NOT NULL REFERENCES hr_staff_request_appeals(appeal_id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  action varchar(32) NOT NULL,
  idempotency_key varchar(128) NOT NULL,
  reason text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_staff_request_appeal_event_key
  ON hr_staff_request_appeal_events(appeal_id,idempotency_key);

-- Runtime grants are applied by the reviewed scoped grant operation after
-- the schema-and-ledger transaction. The migration owner never broadens the
-- API role implicitly, and the old application keeps running during rollout.
