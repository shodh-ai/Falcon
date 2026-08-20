import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  CampusScopeService,
  type ScopedAuthUser,
} from '../../common/campus-scope/campus-scope.service';
import { SuperAdminService } from '../super-admin/super-admin.service';
import {
  CreateCampusCourseDto,
  CreateCampusProgramDto,
  UpdateCampusCourseDto,
  UpdateCampusProgramDto,
} from './dto/campus-program-course.dto';

@Injectable()
export class CampusAdminService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly campusScope: CampusScopeService,
    private readonly superAdmin: SuperAdminService,
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

  async departments(user: ScopedAuthUser, campusIds?: number[]) {
    const ids = campusIds ?? (await this.campusScope.requireCampusIds(user));
    return this.dataSource.query(
      `SELECT d.dept_id, d.dept_name, d.description, s.school_id, s.school_name,
              s.campus_id, c.campus_name, u.name AS hod_name
       FROM departments d
       JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
       JOIN campuses c ON c.campus_id = s.campus_id AND c.deleted_at IS NULL
       LEFT JOIN users u ON u.user_id = d.hod_user_id
       WHERE d.deleted_at IS NULL
         AND s.campus_id = ANY($1::int[])
       ORDER BY s.school_name, d.dept_name`,
      [ids],
    );
  }

  async departmentDetail(user: ScopedAuthUser, deptId: number) {
    if (!Number.isInteger(deptId) || deptId <= 0) {
      throw new NotFoundException('Department was not found on this campus');
    }
    const ids = await this.campusScope.requireCampusIds(user);
    const rows = await this.dataSource.query(
      `SELECT d.dept_id, d.dept_name, d.description, d.created_at,
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
      description: (row.description as string | null) ?? null,
      status: (row.status as string | null) ?? 'ACTIVE',
      created_at: row.created_at ? String(row.created_at) : null,
      school_id: row.school_id != null ? Number(row.school_id) : null,
      school_name: (row.school_name as string | null) ?? null,
      school_code: (row.school_code as string | null) ?? null,
      campus_id: row.campus_id != null ? Number(row.campus_id) : null,
      campus_name: (row.campus_name as string | null) ?? null,
      campus_code: (row.campus_code as string | null) ?? null,
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

  async facultyStaff(user: ScopedAuthUser, campusIds?: number[]) {
    const ids = campusIds ?? (await this.campusScope.requireCampusIds(user));
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
         AND lower(r.role_name) IN (${CampusAdminService.STAFF_ROLES_SQL})
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
    await this.campusScope.requireCampusIds(user);
    try {
      return await this.dataSource.query(
        `SELECT venue_id, name, capacity, is_bookable_by_students, max_duration_mins
         FROM campus_venues
         WHERE tenant_id = $1
         ORDER BY name ASC`,
        [this.tenant(user)],
      );
    } catch {
      return [];
    }
  }

  async requests(user: ScopedAuthUser) {
    const campusIds = await this.campusScope.requireCampusIds(user);
    try {
      return await this.dataSource.query(
        `SELECT t.ticket_id, t.ticket_ref, t.category, t.subject, t.status, t.created_at
         FROM helpdesk_tickets t
         JOIN users u ON u.user_id = t.student_user_id
         JOIN departments d ON d.dept_id = u.dept_id AND d.deleted_at IS NULL
         JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
         WHERE t.tenant_id = $1
           AND t.deleted_at IS NULL
           AND t.category IN ('FACILITIES', 'HOSTEL', 'IT', 'ACADEMICS', 'OTHER')
           AND s.campus_id = ANY($2::int[])
         ORDER BY t.created_at DESC
         LIMIT 200`,
        [this.tenant(user), campusIds],
      );
    } catch {
      return [];
    }
  }

  async reports(user: ScopedAuthUser) {
    const dash = await this.dashboard(user);
    return {
      generated_at: new Date().toISOString(),
      campus_ids: await this.campusScope.requireCampusIds(user),
      kpis: dash.kpis,
    };
  }

  async analytics(user: ScopedAuthUser) {
    return this.reports(user);
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
    const [row] = await this.dataSource.query(
      `UPDATE academic_courses SET
         course_name = COALESCE($2, course_name),
         course_code = COALESCE($3, course_code),
         credits = COALESCE($4, credits),
         is_elective = COALESCE($5, is_elective),
         entity_id = COALESCE($6, entity_id),
         updated_at = NOW()
       WHERE course_id = $1 AND tenant_id = $7 AND deleted_at IS NULL
       RETURNING course_id, course_code, course_name, credits, is_elective, entity_id`,
      [
        courseId,
        dto.course_name?.trim() ?? null,
        dto.course_code?.trim().toUpperCase() ?? null,
        dto.credits ?? null,
        dto.is_elective ?? null,
        dto.dept_id ?? null,
        this.tenant(user),
      ],
    );
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
    const [row] = await this.dataSource.query(
      `UPDATE academic_courses SET deleted_at = NOW(), updated_at = NOW()
       WHERE course_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING course_id`,
      [courseId, this.tenant(user)],
    );
    if (!row) throw new NotFoundException('Course not found');
    return { deactivated: true, course_id: courseId };
  }

  async restoreCourse(user: ScopedAuthUser, courseId: string) {
    await this.assertCourseOnCampus(user, courseId);
    const [row] = await this.dataSource.query(
      `UPDATE academic_courses SET deleted_at = NULL, updated_at = NOW()
       WHERE course_id = $1 AND tenant_id = $2 AND deleted_at IS NOT NULL
       RETURNING course_id`,
      [courseId, this.tenant(user)],
    );
    if (!row) throw new NotFoundException('Course not found or already active');
    return { activated: true, course_id: courseId };
  }
}
