import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  StudentEnrollmentSyncService,
  type StudentSlot,
} from './student-enrollment-sync.service';

/** Primary class-subject used to pick the section mentor when available. */
const ANCHOR_SUBJECT_BY_SEMESTER: Record<number, string> = {
  3: 'CS3001',
  5: 'CP301',
  7: 'CP405',
};

export type MentorSyncResult = {
  student_user_id: string;
  proctor_user_id: string | null;
  mentor_name: string | null;
  source: 'anchor_subject' | 'theory_load' | 'skipped';
};

@Injectable()
export class StudentMentorSyncService {
  private readonly logger = new Logger(StudentMentorSyncService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly enrollmentSync: StudentEnrollmentSyncService,
  ) {}

  async syncTenantStudents(
    tenantId: string,
    academicYear = '2026-2027',
  ): Promise<MentorSyncResult[]> {
    const students = await this.dataSource.query<Array<{ user_id: string }>>(
      `SELECT u.user_id
       FROM users u
       INNER JOIN roles r ON r.role_id = u.role_id
       INNER JOIN student_profiles sp ON sp.user_id = u.user_id
       WHERE u.tenant_id = $1
         AND u.is_active = true
         AND u.deleted_at IS NULL
         AND r.role_name = 'Student'
         AND sp.current_semester IS NOT NULL`,
      [tenantId],
    );

    const results: MentorSyncResult[] = [];
    for (const student of students) {
      results.push(await this.syncStudent(tenantId, student.user_id, academicYear));
    }
    return results;
  }

  async syncStudent(
    tenantId: string,
    studentUserId: string,
    academicYear = '2026-2027',
  ): Promise<MentorSyncResult> {
    const profileRows = await this.dataSource.query<
      Array<{ batch: string | null }>
    >(
      `SELECT batch FROM student_profiles WHERE user_id = $1 AND tenant_id = $2 LIMIT 1`,
      [studentUserId, tenantId],
    );

    const slot = await this.enrollmentSync.resolveStudentSlot(
      tenantId,
      studentUserId,
      profileRows[0]?.batch ?? 'BTECH CSE',
    );

    if (!slot?.sectionCode) {
      return {
        student_user_id: studentUserId,
        proctor_user_id: null,
        mentor_name: null,
        source: 'skipped',
      };
    }

    const mentor = await this.resolveMentorForSlot(slot, academicYear);
    if (!mentor) {
      return {
        student_user_id: studentUserId,
        proctor_user_id: null,
        mentor_name: null,
        source: 'skipped',
      };
    }

    await this.dataSource.query(
      `INSERT INTO academic_mentorships (student_user_id, proctor_user_id, is_active)
       VALUES ($1, $2, true)
       ON CONFLICT (student_user_id) DO UPDATE SET
         proctor_user_id = EXCLUDED.proctor_user_id,
         is_active = true,
         updated_at = NOW(),
         deleted_at = NULL`,
      [studentUserId, mentor.proctor_user_id],
    );

    this.logger.debug(
      `Mentor sync ${studentUserId} -> ${mentor.proctor_user_id} (${mentor.source})`,
    );

    return {
      student_user_id: studentUserId,
      proctor_user_id: mentor.proctor_user_id,
      mentor_name: mentor.mentor_name,
      source: mentor.source,
    };
  }

  private async resolveMentorForSlot(
    slot: StudentSlot,
    academicYear: string,
  ): Promise<{
    proctor_user_id: string;
    mentor_name: string | null;
    source: 'anchor_subject' | 'theory_load';
  } | null> {
    const anchorCode = ANCHOR_SUBJECT_BY_SEMESTER[slot.semester];
    if (anchorCode) {
      const anchorRows = await this.dataSource.query<
        Array<{ faculty_user_id: string; mentor_name: string | null }>
      >(
        `SELECT a.faculty_user_id, u.name AS mentor_name
         FROM academic_course_allocations a
         JOIN academic_subjects s ON s.subject_id = a.subject_id
         JOIN users u ON u.user_id = a.faculty_user_id
         WHERE a.tenant_id = $1
           AND a.academic_year = $2
           AND a.status = 'ACTIVE'
           AND a.faculty_user_id IS NOT NULL
           AND s.subject_code = $3
           AND upper(replace(COALESCE(a.program_name, ''), ' ', '')) = upper(replace($4, ' ', ''))
           AND CASE upper(split_part(COALESCE(a.semester, ''), '-', 1))
             WHEN 'I' THEN 1 WHEN 'II' THEN 2 WHEN 'III' THEN 3 WHEN 'IV' THEN 4
             WHEN 'V' THEN 5 WHEN 'VI' THEN 6 WHEN 'VII' THEN 7 WHEN 'VIII' THEN 8
             ELSE NULL END = $5
           AND upper(split_part(a.semester, '-', 2)) = upper($6)
         LIMIT 1`,
        [
          slot.tenantId,
          academicYear,
          anchorCode,
          slot.program,
          slot.semester,
          slot.sectionCode,
        ],
      );
      if (anchorRows[0]?.faculty_user_id) {
        return {
          proctor_user_id: anchorRows[0].faculty_user_id,
          mentor_name: anchorRows[0].mentor_name,
          source: 'anchor_subject',
        };
      }
    }

    const loadRows = await this.dataSource.query<
      Array<{ faculty_user_id: string; mentor_name: string | null }>
    >(
      `SELECT a.faculty_user_id, u.name AS mentor_name, COUNT(*)::int AS load_count
       FROM academic_course_allocations a
       JOIN academic_subjects s ON s.subject_id = a.subject_id
       JOIN users u ON u.user_id = a.faculty_user_id
       WHERE a.tenant_id = $1
         AND a.academic_year = $2
         AND a.status = 'ACTIVE'
         AND a.faculty_user_id IS NOT NULL
         AND upper(replace(COALESCE(a.program_name, ''), ' ', '')) = upper(replace($3, ' ', ''))
         AND CASE upper(split_part(COALESCE(a.semester, ''), '-', 1))
           WHEN 'I' THEN 1 WHEN 'II' THEN 2 WHEN 'III' THEN 3 WHEN 'IV' THEN 4
           WHEN 'V' THEN 5 WHEN 'VI' THEN 6 WHEN 'VII' THEN 7 WHEN 'VIII' THEN 8
           ELSE NULL END = $4
         AND upper(split_part(a.semester, '-', 2)) = upper($5)
         AND COALESCE(s.subject_type, 'THEORY') IN ('THEORY', 'SKILL')
         AND s.subject_code NOT LIKE 'OE%'
       GROUP BY a.faculty_user_id, u.name
       ORDER BY load_count DESC, u.name ASC
       LIMIT 1`,
      [
        slot.tenantId,
        academicYear,
        slot.program,
        slot.semester,
        slot.sectionCode,
      ],
    );

    if (!loadRows[0]?.faculty_user_id) return null;

    return {
      proctor_user_id: loadRows[0].faculty_user_id,
      mentor_name: loadRows[0].mentor_name,
      source: 'theory_load',
    };
  }
}
