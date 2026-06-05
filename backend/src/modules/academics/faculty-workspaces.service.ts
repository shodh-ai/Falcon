import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';

const EXAM_TYPES = ['CAT1', 'CAT2', 'QUIZ', 'END_TERM', 'INTERNAL', 'ASSIGNMENT'] as const;
type ExamType = (typeof EXAM_TYPES)[number];

@Injectable()
export class FacultyWorkspacesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly notify: NotificationEmitterService,
  ) {}

  async listFacultyCourses(facultyUserId: string, tenantId: string) {
    return this.dataSource.query(
      `SELECT DISTINCT c.course_id, c.course_code, c.course_name, c.credits
       FROM academic_courses c
       INNER JOIN academic_timetables t ON t.course_id = c.course_id AND t.tenant_id = c.tenant_id
       WHERE c.tenant_id = $1 AND t.faculty_user_id = $2
       ORDER BY c.course_code`,
      [tenantId, facultyUserId],
    );
  }

  async getWeeklyTimetable(facultyUserId: string, tenantId: string) {
    return this.dataSource.query(
      `SELECT t.timetable_id, t.day_of_week, t.start_time, t.end_time, t.room,
              c.course_id, c.course_code, c.course_name
       FROM academic_timetables t
       INNER JOIN academic_courses c ON c.course_id = t.course_id
       WHERE t.tenant_id = $1 AND t.faculty_user_id = $2
       ORDER BY t.day_of_week, t.start_time`,
      [tenantId, facultyUserId],
    );
  }

  async listMarks(
    facultyUserId: string,
    tenantId: string,
    courseId: string,
    examType: string,
  ) {
    await this.assertFacultyOwnsCourse(facultyUserId, tenantId, courseId);
    const students = await this.dataSource.query(
      `SELECT u.user_id AS student_user_id, u.name, sp.profile_id,
              COALESCE(sp.profile_id::text, u.user_id::text) AS roll_number
       FROM student_course_enrollments e
       INNER JOIN users u ON u.user_id = e.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       WHERE e.tenant_id = $1 AND e.course_id = $2 AND e.status = 'ENROLLED'
       ORDER BY u.name`,
      [tenantId, courseId],
    );
    const marks = await this.dataSource.query(
      `SELECT mark_id, student_user_id, marks_obtained, max_marks, co_mapped, status
       FROM academic_marks
       WHERE tenant_id = $1 AND course_id = $2 AND exam_type = $3`,
      [tenantId, courseId, examType],
    );
    const markByStudent = new Map(marks.map((m: { student_user_id: string }) => [m.student_user_id, m]));
    return {
      exam_type: examType,
      course_id: courseId,
      max_marks_default: marks[0]?.max_marks ?? 50,
      publish_status: marks.some((m: { status: string }) => m.status === 'PUBLISHED') ? 'PUBLISHED' : 'DRAFT',
      rows: students.map((s: { student_user_id: string; name: string; roll_number: string }) => {
        const existing = markByStudent.get(s.student_user_id) as
          | { mark_id: string; marks_obtained: string; max_marks: number; co_mapped: string | null; status: string }
          | undefined;
        return {
          student_user_id: s.student_user_id,
          name: s.name,
          roll_number: s.roll_number,
          mark_id: existing?.mark_id ?? null,
          marks_obtained: existing ? Number(existing.marks_obtained) : null,
          max_marks: existing?.max_marks ?? 50,
          co_mapped: existing?.co_mapped ?? null,
          status: existing?.status ?? 'DRAFT',
        };
      }),
    };
  }

  async saveMarksDraft(
    facultyUserId: string,
    tenantId: string,
    dto: {
      course_id: string;
      exam_type: string;
      max_marks: number;
      entries: { student_user_id: string; marks_obtained: number; co_mapped?: string }[];
    },
  ) {
    if (!EXAM_TYPES.includes(dto.exam_type as ExamType)) {
      throw new BadRequestException('Invalid exam_type');
    }
    await this.assertFacultyOwnsCourse(facultyUserId, tenantId, dto.course_id);
    const maxMarks = dto.max_marks;
    for (const entry of dto.entries) {
      if (entry.marks_obtained > maxMarks) {
        throw new BadRequestException(`Marks cannot exceed ${maxMarks}`);
      }
      if (entry.marks_obtained < 0) {
        throw new BadRequestException('Marks cannot be negative');
      }
      await this.dataSource.query(
        `INSERT INTO academic_marks (
           tenant_id, student_user_id, course_id, exam_type, marks_obtained, max_marks,
           co_mapped, status, uploaded_by, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,'DRAFT',$8,NOW())
         ON CONFLICT (tenant_id, student_user_id, course_id, exam_type) DO UPDATE SET
           marks_obtained = EXCLUDED.marks_obtained,
           max_marks = EXCLUDED.max_marks,
           co_mapped = EXCLUDED.co_mapped,
           status = 'DRAFT',
           uploaded_by = EXCLUDED.uploaded_by,
           updated_at = NOW()`,
        [
          tenantId,
          entry.student_user_id,
          dto.course_id,
          dto.exam_type,
          entry.marks_obtained,
          maxMarks,
          entry.co_mapped ?? null,
          facultyUserId,
        ],
      );
    }
    return { saved: dto.entries.length, status: 'DRAFT' };
  }

  async publishMarks(
    facultyUserId: string,
    tenantId: string,
    courseId: string,
    examType: string,
  ) {
    await this.assertFacultyOwnsCourse(facultyUserId, tenantId, courseId);
    const result = await this.dataSource.query(
      `UPDATE academic_marks
       SET status = 'PUBLISHED', published_at = NOW(), updated_at = NOW()
       WHERE tenant_id = $1 AND course_id = $2 AND exam_type = $3 AND uploaded_by = $4
       RETURNING mark_id`,
      [tenantId, courseId, examType, facultyUserId],
    );

    const courseRows = await this.dataSource.query<Array<{ course_name: string }>>(
      `SELECT course_name FROM academic_courses WHERE course_id = $1 AND tenant_id = $2 LIMIT 1`,
      [courseId, tenantId],
    );
    const courseName = courseRows[0]?.course_name ?? 'your course';
    const students = await this.dataSource.query<Array<{ student_user_id: string }>>(
      `SELECT student_user_id FROM student_course_enrollments
       WHERE course_id = $1 AND tenant_id = $2`,
      [courseId, tenantId],
    );
    for (const row of students) {
      this.notify.marksPublished({
        tenantId,
        userId: row.student_user_id,
        courseName,
        examType,
      });
    }

    return { published: result.length };
  }

  async listCoPoMappings(tenantId: string, courseId: string) {
    return this.dataSource.query(
      `SELECT * FROM course_co_po_mappings
       WHERE tenant_id = $1 AND course_id = $2
       ORDER BY co_code, po_code`,
      [tenantId, courseId],
    );
  }

  async upsertCoPoMapping(
    facultyUserId: string,
    tenantId: string,
    dto: {
      course_id: string;
      co_code: string;
      po_code: string;
      question_ref?: string;
      weight_percent: number;
      academic_year: string;
    },
  ) {
    await this.assertFacultyOwnsCourse(facultyUserId, tenantId, dto.course_id);
    const rows = await this.dataSource.query(
      `INSERT INTO course_co_po_mappings (
         tenant_id, course_id, co_code, po_code, question_ref, weight_percent, academic_year, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (tenant_id, course_id, co_code, po_code, question_ref, academic_year) DO UPDATE SET
         weight_percent = EXCLUDED.weight_percent
       RETURNING *`,
      [
        tenantId,
        dto.course_id,
        dto.co_code,
        dto.po_code,
        dto.question_ref ?? '',
        dto.weight_percent,
        dto.academic_year,
        facultyUserId,
      ],
    );
    return rows[0];
  }

  async listClassAdjustments(facultyUserId: string, tenantId: string) {
    return this.dataSource.query(
      `SELECT a.*, c.course_code, c.course_name
       FROM class_adjustments a
       INNER JOIN academic_courses c ON c.course_id = a.course_id
       WHERE a.tenant_id = $1 AND a.faculty_user_id = $2
       ORDER BY a.created_at DESC`,
      [tenantId, facultyUserId],
    );
  }

  async createClassAdjustment(
    facultyUserId: string,
    tenantId: string,
    dto: {
      course_id: string;
      adjustment_type: string;
      original_date?: string;
      new_date?: string;
      reason?: string;
    },
  ) {
    await this.assertFacultyOwnsCourse(facultyUserId, tenantId, dto.course_id);
    const rows = await this.dataSource.query(
      `INSERT INTO class_adjustments (
         tenant_id, course_id, faculty_user_id, adjustment_type, original_date, new_date, reason
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        tenantId,
        dto.course_id,
        facultyUserId,
        dto.adjustment_type,
        dto.original_date ?? null,
        dto.new_date ?? null,
        dto.reason ?? null,
      ],
    );
    return rows[0];
  }

  async listResearchLogs(facultyUserId: string, tenantId: string) {
    return this.dataSource.query(
      `SELECT * FROM faculty_research_logs
       WHERE tenant_id = $1 AND faculty_user_id = $2
       ORDER BY published_date DESC NULLS LAST, created_at DESC`,
      [tenantId, facultyUserId],
    );
  }

  async createResearchLog(
    facultyUserId: string,
    tenantId: string,
    dto: {
      publication_title: string;
      journal_name?: string;
      indexing_type?: string;
      publication_type?: string;
      published_date?: string;
      proof_file_path?: string;
    },
  ) {
    const rows = await this.dataSource.query(
      `INSERT INTO faculty_research_logs (
         tenant_id, faculty_user_id, publication_title, journal_name, indexing_type,
         publication_type, published_date, proof_file_path
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        tenantId,
        facultyUserId,
        dto.publication_title,
        dto.journal_name ?? null,
        dto.indexing_type ?? null,
        dto.publication_type ?? 'JOURNAL',
        dto.published_date ?? null,
        dto.proof_file_path ?? null,
      ],
    );
    return rows[0];
  }

  async listInvigilation(facultyUserId: string, tenantId: string) {
    return this.dataSource.query(
      `SELECT * FROM faculty_invigilation_assignments
       WHERE tenant_id = $1 AND faculty_user_id = $2
       ORDER BY exam_date ASC`,
      [tenantId, facultyUserId],
    );
  }

  async listProjectGuides(facultyUserId: string, tenantId: string) {
    const guides = await this.dataSource.query(
      `SELECT g.*, u.name AS student_name
       FROM faculty_project_guides g
       INNER JOIN users u ON u.user_id = g.student_user_id
       WHERE g.tenant_id = $1 AND g.faculty_user_id = $2
       ORDER BY g.created_at DESC`,
      [tenantId, facultyUserId],
    );
    return guides;
  }

  async listProjectReports(guideId: string, facultyUserId: string, tenantId: string) {
    await this.assertOwnsGuide(guideId, facultyUserId, tenantId);
    return this.dataSource.query(
      `SELECT * FROM project_weekly_reports WHERE guide_id = $1 ORDER BY week_no`,
      [guideId],
    );
  }

  async reviewProjectReport(
    reportId: string,
    facultyUserId: string,
    tenantId: string,
    dto: { status: string; ce_marks?: number; faculty_remarks?: string },
  ) {
    const report = await this.dataSource.query(
      `SELECT r.report_id, g.faculty_user_id
       FROM project_weekly_reports r
       INNER JOIN faculty_project_guides g ON g.guide_id = r.guide_id
       WHERE r.report_id = $1 AND r.tenant_id = $2`,
      [reportId, tenantId],
    );
    if (!report[0] || report[0].faculty_user_id !== facultyUserId) {
      throw new ForbiddenException();
    }
    const rows = await this.dataSource.query(
      `UPDATE project_weekly_reports
       SET status = $2, ce_marks = $3, faculty_remarks = $4, reviewed_at = NOW()
       WHERE report_id = $1
       RETURNING *`,
      [reportId, dto.status, dto.ce_marks ?? null, dto.faculty_remarks ?? null],
    );
    return rows[0];
  }

  async getStudentAnalytics(facultyUserId: string, tenantId: string, courseId?: string) {
    const params: unknown[] = [tenantId, facultyUserId];
    let courseFilter = '';
    if (courseId) {
      courseFilter = ' AND e.course_id = $3';
      params.push(courseId);
      await this.assertFacultyOwnsCourse(facultyUserId, tenantId, courseId);
    }
    return this.dataSource.query(
      `SELECT u.user_id AS student_user_id, u.name, c.course_id, c.course_code, c.course_name,
              e.attendance_percent,
              COALESCE((
                SELECT AVG(m.marks_obtained::float / NULLIF(m.max_marks, 0) * 100)
                FROM academic_marks m
                WHERE m.student_user_id = u.user_id AND m.course_id = e.course_id AND m.tenant_id = e.tenant_id
              ), 0) AS internal_avg_percent
       FROM student_course_enrollments e
       INNER JOIN users u ON u.user_id = e.student_user_id
       INNER JOIN academic_courses c ON c.course_id = e.course_id
       WHERE e.tenant_id = $1 AND e.status = 'ENROLLED'
         AND EXISTS (
           SELECT 1 FROM academic_timetables t
           WHERE t.course_id = c.course_id AND t.faculty_user_id = $2 AND t.tenant_id = e.tenant_id
         )
         ${courseFilter}
       ORDER BY e.attendance_percent ASC, internal_avg_percent ASC`,
      params,
    );
  }

  async listLogbook(facultyUserId: string, tenantId: string, courseId?: string) {
    const params: unknown[] = [tenantId, facultyUserId];
    let filter = '';
    if (courseId) {
      filter = ' AND course_id = $3';
      params.push(courseId);
    }
    return this.dataSource.query(
      `SELECT l.*, c.course_code, c.course_name
       FROM faculty_class_logbook l
       INNER JOIN academic_courses c ON c.course_id = l.course_id
       WHERE l.tenant_id = $1 AND l.faculty_user_id = $2 ${filter}
       ORDER BY l.class_date DESC`,
      params,
    );
  }

  async createLogbookEntry(
    facultyUserId: string,
    tenantId: string,
    dto: { course_id: string; class_date: string; topic_summary: string },
  ) {
    await this.assertFacultyOwnsCourse(facultyUserId, tenantId, dto.course_id);
    const rows = await this.dataSource.query(
      `INSERT INTO faculty_class_logbook (tenant_id, course_id, faculty_user_id, class_date, topic_summary)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (tenant_id, course_id, faculty_user_id, class_date) DO UPDATE SET
         topic_summary = EXCLUDED.topic_summary
       RETURNING *`,
      [tenantId, dto.course_id, facultyUserId, dto.class_date, dto.topic_summary],
    );
    return rows[0];
  }

  async createRemedialAction(
    facultyUserId: string,
    tenantId: string,
    dto: {
      student_user_id: string;
      course_id?: string;
      reason: string;
      action_taken: string;
      scheduled_at?: string;
    },
  ) {
    const rows = await this.dataSource.query(
      `INSERT INTO faculty_remedial_actions (
         tenant_id, faculty_user_id, student_user_id, course_id, reason, action_taken, scheduled_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        tenantId,
        facultyUserId,
        dto.student_user_id,
        dto.course_id ?? null,
        dto.reason,
        dto.action_taken,
        dto.scheduled_at ?? null,
      ],
    );
    return rows[0];
  }

  async getLessonPlan(facultyUserId: string, tenantId: string, courseId: string) {
    await this.assertFacultyOwnsCourse(facultyUserId, tenantId, courseId);
    const rows = await this.dataSource.query(
      `SELECT * FROM course_lesson_plans
       WHERE tenant_id = $1 AND course_id = $2 AND faculty_user_id = $3`,
      [tenantId, courseId, facultyUserId],
    );
    return rows[0] ?? { course_id: courseId, handout_url: null, units: [], reference_links: [], status: 'DRAFT' };
  }

  async upsertLessonPlan(
    facultyUserId: string,
    tenantId: string,
    dto: {
      course_id: string;
      handout_url?: string;
      units?: unknown[];
      reference_links?: unknown[];
      status?: string;
    },
  ) {
    await this.assertFacultyOwnsCourse(facultyUserId, tenantId, dto.course_id);
    const rows = await this.dataSource.query(
      `INSERT INTO course_lesson_plans (
         tenant_id, course_id, faculty_user_id, handout_url, units, reference_links, status, updated_at
       ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,NOW())
       ON CONFLICT (tenant_id, course_id, faculty_user_id) DO UPDATE SET
         handout_url = EXCLUDED.handout_url,
         units = EXCLUDED.units,
         reference_links = EXCLUDED.reference_links,
         status = EXCLUDED.status,
         updated_at = NOW()
       RETURNING *`,
      [
        tenantId,
        dto.course_id,
        facultyUserId,
        dto.handout_url ?? null,
        JSON.stringify(dto.units ?? []),
        JSON.stringify(dto.reference_links ?? []),
        dto.status ?? 'DRAFT',
      ],
    );
    return rows[0];
  }

  private async assertFacultyOwnsCourse(facultyUserId: string, tenantId: string, courseId: string) {
    const rows = await this.dataSource.query(
      `SELECT 1 FROM academic_timetables
       WHERE tenant_id = $1 AND faculty_user_id = $2 AND course_id = $3 LIMIT 1`,
      [tenantId, facultyUserId, courseId],
    );
    if (!rows.length) {
      throw new ForbiddenException('You are not assigned to this course');
    }
  }

  private async assertOwnsGuide(guideId: string, facultyUserId: string, tenantId: string) {
    const rows = await this.dataSource.query(
      `SELECT 1 FROM faculty_project_guides
       WHERE guide_id = $1 AND faculty_user_id = $2 AND tenant_id = $3`,
      [guideId, facultyUserId, tenantId],
    );
    if (!rows.length) {
      throw new NotFoundException('Project guide not found');
    }
  }
}
