import { ForbiddenException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  CampusScopeService,
  type ScopedAuthUser,
} from '../../common/campus-scope/campus-scope.service';

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly campusScope: CampusScopeService,
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
    },
    actor?: ScopedAuthUser,
  ) {
    const campusIds = actor
      ? await this.campusScope.resolveCampusIds(actor)
      : null;

    if (!campusIds) {
      const targetAllStudents = dto.target_all_students ?? true;
      const targetAllFaculty = dto.target_all_faculty ?? true;
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
      return rows[0];
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

    const rows = await this.dataSource.query(
      `INSERT INTO campus_announcements (
         tenant_id, title, body_html, target_all_students, target_all_faculty,
         target_dept_ids, created_by_user_id
       ) VALUES ($1,$2,$3,false,false,$4::int[],$5)
       RETURNING *`,
      [tenantId, dto.title.trim(), dto.body_html, targetDeptIds, userId],
    );
    return rows[0];
  }

  /** Global notice board — same items for every authenticated user on the tenant. */
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
}
