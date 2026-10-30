import { BadRequestException } from '@nestjs/common';
/** New routine requests use the operational office. Stored pending approvers are not changed. */
export async function configuredReportingOfficer(
  query: (sql: string, args: unknown[]) => Promise<any[]>,
  tenantId: string,
  userId: string,
) {
  const [row] = await query(
    `SELECT c.structure,c.higher_officer_id,
    principal.user_id AS principal_user_id,hod.user_id AS hod_user_id,
    CASE WHEN c.structure='PRINCIPAL_ONLY' THEN principal.user_id ELSE hod.user_id END AS head_user_id
    FROM users u JOIN department_leadership c ON c.tenant_id=u.tenant_id AND c.dept_id=u.dept_id
    LEFT JOIN LATERAL (SELECT a.user_id FROM department_offices o
      JOIN department_office_appointments a ON a.office_id=o.office_id AND a.valid_to IS NULL AND a.valid_from<=now()
      JOIN users h ON h.user_id=a.user_id AND h.tenant_id=o.tenant_id AND h.dept_id=o.dept_id AND h.is_active=true AND h.deleted_at IS NULL
      WHERE o.tenant_id=c.tenant_id AND o.dept_id=c.dept_id AND o.kind='PRINCIPAL') principal ON true
    LEFT JOIN LATERAL (SELECT a.user_id FROM department_offices o
      JOIN department_office_appointments a ON a.office_id=o.office_id AND a.valid_to IS NULL AND a.valid_from<=now()
      JOIN users h ON h.user_id=a.user_id AND h.tenant_id=o.tenant_id AND h.dept_id=o.dept_id AND h.is_active=true AND h.deleted_at IS NULL
      WHERE o.tenant_id=c.tenant_id AND o.dept_id=c.dept_id AND o.kind='HOD') hod ON true
    WHERE u.tenant_id=$1 AND u.user_id=$2 AND u.is_active=true AND u.deleted_at IS NULL`,
    [tenantId, userId],
  );
  if (!row?.structure) return { configured: false, officer: null };
  // Principal's own requests always go upward; the HOD never approves their head.
  const officer =
    row.principal_user_id === userId
      ? row.higher_officer_id
      : row.head_user_id === userId
        ? row.structure === 'PRINCIPAL_HOD'
          ? row.principal_user_id
          : row.higher_officer_id
        : row.head_user_id;
  if (!officer || officer === userId)
    throw new BadRequestException(
      'Department approval office or higher reporting officer is not configured',
    );
  return { configured: true, officer: officer as string };
}
