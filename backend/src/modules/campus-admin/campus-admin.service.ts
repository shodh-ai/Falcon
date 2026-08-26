import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import {
  CampusScopeService,
  type ScopedAuthUser,
} from '../../common/campus-scope/campus-scope.service';
import { SuperAdminService } from '../super-admin/super-admin.service';
import { TicketService } from '../helpdesk/ticket.service';
import { AdminControlService } from '../admin-control/admin-control.service';
import {
  CreateDepartmentDto,
  UpdateDepartmentDto,
} from '../admin-control/dto/admin-control.dto';
import {
  CreateCampusCourseDto,
  CreateCampusProgramDto,
  UpdateCampusCourseDto,
  UpdateCampusProgramDto,
} from './dto/campus-program-course.dto';
import {
  CreateCampusUserDto,
  UpdateCampusUserDto,
} from './dto/campus-user.dto';
import { UpdateCampusRolePermissionsDto } from './dto/campus-role-permissions.dto';
import { ROLE_PERMISSIONS } from '../../common/config/role-permissions.matrix';

/** Roles Campus Admin may assign — never SuperAdmin / Registrar / CampusAdmin / exec. */
const CAMPUS_ADMIN_ASSIGNABLE_ROLES = [
  'Faculty',
  'HOD',
  'Dean',
  'Student',
  'Warden',
  'Librarian',
  'LabAdmin',
  'TransportOfficer',
  'Accountant',
  'HR',
  'HRAdmin',
] as const;

/** Resources Campus Admin may grant — never wildcard / university-wide control. */
const CAMPUS_ADMIN_PERMISSION_RESOURCES = [
  'academics',
  'students',
  'timetables',
  'attendance',
  'marks',
  'faculty',
  'staff',
  'departments',
  'programs',
  'classrooms',
  'facilities',
  'announcements',
  'events',
  'helpdesk',
  'hostel',
  'library',
  'labs',
  'transport',
  'finance',
  'reports',
  'discipline',
  'leave_requests',
  'own_profile',
] as const;

const CAMPUS_ADMIN_FORBIDDEN_RESOURCES = new Set([
  '*',
  'global_data',
  'all_policies',
  'admin_ops',
  'academic_rules',
  'policy_vault',
  'audit_logs',
  'impersonation',
  'tenant_settings',
  'role_permissions',
]);

const CAMPUS_PERMISSION_ACTIONS = [
  'read',
  'create',
  'edit',
  'delete',
  'approve',
] as const;

const CAMPUS_ADMIN_FORBIDDEN_ROLES = new Set([
  'superadmin',
  'campusadmin',
  'registrar',
  'president',
  'chairman',
  'vicechancellor',
  'vice chancellor',
  'cfo',
  'coo',
]);

type QueryExecutor = { query: (sql: string, params?: unknown[]) => Promise<unknown> };

@Injectable()
export class CampusAdminService {
  private userRolesHasTenantId: boolean | null = null;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly campusScope: CampusScopeService,
    private readonly superAdmin: SuperAdminService,
    private readonly ticketService: TicketService,
    private readonly adminControl: AdminControlService,
  ) {}

  private tenant(user: ScopedAuthUser) {
    return user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  async dashboard(user: ScopedAuthUser) {
    const campusIds = await this.campusScope.requireCampusIds(user);
    const [profile, departments, programs, faculty, students, applications] =
      await Promise.all([
        this.profile(user, campusIds),
        this.departments(user, campusIds),
        this.programs(user, campusIds),
        this.facultyStaff(user, campusIds),
        this.students(user, campusIds),
        this.applications(user, campusIds).catch(() => []),
      ]);
    return {
      campuses: profile,
      kpis: [
        { label: 'Campuses', value: profile.length },
        { label: 'Departments', value: departments.length },
        { label: 'Programs', value: programs.length },
        { label: 'Faculty & staff', value: faculty.length },
        { label: 'Students', value: students.length },
        { label: 'Applications', value: applications.length },
      ],
    };
  }

  async profile(user: ScopedAuthUser, campusIds?: number[]) {
    const ids = campusIds ?? (await this.campusScope.requireCampusIds(user));
    return this.dataSource.query(
      `SELECT c.campus_id,
              c.campus_name,
              c.campus_code,
              c.address,
              t.name AS university_name,
              t.logo_url AS university_logo_url
       FROM campuses c
       LEFT JOIN tenants t ON t.tenant_id = $2
       WHERE c.campus_id = ANY($1::int[])
         AND c.deleted_at IS NULL
       ORDER BY c.campus_name ASC`,
      [ids, this.tenant(user)],
    );
  }

  async updateProfile(
    user: ScopedAuthUser,
    dto: {
      campus_id?: number;
      campus_name?: string;
      campus_code?: string;
      address?: string;
    },
  ) {
    const ids = await this.campusScope.requireCampusIds(user);
    const targetId =
      dto.campus_id != null && Number.isInteger(Number(dto.campus_id))
        ? Number(dto.campus_id)
        : ids[0];
    this.campusScope.assertCampusIdAllowed(ids, targetId);

    const name =
      dto.campus_name != null ? String(dto.campus_name).trim() : undefined;
    const code =
      dto.campus_code != null
        ? String(dto.campus_code).trim().toUpperCase() || null
        : undefined;
    const address =
      dto.address != null ? String(dto.address).trim() || null : undefined;

    if (name === undefined && code === undefined && address === undefined) {
      throw new BadRequestException('No campus profile fields to update');
    }
    if (name !== undefined && !name) {
      throw new BadRequestException('Campus name is required');
    }

    const [row] = await this.dataSource.query(
      `UPDATE campuses
       SET campus_name = COALESCE($2, campus_name),
           campus_code = CASE WHEN $3::boolean THEN $4 ELSE campus_code END,
           address = CASE WHEN $5::boolean THEN $6 ELSE address END,
           updated_at = NOW()
       WHERE campus_id = $1
         AND deleted_at IS NULL
       RETURNING campus_id, campus_name, campus_code, address`,
      [
        targetId,
        name ?? null,
        code !== undefined,
        code ?? null,
        address !== undefined,
        address ?? null,
      ],
    );
    if (!row) {
      throw new NotFoundException('Campus was not found');
    }
    return row;
  }

  async departments(
    user: ScopedAuthUser,
    campusIds?: number[],
    filters: {
      q?: string;
      status?: 'active' | 'inactive' | 'all';
      school_id?: number;
    } = {},
  ) {
    // Ensure campus assignment; AdminControlService also scopes by actor campus.
    if (campusIds?.length) {
      /* prefer caller-provided scope for dashboard batching */
    } else {
      await this.campusScope.requireCampusIds(user);
    }
    return this.adminControl.listDepartments(user, {
      q: filters.q,
      status: filters.status ?? 'active',
      school_id: filters.school_id,
    });
  }

  async departmentLookups(user: ScopedAuthUser) {
    await this.campusScope.requireCampusIds(user);
    return this.adminControl.listDepartmentLookups(user);
  }

  async departmentHodCandidates(
    user: ScopedAuthUser,
    q?: string,
    deptId?: number,
  ) {
    await this.campusScope.requireCampusIds(user);
    return this.adminControl.listHodCandidates(
      user,
      this.tenant(user),
      q,
      deptId,
    );
  }

  async createDepartment(user: ScopedAuthUser, dto: CreateDepartmentDto) {
    await this.campusScope.requireCampusIds(user);
    if (!user.user_id) {
      throw new ForbiddenException('Authenticated Campus Admin required');
    }
    const actor = { ...user, user_id: user.user_id };
    return this.adminControl.createDepartment(this.tenant(user), actor, dto);
  }

  async updateDepartment(
    user: ScopedAuthUser,
    deptId: number,
    dto: UpdateDepartmentDto,
  ) {
    await this.campusScope.requireCampusIds(user);
    if (!user.user_id) {
      throw new ForbiddenException('Authenticated Campus Admin required');
    }
    const actor = { ...user, user_id: user.user_id };
    return this.adminControl.updateDepartment(
      this.tenant(user),
      actor,
      deptId,
      dto,
    );
  }

  async deactivateDepartment(user: ScopedAuthUser, deptId: number) {
    await this.campusScope.requireCampusIds(user);
    if (!user.user_id) {
      throw new ForbiddenException('Authenticated Campus Admin required');
    }
    const actor = { ...user, user_id: user.user_id };
    return this.adminControl.deleteDepartment(this.tenant(user), actor, deptId);
  }

  async activateDepartment(user: ScopedAuthUser, deptId: number) {
    await this.campusScope.requireCampusIds(user);
    if (!user.user_id) {
      throw new ForbiddenException('Authenticated Campus Admin required');
    }
    const actor = { ...user, user_id: user.user_id };
    return this.adminControl.restoreDepartment(this.tenant(user), actor, deptId);
  }

  async departmentDetail(user: ScopedAuthUser, deptId: number) {
    if (!Number.isInteger(deptId) || deptId <= 0) {
      throw new NotFoundException('Department was not found on this campus');
    }
    const ids = await this.campusScope.requireCampusIds(user);
    const rows = await this.dataSource.query(
      `SELECT d.dept_id, d.dept_name, d.dept_code, d.description, d.created_at,
              d.hod_user_id,
              CASE WHEN d.deleted_at IS NULL THEN 'ACTIVE' ELSE 'INACTIVE' END AS status,
              s.school_id, s.school_name, s.school_code,
              c.campus_id, c.campus_name, c.campus_code,
              hod.name AS hod_name, hod.official_email AS hod_email,
              dean.name AS dean_name, dean.official_email AS dean_email,
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
                  AND COALESCE(x.is_active, true)
                  AND lower(r.role_name) = 'student') AS student_count,
              (SELECT COUNT(*)::int FROM academic_courses ac
                WHERE ac.entity_id = d.dept_id AND ac.deleted_at IS NULL) AS course_count
       FROM departments d
       JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
       JOIN campuses c ON c.campus_id = s.campus_id AND c.deleted_at IS NULL
       LEFT JOIN users hod ON hod.user_id = d.hod_user_id
       LEFT JOIN users dean ON dean.user_id = s.dean_user_id
       WHERE d.dept_id = $1
         AND s.campus_id = ANY($2::int[])
       LIMIT 1`,
      [deptId, ids],
    );
    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      throw new NotFoundException('Department was not found on this campus');
    }
    return {
      dept_id: Number(row.dept_id),
      dept_name: String(row.dept_name ?? ''),
      dept_code: (row.dept_code as string | null) ?? null,
      description: (row.description as string | null) ?? null,
      status: (row.status as string | null) ?? 'ACTIVE',
      created_at: row.created_at ? String(row.created_at) : null,
      school_id: row.school_id != null ? Number(row.school_id) : null,
      school_name: (row.school_name as string | null) ?? null,
      school_code: (row.school_code as string | null) ?? null,
      campus_id: row.campus_id != null ? Number(row.campus_id) : null,
      campus_name: (row.campus_name as string | null) ?? null,
      campus_code: (row.campus_code as string | null) ?? null,
      hod_user_id: (row.hod_user_id as string | null) ?? null,
      hod_name: (row.hod_name as string | null) ?? null,
      hod_email: (row.hod_email as string | null) ?? null,
      dean_name: (row.dean_name as string | null) ?? null,
      dean_email: (row.dean_email as string | null) ?? null,
      program_count: Number(row.program_count ?? 0),
      faculty_count: Number(row.faculty_count ?? 0),
      student_count: Number(row.student_count ?? 0),
      course_count: Number(row.course_count ?? 0),
    };
  }

  async programs(
    user: ScopedAuthUser,
    campusIds?: number[],
    status: 'active' | 'inactive' | 'all' = 'active',
  ) {
    const ids = campusIds ?? (await this.campusScope.requireCampusIds(user));
    const statusSql =
      status === 'inactive'
        ? 'AND p.deleted_at IS NOT NULL'
        : status === 'all'
          ? ''
          : 'AND p.deleted_at IS NULL';
    try {
      return await this.dataSource.query(
        `SELECT p.program_id, p.program_name, p.program_code, p.duration_years,
                p.school_id, p.dept_id, s.school_name, s.campus_id, c.campus_name,
                d.dept_name,
                CASE WHEN p.deleted_at IS NULL THEN 'ACTIVE' ELSE 'INACTIVE' END AS status,
                (SELECT COUNT(*)::int FROM academic_sis_batches b
                  WHERE b.program_id = p.program_id AND b.deleted_at IS NULL) AS batch_count,
                (SELECT COUNT(*)::int FROM academic_subjects sub
                  WHERE sub.program_id = p.program_id AND sub.deleted_at IS NULL) AS course_count
         FROM iam_programs p
         JOIN schools s ON s.school_id = p.school_id AND s.deleted_at IS NULL
         JOIN campuses c ON c.campus_id = s.campus_id AND c.deleted_at IS NULL
         LEFT JOIN departments d ON d.dept_id = p.dept_id AND d.deleted_at IS NULL
         WHERE s.campus_id = ANY($1::int[])
           ${statusSql}
         ORDER BY c.campus_name, p.program_name`,
        [ids],
      );
    } catch {
      return this.dataSource.query(
        `SELECT p.program_id, p.program_name, p.program_code, p.duration_years,
                p.school_id, p.dept_id, s.school_name, s.campus_id, c.campus_name,
                d.dept_name,
                CASE WHEN p.deleted_at IS NULL THEN 'ACTIVE' ELSE 'INACTIVE' END AS status,
                NULL::int AS batch_count, NULL::int AS course_count
         FROM iam_programs p
         JOIN schools s ON s.school_id = p.school_id AND s.deleted_at IS NULL
         JOIN campuses c ON c.campus_id = s.campus_id AND c.deleted_at IS NULL
         LEFT JOIN departments d ON d.dept_id = p.dept_id AND d.deleted_at IS NULL
         WHERE s.campus_id = ANY($1::int[])
           ${statusSql}
         ORDER BY c.campus_name, p.program_name`,
        [ids],
      );
    }
  }

  async programDetail(user: ScopedAuthUser, programId: number) {
    if (!Number.isInteger(programId) || programId <= 0) {
      throw new NotFoundException('Program was not found on this campus');
    }
    const ids = await this.campusScope.requireCampusIds(user);
    const [row] = await this.dataSource.query(
      `SELECT p.program_id, p.program_name, p.program_code, p.duration_years,
              p.school_id, p.dept_id, p.created_at, p.updated_at,
              CASE WHEN p.deleted_at IS NULL THEN 'ACTIVE' ELSE 'INACTIVE' END AS status,
              s.school_name, s.school_code, s.campus_id,
              c.campus_name, c.campus_code,
              d.dept_name, d.dept_code,
              hod.name AS hod_name, hod.official_email AS hod_email
       FROM iam_programs p
       JOIN schools s ON s.school_id = p.school_id AND s.deleted_at IS NULL
       JOIN campuses c ON c.campus_id = s.campus_id AND c.deleted_at IS NULL
       LEFT JOIN departments d ON d.dept_id = p.dept_id AND d.deleted_at IS NULL
       LEFT JOIN users hod ON hod.user_id = d.hod_user_id
       WHERE p.program_id = $1
         AND s.campus_id = ANY($2::int[])
       LIMIT 1`,
      [programId, ids],
    );
    if (!row) {
      throw new NotFoundException('Program was not found on this campus');
    }

    let subjects: unknown[] = [];
    try {
      subjects = await this.dataSource.query(
        `SELECT subject_id, subject_code, subject_name, semester, credits
         FROM academic_subjects
         WHERE program_id = $1 AND deleted_at IS NULL
         ORDER BY semester NULLS LAST, subject_code
         LIMIT 20`,
        [programId],
      );
    } catch {
      subjects = [];
    }

    let batches: unknown[] = [];
    try {
      batches = await this.dataSource.query(
        `SELECT batch_id, batch_name, academic_year, start_year, end_year,
                CASE WHEN deleted_at IS NULL THEN 'ACTIVE' ELSE 'INACTIVE' END AS status
         FROM academic_sis_batches
         WHERE program_id = $1 AND deleted_at IS NULL
         ORDER BY academic_year DESC NULLS LAST, batch_name
         LIMIT 20`,
        [programId],
      );
    } catch {
      try {
        batches = await this.dataSource.query(
          `SELECT batch_id, batch_name,
                  CASE WHEN deleted_at IS NULL THEN 'ACTIVE' ELSE 'INACTIVE' END AS status
           FROM academic_sis_batches
           WHERE program_id = $1 AND deleted_at IS NULL
           ORDER BY batch_name
           LIMIT 20`,
          [programId],
        );
      } catch {
        batches = [];
      }
    }

    let linkedCourses: unknown[] = [];
    try {
      linkedCourses = await this.dataSource.query(
        `SELECT DISTINCT ac.course_id, ac.course_code, ac.course_name, ac.credits, ac.is_elective
         FROM academic_courses ac
         JOIN academic_course_allocations ca
           ON ca.course_id = ac.course_id AND ca.tenant_id = ac.tenant_id
         WHERE ac.deleted_at IS NULL
           AND (
             ca.program_id = $1
             OR lower(COALESCE(ca.program_name, '')) = lower($2)
           )
         ORDER BY ac.course_code
         LIMIT 20`,
        [programId, String(row.program_name ?? '')],
      );
    } catch {
      linkedCourses = [];
    }

    const studentCount = await this.dataSource
      .query(
        `SELECT COUNT(*)::int AS c
         FROM users u
         JOIN roles r ON r.role_id = u.role_id
         WHERE u.dept_id = $1
           AND lower(r.role_name) = 'student'
           AND COALESCE(u.is_active, true)`,
        [row.dept_id],
      )
      .catch(() => [{ c: 0 }]);

    return {
      program: {
        program_id: Number(row.program_id),
        program_name: String(row.program_name ?? ''),
        program_code: (row.program_code as string | null) ?? null,
        duration_years:
          row.duration_years == null ? null : Number(row.duration_years),
        status: String(row.status ?? 'ACTIVE'),
        created_at: row.created_at ? String(row.created_at) : null,
        updated_at: row.updated_at ? String(row.updated_at) : null,
        school_id: row.school_id == null ? null : Number(row.school_id),
        school_name: (row.school_name as string | null) ?? null,
        school_code: (row.school_code as string | null) ?? null,
        campus_id: row.campus_id == null ? null : Number(row.campus_id),
        campus_name: (row.campus_name as string | null) ?? null,
        campus_code: (row.campus_code as string | null) ?? null,
        dept_id: row.dept_id == null ? null : Number(row.dept_id),
        dept_name: (row.dept_name as string | null) ?? null,
        dept_code: (row.dept_code as string | null) ?? null,
        hod_name: (row.hod_name as string | null) ?? null,
        hod_email: (row.hod_email as string | null) ?? null,
      },
      counts: {
        subjects: subjects.length,
        courses: linkedCourses.length,
        batches: batches.length,
        students: Number((studentCount as Array<{ c: number }>)[0]?.c ?? 0),
      },
      subjects,
      courses: linkedCourses,
      batches,
    };
  }

  async courses(
    user: ScopedAuthUser,
    campusIds?: number[],
    status: 'active' | 'inactive' | 'all' = 'active',
  ) {
    const ids = campusIds ?? (await this.campusScope.requireCampusIds(user));
    const statusSql =
      status === 'inactive'
        ? 'AND c.deleted_at IS NOT NULL'
        : status === 'all'
          ? ''
          : 'AND c.deleted_at IS NULL';
    try {
      return await this.dataSource.query(
        `SELECT c.course_id, c.course_code, c.course_name, c.credits, c.is_elective,
                c.entity_id AS dept_id,
                CASE WHEN c.deleted_at IS NULL THEN 'ACTIVE' ELSE 'INACTIVE' END AS status,
                d.dept_name, s.school_name,
                a.semester, a.program_name
         FROM academic_courses c
         JOIN departments d ON d.dept_id = c.entity_id
         JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
         LEFT JOIN LATERAL (
           SELECT ca.semester, ca.program_name
           FROM academic_course_allocations ca
           WHERE ca.course_id = c.course_id AND ca.tenant_id = c.tenant_id
           ORDER BY ca.created_at DESC NULLS LAST
           LIMIT 1
         ) a ON TRUE
         WHERE c.tenant_id = $1
           AND s.campus_id = ANY($2::int[])
           ${statusSql}
         ORDER BY c.course_code ASC
         LIMIT 400`,
        [this.tenant(user), ids],
      );
    } catch {
      return [];
    }
  }

  private static readonly STAFF_ROLES_SQL = `
    'faculty', 'hod', 'dean', 'warden', 'librarian', 'labadmin',
    'transportofficer', 'accountant', 'hr', 'hradmin'
  `;

  private static readonly FACULTY_ROLE_SQL = `'faculty', 'dean'`;
  private static readonly HOD_ROLE_SQL = `'hod'`;
  private static readonly ADMIN_STAFF_ROLE_SQL = `
    'warden', 'librarian', 'labadmin', 'transportofficer', 'accountant', 'hr', 'hradmin'
  `;

  private roleNamesSql(role?: string | null): string {
    const normalized = String(role ?? '').trim().toLowerCase();
    if (normalized === 'faculty') {
      return CampusAdminService.FACULTY_ROLE_SQL;
    }
    if (normalized === 'hod') {
      return CampusAdminService.HOD_ROLE_SQL;
    }
    if (normalized === 'staff') {
      return CampusAdminService.ADMIN_STAFF_ROLE_SQL;
    }
    return CampusAdminService.STAFF_ROLES_SQL;
  }

  async facultyStaff(
    user: ScopedAuthUser,
    campusIds?: number[],
    role?: string | null,
  ) {
    const ids = campusIds ?? (await this.campusScope.requireCampusIds(user));
    const roleSql = this.roleNamesSql(role);
    return this.dataSource.query(
      `SELECT u.user_id, u.name, u.official_email AS email, r.role_name,
              d.dept_name, s.school_name, c.campus_name
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id AND d.deleted_at IS NULL
       LEFT JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
       LEFT JOIN campuses c ON c.campus_id = s.campus_id AND c.deleted_at IS NULL
       WHERE u.tenant_id = $1
         AND u.is_active = true
         AND lower(r.role_name) IN (${roleSql})
         AND s.campus_id = ANY($2::int[])
       ORDER BY r.role_name, u.name
       LIMIT 300`,
      [this.tenant(user), ids],
    );
  }

  async facultyStaffDetail(user: ScopedAuthUser, userId: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      throw new NotFoundException('Faculty or staff member was not found on this campus');
    }
    const ids = await this.campusScope.requireCampusIds(user);
    const rows = await this.dataSource.query(
      `SELECT u.user_id, u.name, u.official_email AS email, u.phone, u.is_active,
              u.onboarding_status, u.onboarding_profile,
              r.role_name, d.dept_name, s.school_name, c.campus_name,
              ro.name AS reporting_officer_name,
              p.employee_id, p.designation, p.joining_date,
              p.total_experience_years, p.industry_experience_years,
              p.orcid_id, p.scopus_id, p.google_scholar_url, p.week_off_day,
              sh.shift_name
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id AND d.deleted_at IS NULL
       LEFT JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
       LEFT JOIN campuses c ON c.campus_id = s.campus_id AND c.deleted_at IS NULL
       LEFT JOIN users ro ON ro.user_id = u.reporting_officer_id
       LEFT JOIN hr_employee_profiles p
         ON p.user_id = u.user_id AND p.tenant_id = u.tenant_id AND p.deleted_at IS NULL
       LEFT JOIN hr_shifts sh ON sh.shift_id = p.shift_id AND sh.deleted_at IS NULL
       WHERE u.tenant_id = $1
         AND u.user_id = $2
         AND lower(r.role_name) IN (${CampusAdminService.STAFF_ROLES_SQL})
         AND s.campus_id = ANY($3::int[])
       LIMIT 1`,
      [this.tenant(user), userId, ids],
    );
    const row = rows[0] as
      | {
          user_id: string;
          name: string;
          email?: string | null;
          phone?: string | null;
          is_active?: boolean;
          onboarding_status?: string | null;
          onboarding_profile?: Record<string, unknown> | null;
          role_name?: string | null;
          dept_name?: string | null;
          school_name?: string | null;
          campus_name?: string | null;
          reporting_officer_name?: string | null;
          employee_id?: string | null;
          designation?: string | null;
          joining_date?: string | Date | null;
          total_experience_years?: string | number | null;
          industry_experience_years?: string | number | null;
          orcid_id?: string | null;
          scopus_id?: string | null;
          google_scholar_url?: string | null;
          week_off_day?: number | null;
          shift_name?: string | null;
        }
      | undefined;
    if (!row) {
      throw new NotFoundException('Faculty or staff member was not found on this campus');
    }

    const onboarding = (row.onboarding_profile ?? {}) as Record<string, unknown>;
    const weekDays = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];
    const weekOff =
      row.week_off_day == null ? null : weekDays[Number(row.week_off_day)] ?? null;

    let qualifications: Array<{
      degree_level?: string | null;
      degree_name?: string | null;
      university?: string | null;
      passing_year?: number | null;
      specialization?: string | null;
    }> = [];
    try {
      qualifications = await this.dataSource.query(
        `SELECT degree_level, degree_name, university, passing_year, specialization
         FROM hr_academic_qualifications
         WHERE tenant_id = $1 AND user_id = $2
         ORDER BY passing_year DESC NULLS LAST, created_at DESC`,
        [this.tenant(user), userId],
      );
    } catch {
      qualifications = [];
    }

    return {
      user_id: row.user_id,
      name: row.name,
      email: row.email ?? null,
      phone:
        row.phone ??
        (typeof onboarding.staff_mobile === 'string' ? onboarding.staff_mobile : null),
      gender: typeof onboarding.gender === 'string' ? onboarding.gender : null,
      is_active: Boolean(row.is_active),
      onboarding_status: row.onboarding_status ?? null,
      role_name: row.role_name ?? null,
      dept_name: row.dept_name ?? null,
      school_name: row.school_name ?? null,
      campus_name: row.campus_name ?? null,
      reporting_officer_name: row.reporting_officer_name ?? null,
      employee_id: row.employee_id ?? null,
      designation: row.designation ?? null,
      joining_date: row.joining_date
        ? String(row.joining_date).slice(0, 10)
        : null,
      total_experience_years:
        row.total_experience_years != null
          ? Number(row.total_experience_years)
          : null,
      industry_experience_years:
        row.industry_experience_years != null
          ? Number(row.industry_experience_years)
          : null,
      orcid_id: row.orcid_id ?? null,
      scopus_id: row.scopus_id ?? null,
      google_scholar_url: row.google_scholar_url ?? null,
      week_off: weekOff,
      shift_name: row.shift_name ?? null,
      qualifications,
    };
  }

  async students(user: ScopedAuthUser, campusIds?: number[]) {
    const ids = campusIds ?? (await this.campusScope.requireCampusIds(user));
    const tenantId = this.tenant(user);
    const campusClause = this.campusScope.studentCampusVisibilityClause(1, 2);
    return this.dataSource.query(
      `SELECT u.user_id, u.name, u.official_email AS email,
              COALESCE(d.dept_name, sp.program_name) AS dept_name,
              COALESCE(s.school_name, sp.school_name) AS school_name,
              c.campus_name
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id AND d.deleted_at IS NULL
       LEFT JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
       LEFT JOIN campuses c ON c.campus_id = s.campus_id AND c.deleted_at IS NULL
       WHERE u.tenant_id = $1
         AND u.is_active = true
         AND lower(r.role_name) = 'student'
         AND ${campusClause}
       ORDER BY u.name
       LIMIT 400`,
      [tenantId, ids],
    );
  }

  async studentsDetail(user: ScopedAuthUser, userId: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      throw new NotFoundException('Student was not found on this campus');
    }
    const ids = await this.campusScope.requireCampusIds(user);
    const campusClause = this.campusScope.studentCampusVisibilityClause(1, 3);
    const rows = await this.dataSource.query(
      `SELECT u.user_id, u.name, u.official_email AS email, u.phone AS user_phone,
              u.is_active, u.onboarding_status,
              COALESCE(d.dept_name, sp.program_name) AS dept_name,
              COALESCE(s.school_name, sp.school_name) AS school_name,
              c.campus_name,
              sp.enrollment_no, sp.enrollment_number, sp.prn_number, sp.admission_number,
              sp.abc_id, sp.batch, sp.current_semester, sp.section_code,
              sp.program_name, sp.degree_name, sp.advisor_name,
              sp.status, sp.lifecycle_status, sp.admission_status, sp.admission_type,
              sp.gender, sp.date_of_birth, sp.blood_group, sp.nationality, sp.category,
              sp.phone AS profile_phone, sp.parent_info
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id AND d.deleted_at IS NULL
       LEFT JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
       LEFT JOIN campuses c ON c.campus_id = s.campus_id AND c.deleted_at IS NULL
       LEFT JOIN student_profiles sp
         ON sp.user_id = u.user_id
        AND (sp.tenant_id IS NULL OR sp.tenant_id = u.tenant_id)
        AND sp.deleted_at IS NULL
       WHERE u.tenant_id = $1
         AND u.user_id = $2
         AND lower(r.role_name) = 'student'
         AND ${campusClause}
       LIMIT 1`,
      [this.tenant(user), userId, ids],
    );
    const row = rows[0] as
      | {
          user_id: string;
          name: string;
          email?: string | null;
          user_phone?: string | null;
          profile_phone?: string | null;
          is_active?: boolean;
          onboarding_status?: string | null;
          dept_name?: string | null;
          school_name?: string | null;
          campus_name?: string | null;
          enrollment_no?: string | null;
          enrollment_number?: string | null;
          prn_number?: string | null;
          admission_number?: string | null;
          abc_id?: string | null;
          batch?: string | null;
          current_semester?: number | string | null;
          section_code?: string | null;
          program_name?: string | null;
          degree_name?: string | null;
          advisor_name?: string | null;
          status?: string | null;
          lifecycle_status?: string | null;
          admission_status?: string | null;
          admission_type?: string | null;
          gender?: string | null;
          date_of_birth?: string | Date | null;
          blood_group?: string | null;
          nationality?: string | null;
          category?: string | null;
          parent_info?: Record<string, unknown> | null;
        }
      | undefined;
    if (!row) {
      throw new NotFoundException('Student was not found on this campus');
    }

    const parent = (row.parent_info ?? {}) as Record<string, unknown>;
    const text = (value: unknown) =>
      typeof value === 'string' && value.trim() ? value.trim() : null;

    return {
      user_id: row.user_id,
      name: row.name,
      email: row.email ?? null,
      phone: row.user_phone ?? row.profile_phone ?? text(parent.parent_contact_phone),
      is_active: Boolean(row.is_active),
      onboarding_status: row.onboarding_status ?? null,
      dept_name: row.dept_name ?? null,
      school_name: row.school_name ?? null,
      campus_name: row.campus_name ?? null,
      enrollment_no: row.enrollment_no ?? row.enrollment_number ?? null,
      prn_number: row.prn_number ?? null,
      admission_number: row.admission_number ?? null,
      abc_id: row.abc_id ?? null,
      batch: row.batch ?? null,
      current_semester:
        row.current_semester != null && row.current_semester !== ''
          ? Number(row.current_semester)
          : null,
      section_code: row.section_code ?? null,
      program_name: row.program_name ?? null,
      degree_name: row.degree_name ?? null,
      advisor_name: row.advisor_name ?? null,
      status: row.lifecycle_status ?? row.status ?? row.admission_status ?? null,
      admission_type: row.admission_type ?? null,
      gender: row.gender ?? null,
      date_of_birth: row.date_of_birth ? String(row.date_of_birth).slice(0, 10) : null,
      blood_group: row.blood_group ?? null,
      nationality: row.nationality ?? null,
      category: row.category ?? null,
      father_name: text(parent.father_name),
      mother_name: text(parent.mother_name),
      emergency_contact_name: text(parent.emergency_contact_name),
      emergency_contact_phone:
        text(parent.emergency_contact_phone) ?? text(parent.parent_contact_phone),
    };
  }

  async applications(user: ScopedAuthUser, campusIds?: number[]) {
    const ids = campusIds ?? (await this.campusScope.requireCampusIds(user));
    return this.dataSource.query(
      `SELECT a.application_id, a.status, a.submitted_at, a.created_at, a.program_id,
              p.program_name, p.program_code, s.school_name, c.campus_name,
              l.full_name, l.email, l.phone, l.stage AS lead_stage, l.source, l.lead_score
       FROM admissions_applications a
       LEFT JOIN admissions_leads l ON l.lead_id = a.lead_id AND l.deleted_at IS NULL
       JOIN iam_programs p ON p.program_id = COALESCE(a.program_id, l.preferred_program_id)
         AND p.deleted_at IS NULL
       JOIN schools s ON s.school_id = p.school_id AND s.deleted_at IS NULL
       JOIN campuses c ON c.campus_id = s.campus_id AND c.deleted_at IS NULL
       WHERE a.deleted_at IS NULL
         AND s.campus_id = ANY($1::int[])
       ORDER BY COALESCE(a.submitted_at, a.created_at) DESC NULLS LAST
       LIMIT 300`,
      [ids],
    );
  }

  async applicationsDetail(user: ScopedAuthUser, applicationId: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(applicationId)) {
      throw new NotFoundException('Application was not found on this campus');
    }
    const ids = await this.campusScope.requireCampusIds(user);
    const rows = await this.dataSource.query(
      `SELECT a.application_id, a.status, a.submitted_at, a.created_at, a.updated_at,
              a.program_id, a.form_data,
              p.program_name, p.program_code, p.duration_years,
              s.school_name, s.school_code, c.campus_name, c.campus_code,
              l.full_name, l.email, l.phone, l.stage AS lead_stage, l.source,
              l.lead_score, l.metadata
       FROM admissions_applications a
       LEFT JOIN admissions_leads l ON l.lead_id = a.lead_id AND l.deleted_at IS NULL
       JOIN iam_programs p ON p.program_id = COALESCE(a.program_id, l.preferred_program_id)
         AND p.deleted_at IS NULL
       JOIN schools s ON s.school_id = p.school_id AND s.deleted_at IS NULL
       JOIN campuses c ON c.campus_id = s.campus_id AND c.deleted_at IS NULL
       WHERE a.application_id = $1
         AND a.deleted_at IS NULL
         AND s.campus_id = ANY($2::int[])
       LIMIT 1`,
      [applicationId, ids],
    );
    const row = rows[0] as
      | {
          application_id: string;
          status?: string | null;
          submitted_at?: string | Date | null;
          created_at?: string | Date | null;
          updated_at?: string | Date | null;
          program_id?: number | null;
          form_data?: Record<string, unknown> | null;
          program_name?: string | null;
          program_code?: string | null;
          duration_years?: number | string | null;
          school_name?: string | null;
          school_code?: string | null;
          campus_name?: string | null;
          campus_code?: string | null;
          full_name?: string | null;
          email?: string | null;
          phone?: string | null;
          lead_stage?: string | null;
          source?: string | null;
          lead_score?: number | string | null;
          metadata?: Record<string, unknown> | null;
        }
      | undefined;
    if (!row) {
      throw new NotFoundException('Application was not found on this campus');
    }

    let documents: Array<{ document_kind: string; status: string }> = [];
    try {
      documents = await this.dataSource.query(
        `SELECT document_kind, status
         FROM admissions_document_verifications
         WHERE application_id = $1 AND deleted_at IS NULL
         ORDER BY created_at DESC`,
        [applicationId],
      );
    } catch {
      documents = [];
    }

    const form = (row.form_data ?? {}) as Record<string, unknown>;
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const text = (value: unknown) =>
      typeof value === 'string' && value.trim() ? value.trim() : null;

    return {
      application_id: row.application_id,
      status: row.status ?? null,
      submitted_at: row.submitted_at ? String(row.submitted_at) : null,
      created_at: row.created_at ? String(row.created_at) : null,
      updated_at: row.updated_at ? String(row.updated_at) : null,
      program_id: row.program_id != null ? Number(row.program_id) : null,
      program_name: row.program_name ?? null,
      program_code: row.program_code ?? null,
      duration_years:
        row.duration_years != null && row.duration_years !== ''
          ? Number(row.duration_years)
          : null,
      school_name: row.school_name ?? null,
      school_code: row.school_code ?? null,
      campus_name: row.campus_name ?? null,
      campus_code: row.campus_code ?? null,
      full_name: row.full_name ?? text(form.full_name) ?? text(form.name),
      email: row.email ?? text(form.email),
      phone: row.phone ?? text(form.phone),
      lead_stage: row.lead_stage ?? null,
      source: row.source ?? text(meta.source),
      lead_score: row.lead_score != null ? Number(row.lead_score) : null,
      counsellor: text(meta.counsellor),
      gender: text(form.gender),
      date_of_birth: text(form.date_of_birth) ?? text(form.dob),
      category: text(form.category),
      city: text(form.city),
      state: text(form.state),
      documents,
    };
  }

  async classrooms(user: ScopedAuthUser) {
    const campusIds = await this.campusScope.requireCampusIds(user);
    try {
      return await this.dataSource.query(
        `SELECT v.venue_id, v.name, v.capacity, v.amenities,
                v.is_bookable_by_students, v.approver_role, v.max_duration_mins,
                v.campus_id, v.created_at,
                COALESCE(b.total_bookings, 0)::int AS booking_count,
                COALESCE(b.pending_bookings, 0)::int AS pending_count,
                COALESCE(b.approved_bookings, 0)::int AS approved_count
         FROM campus_venues v
         LEFT JOIN LATERAL (
           SELECT
             COUNT(*)::int AS total_bookings,
             COUNT(*) FILTER (WHERE status = 'PENDING_APPROVAL')::int AS pending_bookings,
             COUNT(*) FILTER (WHERE status = 'APPROVED')::int AS approved_bookings
           FROM venue_bookings vb
           WHERE vb.venue_id = v.venue_id AND vb.tenant_id = v.tenant_id
         ) b ON TRUE
         WHERE v.tenant_id = $1
           AND v.campus_id = ANY($2::int[])
         ORDER BY v.name ASC`,
        [this.tenant(user), campusIds],
      );
    } catch {
      // Pre-migration fallback when campus_id column is not yet present.
      try {
        return await this.dataSource.query(
          `SELECT venue_id, name, capacity, amenities, is_bookable_by_students,
                  approver_role, max_duration_mins, created_at
           FROM campus_venues
           WHERE tenant_id = $1
           ORDER BY name ASC`,
          [this.tenant(user)],
        );
      } catch {
        return [];
      }
    }
  }

  async classroomDetail(user: ScopedAuthUser, venueId: string) {
    const campusIds = await this.campusScope.requireCampusIds(user);
    if (!venueId?.trim()) {
      throw new NotFoundException('Venue was not found on this campus');
    }
    const tid = this.tenant(user);
    let venue: Record<string, unknown> | undefined;
    try {
      const [row] = await this.dataSource.query(
        `SELECT v.venue_id, v.name, v.capacity, v.amenities,
                v.is_bookable_by_students, v.approver_role, v.max_duration_mins,
                v.campus_id, v.created_at,
                COALESCE(b.total_bookings, 0)::int AS booking_count,
                COALESCE(b.pending_bookings, 0)::int AS pending_count,
                COALESCE(b.approved_bookings, 0)::int AS approved_count
         FROM campus_venues v
         LEFT JOIN LATERAL (
           SELECT
             COUNT(*)::int AS total_bookings,
             COUNT(*) FILTER (WHERE status = 'PENDING_APPROVAL')::int AS pending_bookings,
             COUNT(*) FILTER (WHERE status = 'APPROVED')::int AS approved_bookings
           FROM venue_bookings vb
           WHERE vb.venue_id = v.venue_id AND vb.tenant_id = v.tenant_id
         ) b ON TRUE
         WHERE v.tenant_id = $1
           AND v.venue_id = $2
           AND v.campus_id = ANY($3::int[])
         LIMIT 1`,
        [tid, venueId, campusIds],
      );
      venue = row;
    } catch {
      const [row] = await this.dataSource.query(
        `SELECT venue_id, name, capacity, amenities, is_bookable_by_students,
                approver_role, max_duration_mins, created_at
         FROM campus_venues
         WHERE tenant_id = $1 AND venue_id = $2
         LIMIT 1`,
        [tid, venueId],
      );
      venue = row;
    }
    if (!venue) {
      throw new NotFoundException('Venue was not found on this campus');
    }

    const bookings = await this.dataSource
      .query(
        `SELECT b.booking_id, b.start_time, b.end_time, b.purpose, b.status,
                b.approver_remarks, u.name AS student_name,
                u.official_email AS student_email
         FROM venue_bookings b
         LEFT JOIN users u ON u.user_id = b.student_user_id
         WHERE b.tenant_id = $1 AND b.venue_id = $2
         ORDER BY b.start_time DESC
         LIMIT 15`,
        [tid, venueId],
      )
      .catch(() => []);

    const amenities = Array.isArray(venue.amenities)
      ? venue.amenities
      : typeof venue.amenities === 'string'
        ? (() => {
            try {
              return JSON.parse(venue.amenities as string);
            } catch {
              return [];
            }
          })()
        : [];

    return {
      venue: {
        ...venue,
        amenities,
        capacity: venue.capacity == null ? null : Number(venue.capacity),
        max_duration_mins:
          venue.max_duration_mins == null
            ? null
            : Number(venue.max_duration_mins),
        is_bookable_by_students: Boolean(venue.is_bookable_by_students),
        booking_count: Number(venue.booking_count ?? 0),
        pending_count: Number(venue.pending_count ?? 0),
        approved_count: Number(venue.approved_count ?? 0),
        created_at: venue.created_at ? String(venue.created_at) : null,
      },
      bookings,
    };
  }

  async requests(
    user: ScopedAuthUser,
    filters?: {
      status?: string;
      category?: string;
      q?: string;
      assigned?: 'assigned' | 'unassigned' | 'me';
      limit?: number;
      offset?: number;
    },
  ) {
    const campusIds = await this.campusScope.requireCampusIds(user);
    const limit = Math.min(Math.max(Number(filters?.limit ?? 50), 1), 200);
    const offset = Math.max(Number(filters?.offset ?? 0), 0);
    const params: unknown[] = [this.tenant(user), campusIds];
    const where: string[] = [
      `t.tenant_id = $1`,
      `t.deleted_at IS NULL`,
      `t.category IN ('FACILITIES', 'HOSTEL', 'IT', 'ACADEMICS', 'OTHER')`,
      `(
         s.campus_id = ANY($2::int[])
       )`,
    ];

    if (filters?.status?.trim()) {
      params.push(filters.status.trim().toUpperCase());
      where.push(`t.status = $${params.length}`);
    }
    if (filters?.category?.trim()) {
      params.push(filters.category.trim().toUpperCase());
      where.push(`t.category = $${params.length}`);
    }
    if (filters?.q?.trim()) {
      params.push(`%${filters.q.trim()}%`);
      where.push(
        `(t.subject ILIKE $${params.length} OR t.ticket_ref ILIKE $${params.length} OR u.name ILIKE $${params.length})`,
      );
    }
    if (filters?.assigned === 'assigned') {
      where.push(`t.assigned_to_user_id IS NOT NULL`);
    } else if (filters?.assigned === 'unassigned') {
      where.push(`t.assigned_to_user_id IS NULL`);
    } else if (filters?.assigned === 'me' && user.user_id) {
      params.push(user.user_id);
      where.push(`t.assigned_to_user_id = $${params.length}`);
    }

    try {
      return await this.dataSource.query(
        `SELECT t.ticket_id, t.ticket_ref, t.category, t.subject, t.status,
                t.created_at, t.updated_at, t.sla_deadline, t.escalation_level,
                u.user_id AS submitted_by_user_id,
                u.name AS submitted_by_name,
                u.official_email AS submitted_by_email,
                au.user_id AS assigned_to_user_id,
                au.name AS assigned_to_name
         FROM helpdesk_tickets t
         JOIN users u ON u.user_id = t.student_user_id
         LEFT JOIN users au ON au.user_id = t.assigned_to_user_id
         LEFT JOIN departments d ON d.dept_id = u.dept_id AND d.deleted_at IS NULL
         LEFT JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
         WHERE ${where.join(' AND ')}
         ORDER BY
           CASE t.status
             WHEN 'PENDING' THEN 0
             WHEN 'IN_PROGRESS' THEN 1
             WHEN 'RESOLVED' THEN 2
             ELSE 3
           END,
           t.updated_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      );
    } catch {
      return [];
    }
  }

  async requestDetail(user: ScopedAuthUser, ticketId: string) {
    return this.ticketService.getTicketById(
      ticketId,
      user.user_id ?? '',
      user.role ?? 'CampusAdmin',
      this.tenant(user),
      user,
    );
  }

  async requestAssignableUsers(user: ScopedAuthUser, q?: string) {
    const campusIds = await this.campusScope.requireCampusIds(user);
    const term = q?.trim() ?? '';
    return this.dataSource.query(
      `SELECT DISTINCT u.user_id, u.name, u.official_email AS email, r.role_name
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id AND d.deleted_at IS NULL
       LEFT JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
       WHERE u.tenant_id = $1
         AND u.is_active = true
         AND u.deleted_at IS NULL
         AND lower(r.role_name) IN ('dean', 'hod', 'faculty', 'warden', 'campusadmin')
         AND (
           s.campus_id = ANY($2::int[])
           OR EXISTS (
             SELECT 1 FROM schools sc
             WHERE sc.dean_user_id = u.user_id
               AND sc.deleted_at IS NULL
               AND sc.campus_id = ANY($2::int[])
           )
           OR EXISTS (
             SELECT 1
             FROM departments hd
             JOIN schools hs ON hs.school_id = hd.school_id AND hs.deleted_at IS NULL
             WHERE hd.hod_user_id = u.user_id
               AND hd.deleted_at IS NULL
               AND hs.campus_id = ANY($2::int[])
           )
         )
         AND (
           $3::text = ''
           OR u.name ILIKE '%' || $3 || '%'
           OR u.official_email ILIKE '%' || $3 || '%'
         )
       ORDER BY u.name ASC
       LIMIT 200`,
      [this.tenant(user), campusIds, term],
    );
  }

  private async insightsSnapshot(user: ScopedAuthUser) {
    const campusIds = await this.campusScope.requireCampusIds(user);
    const tid = this.tenant(user);
    const [
      dash,
      courses,
      tickets,
      venues,
      ticketBreakdown,
      roleBreakdown,
      announcementCount,
      eventPendingCount,
      calendarCount,
      timetableCount,
    ] = await Promise.all([
      this.dashboard(user),
      this.courses(user).catch(() => []),
      this.requests(user, { limit: 8 }).catch(() => []),
      this.classrooms(user).catch(() => []),
      this.dataSource
        .query(
          `SELECT t.status, COUNT(*)::int AS count
           FROM helpdesk_tickets t
           JOIN users u ON u.user_id = t.student_user_id
           LEFT JOIN departments d ON d.dept_id = u.dept_id AND d.deleted_at IS NULL
           LEFT JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
           WHERE t.tenant_id = $1
             AND t.deleted_at IS NULL
             AND t.category IN ('FACILITIES', 'HOSTEL', 'IT', 'ACADEMICS', 'OTHER')
             AND s.campus_id = ANY($2::int[])
           GROUP BY t.status
           ORDER BY count DESC`,
          [tid, campusIds],
        )
        .catch(() => []),
      this.dataSource
        .query(
          `SELECT COALESCE(r.role_name, 'Unassigned') AS role_name, COUNT(*)::int AS count
           FROM users u
           LEFT JOIN roles r ON r.role_id = u.role_id AND r.deleted_at IS NULL
           LEFT JOIN departments d ON d.dept_id = u.dept_id AND d.deleted_at IS NULL
           LEFT JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
           WHERE u.tenant_id = $1
             AND u.deleted_at IS NULL
             AND u.is_active = true
             AND s.campus_id = ANY($2::int[])
           GROUP BY COALESCE(r.role_name, 'Unassigned')
           ORDER BY count DESC
           LIMIT 12`,
          [tid, campusIds],
        )
        .catch(() => []),
      this.dataSource
        .query(
          `SELECT COUNT(*)::int AS count
           FROM announcements
           WHERE tenant_id = $1
             AND deleted_at IS NULL`,
          [tid],
        )
        .catch(() => [{ count: 0 }]),
      this.dataSource
        .query(
          `SELECT COUNT(*)::int AS count
           FROM campus_events
           WHERE tenant_id = $1
             AND deleted_at IS NULL
             AND upper(coalesce(status, '')) IN ('PENDING', 'PENDING_APPROVAL', 'SUBMITTED')`,
          [tid],
        )
        .catch(() => [{ count: 0 }]),
      this.dataSource
        .query(
          `SELECT COUNT(*)::int AS count
           FROM campus_master_calendar
           WHERE tenant_id = $1`,
          [tid],
        )
        .catch(() => [{ count: 0 }]),
      this.dataSource
        .query(
          `SELECT COUNT(*)::int AS count
           FROM admin_timetable_slots
           WHERE tenant_id = $1`,
          [tid],
        )
        .catch(() => [{ count: 0 }]),
    ]);

    const openTickets = Array.isArray(tickets)
      ? tickets.filter((row: { status?: string }) =>
          ['PENDING', 'IN_PROGRESS'].includes(String(row.status ?? '')),
        ).length
      : 0;
    const bookableVenues = Array.isArray(venues)
      ? venues.filter((row: { is_bookable_by_students?: boolean }) =>
          Boolean(row.is_bookable_by_students),
        ).length
      : 0;

    const baseKpis = Array.isArray(dash.kpis) ? dash.kpis : [];
    const kpis = [
      ...baseKpis,
      { label: 'Courses', value: Array.isArray(courses) ? courses.length : 0 },
      { label: 'Open tickets', value: openTickets },
      {
        label: 'Announcements',
        value: Number((announcementCount as Array<{ count: number }>)[0]?.count ?? 0),
      },
      {
        label: 'Pending events',
        value: Number((eventPendingCount as Array<{ count: number }>)[0]?.count ?? 0),
      },
      {
        label: 'Calendar entries',
        value: Number((calendarCount as Array<{ count: number }>)[0]?.count ?? 0),
      },
      {
        label: 'Timetable slots',
        value: Number((timetableCount as Array<{ count: number }>)[0]?.count ?? 0),
      },
      { label: 'Venues', value: Array.isArray(venues) ? venues.length : 0 },
      { label: 'Student-bookable venues', value: bookableVenues },
    ];

    return {
      generated_at: new Date().toISOString(),
      campus_ids: campusIds,
      campuses: dash.campuses ?? [],
      kpis,
      breakdowns: {
        tickets_by_status: ticketBreakdown,
        people_by_role: roleBreakdown,
      },
      recent_tickets: Array.isArray(tickets) ? tickets : [],
      modules: [
        {
          key: 'departments',
          label: 'Departments',
          count: Number(
            baseKpis.find((k) => k.label === 'Departments')?.value ?? 0,
          ),
          href: '/campus-admin/departments',
        },
        {
          key: 'programs',
          label: 'Programs & courses',
          count: Number(
            baseKpis.find((k) => k.label === 'Programs')?.value ?? 0,
          ),
          href: '/campus-admin/programs-courses',
        },
        {
          key: 'people',
          label: 'Users',
          count: Number(
            baseKpis.find((k) => k.label === 'Faculty & staff')?.value ?? 0,
          ),
          href: '/campus-admin/people/users',
        },
        {
          key: 'students',
          label: 'Students',
          count: Number(
            baseKpis.find((k) => k.label === 'Students')?.value ?? 0,
          ),
          href: '/campus-admin/people/students',
        },
        {
          key: 'admissions',
          label: 'Applications',
          count: Number(
            baseKpis.find((k) => k.label === 'Applications')?.value ?? 0,
          ),
          href: '/campus-admin/admissions/applications',
        },
        {
          key: 'helpdesk',
          label: 'Helpdesk',
          count: openTickets,
          href: '/campus-admin/operations/requests',
        },
        {
          key: 'announcements',
          label: 'Announcements',
          count: Number((announcementCount as Array<{ count: number }>)[0]?.count ?? 0),
          href: '/campus-admin/operations/announcements',
        },
        {
          key: 'events',
          label: 'Events',
          count: Number((eventPendingCount as Array<{ count: number }>)[0]?.count ?? 0),
          href: '/campus-admin/operations/events',
        },
        {
          key: 'timetable',
          label: 'Timetable',
          count: Number((timetableCount as Array<{ count: number }>)[0]?.count ?? 0),
          href: '/campus-admin/academics/timetable',
        },
        {
          key: 'venues',
          label: 'Facilities',
          count: Array.isArray(venues) ? venues.length : 0,
          href: '/campus-admin/operations/facilities',
        },
      ],
    };
  }

  async analytics(user: ScopedAuthUser) {
    return this.insightsSnapshot(user);
  }

  async reports(user: ScopedAuthUser) {
    return this.insightsSnapshot(user);
  }

  async campusReports(
    user: ScopedAuthUser,
    filters: {
      from?: string;
      to?: string;
      academic_year?: string;
      dept_id?: number;
      program_id?: number;
    } = {},
  ) {
    const campusIds = await this.campusScope.requireCampusIds(user);
    const tid = this.tenant(user);
    const from = filters.from?.trim() || null;
    const to = filters.to?.trim() || null;
    const academicYear = filters.academic_year?.trim() || null;
    const deptId =
      Number.isFinite(filters.dept_id) && Number(filters.dept_id) > 0
        ? Number(filters.dept_id)
        : null;
    const programId =
      Number.isFinite(filters.program_id) && Number(filters.program_id) > 0
        ? Number(filters.program_id)
        : null;

    const studentCampus = this.campusScope.studentCampusVisibilityClause(1, 2);

    const [
      campuses,
      overview,
      studentsByDept,
      studentsByProgram,
      studentsByStatus,
      admissionStatus,
      admissionsByProgram,
      admissionsByDept,
      enrollmentByDept,
      enrollmentByProgram,
      enrollmentByYear,
      enrollmentTrend,
      departments,
      facultySample,
      facultyByDept,
      facultyTotals,
      staffCount,
      schoolsCount,
      venues,
      usersByRole,
      usersByDept,
      filterDepartments,
      filterPrograms,
      academicYears,
    ] = await Promise.all([
      this.profile(user, campusIds).catch(() => []),
      this.dataSource
        .query(
          `WITH campus_students AS (
             SELECT u.user_id, u.is_active, u.created_at, u.dept_id,
                    sp.program_name, sp.batch
             FROM users u
             JOIN roles r ON r.role_id = u.role_id
             LEFT JOIN student_profiles sp
               ON sp.user_id = u.user_id
              AND (sp.tenant_id IS NULL OR sp.tenant_id = u.tenant_id)
              AND sp.deleted_at IS NULL
             LEFT JOIN departments d ON d.dept_id = u.dept_id AND d.deleted_at IS NULL
             LEFT JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
             WHERE u.tenant_id = $1
               AND lower(r.role_name) = 'student'
               AND u.deleted_at IS NULL
               AND ${studentCampus}
               AND ($3::int IS NULL OR u.dept_id = $3)
               AND (
                 $4::int IS NULL
                 OR EXISTS (
                   SELECT 1 FROM iam_programs p
                   WHERE p.program_id = $4
                     AND p.deleted_at IS NULL
                     AND (
                       lower(trim(p.program_name)) = lower(trim(coalesce(sp.program_name, '')))
                       OR upper(trim(p.program_code)) = upper(trim(coalesce(sp.program_name, '')))
                     )
                 )
               )
               AND ($5::date IS NULL OR u.created_at::date >= $5::date)
               AND ($6::date IS NULL OR u.created_at::date <= $6::date)
               AND ($7::text IS NULL OR sp.batch ILIKE '%' || $7 || '%')
           ),
           campus_apps AS (
             SELECT a.application_id, a.status,
                    COALESCE(a.submitted_at, a.created_at) AS event_at
             FROM admissions_applications a
             LEFT JOIN admissions_leads l ON l.lead_id = a.lead_id AND l.deleted_at IS NULL
             JOIN iam_programs p
               ON p.program_id = COALESCE(a.program_id, l.preferred_program_id)
              AND p.deleted_at IS NULL
             JOIN schools s ON s.school_id = p.school_id AND s.deleted_at IS NULL
             WHERE a.deleted_at IS NULL
               AND s.campus_id = ANY($2::int[])
               AND ($3::int IS NULL OR p.dept_id = $3)
               AND ($4::int IS NULL OR p.program_id = $4)
               AND ($5::date IS NULL OR COALESCE(a.submitted_at, a.created_at)::date >= $5::date)
               AND ($6::date IS NULL OR COALESCE(a.submitted_at, a.created_at)::date <= $6::date)
           ),
           campus_faculty AS (
             SELECT u.user_id
             FROM users u
             JOIN roles r ON r.role_id = u.role_id
             LEFT JOIN departments d ON d.dept_id = u.dept_id AND d.deleted_at IS NULL
             LEFT JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
             WHERE u.tenant_id = $1
               AND u.deleted_at IS NULL
               AND u.is_active = true
               AND lower(r.role_name) IN (${CampusAdminService.STAFF_ROLES_SQL})
               AND s.campus_id = ANY($2::int[])
               AND ($3::int IS NULL OR u.dept_id = $3)
           )
           SELECT
             (SELECT COUNT(*)::int FROM campus_students) AS total_students,
             (SELECT COUNT(*)::int FROM campus_students WHERE is_active = true) AS active_students,
             (SELECT COUNT(*)::int FROM campus_students
               WHERE created_at >= NOW() - INTERVAL '90 days') AS new_students,
             (SELECT COUNT(*)::int FROM campus_apps) AS total_applications,
             (SELECT COUNT(*)::int FROM campus_apps
               WHERE upper(status) IN ('SUBMITTED', 'DRAFT', 'UNDER_REVIEW')) AS pending_applications,
             (SELECT COUNT(*)::int FROM campus_apps WHERE upper(status) = 'ACCEPTED') AS enrolled_applications,
             (SELECT COUNT(*)::int FROM campus_apps
               WHERE upper(status) = 'ACCEPTED'
                 AND event_at >= NOW() - INTERVAL '90 days') AS new_enrollments,
             (SELECT COUNT(*)::int FROM campus_faculty) AS faculty_staff,
             (SELECT COUNT(*)::int FROM departments d
               JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
               WHERE d.deleted_at IS NULL AND s.campus_id = ANY($2::int[])
                 AND ($3::int IS NULL OR d.dept_id = $3)) AS departments,
             (SELECT COUNT(*)::int FROM iam_programs p
               LEFT JOIN schools s ON s.school_id = p.school_id AND s.deleted_at IS NULL
               LEFT JOIN departments d ON d.dept_id = p.dept_id AND d.deleted_at IS NULL
               LEFT JOIN schools ds ON ds.school_id = d.school_id AND ds.deleted_at IS NULL
               WHERE p.deleted_at IS NULL
                 AND (s.campus_id = ANY($2::int[]) OR ds.campus_id = ANY($2::int[]))
                 AND ($3::int IS NULL OR p.dept_id = $3 OR d.dept_id = $3)
                 AND ($4::int IS NULL OR p.program_id = $4)) AS programs`,
          [tid, campusIds, deptId, programId, from, to, academicYear],
        )
        .catch(() => [{}]),
      this.dataSource
        .query(
          `SELECT COALESCE(d.dept_name, 'Unassigned') AS department,
                  COUNT(*)::int AS students,
                  COUNT(*) FILTER (WHERE u.is_active)::int AS active,
                  COUNT(*) FILTER (WHERE NOT u.is_active)::int AS inactive
           FROM users u
           JOIN roles r ON r.role_id = u.role_id
           LEFT JOIN departments d ON d.dept_id = u.dept_id AND d.deleted_at IS NULL
           LEFT JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
           LEFT JOIN student_profiles sp ON sp.user_id = u.user_id AND sp.deleted_at IS NULL
           WHERE u.tenant_id = $1 AND u.deleted_at IS NULL AND lower(r.role_name) = 'student'
             AND ${studentCampus}
             AND ($3::int IS NULL OR u.dept_id = $3)
             AND ($4::date IS NULL OR u.created_at::date >= $4::date)
             AND ($5::date IS NULL OR u.created_at::date <= $5::date)
             AND ($6::text IS NULL OR sp.batch ILIKE '%' || $6 || '%')
             AND (
               $7::int IS NULL
               OR EXISTS (
                 SELECT 1 FROM iam_programs p
                 WHERE p.program_id = $7 AND p.deleted_at IS NULL
                   AND lower(trim(p.program_name)) = lower(trim(coalesce(sp.program_name, '')))
               )
             )
           GROUP BY COALESCE(d.dept_name, 'Unassigned')
           ORDER BY students DESC
           LIMIT 20`,
          [tid, campusIds, deptId, from, to, academicYear, programId],
        )
        .catch(() => []),
      this.dataSource
        .query(
          `SELECT COALESCE(NULLIF(trim(sp.program_name), ''), 'Unassigned') AS program,
                  COUNT(*)::int AS students
           FROM users u
           JOIN roles r ON r.role_id = u.role_id
           LEFT JOIN departments d ON d.dept_id = u.dept_id AND d.deleted_at IS NULL
           LEFT JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
           LEFT JOIN student_profiles sp ON sp.user_id = u.user_id AND sp.deleted_at IS NULL
           WHERE u.tenant_id = $1 AND u.deleted_at IS NULL AND lower(r.role_name) = 'student'
             AND ${studentCampus}
             AND ($3::int IS NULL OR u.dept_id = $3)
             AND ($4::int IS NULL OR EXISTS (
               SELECT 1 FROM iam_programs p
               WHERE p.program_id = $4
                 AND lower(trim(p.program_name)) = lower(trim(coalesce(sp.program_name, '')))
             ))
             AND ($5::text IS NULL OR sp.batch ILIKE '%' || $5 || '%')
           GROUP BY COALESCE(NULLIF(trim(sp.program_name), ''), 'Unassigned')
           ORDER BY students DESC
           LIMIT 20`,
          [tid, campusIds, deptId, programId, academicYear],
        )
        .catch(() => []),
      this.dataSource
        .query(
          `SELECT CASE WHEN u.is_active THEN 'Active' ELSE 'Inactive' END AS status,
                  COUNT(*)::int AS count
           FROM users u
           JOIN roles r ON r.role_id = u.role_id
           LEFT JOIN departments d ON d.dept_id = u.dept_id AND d.deleted_at IS NULL
           LEFT JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
           LEFT JOIN student_profiles sp ON sp.user_id = u.user_id AND sp.deleted_at IS NULL
           WHERE u.tenant_id = $1 AND u.deleted_at IS NULL AND lower(r.role_name) = 'student'
             AND ${studentCampus}
             AND ($3::int IS NULL OR u.dept_id = $3)
             AND ($4::text IS NULL OR sp.batch ILIKE '%' || $4 || '%')
           GROUP BY CASE WHEN u.is_active THEN 'Active' ELSE 'Inactive' END`,
          [tid, campusIds, deptId, academicYear],
        )
        .catch(() => []),
      this.dataSource
        .query(
          `SELECT upper(a.status) AS status, COUNT(*)::int AS count
           FROM admissions_applications a
           LEFT JOIN admissions_leads l ON l.lead_id = a.lead_id AND l.deleted_at IS NULL
           JOIN iam_programs p ON p.program_id = COALESCE(a.program_id, l.preferred_program_id)
             AND p.deleted_at IS NULL
           JOIN schools s ON s.school_id = p.school_id AND s.deleted_at IS NULL
           WHERE a.deleted_at IS NULL
             AND s.campus_id = ANY($1::int[])
             AND ($2::int IS NULL OR p.dept_id = $2)
             AND ($3::int IS NULL OR p.program_id = $3)
             AND ($4::date IS NULL OR COALESCE(a.submitted_at, a.created_at)::date >= $4::date)
             AND ($5::date IS NULL OR COALESCE(a.submitted_at, a.created_at)::date <= $5::date)
           GROUP BY upper(a.status)
           ORDER BY count DESC`,
          [campusIds, deptId, programId, from, to],
        )
        .catch(() => []),
      this.dataSource
        .query(
          `SELECT COALESCE(p.program_name, 'Unassigned') AS program, COUNT(*)::int AS count
           FROM admissions_applications a
           LEFT JOIN admissions_leads l ON l.lead_id = a.lead_id AND l.deleted_at IS NULL
           JOIN iam_programs p ON p.program_id = COALESCE(a.program_id, l.preferred_program_id)
             AND p.deleted_at IS NULL
           JOIN schools s ON s.school_id = p.school_id AND s.deleted_at IS NULL
           WHERE a.deleted_at IS NULL AND s.campus_id = ANY($1::int[])
             AND ($2::int IS NULL OR p.dept_id = $2)
             AND ($3::int IS NULL OR p.program_id = $3)
             AND ($4::date IS NULL OR COALESCE(a.submitted_at, a.created_at)::date >= $4::date)
             AND ($5::date IS NULL OR COALESCE(a.submitted_at, a.created_at)::date <= $5::date)
           GROUP BY COALESCE(p.program_name, 'Unassigned')
           ORDER BY count DESC LIMIT 20`,
          [campusIds, deptId, programId, from, to],
        )
        .catch(() => []),
      this.dataSource
        .query(
          `SELECT COALESCE(d.dept_name, s.school_name, 'Unassigned') AS department,
                  COUNT(*)::int AS count
           FROM admissions_applications a
           LEFT JOIN admissions_leads l ON l.lead_id = a.lead_id AND l.deleted_at IS NULL
           JOIN iam_programs p ON p.program_id = COALESCE(a.program_id, l.preferred_program_id)
             AND p.deleted_at IS NULL
           JOIN schools s ON s.school_id = p.school_id AND s.deleted_at IS NULL
           LEFT JOIN departments d ON d.dept_id = p.dept_id AND d.deleted_at IS NULL
           WHERE a.deleted_at IS NULL AND s.campus_id = ANY($1::int[])
             AND ($2::int IS NULL OR p.dept_id = $2)
             AND ($3::int IS NULL OR p.program_id = $3)
             AND ($4::date IS NULL OR COALESCE(a.submitted_at, a.created_at)::date >= $4::date)
             AND ($5::date IS NULL OR COALESCE(a.submitted_at, a.created_at)::date <= $5::date)
           GROUP BY COALESCE(d.dept_name, s.school_name, 'Unassigned')
           ORDER BY count DESC LIMIT 20`,
          [campusIds, deptId, programId, from, to],
        )
        .catch(() => []),
      this.dataSource
        .query(
          `SELECT COALESCE(d.dept_name, 'Unassigned') AS department, COUNT(*)::int AS enrolled
           FROM admissions_applications a
           LEFT JOIN admissions_leads l ON l.lead_id = a.lead_id AND l.deleted_at IS NULL
           JOIN iam_programs p ON p.program_id = COALESCE(a.program_id, l.preferred_program_id)
             AND p.deleted_at IS NULL
           JOIN schools s ON s.school_id = p.school_id AND s.deleted_at IS NULL
           LEFT JOIN departments d ON d.dept_id = p.dept_id AND d.deleted_at IS NULL
           WHERE a.deleted_at IS NULL
             AND upper(a.status) = 'ACCEPTED'
             AND s.campus_id = ANY($1::int[])
             AND ($2::int IS NULL OR p.dept_id = $2)
             AND ($3::int IS NULL OR p.program_id = $3)
             AND ($4::date IS NULL OR COALESCE(a.submitted_at, a.created_at)::date >= $4::date)
             AND ($5::date IS NULL OR COALESCE(a.submitted_at, a.created_at)::date <= $5::date)
           GROUP BY COALESCE(d.dept_name, 'Unassigned')
           ORDER BY enrolled DESC LIMIT 20`,
          [campusIds, deptId, programId, from, to],
        )
        .catch(() => []),
      this.dataSource
        .query(
          `SELECT COALESCE(p.program_name, 'Unassigned') AS program, COUNT(*)::int AS enrolled
           FROM admissions_applications a
           LEFT JOIN admissions_leads l ON l.lead_id = a.lead_id AND l.deleted_at IS NULL
           JOIN iam_programs p ON p.program_id = COALESCE(a.program_id, l.preferred_program_id)
             AND p.deleted_at IS NULL
           JOIN schools s ON s.school_id = p.school_id AND s.deleted_at IS NULL
           WHERE a.deleted_at IS NULL
             AND upper(a.status) = 'ACCEPTED'
             AND s.campus_id = ANY($1::int[])
             AND ($2::int IS NULL OR p.dept_id = $2)
             AND ($3::int IS NULL OR p.program_id = $3)
             AND ($4::date IS NULL OR COALESCE(a.submitted_at, a.created_at)::date >= $4::date)
             AND ($5::date IS NULL OR COALESCE(a.submitted_at, a.created_at)::date <= $5::date)
           GROUP BY COALESCE(p.program_name, 'Unassigned')
           ORDER BY enrolled DESC LIMIT 20`,
          [campusIds, deptId, programId, from, to],
        )
        .catch(() => []),
      this.dataSource
        .query(
          `SELECT COALESCE(NULLIF(trim(sp.batch), ''), to_char(u.created_at, 'YYYY')) AS academic_year,
                  COUNT(*)::int AS enrolled
           FROM users u
           JOIN roles r ON r.role_id = u.role_id
           LEFT JOIN departments d ON d.dept_id = u.dept_id AND d.deleted_at IS NULL
           LEFT JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
           LEFT JOIN student_profiles sp ON sp.user_id = u.user_id AND sp.deleted_at IS NULL
           WHERE u.tenant_id = $1 AND u.deleted_at IS NULL AND u.is_active = true
             AND lower(r.role_name) = 'student'
             AND ${studentCampus}
             AND ($3::int IS NULL OR u.dept_id = $3)
             AND ($4::text IS NULL OR sp.batch ILIKE '%' || $4 || '%')
           GROUP BY COALESCE(NULLIF(trim(sp.batch), ''), to_char(u.created_at, 'YYYY'))
           ORDER BY academic_year DESC NULLS LAST
           LIMIT 12`,
          [tid, campusIds, deptId, academicYear],
        )
        .catch(() => []),
      this.dataSource
        .query(
          `SELECT to_char(date_trunc('month', COALESCE(a.submitted_at, a.created_at)), 'YYYY-MM') AS month,
                  COUNT(*)::int AS enrolled
           FROM admissions_applications a
           LEFT JOIN admissions_leads l ON l.lead_id = a.lead_id AND l.deleted_at IS NULL
           JOIN iam_programs p ON p.program_id = COALESCE(a.program_id, l.preferred_program_id)
             AND p.deleted_at IS NULL
           JOIN schools s ON s.school_id = p.school_id AND s.deleted_at IS NULL
           WHERE a.deleted_at IS NULL
             AND upper(a.status) = 'ACCEPTED'
             AND s.campus_id = ANY($1::int[])
             AND ($2::int IS NULL OR p.dept_id = $2)
             AND ($3::int IS NULL OR p.program_id = $3)
             AND ($4::date IS NULL OR COALESCE(a.submitted_at, a.created_at)::date >= $4::date)
             AND ($5::date IS NULL OR COALESCE(a.submitted_at, a.created_at)::date <= $5::date)
           GROUP BY 1
           ORDER BY 1 DESC
           LIMIT 12`,
          [campusIds, deptId, programId, from, to],
        )
        .catch(() => []),
      this.dataSource
        .query(
          `SELECT d.dept_id, d.dept_name, d.dept_code,
                  CASE WHEN d.deleted_at IS NULL THEN 'ACTIVE' ELSE 'INACTIVE' END AS status,
                  s.school_name, hod.name AS hod_name,
                  (SELECT COUNT(*)::int FROM users su
                     JOIN roles sr ON sr.role_id = su.role_id
                    WHERE su.dept_id = d.dept_id AND su.deleted_at IS NULL
                      AND lower(sr.role_name) = 'student') AS students,
                  (SELECT COUNT(*)::int FROM users fu
                     JOIN roles fr ON fr.role_id = fu.role_id
                    WHERE fu.dept_id = d.dept_id AND fu.deleted_at IS NULL AND fu.is_active = true
                      AND lower(fr.role_name) IN (${CampusAdminService.STAFF_ROLES_SQL})) AS faculty,
                  (SELECT COUNT(*)::int FROM iam_programs p
                    WHERE p.deleted_at IS NULL AND p.dept_id = d.dept_id) AS programs
           FROM departments d
           JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
           LEFT JOIN users hod ON hod.user_id = d.hod_user_id
           WHERE s.campus_id = ANY($1::int[])
             AND ($2::int IS NULL OR d.dept_id = $2)
           ORDER BY d.deleted_at NULLS FIRST, d.dept_name
           LIMIT 100`,
          [campusIds, deptId],
        )
        .catch(() => []),
      this.dataSource
        .query(
          `SELECT u.user_id, u.name,
                  COALESCE(p.designation, r.role_name) AS designation,
                  COALESCE(d.dept_name, 'Unassigned') AS department,
                  CASE WHEN u.is_active THEN 'Active' ELSE 'Inactive' END AS status
           FROM users u
           JOIN roles r ON r.role_id = u.role_id
           LEFT JOIN departments d ON d.dept_id = u.dept_id AND d.deleted_at IS NULL
           LEFT JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
           LEFT JOIN hr_employee_profiles p
             ON p.user_id = u.user_id AND p.tenant_id = u.tenant_id AND p.deleted_at IS NULL
           WHERE u.tenant_id = $1 AND u.deleted_at IS NULL
             AND lower(r.role_name) IN (${CampusAdminService.STAFF_ROLES_SQL})
             AND s.campus_id = ANY($2::int[])
             AND ($3::int IS NULL OR u.dept_id = $3)
           ORDER BY u.is_active DESC, u.name
           LIMIT 40`,
          [tid, campusIds, deptId],
        )
        .catch(() => []),
      this.dataSource
        .query(
          `SELECT COALESCE(d.dept_name, 'Unassigned') AS department, COUNT(*)::int AS count
           FROM users u
           JOIN roles r ON r.role_id = u.role_id
           LEFT JOIN departments d ON d.dept_id = u.dept_id AND d.deleted_at IS NULL
           LEFT JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
           WHERE u.tenant_id = $1 AND u.deleted_at IS NULL AND u.is_active = true
             AND lower(r.role_name) IN (${CampusAdminService.STAFF_ROLES_SQL})
             AND s.campus_id = ANY($2::int[])
             AND ($3::int IS NULL OR u.dept_id = $3)
           GROUP BY COALESCE(d.dept_name, 'Unassigned')
           ORDER BY count DESC LIMIT 20`,
          [tid, campusIds, deptId],
        )
        .catch(() => []),
      this.dataSource
        .query(
          `SELECT
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE u.is_active)::int AS active
           FROM users u
           JOIN roles r ON r.role_id = u.role_id
           LEFT JOIN departments d ON d.dept_id = u.dept_id AND d.deleted_at IS NULL
           LEFT JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
           WHERE u.tenant_id = $1 AND u.deleted_at IS NULL
             AND lower(r.role_name) IN (${CampusAdminService.FACULTY_ROLE_SQL}, ${CampusAdminService.HOD_ROLE_SQL})
             AND s.campus_id = ANY($2::int[])
             AND ($3::int IS NULL OR u.dept_id = $3)`,
          [tid, campusIds, deptId],
        )
        .catch(() => [{ total: 0, active: 0 }]),
      this.dataSource
        .query(
          `SELECT COUNT(*)::int AS count
           FROM users u
           JOIN roles r ON r.role_id = u.role_id
           LEFT JOIN departments d ON d.dept_id = u.dept_id AND d.deleted_at IS NULL
           LEFT JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
           WHERE u.tenant_id = $1 AND u.deleted_at IS NULL AND u.is_active = true
             AND lower(r.role_name) IN (${CampusAdminService.ADMIN_STAFF_ROLE_SQL})
             AND s.campus_id = ANY($2::int[])
             AND ($3::int IS NULL OR u.dept_id = $3)`,
          [tid, campusIds, deptId],
        )
        .catch(() => [{ count: 0 }]),
      this.dataSource
        .query(
          `SELECT COUNT(*)::int AS count FROM schools
           WHERE deleted_at IS NULL AND campus_id = ANY($1::int[])`,
          [campusIds],
        )
        .catch(() => [{ count: 0 }]),
      this.classrooms(user).catch(() => []),
      this.dataSource
        .query(
          `SELECT COALESCE(r.role_name, 'Unassigned') AS role_name,
                  COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE u.is_active)::int AS active,
                  COUNT(*) FILTER (WHERE NOT u.is_active)::int AS inactive
           FROM users u
           LEFT JOIN roles r ON r.role_id = u.role_id AND r.deleted_at IS NULL
           LEFT JOIN departments d ON d.dept_id = u.dept_id AND d.deleted_at IS NULL
           LEFT JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
           WHERE u.tenant_id = $1 AND u.deleted_at IS NULL
             AND s.campus_id = ANY($2::int[])
             AND ($3::int IS NULL OR u.dept_id = $3)
           GROUP BY COALESCE(r.role_name, 'Unassigned')
           ORDER BY total DESC
           LIMIT 30`,
          [tid, campusIds, deptId],
        )
        .catch(() => []),
      this.dataSource
        .query(
          `SELECT COALESCE(d.dept_name, 'Unassigned') AS department,
                  COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE u.is_active)::int AS active
           FROM users u
           LEFT JOIN departments d ON d.dept_id = u.dept_id AND d.deleted_at IS NULL
           LEFT JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
           WHERE u.tenant_id = $1 AND u.deleted_at IS NULL
             AND s.campus_id = ANY($2::int[])
             AND ($3::int IS NULL OR u.dept_id = $3)
           GROUP BY COALESCE(d.dept_name, 'Unassigned')
           ORDER BY total DESC
           LIMIT 20`,
          [tid, campusIds, deptId],
        )
        .catch(() => []),
      this.dataSource
        .query(
          `SELECT d.dept_id, d.dept_name
           FROM departments d
           JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
           WHERE d.deleted_at IS NULL AND s.campus_id = ANY($1::int[])
           ORDER BY d.dept_name`,
          [campusIds],
        )
        .catch(() => []),
      this.dataSource
        .query(
          `SELECT DISTINCT p.program_id, p.program_name, p.program_code, p.dept_id
           FROM iam_programs p
           LEFT JOIN schools s ON s.school_id = p.school_id AND s.deleted_at IS NULL
           LEFT JOIN departments d ON d.dept_id = p.dept_id AND d.deleted_at IS NULL
           LEFT JOIN schools ds ON ds.school_id = d.school_id AND ds.deleted_at IS NULL
           WHERE p.deleted_at IS NULL
             AND (s.campus_id = ANY($1::int[]) OR ds.campus_id = ANY($1::int[]))
           ORDER BY p.program_name`,
          [campusIds],
        )
        .catch(() => []),
      this.dataSource
        .query(
          `SELECT DISTINCT NULLIF(trim(sp.batch), '') AS academic_year
           FROM student_profiles sp
           JOIN users u ON u.user_id = sp.user_id
           LEFT JOIN departments d ON d.dept_id = u.dept_id AND d.deleted_at IS NULL
           LEFT JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
           WHERE u.tenant_id = $1 AND sp.deleted_at IS NULL
             AND NULLIF(trim(sp.batch), '') IS NOT NULL
             AND ${studentCampus}
           ORDER BY academic_year DESC
           LIMIT 20`,
          [tid, campusIds],
        )
        .catch(() => []),
    ]);

    const ov = (Array.isArray(overview) ? overview[0] : {}) as Record<string, unknown>;
    const statusMap = new Map<string, number>();
    for (const row of admissionStatus as Array<{ status: string; count: number }>) {
      statusMap.set(String(row.status || '').toUpperCase(), Number(row.count ?? 0));
    }
    const draft = statusMap.get('DRAFT') ?? 0;
    const submitted = statusMap.get('SUBMITTED') ?? 0;
    const underReview = statusMap.get('UNDER_REVIEW') ?? 0;
    const offered = statusMap.get('OFFERED') ?? 0;
    const accepted = statusMap.get('ACCEPTED') ?? 0;
    const rejected = statusMap.get('REJECTED') ?? 0;
    const withdrawn = statusMap.get('WITHDRAWN') ?? 0;
    const totalApps = [...statusMap.values()].reduce((a, b) => a + b, 0);

    const deptRows = Array.isArray(departments) ? departments : [];
    const activeDepts = deptRows.filter(
      (d: { status?: string }) => String(d.status).toUpperCase() === 'ACTIVE',
    ).length;
    const venuesRows = Array.isArray(venues) ? venues : [];
    const roleRows = Array.isArray(usersByRole) ? usersByRole : [];
    const totalUsers = roleRows.reduce(
      (sum: number, row: { total?: number }) => sum + Number(row.total ?? 0),
      0,
    );
    const activeUsers = roleRows.reduce(
      (sum: number, row: { active?: number }) => sum + Number(row.active ?? 0),
      0,
    );

    const ft = (Array.isArray(facultyTotals) ? facultyTotals[0] : {}) as {
      total?: number;
      active?: number;
    };
    const facultyTotal = Number(ov.faculty_staff ?? ft.total ?? 0);
    const facultyActive = Number(ft.active ?? facultyTotal);
    const campusRow =
      Array.isArray(campuses) && campuses[0]
        ? (campuses[0] as Record<string, unknown>)
        : {};

    return {
      generated_at: new Date().toISOString(),
      campus_ids: campusIds,
      filters: {
        from,
        to,
        academic_year: academicYear,
        dept_id: deptId,
        program_id: programId,
      },
      filter_options: {
        departments: filterDepartments,
        programs: filterPrograms,
        academic_years: (academicYears as Array<{ academic_year: string }>)
          .map((r) => r.academic_year)
          .filter(Boolean),
      },
      overview: {
        total_students: Number(ov.total_students ?? 0),
        new_admissions: Number(ov.total_applications ?? 0),
        total_enrolled: Number(ov.enrolled_applications ?? 0),
        faculty_staff: facultyTotal,
        departments: Number(ov.departments ?? 0),
        programs: Number(ov.programs ?? 0),
      },
      students: {
        total: Number(ov.total_students ?? 0),
        active: Number(ov.active_students ?? 0),
        new_students: Number(ov.new_students ?? 0),
        by_department: studentsByDept,
        by_program: studentsByProgram,
        by_status: studentsByStatus,
      },
      admissions: {
        total: totalApps,
        pending: draft + submitted,
        verified: underReview,
        approved: offered,
        rejected,
        withdrawn,
        enrolled: accepted,
        pipeline: [
          { stage: 'Applications', count: totalApps },
          { stage: 'Verification', count: underReview },
          { stage: 'Counselling', count: submitted },
          { stage: 'Approved', count: offered },
          { stage: 'Enrolled', count: accepted },
        ],
        by_status: admissionStatus,
        by_program: admissionsByProgram,
        by_department: admissionsByDept,
      },
      enrollment: {
        total: Number(ov.enrolled_applications ?? 0),
        new_enrollments: Number(ov.new_enrollments ?? 0),
        by_department: enrollmentByDept,
        by_program: enrollmentByProgram,
        by_academic_year: enrollmentByYear,
        trend: [...(enrollmentTrend as Array<{ month: string; enrolled: number }>)].reverse(),
      },
      departments: {
        total: deptRows.length,
        active: activeDepts,
        rows: deptRows,
      },
      faculty: {
        total: Number(ft.total ?? facultyTotal),
        active: facultyActive,
        staff: Number((staffCount as Array<{ count: number }>)[0]?.count ?? 0),
        by_department: facultyByDept,
        rows: Array.isArray(facultySample) ? facultySample : [],
      },
      campus: {
        campus_id: campusRow.campus_id ?? null,
        campus_name: campusRow.campus_name ?? null,
        campus_code: campusRow.campus_code ?? null,
        address: campusRow.address ?? null,
        university_name: campusRow.university_name ?? null,
        status: 'Active',
        schools: Number((schoolsCount as Array<{ count: number }>)[0]?.count ?? 0),
        departments: Number(ov.departments ?? 0),
        programs: Number(ov.programs ?? 0),
        students: Number(ov.total_students ?? 0),
        faculty_staff: facultyTotal,
        classrooms: venuesRows.length,
        facilities: venuesRows.filter(
          (v: { is_bookable_by_students?: boolean }) => Boolean(v.is_bookable_by_students),
        ).length,
      },
      users: {
        total: totalUsers,
        active: activeUsers,
        inactive: Math.max(totalUsers - activeUsers, 0),
        by_role: roleRows,
        by_department: usersByDept,
      },
    };
  }


  async hierarchy(user: ScopedAuthUser) {
    const campusIds = await this.campusScope.requireCampusIds(user);
    const [campuses, schools, departments, programs, batches] =
      await Promise.all([
        this.dataSource.query(
          `SELECT campus_id, campus_name, campus_code, address
           FROM campuses
           WHERE campus_id = ANY($1::int[])
             AND deleted_at IS NULL
           ORDER BY campus_name ASC`,
          [campusIds],
        ),
        this.dataSource.query(
          `SELECT s.school_id, s.school_name, s.school_code, s.campus_id,
                  s.dean_user_id, u.name AS dean_name, u.official_email AS dean_email
           FROM schools s
           LEFT JOIN users u ON u.user_id = s.dean_user_id
           WHERE s.deleted_at IS NULL
             AND s.campus_id = ANY($1::int[])
           ORDER BY s.school_name ASC`,
          [campusIds],
        ),
        this.dataSource.query(
          `SELECT d.dept_id, d.dept_name, d.description, d.school_id,
                  d.hod_user_id, u.name AS hod_name, u.official_email AS hod_email,
                  s.school_name
           FROM departments d
           JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
           LEFT JOIN users u ON u.user_id = d.hod_user_id
           WHERE d.deleted_at IS NULL
             AND s.campus_id = ANY($1::int[])
           ORDER BY s.school_name, d.dept_name`,
          [campusIds],
        ),
        this.dataSource.query(
          `SELECT DISTINCT p.program_id, p.program_name, p.program_code,
                  p.duration_years, p.school_id, p.dept_id
           FROM iam_programs p
           LEFT JOIN schools s
             ON s.school_id = p.school_id AND s.deleted_at IS NULL
           LEFT JOIN departments d
             ON d.dept_id = p.dept_id AND d.deleted_at IS NULL
           LEFT JOIN schools ds
             ON ds.school_id = d.school_id AND ds.deleted_at IS NULL
           WHERE p.deleted_at IS NULL
             AND (
               s.campus_id = ANY($1::int[])
               OR ds.campus_id = ANY($1::int[])
             )
           ORDER BY p.program_name ASC`,
          [campusIds],
        ),
        this.dataSource.query(
          `SELECT DISTINCT b.batch_id, b.batch_name, b.program_id,
                  b.academic_year, b.current_semester
           FROM academic_sis_batches b
           JOIN iam_programs p
             ON p.program_id = b.program_id AND p.deleted_at IS NULL
           LEFT JOIN schools s
             ON s.school_id = p.school_id AND s.deleted_at IS NULL
           LEFT JOIN departments d
             ON d.dept_id = p.dept_id AND d.deleted_at IS NULL
           LEFT JOIN schools ds
             ON ds.school_id = d.school_id AND ds.deleted_at IS NULL
           WHERE b.deleted_at IS NULL
             AND (
               s.campus_id = ANY($1::int[])
               OR ds.campus_id = ANY($1::int[])
             )
           ORDER BY b.academic_year DESC, b.batch_name ASC`,
          [campusIds],
        ),
      ]);

    return { campuses, schools, departments, programs, batches };
  }

  async hierarchyAssignableUsers(user: ScopedAuthUser, q?: string) {
    const campusIds = await this.campusScope.requireCampusIds(user);
    const term = q?.trim() ?? '';
    return this.dataSource.query(
      `SELECT DISTINCT u.user_id, u.name, u.official_email AS email, r.role_name
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id AND d.deleted_at IS NULL
       LEFT JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
       WHERE u.tenant_id = $1
         AND u.is_active = true
         AND u.deleted_at IS NULL
         AND lower(r.role_name) IN ('dean', 'hod', 'faculty')
         AND (
           s.campus_id = ANY($2::int[])
           OR EXISTS (
             SELECT 1 FROM schools sc
             WHERE sc.dean_user_id = u.user_id
               AND sc.deleted_at IS NULL
               AND sc.campus_id = ANY($2::int[])
           )
           OR EXISTS (
             SELECT 1
             FROM departments hd
             JOIN schools hs ON hs.school_id = hd.school_id AND hs.deleted_at IS NULL
             WHERE hd.hod_user_id = u.user_id
               AND hd.deleted_at IS NULL
               AND hs.campus_id = ANY($2::int[])
           )
         )
         AND (
           $3::text = ''
           OR u.name ILIKE '%' || $3 || '%'
           OR u.official_email ILIKE '%' || $3 || '%'
         )
       ORDER BY u.name ASC
       LIMIT 200`,
      [this.tenant(user), campusIds, term],
    );
  }

  async listHierarchyAssignments(user: ScopedAuthUser) {
    const campusIds = await this.campusScope.requireCampusIds(user);
    return this.dataSource.query(
      `SELECT a.assignment_id, a.assignment_type, a.entity_type, a.entity_id,
              a.created_at, u.name AS user_name, u.official_email,
              COALESCE(d.dept_name, s.school_name, a.entity_id) AS entity_name
       FROM hierarchy_assignments a
       JOIN users u ON u.user_id = a.user_id
       LEFT JOIN departments d
         ON upper(a.entity_type) = 'DEPARTMENT'
        AND d.dept_id = NULLIF(trim(a.entity_id), '')::int
        AND d.deleted_at IS NULL
       LEFT JOIN schools ds
         ON d.school_id = ds.school_id AND ds.deleted_at IS NULL
       LEFT JOIN schools s
         ON upper(a.entity_type) = 'SCHOOL'
        AND s.school_id = NULLIF(trim(a.entity_id), '')::int
        AND s.deleted_at IS NULL
       WHERE a.tenant_id = $1
         AND upper(a.assignment_type) IN ('DEAN', 'HOD')
         AND (
           s.campus_id = ANY($2::int[])
           OR ds.campus_id = ANY($2::int[])
         )
       ORDER BY a.created_at DESC`,
      [this.tenant(user), campusIds],
    );
  }

  async assignHierarchy(
    user: ScopedAuthUser,
    dto: {
      user_id: string;
      assignment_type: string;
      entity_type: string;
      entity_id: string;
    },
  ) {
    const campusIds = await this.campusScope.requireCampusIds(user);
    await this.campusScope.assertHierarchyTargetAllowed(
      campusIds,
      dto.entity_type,
      dto.entity_id,
    );
    const allowed = await this.hierarchyAssignableUsers(user);
    if (!allowed.some((row: { user_id: string }) => row.user_id === dto.user_id)) {
      throw new ForbiddenException(
        'This person is not in your assigned campus',
      );
    }
    return this.superAdmin.assignEntity(this.tenant(user), user.user_id ?? '', dto);
  }

  async revokeHierarchyAssignment(user: ScopedAuthUser, assignmentId: string) {
    const campusIds = await this.campusScope.requireCampusIds(user);
    const rows = await this.dataSource.query<
      Array<{ entity_type: string; entity_id: string }>
    >(
      `SELECT entity_type, entity_id
       FROM hierarchy_assignments
       WHERE assignment_id = $1 AND tenant_id = $2`,
      [assignmentId, this.tenant(user)],
    );
    if (!rows[0]) {
      throw new ForbiddenException('Assignment not found for this campus');
    }
    await this.campusScope.assertHierarchyTargetAllowed(
      campusIds,
      rows[0].entity_type,
      rows[0].entity_id,
    );
    return this.superAdmin.revokeAssignment(
      this.tenant(user),
      user.user_id ?? '',
      assignmentId,
    );
  }

  private async assertSchoolOnCampus(campusIds: number[], schoolId: number) {
    if (!Number.isInteger(schoolId) || schoolId <= 0) {
      throw new BadRequestException('A valid school is required');
    }
    const [school] = await this.dataSource.query(
      `SELECT school_id, school_name, campus_id
       FROM schools
       WHERE school_id = $1 AND deleted_at IS NULL`,
      [schoolId],
    );
    if (!school) throw new BadRequestException('School not found');
    this.campusScope.assertRecordCampusAllowed(campusIds, school.campus_id);
    return school as { school_id: number; school_name: string; campus_id: number };
  }

  private async assertDeptOnCampus(
    campusIds: number[],
    deptId: number,
    schoolId?: number,
  ) {
    if (!Number.isInteger(deptId) || deptId <= 0) {
      throw new BadRequestException('A valid department is required');
    }
    const [dept] = await this.dataSource.query(
      `SELECT d.dept_id, d.dept_name, d.school_id, s.campus_id
       FROM departments d
       JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
       WHERE d.dept_id = $1 AND d.deleted_at IS NULL`,
      [deptId],
    );
    if (!dept) throw new BadRequestException('Department not found');
    this.campusScope.assertRecordCampusAllowed(campusIds, dept.campus_id);
    if (schoolId != null && Number(dept.school_id) !== Number(schoolId)) {
      throw new BadRequestException(
        'Department does not belong to the selected school',
      );
    }
    return dept as {
      dept_id: number;
      dept_name: string;
      school_id: number;
      campus_id: number;
    };
  }

  private async assertProgramOnCampus(campusIds: number[], programId: number) {
    const [row] = await this.dataSource.query(
      `SELECT p.program_id, p.program_name, s.campus_id
       FROM iam_programs p
       JOIN schools s ON s.school_id = p.school_id
       WHERE p.program_id = $1`,
      [programId],
    );
    if (!row) throw new NotFoundException('Program not found');
    this.campusScope.assertRecordCampusAllowed(campusIds, row.campus_id);
    return row as { program_id: number; program_name: string; campus_id: number };
  }

  async createProgram(user: ScopedAuthUser, dto: CreateCampusProgramDto) {
    const campusIds = await this.campusScope.requireCampusIds(user);
    await this.assertSchoolOnCampus(campusIds, dto.school_id);
    if (dto.dept_id) {
      await this.assertDeptOnCampus(campusIds, dto.dept_id, dto.school_id);
    }
    const [row] = await this.dataSource.query(
      `INSERT INTO iam_programs (program_name, program_code, duration_years, school_id, dept_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING program_id, program_name, program_code, duration_years, school_id, dept_id`,
      [
        dto.program_name.trim(),
        dto.program_code.trim().toUpperCase(),
        dto.duration_years ?? null,
        dto.school_id,
        dto.dept_id ?? null,
      ],
    );
    return row;
  }

  async updateProgram(
    user: ScopedAuthUser,
    programId: number,
    dto: UpdateCampusProgramDto,
  ) {
    const campusIds = await this.campusScope.requireCampusIds(user);
    await this.assertProgramOnCampus(campusIds, programId);
    const schoolId = dto.school_id;
    if (schoolId != null) {
      await this.assertSchoolOnCampus(campusIds, schoolId);
    }
    if (dto.dept_id) {
      const [current] = await this.dataSource.query(
        `SELECT school_id FROM iam_programs WHERE program_id = $1`,
        [programId],
      );
      await this.assertDeptOnCampus(
        campusIds,
        dto.dept_id,
        schoolId ?? Number(current?.school_id),
      );
    }
    const [row] = await this.dataSource.query(
      `UPDATE iam_programs SET
         program_name = COALESCE($2, program_name),
         program_code = COALESCE($3, program_code),
         duration_years = CASE WHEN $4::boolean THEN $5 ELSE duration_years END,
         school_id = COALESCE($6, school_id),
         dept_id = CASE WHEN $7::boolean THEN $8 ELSE dept_id END,
         updated_at = NOW()
       WHERE program_id = $1 AND deleted_at IS NULL
       RETURNING program_id, program_name, program_code, duration_years, school_id, dept_id`,
      [
        programId,
        dto.program_name?.trim() ?? null,
        dto.program_code?.trim().toUpperCase() ?? null,
        dto.duration_years !== undefined,
        dto.duration_years ?? null,
        schoolId ?? null,
        dto.dept_id !== undefined,
        dto.dept_id ?? null,
      ],
    );
    if (!row) throw new NotFoundException('Program not found');
    return row;
  }

  async deactivateProgram(user: ScopedAuthUser, programId: number) {
    const campusIds = await this.campusScope.requireCampusIds(user);
    await this.assertProgramOnCampus(campusIds, programId);
    const [row] = await this.dataSource.query(
      `UPDATE iam_programs SET deleted_at = NOW(), updated_at = NOW()
       WHERE program_id = $1 AND deleted_at IS NULL
       RETURNING program_id`,
      [programId],
    );
    if (!row) throw new NotFoundException('Program not found');
    return { deactivated: true, program_id: programId };
  }

  async restoreProgram(user: ScopedAuthUser, programId: number) {
    const campusIds = await this.campusScope.requireCampusIds(user);
    await this.assertProgramOnCampus(campusIds, programId);
    const [row] = await this.dataSource.query(
      `UPDATE iam_programs SET deleted_at = NULL, updated_at = NOW()
       WHERE program_id = $1 AND deleted_at IS NOT NULL
       RETURNING program_id`,
      [programId],
    );
    if (!row) throw new NotFoundException('Program not found or already active');
    return { activated: true, program_id: programId };
  }

  private async assertCourseOnCampus(user: ScopedAuthUser, courseId: string) {
    const campusIds = await this.campusScope.requireCampusIds(user);
    const [row] = await this.dataSource.query(
      `SELECT c.course_id, s.campus_id
       FROM academic_courses c
       LEFT JOIN departments d ON d.dept_id = c.entity_id
       LEFT JOIN schools s ON s.school_id = d.school_id
       WHERE c.course_id = $1 AND c.tenant_id = $2`,
      [courseId, this.tenant(user)],
    );
    if (!row) throw new NotFoundException('Course not found');
    this.campusScope.assertRecordCampusAllowed(campusIds, row.campus_id);
    return campusIds;
  }

  private async writeCourseAllocation(
    tenantId: string,
    courseId: string,
    programName?: string | null,
    semester?: number | null,
  ) {
    if (programName == null && semester == null) return;
    try {
      await this.dataSource.query(
        `INSERT INTO academic_course_allocations
           (tenant_id, subject_id, course_id, program_name, semester, academic_year, status)
         VALUES ($1, 0, $2, $3, $4, $5, 'ACTIVE')`,
        [
          tenantId,
          courseId,
          programName ?? null,
          semester != null ? String(semester) : null,
          `${new Date().getFullYear()}-${String(new Date().getFullYear() + 1).slice(-2)}`,
        ],
      );
    } catch {
      /* allocation is optional across schema variants */
    }
  }

  async createCourse(user: ScopedAuthUser, dto: CreateCampusCourseDto) {
    const campusIds = await this.campusScope.requireCampusIds(user);
    await this.assertDeptOnCampus(campusIds, dto.dept_id);
    let programName: string | null = null;
    if (dto.program_id) {
      const program = await this.assertProgramOnCampus(campusIds, dto.program_id);
      programName = program.program_name;
    }
    const tid = this.tenant(user);
    const [row] = await this.dataSource.query(
      `INSERT INTO academic_courses
         (tenant_id, course_code, course_name, credits, is_elective, entity_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING course_id, course_code, course_name, credits, is_elective, entity_id`,
      [
        tid,
        dto.course_code.trim().toUpperCase(),
        dto.course_name.trim(),
        dto.credits,
        dto.is_elective ?? false,
        dto.dept_id,
      ],
    );
    await this.writeCourseAllocation(
      tid,
      row.course_id,
      programName,
      dto.semester,
    );
    return row;
  }

  async updateCourse(
    user: ScopedAuthUser,
    courseId: string,
    dto: UpdateCampusCourseDto,
  ) {
    const campusIds = await this.assertCourseOnCampus(user, courseId);
    if (dto.dept_id) {
      await this.assertDeptOnCampus(campusIds, dto.dept_id);
    }
    let programName: string | null | undefined;
    if (dto.program_id) {
      const program = await this.assertProgramOnCampus(campusIds, dto.program_id);
      programName = program.program_name;
    } else if (dto.program_id === null) {
      programName = null;
    }

    const params = [
      courseId,
      dto.course_name?.trim() ?? null,
      dto.course_code?.trim().toUpperCase() ?? null,
      dto.credits ?? null,
      dto.is_elective ?? null,
      dto.dept_id ?? null,
      this.tenant(user),
    ];
    // academic_courses has no updated_at column in this schema
    const updated = await this.dataSource.query(
      `UPDATE academic_courses SET
         course_name = COALESCE($2, course_name),
         course_code = COALESCE($3, course_code),
         credits = COALESCE($4, credits),
         is_elective = COALESCE($5, is_elective),
         entity_id = COALESCE($6, entity_id)
       WHERE course_id = $1 AND tenant_id = $7 AND deleted_at IS NULL
       RETURNING course_id, course_code, course_name, credits, is_elective, entity_id`,
      params,
    );
    const row = updated[0] as Record<string, unknown> | undefined;
    if (!row) throw new NotFoundException('Course not found');
    if (programName !== undefined || dto.semester !== undefined) {
      await this.writeCourseAllocation(
        this.tenant(user),
        courseId,
        programName ?? null,
        dto.semester,
      );
    }
    return row;
  }

  async deactivateCourse(user: ScopedAuthUser, courseId: string) {
    await this.assertCourseOnCampus(user, courseId);
    const updated = await this.dataSource.query(
      `UPDATE academic_courses SET deleted_at = NOW()
       WHERE course_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING course_id`,
      [courseId, this.tenant(user)],
    );
    const row = updated[0] as Record<string, unknown> | undefined;
    if (!row) throw new NotFoundException('Course not found');
    return { deactivated: true, course_id: courseId };
  }

  async restoreCourse(user: ScopedAuthUser, courseId: string) {
    await this.assertCourseOnCampus(user, courseId);
    const updated = await this.dataSource.query(
      `UPDATE academic_courses SET deleted_at = NULL
       WHERE course_id = $1 AND tenant_id = $2 AND deleted_at IS NOT NULL
       RETURNING course_id`,
      [courseId, this.tenant(user)],
    );
    const row = updated[0] as Record<string, unknown> | undefined;
    if (!row) throw new NotFoundException('Course not found or already active');
    return { activated: true, course_id: courseId };
  }

  async courseDetail(user: ScopedAuthUser, courseId: string) {
    if (!courseId?.trim()) {
      throw new NotFoundException('Course was not found on this campus');
    }
    const campusIds = await this.campusScope.requireCampusIds(user);
    const tid = this.tenant(user);
    const [row] = await this.dataSource.query(
      `SELECT c.course_id, c.course_code, c.course_name, c.credits, c.is_elective,
              c.entity_id AS dept_id, c.min_attendance,
              CASE WHEN c.deleted_at IS NULL THEN 'ACTIVE' ELSE 'INACTIVE' END AS status,
              d.dept_name, d.dept_code, s.school_id, s.school_name, s.school_code,
              s.campus_id, camp.campus_name, camp.campus_code,
              hod.name AS hod_name, hod.official_email AS hod_email,
              a.semester, a.program_name, a.faculty_user_id, a.academic_year,
              fac.name AS faculty_name, fac.official_email AS faculty_email
       FROM academic_courses c
       LEFT JOIN departments d ON d.dept_id = c.entity_id AND d.deleted_at IS NULL
       LEFT JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
       LEFT JOIN campuses camp ON camp.campus_id = s.campus_id AND camp.deleted_at IS NULL
       LEFT JOIN users hod ON hod.user_id = d.hod_user_id
       LEFT JOIN LATERAL (
         SELECT ca.semester, ca.program_name, ca.faculty_user_id, ca.academic_year
         FROM academic_course_allocations ca
         WHERE ca.course_id = c.course_id AND ca.tenant_id = c.tenant_id
         ORDER BY ca.created_at DESC NULLS LAST
         LIMIT 1
       ) a ON TRUE
       LEFT JOIN users fac ON fac.user_id = a.faculty_user_id
       WHERE c.course_id = $1
         AND c.tenant_id = $2
         AND (s.campus_id IS NULL OR s.campus_id = ANY($3::int[]))
       LIMIT 1`,
      [courseId, tid, campusIds],
    );
    if (!row) {
      // Fallback without optional columns / allocation join
      const [basic] = await this.dataSource.query(
        `SELECT c.course_id, c.course_code, c.course_name, c.credits, c.is_elective,
                c.entity_id AS dept_id,
                CASE WHEN c.deleted_at IS NULL THEN 'ACTIVE' ELSE 'INACTIVE' END AS status,
                d.dept_name, s.school_name, s.campus_id, camp.campus_name
         FROM academic_courses c
         LEFT JOIN departments d ON d.dept_id = c.entity_id
         LEFT JOIN schools s ON s.school_id = d.school_id
         LEFT JOIN campuses camp ON camp.campus_id = s.campus_id
         WHERE c.course_id = $1 AND c.tenant_id = $2
         LIMIT 1`,
        [courseId, tid],
      );
      if (!basic) throw new NotFoundException('Course was not found on this campus');
      this.campusScope.assertRecordCampusAllowed(campusIds, basic.campus_id);
      return {
        course: {
          course_id: String(basic.course_id),
          course_code: basic.course_code ?? null,
          course_name: basic.course_name ?? null,
          credits: basic.credits == null ? null : Number(basic.credits),
          is_elective: Boolean(basic.is_elective),
          status: String(basic.status ?? 'ACTIVE'),
          dept_id: basic.dept_id == null ? null : Number(basic.dept_id),
          dept_name: basic.dept_name ?? null,
          school_name: basic.school_name ?? null,
          campus_name: basic.campus_name ?? null,
        },
        counts: { enrollments: 0, timetables: 0 },
        enrollments: [],
        timetables: [],
      };
    }
    this.campusScope.assertRecordCampusAllowed(campusIds, row.campus_id);

    const enrollments = await this.dataSource
      .query(
        `SELECT e.enrollment_id, e.semester, e.status, e.grade, e.attendance_percent,
                u.name AS student_name, u.official_email AS student_email
         FROM student_course_enrollments e
         LEFT JOIN users u ON u.user_id = e.student_user_id
         WHERE e.tenant_id = $1 AND e.course_id = $2
         ORDER BY u.name
         LIMIT 20`,
        [tid, courseId],
      )
      .catch(() => []);

    const timetables = await this.dataSource
      .query(
        `SELECT timetable_id, day_of_week, start_time, end_time, room,
                faculty_user_id
         FROM academic_timetables
         WHERE tenant_id = $1 AND course_id = $2
         ORDER BY day_of_week, start_time
         LIMIT 20`,
        [tid, courseId],
      )
      .catch(() => []);

    const enrollmentCount = await this.dataSource
      .query(
        `SELECT COUNT(*)::int AS c
         FROM student_course_enrollments
         WHERE tenant_id = $1 AND course_id = $2`,
        [tid, courseId],
      )
      .catch(() => [{ c: Array.isArray(enrollments) ? enrollments.length : 0 }]);

    return {
      course: {
        course_id: String(row.course_id),
        course_code: (row.course_code as string | null) ?? null,
        course_name: (row.course_name as string | null) ?? null,
        credits: row.credits == null ? null : Number(row.credits),
        is_elective: Boolean(row.is_elective),
        status: String(row.status ?? 'ACTIVE'),
        min_attendance:
          row.min_attendance == null ? null : Number(row.min_attendance),
        dept_id: row.dept_id == null ? null : Number(row.dept_id),
        dept_name: (row.dept_name as string | null) ?? null,
        dept_code: (row.dept_code as string | null) ?? null,
        school_id: row.school_id == null ? null : Number(row.school_id),
        school_name: (row.school_name as string | null) ?? null,
        school_code: (row.school_code as string | null) ?? null,
        campus_id: row.campus_id == null ? null : Number(row.campus_id),
        campus_name: (row.campus_name as string | null) ?? null,
        campus_code: (row.campus_code as string | null) ?? null,
        hod_name: (row.hod_name as string | null) ?? null,
        hod_email: (row.hod_email as string | null) ?? null,
        semester: row.semester == null ? null : Number(row.semester),
        program_name: (row.program_name as string | null) ?? null,
        academic_year: (row.academic_year as string | null) ?? null,
        faculty_name: (row.faculty_name as string | null) ?? null,
        faculty_email: (row.faculty_email as string | null) ?? null,
      },
      counts: {
        enrollments: Number(
          (enrollmentCount as Array<{ c: number }>)[0]?.c ??
            (Array.isArray(enrollments) ? enrollments.length : 0),
        ),
        timetables: Array.isArray(timetables) ? timetables.length : 0,
      },
      enrollments,
      timetables,
    };
  }

  // --- Campus User Management (campus-scoped; reuses users/roles/departments) ---

  private normalizeRoleKey(roleName: string): string {
    return String(roleName ?? '')
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ');
  }

  private assertCampusAssignableRole(roleName: string) {
    const key = this.normalizeRoleKey(roleName);
    const compact = key.replace(/\s+/g, '');
    if (
      CAMPUS_ADMIN_FORBIDDEN_ROLES.has(key) ||
      CAMPUS_ADMIN_FORBIDDEN_ROLES.has(compact)
    ) {
      throw new ForbiddenException(
        `You are not allowed to assign the ${roleName} role`,
      );
    }
    const allowed = CAMPUS_ADMIN_ASSIGNABLE_ROLES.some(
      (role) => this.normalizeRoleKey(role) === key,
    );
    if (!allowed) {
      throw new ForbiddenException(
        `Campus Admin cannot assign the ${roleName} role`,
      );
    }
  }

  private async writeUserAudit(
    tenantId: string,
    actorUserId: string | undefined,
    action: string,
    resourceId: string,
    details?: unknown,
    resourceType = 'user',
  ) {
    try {
      await this.dataSource.query(
        `INSERT INTO admin_control_audit
           (tenant_id, actor_user_id, action, resource_type, resource_id, details)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          tenantId,
          actorUserId ?? null,
          action,
          resourceType,
          resourceId,
          JSON.stringify(details ?? {}),
        ],
      );
    } catch {
      /* audit table optional */
    }
  }

  private async resolveRoleId(roleName: string): Promise<number> {
    const [row] = await this.dataSource.query(
      `SELECT role_id, role_name FROM roles
       WHERE lower(role_name) = lower($1)
       LIMIT 1`,
      [roleName.trim()],
    );
    if (!row) throw new BadRequestException(`Unknown role: ${roleName}`);
    return Number(row.role_id);
  }

  private async assertDepartmentOnCampus(
    user: ScopedAuthUser,
    deptId: number,
    campusIds?: number[],
  ) {
    if (!Number.isInteger(deptId) || deptId <= 0) {
      throw new BadRequestException('A valid department is required');
    }
    const ids = campusIds ?? (await this.campusScope.requireCampusIds(user));
    const [row] = await this.dataSource.query(
      `SELECT d.dept_id, s.campus_id
       FROM departments d
       JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
       WHERE d.dept_id = $1 AND d.deleted_at IS NULL`,
      [deptId],
    );
    if (!row) {
      throw new BadRequestException('Selected department does not exist');
    }
    this.campusScope.assertRecordCampusAllowed(ids, row.campus_id);
    return row as { dept_id: number; campus_id: number };
  }

  private async assertManagedUserOnCampus(
    user: ScopedAuthUser,
    userId: string,
  ): Promise<{
    user_id: string;
    role_name: string | null;
    dept_id: number | null;
    campus_id: number | null;
    is_active: boolean;
  }> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      throw new NotFoundException('User not found on this campus');
    }
    const ids = await this.campusScope.requireCampusIds(user);
    const [row] = await this.dataSource.query(
      `SELECT u.user_id, u.is_active, u.dept_id, r.role_name, s.campus_id
       FROM users u
       LEFT JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       LEFT JOIN schools s ON s.school_id = d.school_id
       WHERE u.tenant_id = $1 AND u.user_id = $2
       LIMIT 1`,
      [this.tenant(user), userId],
    );
    if (!row) throw new NotFoundException('User not found on this campus');

    const roleKey = this.normalizeRoleKey(String(row.role_name ?? ''));
    if (
      CAMPUS_ADMIN_FORBIDDEN_ROLES.has(roleKey) ||
      CAMPUS_ADMIN_FORBIDDEN_ROLES.has(roleKey.replace(/\s+/g, ''))
    ) {
      throw new ForbiddenException(
        'You are not allowed to manage this user account',
      );
    }

    const campusId = row.campus_id == null ? null : Number(row.campus_id);
    if (campusId != null) {
      this.campusScope.assertRecordCampusAllowed(ids, campusId);
    } else if (roleKey === 'student') {
      // Students may be visible via admissions campus without dept — re-check detail path
      try {
        await this.studentsDetail(user, userId);
      } catch {
        throw new ForbiddenException(
          'User is outside the assigned campus scope',
        );
      }
    } else {
      throw new ForbiddenException(
        'User is outside the assigned campus scope',
      );
    }

    return {
      user_id: String(row.user_id),
      role_name: row.role_name ?? null,
      dept_id: row.dept_id == null ? null : Number(row.dept_id),
      campus_id: campusId,
      is_active: Boolean(row.is_active),
    };
  }

  private async detectUserRolesTenantIdColumn() {
    if (this.userRolesHasTenantId != null) return this.userRolesHasTenantId;
    try {
      const rows = await this.dataSource.query(
        `SELECT EXISTS (
           SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'user_roles'
             AND column_name = 'tenant_id'
         ) AS has_tenant_id`,
      );
      this.userRolesHasTenantId = Boolean(
        (rows as Array<{ has_tenant_id: boolean }>)[0]?.has_tenant_id,
      );
    } catch {
      this.userRolesHasTenantId = false;
    }
    return this.userRolesHasTenantId;
  }

  private async syncPrimaryUserRole(
    executor: QueryExecutor,
    userId: string,
    nextRoleId: number,
    tenantId: string,
    previousRoleId?: number | null,
  ) {
    const includeTenantId = await this.detectUserRolesTenantIdColumn();

    await executor.query(
      `UPDATE user_roles
       SET is_primary = false
       WHERE user_id = $1 AND role_id <> $2`,
      [userId, nextRoleId],
    );
    if (previousRoleId && previousRoleId !== nextRoleId) {
      await executor.query(
        `DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2`,
        [userId, previousRoleId],
      );
    }

    if (includeTenantId) {
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

  async listManagedUsers(
    user: ScopedAuthUser,
    filters: {
      q?: string;
      role?: string;
      status?: string;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const ids = await this.campusScope.requireCampusIds(user);
    const tid = this.tenant(user);
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
    const offset = (page - 1) * limit;
    const params: unknown[] = [tid, ids];
    const where = [
      'u.tenant_id = $1',
      's.campus_id = ANY($2::int[])',
      `lower(r.role_name) IN (${CAMPUS_ADMIN_ASSIGNABLE_ROLES.map(
        (role) => `'${role.toLowerCase()}'`,
      ).join(', ')})`,
    ];

    const status = String(filters.status ?? 'all').toLowerCase();
    if (status === 'active') where.push('u.is_active = true');
    if (status === 'inactive') where.push('u.is_active = false');

    if (filters.role?.trim()) {
      params.push(filters.role.trim().toLowerCase());
      where.push(`lower(r.role_name) = $${params.length}`);
    }
    if (filters.q?.trim()) {
      params.push(`%${filters.q.trim().toLowerCase()}%`);
      where.push(
        `(lower(u.name) LIKE $${params.length} OR lower(u.official_email) LIKE $${params.length})`,
      );
    }

    const whereSql = where.join(' AND ');
    const countParams = [...params];
    const [countRow] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id AND d.deleted_at IS NULL
       LEFT JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
       WHERE ${whereSql}`,
      countParams,
    );

    params.push(limit, offset);
    const items = await this.dataSource.query(
      `SELECT u.user_id, u.name, u.official_email AS email, u.phone, u.is_active,
              u.account_status, u.created_at, u.updated_at, u.last_login_at,
              u.dept_id, d.dept_name, r.role_name, s.school_name, c.campus_name
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id AND d.deleted_at IS NULL
       LEFT JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
       LEFT JOIN campuses c ON c.campus_id = s.campus_id AND c.deleted_at IS NULL
       WHERE ${whereSql}
       ORDER BY u.created_at DESC NULLS LAST, u.name
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const total = Number(countRow?.total ?? 0);
    return {
      items,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getManagedUser(user: ScopedAuthUser, userId: string) {
    await this.assertManagedUserOnCampus(user, userId);
    const [row] = await this.dataSource.query(
      `SELECT u.user_id, u.name, u.official_email AS email, u.phone, u.is_active,
              u.account_status, u.onboarding_status, u.created_at, u.updated_at,
              u.last_login_at, u.dept_id, d.dept_name, r.role_name,
              s.school_name, c.campus_name
       FROM users u
       LEFT JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       LEFT JOIN schools s ON s.school_id = d.school_id
       LEFT JOIN campuses c ON c.campus_id = s.campus_id
       WHERE u.tenant_id = $1 AND u.user_id = $2
       LIMIT 1`,
      [this.tenant(user), userId],
    );
    if (!row) throw new NotFoundException('User not found on this campus');
    return row;
  }

  async listAssignableRoles(user: ScopedAuthUser) {
    await this.campusScope.requireCampusIds(user);
    const roles = await this.dataSource.query(
      `SELECT role_id, role_name FROM roles ORDER BY role_name`,
    );
    const allowed = new Set(
      CAMPUS_ADMIN_ASSIGNABLE_ROLES.map((role) => role.toLowerCase()),
    );
    return {
      roles: (roles as Array<{ role_id: number; role_name: string }>).filter(
        (role) => allowed.has(String(role.role_name).toLowerCase()),
      ),
    };
  }

  async createManagedUser(user: ScopedAuthUser, dto: CreateCampusUserDto) {
    const campusIds = await this.campusScope.requireCampusIds(user);
    this.assertCampusAssignableRole(dto.role_name);
    await this.assertDepartmentOnCampus(user, dto.dept_id, campusIds);

    const tid = this.tenant(user);
    const email = dto.email.trim().toLowerCase();
    const [existing] = await this.dataSource.query(
      `SELECT user_id FROM users WHERE tenant_id = $1 AND lower(official_email) = $2`,
      [tid, email],
    );
    if (existing) throw new BadRequestException('Email already exists');

    const roleId = await this.resolveRoleId(dto.role_name);
    const temp =
      dto.temporary_password?.trim() ||
      `Tmp-${randomBytes(4).toString('hex')}!A1`;
    const hash = await bcrypt.hash(temp, 10);
    const isActive = dto.is_active === true;
    const phone = dto.phone?.trim() || null;

    const row = await this.dataSource.transaction(async (manager) => {
      const [created] = await manager.query(
        `INSERT INTO users (
           tenant_id, name, official_email, phone, role_id, dept_id,
           is_active, account_status, password_hash, onboarding_status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING_PASSWORD_RESET')
         RETURNING user_id, name, official_email AS email, phone, role_id, dept_id,
                   is_active, account_status, created_at`,
        [
          tid,
          dto.name.trim(),
          email,
          phone,
          roleId,
          dto.dept_id,
          isActive,
          isActive ? 'ACTIVE' : 'DEACTIVATED',
          hash,
        ],
      );
      await this.syncPrimaryUserRole(
        manager as QueryExecutor,
        String(created.user_id),
        roleId,
        tid,
      );
      return created;
    });

    await this.writeUserAudit(tid, user.user_id, 'CREATE', String(row.user_id), {
      email,
      role: dto.role_name,
      dept_id: dto.dept_id,
      is_active: isActive,
      via: 'campus-admin',
    });

    return { ...row, temporary_password: temp, role_name: dto.role_name };
  }

  async updateManagedUser(
    user: ScopedAuthUser,
    userId: string,
    dto: UpdateCampusUserDto,
  ) {
    const existing = await this.assertManagedUserOnCampus(user, userId);
    const campusIds = await this.campusScope.requireCampusIds(user);
    const tid = this.tenant(user);

    if (dto.role_name) {
      this.assertCampusAssignableRole(dto.role_name);
      if (user.user_id === userId) {
        throw new ForbiddenException(
          'You cannot change your own role from Campus Admin user management',
        );
      }
    }
    if (dto.dept_id != null) {
      await this.assertDepartmentOnCampus(user, dto.dept_id, campusIds);
    } else if (dto.dept_id === null) {
      throw new BadRequestException(
        'Campus users must remain linked to a campus department',
      );
    }
    if (dto.email?.trim()) {
      const nextEmail = dto.email.trim().toLowerCase();
      const [dup] = await this.dataSource.query(
        `SELECT user_id FROM users
         WHERE tenant_id = $1 AND lower(official_email) = $2 AND user_id <> $3
         LIMIT 1`,
        [tid, nextEmail, userId],
      );
      if (dup) throw new BadRequestException('Email already exists');
    }

    let nextRoleId: number | null = null;
    if (dto.role_name) {
      nextRoleId = await this.resolveRoleId(dto.role_name);
    }
    const [roleRow] = await this.dataSource.query(
      `SELECT role_id FROM users WHERE user_id = $1`,
      [userId],
    );
    const oldRoleId = Number(roleRow?.role_id ?? 0) || null;

    const accountStatus =
      dto.is_active === undefined
        ? null
        : dto.is_active
          ? 'ACTIVE'
          : 'DEACTIVATED';

    const row = await this.dataSource.transaction(async (manager) => {
      const [updated] = await manager.query(
        `UPDATE users SET
           name = COALESCE($3, name),
           official_email = COALESCE($4, official_email),
           phone = CASE WHEN $5::boolean THEN $6 ELSE phone END,
           role_id = COALESCE($7, role_id),
           dept_id = CASE WHEN $8::boolean THEN $9 ELSE dept_id END,
           is_active = COALESCE($10, is_active),
           account_status = COALESCE($11, account_status),
           updated_at = NOW()
         WHERE tenant_id = $1 AND user_id = $2
         RETURNING user_id, name, official_email AS email, phone, role_id, dept_id,
                   is_active, account_status`,
        [
          tid,
          userId,
          dto.name?.trim() ?? null,
          dto.email?.trim().toLowerCase() ?? null,
          dto.phone !== undefined,
          dto.phone?.trim() || null,
          nextRoleId,
          dto.dept_id !== undefined,
          dto.dept_id ?? null,
          dto.is_active ?? null,
          accountStatus,
        ],
      );
      if (nextRoleId != null) {
        await this.syncPrimaryUserRole(
          manager as QueryExecutor,
          userId,
          nextRoleId,
          tid,
          oldRoleId,
        );
      }
      return updated;
    });

    await this.writeUserAudit(tid, user.user_id, 'UPDATE', userId, {
      ...dto,
      via: 'campus-admin',
    });
    return row;
  }

  async activateManagedUser(user: ScopedAuthUser, userId: string) {
    return this.updateManagedUser(user, userId, { is_active: true });
  }

  async deactivateManagedUser(user: ScopedAuthUser, userId: string) {
    if (user.user_id === userId) {
      throw new ForbiddenException('You cannot deactivate your own account');
    }
    return this.updateManagedUser(user, userId, { is_active: false });
  }

  private emptyCaps() {
    return { view: [] as string[], edit: [] as string[], approve: [] as string[] };
  }

  private sanitizeCampusResources(values?: string[]): string[] {
    const allowed = new Set(
      CAMPUS_ADMIN_PERMISSION_RESOURCES.map((r) => r.toLowerCase()),
    );
    const out: string[] = [];
    for (const raw of values ?? []) {
      const key = String(raw ?? '')
        .trim()
        .toLowerCase();
      if (!key) continue;
      if (CAMPUS_ADMIN_FORBIDDEN_RESOURCES.has(key)) {
        throw new ForbiddenException(
          `Campus Admin cannot grant the privileged resource "${raw}"`,
        );
      }
      if (!allowed.has(key)) {
        throw new BadRequestException(
          `Resource "${raw}" is outside Campus Admin permission scope`,
        );
      }
      if (!out.includes(key)) out.push(key);
    }
    return out;
  }

  private resolveCampusRoleCapabilities(
    roleName: string,
    override?: Record<string, string[]> | null,
  ) {
    const matrixKey = Object.keys(ROLE_PERMISSIONS).find(
      (role) => role.toLowerCase() === roleName.toLowerCase(),
    );
    const base = matrixKey
      ? ROLE_PERMISSIONS[matrixKey]
      : this.emptyCaps();
    const view = override?.view ?? override?.read ?? base.view;
    const edit = override?.edit ?? override?.update ?? base.edit;
    const approve = override?.approve ?? base.approve;
    return {
      read: override?.read ?? view,
      create: override?.create ?? edit,
      edit,
      update: override?.update ?? edit,
      delete: override?.delete ?? [],
      approve,
      export: override?.export ?? [],
      import: override?.import ?? [],
      assign: override?.assign ?? [],
      manage: override?.manage ?? edit,
      audit: override?.audit ?? [],
      view,
    };
  }

  async listRolePermissions(user: ScopedAuthUser, q?: string) {
    const campusIds = await this.campusScope.requireCampusIds(user);
    const tid = this.tenant(user);
    const allowed = new Set(
      CAMPUS_ADMIN_ASSIGNABLE_ROLES.map((role) => role.toLowerCase()),
    );

    const dbRoles = (await this.dataSource.query(
      `SELECT role_id, role_name FROM roles ORDER BY role_name`,
    )) as Array<{ role_id: number; role_name: string }>;

    let overrides: Array<{ role_name: string; capabilities: unknown }> = [];
    try {
      overrides = await this.dataSource.query(
        `SELECT role_name, capabilities
         FROM admin_role_permission_overrides
         WHERE tenant_id = $1`,
        [tid],
      );
    } catch {
      overrides = [];
    }
    const overrideMap = new Map(
      overrides.map((row) => [
        String(row.role_name).toLowerCase(),
        row.capabilities as Record<string, string[]>,
      ]),
    );

    const counts = (await this.dataSource.query(
      `SELECT lower(r.role_name) AS role_key, COUNT(*)::int AS user_count
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id AND d.deleted_at IS NULL
       LEFT JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
       WHERE u.tenant_id = $1
         AND s.campus_id = ANY($2::int[])
         AND lower(r.role_name) = ANY($3::text[])
       GROUP BY lower(r.role_name)`,
      [tid, campusIds, [...allowed]],
    )) as Array<{ role_key: string; user_count: number }>;
    const countMap = new Map(
      counts.map((row) => [row.role_key, Number(row.user_count) || 0]),
    );

    const query = String(q ?? '')
      .trim()
      .toLowerCase();
    const roles = dbRoles
      .filter((role) => allowed.has(String(role.role_name).toLowerCase()))
      .filter((role) =>
        query ? String(role.role_name).toLowerCase().includes(query) : true,
      )
      .map((role) => {
        const key = String(role.role_name).toLowerCase();
        const override = overrideMap.get(key) ?? null;
        const permissions = this.resolveCampusRoleCapabilities(
          role.role_name,
          override,
        );
        return {
          role_id: Number(role.role_id),
          role_name: role.role_name,
          user_count: countMap.get(key) ?? 0,
          source: override ? 'override' : 'matrix',
          can_manage: true,
          permissions,
        };
      });

    return {
      roles,
      actions: [...CAMPUS_PERMISSION_ACTIONS],
      resources: [...CAMPUS_ADMIN_PERMISSION_RESOURCES],
      hierarchy: [
        'Super Admin',
        'Admin',
        'Registrar',
        'Campus Admin',
        'HOD',
        'Faculty',
      ],
      note: 'Campus Admin may manage permissions only for campus-assignable roles below Campus Admin. Super Admin, Registrar, and Campus Admin privileges are locked.',
    };
  }

  async updateRolePermissions(
    user: ScopedAuthUser,
    roleName: string,
    dto: UpdateCampusRolePermissionsDto,
  ) {
    await this.campusScope.requireCampusIds(user);
    this.assertCampusAssignableRole(roleName);

    const [roleRow] = await this.dataSource.query(
      `SELECT role_id, role_name FROM roles
       WHERE lower(role_name) = lower($1)
       LIMIT 1`,
      [roleName.trim()],
    );
    if (!roleRow) throw new NotFoundException(`Role ${roleName} was not found`);

    const tid = this.tenant(user);
    const capabilities = {
      view: this.sanitizeCampusResources(dto.view ?? dto.read),
      read: this.sanitizeCampusResources(dto.read ?? dto.view),
      create: this.sanitizeCampusResources(dto.create),
      edit: this.sanitizeCampusResources(dto.edit ?? dto.update),
      update: this.sanitizeCampusResources(dto.update ?? dto.edit),
      delete: this.sanitizeCampusResources(dto.delete),
      approve: this.sanitizeCampusResources(dto.approve),
      export: this.sanitizeCampusResources(dto.export),
      import: this.sanitizeCampusResources(dto.import),
      assign: this.sanitizeCampusResources(dto.assign),
      manage: this.sanitizeCampusResources(dto.manage),
      audit: this.sanitizeCampusResources(dto.audit),
    };

    const [row] = await this.dataSource.query(
      `INSERT INTO admin_role_permission_overrides
         (tenant_id, role_name, capabilities, updated_by)
       VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (tenant_id, role_name) DO UPDATE SET
         capabilities = EXCLUDED.capabilities,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()
       RETURNING role_name, capabilities, updated_at`,
      [
        tid,
        String(roleRow.role_name),
        JSON.stringify(capabilities),
        user.user_id ?? null,
      ],
    );

    await this.writeUserAudit(
      tid,
      user.user_id,
      'UPDATE',
      String(roleRow.role_name),
      {
        via: 'campus-admin',
        capabilities,
      },
      'role_permissions',
    );

    return {
      role_name: String(row?.role_name ?? roleRow.role_name),
      source: 'override',
      permissions: this.resolveCampusRoleCapabilities(
        String(roleRow.role_name),
        capabilities,
      ),
      updated_at: row?.updated_at ?? null,
    };
  }
}
