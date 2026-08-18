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
        this.applications(user, campusIds),
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
      `SELECT d.dept_id, d.dept_name, s.school_id, s.school_name, s.campus_id, c.campus_name
       FROM departments d
       JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
       JOIN campuses c ON c.campus_id = s.campus_id AND c.deleted_at IS NULL
       WHERE d.deleted_at IS NULL
         AND s.campus_id = ANY($1::int[])
       ORDER BY c.campus_name, s.school_name, d.dept_name`,
      [ids],
    );
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
         AND lower(r.role_name) IN (
           'faculty', 'hod', 'dean', 'warden', 'librarian', 'labadmin',
           'transportofficer', 'accountant', 'hr', 'hradmin'
         )
         AND s.campus_id = ANY($2::int[])
       ORDER BY r.role_name, u.name
       LIMIT 300`,
      [this.tenant(user), ids],
    );
  }

  async students(user: ScopedAuthUser, campusIds?: number[]) {
    const ids = campusIds ?? (await this.campusScope.requireCampusIds(user));
    return this.dataSource.query(
      `SELECT u.user_id, u.name, u.official_email AS email,
              d.dept_name, s.school_name, c.campus_name
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id AND d.deleted_at IS NULL
       LEFT JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
       LEFT JOIN campuses c ON c.campus_id = s.campus_id AND c.deleted_at IS NULL
       WHERE u.tenant_id = $1
         AND u.is_active = true
         AND lower(r.role_name) = 'student'
         AND s.campus_id = ANY($2::int[])
       ORDER BY u.name
       LIMIT 400`,
      [this.tenant(user), ids],
    );
  }

  async applications(user: ScopedAuthUser, campusIds?: number[]) {
    const ids = campusIds ?? (await this.campusScope.requireCampusIds(user));
    try {
      return await this.dataSource.query(
        `SELECT a.application_id, a.status, a.submitted_at, a.program_id,
                p.program_name, p.program_code, s.school_name, c.campus_name
         FROM admissions_applications a
         JOIN iam_programs p ON p.program_id = a.program_id AND p.deleted_at IS NULL
         JOIN schools s ON s.school_id = p.school_id AND s.deleted_at IS NULL
         JOIN campuses c ON c.campus_id = s.campus_id AND c.deleted_at IS NULL
         WHERE a.deleted_at IS NULL
           AND s.campus_id = ANY($1::int[])
         ORDER BY a.submitted_at DESC NULLS LAST
         LIMIT 300`,
        [ids],
      );
    } catch {
      return [];
    }
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
