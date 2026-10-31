import { BadRequestException } from '@nestjs/common';
import { LeadershipChain } from '../department-leadership/approval-chain';

export async function regularizationRoute(
  query: (sql: string, params: unknown[]) => Promise<any[]>,
  tenantId: string,
  requesterId: string,
): Promise<LeadershipChain> {
  const [staff] = await query(
    `SELECT u.dept_id,COALESCE(c.revision,0) AS revision,
      COALESCE(p.entity_id,u.entity_id) AS entity_id,
      CASE WHEN c.dept_id IS NULL THEN d.hod_user_id
        WHEN c.structure IN ('HOD_ONLY','PRINCIPAL_HOD') THEN (
          SELECT a.user_id FROM department_offices o JOIN department_office_appointments a
            ON a.office_id=o.office_id AND a.valid_to IS NULL AND a.valid_from<=now()
          WHERE o.tenant_id=u.tenant_id AND o.dept_id=u.dept_id AND o.kind='HOD' LIMIT 1)
        ELSE NULL END AS hod_id
    FROM users u JOIN departments d ON d.dept_id=u.dept_id
    LEFT JOIN department_leadership c ON c.tenant_id=u.tenant_id AND c.dept_id=u.dept_id
    LEFT JOIN hr_employee_profiles p ON p.tenant_id=u.tenant_id AND p.user_id=u.user_id
    WHERE u.tenant_id=$1 AND u.user_id=$2 AND u.is_active=true AND u.deleted_at IS NULL`,
    [tenantId, requesterId],
  );
  if (!staff?.hod_id || staff.hod_id === requesterId)
    throw new BadRequestException(
      'Regularization requires an independent department HOD. Contact HR to configure an acting HOD.',
    );
  const [hod] = await query(
    `SELECT user_id FROM users WHERE tenant_id=$1 AND user_id=$2
    AND is_active=true AND deleted_at IS NULL`,
    [tenantId, staff.hod_id],
  );
  if (!hod) throw new BadRequestException('The department HOD is unavailable');
  const [hr] = await query(
    `SELECT u.user_id FROM users u
    WHERE u.tenant_id=$1 AND u.is_active=true AND u.deleted_at IS NULL
      AND u.user_id<>$2 AND u.user_id<>$3
      AND EXISTS(SELECT 1 FROM roles r WHERE r.role_name IN ('HR','HRAdmin','HRExecutive')
        AND (r.role_id=u.role_id OR EXISTS(SELECT 1 FROM user_roles ur
          WHERE ur.user_id=u.user_id AND ur.role_id=r.role_id)))
      AND (EXISTS(SELECT 1 FROM roles r WHERE r.role_name IN ('HR','HRAdmin') AND
        (r.role_id=u.role_id OR EXISTS(SELECT 1 FROM user_roles ur WHERE ur.user_id=u.user_id AND ur.role_id=r.role_id)))
        OR EXISTS(SELECT 1 FROM hr_access_controls ac WHERE ac.tenant_id=u.tenant_id AND ac.user_id=u.user_id
          AND ac.module_name='LEAVES' AND ac.can_view=true AND ac.can_approve=true))
      AND NOT EXISTS(SELECT 1 FROM hr_access_controls ac WHERE ac.tenant_id=u.tenant_id
        AND ac.user_id=u.user_id AND ac.module_name='LEAVES'
        AND (ac.can_view=false OR ac.can_approve=false
          OR (ac.department_scope IS NOT NULL AND NOT COALESCE($4::int=ANY(ac.department_scope),false))
          OR (ac.entity_scope IS NOT NULL AND NOT COALESCE($5::int=ANY(ac.entity_scope),false))))
    ORDER BY u.created_at,u.user_id LIMIT 1`,
    [tenantId, requesterId, staff.hod_id, staff.dept_id, staff.entity_id],
  );
  if (!hr)
    throw new BadRequestException(
      'An independent HR approver with access to this department is required',
    );
  return {
    deptId: Number(staff.dept_id),
    revision: Number(staff.revision),
    approverIds: [staff.hod_id, hr.user_id],
  };
}
