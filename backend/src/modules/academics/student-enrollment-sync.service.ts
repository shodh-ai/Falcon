import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { allocationMatchesStudentSlot } from './allocation-semester.util';

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
