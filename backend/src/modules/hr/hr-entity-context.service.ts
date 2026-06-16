import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EntityScopeContext } from '../../common/entity-scope/entity-scope.context';
import { HrAccessControlService, LEGACY_TO_CONTROL_MODULE } from './hr-access-control.service';

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
/** Roles that may list and scope all tenant entities without per-user access rows. */
const UNIVERSAL_ENTITY_ROLES = new Set(['SuperAdmin', 'HRAdmin', 'HR', 'President']);

export type AllowedEntity = { id: number; name: string; code: string };

@Injectable()
export class HrEntityContextService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly accessControl: HrAccessControlService,
  ) {}

  /** Strict entity filter — uses request scope when entityId omitted. */
  entityFilterSql(alias: string, paramIndex: number, entityId?: number): string {
    const scoped = entityId ?? EntityScopeContext.getEntityId();
    if (!scoped) {
      throw new ForbiddenException('Entity scope is required for this query');
    }
    return ` AND ${alias}.entity_id = $${paramIndex}`;
  }

  /** Resolved entity for the active request (interceptor / guard). */
  getScopedEntityId(fallback?: number): number {
    const scoped = EntityScopeContext.getEntityId() ?? fallback;
    if (!scoped) {
      throw new ForbiddenException('Entity scope is required');
    }
    return scoped;
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

  async listAllowedEntities(tenantId: string, userId: string, roles: string[] = []) {
    if (roles.some((r) => UNIVERSAL_ENTITY_ROLES.has(r))) {
      return this.listEntities(tenantId);
    }

    return this.dataSource.query(
      `SELECT DISTINCT oe.entity_id, oe.entity_code, oe.entity_name, oe.is_active
       FROM org_entities oe
       WHERE oe.tenant_id = $1 AND oe.is_active = true
         AND (
           oe.entity_id IN (
             SELECT uea.entity_id FROM user_entity_access uea WHERE uea.user_id = $2
           )
           OR oe.entity_id = (
             SELECT COALESCE(u.entity_id, p.entity_id)
             FROM users u
             LEFT JOIN hr_employee_profiles p ON p.user_id = u.user_id AND p.tenant_id = u.tenant_id
             WHERE u.user_id = $2 AND u.tenant_id = $1
           )
         )
       ORDER BY oe.entity_id ASC`,
      [tenantId, userId],
    );
  }

  formatAllowedEntities(
    rows: Array<{ entity_id: number; entity_name: string; entity_code: string }>,
  ): AllowedEntity[] {
    return rows.map((row) => ({
      id: row.entity_id,
      name: row.entity_name,
      code: row.entity_code,
    }));
  }

  async assertEntityAccess(
    tenantId: string,
    userId: string,
    roles: string[],
    entityId: number,
  ): Promise<void> {
    if (roles.some((r) => UNIVERSAL_ENTITY_ROLES.has(r))) {
      await this.resolveEntityId(tenantId, entityId);
      return;
    }

    const rows = await this.dataSource.query(
      `SELECT 1
       FROM user_entity_access uea
       INNER JOIN org_entities oe ON oe.entity_id = uea.entity_id
       WHERE uea.user_id = $1 AND uea.entity_id = $2
         AND oe.tenant_id = $3 AND oe.is_active = true`,
      [userId, entityId, tenantId],
    );
    if (!rows[0]) {
      throw new ForbiddenException('You do not have access to this Organization Entity.');
    }
  }

  /**
   * Resolve entity for an incoming HR request. Master HR roles may omit entity_id
   * when multiple entities exist — we default to the first allowed entity.
   */
  async resolveRequestEntityId(
    tenantId: string,
    userId: string,
    roles: string[],
    entityIdRaw?: string | number | null,
  ): Promise<number> {
    if (entityIdRaw != null && entityIdRaw !== '') {
      const entityId = await this.resolveEntityId(tenantId, entityIdRaw);
      await this.assertEntityAccess(tenantId, userId, roles, entityId);
      return entityId;
    }

    const allowed = await this.listAllowedEntities(tenantId, userId, roles);
    if (!allowed.length) {
      throw new ForbiddenException('No organization entity assigned to your account.');
    }
    if (allowed.length === 1) {
      return Number(allowed[0].entity_id);
    }
    if (roles.some((r) => UNIVERSAL_ENTITY_ROLES.has(r))) {
      return Number(allowed[0].entity_id);
    }

    throw new ForbiddenException(
      'Organization entity required. Send x-entity-id header or entity_id query param.',
    );
  }

  async resolveEntityId(tenantId: string, entityIdRaw?: string | number): Promise<number> {
    const fromContext = EntityScopeContext.getEntityId();
    if (fromContext && (entityIdRaw == null || entityIdRaw === '')) {
      return fromContext;
    }

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

    if (fromContext) return fromContext;

    throw new ForbiddenException(
      'Organization entity required. Send x-entity-id header or entity_id query param.',
    );
  }

  async getPermissions(tenantId: string, userId: string): Promise<HrCapabilities | null> {
    return this.accessControl.getCapabilitiesForUser(tenantId, userId);
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
      for (const [module, level] of Object.entries(row.capabilities)) {
        if (!level || level === 'none') continue;
        const controlModule = LEGACY_TO_CONTROL_MODULE[module as HrModuleKey];
        if (!controlModule) continue;
        await this.accessControl.patchModuleAccess(
          tenantId,
          row.user_id,
          controlModule,
          { level: level as HrAccessLevel },
          updatedByUserId,
        );
      }
    }
    return this.accessControl.listAccessMatrix(tenantId, { limit: 200 });
  }

  async patchUserPermission(
    tenantId: string,
    targetUserId: string,
    updatedByUserId: string,
    module: string,
    level: string,
  ) {
    const result = await this.accessControl.patchModuleAccess(
      tenantId,
      targetUserId,
      module,
      { level: level as HrAccessLevel },
      updatedByUserId,
    );
    return { user_id: targetUserId, capabilities: result.capabilities };
  }

  canAccessModule(caps: HrCapabilities | null | undefined, module: HrModuleKey): boolean {
    if (!caps) return false;
    const access = caps[module] ?? 'none';
    return access !== 'none';
  }

  capabilitiesToPermissionList(caps: HrCapabilities | null | undefined): string[] {
    if (!caps) return [];
    return Object.entries(caps)
      .filter(([, level]) => level && level !== 'none')
      .map(([module, level]) => `${module}:${level}`);
  }

  hasPermission(permissions: string[], module: HrModuleKey, minLevel: 'read' | 'write' = 'read'): boolean {
    const required = minLevel === 'write' ? ['write'] : ['read', 'write'];
    return permissions.some((p) => {
      const [mod, level] = p.split(':');
      return mod === module && required.includes(level);
    });
  }
}
