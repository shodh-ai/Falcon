import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { mkdirSync, writeFileSync } from 'fs';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as ExcelJS from 'exceljs';
import { AttendanceRecord } from '../../entities/attendance-record.entity';
import { AcademicTimetable } from '../../entities/academic-timetable.entity';
import { StudentCourseEnrollment } from '../../entities/student-course-enrollment.entity';
import { CourseAttendanceLog } from '../../entities/course-attendance-log.entity';
import { CourseMaterial } from '../../entities/course-material.entity';
import { ObjectStorageService } from '../../storage/object-storage.service';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { FalconNotificationsService } from '../../core/notifications/falcon-notifications.service';
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

function academicYearKey(value: string): string {
  const match = /^(\d{4})\s*[-/]\s*(\d{2}|\d{4})$/.exec(value.trim());
  if (!match) return value.trim().toUpperCase();
  const start = Number(match[1]);
  const end =
    match[2].length === 2
      ? Number(`${String(start).slice(0, 2)}${match[2]}`)
      : Number(match[2]);
  return `${start}-${end}`;
}

function extraClassId(timetableId?: string): string | null {
  if (!timetableId?.startsWith('extra:')) return null;
  const id = timetableId.slice('extra:'.length);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
    throw new BadRequestException('Invalid extra class session');
  }
  return id;
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
    @Optional()
    private readonly falconNotifications?: FalconNotificationsService,
  ) {}

  private attendanceUnlockMinutes() {
    const configured = Number(
      process.env.ATTENDANCE_UNLOCK_WINDOW_MINUTES ?? 30,
    );
    return Number.isFinite(configured) && configured >= 5 && configured <= 1440
      ? Math.floor(configured)
      : 30;
  }

  private attendanceLockDays() {
    const configured = Number(process.env.ATTENDANCE_LOCK_AFTER_DAYS ?? 3);
    return Number.isFinite(configured) && configured >= 0 && configured <= 30
      ? Math.floor(configured)
      : 3;
  }

  private attendanceMarkingDeadline(date: string) {
    // Preserve the existing three-full-days policy: a class dated Monday locks
    // at 00:00 on Friday in the campus timezone.
    const deadline = new Date(`${date}T23:59:59.999+05:30`);
    deadline.setUTCDate(deadline.getUTCDate() + this.attendanceLockDays());
    return deadline;
  }

  private async activeAttendanceUnlock(
    db: DataSource | EntityManager,
    tenantId: string,
    facultyUserId: string,
    courseId: string,
    date: string,
    timetableId?: string,
  ) {
    const adjustmentId = extraClassId(timetableId);
    const regularId = adjustmentId ? null : (timetableId ?? null);
    const [row] = await db.query<
      Array<{
        request_id: string;
        status: string;
        unlocked_until: Date | string | null;
      }>
    >(
      `SELECT request_id,status,unlocked_until
       FROM academic_attendance_unlock_requests
       WHERE tenant_id=$1 AND faculty_user_id=$2 AND course_id=$3
         AND class_date=$4::date
         AND (($5::uuid IS NOT NULL AND timetable_id=$5::uuid AND class_adjustment_id IS NULL)
           OR ($6::uuid IS NOT NULL AND class_adjustment_id=$6::uuid AND timetable_id IS NULL))
         AND status IN ('PENDING','APPROVED')
       ORDER BY requested_at DESC LIMIT 1`,
      [tenantId, facultyUserId, courseId, date, regularId, adjustmentId],
    );
    if (!row) return null;
    const active =
      row.status === 'APPROVED' &&
      row.unlocked_until != null &&
      new Date(row.unlocked_until).getTime() > Date.now();
    return { ...row, active };
  }

  private async attendanceAccessState(
    tenantId: string,
    facultyUserId: string,
    courseId: string,
    date: string,
    timetableId?: string,
  ) {
    const dateLocked = this.isAttendanceLocked(date);
    const adjustmentId = extraClassId(timetableId);
    const regularId = adjustmentId ? null : (timetableId ?? null);
    const request = dateLocked
      ? await this.activeAttendanceUnlock(
          this.dataSource,
          tenantId,
          facultyUserId,
          courseId,
          date,
          timetableId,
        )
      : null;
    const history = await this.dataSource.query<
      Array<{
        request_id: string;
        status: string;
        reason: string;
        requested_at: Date | string;
        decided_at: Date | string | null;
        decision_remarks: string | null;
        unlocked_until: Date | string | null;
        applied_at: Date | string | null;
      }>
    >(
      `SELECT request_id,status,reason,requested_at,decided_at,decision_remarks,
              unlocked_until,applied_at
       FROM academic_attendance_unlock_requests
       WHERE tenant_id=$1 AND faculty_user_id=$2 AND course_id=$3 AND class_date=$4::date
         AND (($5::uuid IS NOT NULL AND timetable_id=$5::uuid)
           OR ($6::uuid IS NOT NULL AND class_adjustment_id=$6::uuid))
       ORDER BY requested_at DESC LIMIT 20`,
      [tenantId, facultyUserId, courseId, date, regularId, adjustmentId],
    );
    return {
      locked: dateLocked && !request?.active,
      marking_deadline: this.attendanceMarkingDeadline(date).toISOString(),
      unlock_request_id: request?.request_id ?? null,
      unlock_status: request?.active
        ? 'APPROVED'
        : request?.status === 'APPROVED'
          ? 'EXPIRED'
          : (request?.status ?? history[0]?.status ?? null),
      unlocked_until:
        request?.active && request.unlocked_until
          ? new Date(request.unlocked_until).toISOString()
          : null,
      unlock_history: history.map((row) => ({
        ...row,
        requested_at: new Date(row.requested_at).toISOString(),
        decided_at: row.decided_at
          ? new Date(row.decided_at).toISOString()
          : null,
        unlocked_until: row.unlocked_until
          ? new Date(row.unlocked_until).toISOString()
          : null,
        applied_at: row.applied_at
          ? new Date(row.applied_at).toISOString()
          : null,
      })),
    };
  }

  private async assertApprovedExtraClass(
    db: DataSource | EntityManager,
    tenantId: string,
    courseId: string,
    facultyUserId: string,
    date: string,
    adjustmentId: string,
  ) {
    const [row] = await db.query<Array<{ adjustment_id: string }>>(
      `SELECT adjustment_id FROM class_adjustments
       WHERE tenant_id=$1 AND course_id=$2 AND faculty_user_id=$3
         AND adjustment_id=$4::uuid AND adjustment_type='EXTRA_CLASS'
         AND status IN ('APPROVED','NOTIFIED')
         AND (new_date AT TIME ZONE 'Asia/Kolkata')::date=$5::date`,
      [tenantId, courseId, facultyUserId, adjustmentId, date],
    );
    if (!row)
      throw new ForbiddenException(
        'Extra class is not approved for this faculty, course and date',
      );
  }

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
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== start
    ) {
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
             AND cal.timetable_id = t.timetable_id AND cal.date = days.date) AS has_saved_attendance,
         EXISTS (SELECT 1 FROM class_adjustments a
           WHERE a.tenant_id=t.tenant_id AND a.course_id=t.course_id
             AND a.faculty_user_id=t.faculty_user_id AND a.adjustment_type='CANCEL'
             AND a.status IN ('APPROVED','NOTIFIED')
             AND (a.new_date AT TIME ZONE 'Asia/Kolkata')::date=days.date
             AND (a.new_date AT TIME ZONE 'Asia/Kolkata')::time=t.start_time) AS cancelled
       FROM days
       LEFT JOIN academic_timetables t ON t.tenant_id = $1 AND t.faculty_user_id = $2
         AND t.deleted_at IS NULL AND (t.valid_to IS NULL OR t.valid_to >= days.date)
         AND (t.valid_from IS NULL OR t.valid_from <= days.date)
         AND t.day_of_week = EXTRACT(ISODOW FROM days.date)
         AND t.course_id IN (SELECT course_id FROM faculty_courses)
         AND NOT EXISTS (
           SELECT 1 FROM academic_proxy_requests p
           WHERE p.tenant_id=t.tenant_id AND p.timetable_id=t.timetable_id
             AND p.date_of_proxy=days.date AND p.status='APPROVED'
         )
         AND NOT EXISTS (
           SELECT 1 FROM academic_class_moves m
           WHERE m.tenant_id=t.tenant_id AND m.source_timetable_id=t.timetable_id
             AND m.source_date=days.date AND m.status='APPROVED'
         )
       LEFT JOIN academic_courses c ON c.course_id = t.course_id AND c.tenant_id = t.tenant_id
       UNION ALL
       SELECT days.date::text, t.timetable_id::text, t.course_id, c.course_code, c.course_name,
         COALESCE(m.target_start_time,t.start_time),COALESCE(m.target_end_time,t.end_time),
         COALESCE(m.target_room,t.room),t.section,
         EXISTS (SELECT 1 FROM course_attendance_logs cal
           WHERE cal.tenant_id=t.tenant_id AND cal.course_id=t.course_id
             AND cal.faculty_user_id=t.faculty_user_id AND cal.timetable_id=t.timetable_id
             AND cal.date=days.date),
         EXISTS (SELECT 1 FROM class_adjustments a
           WHERE a.tenant_id=t.tenant_id AND a.course_id=t.course_id
             AND a.faculty_user_id=t.faculty_user_id AND a.adjustment_type='CANCEL'
             AND a.status IN ('APPROVED','NOTIFIED')
             AND (a.new_date AT TIME ZONE 'Asia/Kolkata')::date=days.date
             AND (a.new_date AT TIME ZONE 'Asia/Kolkata')::time=COALESCE(m.target_start_time,t.start_time))
       FROM days
       JOIN academic_proxy_requests p ON p.tenant_id=$1 AND p.proxy_faculty_id=$2
         AND p.date_of_proxy=days.date AND p.status='APPROVED'
       JOIN academic_timetables t ON t.timetable_id=p.timetable_id AND t.tenant_id=p.tenant_id
         AND t.course_id=p.course_id AND t.faculty_user_id=p.absent_faculty_id
         AND t.deleted_at IS NULL
       LEFT JOIN academic_class_moves m ON m.tenant_id=p.tenant_id
         AND m.source_timetable_id=p.timetable_id AND m.target_date=days.date
         AND m.status='APPROVED'
       JOIN academic_courses c ON c.course_id=t.course_id AND c.tenant_id=t.tenant_id
       WHERE (t.valid_from IS NULL OR t.valid_from<=COALESCE(m.source_date,days.date))
         AND (t.valid_to IS NULL OR t.valid_to>=COALESCE(m.source_date,days.date))
       UNION ALL
       SELECT m.target_date::text, t.timetable_id::text, t.course_id, c.course_code, c.course_name,
         m.target_start_time, m.target_end_time, m.target_room, t.section,
         EXISTS (SELECT 1 FROM course_attendance_logs cal
           WHERE cal.tenant_id=m.tenant_id AND cal.course_id=m.course_id
             AND cal.faculty_user_id=m.original_faculty_id
             AND cal.timetable_id=m.source_timetable_id AND cal.date=m.target_date),
         EXISTS (SELECT 1 FROM class_adjustments a
           WHERE a.tenant_id=m.tenant_id AND a.course_id=m.course_id
             AND a.faculty_user_id=m.original_faculty_id AND a.adjustment_type='CANCEL'
             AND a.status IN ('APPROVED','NOTIFIED')
             AND (a.new_date AT TIME ZONE 'Asia/Kolkata')::date=m.target_date
             AND (a.new_date AT TIME ZONE 'Asia/Kolkata')::time=m.target_start_time)
       FROM academic_class_moves m
       JOIN academic_timetables t ON t.timetable_id=m.source_timetable_id AND t.tenant_id=m.tenant_id
       JOIN academic_courses c ON c.course_id=m.course_id AND c.tenant_id=m.tenant_id
       WHERE m.tenant_id=$1 AND m.original_faculty_id=$2
         AND m.target_date BETWEEN $4::date AND ($4::date + 6)
         AND m.status='APPROVED'
         AND m.course_id IN (SELECT course_id FROM faculty_courses)
         AND NOT EXISTS (SELECT 1 FROM academic_proxy_requests p
           WHERE p.tenant_id=m.tenant_id AND p.timetable_id=m.source_timetable_id
             AND p.date_of_proxy=m.target_date AND p.status='APPROVED')
       UNION ALL
       SELECT (a.new_date AT TIME ZONE 'Asia/Kolkata')::date::text,
         'extra:' || a.adjustment_id::text, a.course_id, c.course_code, c.course_name,
         (a.new_date AT TIME ZONE 'Asia/Kolkata')::time,
         ((a.new_date AT TIME ZONE 'Asia/Kolkata') + interval '1 hour')::time,
         a.proposed_room, NULL::text,
         EXISTS (SELECT 1 FROM course_attendance_logs cal
           WHERE cal.tenant_id=a.tenant_id AND cal.course_id=a.course_id
             AND cal.faculty_user_id=a.faculty_user_id
             AND cal.class_adjustment_id=a.adjustment_id), false
       FROM class_adjustments a
       JOIN academic_courses c ON c.course_id=a.course_id AND c.tenant_id=a.tenant_id
       WHERE a.tenant_id=$1 AND a.faculty_user_id=$2
         AND a.adjustment_type='EXTRA_CLASS' AND a.status IN ('APPROVED','NOTIFIED')
         AND (a.new_date AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $4::date AND ($4::date + 6)
         AND a.course_id IN (SELECT course_id FROM faculty_courses)
       UNION ALL
       SELECT days.date::text, 'held:' || e.source_key, e.course_id, c.course_code, c.course_name,
         (e.entry->>'start')::time, (e.entry->>'end')::time, e.entry->>'room', e.entry->>'batch', false, false
       FROM days JOIN academic_timetable_source_entries e ON e.tenant_id=$1 AND e.state='HELD'
       JOIN academic_timetable_publications p ON p.publication_id=e.publication_id AND p.state='ACTIVE' AND p.activated_on<=days.date
       JOIN academic_courses c ON c.course_id=e.course_id AND c.tenant_id=e.tenant_id
       WHERE $2::uuid=ANY(e.faculty_user_ids) AND (e.entry->>'day')::int=EXTRACT(ISODOW FROM days.date)
         AND e.course_id IN (SELECT course_id FROM faculty_courses)
       ORDER BY date, start_time, timetable_id`,
      [tenantId, facultyUserId, deptId ?? null, start],
    );
    const cancellationRows = rows.length ? await this.dataSource.query<Array<{
      course_id: string; session_date: string; start_time: string;
    }>>(
      `SELECT DISTINCT course_id,
              (new_date AT TIME ZONE 'Asia/Kolkata')::date::text AS session_date,
              to_char(new_date AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') AS start_time
       FROM class_adjustments
       WHERE tenant_id=$1 AND course_id=ANY($2::uuid[])
         AND adjustment_type='CANCEL' AND status IN ('APPROVED','NOTIFIED')
         AND (new_date AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $3::date AND ($3::date + 6)`,
      [tenantId, [...new Set(rows.map(row => row.course_id).filter(Boolean))], start],
    ) : [];
    const cancelledWeekSessions = new Set(cancellationRows.map(row => `${row.session_date}|${row.course_id}|${row.start_time}`));
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(parsed);
      date.setUTCDate(date.getUTCDate() + index);
      const key = date.toISOString().slice(0, 10);
      return {
        date: key,
        sessions: rows
          .filter(
            (row) =>
              row.date === key &&
              row.timetable_id &&
              (!row.cancelled || row.has_saved_attendance),
          )
          .map((row) => ({
            ...row,
            has_saved_attendance: Boolean(row.has_saved_attendance),
            cancelled: Boolean(row.cancelled),
            attendance_locked:
              this.isAttendanceLocked(key) || Boolean(row.cancelled),
            awaiting_confirmation: String(row.timetable_id).startsWith('held:'),
          })),
      };
    });
  }

  async getFacultyAcademicTimetableToday(
    facultyUserId: string,
    tenantId: string,
    deptId?: number | null,
    date = localDateString(),
  ) {
    const requestedDay = new Date(`${date}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(requestedDay.getTime()) ||
      requestedDay.toISOString().slice(0, 10) !== date
    ) {
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
        cancelled: boolean;
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
         ) AS has_saved_attendance,
         EXISTS (SELECT 1 FROM class_adjustments a
           WHERE a.tenant_id=t.tenant_id AND a.course_id=t.course_id
             AND a.faculty_user_id=t.faculty_user_id AND a.adjustment_type='CANCEL'
             AND a.status IN ('APPROVED','NOTIFIED')
             AND (a.new_date AT TIME ZONE 'Asia/Kolkata')::date=$5::date
             AND (a.new_date AT TIME ZONE 'Asia/Kolkata')::time=t.start_time) AS cancelled
       FROM academic_timetables t
       INNER JOIN faculty_courses fc ON fc.course_id = t.course_id
       INNER JOIN academic_courses c ON c.course_id = t.course_id AND c.tenant_id = t.tenant_id
       WHERE t.tenant_id = $1
         AND t.faculty_user_id = $2
         AND t.deleted_at IS NULL AND (t.valid_to IS NULL OR t.valid_to >= $5::date)
         AND (t.valid_from IS NULL OR t.valid_from <= $5::date)
         AND t.day_of_week = $4
         AND NOT EXISTS (
           SELECT 1 FROM academic_proxy_requests p
           WHERE p.tenant_id=t.tenant_id AND p.timetable_id=t.timetable_id
             AND p.date_of_proxy=$5::date AND p.status='APPROVED'
         )
         AND NOT EXISTS (
           SELECT 1 FROM academic_class_moves m
           WHERE m.tenant_id=t.tenant_id AND m.source_timetable_id=t.timetable_id
             AND m.source_date=$5::date AND m.status='APPROVED'
         )
       UNION ALL
       SELECT t.timetable_id::text, t.course_id, c.course_code, c.course_name,
         COALESCE(m.target_room,t.room),COALESCE(m.target_start_time,t.start_time),
         COALESCE(m.target_end_time,t.end_time),t.section,
         (UPPER(c.course_code) ~ '(P|LAB)$' OR c.course_name ILIKE '%practical%'
           OR c.course_name ILIKE '%lab%') AS is_practical,
         EXISTS (SELECT 1 FROM course_attendance_logs cal
           WHERE cal.tenant_id=t.tenant_id AND cal.course_id=t.course_id
             AND cal.faculty_user_id=t.faculty_user_id AND cal.timetable_id=t.timetable_id
             AND cal.date=$5::date) AS has_saved_attendance,
         EXISTS (SELECT 1 FROM class_adjustments a
           WHERE a.tenant_id=t.tenant_id AND a.course_id=t.course_id
             AND a.faculty_user_id=t.faculty_user_id AND a.adjustment_type='CANCEL'
             AND a.status IN ('APPROVED','NOTIFIED')
             AND (a.new_date AT TIME ZONE 'Asia/Kolkata')::date=$5::date
             AND (a.new_date AT TIME ZONE 'Asia/Kolkata')::time=COALESCE(m.target_start_time,t.start_time)) AS cancelled
       FROM academic_proxy_requests p
       JOIN academic_timetables t ON t.timetable_id=p.timetable_id AND t.tenant_id=p.tenant_id
         AND t.course_id=p.course_id AND t.faculty_user_id=p.absent_faculty_id
         AND t.deleted_at IS NULL
       LEFT JOIN academic_class_moves m ON m.tenant_id=p.tenant_id
         AND m.source_timetable_id=p.timetable_id AND m.target_date=$5::date
         AND m.status='APPROVED'
       JOIN academic_courses c ON c.course_id=t.course_id AND c.tenant_id=t.tenant_id
       WHERE p.tenant_id=$1 AND p.proxy_faculty_id=$2
         AND p.date_of_proxy=$5::date AND p.status='APPROVED'
         AND (t.valid_from IS NULL OR t.valid_from<=COALESCE(m.source_date,$5::date))
         AND (t.valid_to IS NULL OR t.valid_to>=COALESCE(m.source_date,$5::date))
       UNION ALL
       SELECT t.timetable_id::text, m.course_id, c.course_code, c.course_name,
         m.target_room, m.target_start_time, m.target_end_time, t.section,
         (UPPER(c.course_code) ~ '(P|LAB)$' OR c.course_name ILIKE '%practical%'
           OR c.course_name ILIKE '%lab%') AS is_practical,
         EXISTS (SELECT 1 FROM course_attendance_logs cal
           WHERE cal.tenant_id=m.tenant_id AND cal.course_id=m.course_id
             AND cal.faculty_user_id=m.original_faculty_id
             AND cal.timetable_id=m.source_timetable_id AND cal.date=m.target_date) AS has_saved_attendance,
         EXISTS (SELECT 1 FROM class_adjustments a
           WHERE a.tenant_id=m.tenant_id AND a.course_id=m.course_id
             AND a.faculty_user_id=m.original_faculty_id AND a.adjustment_type='CANCEL'
             AND a.status IN ('APPROVED','NOTIFIED')
             AND (a.new_date AT TIME ZONE 'Asia/Kolkata')::date=m.target_date
             AND (a.new_date AT TIME ZONE 'Asia/Kolkata')::time=m.target_start_time) AS cancelled
       FROM academic_class_moves m
       JOIN academic_timetables t ON t.timetable_id=m.source_timetable_id AND t.tenant_id=m.tenant_id
       JOIN academic_courses c ON c.course_id=m.course_id AND c.tenant_id=m.tenant_id
       WHERE m.tenant_id=$1 AND m.original_faculty_id=$2
         AND m.target_date=$5::date AND m.status='APPROVED'
         AND m.course_id IN (SELECT course_id FROM faculty_courses)
         AND NOT EXISTS (SELECT 1 FROM academic_proxy_requests p
           WHERE p.tenant_id=m.tenant_id AND p.timetable_id=m.source_timetable_id
             AND p.date_of_proxy=m.target_date AND p.status='APPROVED')
       UNION ALL
       SELECT 'extra:' || a.adjustment_id::text, a.course_id, c.course_code, c.course_name,
         a.proposed_room, (a.new_date AT TIME ZONE 'Asia/Kolkata')::time,
         ((a.new_date AT TIME ZONE 'Asia/Kolkata') + interval '1 hour')::time,
         NULL::text,
         -- Extra-class requests currently name a whole course, not a batch.
         false AS is_practical,
         EXISTS (SELECT 1 FROM course_attendance_logs cal
           WHERE cal.tenant_id=a.tenant_id AND cal.course_id=a.course_id
             AND cal.faculty_user_id=a.faculty_user_id
             AND cal.class_adjustment_id=a.adjustment_id) AS has_saved_attendance,
         false AS cancelled
       FROM class_adjustments a
       JOIN academic_courses c ON c.course_id=a.course_id AND c.tenant_id=a.tenant_id
       WHERE a.tenant_id=$1 AND a.faculty_user_id=$2
         AND a.adjustment_type='EXTRA_CLASS' AND a.status IN ('APPROVED','NOTIFIED')
         AND (a.new_date AT TIME ZONE 'Asia/Kolkata')::date=$5::date
         AND a.course_id IN (SELECT course_id FROM faculty_courses)
       UNION ALL
       SELECT 'held:' || e.source_key, e.course_id, c.course_code,c.course_name,e.entry->>'room',
         (e.entry->>'start')::time,(e.entry->>'end')::time,e.entry->>'batch',e.entry->>'session_type'='LAB',false,false
       FROM academic_timetable_source_entries e
       JOIN academic_timetable_publications p ON p.publication_id=e.publication_id AND p.state='ACTIVE' AND p.activated_on<=$5::date
       JOIN academic_courses c ON c.course_id=e.course_id AND c.tenant_id=e.tenant_id
       WHERE e.tenant_id=$1 AND $2::uuid=ANY(e.faculty_user_ids) AND e.state='HELD'
         AND (e.entry->>'day')::int=$4 AND e.course_id IN (SELECT course_id FROM faculty_courses)
       ORDER BY start_time`,
      [tenantId, facultyUserId, deptId ?? null, isoDay, date],
    );

    const cancellations = rows.length ? await this.dataSource.query<Array<{
      course_id: string; start_time: string;
    }>>(
      `SELECT DISTINCT course_id,
              to_char(new_date AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') AS start_time
       FROM class_adjustments
       WHERE tenant_id=$1 AND course_id=ANY($2::uuid[])
         AND adjustment_type='CANCEL' AND status IN ('APPROVED','NOTIFIED')
         AND (new_date AT TIME ZONE 'Asia/Kolkata')::date=$3::date`,
      [tenantId, [...new Set(rows.map(row => row.course_id))], date],
    ) : [];
    const cancelledSessions = new Set(cancellations.map(row => `${row.course_id}|${row.start_time}`));

    return Promise.all(
      rows
        .filter((row) => !row.cancelled || row.has_saved_attendance)
        .map(async (row) => ({
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
          cancelled: Boolean(row.cancelled),
          attendance_locked:
            this.isAttendanceLocked(date) || Boolean(row.cancelled),
          awaiting_confirmation: row.timetable_id.startsWith('held:'),
          student_count:
            row.timetable_id.startsWith('held:') ||
            (row.is_practical && !row.section)
              ? 0
              : (
                  await this.getCourseStudents(
                    row.course_id,
                    facultyUserId,
                    tenantId,
                    row.timetable_id,
                    date,
                  )
                ).length,
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
    const adjustmentId = extraClassId(timetableId);
    if (adjustmentId) {
      if (!date)
        throw new BadRequestException(
          'Date is required for an extra class roster',
        );
      await this.assertApprovedExtraClass(
        db,
        tenantId,
        courseId,
        facultyUserId,
        date,
        adjustmentId,
      );
      timetableId = undefined;
    }
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
    const requestedAcademicYear = academicYearKey(academicYearForDate(date));
    const currentAllocations = allocations.filter(
      (allocation) =>
        academicYearKey(allocation.academic_year) === requestedAcademicYear,
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
        if (
          !profile?.program ||
          (row.status === 'ENROLLED' && profile.status !== 'ACTIVE')
        ) {
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
      throw new ForbiddenException(
        'This is not an assigned, named practical batch',
      );
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
    const sectionCode = await this.facultyPracticalSlot(
      courseId,
      timetableId,
      facultyUserId,
      tenantId,
    );
    if (
      !Number.isInteger(expectedRevision) ||
      expectedRevision < 0 ||
      !Array.isArray(studentIds)
    ) {
      throw new BadRequestException(
        'If-Match revision and student_ids array are required',
      );
    }
    if (
      studentIds.some(
        (id) =>
          typeof id !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            id,
          ),
      )
    ) {
      throw new BadRequestException('Each student ID must be a UUID');
    }
    if (studentIds.length !== new Set(studentIds).size)
      throw new BadRequestException('Duplicate students in batch');
    return this.dataSource.transaction(async (manager) => {
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`practical:${tenantId}:${courseId}`]);
      const [batch] = await manager.query<Array<{ batch_id: string; revision: number }>>(
        `SELECT batch_id, revision FROM academic_practical_batches
         WHERE tenant_id = $1 AND course_id = $2 AND section_code = $3 FOR UPDATE`,
        [tenantId, courseId, sectionCode],
      );
      if ((batch?.revision ?? 0) !== expectedRevision)
        throw new ConflictException('Batch changed; refresh before saving');
      const enrolled = await manager.query<Array<{ student_user_id: string }>>(
        `SELECT student_user_id FROM student_course_enrollments
         WHERE tenant_id = $1 AND course_id = $2 AND status IN ('ENROLLED', 'COMPLETED', 'FAILED')`,
        [tenantId, courseId],
      );
      const valid = new Set(enrolled.map((row) => row.student_user_id));
      if (studentIds.some((id) => !valid.has(id)))
        throw new BadRequestException(
          'Batch contains a student outside this course',
        );
      const occupied = await manager.query<Array<{ student_user_id: string }>>(
        `SELECT m.student_user_id FROM academic_practical_batch_members m
         JOIN academic_practical_batches b ON b.batch_id = m.batch_id
         WHERE m.tenant_id = $1 AND m.course_id = $2 AND m.removed_at IS NULL
           AND b.section_code <> $3 AND m.student_user_id = ANY($4::uuid[])`,
        [tenantId, courseId, sectionCode, studentIds],
      );
      if (occupied.length)
        throw new ConflictException(
          'A student is already assigned to another practical batch',
        );
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
          throw new ConflictException(
            'Batch overlaps another confirmed class for a selected student',
          );
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
    const adjustmentId = extraClassId(timetableId);
    if (adjustmentId) {
      await this.assertApprovedExtraClass(this.dataSource, tenantId, courseId, facultyUserId, date, adjustmentId);
      await this.assertCanMarkAttendance(courseId, facultyUserId, tenantId);
      const access = await this.attendanceAccessState(
        tenantId,
        facultyUserId,
        courseId,
        date,
        timetableId,
      );
      const [saved] = await this.dataSource.query<
        Array<{ attendance_data: unknown }>
      >(
        `SELECT attendance_data FROM course_attendance_logs
         WHERE tenant_id=$1 AND course_id=$2 AND faculty_user_id=$3
           AND date=$4::date AND class_adjustment_id=$5::uuid`,
        [tenantId, courseId, facultyUserId, date, adjustmentId],
      );
      return {
        course_id: courseId,
        date,
        timetable_id: timetableId,
        ...access,
        attendance_data: saved?.attendance_data ?? null,
      };
    }
    if (timetableId && this.isAttendanceLocked(date)) {
      const [saved] = await this.dataSource.query(`SELECT cal.attendance_data FROM course_attendance_logs cal
        JOIN academic_timetables t ON t.timetable_id=cal.timetable_id AND t.tenant_id=cal.tenant_id
        WHERE cal.tenant_id=$1 AND cal.course_id=$2 AND cal.faculty_user_id=$3
          AND cal.timetable_id=$4::uuid AND cal.date=$5::date AND t.faculty_user_id=$3`,
        [tenantId, courseId, facultyUserId, timetableId, date],
      );
      if (Array.isArray(saved?.attendance_data)) {
        const access = await this.attendanceAccessState(
          tenantId,
          facultyUserId,
          courseId,
          date,
          timetableId,
        );
        return {
          course_id: courseId,
          date,
          timetable_id: timetableId,
          ...access,
          attendance_data: saved.attendance_data,
        };
      }
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

    const access = await this.attendanceAccessState(
      tenantId,
      facultyUserId,
      courseId,
      date,
      timetableId,
    );
    return {
      course_id: courseId,
      date,
      timetable_id: timetableId ?? null,
      ...access,
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
           AND NOT EXISTS (SELECT 1 FROM class_adjustments a
             WHERE a.tenant_id=t.tenant_id AND a.course_id=t.course_id
               AND a.faculty_user_id=t.faculty_user_id AND a.adjustment_type='CANCEL'
               AND a.status IN ('APPROVED','NOTIFIED')
               AND (a.new_date AT TIME ZONE 'Asia/Kolkata')::date=CURRENT_DATE
               AND (a.new_date AT TIME ZONE 'Asia/Kolkata')::time=t.start_time)
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

  async requestAttendanceUnlock(
    facultyUserId: string,
    tenantId: string,
    dto: {
      course_id?: string;
      date?: string;
      timetable_id?: string;
      reason?: string;
    },
  ) {
    const courseId = dto.course_id?.trim();
    const date = dto.date?.trim();
    const timetableId = dto.timetable_id?.trim();
    const reason = dto.reason?.trim();
    if (!courseId || !date || !timetableId || !reason || reason.length < 5) {
      throw new BadRequestException(
        'Course, class, date and a reason of at least 5 characters are required',
      );
    }
    const parsed = new Date(`${date}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date
    ) {
      throw new BadRequestException('date must be a valid YYYY-MM-DD value');
    }
    if (!this.isAttendanceLocked(date)) {
      throw new BadRequestException(
        'Attendance is still inside the normal marking window',
      );
    }
    if (timetableId.startsWith('held:')) {
      throw new BadRequestException(
        'Attendance cannot be unlocked for an unconfirmed class',
      );
    }

    const adjustmentId = extraClassId(timetableId);
    const regularId = adjustmentId ? null : timetableId;
    if (
      regularId &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        regularId,
      )
    ) {
      throw new BadRequestException('Choose a valid scheduled class');
    }
    if (adjustmentId) {
      await this.assertApprovedExtraClass(
        this.dataSource,
        tenantId,
        courseId,
        facultyUserId,
        date,
        adjustmentId,
      );
    }
    await this.assertCanMarkAttendance(
      courseId,
      facultyUserId,
      tenantId,
      date,
      regularId ?? undefined,
    );
    const effectiveFacultyId = await this.resolveAttendanceFacultyId(
      courseId,
      facultyUserId,
      tenantId,
      date,
      regularId ?? undefined,
    );

    const result = await this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `attendance-unlock:${tenantId}:${facultyUserId}:${date}:${timetableId}`,
      ]);
      if (regularId) {
        const [eligible] = await manager.query<Array<{ timetable_id: string }>>(
          `SELECT t.timetable_id FROM academic_timetables t
           LEFT JOIN academic_class_moves m ON m.tenant_id=t.tenant_id
             AND m.source_timetable_id=t.timetable_id AND m.status='APPROVED'
             AND (m.source_date=$4::date OR m.target_date=$4::date)
           WHERE t.tenant_id=$1 AND t.timetable_id=$2::uuid AND t.course_id=$3
             AND t.deleted_at IS NULL
             AND (t.valid_from IS NULL OR t.valid_from<=$4::date)
             AND (t.valid_to IS NULL OR t.valid_to>=$4::date)
             AND (t.faculty_user_id=$5::uuid OR EXISTS (
               SELECT 1 FROM academic_proxy_requests p
               WHERE p.tenant_id=t.tenant_id AND p.timetable_id=t.timetable_id
                 AND p.course_id=t.course_id AND p.proxy_faculty_id=$5::uuid
                 AND p.date_of_proxy=$4::date AND p.status='APPROVED'
             ))
             AND (m.target_date=$4::date OR (
               EXTRACT(ISODOW FROM $4::date)=t.day_of_week
               AND (m.move_id IS NULL OR NOT (
                 m.source_date=$4::date AND m.target_date<>$4::date
               ))
             ))
             AND NOT EXISTS (SELECT 1 FROM class_adjustments a
               WHERE a.tenant_id=t.tenant_id AND a.course_id=t.course_id
                 AND a.faculty_user_id=t.faculty_user_id
                 AND a.adjustment_type='CANCEL' AND a.status IN ('APPROVED','NOTIFIED')
                 AND (a.new_date AT TIME ZONE 'Asia/Kolkata')::date=$4::date
                 AND (a.new_date AT TIME ZONE 'Asia/Kolkata')::time=
                   COALESCE(CASE WHEN m.target_date=$4::date THEN m.target_start_time END,t.start_time))`,
          [tenantId, regularId, courseId, date, facultyUserId],
        );
        if (!eligible)
          throw new ForbiddenException(
            'This class is cancelled or is no longer scheduled',
          );
      }
      const [saved] = await manager.query<Array<{ log_id: string }>>(
        `SELECT log_id FROM course_attendance_logs
         WHERE tenant_id=$1 AND course_id=$2 AND faculty_user_id=$3 AND date=$4::date
           AND (($5::uuid IS NOT NULL AND timetable_id=$5::uuid)
             OR ($6::uuid IS NOT NULL AND class_adjustment_id=$6::uuid)) LIMIT 1`,
        [tenantId, courseId, effectiveFacultyId, date, regularId, adjustmentId],
      );
      if (saved)
        throw new BadRequestException(
          'Attendance already exists; this workflow only unlocks a missed session',
        );
      const [existing] = await manager.query<
        Array<{ request_id: string; status: string }>
      >(
        `SELECT request_id,status FROM academic_attendance_unlock_requests
         WHERE tenant_id=$1 AND faculty_user_id=$2 AND course_id=$3 AND class_date=$4::date
           AND (($5::uuid IS NOT NULL AND timetable_id=$5::uuid)
             OR ($6::uuid IS NOT NULL AND class_adjustment_id=$6::uuid))
            AND (status='PENDING' OR (status='APPROVED' AND unlocked_until>NOW()))
          ORDER BY requested_at DESC LIMIT 1`,
        [tenantId, facultyUserId, courseId, date, regularId, adjustmentId],
      );
      if (existing?.status === 'PENDING')
        return {
          request_id: existing.request_id,
          status: existing.status,
          created: false,
        };
      if (existing?.status === 'APPROVED') {
        throw new BadRequestException(
          'This class already has an approved attendance window',
        );
      }
      const [created] = await manager.query<
        Array<{ request_id: string; status: string }>
      >(
        `INSERT INTO academic_attendance_unlock_requests
          (tenant_id,faculty_user_id,course_id,timetable_id,class_adjustment_id,class_date,reason)
         VALUES ($1,$2,$3,$4::uuid,$5::uuid,$6::date,$7)
         RETURNING request_id,status`,
        [
          tenantId,
          facultyUserId,
          courseId,
          regularId,
          adjustmentId,
          date,
          reason,
        ],
      );
      await manager.query(
        `INSERT INTO academic_attendance_workflow_events
          (tenant_id,request_id,faculty_user_id,course_id,timetable_id,class_adjustment_id,
           class_date,event_type,actor_user_id,details)
         VALUES ($1,$2,$3,$4,$5::uuid,$6::uuid,$7::date,'REQUESTED',$3,$8::jsonb)`,
        [
          tenantId,
          created.request_id,
          facultyUserId,
          courseId,
          regularId,
          adjustmentId,
          date,
          JSON.stringify({ reason }),
        ],
      );
      return { ...created, created: true };
    });

    if (result.created && this.falconNotifications) {
      const [recipient] = await this.dataSource.query<
        Array<{ hod_user_id: string | null; course_code: string }>
      >(
        `SELECT d.hod_user_id,c.course_code FROM users f
         JOIN academic_courses c ON c.tenant_id=f.tenant_id AND c.course_id=$3
         LEFT JOIN departments d ON d.dept_id=f.dept_id
         WHERE f.tenant_id=$1 AND f.user_id=$2`,
        [tenantId, facultyUserId, courseId],
      );
      if (recipient?.hod_user_id) {
        await this.falconNotifications.create({
          tenantId,
          userId: recipient.hod_user_id,
          category: 'ACADEMICS',
          title: 'Attendance unlock approval needed',
          message: `${recipient.course_code} attendance for ${date} was missed and requires your decision.`,
          actionLink: '/hod/approvals/attendance-unlocks',
          actionLabel: 'Review request',
          severity: 'warning',
          intent: 'action_required',
          metadata: {
            request_id: result.request_id,
            course_id: courseId,
            class_date: date,
          },
        });
      }
    }
    return result;
  }

  async listHodAttendanceUnlockRequests(hodUserId: string, tenantId: string) {
    const [actor] = await this.dataSource.query<
      Array<{ dept_id: number | null; role_name: string }>
    >(
      `SELECT u.dept_id,r.role_name FROM users u JOIN roles r ON r.role_id=u.role_id
       WHERE u.tenant_id=$1 AND u.user_id=$2 AND u.is_active=true`,
      [tenantId, hodUserId],
    );
    if (!actor || !['HOD', 'SuperAdmin'].includes(actor.role_name)) {
      throw new ForbiddenException('HOD approval required');
    }
    return this.dataSource.query(
      `SELECT r.request_id,r.course_id,r.timetable_id,r.class_adjustment_id,
              r.class_date::text,r.reason,r.status,r.requested_at,
              c.course_code,c.course_name,f.name AS faculty_name,f.official_email AS faculty_email,
              COALESCE(t.section,'Whole course') AS section,
              COALESCE(t.start_time::text,(a.new_date AT TIME ZONE 'Asia/Kolkata')::time::text) AS start_time,
              COALESCE(t.end_time::text,((a.new_date AT TIME ZONE 'Asia/Kolkata')+INTERVAL '1 hour')::time::text) AS end_time
       FROM academic_attendance_unlock_requests r
       JOIN users f ON f.user_id=r.faculty_user_id AND f.tenant_id=r.tenant_id
       JOIN academic_courses c ON c.course_id=r.course_id AND c.tenant_id=r.tenant_id
       LEFT JOIN academic_timetables t ON t.timetable_id=r.timetable_id AND t.tenant_id=r.tenant_id
       LEFT JOIN class_adjustments a ON a.adjustment_id=r.class_adjustment_id AND a.tenant_id=r.tenant_id
       WHERE r.tenant_id=$1 AND r.status='PENDING'
         AND ($3::boolean OR f.dept_id=$2::int)
       ORDER BY r.requested_at ASC`,
      [tenantId, actor.dept_id, actor.role_name === 'SuperAdmin'],
    );
  }

  async decideAttendanceUnlock(
    hodUserId: string,
    tenantId: string,
    requestId: string,
    action: 'APPROVE' | 'REJECT',
    remarks?: string,
  ) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        requestId,
      ) ||
      !['APPROVE', 'REJECT'].includes(action)
    ) {
      throw new BadRequestException('Invalid attendance unlock decision');
    }
    if (action === 'REJECT' && (remarks?.trim().length ?? 0) < 3) {
      throw new BadRequestException(
        'A rejection reason of at least 3 characters is required',
      );
    }
    const minutes = this.attendanceUnlockMinutes();
    const decided = await this.dataSource.transaction(async (manager) => {
      const [actor] = await manager.query<
        Array<{ dept_id: number | null; role_name: string }>
      >(
        `SELECT u.dept_id,r.role_name FROM users u JOIN roles r ON r.role_id=u.role_id
         WHERE u.tenant_id=$1 AND u.user_id=$2 AND u.is_active=true`,
        [tenantId, hodUserId],
      );
      if (!actor || !['HOD', 'SuperAdmin'].includes(actor.role_name)) {
        throw new ForbiddenException('HOD approval required');
      }
      const [row] = await manager.query<
        Array<{
          request_id: string;
          faculty_user_id: string;
          faculty_dept_id: number | null;
          course_id: string;
          timetable_id: string | null;
          class_adjustment_id: string | null;
          course_code: string;
          class_date: string;
          status: string;
        }>
      >(
        `SELECT r.request_id,r.faculty_user_id,f.dept_id AS faculty_dept_id,
                r.course_id,r.timetable_id,r.class_adjustment_id,
                c.course_code,r.class_date::text,r.status
         FROM academic_attendance_unlock_requests r
         JOIN users f ON f.user_id=r.faculty_user_id AND f.tenant_id=r.tenant_id
         JOIN academic_courses c ON c.course_id=r.course_id AND c.tenant_id=r.tenant_id
         WHERE r.tenant_id=$1 AND r.request_id=$2::uuid FOR UPDATE OF r`,
        [tenantId, requestId],
      );
      if (!row)
        throw new NotFoundException('Attendance unlock request not found');
      if (row.status !== 'PENDING')
        throw new BadRequestException(
          'Attendance unlock request was already decided',
        );
      if (row.faculty_user_id === hodUserId)
        throw new ForbiddenException(
          'The requester cannot approve their own attendance unlock',
        );
      if (
        actor.role_name === 'HOD' &&
        Number(row.faculty_dept_id) !== Number(actor.dept_id)
      ) {
        throw new ForbiddenException(
          'HOD can decide only their department attendance requests',
        );
      }
      if (action === 'APPROVE') {
        const [saved] = await manager.query<Array<{ log_id: string }>>(
          `SELECT log_id FROM course_attendance_logs
           WHERE tenant_id=$1 AND course_id=$2 AND date=$3::date
             AND (($4::uuid IS NOT NULL AND timetable_id=$4::uuid)
               OR ($5::uuid IS NOT NULL AND class_adjustment_id=$5::uuid))
           LIMIT 1`,
          [
            tenantId,
            row.course_id,
            row.class_date,
            row.timetable_id,
            row.class_adjustment_id,
          ],
        );
        if (saved) {
          throw new BadRequestException(
            'Attendance was already submitted; the session cannot be unlocked',
          );
        }
        if (row.class_adjustment_id) {
          const [extra] = await manager.query<Array<{ adjustment_id: string }>>(
            `SELECT adjustment_id FROM class_adjustments
             WHERE tenant_id=$1 AND adjustment_id=$2::uuid AND course_id=$3
               AND faculty_user_id=$4 AND adjustment_type='EXTRA_CLASS'
               AND status IN ('APPROVED','NOTIFIED')
               AND (new_date AT TIME ZONE 'Asia/Kolkata')::date=$5::date`,
            [
              tenantId,
              row.class_adjustment_id,
              row.course_id,
              row.faculty_user_id,
              row.class_date,
            ],
          );
          if (!extra) {
            throw new BadRequestException(
              'The approved extra class is no longer eligible for attendance',
            );
          }
        } else if (row.timetable_id) {
          const [scheduled] = await manager.query<
            Array<{ timetable_id: string }>
          >(
            `SELECT t.timetable_id
             FROM academic_timetables t
             LEFT JOIN academic_class_moves m ON m.tenant_id=t.tenant_id
               AND m.source_timetable_id=t.timetable_id AND m.status='APPROVED'
               AND (m.source_date=$4::date OR m.target_date=$4::date)
             WHERE t.tenant_id=$1 AND t.timetable_id=$2::uuid AND t.course_id=$3
               AND t.deleted_at IS NULL
               AND (t.valid_from IS NULL OR t.valid_from<=$4::date)
               AND (t.valid_to IS NULL OR t.valid_to>=$4::date)
               AND (m.target_date=$4::date OR (
                 EXTRACT(ISODOW FROM $4::date)=t.day_of_week
                 AND (m.move_id IS NULL OR NOT (
                   m.source_date=$4::date AND m.target_date<>$4::date
                 ))
               ))
               AND NOT EXISTS (
                 SELECT 1 FROM class_adjustments a
                 WHERE a.tenant_id=t.tenant_id AND a.course_id=t.course_id
                   AND a.faculty_user_id=t.faculty_user_id
                   AND a.adjustment_type='CANCEL' AND a.status IN ('APPROVED','NOTIFIED')
                   AND (a.new_date AT TIME ZONE 'Asia/Kolkata')::date=$4::date
                   AND (a.new_date AT TIME ZONE 'Asia/Kolkata')::time=
                     COALESCE(CASE WHEN m.target_date=$4::date THEN m.target_start_time END,t.start_time)
               )
             LIMIT 1`,
            [tenantId, row.timetable_id, row.course_id, row.class_date],
          );
          if (!scheduled) {
            throw new BadRequestException(
              'The class is cancelled or no longer scheduled and cannot be unlocked',
            );
          }
        }
      }
      const [updated] = await manager.query<
        Array<{ unlocked_until: Date | null }>
      >(
        `UPDATE academic_attendance_unlock_requests
         SET status=$3::varchar,decided_at=NOW(),decided_by_user_id=$4,
             decision_remarks=$5,
             unlocked_until=CASE WHEN $3::varchar='APPROVED' THEN NOW()+($6::int*INTERVAL '1 minute') ELSE NULL END
         WHERE tenant_id=$1 AND request_id=$2::uuid
         RETURNING unlocked_until`,
        [
          tenantId,
          requestId,
          action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          hodUserId,
          remarks?.trim() || null,
          minutes,
        ],
      );
      await manager.query(
        `INSERT INTO academic_attendance_workflow_events
          (tenant_id,request_id,faculty_user_id,course_id,timetable_id,class_adjustment_id,
           class_date,event_type,actor_user_id,details)
         SELECT tenant_id,request_id,faculty_user_id,course_id,timetable_id,class_adjustment_id,
                class_date,$3,$4,$5::jsonb
         FROM academic_attendance_unlock_requests WHERE tenant_id=$1 AND request_id=$2::uuid`,
        [
          tenantId,
          requestId,
          action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          hodUserId,
          JSON.stringify({
            remarks: remarks?.trim() || null,
            unlock_minutes: action === 'APPROVE' ? minutes : null,
          }),
        ],
      );
      if (action === 'APPROVE') {
        await manager.query(
          `INSERT INTO academic_attendance_workflow_events
            (tenant_id,request_id,faculty_user_id,course_id,timetable_id,class_adjustment_id,
             class_date,event_type,actor_user_id,details)
           SELECT tenant_id,request_id,faculty_user_id,course_id,timetable_id,class_adjustment_id,
                  class_date,'UNLOCKED',$3,$4::jsonb
           FROM academic_attendance_unlock_requests WHERE tenant_id=$1 AND request_id=$2::uuid`,
          [
            tenantId,
            requestId,
            hodUserId,
            JSON.stringify({
              unlock_minutes: minutes,
              unlocked_until: updated?.unlocked_until ?? null,
            }),
          ],
        );
      }
      return {
        ...row,
        action,
        unlocked_until: updated?.unlocked_until ?? null,
      };
    });

    if (this.falconNotifications) {
      const approved = action === 'APPROVE';
      await this.falconNotifications.create({
        tenantId,
        userId: decided.faculty_user_id,
        category: 'ACADEMICS',
        title: approved
          ? 'Attendance marking temporarily unlocked'
          : 'Attendance unlock request rejected',
        message: approved
          ? `${decided.course_code} attendance for ${decided.class_date} is open for ${minutes} minutes. Complete it before the window closes.`
          : `${decided.course_code} attendance unlock was rejected${remarks?.trim() ? `: ${remarks.trim()}` : '.'}`,
        actionLink: '/faculty/attendance',
        actionLabel: approved ? 'Mark attendance now' : 'View attendance',
        severity: approved ? 'warning' : 'info',
        intent: approved ? 'action_required' : 'status_update',
        metadata: {
          request_id: requestId,
          unlocked_until: decided.unlocked_until,
        },
      });
    }
    return {
      request_id: requestId,
      status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      unlocked_until: decided.unlocked_until,
    };
  }

  async getAttendanceAnalytics(
    courseId: string,
    facultyUserId: string,
    tenantId: string,
    date = localDateString(),
    timetableId?: string,
  ) {
    const scopedRoster = timetableId
      ? await this.getCourseStudents(courseId, facultyUserId, tenantId, timetableId, date)
      : null;
    if (!timetableId) await this.assertFacultyTeachesCourse(courseId, facultyUserId, tenantId);
    const scopedIds = scopedRoster ? new Set(scopedRoster.map((row) => row.student_id)) : null;
    const [health] = await this.dataSource.query<
      Array<{
        scheduled_classes: string;
        conducted_classes: string;
        average_attendance_percent: string | null;
      }>
    >(
       `WITH day_slots AS (
         SELECT (
           (SELECT COUNT(*) FROM academic_timetables t
            WHERE t.tenant_id=$1 AND t.faculty_user_id=$3
              AND t.deleted_at IS NULL
              AND t.day_of_week=EXTRACT(ISODOW FROM $4::date)::int)
           +
           (SELECT COUNT(*) FROM class_adjustments a
            WHERE a.tenant_id=$1 AND a.faculty_user_id=$3
              AND a.adjustment_type='EXTRA_CLASS'
              AND a.status IN ('APPROVED','NOTIFIED')
              AND (a.new_date AT TIME ZONE 'Asia/Kolkata')::date=$4::date)
         )::int AS scheduled_classes
       ),
       day_conducted AS (
         SELECT COUNT(*)::int AS conducted_classes
         FROM course_attendance_logs cal
         WHERE cal.tenant_id = $1
           AND cal.faculty_user_id = $3
           AND cal.date = $4::date
           AND (cal.timetable_id IS NOT NULL OR cal.class_adjustment_id IS NOT NULL)
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
      defaulters: scopedIds
        ? defaulters.filter((row: { student_user_id: string }) => scopedIds.has(row.student_user_id))
        : defaulters,
      habitual_absentees: scopedIds
        ? habitualAbsentees.filter((row: { student_user_id: string }) => scopedIds.has(row.student_user_id))
        : habitualAbsentees,
    };
  }

  async exportAverageAttendance(
    courseId: string,
    facultyUserId: string,
    tenantId: string,
    date: string,
    timetableId: string,
  ) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) {
      throw new BadRequestException('date must be a valid YYYY-MM-DD value');
    }
    if (!timetableId?.trim()) {
      throw new BadRequestException(
        'Choose a scheduled class before exporting attendance',
      );
    }

    const roster = await this.getCourseStudents(
      courseId,
      facultyUserId,
      tenantId,
      timetableId,
      date,
    );
    const effectiveFacultyId = await this.resolveAttendanceFacultyId(
      courseId,
      facultyUserId,
      tenantId,
      date,
      extraClassId(timetableId) ? undefined : timetableId,
    );
    const [course] = await this.dataSource.query<
      Array<{ course_code: string; course_name: string }>
    >(
      `SELECT course_code,course_name FROM academic_courses
       WHERE tenant_id=$1 AND course_id=$2 LIMIT 1`,
      [tenantId, courseId],
    );
    if (!course) throw new NotFoundException('Course not found');

    const entries = await this.dataSource.query<
      Array<{ student_user_id: string; status: string }>
    >(
      `SELECT entry.value->>'student_id' AS student_user_id,
              UPPER(entry.value->>'status') AS status
       FROM course_attendance_logs cal
       CROSS JOIN LATERAL jsonb_array_elements(cal.attendance_data) entry(value)
       WHERE cal.tenant_id=$1 AND cal.course_id=$2
         AND cal.faculty_user_id=$3 AND cal.date<=$4::date
         AND cal.deleted_at IS NULL
       ORDER BY cal.date,cal.log_id`,
      [tenantId, courseId, effectiveFacultyId, date],
    );

    const counts = new Map<
      string,
      {
        recorded: number;
        present: number;
        absent: number;
        excused: number;
        late: number;
      }
    >();
    for (const row of entries) {
      const current = counts.get(row.student_user_id) ?? {
        recorded: 0,
        present: 0,
        absent: 0,
        excused: 0,
        late: 0,
      };
      current.recorded += 1;
      if (row.status === 'PRESENT') current.present += 1;
      else if (row.status === 'ABSENT') current.absent += 1;
      else if (row.status === 'EXCUSED') current.excused += 1;
      else if (row.status === 'LATE') current.late += 1;
      counts.set(row.student_user_id, current);
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Falcon Campus OS';
    workbook.created = new Date();
    workbook.calcProperties.fullCalcOnLoad = true;
    const sheet = workbook.addWorksheet('Average Attendance', {
      views: [{ state: 'frozen', ySplit: 7 }],
    });
    sheet.columns = [
      { key: 'serial', width: 8 },
      { key: 'roll_number', width: 20 },
      { key: 'name', width: 30 },
      { key: 'recorded', width: 18 },
      { key: 'present', width: 12 },
      { key: 'absent', width: 12 },
      { key: 'excused', width: 18 },
      { key: 'late', width: 10 },
      { key: 'average', width: 16 },
      { key: 'status', width: 22 },
    ];
    sheet.mergeCells('A1:J1');
    sheet.getCell('A1').value = 'Average Attendance Report';
    sheet.getCell('A2').value = 'Course';
    sheet.getCell('B2').value = `${course.course_code} — ${course.course_name}`;
    sheet.getCell('A3').value = 'As of date';
    sheet.getCell('B3').value = date;
    sheet.getCell('A4').value = 'Students';
    sheet.getCell('B4').value = roster.length;
    sheet.getCell('D4').value = 'Course average';
    sheet.getCell('A5').value = 'Attendance credit';
    sheet.getCell('B5').value =
      'Present, late and excused entries count as attended';

    const headerRowNumber = 7;
    const header = sheet.getRow(headerRowNumber);
    header.values = [
      'S.No.',
      'Enrollment / Roll No.',
      'Student Name',
      'Recorded Sessions',
      'Present',
      'Absent',
      'Leave / Excused',
      'Late',
      'Average Attendance %',
      'Status',
    ];

    const firstDataRow = headerRowNumber + 1;
    let creditedTotal = 0;
    let recordedTotal = 0;
    roster.forEach((student, index) => {
      const count = counts.get(student.student_id) ?? {
        recorded: 0,
        present: 0,
        absent: 0,
        excused: 0,
        late: 0,
      };
      const credited = count.present + count.excused + count.late;
      const average = count.recorded ? (credited / count.recorded) * 100 : 0;
      creditedTotal += credited;
      recordedTotal += count.recorded;
      const excelRow = firstDataRow + index;
      const row = sheet.getRow(excelRow);
      row.values = [
        index + 1,
        student.roll_number,
        student.name,
        count.recorded,
        count.present,
        count.absent,
        count.excused,
        count.late,
        {
          formula: `IF(D${excelRow}=0,0,(E${excelRow}+G${excelRow}+H${excelRow})/D${excelRow}*100)`,
          result: average,
        },
        count.recorded === 0
          ? 'No recorded sessions'
          : average < 75
            ? 'Below 75%'
            : '75% or above',
      ];
      row.getCell(9).numFmt = '0.00"%"';
    });

    const lastDataRow = Math.max(
      firstDataRow,
      firstDataRow + roster.length - 1,
    );
    const courseAverage = recordedTotal
      ? (creditedTotal / recordedTotal) * 100
      : 0;
    sheet.getCell('E4').value = roster.length
      ? {
          formula: `IF(SUM(D${firstDataRow}:D${lastDataRow})=0,0,(SUM(E${firstDataRow}:E${lastDataRow})+SUM(G${firstDataRow}:G${lastDataRow})+SUM(H${firstDataRow}:H${lastDataRow}))/SUM(D${firstDataRow}:D${lastDataRow})*100)`,
          result: courseAverage,
        }
      : 0;
    sheet.getCell('E4').numFmt = '0.00"%"';
    sheet.autoFilter = {
      from: { row: headerRowNumber, column: 1 },
      to: {
        row: Math.max(headerRowNumber, firstDataRow + roster.length - 1),
        column: 10,
      },
    };

    sheet.getCell('A1').font = {
      bold: true,
      size: 18,
      color: { argb: 'FF082A55' },
    };
    sheet.getCell('A1').alignment = { horizontal: 'center' };
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF082A55' },
    };
    header.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };
    header.height = 32;
    sheet.getRows(2, 4)?.forEach((row) => {
      row.getCell(1).font = { bold: true };
      row.getCell(4).font = { bold: true };
    });
    for (
      let rowNumber = firstDataRow;
      rowNumber < firstDataRow + roster.length;
      rowNumber += 1
    ) {
      const row = sheet.getRow(rowNumber);
      row.alignment = { vertical: 'middle' };
      if ((rowNumber - firstDataRow) % 2 === 1) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF4F7FB' },
        };
      }
    }

    const safeCode = course.course_code.replace(/[^A-Za-z0-9_-]+/g, '-');
    return {
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
      filename: `average-attendance-${safeCode}-${date}.xlsx`,
    };
  }

  async sendAttendanceWarnings(
    courseId: string,
    facultyUserId: string,
    tenantId: string,
    studentIds: string[],
    date: string,
    timetableId: string,
  ) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') ||
      Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ||
      new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
    ) {
      throw new BadRequestException('Choose a valid class date');
    }
    if (
      !timetableId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        timetableId,
      )
    ) {
      throw new BadRequestException(
        'Select a scheduled class before sending warnings',
      );
    }
    const scopedRoster = await this.getCourseStudents(courseId, facultyUserId, tenantId, timetableId, date);
    const allowed = new Set(scopedRoster.map((student) => student.student_id));
    const ids = [...new Set((studentIds ?? []).filter(Boolean))];
    if (!ids.length)
      throw new BadRequestException('Select at least one student');
    if (ids.some((id) => !allowed.has(id))) {
      throw new ForbiddenException(
        'Warnings can be sent only to students in this scheduled class',
      );
    }

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
         AND e.student_user_id = ANY($3::uuid[])
         AND e.status='ENROLLED' AND COALESCE(e.attendance_percent,0)<75`,
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
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.getUTCFullYear() < 1 ||
      parsedDate.toISOString().slice(0, 10) !== date
    ) {
      throw new BadRequestException('date must be a valid YYYY-MM-DD value');
    }
    if (dto.timetable_id?.startsWith('held:')) {
      throw new BadRequestException(
        'This class is awaiting department confirmation. Attendance cannot be recorded.',
      );
    }
    const adjustmentId = extraClassId(dto.timetable_id);
    const timetableId = adjustmentId ? null : dto.timetable_id ?? null;
    if (adjustmentId) {
      await this.assertApprovedExtraClass(this.dataSource, tenantId, dto.course_id, facultyUserId, date, adjustmentId);
    }
    if (!dto.timetable_id) {
      const [publication] = await this.dataSource.query(`SELECT EXISTS (
        SELECT 1 FROM academic_timetable_source_entries e
        JOIN academic_timetable_publications p ON p.publication_id=e.publication_id AND p.state='ACTIVE' AND p.activated_on<=$4::date
        WHERE e.tenant_id=$1 AND e.course_id=$2 AND $3::uuid=ANY(e.faculty_user_ids)
          AND e.state IN ('CONFIRMED','HELD')) AS requires_published_slot`, [tenantId,dto.course_id,facultyUserId,date]);
      if (publication?.requires_published_slot === true) {
        throw new BadRequestException(
          'Select a confirmed published timetable session to record attendance.',
        );
      }
    }
    await this.assertCanMarkAttendance(
      dto.course_id,
      facultyUserId,
      tenantId,
      date,
      timetableId ?? undefined,
    );
    const effectiveFacultyId = await this.resolveAttendanceFacultyId(
      dto.course_id,
      facultyUserId,
      tenantId,
      date,
      timetableId ?? undefined,
    );
    const unlock = this.isAttendanceLocked(date)
      ? await this.activeAttendanceUnlock(
          this.dataSource,
          tenantId,
          facultyUserId,
          dto.course_id,
          date,
          dto.timetable_id,
        )
      : null;
    if (this.isAttendanceLocked(date) && !unlock?.active) {
      throw new ForbiddenException(
        'Attendance locked. Request HOD approval to open a limited marking window.',
      );
    }
    if (!dto.attendance_data?.length) {
      throw new BadRequestException('Attendance data cannot be empty');
    }

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
      throw new ForbiddenException(
        'Attendance slot is not assigned to this faculty/course',
      );
    }
    const section = slotRows[0]?.is_practical
      ? slotRows[0]?.section?.trim() || null
      : null;
    if (slotRows[0]?.is_practical && !section) {
      throw new ForbiddenException(
        'Practical batch is not mapped to a student section',
      );
    }
    await this.dataSource.transaction(async (manager) => {
      if (adjustmentId) {
        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `class-move:${tenantId}:${date}`,
        ]);
        await this.assertApprovedExtraClass(
          manager,
          tenantId,
          dto.course_id,
          facultyUserId,
          date,
          adjustmentId,
        );
      }
      if (timetableId) {
        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `class-move:${tenantId}:${date}`,
        ]);
        const [effective] = await manager.query<
          Array<{
            day_of_week: number;
            valid_from: string | null;
            valid_to: string | null;
            source_date: string | null;
            target_date: string | null;
            occurrence_start_time: string;
          }>
        >(
          `SELECT t.day_of_week,t.valid_from::text AS valid_from,t.valid_to::text AS valid_to,
                  m.source_date::text AS source_date,m.target_date::text AS target_date,
                  COALESCE(CASE WHEN m.target_date=$4::date THEN m.target_start_time END,
                    t.start_time)::text AS occurrence_start_time
           FROM academic_timetables t
           LEFT JOIN academic_class_moves m ON m.tenant_id=t.tenant_id
             AND m.source_timetable_id=t.timetable_id AND m.status='APPROVED'
             AND (m.source_date=$4::date OR m.target_date=$4::date)
           WHERE t.tenant_id=$1 AND t.timetable_id=$2::uuid AND t.course_id=$3
             AND t.deleted_at IS NULL LIMIT 1`,
          [tenantId,timetableId,dto.course_id,date],
        );
        if (!effective) throw new ForbiddenException('Selected class is no longer scheduled');
        const [cancellation] = await manager.query<Array<{ cancelled: boolean }>>(
          `SELECT EXISTS (
             SELECT 1 FROM class_adjustments a
             JOIN academic_timetables t ON t.tenant_id=a.tenant_id AND t.course_id=a.course_id
             LEFT JOIN academic_class_moves m ON m.tenant_id=t.tenant_id
               AND m.source_timetable_id=t.timetable_id AND m.target_date=$4::date
               AND m.status='APPROVED'
             WHERE a.tenant_id=$1 AND t.timetable_id=$2::uuid AND a.course_id=$3
               AND a.adjustment_type='CANCEL' AND a.status IN ('APPROVED','NOTIFIED')
               AND (a.new_date AT TIME ZONE 'Asia/Kolkata')::date=$4::date
               AND (a.new_date AT TIME ZONE 'Asia/Kolkata')::time=COALESCE(m.target_start_time,t.start_time)
           ) AS cancelled`,
          [tenantId, timetableId, dto.course_id, date],
        );
        if (cancellation?.cancelled) {
          throw new ForbiddenException('This class was cancelled. Attendance cannot be recorded.');
        }
        const isoDay = new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
        if (effective.source_date === date && effective.target_date !== date) {
          throw new ForbiddenException('This class was moved to another date');
        }
        if (
          effective.target_date !== date &&
          (Number(effective.day_of_week) !== isoDay ||
            (effective.valid_from &&
              String(effective.valid_from).slice(0, 10) > date) ||
            (effective.valid_to &&
              String(effective.valid_to).slice(0, 10) < date))
        ) {
          throw new ForbiddenException(
            'Attendance must use the scheduled class date',
          );
        }
        const [cancelled] = await manager.query<
          Array<{ adjustment_id: string }>
        >(
          `SELECT adjustment_id FROM class_adjustments
           WHERE tenant_id=$1 AND course_id=$2 AND faculty_user_id=$3
             AND adjustment_type='CANCEL' AND status IN ('APPROVED','NOTIFIED')
             AND (new_date AT TIME ZONE 'Asia/Kolkata')::date=$4::date
             AND (new_date AT TIME ZONE 'Asia/Kolkata')::time=$5::time
           LIMIT 1`,
          [
            tenantId,
            dto.course_id,
            effectiveFacultyId,
            date,
            effective.occurrence_start_time,
          ],
        );
        if (cancelled) {
          throw new ForbiddenException(
            'This class was cancelled. Existing attendance is retained as read-only history.',
          );
        }
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
          throw new ForbiddenException(
            'This session is assigned to an approved substitute faculty',
          );
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
      const duplicate = submitted.find(
        (id, index) => submitted.indexOf(id) !== index,
      );
      if (duplicate)
        throw new BadRequestException('Attendance contains duplicate students');
      if (submitted.some((id) => !roster.has(id)))
        throw new BadRequestException(
          'Attendance contains students outside this scheduled batch',
        );
      if ([...roster].some((id) => !submitted.includes(id)))
        throw new BadRequestException(
          'Attendance must include every student in this scheduled batch',
        );
      // Serialize the exact slot/day so two browser tabs cannot overwrite a
      // practical batch with a stale roster.
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `${tenantId}:${dto.course_id}:${effectiveFacultyId}:${date}:${adjustmentId ?? timetableId ?? 'none'}`,
      ]);
      await manager.query(
        `DELETE FROM course_attendance_logs
         WHERE tenant_id = $1 AND course_id = $2 AND faculty_user_id = $3
           AND date = $4::date
           AND (($6::uuid IS NOT NULL AND class_adjustment_id=$6::uuid)
             OR ($6::uuid IS NULL AND class_adjustment_id IS NULL
               AND (($5::uuid IS NULL AND timetable_id IS NULL) OR timetable_id=$5::uuid)))`,
        [tenantId, dto.course_id, effectiveFacultyId, date, timetableId, adjustmentId],
      );
      await manager.query(
        `INSERT INTO course_attendance_logs (tenant_id, course_id, faculty_user_id, date,
           timetable_id, class_adjustment_id, attendance_data, marked_by_user_id)
         VALUES ($1, $2, $3, $4, $5::uuid, $6::uuid, $7::jsonb, $8::uuid)`,
        [
          tenantId,
          dto.course_id,
          effectiveFacultyId,
          date,
          timetableId,
          adjustmentId,
          JSON.stringify(dto.attendance_data),
          facultyUserId,
        ],
      );
      await manager.query(
        `INSERT INTO academic_attendance_workflow_events
          (tenant_id,request_id,faculty_user_id,course_id,timetable_id,class_adjustment_id,
           class_date,event_type,actor_user_id,details)
         VALUES ($1,$2::uuid,$3,$4,$5::uuid,$6::uuid,$7::date,$8,$9,$10::jsonb)`,
        [
          tenantId,
          unlock?.request_id ?? null,
          effectiveFacultyId,
          dto.course_id,
          timetableId,
          adjustmentId,
          date,
          unlock?.active ? 'ATTENDANCE_MODIFIED' : 'ATTENDANCE_SUBMITTED',
          facultyUserId,
          JSON.stringify({ student_count: dto.attendance_data.length }),
        ],
      );
      if (unlock?.active) {
        await manager.query(
          `UPDATE academic_attendance_unlock_requests
           SET status='APPLIED',applied_at=NOW()
           WHERE tenant_id=$1 AND request_id=$2::uuid AND status='APPROVED'
             AND unlocked_until>NOW()`,
          [tenantId, unlock.request_id],
        );
      }
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
    return Date.now() > this.attendanceMarkingDeadline(date).getTime();
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
