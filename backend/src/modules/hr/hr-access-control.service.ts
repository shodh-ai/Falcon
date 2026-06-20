import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CacheService } from '../../core/redis/cache.service';
import type { HrPowerAction } from '../../common/decorators/require-hr-power.decorator';
import type {
  HrAccessLevel,
  HrCapabilities,
  HrModuleKey,
} from './hr-entity-context.service';

const MASTER_ROLES = new Set(['HRAdmin', 'SuperAdmin', 'HR', 'President']);

export const HR_DELEGATION_MODULES = [
  'ATTENDANCE',
  'PAYROLL',
  'RECRUITMENT',
  'LEAVES',
  'DOCUMENTS',
  'ONBOARDING',
  'OFFBOARDING',
  'DIRECTORY',
  'REPORTS',
  'RULES',
  'POLICIES',
  'BIOMETRICS',
  'DASHBOARD',
] as const;

export type HrDelegationModule = (typeof HR_DELEGATION_MODULES)[number];

export type AccessControlRow = {
  access_id: string;
  user_id: string;
  module_name: string;
  can_view: boolean;
  can_edit: boolean;
  can_approve: boolean;
  can_delete: boolean;
  department_scope: number[] | null;
  entity_scope: number[] | null;
};

export type DelegationUserRow = {
  user_id: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
  dept_id: number | null;
  controls: AccessControlRow[];
};

/** Maps legacy lowercase module keys (JWT / HrPermissionGuard) to hr_access_controls names. */
export const LEGACY_TO_CONTROL_MODULE: Record<HrModuleKey, HrDelegationModule> =
  {
    onboarding: 'ONBOARDING',
    offboarding: 'OFFBOARDING',
    payroll: 'PAYROLL',
    biometrics: 'BIOMETRICS',
    leaves: 'LEAVES',
    documents: 'DOCUMENTS',
    policies: 'POLICIES',
    rules: 'RULES',
    directory: 'DIRECTORY',
    attendance: 'ATTENDANCE',
    recruitment: 'RECRUITMENT',
    dashboard: 'DASHBOARD',
    reports: 'REPORTS',
  };

@Injectable()
export class HrAccessControlService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cache: CacheService,
  ) {}

  legacyModuleKey(module: string): HrModuleKey {
    return module.trim().toLowerCase() as HrModuleKey;
  }

  levelToPowers(
    level: HrAccessLevel,
  ): Pick<
    AccessControlRow,
    'can_view' | 'can_edit' | 'can_approve' | 'can_delete'
  > {
    if (level === 'write') {
      return {
        can_view: true,
        can_edit: true,
        can_approve: false,
        can_delete: false,
      };
    }
    if (level === 'read') {
      return {
        can_view: true,
        can_edit: false,
        can_approve: false,
        can_delete: false,
      };
    }
    return {
      can_view: false,
      can_edit: false,
      can_approve: false,
      can_delete: false,
    };
  }

  powersToLevel(
    row: Pick<AccessControlRow, 'can_view' | 'can_edit'> | null,
  ): HrAccessLevel {
    if (!row) return 'none';
    if (row.can_edit) return 'write';
    if (row.can_view) return 'read';
    return 'none';
  }

  buildCapabilitiesFromControls(rows: AccessControlRow[]): HrCapabilities {
    const caps: HrCapabilities = {};
    for (const [legacy, controlName] of Object.entries(
      LEGACY_TO_CONTROL_MODULE,
    )) {
      const row = rows.find((r) => r.module_name === controlName);
      caps[legacy as HrModuleKey] = this.powersToLevel(row ?? null);
    }
    return caps;
  }

  /** Single source of truth: hr_access_controls, with legacy JSONB fallback. */
  async getCapabilitiesForUser(
    tenantId: string,
    userId: string,
  ): Promise<HrCapabilities | null> {
    const cacheKey = `hr_caps:${tenantId}:${userId}`;
    return this.cache.getOrSet(cacheKey, async () => {
      const rows = await this.dataSource.query<AccessControlRow[]>(
        `SELECT module_name, can_view, can_edit, can_approve, can_delete,
                department_scope, entity_scope, access_id, user_id
         FROM hr_access_controls WHERE tenant_id = $1 AND user_id = $2`,
        [tenantId, userId],
      );
      if (rows.length) {
        return this.buildCapabilitiesFromControls(rows);
      }

      const legacy = await this.dataSource.query(
        `SELECT capabilities FROM hr_permissions WHERE tenant_id = $1 AND user_id = $2`,
        [tenantId, userId],
      );
      return (legacy[0]?.capabilities as HrCapabilities) ?? null;
    });
  }

  async syncHrPermissionsJsonb(
    tenantId: string,
    userId: string,
    updatedByUserId?: string,
  ): Promise<HrCapabilities> {
    const rows = await this.dataSource.query<AccessControlRow[]>(
      `SELECT module_name, can_view, can_edit, can_approve, can_delete,
              department_scope, entity_scope, access_id, user_id
       FROM hr_access_controls WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, userId],
    );
    const capabilities = this.buildCapabilitiesFromControls(rows);
    await this.dataSource.query(
      `INSERT INTO hr_permissions (tenant_id, user_id, capabilities, updated_by_user_id, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, NOW())
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET
         capabilities = EXCLUDED.capabilities,
         updated_by_user_id = EXCLUDED.updated_by_user_id,
         updated_at = NOW()`,
      [tenantId, userId, JSON.stringify(capabilities), updatedByUserId ?? null],
    );
    return capabilities;
  }

  /** Unified matrix: all staff + granular controls (replaces separate permissions/delegation lists). */
  async listAccessMatrix(
    tenantId: string,
    options?: { q?: string; limit?: number; offset?: number },
  ) {
    const limit = Math.min(Math.max(options?.limit ?? 100, 1), 200);
    const offset = Math.max(options?.offset ?? 0, 0);
    const q = options?.q?.trim() || null;
    const searchParam = q ? `%${q}%` : null;

    const users = await this.dataSource.query<
      Array<{
        user_id: string;
        name: string;
        email: string;
        role: string;
        department: string | null;
        dept_id: number | null;
      }>
    >(
      `SELECT u.user_id, u.name, u.official_email AS email, r.role_name AS role,
              d.dept_name AS department, u.dept_id
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       WHERE u.tenant_id = $1 AND u.is_active = true
         AND r.role_name NOT IN ('Student', 'Applicant', 'Parent')
         AND ($2::text IS NULL OR u.name ILIKE $2 OR u.official_email ILIKE $2)
       ORDER BY u.name
       LIMIT $3 OFFSET $4`,
      [tenantId, searchParam, limit, offset],
    );

    if (!users.length) return [];

    const userIds = users.map((u) => u.user_id);
    const controls = await this.dataSource.query<AccessControlRow[]>(
      `SELECT access_id, user_id, module_name, can_view, can_edit, can_approve, can_delete,
              department_scope, entity_scope
       FROM hr_access_controls WHERE tenant_id = $1 AND user_id = ANY($2::uuid[])`,
      [tenantId, userIds],
    );

    const byUser = new Map<string, AccessControlRow[]>();
    for (const c of controls) {
      const list = byUser.get(c.user_id) ?? [];
      list.push(c);
      byUser.set(c.user_id, list);
    }

    return users.map((u) => ({
      ...u,
      controls: byUser.get(u.user_id) ?? [],
      capabilities: this.buildCapabilitiesFromControls(
        byUser.get(u.user_id) ?? [],
      ),
    }));
  }

  async patchModuleAccess(
    tenantId: string,
    userId: string,
    module: string,
    input: {
      level?: HrAccessLevel;
      can_view?: boolean;
      can_edit?: boolean;
      can_approve?: boolean;
      can_delete?: boolean;
      department_scope?: number[] | null;
      entity_scope?: number[] | null;
    },
    updatedByUserId?: string,
  ) {
    const legacyKey = this.legacyModuleKey(module);
    const controlModule =
      LEGACY_TO_CONTROL_MODULE[legacyKey] ?? this.normalizeModule(module);

    let powers: Parameters<HrAccessControlService['upsertAccessControl']>[3];
    if (input.level != null) {
      const fromLevel = this.levelToPowers(input.level);
      const existing = await this.getUserModuleAccess(
        tenantId,
        userId,
        controlModule,
      );
      powers = {
        ...fromLevel,
        can_approve: existing?.can_approve ?? false,
        can_delete: existing?.can_delete ?? false,
        department_scope: existing?.department_scope ?? null,
        entity_scope: existing?.entity_scope ?? null,
      };
    } else {
      const existing = await this.getUserModuleAccess(
        tenantId,
        userId,
        controlModule,
      );
      powers = {
        can_view: input.can_view ?? existing?.can_view ?? false,
        can_edit: input.can_edit ?? existing?.can_edit ?? false,
        can_approve: input.can_approve ?? existing?.can_approve ?? false,
        can_delete: input.can_delete ?? existing?.can_delete ?? false,
        department_scope:
          input.department_scope !== undefined
            ? input.department_scope
            : (existing?.department_scope ?? null),
        entity_scope:
          input.entity_scope !== undefined
            ? input.entity_scope
            : (existing?.entity_scope ?? null),
      };
      if (powers.can_edit || powers.can_approve || powers.can_delete) {
        powers.can_view = true;
      }
    }

    const row = await this.upsertAccessControl(
      tenantId,
      userId,
      controlModule,
      powers,
    );
    const capabilities = await this.syncHrPermissionsJsonb(
      tenantId,
      userId,
      updatedByUserId,
    );
    return {
      user_id: userId,
      module: controlModule,
      control: row,
      capabilities,
    };
  }

  normalizeModule(module: string): HrDelegationModule {
    const key = module
      .trim()
      .toUpperCase()
      .replace(/-/g, '_') as HrDelegationModule;
    if (!HR_DELEGATION_MODULES.includes(key)) {
      throw new ForbiddenException(`Unknown HR module: ${module}`);
    }
    return key;
  }

  moduleForRequestType(requestType: string): HrDelegationModule {
    switch (requestType) {
      case 'LEAVE':
        return 'LEAVES';
      case 'ON_DUTY':
      case 'REGULARIZATION':
      case 'COMP_OFF_CREDIT':
        return 'ATTENDANCE';
      default:
        return 'LEAVES';
    }
  }

  moduleForActionType(actionType: string): HrDelegationModule {
    switch (actionType) {
      case 'ON_DUTY':
      case 'REGULARIZATION':
      case 'COMP_OFF':
        return 'ATTENDANCE';
      case 'RESIGNATION':
        return 'OFFBOARDING';
      case 'CTC_UPDATE':
        return 'PAYROLL';
      default:
        return 'LEAVES';
    }
  }

  isMasterRole(roles: string[]): boolean {
    return roles.some((r) => MASTER_ROLES.has(r));
  }

  async assertPower(
    tenantId: string,
    userId: string,
    roles: string[],
    module: string,
    action: HrPowerAction,
  ): Promise<void> {
    if (this.isMasterRole(roles)) return;

    const mod = this.normalizeModule(module);
    const row = await this.getUserModuleAccess(tenantId, userId, mod);
    if (!row) {
      throw new ForbiddenException(`No delegated access for ${mod}`);
    }

    const allowed =
      action === 'view'
        ? row.can_view
        : action === 'edit'
          ? row.can_edit
          : action === 'approve'
            ? row.can_approve
            : row.can_delete;

    if (!allowed) {
      throw new ForbiddenException(`${action} access denied for ${mod}`);
    }
  }

  async getUserModuleAccess(
    tenantId: string,
    userId: string,
    module: HrDelegationModule,
  ) {
    const rows = await this.dataSource.query<AccessControlRow[]>(
      `SELECT access_id, user_id, module_name, can_view, can_edit, can_approve, can_delete,
              department_scope, entity_scope
       FROM hr_access_controls
       WHERE tenant_id = $1 AND user_id = $2 AND module_name = $3`,
      [tenantId, userId, module],
    );
    return rows[0] ?? null;
  }

  async upsertAccessControl(
    tenantId: string,
    userId: string,
    module: string,
    powers: {
      can_view?: boolean;
      can_edit?: boolean;
      can_approve?: boolean;
      can_delete?: boolean;
      department_scope?: number[] | null;
      entity_scope?: number[] | null;
    },
  ) {
    const mod = this.normalizeModule(module);
    const rows = await this.dataSource.query(
      `INSERT INTO hr_access_controls
         (tenant_id, user_id, module_name, can_view, can_edit, can_approve, can_delete,
          department_scope, entity_scope, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
       ON CONFLICT (tenant_id, user_id, module_name) DO UPDATE SET
         can_view = EXCLUDED.can_view,
         can_edit = EXCLUDED.can_edit,
         can_approve = EXCLUDED.can_approve,
         can_delete = EXCLUDED.can_delete,
         department_scope = EXCLUDED.department_scope,
         entity_scope = EXCLUDED.entity_scope,
         updated_at = NOW()
       RETURNING *`,
      [
        tenantId,
        userId,
        mod,
        powers.can_view ?? false,
        powers.can_edit ?? false,
        powers.can_approve ?? false,
        powers.can_delete ?? false,
        powers.department_scope ?? null,
        powers.entity_scope ?? null,
      ],
    );
    await this.cache.del(`hr_caps:${tenantId}:${userId}`);
    return rows[0];
  }

  /** @deprecated Use listAccessMatrix — kept for backward-compatible API alias. */
  listDelegationMatrix(
    tenantId: string,
    options?: { q?: string; limit?: number },
  ) {
    return this.listAccessMatrix(tenantId, options);
  }

  /** Layer 3: department filter SQL fragment for scoped HR executives. */
  async departmentScopeClause(
    tenantId: string,
    userId: string,
    roles: string[],
    userAlias: string,
    paramIndex: number,
  ): Promise<{ clause: string; params: unknown[] }> {
    if (this.isMasterRole(roles)) {
      return { clause: '', params: [] };
    }

    const scoped = await this.dataSource.query<
      Array<{ department_scope: number[] | null }>
    >(
      `SELECT department_scope FROM hr_access_controls
       WHERE tenant_id = $1 AND user_id = $2 AND department_scope IS NOT NULL
       LIMIT 1`,
      [tenantId, userId],
    );

    const deptIds = scoped[0]?.department_scope;
    if (!deptIds?.length) {
      return { clause: '', params: [] };
    }

    return {
      clause: ` AND ${userAlias}.dept_id = ANY($${paramIndex})`,
      params: [deptIds],
    };
  }

  async resolveHrExecutiveApprover(
    tenantId: string,
    requesterUserId: string,
    module: HrDelegationModule,
    specificUserId?: string | null,
  ): Promise<string | null> {
    if (specificUserId) {
      const row = await this.getUserModuleAccess(
        tenantId,
        specificUserId,
        module,
      );
      if (row?.can_approve) return specificUserId;
      return null;
    }

    const requester = await this.dataSource.query<
      Array<{ dept_id: number | null }>
    >(`SELECT dept_id FROM users WHERE user_id = $1 AND tenant_id = $2`, [
      requesterUserId,
      tenantId,
    ]);
    const deptId = requester[0]?.dept_id;

    const rows = await this.dataSource.query<Array<{ user_id: string }>>(
      `SELECT u.user_id
       FROM users u
       INNER JOIN hr_access_controls hac
         ON hac.user_id = u.user_id AND hac.tenant_id = u.tenant_id
       WHERE u.tenant_id = $1 AND u.is_active = true
         AND hac.module_name = $2 AND hac.can_approve = true
         AND (
           hac.department_scope IS NULL
           OR $3::int IS NULL
           OR $3 = ANY(hac.department_scope)
         )
       ORDER BY u.name
       LIMIT 1`,
      [tenantId, module, deptId],
    );
    return rows[0]?.user_id ?? null;
  }

  async resolveHrAdminApprover(tenantId: string): Promise<string | null> {
    const rows = await this.dataSource.query<Array<{ user_id: string }>>(
      `SELECT u.user_id FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND u.is_active = true
         AND r.role_name IN ('HRAdmin', 'SuperAdmin')
       ORDER BY CASE WHEN r.role_name = 'HRAdmin' THEN 0 ELSE 1 END, u.name
       LIMIT 1`,
      [tenantId],
    );
    return rows[0]?.user_id ?? null;
  }

  async assertWorkflowApproverPower(
    tenantId: string,
    actorUserId: string,
    roles: string[],
    approverType: string | null | undefined,
    requestType: string,
  ): Promise<void> {
    if (this.isMasterRole(roles)) return;
    if (
      !approverType ||
      approverType === 'REPORTING_MANAGER' ||
      approverType === 'DEPT_HEAD'
    ) {
      return;
    }
    if (approverType === 'HR_EXECUTIVE') {
      await this.assertPower(
        tenantId,
        actorUserId,
        roles,
        this.moduleForRequestType(requestType),
        'approve',
      );
      return;
    }
    if (approverType === 'HR_ADMIN') {
      if (roles.some((r) => r === 'HRAdmin' || r === 'SuperAdmin')) return;
      await this.assertPower(
        tenantId,
        actorUserId,
        roles,
        'OFFBOARDING',
        'approve',
      );
    }
  }
}
