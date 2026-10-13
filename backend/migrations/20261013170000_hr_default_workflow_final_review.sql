-- Add an independent HR final decision to untouched one-step default workflows.
-- Existing terminal requests are not modified; custom/multi-step workflows are preserved.
INSERT INTO hr_approval_workflow_steps (workflow_id, step_order, approver_type, approver_ref)
SELECT w.workflow_id, 2, 'HR_ADMIN', NULL
FROM hr_approval_workflows w
JOIN hr_approval_workflow_steps first_step
  ON first_step.workflow_id = w.workflow_id
 AND first_step.step_order = 1
 AND first_step.approver_type = 'REPORTING_MANAGER'
WHERE (
    (w.action_type = 'ON_DUTY' AND w.workflow_name = 'Default On Duty Approval')
    OR (w.action_type = 'REGULARIZATION' AND w.workflow_name = 'Default Regularization Approval')
    OR (w.action_type = 'LEAVE' AND w.workflow_name = 'Standard Leave Approval')
  )
  AND NOT EXISTS (
    SELECT 1 FROM hr_approval_workflow_steps additional
    WHERE additional.workflow_id = w.workflow_id AND additional.step_order <> 1
  )
ON CONFLICT (workflow_id, step_order) DO NOTHING;
