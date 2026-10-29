import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { isUUID, validateSync } from 'class-validator';
import { DataSource } from 'typeorm';
import { NotificationEvents } from '../../core/notifications/notification.events';
import { normalizeProgram } from '../academics/allocation-semester.util';
import { StudentEnrollmentSyncService } from '../academics/student-enrollment-sync.service';
import { CreateExamScheduleDto } from './dto/exam-schedule.dto';
import { ExamCellAuditService } from './exam-cell-audit.service';
import { assertExamCellAction } from './exam-cell-rbac.util';
import { requireHallTicketTenant } from './hall-ticket-policy';

type Session = {
  session_id: string;
  status: string;
  academic_year: string;
  semester: number;
  program_label: string;
};

type Schedule = {
  exam_schedule_id: string;
  session_id: string | null;
  tenant_id?: string;
  status?: string;
  exam_type: string;
  subject_id: number;
  exam_date?: string;
  start_time: string;
  end_time: string;
  venue?: string;
  [key: string]: unknown;
};

/** Existing timetable creation, explicitly linked to its authorized session. */
@Injectable()
export class HallTicketTimetableService {
  private readonly logger = new Logger(HallTicketTimetableService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly enrollment: StudentEnrollmentSyncService,
    private readonly audit: ExamCellAuditService,
    private readonly events: EventEmitter2,
  ) {}

  async create(
    tenant: string,
    actor: string,
    role: string | undefined,
    dto: CreateExamScheduleDto,
  ) {
    tenant = requireHallTicketTenant(tenant);
    assertExamCellAction(role, 'manage_schedules');
    if (!isUUID(actor))
      throw new ForbiddenException('Authenticated tenant actor required');
    if (!dto || typeof dto !== 'object' || Array.isArray(dto))
      throw new BadRequestException('A valid timetable request is required');
    const input = plainToInstance(CreateExamScheduleDto, dto);
    const errors = validateSync(input, {
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    });
    if (errors.length)
      throw new BadRequestException({
        message: 'Invalid examination timetable',
        errors: errors.flatMap((error) =>
          Object.values(error.constraints ?? {}),
        ),
      });
    const time = (value: string) =>
      value.length === 5 ? `${value}:00` : value;
    const start = time(input.start_time);
    const end = time(input.end_time);
    if (start >= end)
      throw new BadRequestException('End time must be after start time');
    const committed = await this.db.transaction(async (manager) => {
      // Same leading session lock as registration/approval/issuance paths.
      const [session] = await manager.query<Session[]>(
        'SELECT * FROM exam_sessions WHERE tenant_id=$1 AND session_id=$2 FOR UPDATE',
        [tenant, input.session_id],
      );
      if (!session)
        throw new NotFoundException('Examination session not found');
      if (!['DRAFT', 'OPEN', 'ACTIVE'].includes(session.status))
        throw new BadRequestException(
          'Closed or archived examination timetables cannot be changed',
        );
      if (
        !session.academic_year?.trim() ||
        !session.program_label?.trim() ||
        !Number.isSafeInteger(session.semester) ||
        session.semester < 1
      )
        throw new ConflictException(
          'The session must define its academic year, programme and semester',
        );
      // Derive the advisory identity with the exact database normalization
      // used by the conflict query, including Unicode/collation behavior.
      const canonical = await manager.query<Array<{ venue_key: unknown }>>(
        "SELECT lower(regexp_replace(btrim($1::text),'[[:space:]]+',' ','g')) AS venue_key",
        [input.venue],
      );
      if (
        canonical.length !== 1 ||
        typeof canonical[0].venue_key !== 'string' ||
        !canonical[0].venue_key.trim()
      )
        throw new ServiceUnavailableException(
          'The examination room identity could not be verified',
        );
      const venueKey = canonical[0].venue_key;
      // Serialize competing creates for the same room/date, including creates
      // for another session. This is not a lock on external source services.
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`exam-timetable:${tenant}:${input.exam_date}:${venueKey}`],
      );
      const actors = await manager.query<unknown[]>(
        'SELECT user_id FROM users WHERE tenant_id=$1 AND user_id=$2 AND is_active=true AND deleted_at IS NULL FOR SHARE',
        [tenant, actor],
      );
      if (actors.length !== 1)
        throw new ForbiddenException(
          'Active authenticated tenant actor required',
        );
      const issued = await manager.query<unknown[]>(
        `SELECT entry_id FROM exam_admit_card_entries
         WHERE tenant_id=$1 AND session_id=$2 AND issued_at IS NOT NULL LIMIT 1`,
        [tenant, session.session_id],
      );
      if (issued.length)
        throw new ConflictException(
          'This session already has issued hall tickets; its issued timetable must not be changed',
        );
      const released = await manager.query<unknown[]>(
        `SELECT exam_schedule_id FROM exam_schedules
         WHERE tenant_id=$1 AND session_id=$2 AND status='RELEASED' AND deleted_at IS NULL
         LIMIT 1 FOR SHARE`,
        [tenant, session.session_id],
      );
      if (released.length)
        throw new ConflictException(
          'This session timetable is officially released and cannot be changed through the preparation workflow',
        );
      const roster = await this.enrollment.listExamRegistrationRoster(
        tenant,
        {
          academic_year: session.academic_year,
          semester: session.semester,
          program_label: session.program_label,
        },
        manager,
      );
      if (!Array.isArray(roster))
        throw new ServiceUnavailableException(
          'The official enrollment roster is unavailable',
        );
      const recipients = roster.filter((student) =>
        student.enrollments.some(
          (item) => item.subject_id === input.subject_id,
        ),
      );
      if (!recipients.length)
        throw new BadRequestException(
          'The subject has no verified enrollment and allocation in this examination session',
        );
      if (
        new Set(recipients.map((student) => student.student_user_id)).size !==
          recipients.length ||
        recipients.some((student) => {
          const subjects = student.enrollments.filter(
            (item) => item.subject_id === input.subject_id,
          );
          return (
            !isUUID(student.student_user_id) ||
            student.semester !== session.semester ||
            !student.program_label?.trim() ||
            normalizeProgram(student.program_label) !==
              normalizeProgram(session.program_label) ||
            student.unresolved_reasons.length > 0 ||
            subjects.length !== 1 ||
            !isUUID(subjects[0].course_id) ||
            !subjects[0].subject_code?.trim() ||
            !subjects[0].subject_name?.trim()
          );
        })
      )
        throw new ConflictException(
          'The subject allocation is ambiguous or inconsistent; resolve the official academic source',
        );
      // Readiness requires one unambiguous slot for each registered subject.
      // The leading session lock serializes this check across rooms/times.
      // Do not infer which exam type or historical status may be ignored.
      const subjectSlots = await manager.query<unknown[]>(
        `SELECT exam_schedule_id FROM exam_schedules
         WHERE tenant_id=$1 AND session_id=$2 AND subject_id=$3 AND deleted_at IS NULL
         ORDER BY exam_schedule_id FOR UPDATE`,
        [tenant, session.session_id, input.subject_id],
      );
      if (subjectSlots.length)
        throw new ConflictException(
          'A timetable slot already exists for this session and subject; review the existing slot instead of creating an ambiguous hall ticket',
        );
      const conflicts = await manager.query<Schedule[]>(
        `SELECT exam_schedule_id, session_id, exam_type, subject_id,
                start_time::text, end_time::text FROM exam_schedules
         WHERE tenant_id=$1 AND exam_date=$2::date AND deleted_at IS NULL
           AND lower(regexp_replace(btrim(venue),'[[:space:]]+',' ','g'))=$3
           AND start_time<$5::time AND end_time>$4::time
         ORDER BY exam_schedule_id FOR UPDATE`,
        [tenant, input.exam_date, venueKey, start, end],
      );
      if (conflicts.length)
        throw new ConflictException(
          'The examination room is already allocated during this time',
        );
      const columns = [
        'tenant_id',
        'session_id',
        'exam_type',
        'subject_id',
        'exam_date',
        'start_time',
        'end_time',
        'venue',
        'batch_label',
        'status',
      ];
      const values: unknown[] = [
        tenant,
        session.session_id,
        input.exam_type,
        input.subject_id,
        input.exam_date,
        start,
        end,
        input.venue,
        input.batch_label ?? null,
        'SCHEDULED',
      ];
      // Preserve the existing database's max_marks default when omitted.
      if (input.max_marks != null) {
        columns.push('max_marks');
        values.push(input.max_marks);
      }
      const rows = await manager.query<Schedule[]>(
        `INSERT INTO exam_schedules (${columns.join(', ')})
         VALUES (${values.map((_, index) => `$${index + 1}`).join(', ')}) RETURNING *`,
        values,
      );
      if (rows.length !== 1)
        throw new ServiceUnavailableException(
          'The timetable could not be saved',
        );
      await this.audit.log(
        tenant,
        actor,
        {
          action: 'EXAM_TIMETABLE_CREATED',
          resource_type: 'exam_schedule',
          resource_id: rows[0].exam_schedule_id,
          new_value: {
            session_id: session.session_id,
            subject_id: input.subject_id,
            exam_date: input.exam_date,
            start_time: start,
            end_time: end,
            venue: input.venue,
          },
        },
        manager,
      );
      return rows;
    });
    // Prepared timetable slots are private until the authorized release.
    return committed;
  }

  /** Validate and release the complete session timetable as one audited action. */
  async releaseSession(
    tenant: string,
    actor: string,
    role: string | undefined,
    sessionId: string,
  ) {
    tenant = requireHallTicketTenant(tenant);
    assertExamCellAction(role, 'release_timetable');
    if (!isUUID(actor) || !isUUID(sessionId))
      throw new ForbiddenException(
        'Authenticated actor and explicit examination session are required',
      );

    const committed = await this.db.transaction(async (manager) => {
      const [session] = await manager.query<Session[]>(
        'SELECT * FROM exam_sessions WHERE tenant_id=$1 AND session_id=$2 FOR UPDATE',
        [tenant, sessionId],
      );
      if (!session)
        throw new NotFoundException('Examination session not found');
      if (!['DRAFT', 'OPEN', 'ACTIVE'].includes(session.status))
        throw new ConflictException(
          'A closed or archived session timetable cannot be released',
        );
      if (
        !session.academic_year?.trim() ||
        !session.program_label?.trim() ||
        !Number.isSafeInteger(session.semester) ||
        session.semester < 1
      )
        throw new ConflictException(
          'The session must define its academic year, programme and semester',
        );

      const actors = await manager.query<unknown[]>(
        'SELECT user_id FROM users WHERE tenant_id=$1 AND user_id=$2 AND is_active=true AND deleted_at IS NULL FOR SHARE',
        [tenant, actor],
      );
      if (actors.length !== 1)
        throw new ForbiddenException(
          'Active authenticated Exam Cell actor required',
        );

      // Session locking serializes all supported timetable creation/release
      // paths. Derive advisory keys with the same database normalization as
      // create(), then acquire them in a stable order before row locks.
      const candidateSlots = await manager.query<Schedule[]>(
        `SELECT exam_schedule_id, tenant_id, session_id, subject_id, exam_type,
                exam_date::text AS exam_date, start_time::text AS start_time,
                end_time::text AS end_time, venue, status
         FROM exam_schedules
         WHERE tenant_id=$1 AND session_id=$2 AND deleted_at IS NULL
         ORDER BY exam_schedule_id`,
        [tenant, sessionId],
      );
      if (!candidateSlots.length)
        throw new ConflictException(
          'Add a complete session timetable before releasing it',
        );
      const lockKeys = new Set<string>();
      for (const slot of candidateSlots) {
        if (
          !slot.exam_schedule_id ||
          !slot.exam_date ||
          !slot.start_time ||
          !slot.end_time ||
          slot.start_time >= slot.end_time ||
          !slot.venue?.trim()
        )
          throw new ConflictException(
            'Every timetable slot must have a valid date, time range and venue',
          );
        const canonical = await manager.query<Array<{ venue_key: unknown }>>(
          "SELECT lower(regexp_replace(btrim($1::text),'[[:space:]]+',' ','g')) AS venue_key",
          [slot.venue],
        );
        if (
          canonical.length !== 1 ||
          typeof canonical[0].venue_key !== 'string' ||
          !canonical[0].venue_key.trim()
        )
          throw new ServiceUnavailableException(
            'The examination room identity could not be verified',
          );
        lockKeys.add(
          `exam-timetable:${tenant}:${slot.exam_date}:${canonical[0].venue_key}`,
        );
      }
      for (const key of [...lockKeys].sort())
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [key],
        );

      const schedules = await manager.query<Schedule[]>(
        `SELECT exam_schedule_id, tenant_id, session_id, subject_id, exam_type,
                exam_date::text AS exam_date, start_time::text AS start_time,
                end_time::text AS end_time, venue, status
         FROM exam_schedules
         WHERE tenant_id=$1 AND session_id=$2 AND deleted_at IS NULL
         ORDER BY exam_schedule_id FOR UPDATE`,
        [tenant, sessionId],
      );
      if (
        schedules.length !== candidateSlots.length ||
        schedules.some(
          (slot) => !['SCHEDULED', 'RELEASED'].includes(slot.status ?? ''),
        )
      )
        throw new ConflictException(
          'The timetable changed or contains an unsupported status; reload and review it',
        );
      if (schedules.every((slot) => slot.status === 'RELEASED')) {
        const releaseAudit = await manager.query<unknown[]>(
          `SELECT audit_id FROM exam_audit_logs
           WHERE tenant_id=$1 AND resource_type='exam_session' AND resource_id=$2
             AND action='EXAM_TIMETABLE_RELEASED'
             AND new_value @> $3::jsonb
           ORDER BY created_at DESC LIMIT 1 FOR SHARE`,
          [
            tenant,
            sessionId,
            JSON.stringify(
              schedules.map((slot) => ({
                exam_schedule_id: slot.exam_schedule_id,
                status: 'RELEASED',
              })),
            ),
          ],
        );
        if (releaseAudit.length !== 1)
          throw new ConflictException(
            'Released timetable status has no matching audit record; administrator review is required',
          );
        return { schedules, notifications: [] as Array<Record<string, string>> };
      }
      if (schedules.some((slot) => slot.status === 'RELEASED'))
        throw new ConflictException(
          'A partially released session timetable requires administrator review',
        );

      const issued = await manager.query<unknown[]>(
        `SELECT entry_id FROM exam_admit_card_entries
         WHERE tenant_id=$1 AND session_id=$2 AND issued_at IS NOT NULL LIMIT 1 FOR SHARE`,
        [tenant, sessionId],
      );
      if (issued.length)
        throw new ConflictException(
          'A session with issued Hall Tickets cannot change timetable release state',
        );

      const roster = await this.enrollment.listExamRegistrationRoster(
        tenant,
        {
          academic_year: session.academic_year,
          semester: session.semester,
          program_label: session.program_label,
        },
        manager,
      );
      if (!Array.isArray(roster) || !roster.length)
        throw new ServiceUnavailableException(
          'The official enrollment roster is unavailable or empty',
        );
      const expectedSubjects = new Set<number>();
      const subjectsByStudent = new Map<string, Set<number>>();
      for (const student of roster) {
        if (
          !isUUID(student.student_user_id) ||
          student.semester !== session.semester ||
          !student.program_label?.trim() ||
          normalizeProgram(student.program_label) !==
            normalizeProgram(session.program_label) ||
          !Array.isArray(student.unresolved_reasons) ||
          student.unresolved_reasons.length > 0 ||
          !Array.isArray(student.enrollments) ||
          !student.enrollments.length
        )
          throw new ConflictException(
            'The official enrollment roster contains unresolved or inconsistent student data',
          );
        const studentSubjects = new Set<number>();
        if (subjectsByStudent.has(student.student_user_id))
          throw new ConflictException(
            'The official enrollment roster contains duplicate student records',
          );
        for (const enrollment of student.enrollments) {
          if (
            typeof enrollment.subject_id !== 'number' ||
            !Number.isSafeInteger(enrollment.subject_id) ||
            enrollment.subject_id < 1 ||
            !isUUID(enrollment.course_id) ||
            !enrollment.subject_code?.trim() ||
            !enrollment.subject_name?.trim() ||
            studentSubjects.has(enrollment.subject_id)
          )
            throw new ConflictException(
              'Subject allocations are missing, invalid or ambiguous',
            );
          studentSubjects.add(enrollment.subject_id);
          expectedSubjects.add(enrollment.subject_id);
        }
        subjectsByStudent.set(student.student_user_id, studentSubjects);
      }
      if (!expectedSubjects.size)
        throw new ConflictException(
          'No verified subject allocations exist for this session',
        );

      const slotsBySubject = new Map<number, Schedule[]>();
      for (const slot of schedules) {
        const rows = slotsBySubject.get(slot.subject_id) ?? [];
        rows.push(slot);
        slotsBySubject.set(slot.subject_id, rows);
      }
      if (
        schedules.some((slot) => !expectedSubjects.has(slot.subject_id)) ||
        [...expectedSubjects].some(
          (subjectId) => slotsBySubject.get(subjectId)?.length !== 1,
        )
      )
        throw new ConflictException(
          'Each officially allocated subject must have exactly one timetable slot',
        );

      for (const studentSubjects of subjectsByStudent.values()) {
        const studentSlots = [...studentSubjects].flatMap(
          (subjectId) => slotsBySubject.get(subjectId) ?? [],
        );
        for (let left = 0; left < studentSlots.length; left++) {
          for (let right = left + 1; right < studentSlots.length; right++) {
            const first = studentSlots[left];
            const second = studentSlots[right];
            if (
              first.exam_date === second.exam_date &&
              first.start_time < second.end_time &&
              second.start_time < first.end_time
            )
              throw new ConflictException(
                'A student has overlapping examination slots in this session',
              );
          }
        }
      }

      for (const slot of schedules) {
        const canonical = await manager.query<Array<{ venue_key: unknown }>>(
          "SELECT lower(regexp_replace(btrim($1::text),'[[:space:]]+',' ','g')) AS venue_key",
          [slot.venue],
        );
        const venueKey = canonical[0]?.venue_key;
        if (typeof venueKey !== 'string' || !venueKey.trim())
          throw new ServiceUnavailableException(
            'The examination room identity could not be verified',
          );
        const conflicts = await manager.query<unknown[]>(
          `SELECT exam_schedule_id FROM exam_schedules
           WHERE tenant_id=$1 AND exam_date=$2::date AND deleted_at IS NULL
             AND status <> 'CANCELLED'
             AND lower(regexp_replace(btrim(venue),'[[:space:]]+',' ','g'))=$3
             AND start_time<$5::time AND end_time>$4::time
             AND exam_schedule_id<>$6
           ORDER BY exam_schedule_id FOR SHARE`,
          [
            tenant,
            slot.exam_date,
            venueKey,
            slot.start_time,
            slot.end_time,
            slot.exam_schedule_id,
          ],
        );
        if (conflicts.length)
          throw new ConflictException(
            'The examination room has a conflicting timetable allocation',
          );
      }

      const [released, releasedCount] = await manager.query<
        [Schedule[], number]
      >(
        `UPDATE exam_schedules SET status='RELEASED'
         WHERE tenant_id=$1 AND session_id=$2 AND deleted_at IS NULL AND status='SCHEDULED'
         RETURNING exam_schedule_id, tenant_id, session_id, subject_id, exam_type,
                   exam_date::text AS exam_date, start_time::text AS start_time,
                   end_time::text AS end_time, venue, status`,
        [tenant, sessionId],
      );
      if (
        releasedCount !== schedules.length ||
        released.length !== schedules.length
      )
        throw new ConflictException(
          'The timetable changed during release; reload the session',
        );
      await this.audit.log(
        tenant,
        actor,
        {
          action: 'EXAM_TIMETABLE_RELEASED',
          resource_type: 'exam_session',
          resource_id: sessionId,
          old_value: schedules.map((slot) => ({
            exam_schedule_id: slot.exam_schedule_id,
            status: slot.status,
          })),
          new_value: released.map((slot) => ({
            exam_schedule_id: slot.exam_schedule_id,
            status: slot.status,
          })),
        },
        manager,
      );
      const notifications: Array<{
        userId: string;
        courseName: string;
        changeSummary: string;
      }> = [];
      for (const student of roster) {
        for (const enrollment of student.enrollments) {
          if (typeof enrollment.subject_id !== 'number') continue;
          const slot = slotsBySubject.get(enrollment.subject_id)?.[0];
          if (!slot) continue;
          notifications.push({
            userId: student.student_user_id,
            courseName: `${enrollment.subject_code} — ${enrollment.subject_name}`,
            changeSummary: `${slot.exam_type.replace(/_/g, ' ')} on ${slot.exam_date} ${slot.start_time}–${slot.end_time} at ${slot.venue}`,
          });
        }
      }
      return { schedules: released, notifications };
    });
    // Notify only after the audited release commits. An idempotent retry
    // returns no notifications, preventing duplicate release alerts.
    for (const notice of committed.notifications) {
      try {
        await this.events.emitAsync(
          NotificationEvents.ACADEMICS_TIMETABLE_CHANGED,
          {
            tenantId: tenant,
            userId: notice.userId,
            courseName: notice.courseName,
            changeSummary: notice.changeSummary,
          },
        );
      } catch {
        this.logger.warn(
          `Timetable release committed, but notification scheduling failed for session ${sessionId}`,
        );
      }
    }
    return committed.schedules;
  }
}
