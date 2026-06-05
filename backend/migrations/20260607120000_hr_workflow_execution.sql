-- Workflow execution columns on staff leave / OD / regularization requests
ALTER TABLE staff_leave_requests
  ADD COLUMN IF NOT EXISTS entity_id INT NULL REFERENCES org_entities(entity_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS workflow_id UUID NULL REFERENCES hr_approval_workflows(workflow_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_step_order INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_approver_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_staff_leave_approver
  ON staff_leave_requests(tenant_id, current_approver_user_id, status)
  WHERE current_approver_user_id IS NOT NULL;

-- Seed ON_DUTY and REGULARIZATION workflow action types if missing
INSERT INTO hr_approval_workflows (tenant_id, entity_id, action_type, workflow_name, is_active)
SELECT t.tenant_id, e.entity_id, v.action_type, v.workflow_name, true
FROM tenants t
CROSS JOIN org_entities e
CROSS JOIN (VALUES
  ('ON_DUTY', 'Default On Duty Approval'),
  ('REGULARIZATION', 'Default Regularization Approval')
) AS v(action_type, workflow_name)
WHERE e.tenant_id = t.tenant_id
  AND NOT EXISTS (
    SELECT 1 FROM hr_approval_workflows w
    WHERE w.tenant_id = t.tenant_id AND w.entity_id = e.entity_id AND w.action_type = v.action_type
  );

INSERT INTO hr_approval_workflow_steps (workflow_id, step_order, approver_type, approver_ref)
SELECT w.workflow_id, 1, 'REPORTING_MANAGER', NULL
FROM hr_approval_workflows w
WHERE w.action_type IN ('ON_DUTY', 'REGULARIZATION')
  AND NOT EXISTS (
    SELECT 1 FROM hr_approval_workflow_steps s WHERE s.workflow_id = w.workflow_id
  );
