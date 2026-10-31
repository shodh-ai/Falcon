/** An HR queue item must be at the last configured HR step, not merely assigned to an HR user. */
export function finalHrReviewSql(requestAlias: string, stepAlias: string) {
  return `(
    EXISTS (SELECT 1 FROM hr_department_request_routes regularization_route
      WHERE regularization_route.tenant_id=${requestAlias}.tenant_id
        AND regularization_route.leave_id=${requestAlias}.leave_id
        AND regularization_route.policy='REGULARIZATION_HOD_HR'
        AND regularization_route.current_index=cardinality(regularization_route.approver_ids)-1
        AND ${requestAlias}.request_type='REGULARIZATION')
    OR
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
      AND NOT EXISTS (SELECT 1 FROM hr_department_request_routes department_route
        WHERE department_route.tenant_id = ${requestAlias}.tenant_id
          AND department_route.leave_id = ${requestAlias}.leave_id)
    )
  )`;
}

/** Explicit delegated scope restricts even HR master roles; absence retains legacy role access. */
export function hrRequestScopeSql(request: string, profile: string, employee: string, actor: string, write = false) {
  return `NOT EXISTS (
    SELECT 1 FROM hr_access_controls access
    WHERE access.tenant_id = ${request}.tenant_id AND access.user_id = ${actor}
      AND access.module_name = 'LEAVES'
      AND (access.can_view = false${write ? ' OR access.can_approve = false' : ''}
        OR (access.entity_scope IS NOT NULL AND NOT (COALESCE(COALESCE(${request}.entity_id, ${profile}.entity_id, ${employee}.entity_id) = ANY(access.entity_scope), false)))
        OR (access.department_scope IS NOT NULL AND NOT (COALESCE(${employee}.dept_id = ANY(access.department_scope), false))))
  )`;
}
