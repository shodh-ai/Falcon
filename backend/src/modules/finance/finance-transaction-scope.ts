/** Legacy payment writers omitted nullable t.tenant_id. Derive that scope only
 * from consistent existing ownership; never assign a default institution or
 * rewrite historical records while authorizing a request. Aliases are fixed. */
export function financeTransactionScope(tenant: ':tenantId' | '$2'): string {
  return `(t.tenant_id = ${tenant} OR (t.tenant_id IS NULL AND (
    d.tenant_id = ${tenant} OR (t.demand_id IS NULL AND u.tenant_id = ${tenant})
  )))
  AND (t.demand_id IS NULL OR (d.tenant_id = ${tenant}
    AND (t.student_user_id IS NULL OR d.student_user_id = t.student_user_id)))
  AND (t.student_user_id IS NULL OR u.tenant_id = ${tenant})`;
}
