import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { isUUID } from 'class-validator';
import { requireTenantId } from '../../common/utils/require-tenant-id';
import {
  allocationMatchesStudentSlot,
  normalizeProgram,
  parseAllocationSemester,
} from './allocation-semester.util';

export type ExamRegistrationEnrollment = {
  enrollment_id: string;
  course_id: string;
  course_code: string;
  course_name: string;
  subject_id: number | null;
  subject_code: string | null;
  subject_name: string | null;
};

export type ExamRegistrationRosterStudent = {
  student_user_id: string;
  student_name: string;
  program_label: string | null;
  semester: number;
  enrollments: ExamRegistrationEnrollment[];
  unresolved_reasons: string[];
};

export type StudentSlot = {
  studentUserId: string;
  tenantId: string;
  program: string;
  semester: number;
  sectionCode: string | null;
};

export type SyncResult = {
  student_user_id: string;
  semester: number;
  section_code: string | null;
  added: number;
  removed: number;
  kept: number;
};

@Injectable()
export class StudentEnrollmentSyncService {
  private readonly logger = new Logger(StudentEnrollmentSyncService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Read-only Exam Cell contract. Never invokes enrollment/mentor synchronization. */
  async listExamRegistrationRoster(
    tenantId: string,
    scope: { academic_year: string; semester: number; program_label: string },
    manager?: EntityManager,
    studentUserId?: string,
  ): Promise<ExamRegistrationRosterStudent[]> {
    const tid = requireTenantId(tenantId);
    if (
      !isUUID(tid) ||
      !scope.academic_year?.trim() ||
      !scope.program_label?.trim() ||
      !Number.isSafeInteger(scope.semester) ||
      scope.semester < 1 ||
      (studentUserId !== undefined && !isUUID(studentUserId))
    ) {
      throw new BadRequestException(
        'Explicit valid tenant, academic year, programme and semester are required',
      );
    }
    const db = manager ?? this.dataSource;
    type EnrollmentRow = {
      student_user_id: string;
      student_name: string;
      enrollment_id: string;
      course_id: string;
      course_code: string;
      course_name: string;
    };
    const rows = await db.query<EnrollmentRow[]>(
      `SELECT u.user_id AS student_user_id, u.name AS student_name,
              e.enrollment_id, e.course_id, c.course_code, c.course_name
       FROM student_course_enrollments e
       JOIN users u ON u.user_id = e.student_user_id AND u.tenant_id = e.tenant_id
       JOIN academic_courses c ON c.course_id = e.course_id AND c.tenant_id = e.tenant_id
       WHERE e.tenant_id = $1 AND e.semester = $2 AND e.status = 'ENROLLED'
         AND e.deleted_at IS NULL AND c.deleted_at IS NULL
         AND u.deleted_at IS NULL AND u.is_active = true
         AND (EXISTS (SELECT 1 FROM roles r WHERE r.role_id = u.role_id AND r.role_name = 'Student' AND r.deleted_at IS NULL)
           OR EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id
             WHERE ur.user_id = u.user_id AND ur.deleted_at IS NULL AND r.role_name = 'Student' AND r.deleted_at IS NULL))
         AND ($3::uuid IS NULL OR u.user_id = $3)
       ORDER BY u.user_id, e.enrollment_id${manager ? ' FOR SHARE OF u, e, c' : ''}`,
      [tid, scope.semester, studentUserId ?? null],
    );
    if (!rows.length) return [];
    const studentIds = [...new Set(rows.map((r) => r.student_user_id))];
    const profiles = await db.query<
      Array<{
        user_id: string;
        batch: string | null;
        current_semester: number | null;
        section_code: string | null;
      }>
    >(
      `SELECT user_id, batch, current_semester, section_code FROM student_profiles
       WHERE tenant_id = $1 AND user_id = ANY($2::uuid[]) AND deleted_at IS NULL
       ORDER BY user_id${manager ? ' FOR SHARE' : ''}`,
      [tid, studentIds],
    );
    type AllocationRow = {
      course_id: string;
      program_name: string | null;
      semester: string | null;
      subject_id: number;
      subject_code: string;
      subject_name: string;
      subject_semester: number | null;
    };
    const allocations = await db.query<AllocationRow[]>(
      `SELECT a.course_id, a.program_name, a.semester, s.subject_id, s.subject_code,
              s.subject_name, s.semester AS subject_semester
       FROM academic_course_allocations a
       JOIN academic_subjects s ON s.subject_id = a.subject_id
       WHERE a.tenant_id = $1 AND a.academic_year = $2 AND a.status = 'ACTIVE'
         AND a.course_id = ANY($3::uuid[]) AND a.deleted_at IS NULL
         AND s.is_active = true AND s.deleted_at IS NULL
       ORDER BY a.allocation_id${manager ? ' FOR SHARE OF a, s' : ''}`,
      [
        tid,
        scope.academic_year.trim(),
        [...new Set(rows.map((r) => r.course_id))],
      ],
    );
    const result: ExamRegistrationRosterStudent[] = [];
    for (const studentId of studentIds) {
      const own = rows.filter((r) => r.student_user_id === studentId);
      const profile = profiles.find((p) => p.user_id === studentId);
      const program = profile?.batch?.trim() || null;
      if (
        !studentUserId &&
        program &&
        normalizeProgram(scope.program_label) !== normalizeProgram(program)
      )
        continue;
      const reasons: string[] = [];
      if (!program) reasons.push('Official student programme is missing');
      else if (
        normalizeProgram(scope.program_label) !== normalizeProgram(program)
      )
        reasons.push(
          'Student programme does not match the examination session',
        );
      if (
        profile?.current_semester == null ||
        Number(profile.current_semester) !== scope.semester
      )
        reasons.push(
          'Official student semester does not match the examination session',
        );
      const enrollments = own.map((row): ExamRegistrationEnrollment => {
        const mappings = allocations.filter((a) => {
          const parsed = parseAllocationSemester(a.semester);
          return (
            a.course_id === row.course_id &&
            !!program &&
            !!a.program_name?.trim() &&
            normalizeProgram(a.program_name) === normalizeProgram(program) &&
            parsed.semesterNum === scope.semester &&
            (a.subject_semester == null ||
              Number(a.subject_semester) === scope.semester) &&
            (!parsed.sectionCode || !!profile?.section_code?.trim()) &&
            allocationMatchesStudentSlot(
              a.semester,
              a.program_name,
              scope.semester,
              profile?.section_code ?? null,
              program,
            )
          );
        });
        const subjects = [
          ...new Set(mappings.map((m) => Number(m.subject_id))),
        ];
        const mapping = subjects.length === 1 ? mappings[0] : undefined;
        if (!mapping)
          reasons.push(
            `No unambiguous active subject allocation for ${row.course_code} in this academic year and semester`,
          );
        return {
          enrollment_id: row.enrollment_id,
          course_id: row.course_id,
          course_code: row.course_code,
          course_name: row.course_name,
          subject_id: mapping ? Number(mapping.subject_id) : null,
          subject_code: mapping?.subject_code ?? null,
          subject_name: mapping?.subject_name ?? null,
        };
      });
      result.push({
        student_user_id: studentId,
        student_name: own[0].student_name,
        program_label: program,
        semester: scope.semester,
        enrollments,
        unresolved_reasons: reasons,
      });
    }
    return result;
  }

  async syncTenantStudents(
    tenantId: string,
    academicYear = '2026-2027',
  ): Promise<SyncResult[]> {
    const students = await this.dataSource.query<
      Array<{ user_id: string; batch: string | null }>
    >(
      `SELECT u.user_id, sp.batch
       FROM users u
       INNER JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       WHERE u.tenant_id = $1
         AND u.is_active = true
         AND u.deleted_at IS NULL
         AND r.role_name = 'Student'`,
      [tenantId],
    );

    const results: SyncResult[] = [];
    for (const student of students) {
      const slot = await this.resolveStudentSlot(
        tenantId,
        student.user_id,
        student.batch ?? 'BTECH CSE',
      );
      if (!slot) continue;
      results.push(await this.syncStudentSlot(slot, academicYear));
    }
    return results;
  }

  async syncStudent(
    tenantId: string,
    studentUserId: string,
    academicYear = '2026-2027',
  ): Promise<SyncResult | null> {
    const profileRows = await this.dataSource.query<
      Array<{ batch: string | null }>
    >(
      `SELECT batch FROM student_profiles WHERE user_id = $1 AND tenant_id = $2 LIMIT 1`,
      [studentUserId, tenantId],
    );
    const slot = await this.resolveStudentSlot(
      tenantId,
      studentUserId,
      profileRows[0]?.batch ?? 'BTECH CSE',
    );
    if (!slot) return null;
    return this.syncStudentSlot(slot, academicYear);
  }

  async resolveStudentSlot(
    tenantId: string,
    studentUserId: string,
    program: string,
  ): Promise<StudentSlot | null> {
    const profileSlot = await this.dataSource.query<
      Array<{ current_semester: number | null; section_code: string | null }>
    >(
      `SELECT current_semester, section_code
       FROM student_profiles
       WHERE user_id = $1 AND tenant_id = $2
       LIMIT 1`,
      [studentUserId, tenantId],
    );

    if (profileSlot[0]?.current_semester != null) {
      return {
        studentUserId,
        tenantId,
        program,
        semester: Number(profileSlot[0].current_semester),
        sectionCode: profileSlot[0].section_code?.trim().toUpperCase() ?? null,
      };
    }

    const enrollmentSlot = await this.dataSource.query<
      Array<{ semester: number; section_code: string | null; cnt: string }>
    >(
      `SELECT semester, section_code, COUNT(*)::text AS cnt
       FROM student_course_enrollments
       WHERE tenant_id = $1
         AND student_user_id = $2
         AND section_code IS NOT NULL
       GROUP BY semester, section_code
       ORDER BY semester DESC, COUNT(*) DESC
       LIMIT 1`,
      [tenantId, studentUserId],
    );

    if (enrollmentSlot[0]) {
      return {
        studentUserId,
        tenantId,
        program,
        semester: Number(enrollmentSlot[0].semester),
        sectionCode:
          enrollmentSlot[0].section_code?.trim().toUpperCase() ?? null,
      };
    }

    const maxSemRows = await this.dataSource.query<Array<{ semester: number }>>(
      `SELECT COALESCE(MAX(semester), 1) AS semester
       FROM student_course_enrollments
       WHERE tenant_id = $1 AND student_user_id = $2`,
      [tenantId, studentUserId],
    );

    return {
      studentUserId,
      tenantId,
      program,
      semester: Number(maxSemRows[0]?.semester ?? 1),
      sectionCode: null,
    };
  }

  async syncStudentSlot(
    slot: StudentSlot,
    academicYear: string,
  ): Promise<SyncResult> {
    const allocations = await this.dataSource.query<
      Array<{
        course_id: string | null;
        program_name: string | null;
        semester: string | null;
      }>
    >(
      `SELECT course_id, program_name, semester
       FROM academic_course_allocations
       WHERE tenant_id = $1
         AND academic_year = $2
         AND status = 'ACTIVE'
         AND course_id IS NOT NULL`,
      [slot.tenantId, academicYear],
    );

    const matchingCourseIds = allocations
      .filter((row) =>
        allocationMatchesStudentSlot(
          row.semester,
          row.program_name,
          slot.semester,
          slot.sectionCode,
          slot.program,
        ),
      )
      .map((row) => row.course_id!)
      .filter(Boolean);

    const uniqueCourseIds = [...new Set(matchingCourseIds)];

    let added = 0;
    let removed = 0;
    let kept = 0;

    for (const courseId of uniqueCourseIds) {
      const upserted = await this.dataSource.query<
        Array<{ inserted: boolean }>
      >(
        `INSERT INTO student_course_enrollments
           (tenant_id, student_user_id, course_id, semester, section_code, status)
         VALUES ($1, $2, $3, $4, $5, 'ENROLLED')
         ON CONFLICT (tenant_id, student_user_id, course_id)
         DO UPDATE SET
           semester = EXCLUDED.semester,
           section_code = COALESCE(EXCLUDED.section_code, student_course_enrollments.section_code),
           status = CASE
             WHEN student_course_enrollments.status = 'COMPLETED' THEN student_course_enrollments.status
             ELSE 'ENROLLED'
           END
         RETURNING (xmax = 0) AS inserted`,
        [
          slot.tenantId,
          slot.studentUserId,
          courseId,
          slot.semester,
          slot.sectionCode,
        ],
      );
      if (upserted[0]?.inserted) added += 1;
      else kept += 1;
    }

    if (uniqueCourseIds.length > 0) {
      const deleteResult = await this.dataSource.query<
        Array<{ enrollment_id: string }>
      >(
        `DELETE FROM student_course_enrollments
         WHERE tenant_id = $1
           AND student_user_id = $2
           AND semester = $3
           AND status = 'ENROLLED'
           AND course_id <> ALL($4::uuid[])
         RETURNING enrollment_id`,
        [slot.tenantId, slot.studentUserId, slot.semester, uniqueCourseIds],
      );
      removed = deleteResult.length;
    }

    const orphanSemesterDelete = await this.dataSource.query<
      Array<{ enrollment_id: string }>
    >(
      `DELETE FROM student_course_enrollments
       WHERE tenant_id = $1
         AND student_user_id = $2
         AND semester <> $3
         AND status = 'ENROLLED'
       RETURNING enrollment_id`,
      [slot.tenantId, slot.studentUserId, slot.semester],
    );
    removed += orphanSemesterDelete.length;

    this.logger.debug(
      `Synced ${slot.studentUserId} sem ${slot.semester}${slot.sectionCode ? `-${slot.sectionCode}` : ''}: +${added} -${removed} =${kept}`,
    );

    return {
      student_user_id: slot.studentUserId,
      semester: slot.semester,
      section_code: slot.sectionCode,
      added,
      removed,
      kept,
    };
  }

  /** Returns course IDs valid for the student's current semester slot. */
  async listValidCourseIdsForStudent(
    tenantId: string,
    studentUserId: string,
    academicYear = '2026-2027',
  ): Promise<{ semester: number; courseIds: string[] }> {
    const profileRows = await this.dataSource.query<
      Array<{ batch: string | null }>
    >(
      `SELECT batch FROM student_profiles WHERE user_id = $1 AND tenant_id = $2 LIMIT 1`,
      [studentUserId, tenantId],
    );
    const slot = await this.resolveStudentSlot(
      tenantId,
      studentUserId,
      profileRows[0]?.batch ?? 'BTECH CSE',
    );
    if (!slot) return { semester: 1, courseIds: [] };

    const allocations = await this.dataSource.query<
      Array<{
        course_id: string | null;
        program_name: string | null;
        semester: string | null;
      }>
    >(
      `SELECT course_id, program_name, semester
       FROM academic_course_allocations
       WHERE tenant_id = $1 AND academic_year = $2 AND status = 'ACTIVE' AND course_id IS NOT NULL`,
      [tenantId, academicYear],
    );

    const courseIds = [
      ...new Set(
        allocations
          .filter((row) =>
            allocationMatchesStudentSlot(
              row.semester,
              row.program_name,
              slot.semester,
              slot.sectionCode,
              slot.program,
            ),
          )
          .map((row) => row.course_id!)
          .filter(Boolean),
      ),
    ];

    return { semester: slot.semester, courseIds };
  }
}
