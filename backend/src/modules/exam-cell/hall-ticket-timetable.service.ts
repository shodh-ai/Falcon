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
  exam_type: string;
  subject_id: number;
  start_time: string;
  end_time: string;
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
      const subject = recipients[0].enrollments.find(
        (item) => item.subject_id === input.subject_id,
      )!;
      return {
        rows,
        recipients: recipients.map((student) => student.student_user_id),
        courseName: `${subject.subject_code} — ${subject.subject_name}`,
      };
    });
    // Publication/issuance is not performed here. Notifications describe only
    // the committed timetable creation, never an approval or issued ticket.
    for (const student of committed.recipients) {
      try {
        await this.events.emitAsync(
          NotificationEvents.ACADEMICS_TIMETABLE_CHANGED,
          {
            tenantId: tenant,
            userId: student,
            courseName: committed.courseName,
            changeSummary: `${input.exam_type.replace(/_/g, ' ')} on ${input.exam_date} ${start}–${end} at ${input.venue}`,
          },
        );
      } catch {
        this.logger.warn(
          `Timetable committed, but notification scheduling failed for session ${input.session_id}`,
        );
      }
    }
    return committed.rows;
  }
}
