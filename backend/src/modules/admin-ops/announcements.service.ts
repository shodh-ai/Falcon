import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  CampusScopeService,
  type ScopedAuthUser,
} from '../../common/campus-scope/campus-scope.service';
import { FalconNotificationsService } from '../../core/notifications/falcon-notifications.service';

export type AnnouncementAudience =
  | 'all'
  | 'students'
  | 'faculty'
  | 'hods'
  | 'staff';

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly campusScope: CampusScopeService,
    private readonly notifications: FalconNotificationsService,
  ) {}

  async listForAdmin(tenantId: string, actor?: ScopedAuthUser) {
    const campusIds = actor
      ? await this.campusScope.resolveCampusIds(actor)
      : null;
    if (campusIds && !campusIds.length) return [];
    if (!campusIds) {
      return this.dataSource.query(
        `SELECT a.*, u.name AS created_by_name
         FROM campus_announcements a
         LEFT JOIN users u ON u.user_id = a.created_by_user_id
         WHERE a.tenant_id = $1
         ORDER BY a.published_at DESC`,
        [tenantId],
      );
    }

    const deptIds = await this.campusScope.departmentIdsForCampuses(campusIds);
    return this.dataSource.query(
      `SELECT a.*, u.name AS created_by_name
       FROM campus_announcements a
       LEFT JOIN users u ON u.user_id = a.created_by_user_id
       WHERE a.tenant_id = $1
         AND (
           a.target_all_students = true
           OR a.target_all_faculty = true
           OR (
             COALESCE(cardinality(a.target_dept_ids), 0) > 0
             AND a.target_dept_ids && $2::int[]
           )
         )
       ORDER BY a.published_at DESC`,
      [tenantId, deptIds],
    );
  }

  async create(
    tenantId: string,
    userId: string,
    dto: {
      title: string;
      body_html: string;
      target_dept_ids?: number[];
      target_all_students?: boolean;
      target_all_faculty?: boolean;
      audience?: AnnouncementAudience;
      notify?: boolean;
    },
    actor?: ScopedAuthUser,
  ) {
    const campusIds = actor
      ? await this.campusScope.resolveCampusIds(actor)
      : null;

    if (!campusIds) {
      const audience = this.normalizeAudience(dto.audience);
      const targetAllStudents =
        dto.target_all_students ??
        (audience === 'all' || audience === 'students');
      const targetAllFaculty =
        dto.target_all_faculty ??
        (audience === 'all' ||
          audience === 'faculty' ||
          audience === 'hods' ||
          audience === 'staff');
      const rows = await this.dataSource.query(
        `INSERT INTO campus_announcements (
           tenant_id, title, body_html, target_all_students, target_all_faculty,
           target_dept_ids, created_by_user_id
         ) VALUES ($1,$2,$3,$4,$5,'{}',$6)
         RETURNING *`,
        [
          tenantId,
          dto.title.trim(),
          dto.body_html,
          targetAllStudents,
          targetAllFaculty,
          userId,
        ],
      );
      const row = rows[0];
      let notified = 0;
      if (dto.notify === true) {
        notified = await this.notifyRecipients({
          tenantId,
          actorId: userId,
          announcement: row,
          audience,
          campusIds: null,
        });
      }
      return { ...row, notified };
    }

    const allowedDeptIds =
      await this.campusScope.departmentIdsForCampuses(campusIds);
    if (!allowedDeptIds.length) {
      throw new ForbiddenException(
        'No departments are linked to this Campus Admin campus',
      );
    }

    const requested = (dto.target_dept_ids ?? [])
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);
    const targetDeptIds = requested.length
      ? allowedDeptIds.filter((id) => requested.includes(id))
      : allowedDeptIds;

    if (!targetDeptIds.length) {
      throw new ForbiddenException(
        'Announcement departments are outside the assigned campus',
      );
    }

    const audience = this.normalizeAudience(dto.audience ?? 'all');
    // Campus-scoped rows must not flip tenant-wide "all students/faculty" flags.
    // Visibility for recipients is enforced via campus department targeting + notifications.
    const rows = await this.dataSource.query(
      `INSERT INTO campus_announcements (
         tenant_id, title, body_html, target_all_students, target_all_faculty,
         target_dept_ids, created_by_user_id
       ) VALUES ($1,$2,$3,false,false,$4::int[],$5)
       RETURNING *`,
      [tenantId, dto.title.trim(), dto.body_html, targetDeptIds, userId],
    );
    const row = rows[0];
    let notified = 0;
    if (dto.notify !== false) {
      notified = await this.notifyRecipients({
        tenantId,
        actorId: userId,
        announcement: row,
        audience,
        campusIds,
      });
    }
    return { ...row, notified, audience };
  }

  async update(
    tenantId: string,
    announcementId: string,
    dto: {
      title?: string;
      body_html?: string;
      is_published?: boolean;
    },
    actor?: ScopedAuthUser,
  ) {
    await this.assertAdminCanManage(tenantId, announcementId, actor);

    const title =
      dto.title != null ? String(dto.title).trim() : undefined;
    const body =
      dto.body_html != null ? String(dto.body_html) : undefined;
    if (
      title === undefined &&
      body === undefined &&
      dto.is_published === undefined
    ) {
      throw new BadRequestException('No announcement fields to update');
    }
    if (title !== undefined && !title) {
      throw new BadRequestException('Announcement title is required');
    }

    const rows = await this.dataSource.query(
      `UPDATE campus_announcements
       SET title = COALESCE($3, title),
           body_html = COALESCE($4, body_html),
           is_published = COALESCE($5, is_published)
       WHERE tenant_id = $1
         AND announcement_id = $2::uuid
       RETURNING *`,
      [
        tenantId,
        announcementId,
        title ?? null,
        body ?? null,
        dto.is_published ?? null,
      ],
    );
    if (!rows[0]) throw new NotFoundException('Announcement was not found');
    return rows[0];
  }

  async unpublish(
    tenantId: string,
    announcementId: string,
    actor?: ScopedAuthUser,
  ) {
    return this.update(
      tenantId,
      announcementId,
      { is_published: false },
      actor,
    );
  }

  private async assertAdminCanManage(
    tenantId: string,
    announcementId: string,
    actor?: ScopedAuthUser,
  ) {
    const campusIds = actor
      ? await this.campusScope.resolveCampusIds(actor)
      : null;
    if (campusIds && !campusIds.length) {
      throw new ForbiddenException(
        'No campus is assigned to this Campus Admin account',
      );
    }

    const [row] = await this.dataSource.query(
      `SELECT announcement_id, target_dept_ids, target_all_students, target_all_faculty
       FROM campus_announcements
       WHERE tenant_id = $1 AND announcement_id = $2::uuid
       LIMIT 1`,
      [tenantId, announcementId],
    );
    if (!row) throw new NotFoundException('Announcement was not found');
    if (!campusIds) return;

    // Campus Admin may only manage campus-scoped rows (dept-targeted, not tenant-wide flags).
    if (row.target_all_students || row.target_all_faculty) {
      throw new ForbiddenException(
        'Campus Admin cannot modify tenant-wide announcements',
      );
    }
    const allowedDeptIds =
      await this.campusScope.departmentIdsForCampuses(campusIds);
    const targets = Array.isArray(row.target_dept_ids)
      ? row.target_dept_ids.map((id: unknown) => Number(id))
      : [];
    if (
      !targets.length ||
      !targets.every((id: number) => allowedDeptIds.includes(id))
    ) {
      throw new ForbiddenException(
        'Announcement is outside the assigned campus',
      );
    }
  }

  async getPublishedForViewer(
    tenantId: string,
    announcementId: string,
    actor?: ScopedAuthUser & { dept_id?: number; roles?: string[]; role?: string },
  ) {
    const feed = await this.listForUser(tenantId, actor);
    const match = (feed as Array<{ announcement_id: string }>).find(
      (row) => String(row.announcement_id) === String(announcementId),
    );
    if (match) return match;

    // Campus-scoped announcements may not appear in feed for users without dept_id.
    // Allow viewing when the announcement was delivered as a notification to this user.
    if (actor?.user_id) {
      const [row] = await this.dataSource.query(
        `SELECT a.announcement_id, a.title, a.body_html, a.published_at
         FROM campus_announcements a
         WHERE a.tenant_id = $1
           AND a.announcement_id = $2::uuid
           AND a.is_published = true
           AND EXISTS (
             SELECT 1 FROM falcon_notifications n
             WHERE n.tenant_id = a.tenant_id
               AND n.user_id = $3::uuid
               AND n.deleted_at IS NULL
               AND (
                 n.action_link = $4
                 OR (n.metadata->>'announcement_id') = $2
               )
           )
         LIMIT 1`,
        [
          tenantId,
          announcementId,
          actor.user_id,
          `/announcements/${announcementId}`,
        ],
      );
      if (row) return row;
    }

    throw new NotFoundException('Announcement was not found');
  }

  /** Global notice board — published items filtered by audience flags / dept. */
  async listForUser(
    tenantId: string,
    actor?: ScopedAuthUser & { dept_id?: number; roles?: string[]; role?: string },
  ) {
    if (!actor) {
      return this.dataSource.query(
        `SELECT announcement_id, title, body_html, published_at
         FROM campus_announcements
         WHERE tenant_id = $1 AND is_published = true
         ORDER BY published_at DESC
         LIMIT 20`,
        [tenantId],
      );
    }

    const roles = (actor.roles?.length ? actor.roles : actor.role ? [actor.role] : [])
      .map((role) => String(role).trim().toLowerCase())
      .filter(Boolean);
    const isStudent = roles.some((role) => ['student', 'applicant'].includes(role));
    const isFacultyAudience = roles.some((role) =>
      [
        'faculty',
        'hod',
        'dean',
        'registrar',
        'superadmin',
        'campusadmin',
        'president',
        'warden',
        'librarian',
        'labadmin',
        'transportofficer',
        'accountant',
        'hr',
        'hradmin',
      ].includes(role),
    );
    const deptId =
      actor.dept_id != null && Number.isInteger(Number(actor.dept_id))
        ? Number(actor.dept_id)
        : null;

    return this.dataSource.query(
      `SELECT announcement_id, title, body_html, published_at
       FROM campus_announcements
       WHERE tenant_id = $1
         AND is_published = true
         AND (
           ($2::boolean = true AND target_all_students = true)
           OR ($3::boolean = true AND target_all_faculty = true)
           OR (
             $4::int IS NOT NULL
             AND COALESCE(cardinality(target_dept_ids), 0) > 0
             AND $4::int = ANY(target_dept_ids)
           )
         )
       ORDER BY published_at DESC
       LIMIT 20`,
      [tenantId, isStudent, isFacultyAudience, deptId],
    );
  }

  private normalizeAudience(audience?: string | null): AnnouncementAudience {
    const value = String(audience ?? 'all')
      .trim()
      .toLowerCase();
    if (value === 'students' || value === 'student') return 'students';
    if (value === 'faculty') return 'faculty';
    if (value === 'hods' || value === 'hod') return 'hods';
    if (value === 'staff') return 'staff';
    return 'all';
  }

  private async notifyRecipients(opts: {
    tenantId: string;
    actorId: string;
    announcement: {
      announcement_id: string;
      title: string;
      body_html?: string;
    };
    audience: AnnouncementAudience;
    campusIds: number[] | null;
  }): Promise<number> {
    const recipients = await this.resolveRecipientUserIds(
      opts.tenantId,
      opts.audience,
      opts.campusIds,
    );
    const plain = String(opts.announcement.body_html ?? '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 280);
    const actionLink = `/announcements/${opts.announcement.announcement_id}`;
    let sent = 0;
    for (const userId of recipients) {
      if (userId === opts.actorId) continue;
      await this.notifications.create({
        tenantId: opts.tenantId,
        userId,
        category: 'OPERATIONS',
        title: opts.announcement.title,
        message: plain || opts.announcement.title,
        actionLink,
        severity: 'info',
        intent: 'info',
        actionLabel: 'View announcement',
        metadata: {
          announcement_id: opts.announcement.announcement_id,
          audience: opts.audience,
          broadcast_by: opts.actorId,
        },
      });
      sent += 1;
    }
    return sent;
  }

  private async resolveRecipientUserIds(
    tenantId: string,
    audience: AnnouncementAudience,
    campusIds: number[] | null,
  ): Promise<string[]> {
    if (!campusIds) {
      const params: unknown[] = [tenantId];
      let sql = `SELECT u.user_id
                 FROM users u
                 JOIN roles r ON r.role_id = u.role_id
                 WHERE u.tenant_id = $1 AND u.is_active = true`;
      if (audience === 'students') {
        sql += ` AND lower(r.role_name) = 'student'`;
      } else if (audience === 'faculty') {
        sql += ` AND lower(r.role_name) IN ('faculty','dean')`;
      } else if (audience === 'hods') {
        sql += ` AND lower(r.role_name) = 'hod'`;
      } else if (audience === 'staff') {
        sql += ` AND lower(r.role_name) IN (
          'warden','librarian','labadmin','transportofficer','accountant','hr','hradmin'
        )`;
      } else {
        sql += ` AND lower(r.role_name) IN (
          'student','faculty','hod','dean','warden','librarian','labadmin',
          'transportofficer','accountant','hr','hradmin'
        )`;
      }
      const rows = await this.dataSource.query(sql, params);
      return (rows as Array<{ user_id: string }>).map((row) => row.user_id);
    }

    const ids = new Set<string>();
    if (audience === 'all' || audience === 'students') {
      const campusClause = this.campusScope.studentCampusVisibilityClause(1, 2);
      const students = await this.dataSource.query(
        `SELECT u.user_id
         FROM users u
         JOIN roles r ON r.role_id = u.role_id
         LEFT JOIN departments d ON d.dept_id = u.dept_id AND d.deleted_at IS NULL
         LEFT JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
         WHERE u.tenant_id = $1
           AND u.is_active = true
           AND lower(r.role_name) = 'student'
           AND ${campusClause}`,
        [tenantId, campusIds],
      );
      for (const row of students as Array<{ user_id: string }>) {
        ids.add(row.user_id);
      }
    }

    const staffRoleSql =
      audience === 'faculty'
        ? `'faculty','dean'`
        : audience === 'hods'
          ? `'hod'`
          : audience === 'staff'
            ? `'warden','librarian','labadmin','transportofficer','accountant','hr','hradmin'`
            : audience === 'all'
              ? `'faculty','hod','dean','warden','librarian','labadmin','transportofficer','accountant','hr','hradmin'`
              : null;

    if (staffRoleSql) {
      const staff = await this.dataSource.query(
        `SELECT u.user_id
         FROM users u
         JOIN roles r ON r.role_id = u.role_id
         LEFT JOIN departments d ON d.dept_id = u.dept_id AND d.deleted_at IS NULL
         LEFT JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
         WHERE u.tenant_id = $1
           AND u.is_active = true
           AND lower(r.role_name) IN (${staffRoleSql})
           AND s.campus_id = ANY($2::int[])`,
        [tenantId, campusIds],
      );
      for (const row of staff as Array<{ user_id: string }>) {
        ids.add(row.user_id);
      }
    }

    return [...ids];
  }
}
