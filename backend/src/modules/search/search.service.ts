import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export type SearchResult = {
  user_id: string;
  name: string;
  email: string;
  role_name: string;
  enrollment_no: string | null;
  employee_id: string | null;
  dept_name: string | null;
  match_score: number;
};

export type UnifiedSearchItem = {
  id: string;
  name: string;
  avatar: string | null;
  subtitle: string;
};

export type UnifiedTicketItem = {
  id: string;
  title: string;
  status: string;
  ticket_ref: string;
};

export type UnifiedSearchResponse = {
  students: UnifiedSearchItem[];
  staff: UnifiedSearchItem[];
  tickets: UnifiedTicketItem[];
  direct_jump?: { type: 'ticket'; path: string };
};

@Injectable()
export class SearchService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  private readonly studentIdPattern = /^SGVU-\d+/i;
  private readonly employeeIdPattern = /^EMP-\d+/i;
  private readonly ticketIdPattern = /^TKT-\d+/i;
  private readonly exactTicketPattern = /^TKT-\d+$/i;

  async unifiedSearch(
    searcherUserId: string,
    tenantId: string,
    roleName: string,
    query: string,
  ): Promise<UnifiedSearchResponse> {
    const q = query.trim();
    if (q.length < 2) {
      return { students: [], staff: [], tickets: [] };
    }

    if (this.exactTicketPattern.test(q) && this.canSearchTickets(roleName)) {
      const jump = await this.resolveTicketDirectJump(
        tenantId,
        q,
        searcherUserId,
        roleName,
      );
      if (jump) return jump;
    }

    if (this.studentIdPattern.test(q)) {
      const students = await this.searchStudents(
        searcherUserId,
        tenantId,
        roleName,
        q,
        true,
      );
      return { students, staff: [], tickets: [] };
    }

    if (this.employeeIdPattern.test(q)) {
      const staff = await this.searchStaff(
        searcherUserId,
        tenantId,
        roleName,
        q,
        true,
      );
      return { students: [], staff, tickets: [] };
    }

    if (this.ticketIdPattern.test(q)) {
      const tickets = this.canSearchTickets(roleName)
        ? await this.searchTickets(searcherUserId, tenantId, roleName, q, true)
        : [];
      return { students: [], staff: [], tickets };
    }

    const [students, staff, tickets] = await Promise.all([
      this.canSearchStudents(roleName)
        ? this.searchStudents(searcherUserId, tenantId, roleName, q, false)
        : [],
      this.searchStaff(searcherUserId, tenantId, roleName, q, false),
      this.canSearchTickets(roleName)
        ? this.searchTickets(searcherUserId, tenantId, roleName, q, false)
        : [],
    ]);

    return { students, staff, tickets };
  }

  private canSearchStudents(roleName: string) {
    const role = roleName.trim().toLowerCase();
    return !['student', 'applicant'].includes(role);
  }

  private canSearchTickets(roleName: string) {
    return roleName.trim().length > 0;
  }

  private isExecutive(roleName: string) {
    const role = roleName.trim().toLowerCase();
    return [
      'chairman',
      'president',
      'superadmin',
      'registrar',
      'hradmin',
      'hr',
      'hod',
      'dean',
      'warden',
    ].includes(role);
  }

  private avatarInitial(name: string) {
    return name?.charAt(0)?.toUpperCase() ?? '?';
  }

  private async resolveTicketDirectJump(
    tenantId: string,
    ticketRef: string,
    searcherUserId: string,
    roleName: string,
  ): Promise<UnifiedSearchResponse | null> {
    const rows = await this.db.query(
      `SELECT t.ticket_id, t.ticket_ref, t.subject, t.status, t.student_user_id
       FROM helpdesk_tickets t
       JOIN users u ON u.user_id = t.student_user_id
       WHERE COALESCE(t.tenant_id, u.tenant_id) = $1 AND UPPER(t.ticket_ref) = UPPER($2)
       LIMIT 1`,
      [tenantId, ticketRef],
    );
    if (!rows.length) return null;
    const t = rows[0] as { student_user_id: string; ticket_ref: string };
    const role = roleName.toLowerCase();
    if (
      ['student', 'applicant'].includes(role) &&
      t.student_user_id !== searcherUserId
    ) {
      return null;
    }
    return {
      students: [],
      staff: [],
      tickets: [],
      direct_jump: {
        type: 'ticket',
        path: `/tickets/view/${ticketRef.toUpperCase()}`,
      },
    };
  }

  private async searchStudents(
    searcherUserId: string,
    tenantId: string,
    roleName: string,
    query: string,
    idMode: boolean,
  ): Promise<UnifiedSearchItem[]> {
    if (!this.canSearchStudents(roleName)) return [];

    const scope = await this.buildScopeClause(
      searcherUserId,
      tenantId,
      roleName,
      3,
    );
    const like = idMode ? `${query}%` : `%${query}%`;
    const params: unknown[] = [tenantId, like, ...scope.params];
    const nameFilter = idMode
      ? 'sp.enrollment_no ILIKE $2'
      : '(u.name ILIKE $2 OR sp.enrollment_no ILIKE $2 OR u.name % $2)';

    const rows = await this.db.query(
      `SELECT u.user_id, u.name, sp.enrollment_no, d.dept_name, sp.batch
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       WHERE u.tenant_id = $1 AND u.is_active = true
         AND r.role_name IN ('Student', 'Applicant')
         AND (${scope.clause})
         AND ${nameFilter}
       ORDER BY u.name ASC
       LIMIT 8`,
      params,
    );

    return rows.map((r: Record<string, unknown>) => ({
      id: String(r.user_id),
      name: String(r.name),
      avatar: this.avatarInitial(String(r.name)),
      subtitle:
        [r.enrollment_no, r.dept_name].filter(Boolean).join(' - ') ||
        String(r.batch ?? 'Student'),
    }));
  }

  private async searchStaff(
    searcherUserId: string,
    tenantId: string,
    roleName: string,
    query: string,
    idMode: boolean,
  ): Promise<UnifiedSearchItem[]> {
    const role = roleName.trim().toLowerCase();
    const like = idMode ? `${query}%` : `%${query}%`;

    if (['student', 'applicant'].includes(role)) {
      const filter = idMode
        ? 'ep.employee_id ILIKE $2'
        : '(u.name ILIKE $2 OR ep.employee_id ILIKE $2 OR u.name % $2)';
      const rows = await this.db.query(
        `SELECT u.user_id, u.name, ep.employee_id, ep.designation, d.dept_name, r.role_name
         FROM users u
         JOIN roles r ON r.role_id = u.role_id
         LEFT JOIN hr_employee_profiles ep ON ep.user_id = u.user_id AND ep.tenant_id = u.tenant_id
         LEFT JOIN departments d ON d.dept_id = u.dept_id
         WHERE u.tenant_id = $1 AND u.is_active = true
           AND r.role_name IN ('Faculty', 'HOD', 'Dean', 'Warden', 'HR', 'HRAdmin', 'Registrar')
           AND ${filter}
         ORDER BY u.name ASC
         LIMIT 8`,
        [tenantId, like],
      );
      return rows.map((r: Record<string, unknown>) => this.mapStaffRow(r));
    }

    const scope = await this.buildScopeClause(
      searcherUserId,
      tenantId,
      roleName,
      3,
    );
    const filter = idMode
      ? 'ep.employee_id ILIKE $2'
      : '(u.name ILIKE $2 OR ep.employee_id ILIKE $2 OR u.name % $2)';

    const rows = await this.db.query(
      `SELECT u.user_id, u.name, ep.employee_id, ep.designation, d.dept_name, r.role_name
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN hr_employee_profiles ep ON ep.user_id = u.user_id AND ep.tenant_id = u.tenant_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       WHERE u.tenant_id = $1 AND u.is_active = true
         AND r.role_name NOT IN ('Student', 'Applicant')
         AND (${scope.clause})
         AND ${filter}
       ORDER BY u.name ASC
       LIMIT 8`,
      [tenantId, like, ...scope.params],
    );

    return rows.map((r: Record<string, unknown>) => this.mapStaffRow(r));
  }

  private mapStaffRow(r: Record<string, unknown>): UnifiedSearchItem {
    return {
      id: String(r.user_id),
      name: String(r.name),
      avatar: this.avatarInitial(String(r.name)),
      subtitle: [r.employee_id, r.designation ?? r.role_name, r.dept_name]
        .filter(Boolean)
        .join(' - '),
    };
  }

  private async searchTickets(
    searcherUserId: string,
    tenantId: string,
    roleName: string,
    query: string,
    idMode: boolean,
  ): Promise<UnifiedTicketItem[]> {
    const like = idMode ? `${query}%` : `%${query}%`;
    const role = roleName.toLowerCase();
    const conditions = ['COALESCE(t.tenant_id, u.tenant_id) = $1'];
    const params: unknown[] = [tenantId];
    let n = 2;

    if (['student', 'applicant'].includes(role)) {
      conditions.push(`t.student_user_id = $${n++}`);
      params.push(searcherUserId);
    } else if (!this.isExecutive(role)) {
      conditions.push(
        `(t.assigned_to_user_id = $${n} OR t.student_user_id = $${n})`,
      );
      params.push(searcherUserId);
      n++;
    }

    if (idMode) {
      conditions.push(`UPPER(t.ticket_ref) ILIKE UPPER($${n++})`);
    } else {
      conditions.push(
        `(t.subject ILIKE $${n} OR t.ticket_ref ILIKE $${n} OR t.description ILIKE $${n})`,
      );
    }
    params.push(like);

    const rows = await this.db.query(
      `SELECT t.ticket_id,
              COALESCE(t.ticket_ref, CONCAT('TKT-', SUBSTRING(REPLACE(t.ticket_id::text, '-', ''), 1, 4))) AS ticket_ref,
              t.subject, t.status, u.name AS student_name
       FROM helpdesk_tickets t
       JOIN users u ON u.user_id = t.student_user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY t.created_at DESC
       LIMIT 8`,
      params,
    );

    return rows.map((r: Record<string, unknown>) => ({
      id: String(r.ticket_id),
      title: `${r.ticket_ref} - ${r.student_name} reported ${r.subject}`,
      status: String(r.status),
      ticket_ref: String(r.ticket_ref),
    }));
  }

  private async buildScopeClause(
    searcherUserId: string,
    tenantId: string,
    roleName: string,
    startAt: number,
  ) {
    const role = roleName.trim().toLowerCase();

    if (
      [
        'chairman',
        'president',
        'superadmin',
        'registrar',
        'hradmin',
        'hr',
      ].includes(role)
    ) {
      return { clause: 'TRUE', params: [] as unknown[] };
    }

    if (role === 'hod' || role === 'dean') {
      const rows = await this.db.query(
        `SELECT dept_id FROM users WHERE user_id = $1`,
        [searcherUserId],
      );
      const deptId = rows[0]?.dept_id;
      if (!deptId) return { clause: 'FALSE', params: [] };
      return { clause: `u.dept_id = $${startAt}`, params: [deptId] };
    }

    if (role === 'warden') {
      return {
        clause: `EXISTS (
          SELECT 1 FROM hostel_allocations ha
          JOIN operations_hostel_rooms r ON r.room_id = ha.room_id
          WHERE ha.student_user_id = u.user_id
            AND ha.status = 'ACTIVE'
            AND (r.warden_user_id = $${startAt} OR ha.warden_user_id = $${startAt})
        )`,
        params: [searcherUserId],
      };
    }

    if (role === 'faculty') {
      return {
        clause: `(
          EXISTS (
            SELECT 1 FROM academic_mentorships m
            WHERE m.student_user_id = u.user_id AND m.proctor_user_id = $${startAt} AND m.is_active = true
          )
          OR EXISTS (
            SELECT 1 FROM student_course_enrollments e
            JOIN academic_courses c ON c.course_id = e.course_id
            JOIN admin_timetable_slots ts ON ts.course_code = c.course_code
              AND ts.faculty_user_id = $${startAt} AND ts.tenant_id = u.tenant_id
            WHERE e.student_user_id = u.user_id
          )
        )`,
        params: [searcherUserId],
      };
    }

    return { clause: `u.user_id = $${startAt}`, params: [searcherUserId] };
  }

  async globalSearch(
    searcherUserId: string,
    tenantId: string,
    roleName: string,
    query: string,
  ): Promise<SearchResult[]> {
    const q = query.trim();
    if (q.length < 2) return [];

    const scope = await this.buildScopeSql(searcherUserId, tenantId, roleName);
    const like = `%${q}%`;

    const rows = await this.db.query(
      `SELECT u.user_id, u.name, u.official_email AS email, r.role_name,
              sp.enrollment_no, ep.employee_id, d.dept_name,
              GREATEST(
                similarity(u.name, $3),
                similarity(COALESCE(sp.enrollment_no, ''), $3),
                similarity(COALESCE(ep.employee_id, ''), $3),
                similarity(u.official_email, $3)
              ) AS match_score
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       LEFT JOIN hr_employee_profiles ep ON ep.user_id = u.user_id AND ep.tenant_id = u.tenant_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       WHERE u.tenant_id = $1
         AND u.is_active = true
         AND (${scope.sql})
         AND (
           u.name ILIKE $2 OR u.official_email ILIKE $2
           OR sp.enrollment_no ILIKE $2 OR ep.employee_id ILIKE $2
           OR u.name % $3 OR sp.enrollment_no % $3 OR ep.employee_id % $3
         )
       ORDER BY match_score DESC, u.name ASC
       LIMIT 15`,
      [tenantId, like, q, ...scope.params],
    );

    return rows.map((r: Record<string, unknown>) => ({
      user_id: String(r.user_id),
      name: String(r.name),
      email: String(r.email),
      role_name: String(r.role_name),
      enrollment_no: r.enrollment_no ? String(r.enrollment_no) : null,
      employee_id: r.employee_id ? String(r.employee_id) : null,
      dept_name: r.dept_name ? String(r.dept_name) : null,
      match_score: Number(r.match_score ?? 0),
    }));
  }

  private canBrowseDirectory(roleName: string) {
    const role = roleName.trim().toLowerCase();
    return !['student', 'applicant', 'parent', 'alumni'].includes(role);
  }

  private statusLabelSql() {
    return `CASE
      WHEN LOWER(r.role_name) = 'alumni'
        OR u.onboarding_status = 'EXITED'
        OR UPPER(COALESCE(sp.status, '')) IN ('GRADUATED', 'ALUMNI')
        THEN 'Graduated'
      WHEN UPPER(COALESCE(sp.status, '')) = 'BLOCKED'
        OR UPPER(COALESCE(u.onboarding_status, '')) = 'BLOCKED'
        THEN 'Blocked'
      WHEN UPPER(COALESCE(sp.status, '')) = 'SUSPENDED'
        THEN 'Suspended'
      WHEN u.is_active = false
        THEN 'Inactive'
      WHEN u.onboarding_status IN (
        'PENDING_ONBOARDING',
        'IN_PROGRESS',
        'PENDING_PASSWORD_RESET',
        'PENDING_DOCUMENTS'
      )
        THEN 'Pending'
      WHEN UPPER(COALESCE(u.onboarding_status, '')) = 'ON_LEAVE'
        OR UPPER(COALESCE(sp.status, '')) = 'ON_LEAVE'
        THEN 'On Leave'
      ELSE 'Active'
    END`;
  }

  private directorySortSql(
    sortBy?: string,
    sortDir?: string,
    statusSql?: string,
  ) {
    const dir =
      String(sortDir ?? 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const key = String(sortBy ?? 'name').toLowerCase();
    const statusExpr = statusSql ?? this.statusLabelSql();
    const columnMap: Record<string, string> = {
      name: 'u.name',
      email: 'u.official_email',
      role: 'r.role_name',
      university_id: 'COALESCE(sp.enrollment_no, ep.employee_id)',
      department: `COALESCE(d.dept_name, 'University-wide')`,
      batch: 'sp.batch',
      status: `(${statusExpr})`,
    };
    const column = columnMap[key] ?? columnMap.name;
    return `${column} ${dir} NULLS LAST, u.name ASC`;
  }

  private applyDirectoryFilters(
    filters: {
      q?: string;
      role?: string;
      department?: string;
      status?: string;
      batch?: string;
    },
    conditions: string[],
    params: unknown[],
  ) {
    let idx = params.length + 1;

    if (filters.q?.trim()) {
      const like = `%${filters.q.trim()}%`;
      conditions.push(`(
        u.name ILIKE $${idx}
        OR u.official_email ILIKE $${idx}
        OR sp.enrollment_no ILIKE $${idx}
        OR ep.employee_id ILIKE $${idx}
        OR r.role_name ILIKE $${idx}
        OR COALESCE(d.dept_name, '') ILIKE $${idx}
      )`);
      params.push(like);
      idx++;
    }

    if (filters.role?.trim()) {
      conditions.push(`r.role_name ILIKE $${idx++}`);
      params.push(filters.role.trim());
    }

    if (filters.department?.trim()) {
      conditions.push(
        `COALESCE(d.dept_name, 'University-wide') ILIKE $${idx++}`,
      );
      params.push(`%${filters.department.trim()}%`);
    }

    if (filters.batch?.trim()) {
      conditions.push(`sp.batch ILIKE $${idx++}`);
      params.push(`%${filters.batch.trim()}%`);
    }

    if (filters.status?.trim()) {
      const status = filters.status.trim().toLowerCase();
      const label = this.statusLabelSql();
      if (status === 'active') {
        conditions.push(`(${label}) = 'Active'`);
      } else if (status === 'inactive') {
        conditions.push(`(${label}) = 'Inactive'`);
      } else if (status === 'suspended') {
        conditions.push(`(${label}) = 'Suspended'`);
      } else if (status === 'graduated' || status === 'alumni') {
        conditions.push(`(${label}) = 'Graduated'`);
      } else if (status === 'pending') {
        conditions.push(`(${label}) = 'Pending'`);
      } else if (status === 'blocked') {
        conditions.push(`(${label}) = 'Blocked'`);
      } else if (status === 'on leave' || status === 'on_leave') {
        conditions.push(`(${label}) = 'On Leave'`);
      }
    }

    return idx;
  }

  private directoryFromClause() {
    return `FROM users u
      JOIN roles r ON r.role_id = u.role_id
      LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
      LEFT JOIN hr_employee_profiles ep ON ep.user_id = u.user_id AND ep.tenant_id = u.tenant_id
      LEFT JOIN departments d ON d.dept_id = u.dept_id`;
  }

  async getDirectoryFilterOptions(
    searcherUserId: string,
    tenantId: string,
    roleName: string,
  ) {
    if (!this.canBrowseDirectory(roleName)) {
      return {
        roles: [],
        departments: [],
        batches: [],
        statuses: [
          'Active',
          'Inactive',
          'Suspended',
          'Graduated',
          'Pending',
          'Blocked',
          'On Leave',
        ],
      };
    }

    const scope = await this.buildScopeClause(
      searcherUserId,
      tenantId,
      roleName,
      2,
    );
    const baseParams: unknown[] = [tenantId, ...scope.params];

    const [roles, departments, batches] = await Promise.all([
      this.db.query(
        `SELECT DISTINCT r.role_name
         FROM users u JOIN roles r ON r.role_id = u.role_id
         WHERE u.tenant_id = $1 AND (${scope.clause})
         ORDER BY r.role_name`,
        baseParams,
      ),
      this.db.query(
        `SELECT DISTINCT COALESCE(d.dept_name, 'University-wide') AS dept_name
         FROM users u
         LEFT JOIN departments d ON d.dept_id = u.dept_id
         WHERE u.tenant_id = $1 AND (${scope.clause})
         ORDER BY dept_name`,
        baseParams,
      ),
      this.db.query(
        `SELECT DISTINCT sp.batch
         FROM users u
         JOIN student_profiles sp ON sp.user_id = u.user_id
         WHERE u.tenant_id = $1 AND (${scope.clause}) AND sp.batch IS NOT NULL AND sp.batch <> ''
         ORDER BY sp.batch`,
        baseParams,
      ),
    ]);

    return {
      roles: roles.map((r: { role_name: string }) => r.role_name),
      departments: departments.map((d: { dept_name: string }) => d.dept_name),
      batches: batches.map((b: { batch: string }) => b.batch),
      statuses: [
        'Active',
        'Inactive',
        'Suspended',
        'Graduated',
        'Pending',
        'Blocked',
        'On Leave',
      ],
    };
  }

  async browseDirectory(
    searcherUserId: string,
    tenantId: string,
    roleName: string,
    filters: {
      q?: string;
      role?: string;
      department?: string;
      status?: string;
      batch?: string;
      page?: number;
      limit?: number;
      sort_by?: string;
      sort_dir?: string;
    },
  ) {
    if (!this.canBrowseDirectory(roleName)) {
      return { items: [], total: 0, page: 1, limit: 25, total_pages: 0 };
    }

    const scope = await this.buildScopeClause(
      searcherUserId,
      tenantId,
      roleName,
      2,
    );
    const conditions = ['u.tenant_id = $1', `(${scope.clause})`];
    const params: unknown[] = [tenantId, ...scope.params];
    this.applyDirectoryFilters(filters, conditions, params);

    const where = conditions.join(' AND ');
    const from = this.directoryFromClause();
    const statusSql = this.statusLabelSql();
    const orderBy = this.directorySortSql(
      filters.sort_by,
      filters.sort_dir,
      statusSql,
    );

    const countRows = await this.db.query(
      `SELECT COUNT(*)::int AS total ${from} WHERE ${where}`,
      params,
    );
    const total = Number(countRows[0]?.total ?? 0);
    const limit = Math.min(Math.max(filters.limit ?? 25, 1), 100);
    const page = Math.max(filters.page ?? 1, 1);
    const offset = (page - 1) * limit;

    const listParams = [...params, limit, offset];
    const limitIdx = listParams.length - 1;
    const offsetIdx = listParams.length;

    const rows = await this.db.query(
      `SELECT u.user_id, u.name, u.official_email AS email, r.role_name,
              COALESCE(sp.enrollment_no, ep.employee_id) AS university_id,
              COALESCE(d.dept_name, 'University-wide') AS dept_name,
              sp.batch,
              ${statusSql} AS status_label
       ${from}
       WHERE ${where}
       ORDER BY ${orderBy}
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      listParams,
    );

    return {
      items: rows.map((r: Record<string, unknown>) => ({
        user_id: String(r.user_id),
        name: String(r.name),
        email: String(r.email),
        role_name: String(r.role_name),
        university_id: r.university_id ? String(r.university_id) : null,
        dept_name: String(r.dept_name),
        batch: r.batch ? String(r.batch) : null,
        status: String(r.status_label),
      })),
      total,
      page,
      limit,
      total_pages: total ? Math.ceil(total / limit) : 0,
    };
  }

  async exportDirectoryCsv(
    searcherUserId: string,
    tenantId: string,
    roleName: string,
    filters: {
      q?: string;
      role?: string;
      department?: string;
      status?: string;
      batch?: string;
      sort_by?: string;
      sort_dir?: string;
    },
  ) {
    const result = await this.browseDirectory(
      searcherUserId,
      tenantId,
      roleName,
      {
        ...filters,
        page: 1,
        limit: 10000,
      },
    );

    const header = [
      'Name',
      'Email',
      'Role',
      'University ID',
      'Department',
      'Batch',
      'Status',
    ];
    const lines = [header.join(',')];
    for (const row of result.items) {
      lines.push(
        [
          row.name,
          row.email,
          row.role_name,
          row.university_id ?? '',
          row.dept_name,
          row.batch ?? '',
          row.status,
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(','),
      );
    }
    return `\uFEFF${lines.join('\n')}`;
  }

  private async buildScopeSql(
    searcherUserId: string,
    tenantId: string,
    roleName: string,
  ) {
    const role = roleName.trim().toLowerCase();

    if (['chairman', 'president', 'superadmin', 'registrar'].includes(role)) {
      return { sql: 'TRUE', params: [] as unknown[] };
    }

    if (role === 'hod' || role === 'dean') {
      const rows = await this.db.query(
        `SELECT dept_id FROM users WHERE user_id = $1`,
        [searcherUserId],
      );
      const deptId = rows[0]?.dept_id;
      if (!deptId) return { sql: 'FALSE', params: [] };
      return { sql: 'u.dept_id = $4', params: [deptId] };
    }

    if (role === 'warden') {
      return {
        sql: `EXISTS (
          SELECT 1 FROM hostel_allocations ha
          JOIN operations_hostel_rooms r ON r.room_id = ha.room_id
          WHERE ha.student_user_id = u.user_id
            AND ha.status = 'ACTIVE'
            AND (r.warden_user_id = $4 OR ha.warden_user_id = $4)
        )`,
        params: [searcherUserId],
      };
    }

    if (role === 'faculty') {
      return {
        sql: `(
          EXISTS (
            SELECT 1 FROM academic_mentorships m
            WHERE m.student_user_id = u.user_id AND m.proctor_user_id = $4 AND m.is_active = true
          )
          OR EXISTS (
            SELECT 1 FROM student_course_enrollments e
            JOIN academic_courses c ON c.course_id = e.course_id
            JOIN admin_timetable_slots ts ON ts.course_code = c.course_code
              AND ts.faculty_user_id = $4 AND ts.tenant_id = u.tenant_id
            WHERE e.student_user_id = u.user_id
          )
        )`,
        params: [searcherUserId],
      };
    }

    return { sql: 'u.user_id = $4', params: [searcherUserId] };
  }

  async getProfile360(
    viewerUserId: string,
    tenantId: string,
    roleName: string,
    targetUserId: string,
  ) {
    await this.assertProfileAccess(
      viewerUserId,
      tenantId,
      roleName,
      targetUserId,
    );

    const userRows = await this.db.query(
      `SELECT u.user_id, u.name, u.official_email, u.phone, r.role_name, d.dept_name,
              sp.enrollment_no, sp.batch, sp.blood_group,
              ep.employee_id, ep.designation,
              ro.name AS reporting_officer_name
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       LEFT JOIN hr_employee_profiles ep ON ep.user_id = u.user_id AND ep.tenant_id = u.tenant_id
       LEFT JOIN users ro ON ro.user_id = u.reporting_officer_id
       WHERE u.user_id = $1 AND u.tenant_id = $2`,
      [targetUserId, tenantId],
    );
    const user = userRows[0];
    if (!user) throw new NotFoundException('Profile not found');

    const isStudent = ['student', 'applicant'].includes(
      String(user.role_name).toLowerCase(),
    );

    if (isStudent) {
      const [academics, finance, hostel, discipline, ufm, tickets, proctor] =
        await Promise.all([
          this.db.query(
            `SELECT c.course_code, c.course_name, e.semester, e.attendance_percent, e.grade_points, e.status
           FROM student_course_enrollments e
           JOIN academic_courses c ON c.course_id = e.course_id
           WHERE e.student_user_id = $1 ORDER BY e.semester DESC LIMIT 20`,
            [targetUserId],
          ),
          this.db.query(
            `SELECT fee_head, total_amount, paid_amount, status, due_date
           FROM finance_fee_demands WHERE student_user_id = $1 ORDER BY due_date`,
            [targetUserId],
          ),
          this.db.query(
            `SELECT h.hostel_name, r.room_number, ha.status
           FROM hostel_allocations ha
           JOIN operations_hostel_rooms r ON r.room_id = ha.room_id
           JOIN operations_hostels h ON h.hostel_id = r.hostel_id
           WHERE ha.student_user_id = $1 AND ha.status = 'ACTIVE' LIMIT 1`,
            [targetUserId],
          ),
          this.db.query(
            `SELECT incident_date, category, description, action_taken
           FROM student_disciplinary_records WHERE student_user_id = $1 ORDER BY incident_date DESC LIMIT 10`,
            [targetUserId],
          ),
          this.db.query(
            `SELECT description, penalty_applied, status, logged_at
           FROM ufm_cases WHERE student_user_id = $1 ORDER BY logged_at DESC LIMIT 10`,
            [targetUserId],
          ),
          this.db.query(
            `SELECT ticket_id, category, subject, status, created_at, sla_deadline
           FROM helpdesk_tickets WHERE student_user_id = $1 ORDER BY created_at DESC LIMIT 10`,
            [targetUserId],
          ),
          this.db.query(
            `SELECT p.name AS proctor_name FROM academic_mentorships m
           JOIN users p ON p.user_id = m.proctor_user_id
           WHERE m.student_user_id = $1 AND m.is_active = true LIMIT 1`,
            [targetUserId],
          ),
        ]);

      const avgCgpa = academics.length
        ? academics.reduce(
            (s: number, r: { grade_points: string | null }) =>
              s + Number(r.grade_points ?? 0),
            0,
          ) /
          academics.filter(
            (r: { grade_points: string | null }) => r.grade_points,
          ).length
        : null;

      return {
        type: 'student' as const,
        user,
        proctor_name: proctor[0]?.proctor_name ?? null,
        current_semester: academics[0]?.semester ?? null,
        summary: {
          avg_cgpa: avgCgpa ? Number(avgCgpa.toFixed(2)) : null,
          avg_attendance: academics.length
            ? Number(
                (
                  academics.reduce(
                    (s: number, r: { attendance_percent: string }) =>
                      s + Number(r.attendance_percent ?? 0),
                    0,
                  ) / academics.length
                ).toFixed(2),
              )
            : null,
          pending_dues: finance
            .filter(
              (f: { status: string }) => !['PAID', 'WAIVED'].includes(f.status),
            )
            .reduce(
              (s: number, f: { total_amount: string; paid_amount: string }) =>
                s + (Number(f.total_amount) - Number(f.paid_amount)),
              0,
            ),
        },
        tabs: { academics, finance, hostel, discipline, ufm, tickets },
      };
    }

    const [timetable, leaves, appraisal, feedback] = await Promise.all([
      this.db.query(
        `SELECT day_of_week, start_time, end_time, room_code, course_code
         FROM admin_timetable_slots WHERE faculty_user_id = $1 ORDER BY day_of_week, start_time LIMIT 20`,
        [targetUserId],
      ),
      this.db
        .query(
          `SELECT leave_type, days_requested, status, start_date, end_date
         FROM hr_leave_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
          [targetUserId],
        )
        .catch(() => []),
      this.db
        .query(
          `SELECT appraisal_year, auto_api_score, hod_rating, hr_final_status
         FROM hr_employee_appraisals WHERE user_id = $1 ORDER BY appraisal_year DESC LIMIT 3`,
          [targetUserId],
        )
        .catch(() => []),
      this.db
        .query(
          `SELECT AVG(score)::numeric(4,2) AS avg_rating, COUNT(*)::int AS sessions
         FROM placement_mock_interviews WHERE interviewer_user_id = $1 AND score IS NOT NULL`,
          [targetUserId],
        )
        .catch(() => [{ avg_rating: null, sessions: 0 }]),
    ]);

    return {
      type: 'faculty' as const,
      user,
      reporting_hod: user.reporting_officer_name,
      summary: {
        api_score: appraisal[0]?.auto_api_score ?? null,
        feedback_rating: feedback[0]?.avg_rating ?? null,
        feedback_sessions: feedback[0]?.sessions ?? 0,
      },
      tabs: { timetable, leaves, appraisal, feedback: feedback[0] },
    };
  }

  private async assertProfileAccess(
    viewerUserId: string,
    tenantId: string,
    roleName: string,
    targetUserId: string,
  ) {
    const exists = await this.db.query(
      `SELECT 1 FROM users WHERE user_id = $1 AND tenant_id = $2`,
      [targetUserId, tenantId],
    );
    if (!exists.length) throw new NotFoundException('Profile not found');
    if (viewerUserId === targetUserId) return;

    const role = roleName.trim().toLowerCase();
    if (['chairman', 'president', 'superadmin', 'registrar'].includes(role))
      return;

    const scope = await this.buildScopeSql(viewerUserId, tenantId, roleName);
    const params = [targetUserId, tenantId, ...scope.params];
    const scopeSql = scope.sql.replace(/\$4/g, '$3');
    const rows = await this.db.query(
      `SELECT 1 FROM users u WHERE u.user_id = $1 AND u.tenant_id = $2 AND (${scopeSql})`,
      params,
    );
    if (!rows.length)
      throw new NotFoundException('Profile not in your search scope');
  }
}
