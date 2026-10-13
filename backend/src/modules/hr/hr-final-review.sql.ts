/** An HR queue item must be at the last configured HR step, not merely assigned to an HR user. */
export function finalHrReviewSql(requestAlias: string, stepAlias: string) {
  return `(
    (
      ${stepAlias}.step_id IS NOT NULL
      AND (
        ${stepAlias}.approver_type IN ('HR_ADMIN', 'HR_EXECUTIVE')
        OR (${stepAlias}.approver_type = 'ROLE' AND ${stepAlias}.approver_ref IN ('HR', 'HRAdmin', 'SuperAdmin'))
      )
      AND NOT EXISTS (
        SELECT 1 FROM hr_approval_workflow_steps later_step
        WHERE later_step.workflow_id = ${requestAlias}.workflow_id
          AND later_step.step_order > ${requestAlias}.current_step_order
      )
    )
    OR (
      ${requestAlias}.workflow_id IS NULL
      AND ${requestAlias}.current_step_order = 2
      AND ${requestAlias}.status IN ('PENDING', 'HOD_APPROVED')
    )
  )`;
}
