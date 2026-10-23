import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { isUUID } from 'class-validator';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { postgresQueryRows } from '../../common/postgres-query-rows';
import { SaveMarksDraftDto } from './dto/save-marks-draft.dto';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { DeanAuditService } from './dean-audit.service';
import { assertNoPendingSql } from '../../common/validators/pending-request.util';
import {
  GRADING_COMPONENT_CATALOG,
  GRADING_COMPONENT_IDS,
  getGradingComponentMax,
  isAutoSyncedExamType,
  isFacultyDirectGradingType,
  isKnownExamType,
  normalizeExamTypeForSave,
} from './grading-components';
import {
  ALLOCATION_WITH_DEPT_FROM,
  FacultyTeachingDepartmentsService,
} from './faculty-teaching-departments.service';
import { facultyAttendanceStatsCte } from './faculty-attendance-sql';

const LEGACY_EXAM_TYPES = [
  'CAT1',
  'CAT2',
  'QUIZ',
  'END_TERM',
  'INTERNAL',
  'ASSIGNMENT',
  'DA1',
  'DA2',
  'MTE1',
  'MTE2',
] as const;

const EXAM_TYPES = [
  ...new Set([...GRADING_COMPONENT_IDS, ...LEGACY_EXAM_TYPES]),
] as readonly string[];
type ExamType = string;

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
      AND t.deleted_at IS NULL
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

function publishedMarkStatsCte(tenantParam: string, courseParam?: string): string {
  return `published_mark_stats AS (
    SELECT m.tenant_id, m.course_id, m.student_user_id,
           COUNT(*)::int AS published_assessment_count,
           ROUND(
             100.0 * SUM(m.marks_obtained)::numeric / NULLIF(SUM(m.max_marks), 0),
             2
           )::float AS internal_avg_percent
    FROM academic_marks m
    WHERE m.tenant_id = ${tenantParam}
      ${courseParam ? `AND m.course_id = ${courseParam}` : ''}
      AND m.status = 'PUBLISHED'
      AND (to_jsonb(m)->>'deleted_at') IS NULL
      AND m.max_marks > 0
      AND m.marks_obtained BETWEEN 0 AND m.max_marks
      AND EXISTS (
        SELECT 1 FROM student_course_enrollments enrolled
        WHERE enrolled.tenant_id = m.tenant_id
          AND enrolled.course_id = m.course_id
          AND enrolled.student_user_id = m.student_user_id
          AND enrolled.status = 'ENROLLED'
          AND (to_jsonb(enrolled)->>'deleted_at') IS NULL
      )
    GROUP BY m.tenant_id, m.course_id, m.student_user_id
  )`;
}

@Injectable()
export class FacultyWorkspacesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly notify: NotificationEmitterService,
    private readonly teachingDepartments: FacultyTeachingDepartmentsService,
    private readonly deanAudit: DeanAuditService,
  ) {}

  async listFacultyCourses(
    facultyUserId: string,
    tenantId: string,
    deptId?: number | null,
    hodScope = false,
  ) {
    const hodDepartmentIds = hodScope
      ? await this.resolveHodDepartmentIds(facultyUserId)
      : [];
    if (hodDepartmentIds.length) {
      return this.dataSource.query(
        `WITH scoped_courses AS (
           SELECT DISTINCT
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
             ON c.course_id = a.course_id AND c.tenant_id = a.tenant_id
           LEFT JOIN users assigned ON assigned.user_id = a.faculty_user_id
           WHERE a.tenant_id = $1
             AND a.status = 'ACTIVE'
             AND a.course_id IS NOT NULL
             AND (
               assigned.dept_id = ANY($2::int[])
               OR EXISTS (
                 SELECT 1
                 FROM student_course_enrollments e
                 JOIN users student ON student.user_id = e.student_user_id
                 WHERE e.tenant_id = a.tenant_id
                   AND e.course_id = a.course_id
                   AND e.status IN ('ENROLLED', 'COMPLETED', 'FAILED')
                   AND student.dept_id = ANY($2::int[])
               )
             )
             AND ($3::int IS NULL OR assigned.dept_id = $3 OR EXISTS (
               SELECT 1
               FROM student_course_enrollments e2
               JOIN users student2 ON student2.user_id = e2.student_user_id
               WHERE e2.tenant_id = a.tenant_id AND e2.course_id = a.course_id
                 AND e2.status IN ('ENROLLED', 'COMPLETED', 'FAILED')
                 AND student2.dept_id = $3
             ))
           UNION
           SELECT DISTINCT
             NULL::uuid AS allocation_id,
             NULL::varchar AS program_name,
             NULL::varchar AS semester,
             NULL::varchar AS academic_year,
             c.course_id,
             c.course_code,
             c.course_name,
             c.credits
           FROM academic_courses c
           WHERE c.tenant_id = $1
             AND EXISTS (
               SELECT 1
               FROM student_course_enrollments e
               JOIN users student ON student.user_id = e.student_user_id
               WHERE e.tenant_id = c.tenant_id
                 AND e.course_id = c.course_id
                 AND e.status IN ('ENROLLED', 'COMPLETED', 'FAILED')
                 AND student.dept_id = ANY($2::int[])
                 AND ($3::int IS NULL OR student.dept_id = $3)
             )
         )
         SELECT * FROM scoped_courses
         ORDER BY academic_year DESC, program_name NULLS LAST,
                  semester NULLS LAST, course_code`,
        [tenantId, hodDepartmentIds, deptId ?? null],
      );
    }

    const fromAllocations =
      (await this.dataSource.query(
        `SELECT
         a.allocation_id,
         a.program_name,
         a.semester,
         a.academic_year,
         c.course_id,
         c.course_code,
         c.course_name,
         c.credits
       ${ALLOCATION_WITH_DEPT_FROM}
       WHERE a.tenant_id = $1
         AND a.faculty_user_id = $2
         AND a.status = 'ACTIVE'
         AND a.course_id IS NOT NULL
         AND ($3::int IS NULL OR COALESCE(p.dept_id, code_dept.dept_id, u.dept_id) = $3)
       ORDER BY a.academic_year DESC, a.program_name NULLS LAST, a.semester NULLS LAST, c.course_code`,
        [tenantId, facultyUserId, deptId ?? null],
      )) ?? [];
    if (fromAllocations.length) return fromAllocations;

    const fromTimetable =
      (await this.dataSource.query(
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
       WHERE c.tenant_id = $1
         AND t.faculty_user_id = $2
         AND t.deleted_at IS NULL
       ORDER BY c.course_code`,
        [tenantId, facultyUserId],
      )) ?? [];
    if (fromTimetable.length) return fromTimetable;

    return [];
  }

  private async resolveHodDepartmentIds(
    facultyUserId: string,
  ): Promise<number[]> {
    const rows = await this.dataSource.query<Array<{ dept_id: number }>>(
      `SELECT dept_id FROM departments WHERE hod_user_id = $1 AND deleted_at IS NULL
       UNION
       SELECT u.dept_id FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.user_id = $1 AND u.dept_id IS NOT NULL AND lower(r.role_name) = 'hod'`,
      [facultyUserId],
    );
    return [...new Set(rows.map((row) => Number(row.dept_id)).filter(Boolean))];
  }

  async getFacultyScheduleData(
    facultyUserId: string,
    tenantId: string,
    deptId?: number | null,
  ) {
    const hodDepartmentIds = await this.resolveHodDepartmentIds(facultyUserId);
    // ALLOCATION_WITH_DEPT_FROM already LEFT JOINs academic_courses AS c —
    // do not join `c` again (Postgres: table name "c" specified more than once).
    const allocations = hodDepartmentIds.length
      ? await this.dataSource.query(
          `SELECT DISTINCT
             a.allocation_id,
             c.course_id,
             c.course_code,
             c.course_name,
             u.user_id AS faculty_user_id,
             u.name AS faculty_name
           FROM academic_course_allocations a
           INNER JOIN users u ON u.user_id = a.faculty_user_id
           INNER JOIN academic_courses c ON c.course_id = a.course_id AND c.tenant_id = a.tenant_id
           WHERE a.tenant_id = $1
             AND a.status = 'ACTIVE'
             AND a.course_id IS NOT NULL
             AND (
               u.dept_id = ANY($2::int[])
               OR EXISTS (
                 SELECT 1
                 FROM student_course_enrollments e
                 JOIN users student ON student.user_id = e.student_user_id
                 WHERE e.tenant_id = a.tenant_id
                   AND e.course_id = a.course_id
                   AND e.status IN ('ENROLLED', 'COMPLETED', 'FAILED')
                   AND student.dept_id = ANY($2::int[])
               )
             )
             AND ($3::int IS NULL OR u.dept_id = $3)`,
          [tenantId, hodDepartmentIds, deptId ?? null],
        )
      : await this.dataSource.query(
          `SELECT
             a.allocation_id,
             c.course_id,
             c.course_code,
             c.course_name,
             u.user_id AS faculty_user_id,
             u.name AS faculty_name
           ${ALLOCATION_WITH_DEPT_FROM}
           WHERE a.tenant_id = $1
             AND a.faculty_user_id = $2
             AND a.status = 'ACTIVE'
             AND a.course_id IS NOT NULL
             AND c.course_id IS NOT NULL
             AND ($3::int IS NULL OR COALESCE(p.dept_id, code_dept.dept_id, u.dept_id) = $3)`,
          [tenantId, facultyUserId, deptId ?? null],
        );

    const timetables = hodDepartmentIds.length
      ? await this.dataSource.query(
          `SELECT
             t.timetable_id,
             t.course_id,
             t.faculty_user_id,
             c.course_code,
             c.course_name,
             u.name AS faculty_name,
             t.day_of_week,
             t.start_time,
             t.end_time,
             t.room,
             t.section
           FROM academic_timetables t
           INNER JOIN academic_courses c ON c.course_id = t.course_id AND c.tenant_id = t.tenant_id
           LEFT JOIN users u ON u.user_id = t.faculty_user_id
           WHERE t.tenant_id = $1
             AND t.deleted_at IS NULL
             AND (
               u.dept_id = ANY($2::int[])
               OR EXISTS (
                 SELECT 1
                 FROM student_course_enrollments e
                 JOIN users student ON student.user_id = e.student_user_id
                 WHERE e.tenant_id = t.tenant_id
                   AND e.course_id = t.course_id
                   AND e.status IN ('ENROLLED', 'COMPLETED', 'FAILED')
                   AND student.dept_id = ANY($2::int[])
               )
             )
             AND ($3::int IS NULL OR u.dept_id = $3)
           ORDER BY t.day_of_week, t.start_time, c.course_code`,
          [tenantId, hodDepartmentIds, deptId ?? null],
        )
      : await this.dataSource.query(
          `WITH ${this.teachingDepartments.facultyCoursesCte(3)}
           SELECT
             t.timetable_id,
             t.course_id,
             $2::uuid AS faculty_user_id,
             c.course_code,
             c.course_name,
             u.name AS faculty_name,
             t.day_of_week,
             t.start_time,
             t.end_time,
             t.room,
             t.section
           FROM academic_timetables t
           INNER JOIN faculty_courses fc ON fc.course_id = t.course_id
           INNER JOIN academic_courses c ON c.course_id = t.course_id
           LEFT JOIN users u ON u.user_id = $2
           WHERE t.tenant_id = $1 AND t.deleted_at IS NULL`,
          [tenantId, facultyUserId, deptId ?? null],
        );

    const faculty = await this.dataSource.query(
      `SELECT user_id, name FROM users WHERE user_id = $1`,
      [facultyUserId],
    );

    return { allocations, timetables, faculty };
  }

  async scheduleTimetableSlotBatch(
    facultyUserId: string,
    tenantId: string,
    dto: { slots: Array<any> },
  ) {
    if (!Array.isArray(dto?.slots)) {
      throw new BadRequestException('Timetable slots must be an array');
    }
    const isUuid = (value: unknown) =>
      typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value.trim(),
      );

    const normalizeTime = (value: unknown) => {
      const raw = String(value ?? '').trim();
      if (!/^\d{1,2}:\d{2}(?::\d{2})?$/.test(raw)) return raw;
      const parts = raw.split(':');
      if (parts.length < 2) return raw;
      const hour = (parts[0] ?? '00').padStart(2, '0');
      const minute = (parts[1] ?? '00').padStart(2, '0');
      const second = (parts[2] ?? '00').padStart(2, '0').slice(0, 2);
      return `${hour}:${minute}:${second}`;
    };

    const timeToMinutes = (value: string) => {
      const match = /^(\d{2}):(\d{2}):(\d{2})$/.exec(value);
      if (!match) return Number.NaN;
      const hour = Number(match[1]);
      const minute = Number(match[2]);
      const second = Number(match[3]);
      if (hour > 23 || minute > 59 || second > 59) return Number.NaN;
      return hour * 3600 + minute * 60 + second;
    };

    const overlaps = (left: any, right: any) =>
      left.day_of_week === right.day_of_week &&
      timeToMinutes(left.start_time) < timeToMinutes(right.end_time) &&
      timeToMinutes(left.end_time) > timeToMinutes(right.start_time);

    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();

    try {
      await runner.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
        [`timetable:${tenantId}`],
      );
      const slots = dto.slots.map((slot) => {
        if (!slot || typeof slot.course_id !== 'string') {
          throw new BadRequestException(
            'Every slot requires a valid course ID',
          );
        }
        // Faculty identity comes from authentication, never from the payload.
        if (slot.faculty_user_id && slot.faculty_user_id !== facultyUserId) {
          throw new BadRequestException(
            'Cannot schedule another faculty member',
          );
        }
        return {
          ...slot,
          faculty_user_id: facultyUserId,
          course_id: String(slot.course_id).trim(),
          day_of_week: Number(slot.day_of_week),
          start_time: normalizeTime(slot.start_time),
          end_time: normalizeTime(slot.end_time),
          room: slot.room ? String(slot.room).trim() : null,
          section: slot.section ? String(slot.section).trim() || 'A' : 'A',
        };
      });

      for (const slot of slots) {
        if (!isUuid(slot.course_id)) {
          throw new BadRequestException(
            `Invalid course id "${slot.course_id}". Demo/sample courses cannot be saved to the live timetable.`,
          );
        }
        if (
          !Number.isInteger(slot.day_of_week) ||
          slot.day_of_week < 1 ||
          slot.day_of_week > 7
        ) {
          throw new BadRequestException(
            `Invalid day_of_week for course ${slot.course_id}`,
          );
        }
        if (!slot.start_time || !slot.end_time) {
          throw new BadRequestException('Start time and end time are required');
        }
        const startMinutes = timeToMinutes(slot.start_time);
        const endMinutes = timeToMinutes(slot.end_time);
        if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) {
          throw new BadRequestException(
            `Invalid time for course ${slot.course_id}; use HH:MM or HH:MM:SS`,
          );
        }
        if (startMinutes >= endMinutes) {
          throw new BadRequestException('Start time must be before end time');
        }
      }

      for (let index = 0; index < slots.length; index += 1) {
        const slot = slots[index];
        for (
          let otherIndex = index + 1;
          otherIndex < slots.length;
          otherIndex += 1
        ) {
          const other = slots[otherIndex];
          if (overlaps(slot, other)) {
            const sameFaculty =
              !slot.faculty_user_id ||
              !other.faculty_user_id ||
              slot.faculty_user_id === other.faculty_user_id;
            if (sameFaculty) {
              throw new BadRequestException(
                `Slot conflict detected on day ${slot.day_of_week}: ${slot.start_time.slice(0, 5)} - ${slot.end_time.slice(0, 5)}`,
              );
            }
          }
        }
      }

      const facultySlotKeys = new Set<string>();
      for (const slot of slots) {
        const key = `${slot.day_of_week}|${slot.start_time}|${slot.end_time}|${slot.faculty_user_id ?? facultyUserId}`;
        if (facultySlotKeys.has(key)) {
          throw new BadRequestException(
            `You cannot teach two classes at ${slot.start_time} - ${slot.end_time} on day ${slot.day_of_week}`,
          );
        }
        facultySlotKeys.add(key);
      }

      for (const slot of slots) {
        // Ensure the course exists and is allocated to this faculty (or already taught by them).
        const allowed = await runner.query(
          `SELECT 1
           FROM academic_courses c
           WHERE c.tenant_id = $1
             AND c.course_id = $2::uuid
             AND c.deleted_at IS NULL
             AND (
               EXISTS (
                 SELECT 1
                 FROM academic_course_allocations a
                 WHERE a.tenant_id = c.tenant_id
                   AND a.course_id = c.course_id
                   AND a.faculty_user_id = $3
                   AND a.status = 'ACTIVE'
               )
               OR EXISTS (
                 SELECT 1
                 FROM academic_timetables t
                 WHERE t.tenant_id = c.tenant_id
                   AND t.course_id = c.course_id
                   AND t.faculty_user_id = $3
                   AND t.deleted_at IS NULL
               )
             )
           LIMIT 1`,
          [tenantId, slot.course_id, facultyUserId],
        );
        if (!allowed.length) {
          throw new BadRequestException(
            `Course ${slot.course_id} is not allocated to you, so it cannot be scheduled.`,
          );
        }
      }

      // Validate permission before archiving current rows; never use historical
      // teaching assignments to authorize a new schedule.
      await runner.query(
        `UPDATE academic_timetables SET deleted_at = NOW()
         WHERE tenant_id = $1 AND faculty_user_id = $2 AND deleted_at IS NULL`,
        [tenantId, facultyUserId],
      );

      for (const slot of slots) {
        const params: any[] = [
          tenantId,
          slot.day_of_week,
          slot.start_time,
          slot.end_time,
          facultyUserId,
          slot.course_id,
          slot.section || 'A',
        ];

        let conflictQuery = `
          SELECT 1 FROM academic_timetables t
          WHERE t.tenant_id = $1
            AND t.deleted_at IS NULL
            AND t.day_of_week = $2
            AND t.start_time < $4
            AND t.end_time > $3
            AND (
              t.faculty_user_id = $5
              OR (t.course_id = $6::uuid AND t.section = $7)
              OR EXISTS (
                SELECT 1
                FROM academic_course_allocations alloc_existing
                INNER JOIN academic_course_allocations alloc_new
                  ON alloc_new.tenant_id = alloc_existing.tenant_id
                 AND alloc_new.course_id = $6::uuid
                 AND alloc_new.faculty_user_id = $5
                 AND alloc_new.status = 'ACTIVE'
                WHERE alloc_existing.tenant_id = t.tenant_id
                  AND alloc_existing.course_id = t.course_id
                  AND alloc_existing.status = 'ACTIVE'
                  AND alloc_existing.program_name = alloc_new.program_name
                  AND alloc_existing.semester = alloc_new.semester
                  AND t.section = $7
              )
        `;

        if (slot.room) {
          conflictQuery += ` OR (t.room = $8 AND t.room IS NOT NULL AND t.room != '')`;
          params.push(slot.room);
        }
        conflictQuery += ` ) LIMIT 1`;

        const conflicts = await runner.query(conflictQuery, params);
        if (conflicts.length > 0) {
          throw new BadRequestException(
            `Slot conflict detected for ${String(slot.start_time).slice(0, 5)} - ${String(slot.end_time).slice(0, 5)} on day ${slot.day_of_week}. Choose another time or room.`,
          );
        }

        await runner.query(
          `INSERT INTO academic_timetables (
             timetable_id, tenant_id, course_id, day_of_week, start_time, end_time, room, faculty_user_id, section, deleted_at
           ) VALUES (
             gen_random_uuid(), $1, $2::uuid, $3, $4::time, $5::time, $6, $7, $8, NULL
           )`,
          [
            tenantId,
            slot.course_id,
            slot.day_of_week,
            slot.start_time,
            slot.end_time,
            slot.room || null,
            facultyUserId,
            slot.section || 'A',
          ],
        );
      }

      await runner.commitTransaction();
      return { success: true, saved: slots.length };
    } catch (error) {
      await runner.rollbackTransaction();
      if (error instanceof BadRequestException) throw error;
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to save timetable slots';
      // Surface common Postgres errors as 400 instead of opaque 500s.
      if (/uuid|foreign key|violates|invalid input/i.test(message)) {
        throw new BadRequestException(
          'Could not save timetable. Use allocated live courses (not demo sample IDs) and resolve any conflicts.',
        );
      }
      const errorCode =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: unknown }).code ?? '')
          : '';
      if (errorCode === '23P01' || errorCode === '23505') {
        throw new BadRequestException(
          'Timetable slot conflicts with another saved slot. Refresh the schedule and choose another time.',
        );
      }
      if (errorCode === '42703' || errorCode === '42P01') {
        throw new BadRequestException(
          'Timetable storage is not migrated. Run the latest database migrations and retry.',
        );
      }
      throw error;
    } finally {
      await runner.release();
    }
  }

  async getAvailableRoomsForSlot(
    tenantId: string,
    dayOfWeek: number,
    startTime: string,
    endTime: string,
  ) {
    // 1. Fetch all classroom spaces
    const spaces = await this.dataSource.query(
      `SELECT space_id, building_name, room_number, capacity, facilities, status
       FROM campus_spaces
       WHERE tenant_id = $1 AND space_type = 'CLASSROOM' AND status = 'AVAILABLE'
       ORDER BY building_name, room_number`,
      [tenantId],
    );

    // 2. Fetch occupied rooms for this specific time slot
    const occupied = await this.dataSource.query(
      `SELECT DISTINCT room
       FROM academic_timetables
       WHERE tenant_id = $1
         AND deleted_at IS NULL
         AND day_of_week = $2
         AND start_time < $4
         AND end_time > $3
         AND room IS NOT NULL AND room != ''`,
      [tenantId, dayOfWeek, startTime, endTime],
    );

    const occupiedRoomSet = new Set(occupied.map((o) => o.room));

    // 3. Map spaces to availability
    return spaces.map((space) => {
      const roomName = `${space.building_name} - ${space.room_number}`;
      return {
        ...space,
        roomName,
        available: !occupiedRoomSet.has(roomName),
      };
    });
  }

  async getWeeklyTimetable(
    facultyUserId: string,
    tenantId: string,
    deptId?: number | null,
  ) {
    const hodDepartmentIds = await this.resolveHodDepartmentIds(facultyUserId);
    if (hodDepartmentIds.length) {
      return this.dataSource.query(
        `SELECT
           t.timetable_id,
           t.day_of_week,
           t.start_time,
           t.end_time,
           t.room,
           c.course_id,
           c.course_code,
           c.course_name
         FROM academic_timetables t
         INNER JOIN academic_courses c ON c.course_id = t.course_id AND c.tenant_id = t.tenant_id
         LEFT JOIN users u ON u.user_id = t.faculty_user_id
         WHERE t.tenant_id = $1
           AND t.deleted_at IS NULL
           AND (
             u.dept_id = ANY($2::int[])
             OR EXISTS (
               SELECT 1
               FROM student_course_enrollments e
               JOIN users student ON student.user_id = e.student_user_id
               WHERE e.tenant_id = t.tenant_id
                 AND e.course_id = t.course_id
                 AND e.status IN ('ENROLLED', 'COMPLETED', 'FAILED')
                 AND student.dept_id = ANY($2::int[])
             )
           )
           AND ($3::int IS NULL OR u.dept_id = $3)
         ORDER BY t.day_of_week, t.start_time, c.course_code`,
        [tenantId, hodDepartmentIds, deptId ?? null],
      );
    }
    return this.dataSource.query(
      `WITH ${this.teachingDepartments.facultyCoursesCte(3)}
       SELECT
         t.timetable_id,
         t.day_of_week,
         t.start_time,
         t.end_time,
         t.room,
         c.course_id,
         c.course_code,
         c.course_name
       FROM academic_timetables t
       INNER JOIN faculty_courses fc ON fc.course_id = t.course_id
       INNER JOIN academic_courses c ON c.course_id = t.course_id AND c.tenant_id = t.tenant_id
       WHERE t.tenant_id = $1
         AND t.deleted_at IS NULL
       ORDER BY t.day_of_week, t.start_time, c.course_code`,
      [tenantId, facultyUserId, deptId ?? null],
    );
  }

  async getTimetableStats(
    facultyUserId: string,
    tenantId: string,
    deptId?: number | null,
  ) {
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
       ${this.teachingDepartments.facultyCoursesCte(3)},
       faculty_slots AS (
         SELECT
           t.timetable_id,
           t.course_id,
           t.day_of_week,
           t.start_time,
           t.end_time
         FROM academic_timetables t
         INNER JOIN faculty_courses fc ON fc.course_id = t.course_id
         WHERE t.tenant_id = $1
           AND t.deleted_at IS NULL
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
         (SELECT COUNT(DISTINCT course_id)::text FROM faculty_courses) AS courses_taught,
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
      [tenantId, facultyUserId, deptId ?? null],
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
       ${this.teachingDepartments.facultyCoursesCte(3)},
       course_slots AS (
         SELECT
           t.course_id,
           c.course_code,
           c.course_name,
           t.day_of_week
         FROM academic_timetables t
         INNER JOIN faculty_courses fc ON fc.course_id = t.course_id
         INNER JOIN academic_courses c ON c.course_id = t.course_id AND c.tenant_id = t.tenant_id
         WHERE t.tenant_id = $1
           AND t.deleted_at IS NULL
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
      [tenantId, facultyUserId, deptId ?? null],
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
    dto: SaveMarksDraftDto,
  ) {
    const examType = normalizeExamTypeForSave(
      String(dto.exam_type ?? dto.examType ?? '').trim(),
    );
    if (!examType || !isKnownExamType(examType)) {
      throw new BadRequestException(
        `Invalid exam_type: ${dto.exam_type ?? dto.examType ?? '(missing)'}`,
      );
    }
    if (isAutoSyncedExamType(examType)) {
      throw new BadRequestException(
        `${examType} is auto-synced from exams and cannot be entered manually`,
      );
    }
    await this.assertFacultyOwnsCourse(facultyUserId, tenantId, dto.course_id);
    const isDirectPublish = examType === 'QUIZ';
    const needsExamCellSession =
      !isDirectPublish && !isFacultyDirectGradingType(examType);

    if (needsExamCellSession) {
      const session = await this.getResultSession(
        tenantId,
        dto.course_id,
        examType,
      );
      this.assertFacultyEntryAllowed(session);
    }

    if (!isDirectPublish) {
      const locked = await this.dataSource.query(
        `SELECT 1 FROM academic_marks
         WHERE tenant_id = $1 AND course_id = $2 AND exam_type = $3
           AND status IN ('PENDING_COE', 'PUBLISHED') LIMIT 1`,
        [tenantId, dto.course_id, examType],
      );
      if (locked[0]) {
        throw new ForbiddenException(
          'Submitted marks are locked. Contact Exam Cell to reopen entry.',
        );
      }
    }
    const maxMarks = getGradingComponentMax(examType) ?? dto.max_marks;
    if (!Number.isFinite(maxMarks) || maxMarks <= 0 || !dto.entries.length) {
      throw new BadRequestException(
        'Provide a valid maximum and at least one student mark',
      );
    }
    const studentIds = dto.entries.map((entry) =>
      entry.student_user_id.toLowerCase(),
    );
    if (new Set(studentIds).size !== studentIds.length) {
      throw new BadRequestException(
        'Each student can appear only once in a marks draft',
      );
    }
    for (const entry of dto.entries) {
      if (!Number.isFinite(entry.marks_obtained)) {
        throw new BadRequestException('Marks must be a finite number');
      }
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
        examType,
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
      await this.dataSource.transaction(async (manager) => {
        const enrolled = await manager.query<Array<{ student_user_id: string }>>(
          `SELECT student_user_id FROM student_course_enrollments
           WHERE tenant_id = $1 AND course_id = $2 AND status = 'ENROLLED'
             AND (to_jsonb(student_course_enrollments)->>'deleted_at') IS NULL
             AND student_user_id = ANY($3::uuid[]) FOR SHARE`,
          [tenantId, dto.course_id, studentIds],
        );
        const enrolledIds = new Set(enrolled.map((row) => row.student_user_id));
        if (studentIds.some((id) => !enrolledIds.has(id))) {
          throw new ForbiddenException(
            'Marks can be saved only for students currently enrolled in this course',
          );
        }
        const result = await manager.query(
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
             WHEN EXCLUDED.exam_type = 'QUIZ' THEN 'DRAFT'
             WHEN academic_marks.status IN ('PENDING_COE', 'PUBLISHED') THEN academic_marks.status
             ELSE 'DRAFT'
           END,
           uploaded_by = EXCLUDED.uploaded_by,
           updated_at = NOW()
         WHERE ${isDirectPublish ? "academic_marks.exam_type = 'QUIZ'" : "academic_marks.status NOT IN ('PENDING_COE', 'PUBLISHED')"}
         RETURNING student_user_id`,
          params,
        );
        if (
          postgresQueryRows<{ student_user_id: string }>(result).length !==
          studentIds.length
        ) {
          throw new ForbiddenException(
            'Submitted marks are locked. Reload the roster before saving again.',
          );
        }
      });
    }
    return { saved: dto.entries.length, status: 'DRAFT' };
  }

  async publishMarks(
    facultyUserId: string,
    tenantId: string,
    courseId: string,
    examTypeInput: string,
  ) {
    const examType = normalizeExamTypeForSave(
      String(examTypeInput ?? '').trim(),
    );
    if (!examType || !isKnownExamType(examType)) {
      throw new BadRequestException(`Invalid exam_type: ${examTypeInput}`);
    }
    await this.assertFacultyOwnsCourse(facultyUserId, tenantId, courseId);
    const isDirectPublish = examType === 'QUIZ';
    const needsExamCellSession =
      !isDirectPublish && !isFacultyDirectGradingType(examType);
    if (needsExamCellSession) {
      const session = await this.getResultSession(tenantId, courseId, examType);
      this.assertFacultyEntryAllowed(session);
    }
    const targetStatus = isDirectPublish ? 'PUBLISHED' : 'PENDING_COE';
    const statusCondition = isDirectPublish
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

    let notified_count = 0;
    if (targetStatus === 'PUBLISHED') {
      notified_count = await this.notifyMarksPublishedToStudents(
        tenantId,
        courseId,
        courseName,
        examType,
      );
    }

    return {
      published: publishedCount,
      status: targetStatus,
      course_name: courseName,
      notified_count,
      message:
        targetStatus === 'PENDING_COE'
          ? 'Marks submitted to Exam Cell (PENDING_COE). Students are notified after COE publishes.'
          : 'Marks published to students.',
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
       RETURNING mark_id, exam_type`,
      [tenantId, courseId, facultyUserId],
    );

    const rows = Array.isArray(result)
      ? ((Array.isArray(result[0]) ? result[0] : result) as Array<{
          mark_id: string;
          exam_type: string;
        }>)
      : [];
    const publishedCount = rows.length;

    const courseRows = await this.dataSource.query<
      Array<{ course_name: string }>
    >(
      `SELECT course_name FROM academic_courses WHERE course_id = $1 AND tenant_id = $2 LIMIT 1`,
      [courseId, tenantId],
    );
    const courseName = courseRows[0]?.course_name ?? 'your course';
    const examTypes = [
      ...new Set(rows.map((r) => r.exam_type).filter(Boolean)),
    ];

    let notified_count = 0;
    for (const examType of examTypes) {
      notified_count += await this.notifyMarksPublishedToStudents(
        tenantId,
        courseId,
        courseName,
        examType,
      );
    }

    return {
      published: publishedCount,
      status: 'PUBLISHED',
      notified_count,
      course_name: courseName,
    };
  }

  async getUnifiedCourseMarks(
    facultyUserId: string,
    tenantId: string,
    courseId: string,
    _components?: string[],
  ) {
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
        const normalizedType = this.normalizeExamTypeForDisplay(r.exam_type);
        s.marks[normalizedType] = {
          obtained: r.marks_obtained != null ? Number(r.marks_obtained) : null,
          status: r.mark_status,
          source: 'academic_marks',
        };
      }
    }

    await this.mergeAutoSyncedMarks(tenantId, courseId, studentsMap);

    return Array.from(studentsMap.values());
  }

  private normalizeExamTypeForDisplay(examType: string) {
    if (examType === 'MTE1') return 'MT1';
    if (examType === 'MTE2') return 'MT2';
    return examType;
  }

  private applyAutoMark(
    studentsMap: Map<string, any>,
    studentUserId: string,
    examType: string,
    marksObtained: number | null,
    status = 'PUBLISHED',
  ) {
    const student = studentsMap.get(studentUserId);
    if (!student || marksObtained == null) return;
    const normalizedType = this.normalizeExamTypeForDisplay(examType);
    const existing = student.marks[normalizedType];
    if (existing?.obtained != null && existing?.source === 'academic_marks') {
      return;
    }
    student.marks[normalizedType] = {
      obtained: Number(marksObtained),
      status,
      source: 'auto_sync',
    };
  }

  private async mergeAutoSyncedMarks(
    tenantId: string,
    courseId: string,
    studentsMap: Map<string, any>,
  ) {
    const wtRows = await this.dataSource
      .query<
        Array<{
          student_user_id: string;
          exam_type: string;
          marks_obtained: string | number;
        }>
      >(
        `SELECT r.student_user_id, t.test_type AS exam_type, r.score AS marks_obtained
         FROM weekly_tests t
         INNER JOIN weekly_test_responses r ON r.test_id = t.test_id
         WHERE t.tenant_id = $1
           AND t.course_id = $2
           AND t.test_type IN ('WT1', 'WT2')
           AND r.submitted_at IS NOT NULL`,
        [tenantId, courseId],
      )
      .catch(() => []);

    for (const row of wtRows) {
      this.applyAutoMark(
        studentsMap,
        row.student_user_id,
        row.exam_type,
        row.marks_obtained != null ? Number(row.marks_obtained) : null,
      );
    }
  }

  async listGradingComponents() {
    return GRADING_COMPONENT_CATALOG;
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

    if (!dto.new_date?.trim()) {
      throw new BadRequestException(
        'Please provide a valid date and time for the schedule change',
      );
    }

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

    // Notify department HoD so the request appears in Extra Class Approvals inbox.
    const metaRows = await this.dataSource.query<
      Array<{
        hod_user_id: string | null;
        faculty_name: string | null;
        course_code: string | null;
        dept_name: string | null;
      }>
    >(
      `SELECT d.hod_user_id,
              u.name AS faculty_name,
              c.course_code,
              d.dept_name
       FROM users u
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       INNER JOIN academic_courses c ON c.course_id = $3 AND c.tenant_id = $2
       WHERE u.user_id = $1 AND u.tenant_id = $2
       LIMIT 1`,
      [facultyUserId, tenantId, dto.course_id],
    );

    const meta = metaRows[0];
    if (meta?.hod_user_id) {
      const typeLabel = String(
        dto.adjustment_type || 'SCHEDULE_CHANGE',
      ).replace(/_/g, ' ');
      this.notify.approvalRequired({
        tenantId,
        userId: meta.hod_user_id,
        category: 'ACADEMICS',
        requestType: 'Schedule Change',
        requesterName: meta.faculty_name || 'Faculty',
        title: `Schedule change pending — ${meta.course_code ?? 'course'}`,
        message: `${meta.faculty_name || 'A faculty member'} submitted a ${typeLabel} request for ${meta.course_code ?? 'a course'}${meta.dept_name ? ` (${meta.dept_name})` : ''}. Open Extra Class Approvals to review.`,
        actionLink: '/hod/approvals/extra-classes',
      });
    }

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
      `SELECT r.*, r.published_date::text AS published_date FROM faculty_research_logs r
       JOIN users u ON u.user_id = r.faculty_user_id AND u.tenant_id = r.tenant_id
       WHERE r.tenant_id = $1 AND r.faculty_user_id = $2
         AND u.is_active = true AND u.deleted_at IS NULL
       ORDER BY r.published_date DESC NULLS LAST, r.created_at DESC`,
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
    const title = typeof dto?.publication_title === 'string' ? dto.publication_title.trim() : '';
    if (!title) throw new BadRequestException('Publication title is required');
    const optionalText = (value: unknown, label: string) => {
      if (value == null) return null;
      if (typeof value !== 'string') throw new BadRequestException(`${label} must be text`);
      return value.trim() || null;
    };
    const journal = optionalText(dto.journal_name, 'Journal or conference');
    if (journal && journal.length > 255) throw new BadRequestException('Journal or conference must be at most 255 characters');
    const indexing = optionalText(dto.indexing_type, 'Indexing type');
    if (indexing && !['SCOPUS', 'WOS', 'UGC_CARE', 'OTHER'].includes(indexing)) {
      throw new BadRequestException('Select a valid indexing type');
    }
    const publicationType = dto.publication_type == null ? 'JOURNAL' : optionalText(dto.publication_type, 'Publication type');
    if (!publicationType || !['JOURNAL', 'CONFERENCE', 'PATENT', 'BOOK', 'BOOK_CHAPTER'].includes(publicationType)) {
      throw new BadRequestException('Select a valid publication type');
    }
    const publishedDate = optionalText(dto.published_date, 'Publication date');
    if (publishedDate) {
      const parsed = new Date(`${publishedDate}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(publishedDate) || publishedDate.startsWith('0000')
        || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== publishedDate) {
        throw new BadRequestException('Enter a valid publication date in YYYY-MM-DD format');
      }
    }
    const proof = optionalText(dto.proof_file_path, 'Proof file');
    if (proof) {
      // These are the two references returned by the shared upload endpoint.
      const key = proof.startsWith('/uploads/') ? proof.slice('/uploads/'.length)
        : /^s3:\/\/[^/]+\//.test(proof) ? proof.replace(/^s3:\/\/[^/]+\//, '') : '';
      let decoded = '';
      try { decoded = decodeURIComponent(key); } catch { /* rejected below */ }
      if (!decoded.startsWith(`${tenantId}/`) || /[\\\u0000-\u001f?#]/.test(decoded)
        || decoded.split('/').some(part => !part || part === '.' || part === '..')) {
        throw new BadRequestException('Use a proof file uploaded in this university');
      }
    }
    const rows = await this.dataSource.query(
      `INSERT INTO faculty_research_logs (
         tenant_id, faculty_user_id, publication_title, journal_name, indexing_type,
         publication_type, published_date, proof_file_path
       ) SELECT $1,$2,$3,$4,$5,$6,$7,$8 FROM users u
         WHERE u.user_id = $2 AND u.tenant_id = $1 AND u.is_active = true AND u.deleted_at IS NULL
       RETURNING *, published_date::text AS published_date`,
      [
        tenantId,
        facultyUserId,
        title,
        journal,
        indexing,
        publicationType,
        publishedDate,
        proof,
      ],
    );
    if (!rows[0]) throw new ForbiddenException('An active account in this university is required');
    return rows[0];
  }

  async listInvigilation(facultyUserId: string, tenantId: string) {
    return this.dataSource.query(
      `SELECT a.*, a.exam_date::text AS exam_date,
              r.status AS excuse_status, r.reason AS excuse_reason, r.exam_cell_comment
       FROM faculty_invigilation_assignments a
       LEFT JOIN invigilation_unavailability_requests r
         ON r.assignment_id = a.assignment_id AND r.tenant_id = a.tenant_id
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

  private async writeDutySwapAudit(
    tenantId: string,
    swapId: string,
    actorUserId: string | null,
    action: string,
    fromStatus: string | null,
    toStatus: string | null,
    details: Record<string, unknown> = {},
  ) {
    await this.dataSource.query(
      `INSERT INTO invigilation_duty_swap_audits
         (tenant_id, swap_id, actor_user_id, action, from_status, to_status, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        tenantId,
        swapId,
        actorUserId,
        action,
        fromStatus,
        toStatus,
        JSON.stringify(details),
      ],
    );
  }

  private dutySwapNotifyBase(row: {
    swap_id: string;
    assignment_id: string;
    requester_name?: string;
    target_name?: string;
    exam_date: string;
    room: string;
    session_label?: string | null;
  }) {
    return {
      swapId: row.swap_id,
      assignmentId: row.assignment_id,
      requesterName: row.requester_name ?? 'Faculty',
      targetName: row.target_name,
      examDate: row.exam_date,
      room: row.room,
      sessionLabel: row.session_label ?? null,
    };
  }

  async listInvigilationSwapPartners(
    facultyUserId: string,
    tenantId: string,
    assignmentId: string,
  ) {
    const assignmentRows = await this.dataSource.query(
      `SELECT a.*, a.exam_date::text AS exam_date
       FROM faculty_invigilation_assignments a
       WHERE a.assignment_id = $1 AND a.faculty_user_id = $2 AND a.tenant_id = $3`,
      [assignmentId, facultyUserId, tenantId],
    );
    if (!assignmentRows[0]) throw new NotFoundException('Assignment not found');
    const assignment = assignmentRows[0];

    return this.dataSource.query(
      `SELECT DISTINCT u.user_id, u.name, u.official_email
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.user_id
       JOIN roles r ON r.role_id = ur.role_id
       WHERE u.tenant_id = $1
         AND u.is_active = true
         AND u.user_id <> $2
         AND lower(r.role_name) IN ('faculty', 'hod', 'dean')
         AND NOT EXISTS (
           SELECT 1 FROM faculty_invigilation_assignments a
           WHERE a.tenant_id = $1
             AND a.faculty_user_id = u.user_id
             AND a.exam_date = $3::date
             AND COALESCE(a.session_label, '') = COALESCE($4, '')
         )
       ORDER BY u.name ASC
       LIMIT 200`,
      [
        tenantId,
        facultyUserId,
        assignment.exam_date,
        assignment.session_label ?? null,
      ],
    );
  }

  async listInvigilationSwaps(facultyUserId: string, tenantId: string) {
    return this.dataSource.query(
      `SELECT s.*,
              a.exam_date::text AS exam_date, a.room, a.session_label, a.block_name,
              req.name AS requester_name,
              tgt.name AS target_name
       FROM invigilation_duty_swaps s
       JOIN faculty_invigilation_assignments a ON a.assignment_id = s.assignment_id AND a.tenant_id = s.tenant_id
       JOIN users req ON req.user_id = s.requester_faculty_user_id AND req.tenant_id = s.tenant_id
       JOIN users tgt ON tgt.user_id = s.target_faculty_user_id AND tgt.tenant_id = s.tenant_id
       WHERE s.tenant_id = $1
         AND s.deleted_at IS NULL
         AND (s.requester_faculty_user_id = $2 OR s.target_faculty_user_id = $2)
       ORDER BY s.created_at DESC`,
      [tenantId, facultyUserId],
    );
  }

  async requestInvigilationDutySwap(
    facultyUserId: string,
    tenantId: string,
    assignmentId: string,
    targetFacultyUserId: string,
    reason: string,
  ) {
    if (!reason?.trim()) throw new BadRequestException('Reason is required');
    if (!targetFacultyUserId)
      throw new BadRequestException('Target faculty is required');
    if (targetFacultyUserId === facultyUserId) {
      throw new BadRequestException('Cannot swap a duty with yourself');
    }

    const assignmentRows = await this.dataSource.query(
      `SELECT a.*, a.exam_date::text AS exam_date, u.name AS requester_name
       FROM faculty_invigilation_assignments a
       JOIN users u ON u.user_id = a.faculty_user_id AND u.tenant_id = a.tenant_id
       WHERE a.assignment_id = $1 AND a.faculty_user_id = $2 AND a.tenant_id = $3`,
      [assignmentId, facultyUserId, tenantId],
    );
    const assignment = assignmentRows[0];
    if (!assignment) throw new NotFoundException('Assignment not found');

    const targetRows = await this.dataSource.query(
      `SELECT u.user_id, u.name
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.user_id
       JOIN roles r ON r.role_id = ur.role_id
       WHERE u.user_id = $1 AND u.tenant_id = $2 AND u.is_active = true
         AND lower(r.role_name) IN ('faculty', 'hod', 'dean')
       LIMIT 1`,
      [targetFacultyUserId, tenantId],
    );
    if (!targetRows[0]) {
      throw new BadRequestException('Target faculty is not eligible for swap');
    }

    const conflict = await this.dataSource.query(
      `SELECT 1 FROM faculty_invigilation_assignments
       WHERE tenant_id = $1 AND faculty_user_id = $2
         AND exam_date = $3::date
         AND COALESCE(session_label, '') = COALESCE($4, '')
       LIMIT 1`,
      [
        tenantId,
        targetFacultyUserId,
        assignment.exam_date,
        assignment.session_label ?? null,
      ],
    );
    if (conflict[0]) {
      throw new BadRequestException(
        'Target faculty already has a duty in the same session',
      );
    }

    const open = await this.dataSource.query(
      `SELECT swap_id FROM invigilation_duty_swaps
       WHERE tenant_id = $1 AND assignment_id = $2 AND deleted_at IS NULL
         AND status IN ('PENDING_TARGET', 'PENDING_EXAM_CELL')
       LIMIT 1`,
      [tenantId, assignmentId],
    );
    if (open[0]) {
      throw new BadRequestException(
        'An open swap request already exists for this duty',
      );
    }

    const inserted = await this.dataSource.query(
      `INSERT INTO invigilation_duty_swaps
         (tenant_id, assignment_id, requester_faculty_user_id, target_faculty_user_id, reason, status)
       VALUES ($1, $2, $3, $4, $5, 'PENDING_TARGET')
       RETURNING *`,
      [
        tenantId,
        assignmentId,
        facultyUserId,
        targetFacultyUserId,
        reason.trim(),
      ],
    );
    const swap = inserted[0];
    await this.writeDutySwapAudit(
      tenantId,
      swap.swap_id,
      facultyUserId,
      'REQUESTED',
      null,
      'PENDING_TARGET',
      { target_faculty_user_id: targetFacultyUserId, reason: reason.trim() },
    );

    this.notify.examDutySwapPeerRequest({
      tenantId,
      userId: targetFacultyUserId,
      ...this.dutySwapNotifyBase({
        ...swap,
        requester_name: assignment.requester_name,
        target_name: targetRows[0].name,
        exam_date: assignment.exam_date,
        room: assignment.room,
        session_label: assignment.session_label,
      }),
    });

    return {
      ...swap,
      exam_date: assignment.exam_date,
      room: assignment.room,
      session_label: assignment.session_label,
      requester_name: assignment.requester_name,
      target_name: targetRows[0].name,
    };
  }

  async respondInvigilationDutySwap(
    facultyUserId: string,
    tenantId: string,
    swapId: string,
    accept: boolean,
    comment?: string,
  ) {
    const rows = await this.dataSource.query(
      `SELECT s.*,
              a.exam_date::text AS exam_date, a.room, a.session_label,
              req.name AS requester_name,
              tgt.name AS target_name
       FROM invigilation_duty_swaps s
       JOIN faculty_invigilation_assignments a ON a.assignment_id = s.assignment_id AND a.tenant_id = s.tenant_id
       JOIN users req ON req.user_id = s.requester_faculty_user_id AND req.tenant_id = s.tenant_id
       JOIN users tgt ON tgt.user_id = s.target_faculty_user_id AND tgt.tenant_id = s.tenant_id
       WHERE s.swap_id = $1 AND s.tenant_id = $2 AND s.deleted_at IS NULL`,
      [swapId, tenantId],
    );
    const swap = rows[0];
    if (!swap) throw new NotFoundException('Swap request not found');
    if (swap.target_faculty_user_id !== facultyUserId) {
      throw new ForbiddenException('Only the requested faculty can respond');
    }
    if (swap.status !== 'PENDING_TARGET') {
      throw new BadRequestException('Swap request is no longer awaiting you');
    }

    const nextStatus = accept ? 'PENDING_EXAM_CELL' : 'REJECTED_BY_TARGET';
    const updated = postgresQueryRows(await this.dataSource.query(
      `UPDATE invigilation_duty_swaps
       SET status = $1,
           target_comment = $2,
           target_responded_at = NOW(),
           updated_at = NOW()
       WHERE swap_id = $3 AND tenant_id = $4 AND target_faculty_user_id = $5
         AND status = 'PENDING_TARGET' AND deleted_at IS NULL
       RETURNING *`,
      [nextStatus, comment?.trim() || null, swapId, tenantId, facultyUserId],
    ));
    if (!updated[0]) throw new NotFoundException('Swap request changed or is no longer available');

    await this.writeDutySwapAudit(
      tenantId,
      swapId,
      facultyUserId,
      accept ? 'TARGET_ACCEPTED' : 'TARGET_REJECTED',
      'PENDING_TARGET',
      nextStatus,
      { comment: comment?.trim() || null },
    );

    const base = this.dutySwapNotifyBase(swap);
    if (!accept) {
      this.notify.examDutySwapPeerRejected({
        tenantId,
        userId: swap.requester_faculty_user_id,
        ...base,
        comment: comment?.trim() || null,
      });
    } else {
      const officers = await this.dataSource.query<Array<{ user_id: string }>>(
        `SELECT DISTINCT u.user_id
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.user_id
         JOIN roles r ON r.role_id = ur.role_id
         WHERE u.tenant_id = $1
           AND u.is_active = true
           AND lower(r.role_name) IN ('examcell', 'examadmin', 'deputycoe', 'superadmin')`,
        [tenantId],
      );
      for (const officer of officers) {
        this.notify.examDutySwapExamCellPending({
          tenantId,
          userId: officer.user_id,
          ...base,
        });
      }
      this.notify.examDutySwapExamCellPending({
        tenantId,
        userId: swap.requester_faculty_user_id,
        ...base,
        title: 'Duty swap sent to Exam Cell',
        message: `${swap.target_name} accepted your swap. Exam Cell approval is pending.`,
        actionLink: '/faculty/invigilation',
      });
    }

    return { ...updated[0], ...base, exam_date: swap.exam_date, target_name: swap.target_name };
  }

  async cancelInvigilationDutySwap(
    facultyUserId: string,
    tenantId: string,
    swapId: string,
  ) {
    const rows = await this.dataSource.query(
      `SELECT * FROM invigilation_duty_swaps
       WHERE swap_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [swapId, tenantId],
    );
    const swap = rows[0];
    if (!swap) throw new NotFoundException('Swap request not found');
    if (swap.requester_faculty_user_id !== facultyUserId) {
      throw new ForbiddenException('Only the requester can cancel this swap');
    }
    if (!['PENDING_TARGET', 'PENDING_EXAM_CELL'].includes(swap.status)) {
      throw new BadRequestException('Swap request cannot be cancelled');
    }

    const updated = postgresQueryRows(await this.dataSource.query(
      `UPDATE invigilation_duty_swaps
       SET status = 'CANCELLED', updated_at = NOW()
       WHERE swap_id = $1 AND tenant_id = $2 AND requester_faculty_user_id = $3
         AND status IN ('PENDING_TARGET', 'PENDING_EXAM_CELL') AND deleted_at IS NULL
       RETURNING *`,
      [swapId, tenantId, facultyUserId],
    ));
    if (!updated[0]) throw new NotFoundException('Swap request changed or is no longer available');
    await this.writeDutySwapAudit(
      tenantId,
      swapId,
      facultyUserId,
      'CANCELLED',
      swap.status,
      'CANCELLED',
    );
    return updated[0];
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
    if (typeof data.project_title !== 'string' || !data.project_title.trim()) {
      throw new BadRequestException('Project title is required');
    }
    if (!isUUID(facultyUserId)) throw new BadRequestException('Invalid faculty identifier');
    const guide = await this.dataSource.query(
      `SELECT u.user_id FROM users u JOIN roles r ON r.role_id = u.role_id
       WHERE u.user_id = $1 AND u.tenant_id = $2 AND u.is_active = true
         AND u.deleted_at IS NULL AND r.role_name IN ('Faculty', 'HOD', 'Dean', 'SuperAdmin')`,
      [facultyUserId, tenantId],
    );
    if (!guide.length) throw new BadRequestException('Select an active faculty member in this university');
    await this.validateProjectStudents(data.student_ids, tenantId);
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
          data.project_title.trim(),
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
    if (!Array.isArray(students)) throw new BadRequestException('Students must be an array');
    await this.validateProjectStudents(students.map((student) => student?.student_user_id), tenantId);

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
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Funding amount must be a positive number');
    }
    if (typeof purpose !== 'string' || !purpose.trim()) {
      throw new BadRequestException('Funding purpose is required');
    }
    const request = await this.dataSource.transaction(async (manager) => {
      const guides = await manager.query(
        `SELECT g.guide_id FROM faculty_project_guides g
         JOIN users owner ON owner.user_id = g.faculty_user_id AND owner.tenant_id = g.tenant_id
         WHERE g.guide_id = $1 AND g.faculty_user_id = $2 AND g.tenant_id = $3
           AND g.status = 'ACTIVE' AND (to_jsonb(g)->>'deleted_at') IS NULL
           AND owner.is_active = true AND owner.deleted_at IS NULL
         FOR UPDATE OF g`,
        [guideId, facultyUserId, tenantId],
      );
      if (!guides.length) throw new NotFoundException('Active project guide not found');
      // Lock the owning project before checking, so simultaneous requests cannot
      // both observe an empty pending queue and insert a funding demand.
      const existing = await manager.query(
        `SELECT 1 FROM project_funding_requests
         WHERE guide_id = $1 AND tenant_id = $2 AND status IN ('PENDING_HOD', 'APPROVED_HOD')`,
        [guideId, tenantId],
      );
      if (existing.length) throw new BadRequestException('A funding request is already pending or approved and awaiting transfer.');
      const rows = await manager.query(
        `INSERT INTO project_funding_requests (tenant_id, guide_id, requested_by, amount, purpose)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [tenantId, guideId, facultyUserId, amount, purpose.trim()],
      );
      return rows[0];
    });

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

    return request;
  }

  async listHodFundingRequests(hodUserId: string, tenantId: string) {
    // Only return requests for departments where this user is HOD
    return this.dataSource.query(
      `SELECT fr.*, g.project_title, u.name AS faculty_name, d.dept_name
       FROM project_funding_requests fr
       INNER JOIN faculty_project_guides g ON g.guide_id = fr.guide_id AND g.tenant_id = fr.tenant_id
       INNER JOIN users u ON u.user_id = fr.requested_by AND u.tenant_id = fr.tenant_id
       INNER JOIN departments d ON d.dept_id = u.dept_id
       WHERE fr.tenant_id = $1 AND d.hod_user_id = $2
       ORDER BY fr.created_at DESC`,
      [tenantId, hodUserId],
    );
  }

  async listDeanFundingRequests(tenantId: string, deanUserId: string) {
    const deptRows = await this.dataSource.query<Array<{ dept_id: number }>>(
      `SELECT DISTINCT dept_id
       FROM (
         SELECT ip.dept_id
         FROM iam_programs ip
         INNER JOIN schools s ON s.school_id = ip.school_id
         WHERE s.deleted_at IS NULL
           AND (
             s.dean_user_id = $1
             OR EXISTS (
               SELECT 1 FROM departments hd
               WHERE hd.hod_user_id = $1 AND hd.school_id = s.school_id
             )
           )
         UNION
         SELECT dept_id FROM departments WHERE hod_user_id = $1
         UNION
         SELECT dept_id FROM users WHERE user_id = $1 AND dept_id IS NOT NULL
       ) scoped
       WHERE dept_id IS NOT NULL`,
      [deanUserId],
    );
    const deptIds = deptRows.map((row) => Number(row.dept_id));
    if (!deptIds.length) return [];

    return this.dataSource.query(
      `SELECT fr.*, g.project_title, u.name AS faculty_name, d.dept_name
       FROM project_funding_requests fr
       INNER JOIN faculty_project_guides g ON g.guide_id = fr.guide_id AND g.tenant_id = fr.tenant_id
       INNER JOIN users u ON u.user_id = fr.requested_by AND u.tenant_id = fr.tenant_id
       INNER JOIN departments d ON d.dept_id = u.dept_id
       WHERE fr.tenant_id = $1
         AND u.dept_id = ANY($2::int[])
         AND fr.status IN ('APPROVED_HOD', 'APPROVED_DEAN', 'REJECTED_DEAN')
       ORDER BY fr.created_at DESC`,
      [tenantId, deptIds],
    );
  }

  async updateHodFundingRequest(
    requestId: string,
    status: 'APPROVED_HOD' | 'REJECTED_HOD',
    commitMessage: string,
    hodUserId: string,
    tenantId: string,
  ) {
    if (!['APPROVED_HOD', 'REJECTED_HOD'].includes(status)) {
      throw new BadRequestException('Select a valid HOD funding decision');
    }
    if (commitMessage != null && typeof commitMessage !== 'string') {
      throw new BadRequestException('Funding decision message must be text');
    }
    const message = (commitMessage ?? '').trim();
    if (status === 'REJECTED_HOD' && !message) {
      throw new BadRequestException('A reason is required to reject funding');
    }
    const deptRows = await this.dataSource.query<Array<{ dept_id: number }>>(
      `SELECT dept_id FROM departments WHERE hod_user_id = $1`,
      [hodUserId],
    );
    const deptIds = deptRows.map((row) => Number(row.dept_id));
    if (!deptIds.length) {
      throw new NotFoundException(
        'Pending funding request not found or unauthorized',
      );
    }

    const rows = postgresQueryRows(await this.dataSource.query(
      `UPDATE project_funding_requests fr
       SET status = $1, hod_commit_message = $2, hod_user_id = $3, updated_at = NOW()
       FROM users u
       WHERE fr.request_id = $4
         AND fr.tenant_id = $5
         AND fr.status = 'PENDING_HOD'
         AND u.user_id = fr.requested_by
         AND u.tenant_id = fr.tenant_id
         AND u.dept_id = ANY($6::int[])
       RETURNING fr.*`,
      [status, message, hodUserId, requestId, tenantId, deptIds],
    ));
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
    if (!['APPROVED_DEAN', 'REJECTED_DEAN'].includes(status)) {
      throw new BadRequestException('Select a valid Dean funding decision');
    }
    if (commitMessage != null && typeof commitMessage !== 'string') {
      throw new BadRequestException('Funding decision message must be text');
    }
    const message = (commitMessage ?? '').trim();
    if (status === 'REJECTED_DEAN' && !message) {
      throw new BadRequestException('A reason is required to reject funding');
    }
    const deptRows = await this.dataSource.query<Array<{ dept_id: number }>>(
      `SELECT DISTINCT dept_id
       FROM (
         SELECT p.dept_id
         FROM iam_programs p
         INNER JOIN schools s ON s.school_id = p.school_id
         WHERE p.deleted_at IS NULL
           AND p.dept_id IS NOT NULL
           AND (
             s.dean_user_id = $1
             OR EXISTS (
               SELECT 1 FROM departments hd
               WHERE hd.hod_user_id = $1 AND hd.school_id = s.school_id
             )
           )
         UNION
         SELECT dept_id FROM departments WHERE hod_user_id = $1
         UNION
         SELECT dept_id FROM users WHERE user_id = $1 AND dept_id IS NOT NULL
       ) scoped
       WHERE dept_id IS NOT NULL`,
      [deanUserId],
    );
    const deptIds = deptRows.map((row) => Number(row.dept_id));
    if (!deptIds.length) {
      throw new NotFoundException(
        'Pending funding request not found or unauthorized',
      );
    }

    const rows = postgresQueryRows(await this.dataSource.query(
      `UPDATE project_funding_requests fr
       SET status = $1, dean_commit_message = $2, dean_user_id = $3, updated_at = NOW()
       FROM users u
       WHERE fr.request_id = $4
         AND fr.tenant_id = $5
         AND fr.status = 'APPROVED_HOD'
         AND fr.requested_by = u.user_id
         AND u.tenant_id = fr.tenant_id
         AND u.dept_id = ANY($6::int[])
       RETURNING fr.*`,
      [status, message, deanUserId, requestId, tenantId, deptIds],
    ));
    if (!rows.length) {
      throw new NotFoundException(
        'Pending funding request not found or unauthorized',
      );
    }

    const updatedRequest = rows[0];

    await this.deanAudit.logAction({
      tenantId,
      userId: deanUserId,
      role: 'Dean',
      module: 'project_funding_requests',
      action:
        status === 'APPROVED_DEAN' ? 'FUNDING_APPROVED' : 'FUNDING_REJECTED',
      recordId: requestId,
      previousValue: { status: 'APPROVED_HOD' },
      newValue: {
        status,
        commit_message: message,
        amount: updatedRequest.amount,
      },
    });

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
    const rows = postgresQueryRows(await this.dataSource.query(
      `UPDATE project_weekly_reports
       SET status = $2, ce_marks = $3, faculty_remarks = $4, reviewed_at = NOW()
       WHERE report_id = $1
       RETURNING *`,
      [reportId, dto.status, dto.ce_marks ?? null, dto.faculty_remarks ?? null],
    ));
    if (!rows[0]) throw new NotFoundException('Project report is no longer available');
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
      `WITH ${facultyAttendanceStatsCte('$1', courseId ? '$3' : undefined)},
       ${publishedMarkStatsCte('$1', courseId ? '$3' : undefined)}
       SELECT u.user_id AS student_user_id, u.name, c.course_id, c.course_code, c.course_name,
              COALESCE(att.attendance_record_count, 0)::int AS attendance_record_count,
              att.attendance_percent::float AS attendance_percent,
              COALESCE(pm.published_assessment_count, 0)::int AS published_assessment_count,
              pm.internal_avg_percent
       FROM student_course_enrollments e
       INNER JOIN users u ON u.user_id = e.student_user_id AND u.tenant_id = e.tenant_id
       INNER JOIN academic_courses c ON c.course_id = e.course_id AND c.tenant_id = e.tenant_id
       LEFT JOIN attendance_stats att
         ON att.tenant_id = e.tenant_id AND att.course_id = e.course_id AND att.student_user_id = e.student_user_id::text
       LEFT JOIN published_mark_stats pm
         ON pm.tenant_id = e.tenant_id AND pm.course_id = e.course_id AND pm.student_user_id = e.student_user_id
       WHERE e.tenant_id = $1 AND e.status = 'ENROLLED'
         AND (to_jsonb(e)->>'deleted_at') IS NULL
         AND ${FACULTY_COURSE_ACCESS_SQL}
         ${courseFilter}
       ORDER BY attendance_percent ASC NULLS LAST, internal_avg_percent ASC NULLS LAST`,
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
    const isUuid = (value: unknown) =>
      typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value.trim(),
      );

    if (!isUuid(courseId)) {
      throw new BadRequestException('Invalid courseId');
    }

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
      `WITH ${facultyAttendanceStatsCte('$1', '$3')},
       ${publishedMarkStatsCte('$1', '$3')}
       SELECT DISTINCT
         u.user_id AS student_user_id,
         u.name,
         u.official_email,
         ${ROLL_NUMBER_SQL} AS roll_number,
         d.dept_name AS department,
         c.course_id,
         c.course_code,
         c.course_name,
         COALESCE(att.attendance_record_count, 0)::int AS attendance_record_count,
         att.attendance_percent::float AS attendance_percent,
         COALESCE(pm.published_assessment_count, 0)::int AS published_assessment_count,
         pm.internal_avg_percent,
         (
           SELECT COUNT(*)::int
           FROM assignment_submissions sub
           INNER JOIN academic_assignments aa ON aa.assignment_id = sub.assignment_id
           WHERE aa.tenant_id = e.tenant_id
             AND aa.course_id = e.course_id
             AND sub.student_user_id = e.student_user_id
         ) AS assignments_submitted
       FROM student_course_enrollments e
       INNER JOIN users u ON u.user_id = e.student_user_id AND u.tenant_id = e.tenant_id
       INNER JOIN academic_courses c ON c.course_id = e.course_id AND c.tenant_id = e.tenant_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       LEFT JOIN attendance_stats att
         ON att.tenant_id = e.tenant_id AND att.course_id = e.course_id AND att.student_user_id = e.student_user_id::text
       LEFT JOIN published_mark_stats pm
         ON pm.tenant_id = e.tenant_id AND pm.course_id = e.course_id AND pm.student_user_id = e.student_user_id
       WHERE e.tenant_id = $1
         AND e.status = 'ENROLLED'
         AND e.course_id = $3
         AND (to_jsonb(e)->>'deleted_at') IS NULL
         AND ${FACULTY_COURSE_ACCESS_SQL}
         ${searchFilter}
       ORDER BY u.name ASC
       LIMIT $${params.length}`,
      params,
    );
  }

  async searchDepartmentStudents(
    facultyUserId: string,
    tenantId: string,
    query: string,
    limit = 25,
  ) {
    const trimmed = query?.trim();
    if (!trimmed || trimmed.length < 2) {
      throw new BadRequestException(
        'Enter at least 2 characters of the student name or registration number',
      );
    }

    const facultyRows = await this.dataSource.query<
      Array<{ dept_id: number | null }>
    >(
      `SELECT dept_id FROM users WHERE tenant_id = $1 AND user_id = $2 LIMIT 1`,
      [tenantId, facultyUserId],
    );
    const deptId = facultyRows[0]?.dept_id;
    if (!deptId) {
      throw new ForbiddenException(
        'A department assignment is required to search student records',
      );
    }

    return this.dataSource.query(
      `WITH ${facultyAttendanceStatsCte('$1')},
       ${publishedMarkStatsCte('$1')}
       SELECT DISTINCT
         u.user_id AS student_user_id,
         u.name,
         u.official_email,
         ${ROLL_NUMBER_SQL} AS roll_number,
         d.dept_name AS department,
         c.course_id,
         c.course_code,
         c.course_name,
         COALESCE(att.attendance_record_count, 0)::int AS attendance_record_count,
         att.attendance_percent::float AS attendance_percent,
         COALESCE(pm.published_assessment_count, 0)::int AS published_assessment_count,
         pm.internal_avg_percent,
         (
           SELECT COUNT(*)::int
           FROM assignment_submissions sub
           INNER JOIN academic_assignments aa ON aa.assignment_id = sub.assignment_id
           WHERE aa.tenant_id = e.tenant_id
             AND aa.course_id = e.course_id
             AND sub.student_user_id = e.student_user_id
         ) AS assignments_submitted
       FROM student_course_enrollments e
       INNER JOIN users u ON u.user_id = e.student_user_id AND u.tenant_id = e.tenant_id
       INNER JOIN academic_courses c ON c.course_id = e.course_id AND c.tenant_id = e.tenant_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       LEFT JOIN attendance_stats att
         ON att.tenant_id = e.tenant_id AND att.course_id = e.course_id AND att.student_user_id = e.student_user_id::text
       LEFT JOIN published_mark_stats pm
         ON pm.tenant_id = e.tenant_id AND pm.course_id = e.course_id AND pm.student_user_id = e.student_user_id
       WHERE e.tenant_id = $1
         AND e.status = 'ENROLLED'
         AND u.dept_id = $2
         AND (to_jsonb(e)->>'deleted_at') IS NULL
         AND (
           lower(u.name) LIKE $3
           OR lower(COALESCE(u.official_email, '')) LIKE $3
           OR lower(${ROLL_NUMBER_SQL}) LIKE $3
         )
       ORDER BY u.name ASC, c.course_code ASC
       LIMIT $4`,
      [
        tenantId,
        deptId,
        `%${trimmed.toLowerCase()}%`,
        Math.min(Math.max(limit, 1), 50),
      ],
    );
  }

  async getFacultySubjectStudentReport(
    facultyUserId: string,
    tenantId: string,
    courseId: string,
    studentUserId: string,
  ) {
    const isUuid = (value: unknown) =>
      typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value.trim(),
      );

    if (!isUuid(courseId)) {
      throw new BadRequestException('Invalid courseId');
    }
    if (!isUuid(studentUserId)) {
      throw new BadRequestException(
        'Invalid studentUserId — demo/smoke student IDs cannot be loaded from the database',
      );
    }

    await this.assertFacultyOwnsCourse(facultyUserId, tenantId, courseId);
    return this.buildFacultyStudentReport(tenantId, courseId, studentUserId);
  }

  async getDepartmentStudentReport(
    facultyUserId: string,
    tenantId: string,
    courseId: string,
    studentUserId: string,
  ) {
    const isUuid = (value: unknown) =>
      typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value.trim(),
      );
    if (!isUuid(courseId) || !isUuid(studentUserId)) {
      throw new BadRequestException('Invalid course or student identifier');
    }

    const scopeRows = await this.dataSource.query(
      `SELECT 1
       FROM users faculty
       INNER JOIN users student
         ON student.tenant_id = faculty.tenant_id
        AND student.dept_id = faculty.dept_id
       INNER JOIN student_course_enrollments e
         ON e.tenant_id = student.tenant_id
        AND e.student_user_id = student.user_id
        AND e.course_id = $4
        AND e.status = 'ENROLLED'
        AND (to_jsonb(e)->>'deleted_at') IS NULL
       WHERE faculty.tenant_id = $1
         AND faculty.user_id = $2
         AND faculty.dept_id IS NOT NULL
         AND student.user_id = $3
       LIMIT 1`,
      [tenantId, facultyUserId, studentUserId, courseId],
    );
    if (!scopeRows.length) {
      throw new ForbiddenException(
        'Student records are limited to your assigned department',
      );
    }

    return this.buildFacultyStudentReport(tenantId, courseId, studentUserId);
  }

  private async buildFacultyStudentReport(
    tenantId: string,
    courseId: string,
    studentUserId: string,
  ) {
    const [
      studentRows,
      statsRows,
      assignmentRows,
      demeritRows,
      summaryRows,
      academicRows,
      gpaHistory,
    ] = await Promise.all([
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
             AND (to_jsonb(e)->>'deleted_at') IS NULL
           LIMIT 1`,
        [tenantId, courseId, studentUserId],
      ),
      this.dataSource.query(
        `WITH ${facultyAttendanceStatsCte('$1', '$2')},
           ${publishedMarkStatsCte('$1', '$2')},
           scores AS (
             SELECT e.student_user_id,
                    pm.internal_avg_percent AS score,
                    COALESCE(pm.published_assessment_count, 0)::int AS published_assessment_count
             FROM student_course_enrollments e
             LEFT JOIN published_mark_stats pm
               ON pm.tenant_id = e.tenant_id
              AND pm.course_id = e.course_id
              AND pm.student_user_id = e.student_user_id
             WHERE e.tenant_id = $1
               AND e.course_id = $2
               AND e.status = 'ENROLLED'
               AND (to_jsonb(e)->>'deleted_at') IS NULL
           ),
           measured_ranks AS (
             SELECT student_user_id,
                    RANK() OVER (ORDER BY score DESC)::int AS class_rank
             FROM scores
             WHERE score IS NOT NULL
           ),
           ranked AS (
             SELECT s.*, mr.class_rank,
                    COUNT(*) OVER () AS class_size,
                    COUNT(s.score) OVER () AS graded_student_count,
                    ROUND(AVG(s.score::numeric) OVER (), 2)::float AS class_average_percent
             FROM scores s
             LEFT JOIN measured_ranks mr ON mr.student_user_id = s.student_user_id
           )
           SELECT c.course_id, c.course_code, c.course_name,
                  r.score AS internal_avg_percent,
                  r.published_assessment_count,
                  att.attendance_percent::float AS attendance_percent,
                  COALESCE(att.attendance_record_count, 0)::int AS attendance_record_count,
                  r.class_average_percent,
                  r.class_rank::int,
                  r.class_size::int,
                  r.graded_student_count::int,
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
                      AND (to_jsonb(m)->>'deleted_at') IS NULL
                      AND m.max_marks > 0
                      AND m.marks_obtained BETWEEN 0 AND m.max_marks
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
                      AND aa.max_marks > 0
                      AND sub.marks_awarded BETWEEN 0 AND aa.max_marks
                  ) AS assignments_graded,
                  (
                    SELECT ROUND(
                      100.0 * SUM(sub.marks_awarded)::numeric / NULLIF(SUM(aa.max_marks), 0), 2
                    )::float
                    FROM assignment_submissions sub
                    INNER JOIN academic_assignments aa ON aa.assignment_id = sub.assignment_id
                    WHERE aa.tenant_id = $1
                      AND aa.course_id = $2
                      AND sub.student_user_id = $3
                      AND aa.max_marks > 0
                      AND sub.marks_awarded BETWEEN 0 AND aa.max_marks
                  ) AS graded_assignment_avg_percent
           FROM academic_courses c
           INNER JOIN ranked r ON r.student_user_id = $3
           LEFT JOIN attendance_stats att
             ON att.tenant_id = c.tenant_id AND att.course_id = c.course_id AND att.student_user_id = r.student_user_id::text
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
      this.dataSource
        .query(
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
        )
        .catch(() => []),
      this.dataSource
        .query(
          `SELECT cumulative_demerit_points, is_subject_back_triggered, subject_back_triggered_at
           FROM student_academic_summaries
           WHERE tenant_id = $1 AND student_user_id = $2`,
          [tenantId, studentUserId],
        )
        .catch(() => []),
      this.dataSource
        .query(
          `SELECT academic_year, semester, sgpa, cgpa, backlog_count, progression_status, remarks
           FROM academic_records
           WHERE tenant_id = $1 AND student_user_id = $2
           ORDER BY semester ASC`,
          [tenantId, studentUserId],
        )
        .catch(() => []),
      this.loadStudentGpaHistory(tenantId, studentUserId),
    ]);

    const student = studentRows[0];
    const stats = statsRows[0];
    if (!student || !stats)
      throw new NotFoundException('Student not found in this subject');

    const assignmentsTotal = Number(stats.assignments_total ?? 0);
    const assignmentsSubmitted = Number(stats.assignments_submitted ?? 0);
    const pendingAssignments = Math.max(
      assignmentsTotal - assignmentsSubmitted,
      0,
    );
    const publishedAssessmentCount = Number(stats.published_assessment_count ?? 0);
    const attendanceRecordCount = Number(stats.attendance_record_count ?? 0);
    const internalAvg = publishedAssessmentCount > 0 && stats.internal_avg_percent != null
      ? Number(stats.internal_avg_percent)
      : null;
    const attendancePercent =
      attendanceRecordCount === 0 || stats.attendance_percent == null
        ? null
        : Number(stats.attendance_percent);
    const classAverage = stats.class_average_percent == null
      ? null
      : Number(stats.class_average_percent);
    const demeritPoints = (demeritRows as Array<{ points: number }>).reduce(
      (sum, row) => sum + Number(row.points ?? 0),
      0,
    );
    const academic = academicRows.length
      ? academicRows[academicRows.length - 1]
      : null;
    const gpaHistoryFinal =
      gpaHistory.length > 0
        ? gpaHistory
        : academicRows.map((row) => ({
            semester: Number(row.semester),
            sgpa: row.sgpa == null ? null : Number(row.sgpa),
            cgpa: row.cgpa == null ? null : Number(row.cgpa),
            status: row.progression_status ?? 'RECORD',
            academic_year: row.academic_year ?? null,
            source: 'academic_record',
          }));
    const academicSummary = summaryRows[0] ?? null;
    const flags: Array<{
      label: string;
      severity: 'LOW' | 'MEDIUM' | 'HIGH';
      detail: string;
    }> = [];

    if (internalAvg !== null && internalAvg < 40) {
      flags.push({
        label: 'Low published marks',
        severity: 'HIGH',
        detail: 'The published marks average is below the 40% academic concern threshold.',
      });
    }
    if (attendancePercent !== null && attendancePercent < 75) {
      flags.push({
        label: 'Critical attendance',
        severity: attendancePercent < 60 ? 'HIGH' : 'MEDIUM',
        detail: `Attendance is ${Math.round(attendancePercent)}%; the minimum expected attendance is 75%.`,
      });
    } else if (attendancePercent !== null && attendancePercent < 85) {
      flags.push({
        label: 'Low attendance',
        severity: 'LOW',
        detail: `Attendance is ${Math.round(attendancePercent)}%.`,
      });
    }
    if (classAverage !== null && internalAvg !== null && internalAvg + 10 < classAverage) {
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
        internal_avg_percent: internalAvg,
        published_assessment_count: publishedAssessmentCount,
        attendance_percent: attendancePercent,
        attendance_record_count: attendanceRecordCount,
        class_average_percent: classAverage,
        class_rank: stats.class_rank == null ? null : Number(stats.class_rank),
        class_size: Number(stats.class_size ?? 0),
        graded_student_count: Number(stats.graded_student_count ?? 0),
        assignments_total: assignmentsTotal,
        assignments_submitted: assignmentsSubmitted,
        assignments_graded: Number(stats.assignments_graded ?? 0),
        pending_assignments: pendingAssignments,
        assignment_completion_percent:
          assignmentsTotal > 0
            ? Math.round((assignmentsSubmitted / assignmentsTotal) * 100)
            : 0,
        graded_assignment_avg_percent: stats.graded_assignment_avg_percent == null
          ? null
          : Number(stats.graded_assignment_avg_percent),
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
            sgpa: academic.sgpa == null ? null : Number(academic.sgpa),
            cgpa: academic.cgpa == null ? null : Number(academic.cgpa),
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
           COALESCE((g.payload->>'sgpa')::numeric, g.cgpa) AS sgpa,
           COALESCE((g.payload->>'cgpa')::numeric, g.cgpa) AS cgpa,
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
        sgpa: row.sgpa == null ? null : Number(row.sgpa),
        cgpa: row.cgpa == null ? null : Number(row.cgpa),
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
        sgpa: row.sgpa == null ? null : Number(row.sgpa),
        cgpa: row.cgpa == null ? null : Number(row.cgpa),
        status: row.progression_status ?? 'RECORD',
        academic_year: row.academic_year,
        source: 'academic_record',
      }));
    }

    const enrollments = await this.dataSource.query<
      Array<{
        semester: number;
        grade_points: string | number | null;
        credits: number;
      }>
    >(
      `SELECT e.semester, e.grade_points, c.credits
       FROM student_course_enrollments e
       INNER JOIN academic_courses c ON c.course_id = e.course_id
       WHERE e.tenant_id = $1
         AND e.student_user_id = $2
         AND e.status = 'COMPLETED'
         AND e.grade_points IS NOT NULL
         AND (to_jsonb(e)->>'deleted_at') IS NULL
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
          sgpa: credits > 0 ? Number((points / credits).toFixed(2)) : null,
          cgpa:
            cumulativeCredits > 0
              ? Number((cumulativePoints / cumulativeCredits).toFixed(2))
              : null,
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
      if (typeof courseId !== 'string' || !isUUID(courseId)) {
        throw new BadRequestException('Select a valid course');
      }
      filter = ' AND l.course_id = $3';
      params.push(courseId);
    }
    return this.dataSource.query(
      `SELECT l.*, l.class_date::text AS class_date, c.course_code, c.course_name
       FROM faculty_class_logbook l
       INNER JOIN academic_courses c ON c.course_id = l.course_id AND c.tenant_id = l.tenant_id
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
    const courseId = typeof dto?.course_id === 'string' ? dto.course_id.trim() : '';
    const classDate = typeof dto?.class_date === 'string' ? dto.class_date.trim() : '';
    const topicSummary = typeof dto?.topic_summary === 'string' ? dto.topic_summary.trim() : '';
    if (!isUUID(courseId)) {
      throw new BadRequestException('Select a valid course');
    }
    const parsedDate = new Date(`${classDate}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(classDate) ||
      classDate.startsWith('0000') ||
      !Number.isFinite(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== classDate
    ) {
      throw new BadRequestException('Enter a valid class date in YYYY-MM-DD format');
    }
    if (!topicSummary) {
      throw new BadRequestException('Enter a topic summary');
    }
    await this.assertFacultyOwnsCourse(facultyUserId, tenantId, courseId);
    const rows = await this.dataSource.query(
      `INSERT INTO faculty_class_logbook (tenant_id, course_id, faculty_user_id, class_date, topic_summary)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (tenant_id, course_id, faculty_user_id, class_date) DO UPDATE SET
         topic_summary = EXCLUDED.topic_summary
       RETURNING *, class_date::text AS class_date`,
      [
        tenantId,
        courseId,
        facultyUserId,
        classDate,
        topicSummary,
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

  private async notifyMarksPublishedToStudents(
    tenantId: string,
    courseId: string,
    courseName: string,
    examType: string,
  ): Promise<number> {
    try {
      const enrolled = await this.dataSource.query(
        `SELECT student_user_id FROM student_course_enrollments
         WHERE tenant_id = $1 AND course_id = $2 AND status = 'ENROLLED'`,
        [tenantId, courseId],
      );
      let count = 0;
      for (const row of enrolled as Array<{ student_user_id: string }>) {
        this.notify.marksPublished({
          tenantId,
          userId: row.student_user_id,
          courseName,
          examType,
        });
        count += 1;
      }
      return count;
    } catch {
      return 0;
    }
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
         WHERE tenant_id = $1
           AND faculty_user_id = $2
           AND course_id = $3
           AND deleted_at IS NULL
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

  private async validateProjectStudents(studentIds: string[], tenantId: string) {
    if (!Array.isArray(studentIds) || studentIds.some((id) => typeof id !== 'string' || !isUUID(id))) {
      throw new BadRequestException('Select valid student identifiers');
    }
    if (new Set(studentIds).size !== studentIds.length) {
      throw new BadRequestException('A student can only be assigned once to a project');
    }
    if (!studentIds.length) return;
    const students = await this.dataSource.query(
      `SELECT u.user_id FROM users u JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND u.user_id = ANY($2::uuid[])
         AND u.is_active = true AND u.deleted_at IS NULL AND r.role_name = 'Student'`,
      [tenantId, studentIds],
    );
    if (students.length !== studentIds.length) {
      throw new BadRequestException('All project members must be active students in this university');
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
