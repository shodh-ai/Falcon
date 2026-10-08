import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export type TeamScope = 'direct' | 'indirect' | 'dept';

export function parseTeamScope(raw?: string): TeamScope {
  const v = (raw ?? 'direct').toLowerCase();
  if (v === 'direct' || v === 'indirect' || v === 'dept') return v;
  throw new BadRequestException('scope must be direct, indirect, or dept');
}

@Injectable()
export class HrTeamScopeService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  scopeUserFilterSql(
    managerId: string,
    tenantId: string,
    scope: TeamScope,
    userAlias = 'u',
    startParamIndex = 1,
  ): { clause: string; params: unknown[] } {
    const pTenant = `$${startParamIndex}`;
    const pManager = `$${startParamIndex + 1}`;
    const params: unknown[] = [tenantId, managerId];

    let clause: string;
    switch (scope) {
      case 'direct':
        clause = ` AND ${userAlias}.tenant_id = ${pTenant}
          AND ${userAlias}.reporting_officer_id = ${pManager}
          AND ${userAlias}.is_active = true`;
        break;
      case 'indirect':
        clause = ` AND ${userAlias}.tenant_id = ${pTenant}
          AND ${userAlias}.reporting_officer_id IN (
            SELECT dr.user_id FROM users dr
            WHERE dr.tenant_id = ${pTenant}
              AND dr.reporting_officer_id = ${pManager}
              AND dr.is_active = true
          )
          AND ${userAlias}.is_active = true`;
        break;
      case 'dept':
        // HODs see department faculty only (Faculty/HOD/Dean), not HR/admin staff
        // seeded into the same dept_id (e.g. HR Admin on Computer Science).
        clause = ` AND ${userAlias}.tenant_id = ${pTenant}
          AND ${userAlias}.user_id != ${pManager}
          AND ${userAlias}.is_active = true
          AND (
            (
              EXISTS (
                SELECT 1 FROM departments d
                WHERE d.hod_user_id = ${pManager}
              )
              AND ${userAlias}.dept_id IN (
                SELECT d.dept_id FROM departments d WHERE d.hod_user_id = ${pManager}
                UNION
                SELECT u0.dept_id FROM users u0
                WHERE u0.user_id = ${pManager} AND u0.dept_id IS NOT NULL
              )
              AND EXISTS (
                SELECT 1 FROM roles r
                WHERE r.role_id = ${userAlias}.role_id
                  AND r.role_name IN ('Faculty', 'HOD', 'Dean')
              )
            )
            OR (
              NOT EXISTS (
                SELECT 1 FROM departments d
                WHERE d.hod_user_id = ${pManager}
              )
              AND ${userAlias}.dept_id = (
                SELECT dept_id FROM users WHERE user_id = ${pManager} LIMIT 1
              )
            )
          )`;
        break;
    }

    return { clause, params };
  }

  async listScopedUsers(
    managerId: string,
    tenantId: string,
    scope: TeamScope,
  ): Promise<
    Array<{ user_id: string; name: string; employee_id: string | null }>
  > {
    const { clause, params } = this.scopeUserFilterSql(
      managerId,
      tenantId,
      scope,
      'u',
      1,
    );
    return this.dataSource.query(
      `SELECT u.user_id, u.name, p.employee_id
       FROM users u
       LEFT JOIN hr_employee_profiles p ON p.user_id = u.user_id AND p.tenant_id = u.tenant_id
       WHERE 1=1 ${clause}
       ORDER BY u.name`,
      params,
    );
  }

  async getScopeCounts(
    managerId: string,
    tenantId: string,
  ): Promise<{ direct: number; indirect: number; dept: number }> {
    const rows = await this.dataSource.query<
      Array<{ direct: string; indirect: string; dept: string }>
    >(
      `SELECT
         (SELECT COUNT(*)::int FROM users u
          WHERE u.tenant_id = $1 AND u.reporting_officer_id = $2 AND u.is_active = true) AS direct,
         (SELECT COUNT(*)::int FROM users u
          WHERE u.tenant_id = $1
            AND u.reporting_officer_id IN (
              SELECT dr.user_id FROM users dr
              WHERE dr.tenant_id = $1 AND dr.reporting_officer_id = $2 AND dr.is_active = true
            )
            AND u.is_active = true) AS indirect,
         (SELECT COUNT(*)::int FROM users u
          WHERE u.tenant_id = $1
            AND u.user_id != $2
            AND u.is_active = true
            AND (
              (
                EXISTS (SELECT 1 FROM departments d WHERE d.hod_user_id = $2)
                AND u.dept_id IN (
                  SELECT d.dept_id FROM departments d WHERE d.hod_user_id = $2
                  UNION
                  SELECT u0.dept_id FROM users u0
                  WHERE u0.user_id = $2 AND u0.dept_id IS NOT NULL
                )
                AND EXISTS (
                  SELECT 1 FROM roles r
                  WHERE r.role_id = u.role_id
                    AND r.role_name IN ('Faculty', 'HOD', 'Dean')
                )
              )
              OR (
                NOT EXISTS (SELECT 1 FROM departments d WHERE d.hod_user_id = $2)
                AND u.dept_id = (SELECT dept_id FROM users WHERE user_id = $2 LIMIT 1)
              )
            )) AS dept`,
      [tenantId, managerId],
    );
    const r = rows[0];
    return {
      direct: Number(r?.direct ?? 0),
      indirect: Number(r?.indirect ?? 0),
      dept: Number(r?.dept ?? 0),
    };
  }
}
