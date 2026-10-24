import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
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
import { FacultyTeachingDepartmentsService } from './faculty-teaching-departments.service';
import {
  allocationMatchesStudentSlot,
  parseAllocationSemester,
} from './allocation-semester.util';

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
  section_code?: string | null;
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

function academicYearForDate(value?: string): string {
  const date = value && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00Z`)
    : new Date();
  const year = date.getUTCFullYear();
  const start = date.getUTCMonth() >= 6 ? year : year - 1;
  return `${start}-${start + 1}`;
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
    private readonly teachingDepartments: FacultyTeachingDepartmentsService,
  ) {}

  async getFacultyTodayClasses(
    facultyUserId: string,
  ): Promise<FacultyTodayClassDto[]> {
    const dayOfWeek = DAY_NAMES[new Date().getDay()];

    try {
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
    } catch {
      // Legacy timetable_entries schema is absent on some tenants; callers use
      // getFacultyAcademicTimetableToday as the primary today view.
      return [];
    }
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

  /** Seven bounded days, one query; deliberately does not fetch student rosters. */
  async getFacultyAttendanceWeek(facultyUserId: string, tenantId: string, deptId?: number | null, start = localDateString()) {
    const parsed = new Date(`${start}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== start) {
      throw new BadRequestException('start must be a valid YYYY-MM-DD value');
    }
    const rows = await this.dataSource.query(
      `WITH ${this.teachingDepartments.facultyCoursesCte(3)},
       days AS (SELECT ($4::date + n)::date AS date FROM generate_series(0, 6) n)
       SELECT days.date::text AS date, t.timetable_id::text, t.course_id,
         c.course_code, c.course_name, t.start_time, t.end_time, t.room, t.section,
         EXISTS (SELECT 1 FROM course_attendance_logs cal
           WHERE cal.tenant_id = t.tenant_id AND cal.course_id = t.course_id
             AND cal.faculty_user_id = t.faculty_user_id
             AND cal.timetable_id = t.timetable_id AND cal.date = days.date) AS has_saved_attendance
       FROM days
       LEFT JOIN academic_timetables t ON t.tenant_id = $1 AND t.faculty_user_id = $2
         AND ((t.deleted_at IS NULL AND t.valid_to IS NULL) OR t.valid_to >= days.date)
         AND (t.valid_from IS NULL OR t.valid_from <= days.date)
         AND t.day_of_week = EXTRACT(ISODOW FROM days.date)
         AND t.course_id IN (SELECT course_id FROM faculty_courses)
         AND NOT EXISTS (
           SELECT 1 FROM academic_proxy_requests p
           WHERE p.tenant_id=t.tenant_id AND p.timetable_id=t.timetable_id
             AND p.date_of_proxy=days.date AND p.status='APPROVED'
         )
       LEFT JOIN academic_courses c ON c.course_id = t.course_id AND c.tenant_id = t.tenant_id
       UNION ALL
       SELECT days.date::text, t.timetable_id::text, t.course_id, c.course_code, c.course_name,
         t.start_time, t.end_time, t.room, t.section,
         EXISTS (SELECT 1 FROM course_attendance_logs cal
           WHERE cal.tenant_id=t.tenant_id AND cal.course_id=t.course_id
             AND cal.faculty_user_id=t.faculty_user_id AND cal.timetable_id=t.timetable_id
             AND cal.date=days.date)
       FROM days
       JOIN academic_proxy_requests p ON p.tenant_id=$1 AND p.proxy_faculty_id=$2
         AND p.date_of_proxy=days.date AND p.status='APPROVED'
       JOIN academic_timetables t ON t.timetable_id=p.timetable_id AND t.tenant_id=p.tenant_id
         AND t.course_id=p.course_id AND t.faculty_user_id=p.absent_faculty_id
         AND t.deleted_at IS NULL
         AND (t.valid_from IS NULL OR t.valid_from<=days.date)
         AND (t.valid_to IS NULL OR t.valid_to>=days.date)
       JOIN academic_courses c ON c.course_id=t.course_id AND c.tenant_id=t.tenant_id
       UNION ALL
       SELECT days.date::text, 'held:' || e.source_key, e.course_id, c.course_code, c.course_name,
         (e.entry->>'start')::time, (e.entry->>'end')::time, e.entry->>'room', e.entry->>'batch', false
       FROM days JOIN academic_timetable_source_entries e ON e.tenant_id=$1 AND e.state='HELD'
       JOIN academic_timetable_publications p ON p.publication_id=e.publication_id AND p.state='ACTIVE' AND p.activated_on<=days.date
       JOIN academic_courses c ON c.course_id=e.course_id AND c.tenant_id=e.tenant_id
       WHERE $2::uuid=ANY(e.faculty_user_ids) AND (e.entry->>'day')::int=EXTRACT(ISODOW FROM days.date)
         AND e.course_id IN (SELECT course_id FROM faculty_courses)
       ORDER BY date, start_time, timetable_id`,
      [tenantId, facultyUserId, deptId ?? null, start],
    );
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(parsed);
      date.setUTCDate(date.getUTCDate() + index);
      const key = date.toISOString().slice(0, 10);
      return { date: key, sessions: rows.filter(row => row.date === key && row.timetable_id).map(row => ({
        ...row, has_saved_attendance: Boolean(row.has_saved_attendance), attendance_locked: this.isAttendanceLocked(key),
        awaiting_confirmation: String(row.timetable_id).startsWith('held:'),
      })) };
    });
  }

  async getFacultyAcademicTimetableToday(
    facultyUserId: string,
    tenantId: string,
    deptId?: number | null,
    date = localDateString(),
  ) {
    const requestedDay = new Date(`${date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        Number.isNaN(requestedDay.getTime()) ||
        requestedDay.toISOString().slice(0, 10) !== date) {
      throw new BadRequestException('date must be a valid YYYY-MM-DD value');
    }
    const day = requestedDay.getUTCDay();
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
        section: string | null;
        is_practical: boolean;
        has_saved_attendance: boolean;
      }>
    >(
      `WITH ${this.teachingDepartments.facultyCoursesCte(3)}
       SELECT
         t.timetable_id::text AS timetable_id,
         fc.course_id,
         c.course_code,
         c.course_name,
         t.room,
         t.start_time,
         t.end_time,
         t.section,
         (
           UPPER(c.course_code) ~ '(P|LAB)$'
           OR c.course_name ILIKE '%practical%'
           OR c.course_name ILIKE '%lab%'
         ) AS is_practical,
         EXISTS (
           SELECT 1 FROM course_attendance_logs cal
           WHERE cal.tenant_id = t.tenant_id
             AND cal.course_id = t.course_id
             AND cal.faculty_user_id = t.faculty_user_id
             AND cal.timetable_id = t.timetable_id
             AND cal.date = $5::date
         ) AS has_saved_attendance
       FROM academic_timetables t
       INNER JOIN faculty_courses fc ON fc.course_id = t.course_id
       INNER JOIN academic_courses c ON c.course_id = t.course_id AND c.tenant_id = t.tenant_id
       WHERE t.tenant_id = $1
         AND t.faculty_user_id = $2
         AND ((t.deleted_at IS NULL AND t.valid_to IS NULL) OR t.valid_to >= $5::date)
         AND (t.valid_from IS NULL OR t.valid_from <= $5::date)
         AND t.day_of_week = $4
         AND NOT EXISTS (
           SELECT 1 FROM academic_proxy_requests p
           WHERE p.tenant_id=t.tenant_id AND p.timetable_id=t.timetable_id
             AND p.date_of_proxy=$5::date AND p.status='APPROVED'
         )
       UNION ALL
       SELECT t.timetable_id::text, t.course_id, c.course_code, c.course_name,
         t.room, t.start_time, t.end_time, t.section,
         (UPPER(c.course_code) ~ '(P|LAB)$' OR c.course_name ILIKE '%practical%'
           OR c.course_name ILIKE '%lab%') AS is_practical,
         EXISTS (SELECT 1 FROM course_attendance_logs cal
           WHERE cal.tenant_id=t.tenant_id AND cal.course_id=t.course_id
             AND cal.faculty_user_id=t.faculty_user_id AND cal.timetable_id=t.timetable_id
             AND cal.date=$5::date) AS has_saved_attendance
       FROM academic_proxy_requests p
       JOIN academic_timetables t ON t.timetable_id=p.timetable_id AND t.tenant_id=p.tenant_id
         AND t.course_id=p.course_id AND t.faculty_user_id=p.absent_faculty_id
         AND t.deleted_at IS NULL
         AND (t.valid_from IS NULL OR t.valid_from<=$5::date)
         AND (t.valid_to IS NULL OR t.valid_to>=$5::date)
       JOIN academic_courses c ON c.course_id=t.course_id AND c.tenant_id=t.tenant_id
       WHERE p.tenant_id=$1 AND p.proxy_faculty_id=$2
         AND p.date_of_proxy=$5::date AND p.status='APPROVED'
       UNION ALL
       SELECT 'held:' || e.source_key, e.course_id, c.course_code,c.course_name,e.entry->>'room',
         (e.entry->>'start')::time,(e.entry->>'end')::time,e.entry->>'batch',e.entry->>'session_type'='LAB',false
       FROM academic_timetable_source_entries e
       JOIN academic_timetable_publications p ON p.publication_id=e.publication_id AND p.state='ACTIVE' AND p.activated_on<=$5::date
       JOIN academic_courses c ON c.course_id=e.course_id AND c.tenant_id=e.tenant_id
       WHERE e.tenant_id=$1 AND $2::uuid=ANY(e.faculty_user_ids) AND e.state='HELD'
         AND (e.entry->>'day')::int=$4 AND e.course_id IN (SELECT course_id FROM faculty_courses)
       ORDER BY start_time`,
      [tenantId, facultyUserId, deptId ?? null, isoDay, date],
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
        section: row.section,
        is_practical: Boolean(row.is_practical),
        has_saved_attendance: Boolean(row.has_saved_attendance),
        attendance_locked: this.isAttendanceLocked(date),
        awaiting_confirmation: row.timetable_id.startsWith('held:'),
        student_count: row.timetable_id.startsWith('held:') || row.is_practical && !row.section
          ? 0
          : (await this.getCourseStudents(
              row.course_id,
              facultyUserId,
              tenantId,
              row.timetable_id,
              date,
            )).length,
      })),
    );
  }

  async listFacultyPracticalBatches(facultyUserId: string, tenantId: string, deptId?: number | null) {
    return this.dataSource.query<Array<{
      course_id: string;
      course_code: string;
      course_name: string;
      section: string;
      timetable_id: string;
      scheduled_days: string;
    }>>(
      `WITH ${this.teachingDepartments.facultyCoursesCte(3)}
       SELECT fc.course_id, c.course_code, c.course_name, BTRIM(t.section) AS section,
              MIN(t.timetable_id::text)::uuid AS timetable_id,
              string_agg(DISTINCT t.day_of_week::text, ', ' ORDER BY t.day_of_week::text) AS scheduled_days
       FROM academic_timetables t
       JOIN faculty_courses fc ON fc.course_id = t.course_id
       JOIN academic_courses c ON c.course_id = t.course_id AND c.tenant_id = t.tenant_id
       WHERE t.tenant_id = $1 AND t.faculty_user_id = $2 AND t.deleted_at IS NULL
         AND NULLIF(BTRIM(t.section), '') IS NOT NULL
         AND (UPPER(c.course_code) ~ '(P|LAB)$' OR c.course_name ILIKE '%practical%'
              OR c.course_name ILIKE '%lab%')
       GROUP BY fc.course_id, c.course_code, c.course_name, BTRIM(t.section)
       ORDER BY c.course_code, section`,
      [tenantId, facultyUserId, deptId ?? null],
    );
  }

  async getCourseStudents(
    courseId: string,
    facultyUserId: string,
    tenantId: string,
    timetableId?: string,
    date?: string,
    manager?: EntityManager,
  ) {
    // Attendance writes resolve the same roster inside their transaction.
    // A course can have enrollments outside this faculty's programme/section;
    // validating writes against all course enrollments rejects a complete UI roster.
    const db = manager ?? this.dataSource;
    const enrollmentRepo = manager?.getRepository(StudentCourseEnrollment) ?? this.enrollmentRepo;
    const [approvedCover] = date && timetableId
      ? await db.query<Array<{ absent_faculty_id: string }>>(
          `SELECT absent_faculty_id FROM academic_proxy_requests
           WHERE tenant_id=$1 AND course_id=$2 AND proxy_faculty_id=$3
             AND timetable_id=$4::uuid AND date_of_proxy=$5::date
             AND status='APPROVED' LIMIT 1`,
          [tenantId, courseId, facultyUserId, timetableId, date],
        )
      : [];
    const rosterFacultyId = approvedCover?.absent_faculty_id ?? facultyUserId;
    // A previously recorded sheet is an immutable roster snapshot. The original
    // actor retains read access even when their current allocation is superseded.
    if (timetableId && date && this.isAttendanceLocked(date)) {
      const [saved] = await db.query(`SELECT cal.attendance_data FROM course_attendance_logs cal
        JOIN academic_timetables t ON t.timetable_id=cal.timetable_id AND t.tenant_id=cal.tenant_id
        WHERE cal.tenant_id=$1 AND cal.course_id=$2 AND cal.faculty_user_id=$3
          AND cal.timetable_id=$4::uuid AND cal.date=$5::date AND t.faculty_user_id=$3
          AND ($3::uuid=$6::uuid OR cal.marked_by_user_id=$6::uuid)`,
        [tenantId,courseId,rosterFacultyId,timetableId,date,facultyUserId]);
      if (Array.isArray(saved?.attendance_data)) {
        const ids = saved.attendance_data.map((entry: {student_id:string})=>entry.student_id);
        return db.query(`SELECT u.user_id AS student_id,u.name,${ROLL_NUMBER_SQL} AS roll_number,
          u.official_email AS email,NULL::text AS section_code FROM users u LEFT JOIN student_profiles sp ON sp.user_id=u.user_id
          WHERE u.tenant_id=$1 AND u.user_id=ANY($2::uuid[]) ORDER BY u.user_id`,[tenantId,ids]);
      }
    }
    if (approvedCover) {
      await this.assertCanMarkAttendance(courseId, facultyUserId, tenantId, date, timetableId);
    } else {
      await this.assertFacultyTeachesCourse(courseId, facultyUserId, tenantId);
    }
    // Practical sessions are scheduled per batch/section.  Scope the roster
    // to the exact timetable slot when one is supplied so marking Batch A
    // cannot accidentally include or overwrite Batch B.
    let sectionCode: string | null = null;
    let theorySectionCode: string | null = null;
    if (timetableId) {
      const [slot] = await db.query<
        Array<{ section: string | null; is_practical: boolean }>
      >(
        `SELECT t.section,
                (UPPER(c.course_code) ~ '(P|LAB)$'
                 OR c.course_name ILIKE '%practical%'
                 OR c.course_name ILIKE '%lab%') AS is_practical
           FROM academic_timetables t
           INNER JOIN academic_courses c ON c.course_id = t.course_id AND c.tenant_id = t.tenant_id
          WHERE t.tenant_id = $1
            AND t.timetable_id = $2::uuid
            AND t.course_id = $3
            AND t.faculty_user_id = $4
            AND ((t.deleted_at IS NULL AND t.valid_to IS NULL) OR t.valid_to >= $5::date)
            AND (t.valid_from IS NULL OR t.valid_from <= $5::date)
          LIMIT 1`,
        [tenantId, timetableId, courseId, rosterFacultyId, date ?? localDateString()],
      );
      if (!slot) throw new NotFoundException('Timetable slot not found');
      sectionCode = slot.is_practical ? slot.section?.trim() || null : null;
      theorySectionCode = slot.is_practical ? null : slot.section?.trim() || null;
      if (slot.is_practical && !sectionCode) return [];
    }

    const rows = await enrollmentRepo.find({
      where: {
        tenant_id: tenantId,
        course_id: courseId,
        // The roster is also used to review submissions and correct grades
        // after a semester closes.  Those records remain valid course
        // memberships when their status moves to COMPLETED or FAILED; using
        // only ENROLLED made a faculty roster appear empty as soon as the
        // enrollment sync finalized a semester.
        status: In(['ENROLLED', 'COMPLETED', 'FAILED']),
      },
      relations: ['student'],
      order: { student_user_id: 'ASC' },
    });

    // A course identity can be allocated to multiple programmes and sections.
    // Owning one allocation must not expose the other programme's students.
    // Preserve timetable-only legacy courses, which have no allocation facts.
    const allocations = await db.query<Array<{
      program_name: string | null;
      semester: string | null;
      academic_year: string;
    }>>(
      `SELECT program_name, semester, academic_year
       FROM academic_course_allocations
       WHERE tenant_id = $1 AND course_id = $2 AND faculty_user_id = $3
         AND status = 'ACTIVE'`,
      [tenantId, courseId, rosterFacultyId],
    );
    const currentAllocations = allocations.filter(
      (allocation) => allocation.academic_year === academicYearForDate(date),
    );
    let scopedRows = rows;
    if (allocations.length) {
      const profileRows = rows.length
        ? await db.query<Array<{
            user_id: string;
            program: string | null;
            status: string | null;
          }>>(
            `SELECT user_id,
                    COALESCE(NULLIF(BTRIM(program_name), ''), NULLIF(BTRIM(batch), '')) AS program,
                    status
             FROM student_profiles
             WHERE tenant_id = $1 AND user_id = ANY($2::uuid[]) AND deleted_at IS NULL`,
            [tenantId, rows.map((row) => row.student_user_id)],
          )
        : [];
      const profiles = new Map(profileRows.map((profile) => [profile.user_id, profile]));
      scopedRows = rows.filter((row) => {
        const profile = profiles.get(row.student_user_id);
        if (!profile?.program || (row.status === 'ENROLLED' && profile.status !== 'ACTIVE')) {
          return false;
        }
        return currentAllocations.some((allocation) =>
          allocationMatchesStudentSlot(
            allocation.semester,
            allocation.program_name,
            Number(row.semester),
            row.section_code,
            profile.program!,
          ),
        );
      });
    }
    if (theorySectionCode && currentAllocations.some((allocation) =>
      parseAllocationSemester(allocation.semester).sectionCode != null,
    )) {
      scopedRows = scopedRows.filter((row) =>
        row.section_code?.trim().toUpperCase() === theorySectionCode!.toUpperCase(),
      );
    }

    let allowedIds: Set<string> | null = null;
    if (sectionCode) {
      const [batch] = await db.query<Array<{ batch_id: string }>>(
        `SELECT batch_id FROM academic_practical_batches
         WHERE tenant_id = $1 AND course_id = $2 AND section_code = $3`,
        [tenantId, courseId, sectionCode],
      );
      if (batch) {
        const members = await db.query<Array<{ student_user_id: string }>>(
          `SELECT student_user_id FROM academic_practical_batch_members
           WHERE batch_id = $1 AND removed_at IS NULL`,
          [batch.batch_id],
        );
        allowedIds = new Set(members.map((member) => member.student_user_id));
      } else {
        const assigned = await db.query<Array<{ student_user_id: string }>>(
          `SELECT student_user_id FROM academic_practical_batch_members
           WHERE tenant_id = $1 AND course_id = $2 AND removed_at IS NULL`,
          [tenantId, courseId],
        );
        const elsewhere = new Set(assigned.map((row) => row.student_user_id));
        allowedIds = new Set(scopedRows.filter((row) =>
          row.section_code === sectionCode && !elsewhere.has(row.student_user_id),
        ).map((row) => row.student_user_id));
      }
      // A saved session is a historical snapshot: editing a batch today must
      // not change who appears on that older attendance sheet.
      if (date && timetableId) {
        const [saved] = await db.query<Array<{ attendance_data: Array<{ student_id: string }> }>>(
          `SELECT attendance_data FROM course_attendance_logs
           WHERE tenant_id = $1 AND course_id = $2 AND timetable_id = $3::uuid
             AND date = $4::date LIMIT 1`,
          [tenantId, courseId, timetableId, date],
        );
        if (saved) allowedIds = new Set(saved.attendance_data.map((entry) => entry.student_id));
      }
    }
    const visibleRows = allowedIds ? scopedRows.filter((row) => allowedIds.has(row.student_user_id)) : scopedRows;

    const rollById = new Map<string, string>();
    if (visibleRows.length) {
      const profileRows = await db.query<
        Array<{ user_id: string; roll_number: string }>
      >(
        `SELECT u.user_id, ${ROLL_NUMBER_SQL} AS roll_number
         FROM users u
         LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
         WHERE u.user_id = ANY($1::uuid[])`,
        [visibleRows.map((r) => r.student_user_id)],
      );
      for (const p of profileRows) rollById.set(p.user_id, p.roll_number);
    }

    return visibleRows.map((row) => ({
      student_id: row.student_user_id,
      name: row.student?.name ?? 'Student',
      roll_number: rollById.get(row.student_user_id) ?? row.student_user_id,
      email: row.student?.email ?? null,
      section_code: row.section_code ?? null,
    }));
  }

  /** The official timetable supplies the batch name; faculty manage its roster. */
  private async facultyPracticalSlot(courseId: string, timetableId: string, facultyUserId: string, tenantId: string) {
    await this.assertFacultyTeachesCourse(courseId, facultyUserId, tenantId);
    const [slot] = await this.dataSource.query<Array<{ section: string | null; is_practical: boolean }>>(
      `SELECT t.section,
              (UPPER(c.course_code) ~ '(P|LAB)$' OR c.course_name ILIKE '%practical%'
               OR c.course_name ILIKE '%lab%') AS is_practical
       FROM academic_timetables t
       JOIN academic_courses c ON c.course_id = t.course_id AND c.tenant_id = t.tenant_id
       WHERE t.tenant_id = $1 AND t.timetable_id = $2::uuid AND t.course_id = $3
         AND t.faculty_user_id = $4 AND t.deleted_at IS NULL LIMIT 1`,
      [tenantId, timetableId, courseId, facultyUserId],
    );
    if (!slot?.is_practical || !slot.section?.trim()) {
      throw new ForbiddenException('This is not an assigned, named practical batch');
    }
    return slot.section.trim();
  }

  async getPracticalBatch(courseId: string, timetableId: string, facultyUserId: string, tenantId: string) {
    const sectionCode = await this.facultyPracticalSlot(courseId, timetableId, facultyUserId, tenantId);
    const [batch] = await this.dataSource.query<Array<{ batch_id: string; revision: number }>>(
      `SELECT batch_id, revision FROM academic_practical_batches
       WHERE tenant_id = $1 AND course_id = $2 AND section_code = $3`,
      [tenantId, courseId, sectionCode],
    );
    const enrolled = await this.getCourseStudents(courseId, facultyUserId, tenantId);
    const assignments = await this.dataSource.query<Array<{ student_user_id: string; section_code: string }>>(
      `SELECT m.student_user_id, b.section_code
       FROM academic_practical_batch_members m
       JOIN academic_practical_batches b ON b.batch_id = m.batch_id
       WHERE m.tenant_id = $1 AND m.course_id = $2 AND m.removed_at IS NULL`,
      [tenantId, courseId],
    );
    const byStudent = new Map(assignments.map((row) => [row.student_user_id, row.section_code]));
    return {
      section_code: sectionCode,
      revision: batch?.revision ?? 0,
      students: enrolled.map((student) => ({
        ...student,
        selected: batch ? byStudent.get(student.student_id) === sectionCode
          : (byStudent.get(student.student_id) ?? student.section_code) === sectionCode,
        assigned_batch: byStudent.get(student.student_id) ?? null,
      })),
    };
  }

  async savePracticalBatch(
    courseId: string, timetableId: string, facultyUserId: string, tenantId: string,
    expectedRevision: number, studentIds: string[],
  ) {
    const sectionCode = await this.facultyPracticalSlot(courseId, timetableId, facultyUserId, tenantId);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0 || !Array.isArray(studentIds)) {
      throw new BadRequestException('If-Match revision and student_ids array are required');
    }
    if (studentIds.some((id) => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
      throw new BadRequestException('Each student ID must be a UUID');
    }
    if (studentIds.length !== new Set(studentIds).size) throw new BadRequestException('Duplicate students in batch');
    return this.dataSource.transaction(async (manager) => {
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`practical:${tenantId}:${courseId}`]);
      const [batch] = await manager.query<Array<{ batch_id: string; revision: number }>>(
        `SELECT batch_id, revision FROM academic_practical_batches
         WHERE tenant_id = $1 AND course_id = $2 AND section_code = $3 FOR UPDATE`,
        [tenantId, courseId, sectionCode],
      );
      if ((batch?.revision ?? 0) !== expectedRevision) throw new ConflictException('Batch changed; refresh before saving');
      const enrolled = await manager.query<Array<{ student_user_id: string }>>(
        `SELECT student_user_id FROM student_course_enrollments
         WHERE tenant_id = $1 AND course_id = $2 AND status IN ('ENROLLED', 'COMPLETED', 'FAILED')`,
        [tenantId, courseId],
      );
      const valid = new Set(enrolled.map((row) => row.student_user_id));
      if (studentIds.some((id) => !valid.has(id))) throw new BadRequestException('Batch contains a student outside this course');
      const occupied = await manager.query<Array<{ student_user_id: string }>>(
        `SELECT m.student_user_id FROM academic_practical_batch_members m
         JOIN academic_practical_batches b ON b.batch_id = m.batch_id
         WHERE m.tenant_id = $1 AND m.course_id = $2 AND m.removed_at IS NULL
           AND b.section_code <> $3 AND m.student_user_id = ANY($4::uuid[])`,
        [tenantId, courseId, sectionCode, studentIds],
      );
      if (occupied.length) throw new ConflictException('A student is already assigned to another practical batch');
      // A course lock prevents two editors changing the same roster. Student
      // locks also serialize assignments across *different* practical courses,
      // so both editors cannot independently approve overlapping labs.
      for (const studentId of [...studentIds].sort()) {
        await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
          `practical-student:${tenantId}:${studentId}`,
        ]);
      }
      if (studentIds.length) {
        const overlapping = await manager.query<Array<{ student_user_id: string }>>(
          `SELECT DISTINCT e.student_user_id
           FROM academic_timetables requested
           JOIN student_course_enrollments e
             ON e.tenant_id = requested.tenant_id
            AND e.student_user_id = ANY($3::uuid[])
            AND e.course_id <> requested.course_id
            AND e.status = 'ENROLLED'
           JOIN academic_timetables other
             ON other.tenant_id = e.tenant_id AND other.course_id = e.course_id
            AND other.deleted_at IS NULL
            AND other.day_of_week = requested.day_of_week
            AND other.start_time < requested.end_time
            AND requested.start_time < other.end_time
           LEFT JOIN academic_practical_batch_members member
             ON member.tenant_id = e.tenant_id AND member.course_id = e.course_id
            AND member.student_user_id = e.student_user_id AND member.removed_at IS NULL
           LEFT JOIN academic_practical_batches assigned
             ON assigned.batch_id = member.batch_id
           WHERE requested.tenant_id = $1 AND requested.course_id = $2
             AND requested.deleted_at IS NULL
             AND UPPER(REPLACE(REPLACE(TRIM(requested.section), ' ', '-'), '_', '-')) =
                 UPPER(REPLACE(REPLACE(TRIM($4), ' ', '-'), '_', '-'))
             AND (
               UPPER(REPLACE(REPLACE(COALESCE(other.section, ''), ' ', '-'), '_', '-')) NOT LIKE 'BATCH-%'
               OR UPPER(REPLACE(REPLACE(other.section, ' ', '-'), '_', '-')) =
                  UPPER(REPLACE(REPLACE(assigned.section_code, ' ', '-'), '_', '-'))
               OR (member.membership_id IS NULL
                   AND UPPER(REPLACE(REPLACE(e.section_code, ' ', '-'), '_', '-')) LIKE 'BATCH-%'
                   AND UPPER(REPLACE(REPLACE(other.section, ' ', '-'), '_', '-')) =
                       UPPER(REPLACE(REPLACE(e.section_code, ' ', '-'), '_', '-')))
             )
           LIMIT 1`,
          [tenantId, courseId, studentIds, sectionCode],
        );
        if (overlapping.length) {
          throw new ConflictException('Batch overlaps another confirmed class for a selected student');
        }
      }
      const [savedBatch] = batch ? [batch] : await manager.query<Array<{ batch_id: string; revision: number }>>(
        `INSERT INTO academic_practical_batches
         (tenant_id, course_id, section_code, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $4) RETURNING batch_id, revision`,
        [tenantId, courseId, sectionCode, facultyUserId],
      );
      await manager.query(
        `UPDATE academic_practical_batch_members SET removed_at = now(), changed_by = $2
         WHERE batch_id = $1 AND removed_at IS NULL AND NOT (student_user_id = ANY($3::uuid[]))`,
        [savedBatch.batch_id, facultyUserId, studentIds],
      );
      await manager.query(
        `INSERT INTO academic_practical_batch_members
         (batch_id, tenant_id, course_id, student_user_id, changed_by)
         SELECT $1, $2, $3, x, $5 FROM unnest($4::uuid[]) AS x
         WHERE NOT EXISTS (SELECT 1 FROM academic_practical_batch_members m
                           WHERE m.batch_id = $1 AND m.student_user_id = x AND m.removed_at IS NULL)`,
        [savedBatch.batch_id, tenantId, courseId, studentIds, facultyUserId],
      );
      const revision = batch ? expectedRevision + 1 : 1;
      if (batch) await manager.query(
        `UPDATE academic_practical_batches SET revision = $2, updated_by = $3, updated_at = now() WHERE batch_id = $1`,
        [savedBatch.batch_id, revision, facultyUserId],
      );
      return { section_code: sectionCode, revision, student_count: studentIds.length };
    });
  }

  async getCourseAttendanceState(
    courseId: string,
    facultyUserId: string,
    tenantId: string,
    date = localDateString(),
    timetableId?: string,
  ) {
    if (timetableId && this.isAttendanceLocked(date)) {
      const [saved] = await this.dataSource.query(`SELECT cal.attendance_data FROM course_attendance_logs cal
        JOIN academic_timetables t ON t.timetable_id=cal.timetable_id AND t.tenant_id=cal.tenant_id
        WHERE cal.tenant_id=$1 AND cal.course_id=$2 AND cal.faculty_user_id=$3
          AND cal.timetable_id=$4::uuid AND cal.date=$5::date AND t.faculty_user_id=$3`,
        [tenantId,courseId,facultyUserId,timetableId,date]);
      if (Array.isArray(saved?.attendance_data)) return {course_id:courseId,date,timetable_id:timetableId,locked:true,attendance_data:saved.attendance_data};
    }
    await this.assertCanMarkAttendance(courseId, facultyUserId, tenantId, date, timetableId);
    const effectiveFacultyId = await this.resolveAttendanceFacultyId(
      courseId,
      facultyUserId,
      tenantId,
      date,
      timetableId,
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
    await this.assertCanMarkAttendance(courseId, facultyUserId, tenantId, date, beforeTimetableId);
    const effectiveFacultyId = await this.resolveAttendanceFacultyId(
      courseId,
      facultyUserId,
      tenantId,
      date,
      beforeTimetableId,
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

  async getMissingAttendanceAlerts(
    facultyUserId: string,
    tenantId: string,
    deptId?: number | null,
  ) {
    const isoDay = new Date().getDay() === 0 ? 7 : new Date().getDay();
    return this.dataSource.query(
      `WITH ${this.teachingDepartments.facultyCoursesCte(3)},
       proxy_today AS (
         SELECT p.course_id, p.absent_faculty_id
         FROM academic_proxy_requests p
         WHERE p.tenant_id = $1
           AND p.proxy_faculty_id = $2
           AND p.date_of_proxy = CURRENT_DATE
           AND p.status = 'APPROVED'
       ),
       eligible_courses AS (
         SELECT course_id, $2::uuid AS log_faculty_id
         FROM faculty_courses
         UNION
         SELECT course_id, absent_faculty_id AS log_faculty_id
         FROM proxy_today
       ),
       today_slots AS (
         SELECT
           t.timetable_id,
           t.course_id,
           t.start_time,
           t.end_time,
           ec.log_faculty_id
         FROM eligible_courses ec
         INNER JOIN academic_timetables t
           ON t.tenant_id = $1
          AND t.course_id = ec.course_id
          AND t.day_of_week = $4
          AND t.faculty_user_id = ec.log_faculty_id
          AND t.deleted_at IS NULL
         WHERE t.end_time < CURRENT_TIME
       )
       SELECT
         ts.timetable_id,
         ts.course_id,
         c.course_code,
         c.course_name,
         ts.start_time,
         ts.end_time,
         COUNT(e.enrollment_id)::int AS student_count
       FROM today_slots ts
       INNER JOIN academic_courses c
         ON c.course_id = ts.course_id
        AND c.tenant_id = $1
       LEFT JOIN student_course_enrollments e
         ON e.tenant_id = $1
        AND e.course_id = ts.course_id
        AND e.status = 'ENROLLED'
       LEFT JOIN course_attendance_logs cal
         ON cal.tenant_id = $1
        AND cal.course_id = ts.course_id
        AND cal.faculty_user_id = ts.log_faculty_id
        AND cal.date = CURRENT_DATE
        AND cal.timetable_id = ts.timetable_id
       WHERE cal.log_id IS NULL
       GROUP BY ts.timetable_id, ts.course_id, c.course_code, c.course_name, ts.start_time, ts.end_time
       ORDER BY ts.start_time ASC`,
      [tenantId, facultyUserId, deptId ?? null, isoDay],
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
    const parsedDate = new Date(`${date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.getTime()) || parsedDate.getUTCFullYear()<1 || parsedDate.toISOString().slice(0,10)!==date) {
      throw new BadRequestException('date must be a valid YYYY-MM-DD value');
    }
    if (dto.timetable_id?.startsWith('held:')) {
      throw new BadRequestException('This class is awaiting department confirmation. Attendance cannot be recorded.');
    }
    if (!dto.timetable_id) {
      const [publication] = await this.dataSource.query(`SELECT EXISTS (
        SELECT 1 FROM academic_timetable_source_entries e
        JOIN academic_timetable_publications p ON p.publication_id=e.publication_id AND p.state='ACTIVE' AND p.activated_on<=$4::date
        WHERE e.tenant_id=$1 AND e.course_id=$2 AND $3::uuid=ANY(e.faculty_user_ids)
          AND e.state IN ('CONFIRMED','HELD')) AS requires_published_slot`, [tenantId,dto.course_id,facultyUserId,date]);
      if (publication?.requires_published_slot === true) {
        throw new BadRequestException('Select a confirmed published timetable session to record attendance.');
      }
    }
    await this.assertCanMarkAttendance(
      dto.course_id,
      facultyUserId,
      tenantId,
      date,
      dto.timetable_id,
    );
    const effectiveFacultyId = await this.resolveAttendanceFacultyId(
      dto.course_id,
      facultyUserId,
      tenantId,
      date,
      dto.timetable_id,
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
    // The selected timetable is the authority for a practical batch.  Never
    // accept a student from another section, and require the complete slot
    // roster so a search result cannot silently reset everyone else to absent.
    const slotRows = timetableId
      ? await this.dataSource.query<
          Array<{ section: string | null; faculty_user_id: string | null; is_practical: boolean }>
        >(
          `SELECT t.section, t.faculty_user_id,
                  (UPPER(c.course_code) ~ '(P|LAB)$'
                   OR c.course_name ILIKE '%practical%'
                   OR c.course_name ILIKE '%lab%') AS is_practical
             FROM academic_timetables t
             INNER JOIN academic_courses c ON c.course_id = t.course_id AND c.tenant_id = t.tenant_id
            WHERE t.tenant_id = $1
              AND t.timetable_id = $2::uuid
              AND t.course_id = $3
              AND t.faculty_user_id = $4
              AND t.deleted_at IS NULL
            LIMIT 1`,
          [tenantId, timetableId, dto.course_id, effectiveFacultyId],
        )
      : [];
    if (timetableId && !slotRows[0]) {
      throw new ForbiddenException('Attendance slot is not assigned to this faculty/course');
    }
    const section = slotRows[0]?.is_practical
      ? slotRows[0]?.section?.trim() || null
      : null;
    if (slotRows[0]?.is_practical && !section) {
      throw new ForbiddenException('Practical batch is not mapped to a student section');
    }
    await this.dataSource.transaction(async (manager) => {
      if (timetableId) {
        await manager.query(
          `SELECT pg_advisory_xact_lock(hashtext($1))`,
          [`proxy:${tenantId}:${timetableId}:${date}`],
        );
        const [cover] = await manager.query<Array<{ proxy_faculty_id: string }>>(
          `SELECT proxy_faculty_id FROM academic_proxy_requests
           WHERE tenant_id = $1 AND timetable_id = $2::uuid
             AND date_of_proxy = $3::date AND status = 'APPROVED' LIMIT 1`,
          [tenantId, timetableId, date],
        );
        if (cover && cover.proxy_faculty_id !== facultyUserId) {
          throw new ForbiddenException('This session is assigned to an approved substitute faculty');
        }
      }
      // Batch edits and attendance saves share this lock; neither can validate
      // against a roster that changes before its transaction commits.
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`practical:${tenantId}:${dto.course_id}`]);
      // Reuse the exact read-side programme, semester, section and practical
      // batch scoping. The old write query demanded every enrollment in the
      // course, including students deliberately hidden from this faculty.
      const rosterRows = await this.getCourseStudents(
        dto.course_id,
        effectiveFacultyId,
        tenantId,
        timetableId ?? undefined,
        date,
        manager,
      );
      const roster = new Set<string>(rosterRows.map((row) => row.student_id));
      const submitted = dto.attendance_data.map((row) => row.student_id);
      const duplicate = submitted.find((id, index) => submitted.indexOf(id) !== index);
      if (duplicate) throw new BadRequestException('Attendance contains duplicate students');
      if (submitted.some((id) => !roster.has(id))) throw new BadRequestException('Attendance contains students outside this scheduled batch');
      if ([...roster].some((id) => !submitted.includes(id))) throw new BadRequestException('Attendance must include every student in this scheduled batch');
      // Serialize the exact slot/day so two browser tabs cannot overwrite a
      // practical batch with a stale roster.
      await manager.query(
        `SELECT pg_advisory_xact_lock(hashtext($1))`,
        [`${tenantId}:${dto.course_id}:${effectiveFacultyId}:${date}:${timetableId ?? 'none'}`],
      );
      await manager.query(
        `DELETE FROM course_attendance_logs
         WHERE tenant_id = $1 AND course_id = $2 AND faculty_user_id = $3
           AND date = $4::date
           AND (($5::uuid IS NULL AND timetable_id IS NULL) OR timetable_id = $5::uuid)`,
        [tenantId, dto.course_id, effectiveFacultyId, date, timetableId],
      );
      await manager.query(
        `INSERT INTO course_attendance_logs (tenant_id, course_id, faculty_user_id, date, timetable_id, attendance_data, marked_by_user_id)
         VALUES ($1, $2, $3, $4, $5::uuid, $6::jsonb, $7::uuid)`,
        [
          tenantId,
          dto.course_id,
          effectiveFacultyId,
          date,
          timetableId,
          JSON.stringify(dto.attendance_data),
          facultyUserId,
        ],
      );
    });

    const updated = await this.recalculateCourseAttendancePercents(
      tenantId,
      dto.course_id,
    );

    return {
      saved: dto.attendance_data.length,
      date,
      attendance_updated: updated,
      // A session log is authoritative even when an old/demo roster has no
      // matching enrollment rows.  Do not turn a successful save into a 500:
      // callers can surface this as a reconciliation warning instead.
      enrollment_reconciliation_warning:
        dto.attendance_data.length > 0 && updated.length === 0
          ? 'Attendance saved, but no enrolled student percentages matched this roster.'
          : null,
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
    timetableId?: string,
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

    const marks = await this.dataSource.query(
      `SELECT 1 FROM academic_marks
       WHERE tenant_id = $1 AND course_id = $2 AND uploaded_by = $3
       LIMIT 1`,
      [tenantId, courseId, facultyUserId],
    );
    if (marks.length) return;

    if (date && timetableId) {
      const proxy = await this.dataSource.query(
        `SELECT 1 FROM academic_proxy_requests
         WHERE tenant_id = $1 AND proxy_faculty_id = $2 AND course_id = $3
           AND date_of_proxy = $4::date AND status = 'APPROVED'
           AND timetable_id = $5::uuid LIMIT 1`,
        [tenantId, facultyUserId, courseId, date, timetableId],
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
    timetableId?: string,
  ): Promise<string> {
    // A substitute's permission is for one approved slot, not every class of
    // the same course on this date. Resolve it before their own allocations:
    // a colleague who also teaches this course still records against the
    // original session owner.
    if (timetableId) {
      const proxy = await this.dataSource.query<Array<{ absent_faculty_id: string }>>(
        `SELECT absent_faculty_id FROM academic_proxy_requests
         WHERE tenant_id = $1 AND proxy_faculty_id = $2 AND course_id = $3
           AND date_of_proxy = $4::date AND timetable_id = $5::uuid
           AND status = 'APPROVED' LIMIT 1`,
        [tenantId, facultyUserId, courseId, date, timetableId],
      );
      if (proxy[0]) return proxy[0].absent_faculty_id;
    }
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

    return facultyUserId;
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
