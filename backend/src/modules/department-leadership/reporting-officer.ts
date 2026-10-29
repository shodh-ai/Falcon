import { BadRequestException } from '@nestjs/common';
export async function configuredReportingOfficer(
  query: (sql: string, args: unknown[]) => Promise<any[]>,
  tenantId: string,
  userId: string,
) {
  const [row] = await query(
    `SELECT c.structure,c.higher_officer_id,a.user_id AS head_user_id
    FROM users u JOIN department_leadership c ON c.tenant_id=u.tenant_id AND c.dept_id=u.dept_id
    LEFT JOIN department_offices o ON o.tenant_id=c.tenant_id AND o.dept_id=c.dept_id AND o.kind=CASE WHEN c.structure='HOD_ONLY' THEN 'HOD' ELSE 'PRINCIPAL' END
    LEFT JOIN department_office_appointments a ON a.office_id=o.office_id AND a.valid_to IS NULL AND a.valid_from<=now()
    WHERE u.tenant_id=$1 AND u.user_id=$2`,
    [tenantId, userId],
  );
  if (!row?.structure) return { configured: false, officer: null };
  const officer =
    row.head_user_id === userId ? row.higher_officer_id : row.head_user_id;
  if (!officer || officer === userId)
    throw new BadRequestException(
      'Department reporting office or higher reporting officer is not configured',
    );
  return { configured: true, officer: officer as string };
}
