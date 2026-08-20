/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- TypeORM query() rows are untyped */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import * as os from 'os';
import { DataSource } from 'typeorm';
import {
  CampusScopeService,
  type ScopedAuthUser,
} from '../../common/campus-scope/campus-scope.service';
import { ROLE_PERMISSIONS } from '../../common/config/role-permissions.matrix';
import { FalconNotificationsService } from '../../core/notifications/falcon-notifications.service';
import { AnnouncementsService } from '../admin-ops/announcements.service';
import {
  AiAssistDto,
  AnnouncementDto,
  AssignHodDto,
  BroadcastNotificationDto,
  BulkImportUsersDto,
  CalendarEventDto,
  CreateAdminUserDto,
  CreateCourseDto,
  CreateDepartmentDto,
  FeeStructureDto,
  NamedEntityDto,
  PortalAccessDto,
  PromoteStudentDto,
  ReportExportDto,
  ResetPasswordDto,
  RolePermissionsDto,
  SystemSettingsDto,
  UpdateAdminUserDto,
  UpdateCourseDto,
  UpdateDepartmentDto,
} from './dto/admin-control.dto';

const HOD_ELIGIBLE_ROLES = ['Faculty', 'HOD', 'Dean'] as const;

type DepartmentActor = ScopedAuthUser & { user_id: string };
type QueryExecutor = { query: (sql: string, params?: unknown[]) => Promise<unknown> };

export type DepartmentListFilters = {
  q?: string;
  campus_id?: number;
  school_id?: number;
  status?: 'active' | 'inactive' | 'all';
};

const MANAGED_ROLE_ALIASES: Record<string, string[]> = {
  students: ['Student'],
  faculty: ['Faculty'],
  hod: ['HOD'],
  registrar: ['Registrar'],
  finance: ['Accountant', 'Finance'],
  library: ['Librarian'],
  placement: ['PlacementCell', 'Placement'],
  hostel: ['Warden', 'HostelAdmin'],
  exam: ['ExamCell', 'ExamAdmin'],
  admin: ['CampusAdmin', 'SuperAdmin', 'Registrar'],
};

@Injectable()
export class AdminControlService {
  private userRolesHasTenantId: boolean | null = null;

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly notifications: FalconNotificationsService,
    private readonly campusScope: CampusScopeService,
    private readonly announcements: AnnouncementsService,
  ) {}

  private tid(tenantId?: string) {
    return tenantId ?? 'a0000000-0000-4000-8000-000000000001';
  }

  async writeAudit(
    tenantId: string,
    actorUserId: string | undefined,
    action: string,
    resourceType: string,
    resourceId?: string | null,
    details?: unknown,
  ) {
    try {
      await this.db.query(
        `INSERT INTO admin_control_audit
           (tenant_id, actor_user_id, action, resource_type, resource_id, details)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          this.tid(tenantId),
          actorUserId ?? null,
          action,
          resourceType,
          resourceId ?? null,
          JSON.stringify(details ?? {}),
        ],
      );
    } catch {
      // Audit table may not exist until migration runs; never block primary flow.
    }
  }

  async getDashboard(tenantId: string) {
    const tid = this.tid(tenantId);

    const [roleCounts] = await this.db.query(
      `SELECT
         COUNT(*) FILTER (WHERE lower(r.role_name) = 'student' AND u.is_active) AS students,
         COUNT(*) FILTER (WHERE lower(r.role_name) IN ('faculty','dean') AND u.is_active) AS faculty,
         COUNT(*) FILTER (WHERE lower(r.role_name) = 'hod' AND u.is_active) AS hods,
         COUNT(*) FILTER (WHERE u.is_active) AS active_users,
         COUNT(*) AS total_users
       FROM users u
       LEFT JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1`,
      [tid],
    );

    const [deptRow] = await this.db.query(
      `SELECT COUNT(*)::int AS c FROM departments WHERE deleted_at IS NULL`,
    );
    const [courseRow] = await this.db.query(
      `SELECT COUNT(*)::int AS c FROM academic_courses WHERE tenant_id = $1`,
      [tid],
    );
    let totalPrograms = 0;
    try {
      const [progRow] = await this.db.query(
        `SELECT COUNT(*)::int AS c FROM admin_programs WHERE tenant_id = $1 AND deleted_at IS NULL`,
        [tid],
      );
      totalPrograms = Number(progRow?.c ?? 0);
    } catch {
      totalPrograms = 0;
    }
    let unreadNotifications = 0;
    try {
      const [nRow] = await this.db.query(
        `SELECT COUNT(*)::int AS c FROM falcon_notifications
         WHERE tenant_id = $1 AND deleted_at IS NULL AND is_read = false`,
        [tid],
      );
      unreadNotifications = Number(nRow?.c ?? 0);
    } catch {
      unreadNotifications = 0;
    }
    let latestAnnouncements: unknown[] = [];
    try {
      latestAnnouncements = await this.db.query(
        `SELECT announcement_id, title, category, audience, created_at
         FROM admin_announcements
         WHERE tenant_id = $1 AND deleted_at IS NULL
         ORDER BY created_at DESC LIMIT 6`,
        [tid],
      );
    } catch {
      latestAnnouncements = [];
    }

    let todaysLogins = 0;
    try {
      const [loginRow] = await this.db.query(
        `SELECT COUNT(*)::int AS c
         FROM admin_control_audit
         WHERE tenant_id = $1
           AND action = 'LOGIN'
           AND created_at >= date_trunc('day', NOW())`,
        [tid],
      );
      todaysLogins = Number(loginRow?.c ?? 0);
    } catch {
      todaysLogins = 0;
    }

    let pendingRequests = 0;
    try {
      const [pending] = await this.db.query(
        `SELECT
           (SELECT COUNT(*) FROM student_onboarding_verifications v
              WHERE v.tenant_id = $1 AND v.status = 'PENDING') +
           (SELECT COUNT(*) FROM registrar_certificate_requests c
              WHERE c.tenant_id = $1 AND c.status IN ('PENDING','IN_REVIEW')) AS c`,
        [tid],
      );
      pendingRequests = Number(pending?.c ?? 0);
    } catch {
      try {
        const [pending] = await this.db.query(
          `SELECT COUNT(*)::int AS c FROM helpdesk_tickets
           WHERE tenant_id = $1 AND status IN ('PENDING','IN_PROGRESS')`,
          [tid],
        );
        pendingRequests = Number(pending?.c ?? 0);
      } catch {
        pendingRequests = 0;
      }
    }

    let openTickets = 0;
    try {
      const [tickets] = await this.db.query(
        `SELECT COUNT(*)::int AS c FROM helpdesk_tickets
         WHERE tenant_id = $1 AND status IN ('PENDING','IN_PROGRESS')`,
        [tid],
      );
      openTickets = Number(tickets?.c ?? 0);
    } catch {
      openTickets = 0;
    }

    const health = await this.getSystemHealth(tid);
    const recentActivities = await this.listAuditLogs(tid, {
      limit: 8,
      offset: 0,
    });

    let latestNotifications: unknown[] = [];
    try {
      latestNotifications = await this.db.query(
        `SELECT notification_id, title, message, severity, created_at, is_read, user_id
         FROM falcon_notifications
         WHERE tenant_id = $1 AND deleted_at IS NULL
         ORDER BY created_at DESC
         LIMIT 8`,
        [tid],
      );
    } catch {
      latestNotifications = [];
    }

    let calendar: unknown[] = [];
    try {
      calendar = await this.listCalendar(tid, 12);
    } catch {
      calendar = [];
    }

    const alerts: Array<{ level: string; message: string }> = [];
    if (health.database.status !== 'up') {
      alerts.push({
        level: 'critical',
        message: 'Database health check failed',
      });
    }
    if (health.memory.usagePercent > 90) {
      alerts.push({
        level: 'warning',
        message: `High memory usage (${health.memory.usagePercent}%)`,
      });
    }
    if (openTickets > 25) {
      alerts.push({
        level: 'warning',
        message: `${openTickets} open support tickets need attention`,
      });
    }
    if (pendingRequests > 0) {
      alerts.push({
        level: 'info',
        message: `${pendingRequests} pending administrative requests`,
      });
    }

    return {
      kpis: {
        totalStudents: Number(roleCounts?.students ?? 0),
        totalFaculty: Number(roleCounts?.faculty ?? 0),
        totalHods: Number(roleCounts?.hods ?? 0),
        totalDepartments: Number(deptRow?.c ?? 0),
        totalPrograms,
        totalCourses: Number(courseRow?.c ?? 0),
        activeUsers: Number(roleCounts?.active_users ?? 0),
        todaysLogins,
        pendingRequests,
        openSupportTickets: openTickets,
        unreadNotifications,
        systemHealth: health.overall,
        serverStatus: health.server.status,
        databaseStatus: health.database.status,
        storageGb: health.storage.totalGb ?? null,
      },
      recentActivities: recentActivities.items,
      latestNotifications,
      latestAnnouncements,
      systemAlerts: alerts,
      academicCalendar: calendar,
      workflow: [
        { step: 1, label: 'Review System Health', href: '/admin/monitoring' },
        {
          step: 2,
          label: 'Check Notifications',
          href: '/admin/notifications-center',
        },
        { step: 3, label: 'Pending Requests', href: '/admin/pending' },
        { step: 4, label: 'User Management', href: '/admin/users' },
        { step: 5, label: 'Academic Management', href: '/admin/academic-mgmt' },
        {
          step: 6,
          label: 'Faculty & Students',
          href: '/admin/faculty-students',
        },
        { step: 7, label: 'Timetable & Calendar', href: '/admin/calendar' },
        { step: 8, label: 'Communication', href: '/admin/communication' },
        { step: 9, label: 'Reports', href: '/admin/reports' },
        { step: 10, label: 'Support Tickets', href: '/admin/helpdesk' },
        { step: 11, label: 'Monitoring', href: '/admin/monitoring' },
        { step: 12, label: 'Backup & Security', href: '/admin/security' },
      ],
      quickActions: [
        { label: 'Manage Users', href: '/admin/users' },
        { label: 'Send Notification', href: '/admin/notifications-center' },
        { label: 'Academic Structure', href: '/admin/academic-mgmt' },
        { label: 'Communication Center', href: '/admin/communication' },
        { label: 'Run Backup', href: '/admin/backup' },
        { label: 'View Audit Logs', href: '/admin/audit-logs' },
        { label: 'System Monitoring', href: '/admin/monitoring' },
        { label: 'AI Assistant', href: '/admin/ai-assistant' },
      ],
      health,
    };
  }

  async listUsers(
    tenantId: string,
    opts: {
      q?: string;
      role?: string;
      status?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const tid = this.tid(tenantId);
    const page = Math.max(1, Number(opts.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(opts.limit ?? 20)));
    const offset = (page - 1) * limit;
    const params: unknown[] = [tid];
    const where: string[] = ['u.tenant_id = $1'];

    if (opts.q?.trim()) {
      params.push(`%${opts.q.trim().toLowerCase()}%`);
      where.push(
        `(lower(u.name) LIKE $${params.length} OR lower(u.official_email) LIKE $${params.length})`,
      );
    }

    if (opts.role?.trim()) {
      const key = opts.role.trim().toLowerCase();
      const mapped = MANAGED_ROLE_ALIASES[key];
      if (mapped) {
        params.push(mapped.map((r) => r.toLowerCase()));
        where.push(`lower(r.role_name) = ANY($${params.length}::text[])`);
      } else {
        params.push(key);
        where.push(`lower(r.role_name) = $${params.length}`);
      }
    }

    if (opts.status === 'active') where.push('u.is_active = true');
    if (opts.status === 'inactive' || opts.status === 'deactivated') {
      where.push(
        `u.is_active = false AND COALESCE(u.account_status,'DEACTIVATED') <> 'SUSPENDED'`,
      );
    }
    if (opts.status === 'suspended') {
      where.push(
        `(u.is_active = false AND COALESCE(u.account_status,'') = 'SUSPENDED')`,
      );
    }

    const whereSql = where.join(' AND ');
    const [countRow] = await this.db.query(
      `SELECT COUNT(*)::int AS c
       FROM users u
       LEFT JOIN roles r ON r.role_id = u.role_id
       WHERE ${whereSql}`,
      params,
    );

    params.push(limit, offset);
    const items = await this.db.query(
      `SELECT u.user_id, u.name, u.official_email AS email, u.is_active,
              u.dept_id, d.dept_name, r.role_name, u.onboarding_status,
              u.account_status, u.last_login_at,
              u.created_at, u.updated_at
       FROM users u
       LEFT JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       WHERE ${whereSql}
       ORDER BY u.updated_at DESC NULLS LAST, u.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return {
      items,
      page,
      limit,
      total: Number(countRow?.c ?? 0),
      totalPages: Math.max(1, Math.ceil(Number(countRow?.c ?? 0) / limit)),
    };
  }

  private async resolveRoleId(roleName: string): Promise<number> {
    const [role] = await this.db.query(
      `SELECT role_id, role_name FROM roles WHERE lower(role_name) = lower($1) LIMIT 1`,
      [roleName],
    );
    if (!role) throw new BadRequestException(`Unknown role: ${roleName}`);
    return Number(role.role_id);
  }

  private async syncPrimaryUserRole(
    executor: QueryExecutor,
    userId: string,
    nextRoleId: number,
    includeTenantId: boolean,
    tenantId?: string,
    previousRoleId?: number | null,
  ) {
    const oldRoleId = previousRoleId ?? null;

    await executor.query(
      `UPDATE user_roles
       SET is_primary = false
       WHERE user_id = $1 AND role_id <> $2`,
      [userId, nextRoleId],
    );

    if (oldRoleId && oldRoleId !== nextRoleId) {
      await executor.query(
        `DELETE FROM user_roles
         WHERE user_id = $1 AND role_id = $2`,
        [userId, oldRoleId],
      );
    }

    if (includeTenantId && tenantId) {
      await executor.query(
        `INSERT INTO user_roles (user_id, role_id, is_primary, tenant_id)
         VALUES ($1, $2, true, $3)
         ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary`,
        [userId, nextRoleId, tenantId],
      );
      return;
    }

    await executor.query(
      `INSERT INTO user_roles (user_id, role_id, is_primary)
       VALUES ($1, $2, true)
       ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary`,
      [userId, nextRoleId],
    );
  }

  private async detectUserRolesTenantIdColumn() {
    if (this.userRolesHasTenantId != null) return this.userRolesHasTenantId;
    try {
      const rows = await this.db.query(
        `SELECT EXISTS (
           SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'user_roles'
             AND column_name = 'tenant_id'
         ) AS has_tenant_id`,
      );
      this.userRolesHasTenantId = Boolean(rows[0]?.has_tenant_id);
    } catch {
      this.userRolesHasTenantId = false;
    }
    return this.userRolesHasTenantId;
  }

  async createUser(tenantId: string, actorId: string, dto: CreateAdminUserDto) {
    const tid = this.tid(tenantId);
    const email = dto.email.trim().toLowerCase();
    const [existing] = await this.db.query(
      `SELECT user_id FROM users WHERE tenant_id = $1 AND lower(official_email) = $2`,
      [tid, email],
    );
    if (existing) throw new BadRequestException('Email already exists');

    const roleId = await this.resolveRoleId(dto.role_name);
    const temp =
      dto.temporary_password?.trim() ||
      `Tmp-${randomBytes(4).toString('hex')}!A1`;
    const hash = await bcrypt.hash(temp, 10);

    const row = await this.db.transaction(async (manager) => {
      const [created] = await manager.query(
        `INSERT INTO users (
           tenant_id, name, official_email, role_id, dept_id,
           is_active, password_hash, onboarding_status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING_PASSWORD_RESET')
         RETURNING user_id, name, official_email AS email, role_id, dept_id, is_active`,
        [
          tid,
          dto.name.trim(),
          email,
          roleId,
          dto.dept_id ?? null,
          dto.is_active ?? true,
          hash,
        ],
      );
      await this.syncPrimaryUserRole(
        manager as QueryExecutor,
        String(created.user_id),
        roleId,
        await this.detectUserRolesTenantIdColumn(),
        tid,
      );
      return created;
    });

    await this.writeAudit(tid, actorId, 'CREATE', 'user', row.user_id, {
      email,
      role: dto.role_name,
    });

    return { ...row, temporary_password: temp };
  }

  async updateUser(
    tenantId: string,
    actorId: string,
    userId: string,
    dto: UpdateAdminUserDto,
  ) {
    const tid = this.tid(tenantId);
    const [existing] = await this.db.query(
      `SELECT u.user_id, u.role_id, r.role_name, u.official_email
       FROM users u
       LEFT JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND u.user_id = $2`,
      [tid, userId],
    );
    if (!existing) throw new NotFoundException('User not found');

    let roleId: number | null = null;
    if (dto.role_name) roleId = await this.resolveRoleId(dto.role_name);
    const previousRoleId = Number(existing.role_id ?? 0) || null;
    const previousRoleName =
      typeof existing.role_name === 'string' ? existing.role_name : null;
    const nextRoleId = roleId ?? previousRoleId;
    const roleChanged =
      nextRoleId != null && previousRoleId != null
        ? nextRoleId !== previousRoleId
        : dto.role_name != null;

    const row = await this.db.transaction(async (manager) => {
      const [updated] = await manager.query(
        `UPDATE users SET
           name = COALESCE($3, name),
           official_email = COALESCE($4, official_email),
           role_id = COALESCE($5, role_id),
           dept_id = CASE WHEN $6::boolean THEN $7 ELSE dept_id END,
           is_active = COALESCE($8, is_active),
           updated_at = NOW()
         WHERE tenant_id = $1 AND user_id = $2
         RETURNING user_id, name, official_email AS email, role_id, dept_id, is_active`,
        [
          tid,
          userId,
          dto.name?.trim() ?? null,
          dto.email?.trim().toLowerCase() ?? null,
          roleId,
          dto.dept_id !== undefined,
          dto.dept_id ?? null,
          dto.is_active ?? null,
        ],
      );

      if (nextRoleId != null) {
        await this.syncPrimaryUserRole(
          manager as QueryExecutor,
          userId,
          nextRoleId,
          await this.detectUserRolesTenantIdColumn(),
          tid,
          previousRoleId,
        );
      }

      return updated;
    });

    await this.writeAudit(tid, actorId, 'UPDATE', 'user', userId, dto);
    if (roleChanged && dto.role_name) {
      await this.writeAudit(tid, actorId, 'ASSIGN_ROLE', 'user', userId, {
        previous_role: previousRoleName,
        new_role: dto.role_name,
      });
    }
    return row;
  }

  async suspendUser(tenantId: string, actorId: string, userId: string) {
    const tid = this.tid(tenantId);
    await this.updateUser(tid, actorId, userId, { is_active: false });
    try {
      await this.db.query(
        `UPDATE users SET account_status = 'SUSPENDED', updated_at = NOW()
         WHERE tenant_id = $1 AND user_id = $2`,
        [tid, userId],
      );
    } catch {
      /* column may not exist yet */
    }
    await this.writeAudit(tid, actorId, 'SUSPEND', 'user', userId);
    return this.findUserRow(tid, userId);
  }

  async deactivateUser(tenantId: string, actorId: string, userId: string) {
    const tid = this.tid(tenantId);
    await this.updateUser(tid, actorId, userId, { is_active: false });
    try {
      await this.db.query(
        `UPDATE users SET account_status = 'DEACTIVATED', updated_at = NOW()
         WHERE tenant_id = $1 AND user_id = $2`,
        [tid, userId],
      );
    } catch {
      /* ignore */
    }
    await this.writeAudit(tid, actorId, 'DEACTIVATE', 'user', userId);
    return this.findUserRow(tid, userId);
  }

  async activateUser(tenantId: string, actorId: string, userId: string) {
    const tid = this.tid(tenantId);
    await this.updateUser(tid, actorId, userId, { is_active: true });
    try {
      await this.db.query(
        `UPDATE users SET account_status = 'ACTIVE', updated_at = NOW()
         WHERE tenant_id = $1 AND user_id = $2`,
        [tid, userId],
      );
    } catch {
      /* ignore */
    }
    await this.writeAudit(tid, actorId, 'ACTIVATE', 'user', userId);
    return this.findUserRow(tid, userId);
  }

  private async findUserRow(tenantId: string, userId: string) {
    const [row] = await this.db.query(
      `SELECT u.user_id, u.name, u.official_email AS email, u.is_active,
              u.dept_id, r.role_name, u.account_status, u.last_login_at
       FROM users u
       LEFT JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND u.user_id = $2`,
      [tenantId, userId],
    );
    return row;
  }

  async deleteUser(tenantId: string, actorId: string, userId: string) {
    // Soft-delete via suspend (zero-deletion policy)
    const row = await this.suspendUser(tenantId, actorId, userId);
    await this.writeAudit(tenantId, actorId, 'DELETE', 'user', userId, {
      soft: true,
    });
    return { ...row, deleted: true };
  }

  async resetPassword(
    tenantId: string,
    actorId: string,
    userId: string,
    dto: ResetPasswordDto,
  ) {
    const tid = this.tid(tenantId);
    const [existing] = await this.db.query(
      `SELECT user_id FROM users WHERE tenant_id = $1 AND user_id = $2`,
      [tid, userId],
    );
    if (!existing) throw new NotFoundException('User not found');

    const temp =
      dto.temporary_password?.trim() ||
      `Reset-${randomBytes(4).toString('hex')}!A1`;
    if (temp.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }
    const hash = await bcrypt.hash(temp, 10);
    await this.db.query(
      `UPDATE users
       SET password_hash = $1,
           onboarding_status = 'PENDING_PASSWORD_RESET',
           updated_at = NOW()
       WHERE tenant_id = $2 AND user_id = $3`,
      [hash, tid, userId],
    );
    await this.writeAudit(tid, actorId, 'RESET_PASSWORD', 'user', userId);
    return { user_id: userId, temporary_password: temp };
  }

  async exportUsers(tenantId: string, role?: string) {
    const result = await this.listUsers(tenantId, {
      role,
      page: 1,
      limit: 5000,
    });
    const header = [
      'user_id',
      'name',
      'email',
      'role_name',
      'dept_name',
      'is_active',
    ];
    const lines = [header.join(',')];
    for (const row of result.items as Array<Record<string, unknown>>) {
      lines.push(
        [
          row.user_id,
          JSON.stringify(row.name ?? ''),
          JSON.stringify(row.email ?? ''),
          JSON.stringify(row.role_name ?? ''),
          JSON.stringify(row.dept_name ?? ''),
          row.is_active ? 'true' : 'false',
        ].join(','),
      );
    }
    return {
      filename: `users-export-${new Date().toISOString().slice(0, 10)}.csv`,
      contentType: 'text/csv',
      body: lines.join('\n'),
    };
  }

  async importUsers(
    tenantId: string,
    actorId: string,
    dto: BulkImportUsersDto,
  ) {
    const created: unknown[] = [];
    const errors: Array<{ row: number; error: string }> = [];
    for (let i = 0; i < dto.rows.length; i += 1) {
      try {
        created.push(await this.createUser(tenantId, actorId, dto.rows[i]));
      } catch (err) {
        errors.push({
          row: i + 1,
          error: err instanceof Error ? err.message : 'Import failed',
        });
      }
    }
    await this.writeAudit(tenantId, actorId, 'BULK_IMPORT', 'user', null, {
      created: created.length,
      errors: errors.length,
    });
    return { created: created.length, errors, items: created };
  }

  async listRoles(tenantId: string) {
    const tid = this.tid(tenantId);
    const dbRoles = await this.db.query(
      `SELECT role_id, role_name FROM roles ORDER BY role_name`,
    );
    let overrides: Array<{ role_name: string; capabilities: unknown }> = [];
    try {
      overrides = await this.db.query(
        `SELECT role_name, capabilities FROM admin_role_permission_overrides WHERE tenant_id = $1`,
        [tid],
      );
    } catch {
      overrides = [];
    }
    const overrideMap = new Map(
      overrides.map((o) => [o.role_name.toLowerCase(), o.capabilities]),
    );

    const matrix = Object.entries(ROLE_PERMISSIONS).map(([role, caps]) => {
      const override = overrideMap.get(role.toLowerCase()) as
        | RolePermissionsDto
        | undefined;
      return {
        role,
        source: override ? 'override' : 'matrix',
        permissions: {
          create: override?.create ?? caps.edit,
          read: override?.read ?? caps.view,
          update: override?.update ?? caps.edit,
          delete: override?.delete ?? [],
          approve: override?.approve ?? caps.approve,
          export: override?.export ?? (caps.view.includes('*') ? ['*'] : []),
          import: override?.import ?? (caps.edit.includes('*') ? ['*'] : []),
          assign: override?.assign ?? caps.edit,
          manage: override?.manage ?? caps.edit,
          audit:
            override?.audit ??
            (caps.view.includes('audit_logs') || caps.view.includes('*')
              ? ['audit_logs']
              : []),
          view: override?.view ?? caps.view,
          edit: override?.edit ?? caps.edit,
        },
      };
    });

    return { roles: dbRoles, matrix };
  }

  async updateRolePermissions(
    tenantId: string,
    actorId: string,
    roleName: string,
    dto: RolePermissionsDto,
  ) {
    const tid = this.tid(tenantId);
    const [row] = await this.db.query(
      `INSERT INTO admin_role_permission_overrides
         (tenant_id, role_name, capabilities, updated_by)
       VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (tenant_id, role_name) DO UPDATE SET
         capabilities = EXCLUDED.capabilities,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()
       RETURNING *`,
      [tid, roleName, JSON.stringify(dto), actorId],
    );
    await this.writeAudit(
      tid,
      actorId,
      'UPDATE',
      'role_permissions',
      roleName,
      dto,
    );
    return row;
  }

  private async campusIdsForActor(
    actor: ScopedAuthUser,
  ): Promise<number[] | null> {
    return this.campusScope.resolveCampusIds(actor);
  }

  private async requireSchoolInScope(
    schoolId: number,
    campusIds: number[] | null,
  ): Promise<{ school_id: number; campus_id: number | null; school_name: string }> {
    if (!Number.isInteger(schoolId) || schoolId <= 0) {
      throw new BadRequestException('A valid school is required');
    }
    const [school] = await this.db.query(
      `SELECT school_id, campus_id, school_name
       FROM schools
       WHERE school_id = $1 AND deleted_at IS NULL`,
      [schoolId],
    );
    if (!school) {
      throw new BadRequestException('School not found');
    }
    if (!school.campus_id) {
      throw new BadRequestException(
        'School is not linked to a campus. Assign the school to a campus before creating a department.',
      );
    }
    if (campusIds !== null) {
      if (!campusIds.length) {
        throw new ForbiddenException(
          'No campus is assigned to this Campus Admin account',
        );
      }
      this.campusScope.assertRecordCampusAllowed(campusIds, school.campus_id);
    }
    return school;
  }

  private async assertDepartmentInScope(
    actor: ScopedAuthUser,
    deptId: number,
    includeInactive = false,
  ): Promise<{ dept_id: number; campus_id: number | null }> {
    const [row] = await this.db.query(
      `SELECT d.dept_id, s.campus_id
       FROM departments d
       LEFT JOIN schools s ON s.school_id = d.school_id
       WHERE d.dept_id = $1
         ${includeInactive ? '' : 'AND d.deleted_at IS NULL'}`,
      [deptId],
    );
    if (!row) throw new NotFoundException('Department not found');
    const campusIds = await this.campusIdsForActor(actor);
    if (campusIds !== null) {
      if (!campusIds.length) {
        throw new ForbiddenException(
          'No campus is assigned to this Campus Admin account',
        );
      }
      this.campusScope.assertRecordCampusAllowed(campusIds, row.campus_id);
    }
    return row;
  }

  private async assertHodEligible(
    tenantId: string,
    hodUserId: string,
  ): Promise<{ user_id: string; name: string; role_name: string }> {
    const tid = this.tid(tenantId);
    const [user] = await this.db.query(
      `SELECT u.user_id, u.name, r.role_name, u.is_active
       FROM users u
       LEFT JOIN roles r ON r.role_id = u.role_id
       WHERE u.user_id = $1 AND u.tenant_id = $2`,
      [hodUserId, tid],
    );
    if (!user) {
      throw new BadRequestException('Selected person was not found in this university');
    }
    if (user.is_active === false) {
      throw new BadRequestException('Selected person is inactive and cannot be assigned as HOD');
    }
    if (
      !(HOD_ELIGIBLE_ROLES as readonly string[]).includes(
        String(user.role_name ?? ''),
      )
    ) {
      throw new BadRequestException(
        'HOD can only be assigned from existing Faculty, HOD, or Dean records',
      );
    }
    return user;
  }

  private async syncHodHierarchy(
    tenantId: string,
    deptId: number,
    hodUserId: string | null,
  ) {
    const tid = this.tid(tenantId);
    if (hodUserId) {
      await this.db.query(
        `UPDATE users SET dept_id = $2, updated_at = NOW()
         WHERE user_id = $1 AND tenant_id = $3`,
        [hodUserId, deptId, tid],
      );
      await this.db.query(
        `UPDATE users u
         SET role_id = r.role_id, updated_at = NOW()
         FROM roles r
         WHERE u.user_id = $1
           AND u.tenant_id = $2
           AND r.role_name = 'HOD'`,
        [hodUserId, tid],
      );
      try {
        await this.db.query(
          `INSERT INTO hierarchy_assignments (tenant_id, user_id, assignment_type, entity_type, entity_id)
           VALUES ($1, $2, 'HOD', 'DEPARTMENT', $3)
           ON CONFLICT (tenant_id, user_id, assignment_type, entity_type, entity_id) DO NOTHING`,
          [tid, hodUserId, String(deptId)],
        );
      } catch {
        /* hierarchy_assignments is optional across schema variants */
      }
      return;
    }
    try {
      await this.db.query(
        `DELETE FROM hierarchy_assignments
         WHERE tenant_id = $1
           AND assignment_type = 'HOD'
           AND upper(entity_type) = 'DEPARTMENT'
           AND entity_id = $2`,
        [tid, String(deptId)],
      );
    } catch {
      /* optional */
    }
  }

  async listDepartmentLookups(actor: ScopedAuthUser) {
    const campusIds = await this.campusIdsForActor(actor);
    if (campusIds !== null && campusIds.length === 0) {
      return { campuses: [], schools: [] };
    }
    const campusParams: unknown[] = [];
    const campusFilter =
      campusIds === null ? '' : `AND campus_id = ANY($1::int[])`;
    if (campusIds !== null) campusParams.push(campusIds);

    const campuses = await this.db.query(
      `SELECT campus_id, campus_name, campus_code
       FROM campuses
       WHERE deleted_at IS NULL
         ${campusFilter}
       ORDER BY campus_name`,
      campusParams,
    );
    const schoolParams: unknown[] = [];
    const schoolFilter =
      campusIds === null ? '' : `AND s.campus_id = ANY($1::int[])`;
    if (campusIds !== null) schoolParams.push(campusIds);
    const schools = await this.db.query(
      `SELECT s.school_id, s.school_name, s.school_code, s.campus_id,
              c.campus_name
       FROM schools s
       LEFT JOIN campuses c ON c.campus_id = s.campus_id AND c.deleted_at IS NULL
       WHERE s.deleted_at IS NULL
         ${schoolFilter}
       ORDER BY s.school_name`,
      schoolParams,
    );
    return { campuses, schools };
  }

  async listDepartments(actor: ScopedAuthUser, filters: DepartmentListFilters = {}) {
    const campusIds = await this.campusIdsForActor(actor);
    if (campusIds !== null && campusIds.length === 0) {
      return [];
    }

    const params: unknown[] = [];
    const where: string[] = [];
    const status = filters.status ?? 'active';
    if (status === 'active') {
      where.push('d.deleted_at IS NULL');
    } else if (status === 'inactive') {
      where.push('d.deleted_at IS NOT NULL');
    }

    if (campusIds !== null) {
      params.push(campusIds);
      where.push(`s.campus_id = ANY($${params.length}::int[])`);
    }
    if (filters.campus_id != null) {
      params.push(filters.campus_id);
      where.push(`s.campus_id = $${params.length}`);
      if (campusIds !== null) {
        this.campusScope.assertRecordCampusAllowed(campusIds, filters.campus_id);
      }
    }
    if (filters.school_id != null) {
      params.push(filters.school_id);
      where.push(`d.school_id = $${params.length}`);
    }
    if (filters.q?.trim()) {
      params.push(`%${filters.q.trim().toLowerCase()}%`);
      where.push(`lower(d.dept_name) LIKE $${params.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return this.db.query(
      `SELECT d.dept_id, d.dept_name, d.description, d.school_id, d.hod_user_id,
              CASE WHEN d.deleted_at IS NULL THEN 'ACTIVE' ELSE 'INACTIVE' END AS status,
              s.school_name, s.school_code, s.campus_id,
              c.campus_name, c.campus_code,
              u.name AS hod_name, u.official_email AS hod_email, u.is_active AS hod_is_active,
              (SELECT COUNT(*)::int FROM iam_programs p
                WHERE p.dept_id = d.dept_id AND p.deleted_at IS NULL) AS program_count,
              (SELECT COUNT(*)::int FROM users x
                JOIN roles r ON r.role_id = x.role_id
                WHERE x.dept_id = d.dept_id
                  AND COALESCE(x.is_active, true)
                  AND lower(r.role_name) IN ('faculty', 'hod', 'dean')) AS faculty_count,
              (SELECT COUNT(*)::int FROM users x
                JOIN roles r ON r.role_id = x.role_id
                WHERE x.dept_id = d.dept_id
                  AND lower(r.role_name) = 'student') AS student_count
       FROM departments d
       LEFT JOIN schools s ON s.school_id = d.school_id
       LEFT JOIN campuses c ON c.campus_id = s.campus_id
       LEFT JOIN users u ON u.user_id = d.hod_user_id
       ${whereSql}
       ORDER BY d.dept_name`,
      params,
    );
  }

  async getDepartment(actor: DepartmentActor, tenantId: string, deptId: number) {
    if (!Number.isInteger(deptId) || deptId <= 0) {
      throw new BadRequestException('Invalid department id');
    }
    await this.assertDepartmentInScope(actor, deptId, true);
    const departmentSql = `SELECT d.dept_id, d.dept_name, d.description, d.school_id, d.hod_user_id,
              CASE WHEN d.deleted_at IS NULL THEN 'ACTIVE' ELSE 'INACTIVE' END AS status,
              s.school_name, s.school_code, s.campus_id,
              c.campus_name, c.campus_code,
              u.name AS hod_name, u.official_email AS hod_email, u.is_active AS hod_is_active
              __DEAN_COLS__
       FROM departments d
       LEFT JOIN schools s ON s.school_id = d.school_id
       LEFT JOIN campuses c ON c.campus_id = s.campus_id
       LEFT JOIN users u ON u.user_id = d.hod_user_id
       __DEAN_JOIN__
       WHERE d.dept_id = $1`;
    let department: Record<string, unknown> | undefined;
    try {
      const rows = await this.db.query(
        departmentSql
          .replace(
            '__DEAN_COLS__',
            `, dean.name AS dean_name, dean.official_email AS dean_email, dean.is_active AS dean_is_active`,
          )
          .replace(
            '__DEAN_JOIN__',
            'LEFT JOIN users dean ON dean.user_id = s.dean_user_id',
          ),
        [deptId],
      );
      department = rows[0];
    } catch {
      const rows = await this.db.query(
        departmentSql.replace('__DEAN_COLS__', '').replace('__DEAN_JOIN__', ''),
        [deptId],
      );
      department = rows[0];
    }
    if (!department) throw new NotFoundException('Department not found');

    const [counts] = await this.db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM iam_programs p
           WHERE p.dept_id = $1 AND p.deleted_at IS NULL) AS programs,
         (SELECT COUNT(*)::int FROM users x
           JOIN roles r ON r.role_id = x.role_id
           WHERE x.dept_id = $1
             AND COALESCE(x.is_active, true)
             AND lower(r.role_name) IN ('faculty', 'hod', 'dean')) AS faculty,
         (SELECT COUNT(*)::int FROM users x
           JOIN roles r ON r.role_id = x.role_id
           WHERE x.dept_id = $1 AND lower(r.role_name) = 'student') AS students,
         (SELECT COUNT(*)::int FROM users x
           JOIN roles r ON r.role_id = x.role_id
           WHERE x.dept_id = $1
             AND COALESCE(x.is_active, true)
             AND lower(r.role_name) = 'student') AS active_students`,
      [deptId],
    );

    const programs = await this.db
      .query(
        `SELECT program_id, program_name, program_code, duration_years,
                CASE WHEN deleted_at IS NULL THEN 'ACTIVE' ELSE 'INACTIVE' END AS status
         FROM iam_programs
         WHERE dept_id = $1 AND deleted_at IS NULL
         ORDER BY program_name
         LIMIT 8`,
        [deptId],
      )
      .catch(() => []);

    const faculty = await this.db
      .query(
        `SELECT u.user_id, u.name, u.official_email AS email, u.is_active,
                r.role_name, hep.designation
         FROM users u
         JOIN roles r ON r.role_id = u.role_id
         LEFT JOIN hr_employee_profiles hep
           ON hep.user_id = u.user_id AND hep.deleted_at IS NULL
         WHERE u.dept_id = $1
           AND lower(r.role_name) IN ('faculty', 'hod', 'dean')
         ORDER BY u.name
         LIMIT 8`,
        [deptId],
      )
      .catch(() =>
        this.db.query(
          `SELECT u.user_id, u.name, u.official_email AS email, u.is_active,
                  r.role_name, NULL AS designation
           FROM users u
           JOIN roles r ON r.role_id = u.role_id
           WHERE u.dept_id = $1
             AND lower(r.role_name) IN ('faculty', 'hod', 'dean')
           ORDER BY u.name
           LIMIT 8`,
          [deptId],
        ),
      );

    const tid = this.tid(tenantId);
    const courses = await this.db
      .query(
        `SELECT course_id, course_code, course_name, credits, is_elective
         FROM academic_courses
         WHERE tenant_id = $1 AND entity_id = $2 AND deleted_at IS NULL
         ORDER BY course_code
         LIMIT 8`,
        [tid, deptId],
      )
      .catch(() => []);

    const courseCount = await this.db
      .query(
        `SELECT COUNT(*)::int AS c
         FROM academic_courses
         WHERE tenant_id = $1 AND entity_id = $2 AND deleted_at IS NULL`,
        [tid, deptId],
      )
      .catch(() => [{ c: null }]);

    let activity: unknown[] = [];
    try {
      activity = await this.db.query(
        `SELECT a.audit_id, a.action, a.resource_type, a.resource_id, a.details,
                a.created_at, u.name AS actor_name
         FROM admin_control_audit a
         LEFT JOIN users u ON u.user_id = a.actor_user_id
         WHERE a.tenant_id = $1
           AND a.resource_id = $2
           AND a.resource_type IN ('department', 'hod')
         ORDER BY a.created_at DESC
         LIMIT 8`,
        [tid, String(deptId)],
      );
    } catch {
      activity = [];
    }

    return {
      department,
      counts: {
        programs: Number(counts?.programs ?? 0),
        faculty: Number(counts?.faculty ?? 0),
        students: Number(counts?.students ?? 0),
        active_students: Number(counts?.active_students ?? 0),
        courses: courseCount[0]?.c == null ? null : Number(courseCount[0].c),
      },
      programs,
      faculty,
      courses,
      activity,
    };
  }

  async listHodCandidates(
    actor: ScopedAuthUser,
    tenantId: string,
    q?: string,
  ) {
    const tid = this.tid(tenantId);
    const campusIds = await this.campusIdsForActor(actor);
    if (campusIds !== null && campusIds.length === 0) return [];

    const params: unknown[] = [tid];
    const where = [
      'u.tenant_id = $1',
      'u.is_active = true',
      `r.role_name IN ('Faculty', 'HOD', 'Dean')`,
    ];
    if (campusIds !== null) {
      params.push(campusIds);
      where.push(
        `(s.campus_id = ANY($${params.length}::int[]) OR s.campus_id IS NULL)`,
      );
    }
    if (q?.trim()) {
      params.push(`%${q.trim().toLowerCase()}%`);
      where.push(
        `(lower(u.name) LIKE $${params.length} OR lower(u.official_email) LIKE $${params.length})`,
      );
    }

    return this.db.query(
      `SELECT u.user_id, u.name, u.official_email AS email, r.role_name, d.dept_name
       FROM users u
       INNER JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id AND d.deleted_at IS NULL
       LEFT JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
       WHERE ${where.join(' AND ')}
       ORDER BY u.name
       LIMIT 50`,
      params,
    );
  }

  async createDepartment(
    tenantId: string,
    actor: DepartmentActor,
    dto: CreateDepartmentDto,
  ) {
    const campusIds = await this.campusIdsForActor(actor);
    const school = await this.requireSchoolInScope(dto.school_id, campusIds);
    if (dto.hod_user_id) {
      await this.assertHodEligible(tenantId, dto.hod_user_id);
    }
    const [row] = await this.db.query(
      `INSERT INTO departments (dept_name, description, school_id, hod_user_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        dto.dept_name.trim(),
        dto.description?.trim() || null,
        school.school_id,
        dto.hod_user_id ?? null,
      ],
    );
    if (dto.hod_user_id) {
      await this.syncHodHierarchy(tenantId, Number(row.dept_id), dto.hod_user_id);
    }
    await this.writeAudit(
      tenantId,
      actor.user_id,
      'CREATE',
      'department',
      String(row.dept_id),
      { ...dto, campus_id: school.campus_id },
    );
    return row;
  }

  async updateDepartment(
    tenantId: string,
    actor: DepartmentActor,
    deptId: number,
    dto: UpdateDepartmentDto,
  ) {
    await this.assertDepartmentInScope(actor, deptId);
    const campusIds = await this.campusIdsForActor(actor);
    if (dto.school_id != null) {
      await this.requireSchoolInScope(dto.school_id, campusIds);
    } else if (dto.school_id === null) {
      throw new BadRequestException(
        'Department must remain linked to a school in the academic hierarchy',
      );
    }
    if (dto.hod_user_id) {
      await this.assertHodEligible(tenantId, dto.hod_user_id);
    }
    const [row] = await this.db.query(
      `UPDATE departments SET
         dept_name = COALESCE($2, dept_name),
         description = CASE WHEN $3::boolean THEN $4 ELSE description END,
         school_id = CASE WHEN $5::boolean THEN $6 ELSE school_id END,
         hod_user_id = CASE WHEN $7::boolean THEN $8 ELSE hod_user_id END,
         updated_at = NOW()
       WHERE dept_id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [
        deptId,
        dto.dept_name?.trim() ?? null,
        dto.description !== undefined,
        dto.description ?? null,
        dto.school_id !== undefined,
        dto.school_id ?? null,
        dto.hod_user_id !== undefined,
        dto.hod_user_id ?? null,
      ],
    );
    if (!row) throw new NotFoundException('Department not found');
    if (dto.hod_user_id !== undefined) {
      await this.syncHodHierarchy(tenantId, deptId, dto.hod_user_id);
    }
    await this.writeAudit(
      tenantId,
      actor.user_id,
      'UPDATE',
      'department',
      String(deptId),
      dto,
    );
    return row;
  }

  async deleteDepartment(
    tenantId: string,
    actor: DepartmentActor,
    deptId: number,
  ) {
    await this.assertDepartmentInScope(actor, deptId);
    const [row] = await this.db.query(
      `UPDATE departments SET deleted_at = NOW(), updated_at = NOW()
       WHERE dept_id = $1 AND deleted_at IS NULL
       RETURNING dept_id, dept_name`,
      [deptId],
    );
    if (!row) throw new NotFoundException('Department not found');
    await this.writeAudit(
      tenantId,
      actor.user_id,
      'DEACTIVATE',
      'department',
      String(deptId),
    );
    return { deactivated: true, dept_id: deptId, dept_name: row.dept_name };
  }

  async restoreDepartment(
    tenantId: string,
    actor: DepartmentActor,
    deptId: number,
  ) {
    await this.assertDepartmentInScope(actor, deptId, true);
    const [row] = await this.db.query(
      `UPDATE departments SET deleted_at = NULL, updated_at = NOW()
       WHERE dept_id = $1 AND deleted_at IS NOT NULL
       RETURNING dept_id, dept_name`,
      [deptId],
    );
    if (!row) throw new NotFoundException('Department not found or already active');
    await this.writeAudit(
      tenantId,
      actor.user_id,
      'ACTIVATE',
      'department',
      String(deptId),
    );
    return { activated: true, dept_id: deptId, dept_name: row.dept_name };
  }

  async listStructure() {
    const schools = await this.db
      .query(
        `SELECT school_id, school_name FROM schools
       WHERE deleted_at IS NULL ORDER BY school_name`,
      )
      .catch(() => []);
    const programs = await this.db
      .query(
        `SELECT program_id, program_name, school_id, dept_id
       FROM iam_programs WHERE deleted_at IS NULL ORDER BY program_name`,
      )
      .catch(() =>
        this.db
          .query(
            `SELECT program_id, program_name FROM programs ORDER BY program_name`,
          )
          .catch(() => []),
      );
    const sections = await this.db
      .query(
        `SELECT section_id, section_name, program_id, semester
       FROM sections WHERE deleted_at IS NULL ORDER BY section_name`,
      )
      .catch(() => []);
    return { schools, programs, sections };
  }

  async listCourses(tenantId: string) {
    const tid = this.tid(tenantId);
    return this.db.query(
      `SELECT c.course_id, c.course_code, c.course_name, c.credits,
              c.is_elective, c.entity_id, c.min_attendance,
              a.faculty_user_id, u.name AS faculty_name, a.semester
       FROM academic_courses c
       LEFT JOIN LATERAL (
         SELECT faculty_user_id, semester
         FROM academic_course_allocations ca
         WHERE ca.course_id = c.course_id AND ca.tenant_id = c.tenant_id
         ORDER BY ca.created_at DESC NULLS LAST
         LIMIT 1
       ) a ON TRUE
       LEFT JOIN users u ON u.user_id = a.faculty_user_id
       WHERE c.tenant_id = $1
       ORDER BY c.course_code`,
      [tid],
    );
  }

  async createCourse(tenantId: string, actorId: string, dto: CreateCourseDto) {
    const tid = this.tid(tenantId);
    const [row] = await this.db.query(
      `INSERT INTO academic_courses
         (tenant_id, course_code, course_name, credits, is_elective, entity_id, min_attendance)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        tid,
        dto.course_code.trim().toUpperCase(),
        dto.course_name.trim(),
        dto.credits,
        dto.is_elective ?? false,
        dto.entity_id ?? dto.dept_id ?? null,
        dto.min_attendance ?? null,
      ],
    );

    if (dto.faculty_user_id) {
      await this.assignCourseFaculty(
        tid,
        row.course_id,
        dto.faculty_user_id,
        dto.semester,
      );
    }

    await this.writeAudit(tid, actorId, 'CREATE', 'course', row.course_id, dto);
    return row;
  }

  private async assignCourseFaculty(
    tenantId: string,
    courseId: string,
    facultyUserId: string,
    semester?: number | null,
  ) {
    try {
      await this.db.query(
        `INSERT INTO academic_course_allocations
           (tenant_id, subject_id, course_id, faculty_user_id, semester, academic_year, status)
         VALUES ($1, 0, $2, $3, $4, $5, 'ACTIVE')`,
        [
          tenantId,
          courseId,
          facultyUserId,
          semester != null ? String(semester) : null,
          `${new Date().getFullYear()}-${String(new Date().getFullYear() + 1).slice(-2)}`,
        ],
      );
    } catch {
      // Allocation insert is best-effort across schema variants
    }
  }

  async updateCourse(
    tenantId: string,
    actorId: string,
    courseId: string,
    dto: UpdateCourseDto,
  ) {
    const tid = this.tid(tenantId);
    const [row] = await this.db.query(
      `UPDATE academic_courses SET
         course_code = COALESCE($3, course_code),
         course_name = COALESCE($4, course_name),
         credits = COALESCE($5, credits),
         is_elective = COALESCE($6, is_elective),
         entity_id = CASE WHEN $7::boolean THEN $8 ELSE entity_id END,
         min_attendance = CASE WHEN $9::boolean THEN $10 ELSE min_attendance END
       WHERE tenant_id = $1 AND course_id = $2
       RETURNING *`,
      [
        tid,
        courseId,
        dto.course_code?.trim().toUpperCase() ?? null,
        dto.course_name?.trim() ?? null,
        dto.credits ?? null,
        dto.is_elective ?? null,
        dto.entity_id !== undefined,
        dto.entity_id ?? null,
        dto.min_attendance !== undefined,
        dto.min_attendance ?? null,
      ],
    );
    if (!row) throw new NotFoundException('Course not found');

    if (dto.faculty_user_id) {
      await this.assignCourseFaculty(
        tid,
        courseId,
        dto.faculty_user_id,
        dto.semester,
      );
    }

    await this.writeAudit(tid, actorId, 'UPDATE', 'course', courseId, dto);
    return row;
  }

  async deleteCourse(tenantId: string, actorId: string, courseId: string) {
    const tid = this.tid(tenantId);
    const result = await this.db.query(
      `DELETE FROM academic_courses WHERE tenant_id = $1 AND course_id = $2 RETURNING course_id`,
      [tid, courseId],
    );
    if (!result?.[0]) throw new NotFoundException('Course not found');
    await this.writeAudit(tid, actorId, 'DELETE', 'course', courseId);
    return { deleted: true, course_id: courseId };
  }

  async listCalendar(tenantId: string, limit = 50) {
    const tid = this.tid(tenantId);
    return this.db.query(
      `SELECT event_id, title, event_type, starts_on, ends_on, description, is_all_day
       FROM admin_academic_calendar_events
       WHERE tenant_id = $1 AND deleted_at IS NULL
       ORDER BY starts_on ASC
       LIMIT $2`,
      [tid, limit],
    );
  }

  async createCalendarEvent(
    tenantId: string,
    actorId: string,
    dto: CalendarEventDto,
  ) {
    const tid = this.tid(tenantId);
    const [row] = await this.db.query(
      `INSERT INTO admin_academic_calendar_events
         (tenant_id, title, event_type, starts_on, ends_on, description, is_all_day, created_by)
       VALUES ($1, $2, $3, $4::date, $5::date, $6, $7, $8)
       RETURNING *`,
      [
        tid,
        dto.title.trim(),
        dto.event_type,
        dto.starts_on,
        dto.ends_on ?? null,
        dto.description ?? null,
        dto.is_all_day ?? true,
        actorId,
      ],
    );
    await this.writeAudit(
      tid,
      actorId,
      'CREATE',
      'calendar_event',
      row.event_id,
    );
    return row;
  }

  async deleteCalendarEvent(
    tenantId: string,
    actorId: string,
    eventId: string,
  ) {
    const tid = this.tid(tenantId);
    const [row] = await this.db.query(
      `UPDATE admin_academic_calendar_events
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE tenant_id = $1 AND event_id = $2 AND deleted_at IS NULL
       RETURNING event_id`,
      [tid, eventId],
    );
    if (!row) throw new NotFoundException('Event not found');
    await this.writeAudit(tid, actorId, 'DELETE', 'calendar_event', eventId);
    return { deleted: true };
  }

  async broadcastNotification(
    tenantId: string,
    actorId: string,
    dto: BroadcastNotificationDto,
  ) {
    const tid = this.tid(tenantId);
    const params: unknown[] = [tid];
    let sql = `SELECT u.user_id FROM users u
               LEFT JOIN roles r ON r.role_id = u.role_id
               WHERE u.tenant_id = $1 AND u.is_active = true`;

    switch (dto.audience) {
      case 'students':
        sql += ` AND lower(r.role_name) = 'student'`;
        break;
      case 'faculty':
        sql += ` AND lower(r.role_name) IN ('faculty','hod','dean')`;
        break;
      case 'hod':
        sql += ` AND lower(r.role_name) = 'hod'`;
        break;
      case 'registrar':
        sql += ` AND lower(r.role_name) IN ('registrar','campusadmin','superadmin')`;
        break;
      case 'finance':
        sql += ` AND lower(r.role_name) IN ('accountant','finance')`;
        break;
      case 'library':
        sql += ` AND lower(r.role_name) = 'librarian'`;
        break;
      case 'placement':
        sql += ` AND lower(r.role_name) IN ('placementcell','placement')`;
        break;
      case 'hostel':
        sql += ` AND lower(r.role_name) IN ('warden','hosteladmin')`;
        break;
      case 'department':
        if (!dto.dept_id) {
          throw new BadRequestException(
            'dept_id required for department audience',
          );
        }
        params.push(dto.dept_id);
        sql += ` AND u.dept_id = $${params.length}`;
        break;
      case 'user':
        if (!dto.user_id) {
          throw new BadRequestException('user_id required for user audience');
        }
        params.push(dto.user_id);
        sql += ` AND u.user_id = $${params.length}`;
        break;
      case 'everyone':
      default:
        break;
    }

    const recipients = await this.db.query(sql, params);
    let sent = 0;
    for (const recipient of recipients as Array<{ user_id: string }>) {
      await this.notifications.create({
        tenantId: tid,
        userId: recipient.user_id,
        category: 'OPERATIONS',
        title: dto.title,
        message: dto.message,
        actionLink: dto.action_link,
        severity: dto.severity ?? 'info',
        intent: 'info',
        metadata: { audience: dto.audience, broadcast_by: actorId },
      });
      sent += 1;
    }

    await this.writeAudit(tid, actorId, 'BROADCAST', 'notification', null, {
      audience: dto.audience,
      sent,
    });
    return { sent, audience: dto.audience };
  }

  async listAuditLogs(
    tenantId: string,
    opts: { q?: string; action?: string; limit?: number; offset?: number },
  ) {
    const tid = this.tid(tenantId);
    const limit = Math.min(200, Math.max(1, Number(opts.limit ?? 50)));
    const offset = Math.max(0, Number(opts.offset ?? 0));
    const params: unknown[] = [tid];
    const where = ['a.tenant_id = $1'];

    if (opts.action?.trim()) {
      params.push(opts.action.trim().toUpperCase());
      where.push(`a.action = $${params.length}`);
    }
    if (opts.q?.trim()) {
      params.push(`%${opts.q.trim().toLowerCase()}%`);
      where.push(
        `(lower(a.resource_type) LIKE $${params.length} OR lower(COALESCE(u.name,'')) LIKE $${params.length})`,
      );
    }

    params.push(limit, offset);
    try {
      const items = await this.db.query(
        `SELECT a.audit_id, a.action, a.resource_type, a.resource_id, a.details,
                a.created_at, a.actor_user_id, u.name AS actor_name
         FROM admin_control_audit a
         LEFT JOIN users u ON u.user_id = a.actor_user_id
         WHERE ${where.join(' AND ')}
         ORDER BY a.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      return { items, limit, offset };
    } catch {
      const fallback = await this.db.query(
        `SELECT log_id AS audit_id, action, table_name AS resource_type,
                record_id AS resource_id, new_value AS details, changed_at AS created_at,
                changed_by_user_id AS actor_user_id, NULL AS actor_name
         FROM system_audit_logs
         ORDER BY changed_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset],
      );
      return { items: fallback, limit, offset };
    }
  }

  async getSystemHealth(tenantId: string) {
    const tid = this.tid(tenantId);
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const usagePercent = Math.round((usedMem / totalMem) * 100);
    const load = os.loadavg()?.[0] ?? 0;
    const cpus = os.cpus()?.length ?? 1;

    let dbStatus: 'up' | 'down' = 'up';
    let dbLatencyMs = 0;
    const started = Date.now();
    try {
      await this.db.query('SELECT 1');
      dbLatencyMs = Date.now() - started;
    } catch {
      dbStatus = 'down';
      dbLatencyMs = Date.now() - started;
    }

    let activeSessions = 0;
    try {
      const [row] = await this.db.query(
        `SELECT COUNT(*)::int AS c FROM users WHERE tenant_id = $1 AND is_active = true`,
        [tid],
      );
      activeSessions = Number(row?.c ?? 0);
    } catch {
      activeSessions = 0;
    }

    let storage: { freeGb?: number; totalGb?: number; status: string } = {
      status: 'unknown',
    };
    try {
      // Approximate via DB size when host disk APIs are unavailable
      const [sizeRow] = await this.db.query(
        `SELECT pg_database_size(current_database())::bigint AS bytes`,
      );
      const bytes = Number(sizeRow?.bytes ?? 0);
      storage = {
        status: 'ok',
        totalGb: Number((bytes / 1024 / 1024 / 1024).toFixed(2)),
        freeGb: undefined,
      };
    } catch {
      storage = { status: 'unknown' };
    }

    const serverStatus = dbStatus === 'up' ? 'online' : 'degraded';
    const overall =
      dbStatus === 'down'
        ? 'critical'
        : usagePercent > 90
          ? 'warning'
          : 'healthy';

    return {
      overall,
      server: { status: serverStatus, uptimeSeconds: Math.floor(os.uptime()) },
      cpu: {
        cores: cpus,
        load1m: Number(load.toFixed(2)),
        usageEstimatePercent: Math.min(100, Math.round((load / cpus) * 100)),
      },
      memory: {
        totalMb: Math.round(totalMem / 1024 / 1024),
        usedMb: Math.round(usedMem / 1024 / 1024),
        freeMb: Math.round(freeMem / 1024 / 1024),
        usagePercent,
      },
      storage,
      database: { status: dbStatus, latencyMs: dbLatencyMs },
      api: { status: 'up' as const },
      activeSessions,
    };
  }

  async runBackup(tenantId: string, actorId: string) {
    const tid = this.tid(tenantId);
    const [row] = await this.db.query(
      `INSERT INTO admin_backup_history
         (tenant_id, status, backup_type, storage_path, size_bytes, checksum, notes, triggered_by, completed_at)
       VALUES ($1, 'COMPLETED', 'FULL', $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [
        tid,
        `backups/${tid}/${Date.now()}.snapshot.json`,
        0,
        randomBytes(16).toString('hex'),
        'Logical metadata snapshot recorded. Wire to pg_dump in production ops.',
        actorId,
      ],
    );

    // Capture lightweight metadata snapshot for download
    const [counts] = await this.db.query(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE tenant_id = $1) AS users,
         (SELECT COUNT(*) FROM academic_courses WHERE tenant_id = $1) AS courses,
         (SELECT COUNT(*) FROM departments WHERE deleted_at IS NULL) AS departments`,
      [tid],
    );

    await this.db.query(
      `UPDATE admin_backup_history
       SET size_bytes = $2, notes = $3
       WHERE backup_id = $1`,
      [
        row.backup_id,
        Buffer.byteLength(JSON.stringify(counts)),
        JSON.stringify({
          summary: counts,
          captured_at: new Date().toISOString(),
        }),
      ],
    );

    await this.writeAudit(tid, actorId, 'BACKUP', 'system', row.backup_id);
    const [fresh] = await this.db.query(
      `SELECT * FROM admin_backup_history WHERE backup_id = $1`,
      [row.backup_id],
    );
    return fresh;
  }

  async listBackups(tenantId: string) {
    return this.db.query(
      `SELECT b.*, u.name AS triggered_by_name
       FROM admin_backup_history b
       LEFT JOIN users u ON u.user_id = b.triggered_by
       WHERE b.tenant_id = $1
       ORDER BY b.started_at DESC
       LIMIT 100`,
      [this.tid(tenantId)],
    );
  }

  async downloadBackup(tenantId: string, backupId: string) {
    const [row] = await this.db.query(
      `SELECT * FROM admin_backup_history WHERE tenant_id = $1 AND backup_id = $2`,
      [this.tid(tenantId), backupId],
    );
    if (!row) throw new NotFoundException('Backup not found');
    return {
      filename: `falcon-backup-${backupId}.json`,
      contentType: 'application/json',
      body: JSON.stringify(row, null, 2),
    };
  }

  async restoreBackup(tenantId: string, actorId: string, backupId: string) {
    const [row] = await this.db.query(
      `SELECT backup_id, status FROM admin_backup_history
       WHERE tenant_id = $1 AND backup_id = $2`,
      [this.tid(tenantId), backupId],
    );
    if (!row) throw new NotFoundException('Backup not found');
    await this.writeAudit(tenantId, actorId, 'RESTORE', 'system', backupId, {
      note: 'Restore acknowledged — execute via ops runbook in production',
    });
    return {
      accepted: true,
      backup_id: backupId,
      message:
        'Restore request logged. Production restore requires DBA runbook execution.',
    };
  }

  async getSettings(tenantId: string) {
    const tid = this.tid(tenantId);
    const [row] = await this.db.query(
      `SELECT * FROM admin_system_settings WHERE tenant_id = $1`,
      [tid],
    );
    if (row) return row;
    const [created] = await this.db.query(
      `INSERT INTO admin_system_settings (tenant_id)
       VALUES ($1)
       ON CONFLICT (tenant_id) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [tid],
    );
    return created;
  }

  async updateSettings(
    tenantId: string,
    actorId: string,
    dto: SystemSettingsDto,
  ) {
    const tid = this.tid(tenantId);
    await this.getSettings(tid);
    const [row] = await this.db.query(
      `UPDATE admin_system_settings SET
         university_name = COALESCE($2, university_name),
         university_code = COALESCE($3, university_code),
         branding = COALESCE($4::jsonb, branding),
         email_config = COALESCE($5::jsonb, email_config),
         sms_config = COALESCE($6::jsonb, sms_config),
         theme = COALESCE($7::jsonb, theme),
         password_policy = COALESCE($8::jsonb, password_policy),
         security_settings = COALESCE($9::jsonb, security_settings),
         updated_by = $10,
         updated_at = NOW()
       WHERE tenant_id = $1
       RETURNING *`,
      [
        tid,
        dto.university_name ?? null,
        dto.university_code ?? null,
        dto.branding ? JSON.stringify(dto.branding) : null,
        dto.email_config ? JSON.stringify(dto.email_config) : null,
        dto.sms_config ? JSON.stringify(dto.sms_config) : null,
        dto.theme ? JSON.stringify(dto.theme) : null,
        dto.password_policy ? JSON.stringify(dto.password_policy) : null,
        dto.security_settings ? JSON.stringify(dto.security_settings) : null,
        actorId,
      ],
    );
    await this.writeAudit(tid, actorId, 'UPDATE', 'settings', tid, dto);
    return row;
  }

  async aiAssist(tenantId: string, actorId: string, dto: AiAssistDto) {
    const tid = this.tid(tenantId);
    const intent = dto.intent ?? 'crm_qa';
    const dash = await this.getDashboard(tid);
    let answer = '';

    switch (intent) {
      case 'generate_report':
        answer = `Report draft — Students: ${dash.kpis.totalStudents}, Faculty: ${dash.kpis.totalFaculty}, Courses: ${dash.kpis.totalCourses}, Pending: ${dash.kpis.pendingRequests}, Open tickets: ${dash.kpis.openSupportTickets}. Export from Reports for PDF/Excel/CSV.`;
        break;
      case 'analyze_usage':
        answer = `Usage — Active users ${dash.kpis.activeUsers}, today's logins ${dash.kpis.todaysLogins}, system health ${dash.kpis.systemHealth}, server ${dash.kpis.serverStatus}.`;
        break;
      case 'detect_inactive': {
        const inactive = await this.db.query(
          `SELECT u.user_id, u.name, u.official_email AS email, r.role_name
           FROM users u
           LEFT JOIN roles r ON r.role_id = u.role_id
           WHERE u.tenant_id = $1 AND u.is_active = false
           ORDER BY u.updated_at DESC NULLS LAST
           LIMIT 20`,
          [tid],
        );
        answer = `Found ${inactive.length} inactive/suspended users (showing up to 20). Review User Management to reactivate.`;
        await this.writeAudit(tid, actorId, 'AI', 'inactive_users', null, {
          count: inactive.length,
        });
        return { intent, answer, data: inactive };
      }
      case 'generate_announcement':
        answer = `Suggested announcement:\nTitle: Important University Update\nBody: ${dto.prompt}\nAudience: Everyone\nUse Announcement Center or Notification Center to publish.`;
        break;
      case 'summarize_logs': {
        const logs = dash.recentActivities as Array<Record<string, unknown>>;
        const byAction: Record<string, number> = {};
        for (const log of logs) {
          const key = typeof log.action === 'string' ? log.action : 'UNKNOWN';
          byAction[key] = (byAction[key] ?? 0) + 1;
        }
        answer = `Recent audit summary: ${
          Object.entries(byAction)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ') || 'No recent control-center audit events'
        }.`;
        break;
      }
      case 'security_risks': {
        const risks: string[] = [];
        if (dash.kpis.systemHealth !== 'healthy')
          risks.push('System health is not healthy');
        const inactive = await this.db.query(
          `SELECT COUNT(*)::int AS c FROM users WHERE tenant_id = $1 AND is_active = false`,
          [tid],
        );
        if (Number(inactive[0]?.c ?? 0) > 0) {
          risks.push(`${inactive[0].c} inactive accounts still in directory`);
        }
        answer = risks.length
          ? `Security review: ${risks.join('; ')}.`
          : 'No immediate security risks detected from live KPIs. Continue monitoring audit logs and password policy.';
        return { intent, answer, data: { risks, kpis: dash.kpis } };
      }
      case 'suggest_improvements':
        answer = `Suggested improvements:\n1. Clear ${dash.kpis.pendingRequests} pending requests.\n2. Resolve ${dash.kpis.openSupportTickets} open tickets.\n3. Review inactive users weekly.\n4. Run a backup before major academic year changes.\n5. Keep password policy and session timeout aligned with university security standards.`;
        break;
      default:
        answer = `Falcon CRM Assistant: ${dto.prompt}\n\nCurrent snapshot — ${dash.kpis.totalStudents} students, ${dash.kpis.totalFaculty} faculty, ${dash.kpis.totalDepartments} departments, ${dash.kpis.openSupportTickets} open tickets, health ${dash.kpis.systemHealth}. Ask me to generate reports, detect inactive users, or draft announcements.`;
    }

    await this.writeAudit(tid, actorId, 'AI', 'assistant', null, { intent });
    return { intent, answer, data: dash.kpis };
  }

  async reportSummary(tenantId: string) {
    const dash = await this.getDashboard(tenantId);
    return {
      attendance: { status: 'ready', note: 'Use Academics attendance exports' },
      admissions: { status: 'ready', pending: dash.kpis.pendingRequests },
      fees: { status: 'ready', note: 'Finance desk exports available' },
      faculty: { total: dash.kpis.totalFaculty },
      students: { total: dash.kpis.totalStudents },
      results: { status: 'ready', note: 'Exam Cell result control' },
      placements: { status: 'ready', note: 'IQAC / Placement Cell' },
      library: { status: 'ready', note: 'Library portal metrics' },
      hostel: { status: 'ready', note: 'Hostel admin occupancy metrics' },
      department: { total: dash.kpis.totalDepartments },
      course: { total: dash.kpis.totalCourses },
      kpis: dash.kpis,
    };
  }

  async exportReport(tenantId: string, dto: ReportExportDto) {
    const summary = await this.reportSummary(tenantId);
    const payload = {
      report: dto.report,
      format: dto.format,
      generated_at: new Date().toISOString(),
      summary: (summary as Record<string, unknown>)[dto.report] ?? summary.kpis,
      kpis: summary.kpis,
    };

    if (dto.format === 'csv') {
      const rows = Object.entries(summary.kpis).map(
        ([k, v]) => `${k},${JSON.stringify(v)}`,
      );
      return {
        filename: `${dto.report}-${Date.now()}.csv`,
        contentType: 'text/csv',
        body: ['metric,value', ...rows].join('\n'),
      };
    }

    return {
      filename: `${dto.report}-${Date.now()}.${dto.format === 'excel' ? 'json' : 'json'}`,
      contentType: 'application/json',
      body: JSON.stringify(payload, null, 2),
      note:
        dto.format === 'pdf'
          ? 'PDF binary rendering is queued via reports service; JSON payload returned for client-side print/PDF.'
          : 'Excel-compatible JSON/CSV export.',
    };
  }

  async listHelpdeskTickets(tenantId: string) {
    try {
      return await this.db.query(
        `SELECT ticket_id, category, status, subject, assigned_to_user_id,
                created_at, updated_at, student_user_id
         FROM helpdesk_tickets
         WHERE tenant_id = $1 AND deleted_at IS NULL
         ORDER BY updated_at DESC NULLS LAST
         LIMIT 100`,
        [this.tid(tenantId)],
      );
    } catch {
      return [];
    }
  }

  async updateTicketStatus(
    tenantId: string,
    actorId: string,
    ticketId: string,
    status: string,
    assignedTo?: string,
  ) {
    const allowed = ['PENDING', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'];
    if (!allowed.includes(status.toUpperCase())) {
      throw new BadRequestException(
        `Invalid status. Allowed: ${allowed.join(', ')}`,
      );
    }
    const [row] = await this.db.query(
      `UPDATE helpdesk_tickets SET
         status = $3,
         assigned_to_user_id = COALESCE($4, assigned_to_user_id),
         updated_at = NOW()
       WHERE tenant_id = $1 AND ticket_id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [this.tid(tenantId), ticketId, status.toUpperCase(), assignedTo ?? null],
    );
    if (!row) throw new NotFoundException('Ticket not found');
    await this.writeAudit(
      tenantId,
      actorId,
      'UPDATE',
      'helpdesk_ticket',
      ticketId,
      {
        status,
        assignedTo,
      },
    );
    return row;
  }

  async assignHod(
    tenantId: string,
    actor: DepartmentActor,
    dto: AssignHodDto,
  ) {
    await this.assertDepartmentInScope(actor, dto.dept_id);
    await this.assertHodEligible(tenantId, dto.hod_user_id);
    const [dept] = await this.db.query(
      `UPDATE departments SET hod_user_id = $2, updated_at = NOW()
       WHERE dept_id = $1 AND deleted_at IS NULL
       RETURNING dept_id, dept_name, hod_user_id`,
      [dto.dept_id, dto.hod_user_id],
    );
    if (!dept) throw new NotFoundException('Department not found');
    await this.syncHodHierarchy(tenantId, dto.dept_id, dto.hod_user_id);
    await this.writeAudit(
      tenantId,
      actor.user_id,
      'ASSIGN',
      'hod',
      String(dto.dept_id),
      dto,
    );
    return dept;
  }

  async removeHod(tenantId: string, actor: DepartmentActor, deptId: number) {
    await this.assertDepartmentInScope(actor, deptId);
    const [dept] = await this.db.query(
      `UPDATE departments SET hod_user_id = NULL, updated_at = NOW()
       WHERE dept_id = $1 AND deleted_at IS NULL
       RETURNING dept_id, dept_name`,
      [deptId],
    );
    if (!dept) throw new NotFoundException('Department not found');
    await this.syncHodHierarchy(tenantId, deptId, null);
    await this.writeAudit(tenantId, actor.user_id, 'UNASSIGN', 'hod', String(deptId));
    return dept;
  }

  async listAcademicCatalog(tenantId: string) {
    const tid = this.tid(tenantId);
    const [years, programs, semesters, sections, batches, subjects, schools] =
      await Promise.all([
        this.db
          .query(
            `SELECT * FROM admin_academic_years WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY year_label DESC`,
            [tid],
          )
          .catch(() => []),
        this.db
          .query(
            `SELECT * FROM admin_programs WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY program_name`,
            [tid],
          )
          .catch(() => []),
        this.db
          .query(
            `SELECT * FROM admin_semesters WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY semester_no`,
            [tid],
          )
          .catch(() => []),
        this.db
          .query(
            `SELECT * FROM admin_sections WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY section_name`,
            [tid],
          )
          .catch(() => []),
        this.db
          .query(
            `SELECT * FROM admin_batches WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY batch_label DESC`,
            [tid],
          )
          .catch(() => []),
        this.db
          .query(
            `SELECT * FROM admin_subjects WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY subject_code`,
            [tid],
          )
          .catch(() => []),
        this.db
          .query(
            `SELECT school_id, school_name FROM schools WHERE deleted_at IS NULL ORDER BY school_name`,
          )
          .catch(() => []),
      ]);
    return { years, programs, semesters, sections, batches, subjects, schools };
  }

  async createAcademicItem(
    tenantId: string,
    actorId: string,
    kind: string,
    dto: NamedEntityDto,
  ) {
    const tid = this.tid(tenantId);
    const tableMap: Record<string, string> = {
      year: `INSERT INTO admin_academic_years (tenant_id, year_label, created_by, updated_by)
             VALUES ($1,$2,$3,$3) RETURNING *`,
      program: `INSERT INTO admin_programs (tenant_id, program_name, program_code, school_id, dept_id, created_by, updated_by)
                VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING *`,
      semester: `INSERT INTO admin_semesters (tenant_id, semester_name, semester_no, created_by, updated_by)
                 VALUES ($1,$2,$3,$4,$4) RETURNING *`,
      section: `INSERT INTO admin_sections (tenant_id, section_name, batch_label, created_by, updated_by)
                VALUES ($1,$2,$3,$4,$4) RETURNING *`,
      batch: `INSERT INTO admin_batches (tenant_id, batch_label, created_by, updated_by)
              VALUES ($1,$2,$3,$3) RETURNING *`,
      subject: `INSERT INTO admin_subjects (tenant_id, subject_code, subject_name, credits, dept_id, created_by, updated_by)
                VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING *`,
    };
    const sql = tableMap[kind];
    if (!sql) throw new BadRequestException('Unknown academic entity');
    const params =
      kind === 'year' || kind === 'batch'
        ? [tid, dto.name, actorId]
        : kind === 'program'
          ? [
              tid,
              dto.name,
              dto.code ?? null,
              dto.school_id ?? null,
              dto.dept_id ?? null,
              actorId,
            ]
          : kind === 'semester'
            ? [tid, dto.name, dto.credits ?? null, actorId]
            : kind === 'section'
              ? [tid, dto.name, dto.extra ?? null, actorId]
              : [
                  tid,
                  dto.code ?? dto.name,
                  dto.name,
                  dto.credits ?? 0,
                  dto.dept_id ?? null,
                  actorId,
                ];
    const [row] = await this.db.query(sql, params);
    await this.writeAudit(
      tid,
      actorId,
      'CREATE',
      `academic_${kind}`,
      row?.year_id ?? row?.program_id ?? row?.subject_id,
      dto,
    );
    return row;
  }

  async deleteAcademicItem(
    tenantId: string,
    actorId: string,
    kind: string,
    id: string,
  ) {
    const tid = this.tid(tenantId);
    const table: Record<string, [string, string]> = {
      year: ['admin_academic_years', 'year_id'],
      program: ['admin_programs', 'program_id'],
      semester: ['admin_semesters', 'semester_id'],
      section: ['admin_sections', 'section_id'],
      batch: ['admin_batches', 'batch_id'],
      subject: ['admin_subjects', 'subject_id'],
    };
    const spec = table[kind];
    if (!spec) throw new BadRequestException('Unknown academic entity');
    const [row] = await this.db.query(
      `UPDATE ${spec[0]} SET deleted_at = NOW(), updated_by = $3, updated_at = NOW()
       WHERE tenant_id = $1 AND ${spec[1]} = $2 AND deleted_at IS NULL
       RETURNING ${spec[1]}`,
      [tid, id, actorId],
    );
    if (!row) throw new NotFoundException('Record not found');
    await this.writeAudit(tid, actorId, 'DELETE', `academic_${kind}`, id);
    return { deleted: true };
  }

  async promoteStudent(
    tenantId: string,
    actorId: string,
    dto: PromoteStudentDto,
  ) {
    const tid = this.tid(tenantId);
    try {
      await this.db.query(
        `UPDATE student_profiles SET
           current_semester = COALESCE($3, current_semester + 1),
           batch = COALESCE($4, batch),
           updated_at = NOW()
         WHERE user_id = $2 AND tenant_id = $1`,
        [
          tid,
          dto.student_user_id,
          dto.to_semester ?? null,
          dto.to_batch ?? null,
        ],
      );
    } catch {
      throw new BadRequestException('Student profile update failed');
    }
    await this.writeAudit(
      tid,
      actorId,
      'PROMOTE',
      'student',
      dto.student_user_id,
      dto,
    );
    return { promoted: true, student_user_id: dto.student_user_id };
  }

  async listAnnouncements(tenantId: string) {
    return this.announcements.listForAdmin(this.tid(tenantId));
  }

  async createAnnouncement(
    tenantId: string,
    actorId: string,
    dto: AnnouncementDto,
  ) {
    const tid = this.tid(tenantId);
    const audience = dto.audience.toLowerCase();
    const campusRow = await this.announcements.create(
      tid,
      actorId,
      {
        title: dto.title,
        body_html: `<p>${dto.body.replace(/\n/g, '</p><p>')}</p>`,
        target_all_students:
          audience === 'everyone' || audience === 'students',
        target_all_faculty:
          audience === 'everyone' ||
          audience === 'faculty' ||
          audience === 'hod' ||
          audience === 'registrar',
      },
    );

    await this.broadcastNotification(tid, actorId, {
      title:
        dto.category === 'EMERGENCY' ? `EMERGENCY: ${dto.title}` : dto.title,
      message: dto.body,
      audience:
        audience === 'faculty' || audience === 'hod' || audience === 'registrar'
          ? 'faculty'
          : audience,
      severity: dto.category === 'EMERGENCY' ? 'critical' : 'info',
    });
    await this.writeAudit(
      tid,
      actorId,
      'CREATE',
      'announcement',
      String(campusRow.announcement_id),
      {
        category: dto.category,
        audience: dto.audience,
      },
    );
    return campusRow;
  }

  async listFeeStructures(tenantId: string) {
    return this.db.query(
      `SELECT * FROM admin_fee_structures
       WHERE tenant_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [this.tid(tenantId)],
    );
  }

  async createFeeStructure(
    tenantId: string,
    actorId: string,
    dto: FeeStructureDto,
  ) {
    const [row] = await this.db.query(
      `INSERT INTO admin_fee_structures
         (tenant_id, fee_type, academic_year, amount, due_on, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$6)
       RETURNING *`,
      [
        this.tid(tenantId),
        dto.fee_type,
        dto.academic_year ?? null,
        dto.amount ?? '0',
        dto.due_on ?? null,
        actorId,
      ],
    );
    await this.writeAudit(
      tenantId,
      actorId,
      'CREATE',
      'fee_structure',
      row.fee_id,
      dto,
    );
    return row;
  }

  async listPortalAccess(tenantId: string) {
    return this.db.query(
      `SELECT * FROM admin_portal_access WHERE tenant_id = $1 ORDER BY portal_key`,
      [this.tid(tenantId)],
    );
  }

  async updatePortalAccess(
    tenantId: string,
    actorId: string,
    dto: PortalAccessDto,
  ) {
    const [row] = await this.db.query(
      `INSERT INTO admin_portal_access (tenant_id, portal_key, is_enabled, updated_by)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (tenant_id, portal_key) DO UPDATE SET
         is_enabled = EXCLUDED.is_enabled,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()
       RETURNING *`,
      [this.tid(tenantId), dto.portal_key, dto.is_enabled, actorId],
    );
    await this.writeAudit(
      tenantId,
      actorId,
      'UPDATE',
      'portal_access',
      dto.portal_key,
      dto,
    );
    return row;
  }

  async listLoginHistory(tenantId: string, limit = 100) {
    return this.db.query(
      `SELECT h.*, u.name AS user_name
       FROM admin_login_history h
       LEFT JOIN users u ON u.user_id = h.user_id
       WHERE h.tenant_id = $1
       ORDER BY h.created_at DESC
       LIMIT $2`,
      [this.tid(tenantId), Math.min(200, Math.max(1, limit))],
    );
  }

  async listErrorLogs(tenantId: string, limit = 100) {
    return this.db.query(
      `SELECT * FROM admin_error_logs
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [this.tid(tenantId), Math.min(200, Math.max(1, limit))],
    );
  }

  async timetableConflicts(tenantId: string) {
    try {
      return await this.db.query(
        `SELECT a.slot_id, a.faculty_user_id, a.room_code, a.day_of_week, a.start_time, a.end_time,
                b.slot_id AS conflicting_slot_id
         FROM admin_timetable_slots a
         JOIN admin_timetable_slots b
           ON a.tenant_id = b.tenant_id
          AND a.slot_id <> b.slot_id
          AND a.day_of_week = b.day_of_week
          AND a.start_time < b.end_time AND a.end_time > b.start_time
          AND (
            a.faculty_user_id = b.faculty_user_id
            OR (a.room_code IS NOT NULL AND a.room_code = b.room_code)
          )
         WHERE a.tenant_id = $1
         LIMIT 50`,
        [this.tid(tenantId)],
      );
    } catch {
      return [];
    }
  }

  async pendingQueue(tenantId: string) {
    const tid = this.tid(tenantId);
    const [verifications, tickets, certificates] = await Promise.all([
      this.db
        .query(
          `SELECT user_id AS id, name, official_email AS email, 'verification' AS kind, submitted_at AS created_at
           FROM student_onboarding_verifications v
           JOIN users u ON u.user_id = v.user_id
           WHERE v.tenant_id = $1 AND v.status = 'PENDING'
           LIMIT 20`,
          [tid],
        )
        .catch(() => []),
      this.db
        .query(
          `SELECT ticket_id AS id, subject AS name, category AS email, 'ticket' AS kind, created_at
           FROM helpdesk_tickets
           WHERE tenant_id = $1 AND status IN ('PENDING','IN_PROGRESS') AND deleted_at IS NULL
           LIMIT 20`,
          [tid],
        )
        .catch(() => []),
      this.db
        .query(
          `SELECT request_id AS id, document_type AS name, status AS email, 'certificate' AS kind, created_at
           FROM registrar_certificate_requests
           WHERE tenant_id = $1 AND status IN ('PENDING','IN_REVIEW')
           LIMIT 20`,
          [tid],
        )
        .catch(() => []),
    ]);
    return { verifications, tickets, certificates };
  }
}
