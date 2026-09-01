import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export type ScopedAuthUser = {
  user_id?: string;
  tenant_id?: string;
  role?: string;
  roles?: string[];
};

export type HierarchyTree = {
  campuses: Array<{ campus_id: number; campus_name: string }>;
  schools: Array<{ school_id: number; school_name: string; campus_id: number }>;
  departments: Array<{
    dept_id: number;
    dept_name: string;
    school_id?: number | null;
    school_ids?: number[];
  }>;
  programs: Array<{ program_id: number; program_name: string; school_id: number }>;
  batches: Array<{
    batch_id: string | number;
    batch_name: string;
    program_id?: number | string | null;
  }>;
};

@Injectable()
export class CampusScopeService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  roleNames(user: ScopedAuthUser): string[] {
    return Array.from(
      new Set(
        [...(user.roles ?? []), user.role ?? '']
          .map((role) => String(role).trim())
          .filter(Boolean),
      ),
    );
  }

  isCampusAdmin(user: ScopedAuthUser): boolean {
    return this.roleNames(user).some(
      (role) => role.toLowerCase() === 'campusadmin',
    );
  }

  isUnrestricted(user: ScopedAuthUser): boolean {
    return this.roleNames(user).some((role) => {
      const normalized = role.toLowerCase();
      return normalized === 'superadmin' || normalized === 'registrar';
    });
  }

  /**
   * null = no campus restriction (Super Admin / Registrar).
   * [] = Campus Admin with no assigned campus (deny all campus data).
   */
  async resolveCampusIds(user: ScopedAuthUser): Promise<number[] | null> {
    if (this.isUnrestricted(user) || !this.isCampusAdmin(user)) {
      return null;
    }
    if (!user.user_id) return [];

    const assigned = await this.dataSource.query<Array<{ entity_id: string }>>(
      `SELECT entity_id
       FROM hierarchy_assignments
       WHERE user_id = $1
         AND upper(entity_type) = 'CAMPUS'`,
      [user.user_id],
    );
    const fromAssignments = assigned
      .map((row) => Number(row.entity_id))
      .filter((id) => Number.isInteger(id) && id > 0);
    if (fromAssignments.length) {
      return Array.from(new Set(fromAssignments));
    }

    const fromDept = await this.dataSource.query<Array<{ campus_id: number }>>(
      `SELECT DISTINCT s.campus_id
       FROM users u
       JOIN departments d ON d.dept_id = u.dept_id AND d.deleted_at IS NULL
       JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
       WHERE u.user_id = $1
         AND s.campus_id IS NOT NULL`,
      [user.user_id],
    );
    const deptCampuses = fromDept
      .map((row) => Number(row.campus_id))
      .filter((id) => Number.isInteger(id) && id > 0);
    if (deptCampuses.length) {
      return Array.from(new Set(deptCampuses));
    }

    const campuses = await this.dataSource.query<Array<{ campus_id: number }>>(
      `SELECT campus_id FROM campuses WHERE deleted_at IS NULL ORDER BY campus_id ASC`,
    );
    if (campuses.length === 1) {
      return [campuses[0].campus_id];
    }
    return [];
  }

  async requireCampusIds(user: ScopedAuthUser): Promise<number[]> {
    const ids = await this.resolveCampusIds(user);
    if (ids === null) {
      throw new ForbiddenException('Campus scope does not apply to this role');
    }
    if (!ids.length) {
      throw new ForbiddenException(
        'No campus is assigned to this Campus Admin account',
      );
    }
    return ids;
  }

  assertCampusIdAllowed(campusIds: number[], campusId: number | string | undefined) {
    if (campusId == null || campusId === '') return;
    const parsed = Number(campusId);
    if (!Number.isInteger(parsed) || !campusIds.includes(parsed)) {
      throw new ForbiddenException('Access denied for this campus');
    }
  }

  /** Record access: unresolved or foreign campus is always denied. */
  assertRecordCampusAllowed(
    campusIds: number[],
    campusId: number | string | null | undefined,
  ) {
    if (campusId == null || campusId === '') {
      throw new ForbiddenException('Access denied for this campus');
    }
    const parsed = Number(campusId);
    if (!Number.isInteger(parsed) || !campusIds.includes(parsed)) {
      throw new ForbiddenException('Access denied for this campus');
    }
  }

  /**
   * No-op for Super Admin, Registrar, and other non–Campus Admin roles.
   * Campus Admin must have assigned campuses and the record must resolve to one.
   */
  async assertActorCampusAccess(
    user: ScopedAuthUser | undefined,
    campusId: number | string | null | undefined,
  ) {
    if (!user) return;
    const ids = await this.resolveCampusIds(user);
    if (ids === null) return;
    if (!ids.length) {
      throw new ForbiddenException(
        'No campus is assigned to this Campus Admin account',
      );
    }
    this.assertRecordCampusAllowed(ids, campusId);
  }

  async campusIdForProgram(
    programId: number | string | null | undefined,
  ): Promise<number | null> {
    const parsed = Number(programId);
    if (!Number.isInteger(parsed) || parsed <= 0) return null;
    const rows = await this.dataSource.query<Array<{ campus_id: number }>>(
      `SELECT s.campus_id
       FROM iam_programs p
       JOIN schools s ON s.school_id = p.school_id AND s.deleted_at IS NULL
       WHERE p.program_id = $1
         AND p.deleted_at IS NULL
         AND s.campus_id IS NOT NULL
       LIMIT 1`,
      [parsed],
    );
    const campusId = Number(rows[0]?.campus_id);
    return Number.isInteger(campusId) && campusId > 0 ? campusId : null;
  }

  async campusIdForProgramCode(
    programCode: string | null | undefined,
  ): Promise<number | null> {
    const code = String(programCode ?? '').trim();
    if (!code) return null;
    const rows = await this.dataSource.query<Array<{ campus_id: number }>>(
      `SELECT s.campus_id
       FROM iam_programs p
       JOIN schools s ON s.school_id = p.school_id AND s.deleted_at IS NULL
       WHERE p.deleted_at IS NULL
         AND s.campus_id IS NOT NULL
         AND upper(trim(p.program_code)) = upper(trim($1))
       LIMIT 1`,
      [code],
    );
    const campusId = Number(rows[0]?.campus_id);
    return Number.isInteger(campusId) && campusId > 0 ? campusId : null;
  }

  async campusIdForMeritPreference(
    preference: string | null | undefined,
  ): Promise<number | null> {
    const value = String(preference ?? '').trim();
    if (!value) return null;
    const rows = await this.dataSource.query<Array<{ campus_id: number }>>(
      `SELECT s.campus_id
       FROM iam_programs p
       JOIN schools s ON s.school_id = p.school_id AND s.deleted_at IS NULL
       WHERE p.deleted_at IS NULL
         AND s.campus_id IS NOT NULL
         AND (
           upper(trim(p.program_code)) = upper(trim($1))
           OR lower(trim(p.program_name)) = lower(trim($1))
         )
       LIMIT 1`,
      [value],
    );
    const campusId = Number(rows[0]?.campus_id);
    return Number.isInteger(campusId) && campusId > 0 ? campusId : null;
  }

  async campusIdForApplication(
    applicationId: string | null | undefined,
  ): Promise<number | null> {
    const id = String(applicationId ?? '').trim();
    if (!id) return null;
    const rows = await this.dataSource.query<Array<{ campus_id: number }>>(
      `SELECT s.campus_id
       FROM admissions_applications a
       JOIN iam_programs p ON p.program_id = a.program_id AND p.deleted_at IS NULL
       JOIN schools s ON s.school_id = p.school_id AND s.deleted_at IS NULL
       WHERE a.application_id = $1
         AND a.deleted_at IS NULL
         AND s.campus_id IS NOT NULL
       LIMIT 1`,
      [id],
    );
    const campusId = Number(rows[0]?.campus_id);
    return Number.isInteger(campusId) && campusId > 0 ? campusId : null;
  }

  async campusIdForUserDept(
    userId: string | null | undefined,
  ): Promise<number | null> {
    const id = String(userId ?? '').trim();
    if (!id) return null;
    const rows = await this.dataSource.query<Array<{ campus_id: number }>>(
      `SELECT s.campus_id
       FROM users u
       JOIN departments d ON d.dept_id = u.dept_id AND d.deleted_at IS NULL
       JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
       WHERE u.user_id = $1
         AND s.campus_id IS NOT NULL
       LIMIT 1`,
      [id],
    );
    const campusId = Number(rows[0]?.campus_id);
    return Number.isInteger(campusId) && campusId > 0 ? campusId : null;
  }

  async campusIdForTransactionStudent(
    transactionId: string | null | undefined,
  ): Promise<number | null> {
    const id = String(transactionId ?? '').trim();
    if (!id) return null;
    const rows = await this.dataSource.query<Array<{ campus_id: number }>>(
      `SELECT s.campus_id
       FROM finance_transactions t
       JOIN users u ON u.user_id = t.student_user_id
       JOIN departments d ON d.dept_id = u.dept_id AND d.deleted_at IS NULL
       JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
       WHERE t.transaction_id::text = $1
         AND s.campus_id IS NOT NULL
       LIMIT 1`,
      [id],
    );
    const campusId = Number(rows[0]?.campus_id);
    return Number.isInteger(campusId) && campusId > 0 ? campusId : null;
  }

  async departmentIdsForCampuses(campusIds: number[]): Promise<number[]> {
    if (!campusIds.length) return [];
    const rows = await this.dataSource.query<Array<{ dept_id: number }>>(
      `SELECT d.dept_id
       FROM departments d
       JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
       WHERE d.deleted_at IS NULL
         AND s.campus_id = ANY($1::int[])`,
      [campusIds],
    );
    return Array.from(
      new Set(
        rows
          .map((row) => Number(row.dept_id))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    );
  }

  async campusIdForCourseCode(
    tenantId: string,
    courseCode: string | null | undefined,
  ): Promise<number | null> {
    const code = String(courseCode ?? '').trim();
    if (!code) return null;
    try {
      const rows = await this.dataSource.query<Array<{ campus_id: number }>>(
        `SELECT s.campus_id
         FROM academic_courses ac
         JOIN departments d ON d.dept_id = ac.entity_id AND d.deleted_at IS NULL
         JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
         WHERE ac.tenant_id = $1
           AND upper(trim(ac.course_code)) = upper(trim($2))
           AND s.campus_id IS NOT NULL
         LIMIT 1`,
        [tenantId, code],
      );
      const campusId = Number(rows[0]?.campus_id);
      return Number.isInteger(campusId) && campusId > 0 ? campusId : null;
    } catch {
      return null;
    }
  }

  /** SQL predicate: timetable slot belongs to one of the campus ids (via faculty dept or course dept). */
  timetableSlotCampusMatchSql(slotAlias: string, campusParamIdx: number): string {
    return `(
      EXISTS (
        SELECT 1
        FROM users fu
        JOIN departments fd ON fd.dept_id = fu.dept_id AND fd.deleted_at IS NULL
        JOIN schools fs ON fs.school_id = fd.school_id AND fs.deleted_at IS NULL
        WHERE fu.user_id = ${slotAlias}.faculty_user_id
          AND fs.campus_id = ANY($${campusParamIdx}::int[])
      )
      OR EXISTS (
        SELECT 1
        FROM academic_courses ac
        JOIN departments d ON d.dept_id = ac.entity_id AND d.deleted_at IS NULL
        JOIN schools sch ON sch.school_id = d.school_id AND sch.deleted_at IS NULL
        WHERE ac.tenant_id = ${slotAlias}.tenant_id
          AND ${slotAlias}.course_code IS NOT NULL
          AND upper(trim(ac.course_code)) = upper(trim(${slotAlias}.course_code))
          AND sch.campus_id = ANY($${campusParamIdx}::int[])
      )
    )`;
  }

  /** SQL predicate: campus club event resolves to faculty advisor department campus. */
  campusEventCampusMatchSql(eventAlias: string, campusParamIdx: number): string {
    return `EXISTS (
      SELECT 1
      FROM campus_clubs c
      JOIN users fa ON fa.user_id = c.faculty_advisor_id
      JOIN departments d ON d.dept_id = fa.dept_id AND d.deleted_at IS NULL
      JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL
      WHERE c.club_id = ${eventAlias}.club_id
        AND s.campus_id = ANY($${campusParamIdx}::int[])
    )`;
  }

  async assertTimetableSlotCampusAllowed(
    actor: ScopedAuthUser,
    tenantId: string,
    dto: { faculty_user_id?: unknown; course_code?: unknown },
  ) {
    const campusIds = await this.resolveCampusIds(actor);
    if (campusIds === null) return;
    if (!campusIds.length) {
      throw new ForbiddenException(
        'No campus is assigned to this Campus Admin account',
      );
    }

    const facultyId =
      dto.faculty_user_id != null && dto.faculty_user_id !== ''
        ? String(dto.faculty_user_id)
        : null;
    const courseCode =
      dto.course_code != null && dto.course_code !== ''
        ? String(dto.course_code)
        : null;

    let matched = false;
    if (facultyId) {
      const campusId = await this.campusIdForUserDept(facultyId);
      if (campusId != null && campusIds.includes(campusId)) matched = true;
    }
    if (courseCode) {
      const campusId = await this.campusIdForCourseCode(tenantId, courseCode);
      if (campusId != null && campusIds.includes(campusId)) matched = true;
    }
    if (!matched) {
      throw new ForbiddenException(
        'Timetable slot must use faculty or a course on your assigned campus',
      );
    }
  }

  /**
   * SQL predicate: student visible to Campus Admin via department school OR admissions lead program.
   * Requires LEFT JOIN schools AS `schoolsAlias` ON d.school_id (from user's dept).
   */
  studentCampusVisibilityClause(
    tenantParamIdx: number,
    campusParamIdx: number,
    userAlias = 'u',
    schoolsAlias = 's',
  ) {
    return `(
      ${schoolsAlias}.campus_id = ANY($${campusParamIdx}::int[])
      OR EXISTS (
        SELECT 1
        FROM admissions_leads l
        JOIN iam_programs p ON p.deleted_at IS NULL
          AND (
            p.program_id = l.preferred_program_id
            OR upper(trim(p.program_code)) = upper(trim(l.metadata->>'program'))
            OR lower(trim(p.program_name)) = lower(trim(l.metadata->>'program'))
            OR upper(trim(p.program_code)) = upper(trim(l.metadata->>'preferred_program'))
            OR lower(trim(p.program_name)) = lower(trim(l.metadata->>'preferred_program'))
          )
        JOIN schools ps ON ps.school_id = p.school_id AND ps.deleted_at IS NULL
        WHERE l.tenant_id = $${tenantParamIdx}
          AND l.metadata->>'student_user_id' = ${userAlias}.user_id::text
          AND ps.campus_id = ANY($${campusParamIdx}::int[])
      )
    )`;
  }

  async assertHierarchyTargetAllowed(
    campusIds: number[],
    entityType: string,
    entityId: string,
  ) {
    const type = entityType.trim().toUpperCase();
    const id = entityId.trim();
    if (type === 'CAMPUS') {
      this.assertRecordCampusAllowed(campusIds, id);
      return;
    }
    if (type === 'SCHOOL') {
      const rows = await this.dataSource.query<Array<{ campus_id: number }>>(
        `SELECT campus_id FROM schools WHERE school_id = $1 AND deleted_at IS NULL`,
        [Number(id)],
      );
      this.assertRecordCampusAllowed(campusIds, rows[0]?.campus_id);
      return;
    }
    if (type === 'DEPARTMENT') {
      const rows = await this.dataSource.query<Array<{ campus_id: number }>>(
        `SELECT s.campus_id
         FROM departments d
         JOIN schools s ON s.school_id = d.school_id
         WHERE d.dept_id = $1 AND d.deleted_at IS NULL`,
        [Number(id)],
      );
      this.assertRecordCampusAllowed(campusIds, rows[0]?.campus_id);
      return;
    }
    if (type === 'PROGRAM') {
      const rows = await this.dataSource.query<Array<{ campus_id: number }>>(
        `SELECT s.campus_id
         FROM iam_programs p
         JOIN schools s ON s.school_id = p.school_id
         WHERE p.program_id = $1 AND p.deleted_at IS NULL`,
        [Number(id)],
      );
      this.assertRecordCampusAllowed(campusIds, rows[0]?.campus_id);
      return;
    }
    throw new ForbiddenException('Access denied for this campus');
  }

  filterHierarchy(tree: HierarchyTree, campusIds: number[] | null): HierarchyTree {
    if (!campusIds) return tree;
    if (!campusIds.length) {
      return {
        campuses: [],
        schools: [],
        departments: [],
        programs: [],
        batches: [],
      };
    }
    const campuses = tree.campuses.filter((row) =>
      campusIds.includes(Number(row.campus_id)),
    );
    const schools = tree.schools.filter((row) =>
      campusIds.includes(Number(row.campus_id)),
    );
    const schoolIds = new Set(schools.map((row) => Number(row.school_id)));
    const departments = tree.departments.filter((row) => {
      const ids = [
        ...(row.school_id != null ? [Number(row.school_id)] : []),
        ...(row.school_ids ?? []).map(Number),
      ];
      return ids.some((id) => schoolIds.has(id));
    });
    const programs = tree.programs.filter((row) =>
      schoolIds.has(Number(row.school_id)),
    );
    const programIds = new Set(programs.map((row) => Number(row.program_id)));
    const batches = tree.batches.filter((row) =>
      programIds.has(Number(row.program_id)),
    );
    return {
      campuses,
      schools,
      departments,
      programs,
      batches,
    };
  }
}
