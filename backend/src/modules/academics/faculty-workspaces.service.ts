import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { assertNoPendingSql } from '../../common/validators/pending-request.util';

const EXAM_TYPES = [
  'CAT1',
  'CAT2',
  'QUIZ',
  'END_TERM',
  'INTERNAL',
  'ASSIGNMENT',
  'WT1',
  'WT2',
  'GA1',
  'GA2',
  'MTE1',
  'MTE2',
  'ETE',
] as const;
type ExamType = (typeof EXAM_TYPES)[number];

/** Enrollment visible to faculty who hold an active allocation or timetable slot for the course. */
const FACULTY_COURSE_ACCESS_SQL = `(
  EXISTS (
    SELECT 1 FROM academic_course_allocations a
    WHERE a.tenant_id = e.tenant_id
      AND a.course_id = e.course_id
      AND a.faculty_user_id = $2
      AND a.status = 'ACTIVE'
  )
  OR EXISTS (
    SELECT 1 FROM academic_timetables t
    WHERE t.course_id = e.course_id
      AND t.faculty_user_id = $2
      AND t.tenant_id = e.tenant_id
  )
  OR EXISTS (
    SELECT 1 FROM academic_marks m
    WHERE m.course_id = e.course_id
      AND m.uploaded_by = $2
      AND m.tenant_id = e.tenant_id
  )
)`;

/** Canonical roll-number expression — semester roll on enrollment, then permanent PRN. */
const ROLL_NUMBER_SQL = `COALESCE(
  NULLIF(BTRIM(e.roll_number), ''),
  NULLIF(BTRIM(sp.prn_number), ''),
  NULLIF(BTRIM(sp.enrollment_no), ''),
  NULLIF(BTRIM(sp.enrollment_number), ''),
  NULLIF(BTRIM(sp.admission_number), ''),
  u.user_id::text
)`;

@Injectable()
export class FacultyWorkspacesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly notify: NotificationEmitterService,
  ) {}

  async listFacultyCourses(facultyUserId: string, tenantId: string) {
    const fromAllocations = await this.dataSource.query(
      `SELECT
         a.allocation_id,
         a.program_name,
         a.semester,
         a.academic_year,
         c.course_id,
         c.course_code,
         c.course_name,
         c.credits
       FROM academic_course_allocations a
       INNER JOIN academic_courses c
         ON c.course_id = a.course_id
        AND c.tenant_id = a.tenant_id
       WHERE a.tenant_id = $1
         AND a.faculty_user_id = $2
         AND a.status = 'ACTIVE'
         AND a.course_id IS NOT NULL
       ORDER BY a.academic_year DESC, a.program_name NULLS LAST, a.semester NULLS LAST, c.course_code`,
      [tenantId, facultyUserId],
    );
    if (fromAllocations.length) return fromAllocations;

    const fromTimetable = await this.dataSource.query(
      `SELECT DISTINCT
         NULL::uuid AS allocation_id,
         NULL::text AS program_name,
         NULL::text AS semester,
         NULL::text AS academic_year,
         c.course_id,
         c.course_code,
         c.course_name,
         c.credits
       FROM academic_courses c
       INNER JOIN academic_timetables t ON t.course_id = c.course_id AND t.tenant_id = c.tenant_id
       WHERE c.tenant_id = $1 AND t.faculty_user_id = $2
       ORDER BY c.course_code`,
      [tenantId, facultyUserId],
    );
    if (fromTimetable.length) return fromTimetable;

    return this.dataSource.query(
      `SELECT DISTINCT
         NULL::uuid AS allocation_id,
         NULL::text AS program_name,
         NULL::text AS semester,
         NULL::text AS academic_year,
         c.course_id,
         c.course_code,
         c.course_name,
         c.credits
       FROM academic_courses c
       INNER JOIN academic_marks m ON m.course_id = c.course_id AND m.tenant_id = c.tenant_id
       WHERE c.tenant_id = $1 AND m.uploaded_by = $2
       ORDER BY c.course_code`,
      [tenantId, facultyUserId],
    );
  }

  async getWeeklyTimetable(facultyUserId: string, tenantId: string) {
    return this.dataSource.query(
      `WITH faculty_courses AS (
         SELECT DISTINCT a.course_id
         FROM academic_course_allocations a
         WHERE a.tenant_id = $1
           AND a.faculty_user_id = $2
           AND a.status = 'ACTIVE'
           AND a.course_id IS NOT NULL
       )
       SELECT
         COALESCE(t.timetable_id, fc.course_id) AS timetable_id,
         COALESCE(t.day_of_week, 1) AS day_of_week,
         COALESCE(t.start_time, '09:00'::time) AS start_time,
         COALESCE(t.end_time, '10:00'::time) AS end_time,
         t.room,
         c.course_id,
         c.course_code,
         c.course_name
       FROM faculty_courses fc
       INNER JOIN academic_courses c ON c.course_id = fc.course_id
       LEFT JOIN LATERAL (
         SELECT t.*
         FROM academic_timetables t
         WHERE t.tenant_id = $1
           AND t.course_id = fc.course_id
           AND t.deleted_at IS NULL
         ORDER BY CASE WHEN t.faculty_user_id = $2 THEN 0 ELSE 1 END, t.timetable_id DESC
         LIMIT 1
       ) t ON true
       ORDER BY COALESCE(t.day_of_week, 1), COALESCE(t.start_time, '09:00'::time)`,
      [tenantId, facultyUserId],
    );
  }

  async getTimetableStats(facultyUserId: string, tenantId: string) {
    const [summary] = await this.dataSource.query<
      Array<{
        term_start: string;
        weekly_slots: string;
        courses_taught: string;
        expected_so_far: string;
        conducted_classes: string;
        todays_classes: string;
        todays_conducted: string;
        missing_attendance_today: string;
        pending_adjustments: string;
        approved_adjustments: string;
        rejected_adjustments: string;
        approved_extra_classes: string;
      }>
    >(
      `WITH term AS (
         SELECT CASE
           WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 7
           THEN make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, 7, 1)
           ELSE make_date((EXTRACT(YEAR FROM CURRENT_DATE) - 1)::int, 7, 1)
         END AS start_date
       ),
       faculty_courses AS (
         SELECT DISTINCT a.course_id
         FROM academic_course_allocations a
         WHERE a.tenant_id = $1
           AND a.faculty_user_id = $2
           AND a.status = 'ACTIVE'
           AND a.course_id IS NOT NULL
       ),
       faculty_slots AS (
         SELECT
           COALESCE(t.timetable_id, fc.course_id) AS timetable_id,
           fc.course_id,
           COALESCE(t.day_of_week, 1) AS day_of_week,
           COALESCE(t.start_time, '09:00'::time) AS start_time,
           COALESCE(t.end_time, '10:00'::time) AS end_time
         FROM faculty_courses fc
         LEFT JOIN LATERAL (
           SELECT t.*
           FROM academic_timetables t
           WHERE t.tenant_id = $1
             AND t.course_id = fc.course_id
             AND t.deleted_at IS NULL
           ORDER BY CASE WHEN t.faculty_user_id = $2 THEN 0 ELSE 1 END, t.timetable_id DESC
           LIMIT 1
         ) t ON true
       ),
       expected AS (
         SELECT COUNT(*)::int AS expected_so_far
         FROM generate_series((SELECT start_date FROM term), CURRENT_DATE, '1 day'::interval) d
         INNER JOIN faculty_slots fs ON EXTRACT(ISODOW FROM d)::int = fs.day_of_week
       ),
       conducted AS (
         SELECT COUNT(*)::int AS conducted_classes
         FROM course_attendance_logs cal
         WHERE cal.tenant_id = $1
           AND cal.faculty_user_id = $2
           AND cal.date >= (SELECT start_date FROM term)
       ),
       today_slots AS (
         SELECT fs.*
         FROM faculty_slots fs
         WHERE fs.day_of_week = EXTRACT(ISODOW FROM CURRENT_DATE)::int
       ),
       today_conducted AS (
         SELECT COUNT(*)::int AS todays_conducted
         FROM today_slots ts
         INNER JOIN course_attendance_logs cal
           ON cal.tenant_id = $1
          AND cal.faculty_user_id = $2
          AND cal.course_id = ts.course_id
          AND cal.date = CURRENT_DATE
       ),
       missing_today AS (
         SELECT COUNT(*)::int AS missing_attendance_today
         FROM today_slots ts
         LEFT JOIN course_attendance_logs cal
           ON cal.tenant_id = $1
          AND cal.faculty_user_id = $2
          AND cal.course_id = ts.course_id
          AND cal.date = CURRENT_DATE
         WHERE ts.end_time < CURRENT_TIME
           AND cal.log_id IS NULL
       ),
       adjustment_counts AS (
         SELECT
           COUNT(*) FILTER (WHERE status LIKE 'PENDING%')::int AS pending_adjustments,
           COUNT(*) FILTER (WHERE status = 'APPROVED')::int AS approved_adjustments,
           COUNT(*) FILTER (WHERE status = 'REJECTED')::int AS rejected_adjustments,
           COUNT(*) FILTER (
             WHERE status = 'APPROVED' AND adjustment_type = 'EXTRA_CLASS'
           )::int AS approved_extra_classes
         FROM class_adjustments
         WHERE tenant_id = $1 AND faculty_user_id = $2
       )
       SELECT
         (SELECT start_date FROM term)::text AS term_start,
         (SELECT COUNT(*)::text FROM faculty_slots) AS weekly_slots,
         (SELECT COUNT(DISTINCT course_id)::text FROM faculty_slots) AS courses_taught,
         (SELECT expected_so_far::text FROM expected) AS expected_so_far,
         (SELECT conducted_classes::text FROM conducted) AS conducted_classes,
         (SELECT COUNT(*)::text FROM today_slots) AS todays_classes,
         (SELECT todays_conducted::text FROM today_conducted) AS todays_conducted,
         (SELECT missing_attendance_today::text FROM missing_today) AS missing_attendance_today,
         ac.pending_adjustments::text,
         ac.approved_adjustments::text,
         ac.rejected_adjustments::text,
         ac.approved_extra_classes::text
       FROM adjustment_counts ac`,
      [tenantId, facultyUserId],
    );

    const courses = await this.dataSource.query<
      Array<{
        course_id: string;
        course_code: string;
        course_name: string;
        weekly_slots: string;
        expected_so_far: string;
        conducted_classes: string;
      }>
    >(
      `WITH term AS (
         SELECT CASE
           WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 7
           THEN make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, 7, 1)
           ELSE make_date((EXTRACT(YEAR FROM CURRENT_DATE) - 1)::int, 7, 1)
         END AS start_date
       ),
       faculty_courses AS (
         SELECT DISTINCT a.course_id
         FROM academic_course_allocations a
         WHERE a.tenant_id = $1
           AND a.faculty_user_id = $2
           AND a.status = 'ACTIVE'
           AND a.course_id IS NOT NULL
       ),
       course_slots AS (
         SELECT
           fc.course_id,
           c.course_code,
           c.course_name,
           COALESCE(t.day_of_week, 1) AS day_of_week
         FROM faculty_courses fc
         INNER JOIN academic_courses c ON c.course_id = fc.course_id
         LEFT JOIN LATERAL (
           SELECT t.day_of_week
           FROM academic_timetables t
           WHERE t.tenant_id = $1
             AND t.course_id = fc.course_id
             AND t.deleted_at IS NULL
           ORDER BY CASE WHEN t.faculty_user_id = $2 THEN 0 ELSE 1 END, t.timetable_id DESC
           LIMIT 1
         ) t ON true
       ),
       course_expected AS (
         SELECT
           cs.course_id,
           COUNT(*)::int AS expected_so_far
         FROM course_slots cs
         INNER JOIN generate_series((SELECT start_date FROM term), CURRENT_DATE, '1 day'::interval) d
           ON EXTRACT(ISODOW FROM d)::int = cs.day_of_week
         GROUP BY cs.course_id
       )
       SELECT
         cs.course_id,
         cs.course_code,
         cs.course_name,
         COUNT(DISTINCT cs.day_of_week)::text AS weekly_slots,
         COALESCE(ce.expected_so_far, 0)::text AS expected_so_far,
         (
           SELECT COUNT(*)::text
           FROM course_attendance_logs cal
           WHERE cal.tenant_id = $1
             AND cal.faculty_user_id = $2
             AND cal.course_id = cs.course_id
             AND cal.date >= (SELECT start_date FROM term)
         ) AS conducted_classes
       FROM course_slots cs
       LEFT JOIN course_expected ce ON ce.course_id = cs.course_id
       GROUP BY cs.course_id, cs.course_code, cs.course_name, ce.expected_so_far
       ORDER BY cs.course_code`,
      [tenantId, facultyUserId],
    );

    const expectedSoFar = Number(summary?.expected_so_far ?? 0);
    const conductedClasses = Number(summary?.conducted_classes ?? 0);
    const remainingClasses = Math.max(expectedSoFar - conductedClasses, 0);
    const completionPercent =
      expectedSoFar > 0
        ? Math.round((conductedClasses / expectedSoFar) * 100)
        : 0;

    return {
      term_start: summary?.term_start ?? null,
      weekly_slots: Number(summary?.weekly_slots ?? 0),
      courses_taught: Number(summary?.courses_taught ?? 0),
      expected_so_far: expectedSoFar,
      conducted_classes: conductedClasses,
      remaining_classes: remainingClasses,
      completion_percent: completionPercent,
      todays_classes: Number(summary?.todays_classes ?? 0),
      todays_conducted: Number(summary?.todays_conducted ?? 0),
      todays_remaining: Math.max(
        Number(summary?.todays_classes ?? 0) -
          Number(summary?.todays_conducted ?? 0),
        0,
      ),
      missing_attendance_today: Number(summary?.missing_attendance_today ?? 0),
      pending_adjustments: Number(summary?.pending_adjustments ?? 0),
      approved_adjustments: Number(summary?.approved_adjustments ?? 0),
      rejected_adjustments: Number(summary?.rejected_adjustments ?? 0),
      approved_extra_classes: Number(summary?.approved_extra_classes ?? 0),
      courses: courses.map((course) => {
        const expected = Number(course.expected_so_far ?? 0);
        const conducted = Number(course.conducted_classes ?? 0);
        return {
          course_id: course.course_id,
          course_code: course.course_code,
          course_name: course.course_name,
          weekly_slots: Number(course.weekly_slots ?? 0),
          expected_so_far: expected,
          conducted_classes: conducted,
          remaining_classes: Math.max(expected - conducted, 0),
          completion_percent:
            expected > 0 ? Math.round((conducted / expected) * 100) : 0,
        };
      }),
    };
  }

  async listMarks(
    facultyUserId: string,
    tenantId: string,
    courseId: string,
    examType: string,
  ) {
    await this.assertFacultyOwnsCourse(facultyUserId, tenantId, courseId);
    const session = await this.getResultSession(tenantId, courseId, examType);
    const rows = await this.dataSource.query(
      `SELECT
         u.user_id AS student_user_id,
         u.name,
         ${ROLL_NUMBER_SQL} AS roll_number,
         m.mark_id,
         m.marks_obtained,
         m.max_marks,
         m.co_mapped,
         m.status AS mark_status
       FROM student_course_enrollments e
       INNER JOIN users u ON u.user_id = e.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       LEFT JOIN academic_marks m
         ON m.tenant_id = e.tenant_id
        AND m.student_user_id = e.student_user_id
        AND m.course_id = e.course_id
        AND m.exam_type = $3
       WHERE e.tenant_id = $1
         AND e.course_id = $2
         AND e.status = 'ENROLLED'
       ORDER BY u.name`,
      [tenantId, courseId, examType],
    );

    const maxMarksDefault =
      rows.find((r: { max_marks: number | null }) => r.max_marks != null)
        ?.max_marks ?? 50;
    const draftCount = rows.filter(
      (r: { mark_status: string | null }) =>
        !r.mark_status || r.mark_status === 'DRAFT',
    ).length;
    const pendingCount = rows.filter(
      (r: { mark_status: string | null }) => r.mark_status === 'PENDING_COE',
    ).length;
    const publishedCount = rows.filter(
      (r: { mark_status: string | null }) => r.mark_status === 'PUBLISHED',
    ).length;
    const publishStatus =
      publishedCount > 0 && publishedCount === rows.length
        ? 'PUBLISHED'
        : pendingCount > 0 && draftCount > 0
          ? 'PARTIAL'
          : pendingCount > 0
            ? 'PENDING_COE'
            : 'DRAFT';

    const entryAllowed =
      examType === 'QUIZ' ||
      (!!session &&
        session.entry_status === 'OPEN' &&
        !session.marks_locked &&
        !session.declared_at);

    return {
      exam_type: examType,
      course_id: courseId,
      max_marks_default: maxMarksDefault,
      publish_status: publishStatus,
      entry_allowed: entryAllowed,
      result_session: session
        ? {
            session_id: session.session_id,
            entry_status: session.entry_status,
            marks_locked: session.marks_locked,
            entry_open_at: session.entry_open_at,
            entry_close_at: session.entry_close_at,
            declared_at: session.declared_at,
          }
        : null,
      rows: rows.map(
        (s: {
          student_user_id: string;
          name: string;
          roll_number: string;
          mark_id: string | null;
          marks_obtained: string | null;
          max_marks: number | null;
          co_mapped: string | null;
          mark_status: string | null;
        }) => ({
          student_user_id: s.student_user_id,
          name: s.name,
          roll_number: s.roll_number,
          mark_id: s.mark_id ?? null,
          marks_obtained:
            s.marks_obtained != null ? Number(s.marks_obtained) : null,
          max_marks: s.max_marks ?? maxMarksDefault,
          co_mapped: s.co_mapped ?? null,
          status: s.mark_status ?? 'DRAFT',
        }),
      ),
    };
  }

  async saveMarksDraft(
    facultyUserId: string,
    tenantId: string,
    dto: {
      course_id: string;
      exam_type: string;
      max_marks: number;
      entries: {
        student_user_id: string;
        marks_obtained: number;
        co_mapped?: string;
      }[];
    },
  ) {
    if (!EXAM_TYPES.includes(dto.exam_type as ExamType)) {
      throw new BadRequestException('Invalid exam_type');
    }
    await this.assertFacultyOwnsCourse(facultyUserId, tenantId, dto.course_id);
    const isDirectPublish = ['QUIZ', 'GA1', 'GA2'].includes(dto.exam_type);
    
    if (!isDirectPublish) {
      const session = await this.getResultSession(
        tenantId,
        dto.course_id,
        dto.exam_type,
      );
      this.assertFacultyEntryAllowed(session);
    }

    if (!isDirectPublish) {
      const locked = await this.dataSource.query(
        `SELECT 1 FROM academic_marks
         WHERE tenant_id = $1 AND course_id = $2 AND exam_type = $3
           AND status IN ('PENDING_COE', 'PUBLISHED') LIMIT 1`,
        [tenantId, dto.course_id, dto.exam_type],
      );
      if (locked[0]) {
        throw new ForbiddenException(
          'Submitted marks are locked. Contact Exam Cell to reopen entry.',
        );
      }
    }
    const maxMarks = dto.max_marks;
    for (const entry of dto.entries) {
      if (entry.marks_obtained > maxMarks) {
        throw new BadRequestException(`Marks cannot exceed ${maxMarks}`);
      }
      if (entry.marks_obtained < 0) {
        throw new BadRequestException('Marks cannot be negative');
      }
    }

    if (dto.entries.length > 0) {
      const valuePlaceholders: string[] = [];
      const params: unknown[] = [
        tenantId,
        dto.course_id,
        dto.exam_type,
        maxMarks,
        facultyUserId,
      ];
      let paramIdx = 6;
      for (const entry of dto.entries) {
        valuePlaceholders.push(
          `($1, $${paramIdx++}, $2, $3, $${paramIdx++}, $4, $${paramIdx++}, 'DRAFT', $5, NOW())`,
        );
        params.push(
          entry.student_user_id,
          entry.marks_obtained,
          entry.co_mapped ?? null,
        );
      }
      await this.dataSource.query(
        `INSERT INTO academic_marks (
           tenant_id, student_user_id, course_id, exam_type, marks_obtained, max_marks,
           co_mapped, status, uploaded_by, updated_at
         ) VALUES ${valuePlaceholders.join(', ')}
         ON CONFLICT (tenant_id, student_user_id, course_id, exam_type) DO UPDATE SET
           marks_obtained = CASE
             WHEN academic_marks.status IN ('PENDING_COE', 'PUBLISHED') THEN academic_marks.marks_obtained
             ELSE EXCLUDED.marks_obtained
           END,
           max_marks = EXCLUDED.max_marks,
           co_mapped = CASE
             WHEN academic_marks.status IN ('PENDING_COE', 'PUBLISHED') THEN academic_marks.co_mapped
             ELSE EXCLUDED.co_mapped
           END,
           status = CASE
             WHEN EXCLUDED.exam_type IN ('QUIZ', 'GA1', 'GA2') THEN 'DRAFT'
             WHEN academic_marks.status IN ('PENDING_COE', 'PUBLISHED') THEN academic_marks.status
             ELSE 'DRAFT'
           END,
           uploaded_by = EXCLUDED.uploaded_by,
           updated_at = NOW()`,
        params,
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
    const isDirectPublish = ['QUIZ', 'GA1', 'GA2'].includes(examType);
    if (!isDirectPublish) {
      const session = await this.getResultSession(tenantId, courseId, examType);
      this.assertFacultyEntryAllowed(session);
    }
    const targetStatus = isDirectPublish ? 'PUBLISHED' : 'PENDING_COE';
    const statusCondition =
      isDirectPublish
        ? `status IN ('DRAFT', 'PENDING_COE', 'PUBLISHED')`
        : `status = 'DRAFT'`;
    const result = await this.dataSource.query(
      `UPDATE academic_marks
       SET status = $5, updated_at = NOW()
       WHERE tenant_id = $1 AND course_id = $2 AND exam_type = $3 AND uploaded_by = $4 AND ${statusCondition}
       RETURNING mark_id`,
      [tenantId, courseId, examType, facultyUserId, targetStatus],
    );

    const courseRows = await this.dataSource.query<
      Array<{ course_name: string }>
    >(
      `SELECT course_name FROM academic_courses WHERE course_id = $1 AND tenant_id = $2 LIMIT 1`,
      [courseId, tenantId],
    );
    const courseName = courseRows[0]?.course_name ?? 'your course';

    const publishedCount =
      Array.isArray(result) &&
      result.length === 2 &&
      typeof result[1] === 'number'
        ? result[1]
        : result.length;
    if (publishedCount === 0) {
      throw new BadRequestException(
        'No draft marks found to submit. Save draft marks first for this course and exam type.',
      );
    }
    return {
      published: publishedCount,
      status: 'PENDING_COE',
      course_name: courseName,
    };
  }

  async publishAllCourseMarks(
    facultyUserId: string,
    tenantId: string,
    courseId: string,
  ) {
    await this.assertFacultyOwnsCourse(facultyUserId, tenantId, courseId);
    
    // Mark all DRAFT and PENDING_COE marks for this course as PUBLISHED
    const result = await this.dataSource.query(
      `UPDATE academic_marks
       SET status = 'PUBLISHED', published_at = NOW(), updated_at = NOW()
       WHERE tenant_id = $1 AND course_id = $2 AND uploaded_by = $3
         AND status IN ('DRAFT', 'PENDING_COE')
       RETURNING mark_id`,
      [tenantId, courseId, facultyUserId],
    );

    const publishedCount =
      Array.isArray(result) && result.length === 2 && typeof result[1] === 'number'
        ? result[1]
        : result.length;

    return {
      published: publishedCount,
      status: 'PUBLISHED',
    };
  }

  async getUnifiedCourseMarks(facultyUserId: string, tenantId: string, courseId: string) {
    await this.assertFacultyOwnsCourse(facultyUserId, tenantId, courseId);

    const rows = await this.dataSource.query(
      `SELECT
         u.user_id AS student_user_id,
         u.name,
         ${ROLL_NUMBER_SQL} AS roll_number,
         m.exam_type,
         m.marks_obtained,
         m.status AS mark_status
       FROM student_course_enrollments e
       INNER JOIN users u ON u.user_id = e.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       LEFT JOIN academic_marks m
         ON m.tenant_id = e.tenant_id
        AND m.student_user_id = e.student_user_id
        AND m.course_id = e.course_id
       WHERE e.tenant_id = $1
         AND e.course_id = $2
         AND e.status = 'ENROLLED'
       ORDER BY u.name`,
      [tenantId, courseId],
    );

    const studentsMap = new Map<string, any>();

    for (const r of rows) {
      if (!studentsMap.has(r.student_user_id)) {
        studentsMap.set(r.student_user_id, {
          student_user_id: r.student_user_id,
          name: r.name,
          roll_number: r.roll_number,
          marks: {},
        });
      }
      const s = studentsMap.get(r.student_user_id);
      if (r.exam_type) {
        s.marks[r.exam_type] = {
          obtained: r.marks_obtained != null ? Number(r.marks_obtained) : null,
          status: r.mark_status,
        };
      }
    }

    return Array.from(studentsMap.values());
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
      substitute_faculty_user_id?: string;
      timetable_id?: string;
    },
  ) {
    await this.assertFacultyOwnsCourse(facultyUserId, tenantId, dto.course_id);

    await assertNoPendingSql(
      this.dataSource,
      `SELECT COUNT(*)::text AS count FROM class_adjustments
       WHERE tenant_id = $1 AND faculty_user_id = $2 AND course_id = $3
         AND status = 'PENDING_HOD_APPROVAL'`,
      [tenantId, facultyUserId, dto.course_id],
      'You already have a pending schedule change for this course. Wait for HoD approval on the existing request, or cancel it before submitting another.',
    );

    const rows = await this.dataSource.query(
      `INSERT INTO class_adjustments (
         tenant_id, course_id, faculty_user_id, adjustment_type, original_date, new_date,
         reason, substitute_faculty_user_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        tenantId,
        dto.course_id,
        facultyUserId,
        dto.adjustment_type,
        dto.original_date ?? null,
        dto.new_date ?? null,
        dto.reason ?? null,
        dto.substitute_faculty_user_id ?? null,
      ],
    );
    return rows[0];
  }

  async listHodPendingAdjustments(hodUserId: string, tenantId: string) {
    const deptRows = await this.dataSource.query(
      `SELECT dept_id FROM departments WHERE hod_user_id = $1`,
      [hodUserId],
    );
    const hod = await this.dataSource.query<Array<{ dept_id: number | null }>>(
      `SELECT dept_id FROM users WHERE user_id = $1`,
      [hodUserId],
    );
    const deptIds = Array.from(
      new Set<number>([
        ...deptRows.map((r: { dept_id: number }) => Number(r.dept_id)),
        ...(hod[0]?.dept_id ? [hod[0].dept_id] : []),
      ]),
    );
    if (!deptIds.length) return [];

    return this.dataSource.query(
      `SELECT a.adjustment_id, a.adjustment_type, a.original_date, a.new_date, a.reason, a.status,
              c.course_code, c.course_name, u.name AS faculty_name, u.official_email AS faculty_email
       FROM class_adjustments a
       INNER JOIN academic_courses c ON c.course_id = a.course_id
       INNER JOIN users u ON u.user_id = a.faculty_user_id
       WHERE a.tenant_id = $1 AND a.status = 'PENDING_HOD_APPROVAL'
         AND u.dept_id = ANY($2::int[])
       ORDER BY a.created_at ASC`,
      [tenantId, deptIds],
    );
  }

  async actOnClassAdjustment(
    hodUserId: string,
    tenantId: string,
    adjustmentId: string,
    action: 'APPROVE' | 'REJECT',
    remarks?: string,
  ) {
    const rows = await this.dataSource.query(
      `SELECT a.*, u.dept_id AS faculty_dept_id
       FROM class_adjustments a
       INNER JOIN users u ON u.user_id = a.faculty_user_id
       WHERE a.adjustment_id = $1 AND a.tenant_id = $2`,
      [adjustmentId, tenantId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Class adjustment not found');
    if (row.status !== 'PENDING_HOD_APPROVAL') {
      throw new BadRequestException('Adjustment has already been processed');
    }

    const deptRows = await this.dataSource.query(
      `SELECT dept_id FROM departments WHERE hod_user_id = $1`,
      [hodUserId],
    );
    const hod = await this.dataSource.query<Array<{ dept_id: number | null }>>(
      `SELECT dept_id FROM users WHERE user_id = $1`,
      [hodUserId],
    );
    const deptIds = new Set<number>([
      ...deptRows.map((r: { dept_id: number }) => Number(r.dept_id)),
      ...(hod[0]?.dept_id ? [hod[0].dept_id] : []),
    ]);
    if (!deptIds.has(Number(row.faculty_dept_id))) {
      throw new ForbiddenException(
        'HOD can act only on adjustments from their department',
      );
    }

    if (action === 'REJECT') {
      if (!remarks?.trim())
        throw new BadRequestException('Rejection remarks are required');
      await this.dataSource.query(
        `UPDATE class_adjustments SET status = 'REJECTED', hod_remarks = $3 WHERE adjustment_id = $1 AND tenant_id = $2`,
        [adjustmentId, tenantId, remarks.trim()],
      );
    } else {
      await this.dataSource.query(
        `UPDATE class_adjustments SET status = 'APPROVED' WHERE adjustment_id = $1 AND tenant_id = $2`,
        [adjustmentId, tenantId],
      );
    }

    const faculty = await this.dataSource.query<
      Array<{ user_id: string; tenant_id: string; name: string }>
    >(`SELECT user_id, tenant_id, name FROM users WHERE user_id = $1`, [
      row.faculty_user_id,
    ]);
    if (faculty[0]) {
      this.notify.leaveApproved({
        tenantId: faculty[0].tenant_id,
        userId: faculty[0].user_id,
        title:
          action === 'APPROVE'
            ? 'Extra class approved'
            : 'Extra class rejected',
        message:
          action === 'APPROVE'
            ? 'Your extra class request was approved by your HOD.'
            : `Your extra class request was rejected.${remarks ? ` Reason: ${remarks}` : ''}`,
        actionLink: '/faculty/timetable',
      });
    }

    const updated = await this.dataSource.query(
      `SELECT * FROM class_adjustments WHERE adjustment_id = $1`,
      [adjustmentId],
    );
    return updated[0];
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
      `SELECT a.*, r.status AS excuse_status, r.reason AS excuse_reason, r.exam_cell_comment
       FROM faculty_invigilation_assignments a
       LEFT JOIN invigilation_unavailability_requests r ON r.assignment_id = a.assignment_id
       WHERE a.tenant_id = $1 AND a.faculty_user_id = $2
       ORDER BY a.exam_date ASC`,
      [tenantId, facultyUserId],
    );
  }

  async requestInvigilationUnavailability(
    facultyUserId: string,
    tenantId: string,
    assignmentId: string,
    reason: string,
  ) {
    const assignment = await this.dataSource.query(
      `SELECT 1 FROM faculty_invigilation_assignments WHERE assignment_id = $1 AND faculty_user_id = $2 AND tenant_id = $3`,
      [assignmentId, facultyUserId, tenantId],
    );
    if (!assignment[0]) throw new NotFoundException('Assignment not found');

    const rows = await this.dataSource.query(
      `INSERT INTO invigilation_unavailability_requests (tenant_id, assignment_id, faculty_user_id, reason)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [tenantId, assignmentId, facultyUserId, reason],
    );
    return rows[0];
  }

  async assignProjectGuide(
    facultyUserId: string,
    tenantId: string,
    data: {
      project_title: string;
      program?: string;
      start_date?: string;
      end_date?: string;
      funding_allocated?: number;
      student_ids: string[];
    },
  ) {
    // Validate max 4 active projects
    const countRes = await this.dataSource.query(
      `SELECT COUNT(*) AS active_count FROM faculty_project_guides 
       WHERE tenant_id = $1 AND faculty_user_id = $2 AND status = 'ACTIVE'`,
      [tenantId, facultyUserId],
    );
    if (parseInt(countRes[0].active_count) >= 4) {
      throw new BadRequestException(
        'Faculty member cannot have more than 4 active projects simultaneously.',
      );
    }

    const guideId = crypto.randomUUID();

    // Start transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.query(
        `INSERT INTO faculty_project_guides 
          (guide_id, tenant_id, faculty_user_id, project_title, program, status, start_date, end_date, funding_allocated, funding_consumed, created_at)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, $7, $8, 0, NOW())`,
        [
          guideId,
          tenantId,
          facultyUserId,
          data.project_title,
          data.program,
          data.start_date,
          data.end_date,
          data.funding_allocated || 0,
        ],
      );

      for (const studentId of data.student_ids) {
        await queryRunner.query(
          `INSERT INTO project_guide_students (guide_id, student_user_id, tenant_id) VALUES ($1, $2, $3)`,
          [guideId, studentId, tenantId],
        );
      }

      await queryRunner.commitTransaction();
      return { guide_id: guideId };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async listProjectGuides(facultyUserId: string, tenantId: string) {
    const guides = await this.dataSource.query(
      `SELECT 
         g.*,
         (
           SELECT COALESCE(json_agg(
             json_build_object(
               'student_user_id', pgs.student_user_id,
               'name', u.name,
               'official_email', u.official_email,
               'department', d.dept_name,
               'grade', pgs.grade
             )
           ) FILTER (WHERE pgs.student_user_id IS NOT NULL), '[]')
           FROM project_guide_students pgs
           LEFT JOIN users u ON u.user_id = pgs.student_user_id
           LEFT JOIN departments d ON d.dept_id = u.dept_id
           WHERE pgs.guide_id = g.guide_id
         ) AS students,
         (
           SELECT COALESCE(json_agg(fr.* ORDER BY fr.created_at ASC), '[]')
           FROM project_funding_requests fr
           WHERE fr.guide_id = g.guide_id
         ) AS funding_requests
       FROM faculty_project_guides g
       WHERE g.tenant_id = $1 AND g.faculty_user_id = $2
       ORDER BY CASE g.status WHEN 'COMPLETED' THEN 1 ELSE 0 END, g.created_at DESC`,
      [tenantId, facultyUserId],
    );
    return guides;
  }

  async updateProjectStudents(
    guideId: string,
    facultyUserId: string,
    tenantId: string,
    students: { student_user_id: string; grade?: string }[],
  ) {
    await this.assertOwnsGuide(guideId, facultyUserId, tenantId);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.query(
        `DELETE FROM project_guide_students WHERE guide_id = $1 AND tenant_id = $2`,
        [guideId, tenantId],
      );
      for (const st of students) {
        await queryRunner.query(
          `INSERT INTO project_guide_students (guide_id, student_user_id, grade, tenant_id) VALUES ($1, $2, $3, $4)`,
          [guideId, st.student_user_id, st.grade || null, tenantId],
        );
      }
      await queryRunner.commitTransaction();
      return { success: true };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async completeProject(
    guideId: string,
    facultyUserId: string,
    tenantId: string,
  ) {
    await this.assertOwnsGuide(guideId, facultyUserId, tenantId);
    await this.dataSource.query(
      `UPDATE faculty_project_guides SET status = 'COMPLETED', end_date = CURRENT_DATE WHERE guide_id = $1 AND tenant_id = $2`,
      [guideId, tenantId],
    );
    return { success: true };
  }

  async requestFunding(
    guideId: string,
    facultyUserId: string,
    tenantId: string,
    amount: number,
    purpose: string,
  ) {
    await this.assertOwnsGuide(guideId, facultyUserId, tenantId);
    // Check if there's already a pending request
    const existing = await this.dataSource.query(
      `SELECT 1 FROM project_funding_requests WHERE guide_id = $1 AND status IN ('PENDING_HOD', 'APPROVED_HOD')`,
      [guideId],
    );
    if (existing.length > 0) {
      throw new BadRequestException(
        'A funding request is already pending or approved and awaiting transfer.',
      );
    }

    const rows = await this.dataSource.query(
      `INSERT INTO project_funding_requests (tenant_id, guide_id, requested_by, amount, purpose)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [tenantId, guideId, facultyUserId, amount, purpose],
    );

    const hodRows = await this.dataSource.query(
      `SELECT d.hod_user_id, u.name as faculty_name
       FROM users u 
       JOIN departments d ON u.dept_id = d.dept_id 
       WHERE u.user_id = $1 AND u.tenant_id = $2`,
      [facultyUserId, tenantId],
    );

    if (hodRows.length > 0 && hodRows[0].hod_user_id) {
      this.notify.approvalRequired({
        tenantId,
        userId: hodRows[0].hod_user_id,
        category: 'Funding',
        requestType: 'Project Funding Request',
        requesterName: hodRows[0].faculty_name || 'Faculty',
        title: 'New Project Funding Request',
        message: `A new funding request of ₹${amount} requires your approval.`,
        actionLink: '/hod/inbox',
      });
    }

    return rows[0];
  }

  async listHodFundingRequests(hodUserId: string, tenantId: string) {
    // Only return requests for departments where this user is HOD
    return this.dataSource.query(
      `SELECT fr.*, g.project_title, u.name AS faculty_name, d.dept_name
       FROM project_funding_requests fr
       INNER JOIN faculty_project_guides g ON g.guide_id = fr.guide_id
       INNER JOIN users u ON u.user_id = fr.requested_by
       INNER JOIN departments d ON d.dept_id = u.dept_id
       WHERE fr.tenant_id = $1 AND d.hod_user_id = $2
       ORDER BY fr.created_at DESC`,
      [tenantId, hodUserId],
    );
  }

  async listDeanFundingRequests(tenantId: string) {
    return this.dataSource.query(
      `SELECT fr.*, g.project_title, u.name AS faculty_name, d.dept_name
       FROM project_funding_requests fr
       INNER JOIN faculty_project_guides g ON g.guide_id = fr.guide_id
       INNER JOIN users u ON u.user_id = fr.requested_by
       INNER JOIN departments d ON d.dept_id = u.dept_id
       WHERE fr.tenant_id = $1 AND fr.status IN ('APPROVED_HOD', 'APPROVED_DEAN', 'REJECTED_DEAN')
       ORDER BY fr.created_at DESC`,
      [tenantId],
    );
  }

  async updateHodFundingRequest(
    requestId: string,
    status: 'APPROVED_HOD' | 'REJECTED_HOD',
    commitMessage: string,
    hodUserId: string,
    tenantId: string,
  ) {
    const rows = await this.dataSource.query(
      `UPDATE project_funding_requests
       SET status = $1, hod_commit_message = $2, hod_user_id = $3, updated_at = NOW()
       WHERE request_id = $4 AND tenant_id = $5 AND status = 'PENDING_HOD'
       RETURNING *`,
      [status, commitMessage, hodUserId, requestId, tenantId],
    );
    if (!rows.length) {
      throw new NotFoundException(
        'Pending funding request not found or unauthorized',
      );
    }

    const updatedRequest = rows[0];

    if (status === 'APPROVED_HOD') {
      const deanUsers = await this.dataSource.query(
        `SELECT u.user_id FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.tenant_id = $1 AND r.role_name = 'Dean'`,
        [tenantId],
      );

      for (const d of deanUsers) {
        this.notify.approvalRequired({
          tenantId,
          userId: d.user_id,
          category: 'Funding',
          requestType: 'Project Funding Request',
          requesterName: 'HOD',
          title: 'Funding Request Pending Dean Approval',
          message: `A funding request of ₹${updatedRequest.amount} was approved by HOD and requires your final approval.`,
          actionLink: '/dean/inbox',
        });
      }
    }

    return updatedRequest;
  }

  async updateDeanFundingRequest(
    requestId: string,
    status: 'APPROVED_DEAN' | 'REJECTED_DEAN',
    commitMessage: string,
    deanUserId: string,
    tenantId: string,
  ) {
    const rows = await this.dataSource.query(
      `UPDATE project_funding_requests
       SET status = $1, dean_commit_message = $2, dean_user_id = $3, updated_at = NOW()
       WHERE request_id = $4 AND tenant_id = $5 AND status = 'APPROVED_HOD'
       RETURNING *`,
      [status, commitMessage, deanUserId, requestId, tenantId],
    );
    if (!rows.length) {
      throw new NotFoundException(
        'Pending funding request not found or unauthorized',
      );
    }

    const updatedRequest = rows[0];

    if (status === 'APPROVED_DEAN') {
      const financeUsers = await this.dataSource.query(
        `SELECT u.user_id FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.tenant_id = $1 AND r.role_name IN ('FinanceAdmin', 'FinanceAccountant', 'Finance', 'Accountant')`,
        [tenantId],
      );

      for (const f of financeUsers) {
        this.notify.approvalRequired({
          tenantId,
          userId: f.user_id,
          category: 'Funding',
          requestType: 'Project Funding Request',
          requesterName: 'Dean',
          title: 'Funding Request Dean Approved',
          message: `A funding request of ₹${updatedRequest.amount} was approved by the Dean and requires your transfer.`,
          actionLink: '/finance/funding-requests',
        });
      }
    }

    return updatedRequest;
  }

  async listProjectReports(
    guideId: string,
    facultyUserId: string,
    tenantId: string,
  ) {
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

  async getStudentAnalytics(
    facultyUserId: string,
    tenantId: string,
    courseId?: string,
  ) {
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
         AND ${FACULTY_COURSE_ACCESS_SQL}
         ${courseFilter}
       ORDER BY e.attendance_percent ASC, internal_avg_percent ASC`,
      params,
    );
  }

  async searchFacultySubjectStudents(
    facultyUserId: string,
    tenantId: string,
    courseId: string,
    query?: string,
    limit = 25,
  ) {
    await this.assertFacultyOwnsCourse(facultyUserId, tenantId, courseId);

    const params: unknown[] = [tenantId, facultyUserId, courseId];
    let searchFilter = '';
    const trimmed = query?.trim();
    if (trimmed) {
      params.push(`%${trimmed.toLowerCase()}%`);
      const qIdx = params.length;
      searchFilter = ` AND (
        lower(u.name) LIKE $${qIdx}
        OR lower(u.official_email) LIKE $${qIdx}
        OR lower(u.user_id::text) LIKE $${qIdx}
        OR lower(${ROLL_NUMBER_SQL}) LIKE $${qIdx}
      )`;
    }
    params.push(Math.min(Math.max(limit, 1), 50));

    return this.dataSource.query(
      `SELECT DISTINCT
         u.user_id AS student_user_id,
         u.name,
         u.official_email,
         ${ROLL_NUMBER_SQL} AS roll_number,
         d.dept_name AS department,
         c.course_id,
         c.course_code,
         c.course_name,
         COALESCE((
           SELECT ROUND(AVG(m.marks_obtained::numeric / NULLIF(m.max_marks, 0) * 100), 2)
           FROM academic_marks m
           WHERE m.tenant_id = e.tenant_id
             AND m.student_user_id = e.student_user_id
             AND m.course_id = e.course_id
             AND m.status = 'PUBLISHED'
         ), 0) AS internal_avg_percent,
         (
           SELECT COUNT(*)::int
           FROM assignment_submissions sub
           INNER JOIN academic_assignments aa ON aa.assignment_id = sub.assignment_id
           WHERE aa.tenant_id = e.tenant_id
             AND aa.course_id = e.course_id
             AND sub.student_user_id = e.student_user_id
         ) AS assignments_submitted
       FROM student_course_enrollments e
       INNER JOIN users u ON u.user_id = e.student_user_id
       INNER JOIN academic_courses c ON c.course_id = e.course_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       WHERE e.tenant_id = $1
         AND e.status = 'ENROLLED'
         AND e.course_id = $3
         AND ${FACULTY_COURSE_ACCESS_SQL}
         ${searchFilter}
       ORDER BY u.name ASC
       LIMIT $${params.length}`,
      params,
    );
  }

  async getFacultySubjectStudentReport(
    facultyUserId: string,
    tenantId: string,
    courseId: string,
    studentUserId: string,
  ) {
    await this.assertFacultyOwnsCourse(facultyUserId, tenantId, courseId);

    const [studentRows, statsRows, assignmentRows, demeritRows, summaryRows, academicRows, gpaHistory] =
      await Promise.all([
        this.dataSource.query(
          `SELECT u.user_id AS student_user_id, u.name, u.official_email,
                  ${ROLL_NUMBER_SQL} AS roll_number,
                  sp.batch, d.dept_name AS department
           FROM student_course_enrollments e
           INNER JOIN users u ON u.user_id = e.student_user_id
           LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
           LEFT JOIN departments d ON d.dept_id = u.dept_id
           WHERE e.tenant_id = $1
             AND e.course_id = $2
             AND e.student_user_id = $3
             AND e.status = 'ENROLLED'
           LIMIT 1`,
          [tenantId, courseId, studentUserId],
        ),
        this.dataSource.query(
          `WITH scores AS (
             SELECT e.student_user_id,
                    COALESCE(
                      ROUND(AVG(m.marks_obtained::numeric / NULLIF(m.max_marks, 0) * 100), 2),
                      0
                    ) AS score
             FROM student_course_enrollments e
             LEFT JOIN academic_marks m
               ON m.tenant_id = e.tenant_id
              AND m.course_id = e.course_id
              AND m.student_user_id = e.student_user_id
              AND m.status = 'PUBLISHED'
             WHERE e.tenant_id = $1
               AND e.course_id = $2
               AND e.status = 'ENROLLED'
             GROUP BY e.student_user_id
           ),
           ranked AS (
             SELECT student_user_id, score,
                    RANK() OVER (ORDER BY score DESC, student_user_id) AS class_rank,
                    COUNT(*) OVER () AS class_size,
                    ROUND(AVG(score) OVER (), 2) AS class_average_percent
             FROM scores
           )
           SELECT c.course_id, c.course_code, c.course_name,
                  r.score AS internal_avg_percent,
                  r.class_average_percent,
                  r.class_rank::int,
                  r.class_size::int,
                  (
                    SELECT COALESCE(json_agg(
                      json_build_object(
                        'exam_type', m.exam_type,
                        'marks_obtained', m.marks_obtained,
                        'max_marks', m.max_marks,
                        'percent', ROUND(m.marks_obtained::numeric / NULLIF(m.max_marks, 0) * 100, 2)
                      ) ORDER BY m.exam_type
                    ), '[]'::json)
                    FROM academic_marks m
                    WHERE m.tenant_id = $1
                      AND m.course_id = $2
                      AND m.student_user_id = $3
                      AND m.status = 'PUBLISHED'
                  ) AS marks,
                  (
                    SELECT COUNT(*)::int
                    FROM academic_assignments aa
                    WHERE aa.tenant_id = $1 AND aa.course_id = $2
                  ) AS assignments_total,
                  (
                    SELECT COUNT(*)::int
                    FROM assignment_submissions sub
                    INNER JOIN academic_assignments aa ON aa.assignment_id = sub.assignment_id
                    WHERE aa.tenant_id = $1 AND aa.course_id = $2 AND sub.student_user_id = $3
                  ) AS assignments_submitted,
                  (
                    SELECT COUNT(*)::int
                    FROM assignment_submissions sub
                    INNER JOIN academic_assignments aa ON aa.assignment_id = sub.assignment_id
                    WHERE aa.tenant_id = $1
                      AND aa.course_id = $2
                      AND sub.student_user_id = $3
                      AND sub.marks_awarded IS NOT NULL
                  ) AS assignments_graded,
                  (
                    SELECT COALESCE(
                      ROUND(AVG(sub.marks_awarded::numeric / NULLIF(aa.max_marks, 0) * 100), 2),
                      0
                    )
                    FROM assignment_submissions sub
                    INNER JOIN academic_assignments aa ON aa.assignment_id = sub.assignment_id
                    WHERE aa.tenant_id = $1
                      AND aa.course_id = $2
                      AND sub.student_user_id = $3
                      AND sub.marks_awarded IS NOT NULL
                  ) AS graded_assignment_avg_percent
           FROM academic_courses c
           INNER JOIN ranked r ON r.student_user_id = $3
           WHERE c.tenant_id = $1 AND c.course_id = $2
           LIMIT 1`,
          [tenantId, courseId, studentUserId],
        ),
        this.dataSource.query(
          `SELECT aa.assignment_id, aa.title, aa.max_marks, aa.due_date,
                  sub.submitted_at, sub.marks_awarded, sub.faculty_remarks,
                  CASE
                    WHEN sub.submission_id IS NULL THEN 'PENDING'
                    WHEN sub.marks_awarded IS NULL THEN 'SUBMITTED'
                    ELSE 'GRADED'
                  END AS status
           FROM academic_assignments aa
           LEFT JOIN assignment_submissions sub
             ON sub.assignment_id = aa.assignment_id
            AND sub.student_user_id = $3
            AND sub.tenant_id = aa.tenant_id
           WHERE aa.tenant_id = $1 AND aa.course_id = $2
           ORDER BY aa.due_date DESC
           LIMIT 12`,
          [tenantId, courseId, studentUserId],
        ),
        this.dataSource.query(
          `SELECT di.incident_id, di.category, di.points, di.description, di.status,
                  di.created_at, c.course_code
           FROM demerit_incidents di
           INNER JOIN academic_courses c ON c.course_id = di.course_id
           WHERE di.tenant_id = $1
             AND di.course_id = $2
             AND di.student_user_id = $3
             AND di.status = 'APPROVED_BY_DC'
           ORDER BY di.created_at DESC
           LIMIT 20`,
          [tenantId, courseId, studentUserId],
        ).catch(() => []),
        this.dataSource.query(
          `SELECT cumulative_demerit_points, is_subject_back_triggered, subject_back_triggered_at
           FROM student_academic_summaries
           WHERE tenant_id = $1 AND student_user_id = $2`,
          [tenantId, studentUserId],
        ).catch(() => []),
        this.dataSource.query(
          `SELECT academic_year, semester, sgpa, cgpa, backlog_count, progression_status, remarks
           FROM academic_records
           WHERE tenant_id = $1 AND student_user_id = $2
           ORDER BY semester ASC`,
          [tenantId, studentUserId],
        ).catch(() => []),
        this.loadStudentGpaHistory(tenantId, studentUserId),
      ]);

    const student = studentRows[0];
    const stats = statsRows[0];
    if (!student || !stats) throw new NotFoundException('Student not found in this subject');

    const assignmentsTotal = Number(stats.assignments_total ?? 0);
    const assignmentsSubmitted = Number(stats.assignments_submitted ?? 0);
    const pendingAssignments = Math.max(assignmentsTotal - assignmentsSubmitted, 0);
    const internalAvg = Number(stats.internal_avg_percent ?? 0);
    const classAverage = Number(stats.class_average_percent ?? 0);
    const demeritPoints = (demeritRows as Array<{ points: number }>).reduce(
      (sum, row) => sum + Number(row.points ?? 0),
      0,
    );
    const academic = academicRows.length ? academicRows[academicRows.length - 1] : null;
    const gpaHistoryFinal =
      gpaHistory.length > 0
        ? gpaHistory
        : academicRows.map((row) => ({
            semester: Number(row.semester),
            sgpa: Number(row.sgpa ?? 0),
            cgpa: Number(row.cgpa ?? 0),
            status: row.progression_status ?? 'RECORD',
            academic_year: row.academic_year ?? null,
            source: 'academic_record',
          }));
    const academicSummary = summaryRows[0] ?? null;
    const flags: Array<{ label: string; severity: 'LOW' | 'MEDIUM' | 'HIGH'; detail: string }> = [];

    if (internalAvg < 40) {
      flags.push({
        label: 'Weak internals',
        severity: 'HIGH',
        detail: 'Internal score is below the 40% academic concern threshold.',
      });
    }
    if (classAverage > 0 && internalAvg + 10 < classAverage) {
      flags.push({
        label: 'Below class average',
        severity: 'MEDIUM',
        detail: `Student is ${Math.round(classAverage - internalAvg)} points below the subject average.`,
      });
    }
    if (pendingAssignments > 0) {
      flags.push({
        label: 'Pending assignments',
        severity: pendingAssignments > 1 ? 'HIGH' : 'MEDIUM',
        detail: `${pendingAssignments} assignment${pendingAssignments === 1 ? '' : 's'} pending in this subject.`,
      });
    }
    if (demeritPoints > 0) {
      flags.push({
        label: 'Disciplinary points',
        severity: 'MEDIUM',
        detail: `${demeritPoints} approved demerit point${demeritPoints === 1 ? '' : 's'} in this subject.`,
      });
    }
    if (Number(academic?.backlog_count ?? 0) > 0) {
      flags.push({
        label: 'Backlog history',
        severity: 'HIGH',
        detail: `${academic.backlog_count} backlog${Number(academic.backlog_count) === 1 ? '' : 's'} in latest academic record.`,
      });
    }

    return {
      student,
      subject: {
        course_id: stats.course_id,
        course_code: stats.course_code,
        course_name: stats.course_name,
      },
      summary: {
        internal_avg_percent: Math.round(internalAvg),
        class_average_percent: Math.round(classAverage),
        class_rank: Number(stats.class_rank ?? 0),
        class_size: Number(stats.class_size ?? 0),
        assignments_total: assignmentsTotal,
        assignments_submitted: assignmentsSubmitted,
        assignments_graded: Number(stats.assignments_graded ?? 0),
        pending_assignments: pendingAssignments,
        assignment_completion_percent:
          assignmentsTotal > 0
            ? Math.round((assignmentsSubmitted / assignmentsTotal) * 100)
            : 0,
        graded_assignment_avg_percent: Math.round(
          Number(stats.graded_assignment_avg_percent ?? 0),
        ),
        course_demerit_points: demeritPoints,
        cumulative_demerit_points: Number(
          academicSummary?.cumulative_demerit_points ?? demeritPoints,
        ),
        is_subject_back_triggered: Boolean(
          academicSummary?.is_subject_back_triggered,
        ),
      },
      academic: academic
        ? {
            academic_year: academic.academic_year,
            semester: academic.semester,
            sgpa: Number(academic.sgpa ?? 0),
            cgpa: Number(academic.cgpa ?? 0),
            backlog_count: Number(academic.backlog_count ?? 0),
            progression_status: academic.progression_status,
            remarks: academic.remarks,
          }
        : null,
      marks: stats.marks ?? [],
      assignments: assignmentRows,
      demerits: demeritRows,
      risk_flags: flags,
      gpa_history: gpaHistoryFinal,
    };
  }

  private async loadStudentGpaHistory(tenantId: string, studentUserId: string) {
    const gradeCards = await this.dataSource
      .query<
        Array<{
          semester: number;
          sgpa: string | number | null;
          cgpa: string | number | null;
          status: string | null;
          academic_year: string | null;
          source: string;
        }>
      >(
        `SELECT
           g.semester,
           COALESCE((g.payload->>'sgpa')::numeric, g.cgpa, 0) AS sgpa,
           COALESCE((g.payload->>'cgpa')::numeric, g.cgpa, 0) AS cgpa,
           g.status,
           g.payload->>'academic_year' AS academic_year,
           'grade_card' AS source
         FROM grade_cards g
         WHERE g.tenant_id = $1 AND g.student_user_id = $2
         ORDER BY g.semester ASC`,
        [tenantId, studentUserId],
      )
      .catch(() => []);

    if (gradeCards.length) {
      return gradeCards.map((row) => ({
        semester: Number(row.semester),
        sgpa: Number(row.sgpa ?? 0),
        cgpa: Number(row.cgpa ?? 0),
        status: row.status ?? 'PUBLISHED',
        academic_year: row.academic_year,
        source: row.source,
      }));
    }

    const academicRecords = await this.dataSource
      .query<
        Array<{
          semester: number;
          sgpa: string | number | null;
          cgpa: string | number | null;
          academic_year: string | null;
          progression_status: string | null;
        }>
      >(
        `SELECT semester, sgpa, cgpa, academic_year, progression_status
         FROM academic_records
         WHERE tenant_id = $1 AND student_user_id = $2
         ORDER BY semester ASC`,
        [tenantId, studentUserId],
      )
      .catch(() => []);

    if (academicRecords.length) {
      return academicRecords.map((row) => ({
        semester: Number(row.semester),
        sgpa: Number(row.sgpa ?? 0),
        cgpa: Number(row.cgpa ?? 0),
        status: row.progression_status ?? 'RECORD',
        academic_year: row.academic_year,
        source: 'academic_record',
      }));
    }

    const enrollments = await this.dataSource.query<
      Array<{ semester: number; grade_points: string | number | null; credits: number }>
    >(
      `SELECT e.semester, e.grade_points, c.credits
       FROM student_course_enrollments e
       INNER JOIN academic_courses c ON c.course_id = e.course_id
       WHERE e.tenant_id = $1
         AND e.student_user_id = $2
         AND e.status = 'COMPLETED'
         AND e.grade_points IS NOT NULL
       ORDER BY e.semester ASC`,
      [tenantId, studentUserId],
    );

    const semesterMap = new Map<number, { points: number; credits: number }>();
    for (const row of enrollments) {
      const sem = Number(row.semester);
      const bucket = semesterMap.get(sem) ?? { points: 0, credits: 0 };
      bucket.points += Number(row.grade_points) * Number(row.credits);
      bucket.credits += Number(row.credits);
      semesterMap.set(sem, bucket);
    }

    let cumulativePoints = 0;
    let cumulativeCredits = 0;
    return [...semesterMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([semester, { points, credits }]) => {
        cumulativePoints += points;
        cumulativeCredits += credits;
        return {
          semester,
          sgpa: credits > 0 ? Number((points / credits).toFixed(2)) : 0,
          cgpa:
            cumulativeCredits > 0
              ? Number((cumulativePoints / cumulativeCredits).toFixed(2))
              : 0,
          status: 'COMPUTED',
          academic_year: null,
          source: 'enrollment',
        };
      });
  }

  async listLogbook(
    facultyUserId: string,
    tenantId: string,
    courseId?: string,
  ) {
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
      [
        tenantId,
        dto.course_id,
        facultyUserId,
        dto.class_date,
        dto.topic_summary,
      ],
    );
    return rows[0];
  }

  async listRemedialActions(
    facultyUserId: string,
    tenantId: string,
    limit = 50,
  ) {
    return this.dataSource.query(
      `SELECT r.remedial_id, r.student_user_id, r.course_id, r.reason, r.action_taken,
              r.scheduled_at, r.status, r.created_at,
              u.name AS student_name, c.course_code, c.course_name
       FROM faculty_remedial_actions r
       INNER JOIN users u ON u.user_id = r.student_user_id
       LEFT JOIN academic_courses c ON c.course_id = r.course_id
       WHERE r.tenant_id = $1 AND r.faculty_user_id = $2
       ORDER BY r.created_at DESC
       LIMIT $3`,
      [tenantId, facultyUserId, limit],
    );
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

  async getLessonPlan(
    facultyUserId: string,
    tenantId: string,
    courseId: string,
  ) {
    await this.assertFacultyOwnsCourse(facultyUserId, tenantId, courseId);
    const rows = await this.dataSource.query(
      `SELECT * FROM course_lesson_plans
       WHERE tenant_id = $1 AND course_id = $2 AND faculty_user_id = $3`,
      [tenantId, courseId, facultyUserId],
    );
    return (
      rows[0] ?? {
        course_id: courseId,
        handout_url: null,
        units: [],
        reference_links: [],
        status: 'DRAFT',
      }
    );
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

  private async assertFacultyOwnsCourse(
    facultyUserId: string,
    tenantId: string,
    courseId: string,
  ) {
    const rows = await this.dataSource.query(
      `SELECT 1 AS ok
       WHERE EXISTS (
         SELECT 1 FROM academic_course_allocations
         WHERE tenant_id = $1
           AND faculty_user_id = $2
           AND course_id = $3
           AND status = 'ACTIVE'
       ) OR EXISTS (
         SELECT 1 FROM academic_timetables
         WHERE tenant_id = $1 AND faculty_user_id = $2 AND course_id = $3
       ) OR EXISTS (
         SELECT 1 FROM academic_marks
         WHERE tenant_id = $1 AND uploaded_by = $2 AND course_id = $3
       )`,
      [tenantId, facultyUserId, courseId],
    );
    if (!rows.length) {
      throw new ForbiddenException('You are not assigned to this course');
    }
  }

  private async getResultSession(
    tenantId: string,
    courseId: string,
    examType: string,
  ) {
    const rows = await this.dataSource.query(
      `SELECT * FROM exam_result_sessions
       WHERE tenant_id = $1 AND course_id = $2 AND exam_type = $3
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId, courseId, examType],
    );
    return rows[0] ?? null;
  }

  private assertFacultyEntryAllowed(
    session: {
      entry_status: string;
      marks_locked: boolean;
      entry_open_at?: string | Date | null;
      entry_close_at?: string | Date | null;
      declared_at?: string | Date | null;
    } | null,
  ) {
    if (!session) {
      throw new BadRequestException(
        'Marks entry has not been opened by Exam Cell for this exam.',
      );
    }
    if (session.declared_at) {
      throw new BadRequestException(
        'Results already declared. Marks are locked.',
      );
    }
    if (session.entry_status !== 'OPEN') {
      throw new BadRequestException(
        'Marks entry is closed. Contact Exam Cell to reopen.',
      );
    }
    if (session.marks_locked) {
      throw new BadRequestException('Marks entry is locked by Exam Cell.');
    }
    const now = Date.now();
    if (
      session.entry_open_at &&
      new Date(session.entry_open_at).getTime() > now
    ) {
      throw new BadRequestException('Marks entry window has not opened yet.');
    }
    if (
      session.entry_close_at &&
      new Date(session.entry_close_at).getTime() < now
    ) {
      throw new BadRequestException('Marks entry window has closed.');
    }
  }

  private async assertOwnsGuide(
    guideId: string,
    facultyUserId: string,
    tenantId: string,
  ) {
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
