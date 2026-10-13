import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  allocationMatchesStudentSlot,
  parseAllocationSemester,
  programsMatch,
} from './allocation-semester.util';

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

  async syncTenantStudents(
    tenantId: string,
    academicYear = '2026-2027',
  ): Promise<SyncResult[]> {
    const students = await this.dataSource.query<
      Array<{ user_id: string; program: string | null }>
    >(
      `SELECT u.user_id,
              COALESCE(NULLIF(BTRIM(sp.program_name), ''), NULLIF(BTRIM(sp.batch), '')) AS program
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
        student.program ?? '',
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
      Array<{ program: string | null }>
    >(
      `SELECT COALESCE(NULLIF(BTRIM(program_name), ''), NULLIF(BTRIM(batch), '')) AS program
       FROM student_profiles WHERE user_id = $1 AND tenant_id = $2 LIMIT 1`,
      [studentUserId, tenantId],
    );
    const slot = await this.resolveStudentSlot(
      tenantId,
      studentUserId,
      profileRows[0]?.program ?? '',
    );
    if (!slot) return null;
    return this.syncStudentSlot(slot, academicYear);
  }

  async resolveStudentSlot(
    tenantId: string,
    studentUserId: string,
    program: string,
  ): Promise<StudentSlot | null> {
    if (!program.trim()) {
      this.logger.warn(`Enrollment sync skipped for ${studentUserId}: programme is unknown`);
      return null;
    }
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
      const semester = Number(profileSlot[0].current_semester);
      let sectionCode = profileSlot[0].section_code?.trim().toUpperCase() || null;
      // Older imports stored a section only on enrollments.  Recover it only
      // when there is exactly one section in the student's current semester;
      // guessing from one row could enroll the student in both A and B.
      if (!sectionCode) {
        const sections = await this.dataSource.query<Array<{ section_code: string }>>(
          `SELECT DISTINCT UPPER(BTRIM(section_code)) AS section_code
           FROM student_course_enrollments
           WHERE tenant_id = $1 AND student_user_id = $2 AND semester = $3
             AND status = 'ENROLLED' AND NULLIF(BTRIM(section_code), '') IS NOT NULL`,
          [tenantId, studentUserId, semester],
        );
        if (sections.length === 1) sectionCode = sections[0].section_code;
      }
      return {
        studentUserId,
        tenantId,
        program,
        semester,
        sectionCode,
      };
    }

    const enrollmentSlot = await this.dataSource.query<
      Array<{ semester: number; section_code: string | null; cnt: string }>
    >(
      `SELECT semester, section_code, COUNT(*)::text AS cnt
       FROM student_course_enrollments
       WHERE tenant_id = $1
         AND student_user_id = $2
         AND status = 'ENROLLED'
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
      `SELECT MAX(semester) AS semester
       FROM student_course_enrollments
       WHERE tenant_id = $1 AND student_user_id = $2
         AND status = 'ENROLLED'`,
      [tenantId, studentUserId],
    );

    if (maxSemRows[0]?.semester == null) {
      this.logger.warn(`Enrollment sync skipped for ${studentUserId}: semester is unknown`);
      return null;
    }

    return {
      studentUserId,
      tenantId,
      program,
      semester: Number(maxSemRows[0].semester),
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
    const hasUnresolvedSection = !slot.sectionCode && allocations.some((row) => {
      const allocationSlot = parseAllocationSemester(row.semester);
      return allocationSlot.semesterNum === slot.semester &&
        Boolean(allocationSlot.sectionCode) &&
        programsMatch(row.program_name, slot.program);
    });

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

    if (uniqueCourseIds.length > 0 && !hasUnresolvedSection) {
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
    } else {
      this.logger.warn(
        `Enrollment sync preserved ${slot.studentUserId}: ${hasUnresolvedSection ? 'section is not verified' : 'no unambiguous allocations'} for ${slot.program} semester ${slot.semester}${slot.sectionCode ? `-${slot.sectionCode}` : ''}`,
      );
    }

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
      Array<{ program: string | null }>
    >(
      `SELECT COALESCE(NULLIF(BTRIM(program_name), ''), NULLIF(BTRIM(batch), '')) AS program
       FROM student_profiles WHERE user_id = $1 AND tenant_id = $2 LIMIT 1`,
      [studentUserId, tenantId],
    );
    const slot = await this.resolveStudentSlot(
      tenantId,
      studentUserId,
      profileRows[0]?.program ?? '',
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
