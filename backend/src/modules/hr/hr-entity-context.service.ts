import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export type HrModuleKey =
  | 'onboarding'
  | 'offboarding'
  | 'payroll'
  | 'biometrics'
  | 'leaves'
  | 'documents'
  | 'policies'
  | 'rules'
  | 'directory'
  | 'attendance'
  | 'recruitment'
  | 'reports'
  | 'dashboard';

export type HrAccessLevel = 'none' | 'read' | 'write';

export type HrCapabilities = Partial<Record<HrModuleKey, HrAccessLevel>>;

const MASTER_ROLES = new Set(['HRAdmin', 'SuperAdmin', 'HR', 'President']);

@Injectable()
export class HrEntityContextService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Strict entity filter — no OR NULL leakage across entities. */
  entityFilterSql(alias: string, paramIndex: number): string {
    return ` AND ${alias}.entity_id = $${paramIndex}`;
  }

  async listEntities(tenantId: string) {
    return this.dataSource.query(
      `SELECT entity_id, entity_code, entity_name, is_active
       FROM org_entities
       WHERE tenant_id = $1 AND is_active = true
       ORDER BY entity_id ASC`,
      [tenantId],
    );
  }

  async resolveEntityId(tenantId: string, entityIdRaw?: string | number): Promise<number> {
    if (entityIdRaw != null && entityIdRaw !== '') {
      const entityId = Number(entityIdRaw);
      if (!Number.isFinite(entityId) || entityId <= 0) {
        throw new BadRequestException('Invalid entity_id');
      }
      const rows = await this.dataSource.query(
        `SELECT entity_id FROM org_entities WHERE tenant_id = $1 AND entity_id = $2 AND is_active = true`,
        [tenantId, entityId],
      );
      if (!rows[0]) throw new NotFoundException('Entity not found for tenant');
      return entityId;
    }

    const rows = await this.dataSource.query(
      `SELECT entity_id FROM org_entities
       WHERE tenant_id = $1 AND is_active = true
       ORDER BY entity_id ASC LIMIT 1`,
      [tenantId],
    );
    if (!rows[0]) throw new NotFoundException('No org entities configured for tenant');
    return Number(rows[0].entity_id);
  }

  async getPermissions(tenantId: string, userId: string): Promise<HrCapabilities | null> {
    const rows = await this.dataSource.query(
      `SELECT capabilities FROM hr_permissions WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, userId],
    );
    return (rows[0]?.capabilities as HrCapabilities) ?? null;
  }

  async assertModuleAccess(
    tenantId: string,
    userId: string,
    roles: string[],
    module: HrModuleKey,
    level: 'read' | 'write',
  ) {
    if (roles.some((r) => MASTER_ROLES.has(r))) return;

    const caps = await this.getPermissions(tenantId, userId);
    if (!caps) {
      throw new ForbiddenException(`No HR permission for ${module}`);
    }

    const access = caps[module] ?? 'none';
    if (access === 'none') throw new ForbiddenException(`Access denied for ${module}`);
    if (level === 'write' && access !== 'write') {
      throw new ForbiddenException(`Write access denied for ${module}`);
    }
  }

  async listPermissionMatrix(
    tenantId: string,
    options?: { q?: string; limit?: number; offset?: number },
  ) {
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
    const offset = Math.max(options?.offset ?? 0, 0);
    const q = options?.q?.trim() || null;
    const searchParam = q ? `%${q}%` : null;

    return this.dataSource.query(
      `SELECT u.user_id, u.name, u.official_email AS email, r.role_name AS role,
              d.dept_name AS department,
              COALESCE(p.capabilities, '{}'::jsonb) AS capabilities
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       LEFT JOIN hr_permissions p ON p.tenant_id = u.tenant_id AND p.user_id = u.user_id
       WHERE u.tenant_id = $1 AND u.is_active = true
         AND r.role_name NOT IN ('Student', 'Applicant', 'Parent')
         AND ($2::text IS NULL OR u.name ILIKE $2 OR u.official_email ILIKE $2)
       ORDER BY u.name
       LIMIT $3 OFFSET $4`,
      [tenantId, searchParam, limit, offset],
    );
  }

  hasAnyHrCapability(caps: HrCapabilities | null | undefined): boolean {
    if (!caps) return false;
    return Object.values(caps).some((v) => v && v !== 'none');
  }

  async upsertPermissionMatrix(
    tenantId: string,
    updatedByUserId: string,
    rows: { user_id: string; capabilities: HrCapabilities }[],
  ) {
    for (const row of rows) {
      await this.dataSource.query(
        `INSERT INTO hr_permissions (tenant_id, user_id, capabilities, updated_by_user_id, updated_at)
         VALUES ($1, $2, $3::jsonb, $4, NOW())
         ON CONFLICT (tenant_id, user_id) DO UPDATE SET
           capabilities = EXCLUDED.capabilities,
           updated_by_user_id = EXCLUDED.updated_by_user_id,
           updated_at = NOW()`,
        [tenantId, row.user_id, JSON.stringify(row.capabilities), updatedByUserId],
      );
    }
    return this.listPermissionMatrix(tenantId, { limit: 200 });
  }

  async patchUserPermission(
    tenantId: string,
    targetUserId: string,
    updatedByUserId: string,
    module: string,
    level: string,
  ) {
    const existing = (await this.getPermissions(tenantId, targetUserId)) ?? {};
    const capabilities = { ...existing, [module]: level };
    await this.dataSource.query(
      `INSERT INTO hr_permissions (tenant_id, user_id, capabilities, updated_by_user_id, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, NOW())
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET
         capabilities = EXCLUDED.capabilities,
         updated_by_user_id = EXCLUDED.updated_by_user_id,
         updated_at = NOW()`,
      [tenantId, targetUserId, JSON.stringify(capabilities), updatedByUserId],
    );
    return { user_id: targetUserId, capabilities };
  }

  canAccessModule(caps: HrCapabilities | null | undefined, module: HrModuleKey): boolean {
    if (!caps) return false;
    const access = caps[module] ?? 'none';
    return access !== 'none';
  }
}
