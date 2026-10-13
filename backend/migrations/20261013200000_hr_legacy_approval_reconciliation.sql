-- Reconcile pre-decision-history HOD approvals by requiring a fresh manager
-- decision. The original request is retained; no historical approval is forged.
CREATE TABLE IF NOT EXISTS hr_staff_request_reconciliations (
  reconciliation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  entity_id int NOT NULL REFERENCES org_entities(entity_id) ON DELETE RESTRICT,
  leave_id uuid NOT NULL REFERENCES staff_leave_requests(leave_id) ON DELETE RESTRICT,
  reconciled_by_user_id uuid NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  previous_status varchar(50) NOT NULL,
  previous_step_order int NOT NULL,
  previous_approver_user_id uuid NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  rerouted_step_order int NOT NULL,
  rerouted_approver_user_id uuid NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (length(btrim(reason)) >= 10),
  evidence_reference text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (leave_id)
);

CREATE INDEX IF NOT EXISTS idx_hr_staff_request_reconciliations_scope
  ON hr_staff_request_reconciliations (tenant_id, entity_id, created_at DESC);

CREATE OR REPLACE FUNCTION hr_staff_reconciliation_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'HR reconciliation audit records are append-only';
END;
$$;

DROP TRIGGER IF EXISTS tr_hr_staff_reconciliation_immutable
  ON hr_staff_request_reconciliations;
CREATE TRIGGER tr_hr_staff_reconciliation_immutable
BEFORE UPDATE OR DELETE ON hr_staff_request_reconciliations
FOR EACH ROW EXECUTE FUNCTION hr_staff_reconciliation_immutable();
