import { BadRequestException, ForbiddenException } from '@nestjs/common';
export type OfficeQuery = (sql: string, args: unknown[]) => Promise<any[]>;
/** Resolve fresh appointments, never infer authority from a primary role/JWT alone. */
export async function requireDepartmentOffice(
  query: OfficeQuery,
  tenantId: string,
  actorId: string,
  kind: 'PRINCIPAL' | 'HOD',
  selected?: string | number,
  lock = false,
) {
  if (
    selected != null &&
    (!/^\d+$/.test(String(selected)) || Number(selected) < 1)
  )
    throw new BadRequestException('Invalid department');
  const rows = await query(
    `SELECT o.office_id,o.dept_id,o.kind,o.login_alias,a.appointment_id
    FROM department_offices o JOIN department_leadership c ON c.tenant_id=o.tenant_id AND c.dept_id=o.dept_id
    JOIN department_office_appointments a ON a.office_id=o.office_id AND a.valid_to IS NULL AND a.valid_from<=now()
    JOIN users u ON u.user_id=a.user_id AND u.tenant_id=o.tenant_id AND u.dept_id=o.dept_id
    WHERE o.tenant_id=$1 AND a.user_id=$2 AND o.kind=$3 AND u.is_active=true AND u.deleted_at IS NULL
      AND (c.structure='PRINCIPAL_HOD' OR c.structure=o.kind||'_ONLY')
      AND ($4::int IS NULL OR o.dept_id=$4) ORDER BY o.dept_id ${lock?'FOR SHARE OF o,a,u,c':''}`,
    [tenantId, actorId, kind, selected == null ? null : Number(selected)],
  );
  if (!rows.length)
    throw new ForbiddenException('No active department office in this scope');
  if (rows.length !== 1)
    throw new BadRequestException('Select one assigned department');
  return rows[0];
}
