-- Preserve each workflow's existing steps and in-flight request pointer while
-- adding the independent HR decision required by leave/OD/regularization.
-- Closed requests remain unchanged. Safe to re-run after an interrupted deploy.
WITH terminal AS (
  SELECT DISTINCT ON (w.workflow_id)
         w.workflow_id, s.step_order, s.approver_type, s.approver_ref
  FROM hr_approval_workflows w
  JOIN hr_approval_workflow_steps s ON s.workflow_id = w.workflow_id
  WHERE w.action_type IN ('LEAVE', 'ON_DUTY', 'REGULARIZATION')
  ORDER BY w.workflow_id, s.step_order DESC
)
INSERT INTO hr_approval_workflow_steps
  (workflow_id, step_order, approver_type, approver_ref)
SELECT workflow_id, step_order + 1, 'HR_ADMIN', NULL
FROM terminal
WHERE approver_type NOT IN ('HR_ADMIN', 'HR_EXECUTIVE')
  AND NOT (
    approver_type = 'ROLE'
    AND approver_ref IN ('HR', 'HRAdmin', 'SuperAdmin')
  )
ON CONFLICT (workflow_id, step_order) DO NOTHING;
