-- Leave, OD, and attendance regularization require an initial approver followed
-- by the configured HR final approver. Runtime code keeps unconfigured stages
-- blocked; this migration only adds missing defaults and never rewrites a
-- configured stage.

INSERT INTO hr_approval_workflows (
  tenant_id,
  entity_id,
  action_type,
  workflow_name,
  is_active
)
SELECT e.tenant_id, e.entity_id, required.action_type, required.workflow_name, true
FROM org_entities e
CROSS JOIN (
  VALUES
    ('LEAVE', 'Default Leave Approval'),
    ('ON_DUTY', 'Default On Duty Approval'),
    ('REGULARIZATION', 'Default Regularization Approval')
) AS required(action_type, workflow_name)
WHERE NOT EXISTS (
  SELECT 1
  FROM hr_approval_workflows existing
  WHERE existing.tenant_id = e.tenant_id
    AND existing.entity_id = e.entity_id
    AND existing.action_type = required.action_type
    AND existing.is_active = true
);

INSERT INTO hr_approval_workflow_steps (workflow_id, step_order, approver_type, approver_ref)
SELECT w.workflow_id, 1, 'REPORTING_MANAGER', NULL
FROM hr_approval_workflows w
WHERE w.is_active = true
  AND w.action_type IN ('LEAVE', 'ON_DUTY', 'REGULARIZATION')
  AND NOT EXISTS (
    SELECT 1
    FROM hr_approval_workflow_steps step
    WHERE step.workflow_id = w.workflow_id AND step.step_order = 1
  )
ON CONFLICT (workflow_id, step_order) DO NOTHING;

INSERT INTO hr_approval_workflow_steps (workflow_id, step_order, approver_type, approver_ref)
SELECT w.workflow_id, 2, 'HR_EXECUTIVE', NULL
FROM hr_approval_workflows w
WHERE w.is_active = true
  AND w.action_type IN ('LEAVE', 'ON_DUTY', 'REGULARIZATION')
  AND NOT EXISTS (
    SELECT 1
    FROM hr_approval_workflow_steps step
    WHERE step.workflow_id = w.workflow_id AND step.step_order = 2
  )
ON CONFLICT (workflow_id, step_order) DO NOTHING;
