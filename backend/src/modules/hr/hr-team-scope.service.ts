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
        clause = ` AND ${userAlias}.tenant_id = ${pTenant}
          AND ${userAlias}.dept_id = (SELECT dept_id FROM users WHERE user_id = ${pManager} LIMIT 1)
          AND ${userAlias}.user_id != ${pManager}
          AND ${userAlias}.is_active = true`;
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
}
