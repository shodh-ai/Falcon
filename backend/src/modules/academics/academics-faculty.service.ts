import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { mkdirSync, writeFileSync } from 'fs';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { AttendanceRecord } from '../../entities/attendance-record.entity';
import { AcademicTimetable } from '../../entities/academic-timetable.entity';
import { StudentCourseEnrollment } from '../../entities/student-course-enrollment.entity';
import { CourseAttendanceLog } from '../../entities/course-attendance-log.entity';
import { CourseMaterial } from '../../entities/course-material.entity';
import { ObjectStorageService } from '../../storage/object-storage.service';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { BulkAttendanceDto } from './dto/bulk-attendance.dto';

export interface FacultyTodayClassDto {
  classId: number;
  timetableEntryId: number;
  subjectName: string;
  roomNumber: string;
  time: string;
  startTime: string;
  endTime: string;
  batchId: number;
  subjectId: number;
  studentCount: number;
}

export interface ClassStudentDto {
  student_id: string;
  name: string;
  roll_number: string;
  photo_url: string | null;
}

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const ROLL_NUMBER_SQL = `COALESCE(
  NULLIF(BTRIM(sp.enrollment_no), ''),
  NULLIF(BTRIM(sp.enrollment_number), ''),
  NULLIF(BTRIM(sp.admission_number), ''),
  u.user_id::text
)`;

function localDateString(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

@Injectable()
export class AcademicsFacultyService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(AttendanceRecord)
    private readonly attendanceRepo: Repository<AttendanceRecord>,
    @InjectRepository(AcademicTimetable)
    private readonly timetableRepo: Repository<AcademicTimetable>,
    @InjectRepository(StudentCourseEnrollment)
    private readonly enrollmentRepo: Repository<StudentCourseEnrollment>,
    @InjectRepository(CourseAttendanceLog)
    private readonly courseAttendanceLogs: Repository<CourseAttendanceLog>,
    @InjectRepository(CourseMaterial)
    private readonly courseMaterials: Repository<CourseMaterial>,
    private readonly objectStorage: ObjectStorageService,
    private readonly notificationEmitter: NotificationEmitterService,
  ) {}

  async getFacultyTodayClasses(
    facultyUserId: string,
  ): Promise<FacultyTodayClassDto[]> {
    const dayOfWeek = DAY_NAMES[new Date().getDay()];

    const rows: Array<{
      class_id: number;
      timetable_entry_id: number;
      subject_name: string;
      room_number: string;
      start_time: string;
      end_time: string;
      batch_id: number;
      subject_id: number;
      student_count: string;
    }> = await this.dataSource.query(
      `
      SELECT
        co.course_offering_id AS class_id,
        te.timetable_entry_id,
        c.course_name AS subject_name,
        r.room_code AS room_number,
        to_char(ts.start_time, 'HH24:MI') AS start_time,
        to_char(ts.end_time, 'HH24:MI') AS end_time,
        sem.batch_id,
        COALESCE(sub.subject_id, c.course_id) AS subject_id,
        (
          SELECT COUNT(*)::text
          FROM student_profiles sp
          INNER JOIN academic_batches ab ON ab.batch_name = sp.batch
          WHERE ab.batch_id = sem.batch_id AND sp.status = 'ACTIVE'
        ) AS student_count
      FROM timetable_entries te
      INNER JOIN time_slots ts ON ts.time_slot_id = te.time_slot_id
      INNER JOIN course_offerings co ON co.course_offering_id = te.course_offering_id
      INNER JOIN courses c ON c.course_id = co.course_id
      INNER JOIN rooms r ON r.room_id = te.room_id
      INNER JOIN semesters sem ON sem.semester_id = co.semester_id
      LEFT JOIN academic_subjects sub ON sub.subject_code = c.course_code
      WHERE te.faculty_id = $1
        AND LOWER(TRIM(ts.day_of_week)) = LOWER(TRIM($2))
      ORDER BY ts.start_time ASC
      `,
      [facultyUserId, dayOfWeek],
    );

    return rows.map((row) => {
      const start = this.formatTime12h(row.start_time);
      const end = this.formatTime12h(row.end_time);
      return {
        classId: Number(row.class_id),
        timetableEntryId: Number(row.timetable_entry_id),
        subjectName: row.subject_name,
        roomNumber: row.room_number,
        time: `${start} – ${end}`,
        startTime: start,
        endTime: end,
        batchId: Number(row.batch_id),
        subjectId: Number(row.subject_id),
        studentCount: Number(row.student_count ?? 0),
      };
    });
  }

  async getClassStudents(classId: number): Promise<ClassStudentDto[]> {
    const offering = await this.dataSource.query(
      `SELECT course_offering_id FROM course_offerings WHERE course_offering_id = $1`,
      [classId],
    );
    if (!offering.length) {
      throw new NotFoundException(`Class ${classId} not found`);
    }

    const rows: Array<{
      student_id: string;
      name: string;
      roll_number: string;
      photo_url: string | null;
    }> = await this.dataSource.query(
      `
      SELECT
        sp.user_id AS student_id,
        u.name,
        COALESCE(sp.enrollment_number, sp.admission_number, sp.enrollment_no, sp.batch, '—') AS roll_number,
        NULL::text AS photo_url
      FROM course_offerings co
      INNER JOIN semesters sem ON sem.semester_id = co.semester_id
      INNER JOIN academic_batches ab ON ab.batch_id = sem.batch_id
      INNER JOIN student_profiles sp ON sp.batch = ab.batch_name AND sp.status = 'ACTIVE'
      INNER JOIN users u ON u.user_id = sp.user_id
      WHERE co.course_offering_id = $1
      ORDER BY sp.enrollment_no NULLS LAST, u.name ASC
      `,
      [classId],
    );

    return rows;
  }

  async bulkMarkAttendance(dto: BulkAttendanceDto, markedByUserId: string) {
    const sessionDate = dto.session_date;
    const studentIds = dto.entries.map((e) => e.student_id);

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(AttendanceRecord);

      if (studentIds.length > 0) {
        const deleteQb = repo
          .createQueryBuilder()
          .delete()
          .where('subject_id = :subjectId', { subjectId: dto.subject_id })
          .andWhere('session_date = :sessionDate', { sessionDate })
          .andWhere('student_user_id IN (:...studentIds)', { studentIds });
        if (dto.batch_id != null) {
          deleteQb.andWhere('batch_id = :batchId', { batchId: dto.batch_id });
        }
        await deleteQb.execute();
      }

      const values = dto.entries.map((entry) => {
        const row: Partial<AttendanceRecord> = {
          student_user_id: entry.student_id,
          subject_id: dto.subject_id,
          session_date: sessionDate,
          session_slot: dto.session_slot ?? String(dto.course_offering_id),
          status: entry.status,
          marked_by_user_id: markedByUserId,
        };
        if (dto.batch_id != null) row.batch_id = dto.batch_id;
        return row;
      });

      await repo
        .createQueryBuilder()
        .insert()
        .into(AttendanceRecord)
        .values(values)
        .execute();

      return { saved: values.length, session_date: sessionDate };
    });
  }

  async getFacultyAcademicTimetableToday(
    facultyUserId: string,
    tenantId: string,
  ) {
    const day = new Date().getDay();
    const isoDay = day === 0 ? 7 : day;
    const rows = await this.dataSource.query<
      Array<{
        timetable_id: string;
        course_id: string;
        course_code: string;
        course_name: string;
        room: string | null;
        start_time: string;
        end_time: string;
      }>
    >(
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
         fc.course_id,
         c.course_code,
         c.course_name,
         t.room,
         COALESCE(t.start_time, '09:00'::time) AS start_time,
         COALESCE(t.end_time, '10:00'::time) AS end_time
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
       WHERE COALESCE(t.day_of_week, 1) = $3
       ORDER BY COALESCE(t.start_time, '09:00'::time)`,
      [tenantId, facultyUserId, isoDay],
    );

    return Promise.all(
      rows.map(async (row) => ({
        timetable_id: row.timetable_id,
        course_id: row.course_id,
        course_code: row.course_code,
        course_name: row.course_name,
        room: row.room,
        start_time: row.start_time,
        end_time: row.end_time,
        student_count: await this.enrollmentRepo.count({
          where: {
            tenant_id: tenantId,
            course_id: row.course_id,
            status: 'ENROLLED',
          },
        }),
      })),
    );
  }

  async getCourseStudents(
    courseId: string,
    facultyUserId: string,
    tenantId: string,
  ) {
    await this.assertFacultyTeachesCourse(courseId, facultyUserId, tenantId);
    const rows = await this.enrollmentRepo.find({
      where: {
        tenant_id: tenantId,
        course_id: courseId,
        status: 'ENROLLED',
      },
      relations: ['student'],
      order: { student_user_id: 'ASC' },
    });

    const rollById = new Map<string, string>();
    if (rows.length) {
      const profileRows = await this.dataSource.query<
        Array<{ user_id: string; roll_number: string }>
      >(
        `SELECT u.user_id, ${ROLL_NUMBER_SQL} AS roll_number
         FROM users u
         LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
         WHERE u.user_id = ANY($1::uuid[])`,
        [rows.map((r) => r.student_user_id)],
      );
      for (const p of profileRows) rollById.set(p.user_id, p.roll_number);
    }

    return rows.map((row) => ({
      student_id: row.student_user_id,
      name: row.student?.name ?? 'Student',
      roll_number: rollById.get(row.student_user_id) ?? row.student_user_id,
      email: row.student?.email ?? null,
    }));
  }

  async getCourseAttendanceState(
    courseId: string,
    facultyUserId: string,
    tenantId: string,
    date = localDateString(),
    timetableId?: string,
  ) {
    await this.assertCanMarkAttendance(courseId, facultyUserId, tenantId, date);
    const effectiveFacultyId = await this.resolveAttendanceFacultyId(
      courseId,
      facultyUserId,
      tenantId,
      date,
    );

    const log = timetableId
      ? await this.dataSource.query(
          `SELECT attendance_data FROM course_attendance_logs
           WHERE tenant_id = $1 AND course_id = $2 AND faculty_user_id = $3
             AND date = $4::date AND timetable_id = $5::uuid`,
          [tenantId, courseId, effectiveFacultyId, date, timetableId],
        )
      : await this.dataSource.query(
          `SELECT attendance_data FROM course_attendance_logs
           WHERE tenant_id = $1 AND course_id = $2 AND faculty_user_id = $3
             AND date = $4::date AND timetable_id IS NULL`,
          [tenantId, courseId, effectiveFacultyId, date],
        );

    return {
      course_id: courseId,
      date,
      timetable_id: timetableId ?? null,
      locked: this.isAttendanceLocked(date),
      attendance_data: log[0]?.attendance_data ?? null,
    };
  }

  async getPreviousSessionAttendance(
    facultyUserId: string,
    tenantId: string,
    courseId: string,
    date: string,
    beforeTimetableId: string,
  ) {
    await this.assertCanMarkAttendance(courseId, facultyUserId, tenantId, date);
    const effectiveFacultyId = await this.resolveAttendanceFacultyId(
      courseId,
      facultyUserId,
      tenantId,
      date,
    );

    const slot = await this.timetableRepo.findOne({
      where: { tenant_id: tenantId, timetable_id: beforeTimetableId },
    });
    if (!slot) throw new NotFoundException('Timetable slot not found');

    const isoDay =
      new Date(`${date}T00:00:00`).getDay() === 0
        ? 7
        : new Date(`${date}T00:00:00`).getDay();
    const prevSlot = await this.dataSource.query(
      `SELECT t.timetable_id FROM academic_timetables t
       WHERE t.tenant_id = $1 AND t.faculty_user_id = $2 AND t.course_id = $3
         AND t.day_of_week = $4 AND t.start_time < $5::time
       ORDER BY t.start_time DESC LIMIT 1`,
      [tenantId, slot.faculty_user_id, courseId, isoDay, slot.start_time],
    );

    if (!prevSlot[0]) {
      return { attendance_data: null, source_timetable_id: null };
    }

    const prevId = prevSlot[0].timetable_id;
    const log = await this.dataSource.query(
      `SELECT attendance_data FROM course_attendance_logs
       WHERE tenant_id = $1 AND course_id = $2 AND faculty_user_id = $3
         AND date = $4::date AND timetable_id = $5::uuid`,
      [tenantId, courseId, effectiveFacultyId, date, prevId],
    );

    return {
      attendance_data: log[0]?.attendance_data ?? null,
      source_timetable_id: prevId,
    };
  }

  async getMissingAttendanceAlerts(facultyUserId: string, tenantId: string) {
    const isoDay = new Date().getDay() === 0 ? 7 : new Date().getDay();
    return this.dataSource.query(
      `SELECT
         t.timetable_id,
         t.course_id,
         c.course_code,
         c.course_name,
         t.start_time,
         t.end_time,
         COUNT(e.enrollment_id)::int AS student_count
       FROM academic_timetables t
       INNER JOIN academic_courses c ON c.course_id = t.course_id AND c.tenant_id = t.tenant_id
       LEFT JOIN student_course_enrollments e
         ON e.tenant_id = t.tenant_id
        AND e.course_id = t.course_id
        AND e.status = 'ENROLLED'
       LEFT JOIN course_attendance_logs cal
         ON cal.tenant_id = t.tenant_id
        AND cal.course_id = t.course_id
        AND cal.faculty_user_id = t.faculty_user_id
        AND cal.date = CURRENT_DATE
        AND cal.timetable_id = t.timetable_id
       WHERE t.tenant_id = $1
         AND t.faculty_user_id = $2
         AND t.day_of_week = $3
         AND t.end_time < CURRENT_TIME
         AND cal.log_id IS NULL
       GROUP BY t.timetable_id, t.course_id, c.course_code, c.course_name, t.start_time, t.end_time
       ORDER BY t.start_time ASC`,
      [tenantId, facultyUserId, isoDay],
    );
  }

  async getAttendanceAnalytics(
    courseId: string,
    facultyUserId: string,
    tenantId: string,
    date = localDateString(),
  ) {
    await this.assertFacultyTeachesCourse(courseId, facultyUserId, tenantId);
    const [health] = await this.dataSource.query<
      Array<{
        scheduled_classes: string;
        conducted_classes: string;
        average_attendance_percent: string | null;
      }>
    >(
      `WITH day_slots AS (
         SELECT COUNT(*)::int AS scheduled_classes
         FROM academic_timetables t
         WHERE t.tenant_id = $1
           AND t.faculty_user_id = $3
           AND t.day_of_week = EXTRACT(ISODOW FROM $4::date)::int
       ),
       day_conducted AS (
         SELECT COUNT(*)::int AS conducted_classes
         FROM course_attendance_logs cal
         WHERE cal.tenant_id = $1
           AND cal.faculty_user_id = $3
           AND cal.date = $4::date
           AND cal.timetable_id IS NOT NULL
       ),
       conducted AS (
         SELECT
           cal.log_id,
           COUNT(entries.value)::numeric AS total_students,
           COUNT(entries.value) FILTER (
             WHERE entries.value->>'status' IN ('PRESENT', 'LATE', 'EXCUSED')
           )::numeric AS present_students
         FROM course_attendance_logs cal
         CROSS JOIN LATERAL jsonb_array_elements(cal.attendance_data) entries(value)
         WHERE cal.tenant_id = $1
           AND cal.course_id = $2
           AND cal.faculty_user_id = $3
         GROUP BY cal.log_id
       )
       SELECT
         (SELECT scheduled_classes::text FROM day_slots) AS scheduled_classes,
         (SELECT conducted_classes::text FROM day_conducted) AS conducted_classes,
         ROUND(AVG((present_students / NULLIF(total_students, 0)) * 100), 2)::text AS average_attendance_percent
       FROM conducted`,
      [tenantId, courseId, facultyUserId, date],
    );

    const defaulters = await this.dataSource.query(
      `SELECT
         e.student_user_id,
         u.name,
         ${ROLL_NUMBER_SQL} AS roll_number,
         COALESCE(e.attendance_percent, 0)::numeric(5,2)::text AS attendance_percent
       FROM student_course_enrollments e
       INNER JOIN users u ON u.user_id = e.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       WHERE e.tenant_id = $1
         AND e.course_id = $2
         AND e.status = 'ENROLLED'
         AND COALESCE(e.attendance_percent, 0) < 75
       ORDER BY COALESCE(e.attendance_percent, 0) ASC, u.name ASC`,
      [tenantId, courseId],
    );

    const habitualAbsentees = await this.dataSource.query(
      `WITH last_logs AS (
         SELECT log_id, attendance_data, date
         FROM course_attendance_logs
         WHERE tenant_id = $1 AND course_id = $2 AND faculty_user_id = $3
         ORDER BY date DESC
         LIMIT 3
       ),
       absences AS (
         SELECT entry.value->>'student_id' AS student_user_id, COUNT(*)::int AS missed_count
         FROM last_logs
         CROSS JOIN LATERAL jsonb_array_elements(attendance_data) entry(value)
         WHERE entry.value->>'status' = 'ABSENT'
         GROUP BY entry.value->>'student_id'
       )
       SELECT
         a.student_user_id,
         u.name,
         ${ROLL_NUMBER_SQL} AS roll_number,
         a.missed_count
       FROM absences a
       INNER JOIN users u ON u.user_id::text = a.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       WHERE a.missed_count >= 3
       ORDER BY u.name ASC`,
      [tenantId, courseId, facultyUserId],
    );

    return {
      health: {
        scheduled_classes: Number(health?.scheduled_classes ?? 0),
        conducted_classes: Number(health?.conducted_classes ?? 0),
        average_attendance_percent: Number(
          health?.average_attendance_percent ?? 0,
        ),
      },
      defaulters,
      habitual_absentees: habitualAbsentees,
    };
  }

  async sendAttendanceWarnings(
    courseId: string,
    facultyUserId: string,
    tenantId: string,
    studentIds: string[],
  ) {
    await this.assertFacultyTeachesCourse(courseId, facultyUserId, tenantId);
    const ids = [...new Set((studentIds ?? []).filter(Boolean))];
    if (!ids.length)
      throw new BadRequestException('Select at least one student');

    const rows = await this.dataSource.query<
      Array<{
        student_user_id: string;
        attendance_percent: string;
        course_name: string;
      }>
    >(
      `SELECT e.student_user_id, COALESCE(e.attendance_percent, 0)::text AS attendance_percent, c.course_name
       FROM student_course_enrollments e
       INNER JOIN academic_courses c ON c.course_id = e.course_id AND c.tenant_id = e.tenant_id
       WHERE e.tenant_id = $1
         AND e.course_id = $2
         AND e.student_user_id = ANY($3::uuid[])`,
      [tenantId, courseId, ids],
    );

    const parentRows = await this.dataSource
      .query<Array<{ student_user_id: string; parent_user_id: string }>>(
        `SELECT student_user_id, parent_user_id
       FROM parent_student_links
       WHERE tenant_id = $1 AND student_user_id = ANY($2::uuid[]) AND parent_user_id IS NOT NULL`,
        [tenantId, ids],
      )
      .catch(() => []);
    const parentsByStudent = new Map<string, string[]>();
    for (const row of parentRows) {
      const list = parentsByStudent.get(row.student_user_id) ?? [];
      list.push(row.parent_user_id);
      parentsByStudent.set(row.student_user_id, list);
    }

    for (const row of rows) {
      const percent = Number(row.attendance_percent ?? 0);
      const payload = {
        tenantId,
        attendancePercent: percent,
        title: 'Attendance warning',
        message: `Your attendance in ${row.course_name} is ${percent.toFixed(2)}%. Please attend upcoming classes.`,
        actionLink: '/student/attendance',
      };
      this.notificationEmitter.attendanceWarning({
        ...payload,
        userId: row.student_user_id,
      });
      for (const parentUserId of parentsByStudent.get(row.student_user_id) ??
        []) {
        this.notificationEmitter.attendanceWarning({
          ...payload,
          userId: parentUserId,
        });
      }
    }

    return { notified: rows.length };
  }

  async saveCourseAttendanceLog(
    facultyUserId: string,
    tenantId: string,
    dto: {
      course_id: string;
      date?: string;
      timetable_id?: string;
      attendance_data: {
        student_id: string;
        status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
      }[];
    },
  ) {
    const date = dto.date ?? localDateString();
    await this.assertCanMarkAttendance(
      dto.course_id,
      facultyUserId,
      tenantId,
      date,
    );
    const effectiveFacultyId = await this.resolveAttendanceFacultyId(
      dto.course_id,
      facultyUserId,
      tenantId,
      date,
    );
    if (this.isAttendanceLocked(date)) {
      throw new ForbiddenException(
        'Attendance locked. Contact Admin to modify records older than 3 days.',
      );
    }
    if (!dto.attendance_data?.length) {
      throw new BadRequestException('Attendance data cannot be empty');
    }

    const timetableId = dto.timetable_id ?? null;
    if (timetableId) {
      await this.dataSource.query(
        `DELETE FROM course_attendance_logs
         WHERE tenant_id = $1 AND course_id = $2 AND faculty_user_id = $3 AND date = $4::date AND timetable_id = $5::uuid`,
        [tenantId, dto.course_id, effectiveFacultyId, date, timetableId],
      );
      await this.dataSource.query(
        `INSERT INTO course_attendance_logs (tenant_id, course_id, faculty_user_id, date, timetable_id, attendance_data)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          tenantId,
          dto.course_id,
          effectiveFacultyId,
          date,
          timetableId,
          JSON.stringify(dto.attendance_data),
        ],
      );
    } else {
      await this.dataSource.query(
        `DELETE FROM course_attendance_logs
         WHERE tenant_id = $1 AND course_id = $2 AND faculty_user_id = $3 AND date = $4::date AND timetable_id IS NULL`,
        [tenantId, dto.course_id, effectiveFacultyId, date],
      );
      await this.dataSource.query(
        `INSERT INTO course_attendance_logs (tenant_id, course_id, faculty_user_id, date, attendance_data)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [
          tenantId,
          dto.course_id,
          effectiveFacultyId,
          date,
          JSON.stringify(dto.attendance_data),
        ],
      );
    }

    const updated = await this.recalculateCourseAttendancePercents(
      tenantId,
      dto.course_id,
    );

    if (dto.attendance_data.length > 0 && updated.length === 0) {
      throw new BadRequestException(
        'Attendance saved but no enrolled students were updated. Check that student IDs match course enrollments.',
      );
    }

    return {
      saved: dto.attendance_data.length,
      date,
      attendance_updated: updated,
    };
  }

  private async recalculateCourseAttendancePercents(
    tenantId: string,
    courseId: string,
  ) {
    const rows = await this.dataSource.query<
      Array<{ student_user_id: string; attendance_percent: string }>
    >(
      `WITH session_data AS (
         SELECT elem.value AS entry
         FROM course_attendance_logs cal
         CROSS JOIN LATERAL jsonb_array_elements(cal.attendance_data) AS elem
         WHERE cal.tenant_id = $1 AND cal.course_id = $2
       ),
       student_stats AS (
         SELECT
           entry->>'student_id' AS student_id,
           COUNT(*)::int AS total_sessions,
           SUM(
             CASE WHEN entry->>'status' IN ('PRESENT', 'LATE', 'EXCUSED') THEN 1 ELSE 0 END
           )::int AS present_sessions
         FROM session_data
         GROUP BY entry->>'student_id'
       ),
       updated AS (
         UPDATE student_course_enrollments e
         SET attendance_percent = ROUND(
           (s.present_sessions::numeric / NULLIF(s.total_sessions, 0)) * 100,
           2
         )
         FROM student_stats s
         WHERE e.tenant_id = $1
           AND e.course_id = $2
           AND e.student_user_id::text = s.student_id
         RETURNING e.student_user_id, e.attendance_percent
       )
       SELECT student_user_id, attendance_percent::text FROM updated`,
      [tenantId, courseId],
    );
    return rows;
  }

  async uploadCourseMaterial(
    facultyUserId: string,
    tenantId: string,
    dto: { course_id?: string; title?: string },
    file: Express.Multer.File,
  ) {
    const result = await this.uploadCourseMaterials(
      facultyUserId,
      tenantId,
      dto,
      [file],
    );
    return result.materials[0];
  }

  async uploadCourseMaterials(
    facultyUserId: string,
    tenantId: string,
    dto: { course_id?: string; title?: string; material_type?: string },
    files: Express.Multer.File[],
  ) {
    if (!dto.course_id || !dto.title?.trim()) {
      throw new NotFoundException('Course and title are required');
    }
    if (!files?.length)
      throw new BadRequestException('At least one file is required');
    await this.assertFacultyTeachesCourse(
      dto.course_id,
      facultyUserId,
      tenantId,
    );
    const materials = await Promise.all(
      files.map(async (file) => {
        const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
        const stored = await this.persistMaterialFile(
          tenantId,
          uniqueName,
          file,
        );
        const row = this.courseMaterials.create({
          tenant_id: tenantId,
          course_id: dto.course_id,
          faculty_user_id: facultyUserId,
          title:
            files.length === 1
              ? dto.title!.trim()
              : file.originalname.replace(/\.[^.]+$/, ''),
          file_path: stored.filePath,
          file_key: stored.fileKey,
          material_type: (dto.material_type ?? 'NOTES').toUpperCase(),
        });
        return this.courseMaterials.save(row);
      }),
    );
    return { materials };
  }

  private formatTime12h(hhmm: string): string {
    const [hStr, mStr] = hhmm.split(':');
    let h = parseInt(hStr, 10);
    const m = mStr ?? '00';
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}:${m} ${ampm}`;
  }

  private async assertCanMarkAttendance(
    courseId: string,
    facultyUserId: string,
    tenantId: string,
    date?: string,
  ) {
    const row = await this.timetableRepo.findOne({
      where: {
        tenant_id: tenantId,
        course_id: courseId,
        faculty_user_id: facultyUserId,
      },
    });
    if (row) return;

    const allocation = await this.dataSource.query(
      `SELECT 1 FROM academic_course_allocations
       WHERE tenant_id = $1 AND course_id = $2 AND faculty_user_id = $3 AND status = 'ACTIVE'
       LIMIT 1`,
      [tenantId, courseId, facultyUserId],
    );
    if (allocation.length) return;

    if (date) {
      const proxy = await this.dataSource.query(
        `SELECT 1 FROM academic_proxy_requests
         WHERE tenant_id = $1 AND proxy_faculty_id = $2 AND course_id = $3
           AND date_of_proxy = $4::date AND status = 'APPROVED' LIMIT 1`,
        [tenantId, facultyUserId, courseId, date],
      );
      if (proxy.length) return;
    }
    throw new NotFoundException('Course not found in your teaching timetable');
  }

  private async resolveAttendanceFacultyId(
    courseId: string,
    facultyUserId: string,
    tenantId: string,
    date: string,
  ): Promise<string> {
    const teaches = await this.timetableRepo.findOne({
      where: {
        tenant_id: tenantId,
        course_id: courseId,
        faculty_user_id: facultyUserId,
      },
    });
    if (teaches) return facultyUserId;

    const allocation = await this.dataSource.query(
      `SELECT 1 FROM academic_course_allocations
       WHERE tenant_id = $1 AND course_id = $2 AND faculty_user_id = $3 AND status = 'ACTIVE'
       LIMIT 1`,
      [tenantId, courseId, facultyUserId],
    );
    if (allocation.length) return facultyUserId;

    const proxy = await this.dataSource.query<
      Array<{ absent_faculty_id: string }>
    >(
      `SELECT absent_faculty_id FROM academic_proxy_requests
       WHERE tenant_id = $1 AND proxy_faculty_id = $2 AND course_id = $3
         AND date_of_proxy = $4::date AND status = 'APPROVED' LIMIT 1`,
      [tenantId, facultyUserId, courseId, date],
    );
    return proxy[0]?.absent_faculty_id ?? facultyUserId;
  }

  private async assertFacultyTeachesCourse(
    courseId: string,
    facultyUserId: string,
    tenantId: string,
  ) {
    await this.assertCanMarkAttendance(
      courseId,
      facultyUserId,
      tenantId,
      localDateString(),
    );
  }

  private isAttendanceLocked(date: string) {
    const selected = new Date(`${date}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.floor(
      (today.getTime() - selected.getTime()) / 86_400_000,
    );
    return diffDays > 3;
  }

  private async persistMaterialFile(
    tenantId: string,
    uniqueName: string,
    file: Express.Multer.File,
  ): Promise<{ filePath: string; fileKey: string | null }> {
    if (this.objectStorage.isEnabled()) {
      const key = this.objectStorage.buildKey(tenantId, uniqueName);
      const stored = await this.objectStorage.upload(
        tenantId,
        key,
        file.buffer,
        file.mimetype,
      );
      return { filePath: stored.url, fileKey: stored.key };
    }
    const uploadPath = process.env.UPLOAD_PATH || './uploads';
    const targetDir = `${uploadPath}/${tenantId}/course-materials`;
    mkdirSync(targetDir, { recursive: true });
    const fullPath = `${targetDir}/${uniqueName}`;
    writeFileSync(fullPath, file.buffer);
    return { filePath: fullPath, fileKey: null };
  }
}
