import { isUUID } from 'class-validator';
import { requireTenantId } from '../../common/utils/require-tenant-id';
import { ExamDayScriptsService } from './exam-day-scripts.service';
import { CreateAnswerSheetDto, UpdateAnswerSheetStatusDto } from './dto/exam-day.dto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AttendanceEligibilityService } from '../attendance-policy/attendance-eligibility.service';
import { FinanceService } from '../finance/finance.service';
import { ExamCellAuditService } from './exam-cell-audit.service';

export type EligibilityCategory =
  | 'ELIGIBLE'
  | 'ATTENDANCE_SHORTAGE'
  | 'FEE_PENDING'
  | 'INTERNAL_MARKS_PENDING'
  | 'DOCUMENTS_PENDING'
  | 'MEDICAL_CASE'
  | 'DISCIPLINARY_HOLD'
  | 'DEBARRED';

const HALL_TICKET_FLOW = [
  'REGISTRATION',
  'ELIGIBILITY',
  'FINANCE',
  'EXAM_OFFICE',
  'COE',
  'APPROVED',
];

@Injectable()
export class ExamCellEnterpriseService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly attendanceEligibility: AttendanceEligibilityService,
    private readonly finance: FinanceService,
    private readonly audit: ExamCellAuditService,
    @Optional() private readonly examDayScripts?: ExamDayScriptsService,
  ) {}

  private async queryOrEmpty<T extends Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    try {
      return await this.db.query(sql, params);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        /relation .* does not exist|column .* does not exist/i.test(message)
      ) {
        return [];
      }
      throw err;
    }
  }

  /* ── 1. Examination Calendar ── */

  async listCalendarEvents(
    tenantId: string,
    filters: {
      from?: string;
      to?: string;
      event_type?: string;
      semester?: number;
    },
  ) {
    const from = this.validateDateFilter(filters.from, 'from');
    const to = this.validateDateFilter(filters.to, 'to');
    if (from && to && from > to) {
      throw new BadRequestException('Calendar date range is invalid');
    }
    const params: unknown[] = [tenantId];
    let sql = `SELECT *, event_date::text AS event_date, end_date::text AS end_date FROM exam_calendar_events WHERE tenant_id = $1`;
    if (from) {
      params.push(from);
      sql += ` AND event_date >= $${params.length}::date`;
    }
    if (to) {
      params.push(to);
      sql += ` AND event_date <= $${params.length}::date`;
    }
    if (filters.event_type) {
      params.push(filters.event_type);
      sql += ` AND event_type = $${params.length}`;
    }
    if (filters.semester) {
      params.push(filters.semester);
      sql += ` AND (semester IS NULL OR semester = $${params.length})`;
    }
    sql += ' ORDER BY exam_calendar_events.event_date, start_time NULLS LAST';

    const [customEvents, scheduleEvents] = await Promise.all([
      this.queryOrEmpty(sql, params),
      this.db.query(
        `SELECT es.exam_schedule_id, es.exam_type, es.exam_date::text AS exam_date, es.start_time, es.end_time,
                es.venue, es.batch_label, sub.subject_name, sub.subject_code
         FROM exam_schedules es
         LEFT JOIN academic_subjects sub ON sub.subject_id = es.subject_id
         WHERE es.tenant_id = $1
           ${from ? 'AND es.exam_date >= $2::date' : ''}
           ${to ? `AND es.exam_date <= $${from ? 3 : 2}::date` : ''}
         ORDER BY es.exam_date, es.start_time`,
        [tenantId, ...(from ? [from] : []), ...(to ? [to] : [])],
      ),
    ]);

    const mappedSchedules = scheduleEvents.map(
      (s: Record<string, unknown>) => ({
        event_id: `schedule-${s.exam_schedule_id}`,
        source: 'SCHEDULE',
        title: `${s.subject_name ?? s.exam_type} — ${s.venue ?? 'TBA'}`,
        event_type: String(s.exam_type ?? 'EXAM').includes('PRACTICAL')
          ? 'PRACTICAL'
          : String(s.exam_type).includes('VIVA')
            ? 'VIVA'
            : String(s.exam_type).includes('MID')
              ? 'MID_SEMESTER'
              : 'END_SEMESTER',
        event_date: s.exam_date,
        start_time: s.start_time,
        end_time: s.end_time,
        color_code: '#1e3a5f',
        description: s.batch_label,
        exam_schedule_id: s.exam_schedule_id,
      }),
    );

    return [
      ...customEvents.map((e) => ({ ...e, source: 'CALENDAR' })),
      ...mappedSchedules,
    ];
  }

  private validateDateFilter(
    value: string | undefined,
    name: string,
  ): string | undefined {
    if (value == null || value === '') return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException(`Invalid calendar ${name} date`);
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException(`Invalid calendar ${name} date`);
    }
    return value;
  }

  async createCalendarEvent(
    tenantId: string,
    actorUserId: string,
    dto: Record<string, unknown>,
  ) {
    return this.db.transaction(async (manager) => {
      const [row] = await manager.query<Array<Record<string, unknown>>>(
        `INSERT INTO exam_calendar_events
         (tenant_id, title, event_type, event_date, end_date, start_time, end_time,
          department, program_label, semester, color_code, description, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *, event_date::text AS event_date, end_date::text AS end_date`,
        [
          tenantId,
          dto.title,
          dto.event_type ?? 'OTHER',
          dto.event_date,
          dto.end_date ?? null,
          dto.start_time ?? null,
          dto.end_time ?? null,
          dto.department ?? null,
          dto.program_label ?? null,
          dto.semester ?? null,
          dto.color_code ?? '#1e3a5f',
          dto.description ?? null,
          actorUserId,
        ],
      );
      if (!row)
        throw new BadRequestException('Could not create calendar event');
      await this.audit.log(
        tenantId,
        actorUserId,
        {
          action: 'CALENDAR_EVENT_CREATED',
          resource_type: 'exam_calendar_event',
          resource_id: String(row.event_id),
        },
        manager,
      );
      return row;
    });
  }

  async updateCalendarEventDate(
    tenantId: string,
    eventId: string,
    actorUserId: string,
    eventDate: string,
  ) {
    return this.db.transaction(async (manager) => {
      const [row] = await manager.query<Array<Record<string, unknown>>>(
        `WITH updated AS (UPDATE exam_calendar_events SET event_date = $3, updated_at = NOW()
         WHERE tenant_id = $1 AND event_id = $2 RETURNING *) SELECT *, event_date::text AS event_date, end_date::text AS end_date FROM updated`,
        [tenantId, eventId, eventDate],
      );
      if (!row) throw new NotFoundException('Calendar event not found');
      await this.audit.log(
        tenantId,
        actorUserId,
        {
          action: 'CALENDAR_EVENT_RESCHEDULED',
          resource_type: 'exam_calendar_event',
          resource_id: eventId,
          new_value: { event_date: eventDate },
        },
        manager,
      );
      return row;
    });
  }

  /* ── 2. Student Eligibility Dashboard ── */

  async eligibilityDashboard(tenantId: string, semester: number) {
    const students = await this.db.query(
      `SELECT DISTINCT u.user_id, u.name, sp.enrollment_number, sp.prn_number
       FROM users u
       JOIN student_course_enrollments e ON e.student_user_id = u.user_id AND e.tenant_id = $1
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       WHERE u.tenant_id = $1 AND e.semester = $2
       ORDER BY u.name`,
      [tenantId, semester],
    );

    const items: Array<{
      student_user_id: string;
      name: string;
      enrollment_number: string | null;
      category: EligibilityCategory;
      attendance_percent: number;
      fee_clear: boolean;
      block_reasons: string[];
    }> = [];

    for (const s of students) {
      const category = await this.categorizeStudent(
        tenantId,
        s.user_id,
        semester,
      );
      items.push({
        student_user_id: s.user_id,
        name: s.name,
        enrollment_number: s.enrollment_number ?? s.prn_number,
        ...category,
      });
    }

    const summary = items.reduce(
      (acc, i) => {
        acc[i.category] = (acc[i.category] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return { semester, total: items.length, summary, items };
  }

  private async categorizeStudent(
    tenantId: string,
    studentUserId: string,
    semester: number,
  ) {
    const [attendance, pendingDues, ufm, pendingDocs, pendingMarks] =
      await Promise.all([
        this.attendanceEligibility.evaluate(tenantId, studentUserId, {
          context: 'EXAM_DESK',
        }),
        this.finance.getPendingDues(studentUserId, tenantId),
        this.db.query(
          `SELECT COUNT(*)::int AS c FROM ufm_cases
         WHERE tenant_id = $1 AND student_user_id = $2 AND status != 'CLOSED'`,
          [tenantId, studentUserId],
        ),
        this.queryOrEmpty<{ c: number }>(
          `SELECT COUNT(*)::int AS c FROM student_exam_documents
         WHERE tenant_id = $1 AND student_user_id = $2 AND verification_status = 'PENDING'`,
          [tenantId, studentUserId],
        ),
        this.db.query(
          `SELECT COUNT(*)::int AS c FROM academic_marks
         WHERE tenant_id = $1 AND student_user_id = $2 AND status = 'DRAFT'`,
          [tenantId, studentUserId],
        ),
      ]);

    const blockReasons: string[] = [];
    let category: EligibilityCategory = 'ELIGIBLE';

    if (ufm[0]?.c > 0) {
      category = 'DEBARRED';
      blockReasons.push('Open UFM case');
    } else if (!attendance.eligible) {
      category = attendance.reason?.toLowerCase().includes('medical')
        ? 'MEDICAL_CASE'
        : 'ATTENDANCE_SHORTAGE';
      if (attendance.reason) blockReasons.push(attendance.reason);
    } else if (pendingDues.length > 0) {
      category = 'FEE_PENDING';
      blockReasons.push('Pending fee dues');
    } else if (pendingMarks[0]?.c > 0) {
      category = 'INTERNAL_MARKS_PENDING';
      blockReasons.push('Internal marks not submitted');
    } else if ((pendingDocs[0]?.c ?? 0) > 0) {
      category = 'DOCUMENTS_PENDING';
      blockReasons.push('Exam documents pending verification');
    }

    return {
      category,
      attendance_percent: attendance.attendance_percent ?? 0,
      fee_clear: pendingDues.length === 0,
      block_reasons: blockReasons,
    };
  }

  /* ── 3. Hall Ticket Approval Workflow ── */

  async syncHallTicketApprovals(
    tenantId: string,
    semester: number,
    batchLabel: string,
    actorUserId?: string,
  ) {
    if (
      !Number.isInteger(semester) ||
      semester < 1 ||
      typeof batchLabel !== 'string' ||
      !batchLabel.trim() ||
      batchLabel.trim().length > 80
    )
      throw new BadRequestException(
        'A valid semester and batch label are required',
      );
    const dash = await this.eligibilityDashboard(tenantId, semester);
    return this.db.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [
          `hall-ticket-approval-sync:${tenantId}:${semester}:${batchLabel.trim()}`,
        ],
      );
      let updated = 0;
      for (const item of [...dash.items].sort((a, b) =>
        a.student_user_id.localeCompare(b.student_user_id),
      )) {
        const stage =
          item.category === 'ELIGIBLE'
            ? 'ELIGIBILITY'
            : item.category === 'FEE_PENDING'
              ? 'FINANCE'
              : 'REGISTRATION';

        const changed = await manager.query<Array<{ approval_id: string }>>(
          `INSERT INTO hall_ticket_approvals
             (tenant_id, student_user_id, semester, batch_label, stage, block_reasons,
              eligibility_status, finance_status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (tenant_id, student_user_id, semester, batch_label)
           DO UPDATE SET
             block_reasons = EXCLUDED.block_reasons,
             eligibility_status = EXCLUDED.eligibility_status,
             finance_status = EXCLUDED.finance_status,
             updated_at = NOW()
           WHERE (hall_ticket_approvals.block_reasons, hall_ticket_approvals.eligibility_status, hall_ticket_approvals.finance_status)
             IS DISTINCT FROM (EXCLUDED.block_reasons, EXCLUDED.eligibility_status, EXCLUDED.finance_status)
           RETURNING approval_id`,
          [
            tenantId,
            item.student_user_id,
            semester,
            batchLabel.trim(),
            stage,
            JSON.stringify(item.block_reasons),
            item.category === 'ELIGIBLE' ? 'APPROVED' : 'PENDING',
            item.fee_clear ? 'APPROVED' : 'PENDING',
          ],
        );
        updated += changed.length;
      }
      await this.audit.log(
        tenantId,
        actorUserId,
        {
          action: 'HALL_TICKET_QUEUE_SYNCED',
          resource_type: 'hall_ticket_approval',
          new_value: {
            semester,
            batch_label: batchLabel.trim(),
            processed: dash.items.length,
            updated,
            existing_stages_preserved: true,
          },
        },
        manager,
      );
      return { synced: dash.items.length, total: dash.items.length, updated };
    });
  }

  async listHallTicketApprovals(
    tenantId: string,
    filters: {
      semester?: number;
      batch_label?: string;
      stage?: string;
      page?: number;
      limit?: number;
      search?: string;
    },
  ) {
    const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
    const page = Math.max(Number(filters.page) || 1, 1);
    const offset = (page - 1) * limit;
    const params: unknown[] = [tenantId];
    let sql = `
      FROM hall_ticket_approvals a
      JOIN users u ON u.user_id = a.student_user_id
      LEFT JOIN student_profiles sp ON sp.user_id = a.student_user_id
      WHERE a.tenant_id = $1`;
    if (filters.semester) {
      params.push(filters.semester);
      sql += ` AND a.semester = $${params.length}`;
    }
    if (filters.batch_label) {
      params.push(filters.batch_label);
      sql += ` AND a.batch_label = $${params.length}`;
    }
    if (filters.stage) {
      params.push(filters.stage);
      sql += ` AND a.stage = $${params.length}`;
    }
    if (filters.search?.trim()) {
      params.push(`%${filters.search.trim()}%`);
      sql += ` AND (u.name ILIKE $${params.length} OR sp.enrollment_number ILIKE $${params.length})`;
    }

    const countRows = await this.queryOrEmpty<{ c: number }>(
      `SELECT COUNT(*)::int AS c ${sql}`,
      params,
    );
    params.push(limit, offset);
    const rows = await this.queryOrEmpty(
      `SELECT a.*, u.name AS student_name, sp.enrollment_number ${sql}
       ORDER BY u.name LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return {
      data: rows,
      total: Number(countRows[0]?.c ?? 0),
      limit,
      offset,
    };
  }

  async advanceHallTicketApproval(
    tenantId: string,
    approvalId: string,
    actorUserId: string,
    action: 'APPROVE' | 'REJECT',
    stage?: string,
  ) {
    if (
      !['APPROVE', 'REJECT'].includes(action) ||
      (stage !== undefined && typeof stage !== 'string')
    )
      throw new BadRequestException('A valid approval action is required');
    return this.db.transaction(async (manager) => {
      const [current] = await manager.query<Array<Record<string, unknown>>>(
        `SELECT * FROM hall_ticket_approvals WHERE tenant_id = $1 AND approval_id = $2 FOR UPDATE`,
        [tenantId, approvalId],
      );
      if (!current) throw new NotFoundException('Approval record not found');

      const currentStage = String(current.stage);
      if (['APPROVED', 'REJECTED'].includes(currentStage)) {
        if (
          ((action === 'APPROVE' && currentStage === 'APPROVED') ||
            (action === 'REJECT' && currentStage === 'REJECTED')) &&
          (stage === undefined || stage === currentStage)
        )
          return current;
        throw new BadRequestException(
          'A completed or rejected approval cannot be advanced or reversed',
        );
      }
      const index = HALL_TICKET_FLOW.indexOf(currentStage);
      if (index < 0)
        throw new BadRequestException('Unknown hall-ticket approval stage');
      const nextStage =
        action === 'REJECT' ? 'REJECTED' : HALL_TICKET_FLOW[index + 1];
      if (stage !== undefined && stage !== nextStage)
        throw new BadRequestException(
          'Hall-ticket approval must advance exactly one stage',
        );

      const [row] = await manager.query<Array<Record<string, unknown>>>(
        `WITH updated AS (UPDATE hall_ticket_approvals
       SET stage = $3::varchar, approved_by = $4, approved_at = CASE WHEN $3::varchar = 'APPROVED' THEN NOW() ELSE approved_at END, updated_at = NOW(),
           coe_status = CASE WHEN $3::varchar = 'APPROVED' THEN 'APPROVED' ELSE coe_status END
       WHERE tenant_id = $1 AND approval_id = $2
       RETURNING *) SELECT * FROM updated`,
        [tenantId, approvalId, nextStage, actorUserId],
      );

      await this.audit.log(
        tenantId,
        actorUserId,
        {
          action:
            action === 'REJECT'
              ? 'HALL_TICKET_REJECTED'
              : 'HALL_TICKET_APPROVED',
          resource_type: 'hall_ticket_approval',
          resource_id: approvalId,
          old_value: { stage: currentStage },
          new_value: { stage: nextStage },
        },
        manager,
      );
      return row;
    });
  }

  async bulkApproveHallTickets(
    tenantId: string,
    actorUserId: string,
    dto: { semester: number; batch_label: string; target_stage: string },
  ) {
    const index = HALL_TICKET_FLOW.indexOf(dto.target_stage);
    if (
      index < 1 ||
      !Number.isInteger(dto.semester) ||
      dto.semester < 1 ||
      typeof dto.batch_label !== 'string' ||
      !dto.batch_label.trim() ||
      dto.batch_label.trim().length > 80
    )
      throw new BadRequestException(
        'A valid next stage, semester and batch label are required',
      );
    return this.db.transaction(async (manager) => {
      const result = await manager.query<Array<{ approval_id: string }>>(
        `WITH updated AS (UPDATE hall_ticket_approvals
       SET stage = $4::varchar, approved_by = $5,
           approved_at = CASE WHEN $4::varchar = 'APPROVED' THEN NOW() ELSE approved_at END, updated_at = NOW(),
           coe_status = CASE WHEN $4::varchar = 'APPROVED' THEN 'APPROVED' ELSE coe_status END
       WHERE tenant_id = $1 AND semester = $2 AND batch_label = $3
         AND stage = $6::varchar
       RETURNING approval_id) SELECT * FROM updated`,
        [
          tenantId,
          dto.semester,
          dto.batch_label.trim(),
          dto.target_stage,
          actorUserId,
          HALL_TICKET_FLOW[index - 1],
        ],
      );
      await this.audit.log(
        tenantId,
        actorUserId,
        {
          action: 'HALL_TICKET_BULK_APPROVED',
          resource_type: 'hall_ticket_approval',
          new_value: {
            count: result.length,
            target_stage: dto.target_stage,
            previous_stage: HALL_TICKET_FLOW[index - 1],
          },
        },
        manager,
      );
      return { approved: result.length };
    });
  }

  /* ── 5. Auto Invigilator Assignment ── */

  async autoAssignInvigilators(
    tenantId: string,
    examScheduleId: string,
    actorUserId: string,
  ) {
    const [schedule] = await this.db.query(
      `SELECT * FROM exam_schedules WHERE tenant_id = $1 AND exam_schedule_id = $2`,
      [tenantId, examScheduleId],
    );
    if (!schedule) throw new NotFoundException('Exam schedule not found');

    const rooms = await this.db.query(
      `SELECT DISTINCT room FROM exam_seating_allocations
       WHERE tenant_id = $1 AND exam_schedule_id = $2`,
      [tenantId, examScheduleId],
    );

    const faculty = await this.db.query(
      `SELECT u.user_id, u.name FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND r.role_name = 'Faculty'
       ORDER BY u.name`,
      [tenantId],
    );

    const examDate = schedule.exam_date;
    let assigned = 0;

    for (const roomRow of rooms) {
      const room = roomRow.room as string;
      const available: Array<{ user_id: string; name: string }> = [];
      for (const f of faculty) {
        const conflicts = await this.db.query(
          `SELECT COUNT(*)::int AS c FROM exam_invigilation_duties d
           JOIN exam_schedules es ON es.exam_schedule_id = d.exam_schedule_id
           WHERE d.tenant_id = $1 AND d.faculty_user_id = $2 AND es.exam_date = $3`,
          [tenantId, f.user_id, examDate],
        );
        const onLeave = await this.db
          .query(
            `SELECT COUNT(*)::int AS c FROM hr_leave_requests
           WHERE user_id = $1 AND status = 'APPROVED'
             AND $2::date BETWEEN start_date AND end_date`,
            [f.user_id, examDate],
          )
          .catch(() => [{ c: 0 }]);

        if ((conflicts[0]?.c ?? 0) < 2 && (onLeave[0]?.c ?? 0) === 0) {
          available.push(f);
        }
      }

      const pick = available[assigned % Math.max(available.length, 1)];
      if (!pick) continue;

      await this.db.query(
        `INSERT INTO exam_invigilation_duties
           (tenant_id, exam_schedule_id, room, faculty_user_id, status)
         VALUES ($1,$2,$3,$4,'ASSIGNED')
         ON CONFLICT (exam_schedule_id, room, faculty_user_id) DO NOTHING`,
        [tenantId, examScheduleId, room, pick.user_id],
      );
      assigned++;
    }

    await this.audit.log(tenantId, actorUserId, {
      action: 'INVIGILATORS_AUTO_ASSIGNED',
      resource_type: 'exam_schedule',
      resource_id: examScheduleId,
      new_value: { assigned },
    });
    return { assigned, rooms: rooms.length };
  }

  /* ── 6. Answer Sheet Tracking ── */

  listAnswerSheets(
    tenantId: string,
    status?: string,
    scheduleId?: string,
    role?: string,
  ) {
    if (!this.examDayScripts)
      throw new ServiceUnavailableException(
        'Exam-day script tracking is unavailable',
      );
    return this.examDayScripts.list(tenantId, status, scheduleId, role);
  }

  async createAnswerSheet(
    tenantId: string,
    actorUserId: string,
    dto: CreateAnswerSheetDto,
    role?: string,
  ) {
    if (!this.examDayScripts)
      throw new ServiceUnavailableException(
        'Exam-day script tracking is unavailable',
      );
    return this.examDayScripts.create(tenantId, actorUserId, dto, role);
  }

  async updateAnswerSheetStatus(
    tenantId: string,
    sheetId: string,
    actorUserId: string,
    dto: UpdateAnswerSheetStatusDto,
    role?: string,
  ) {
    if (!this.examDayScripts)
      throw new ServiceUnavailableException(
        'Exam-day script tracking is unavailable',
      );
    return this.examDayScripts.transition(
      tenantId,
      sheetId,
      actorUserId,
      dto,
      role,
    );
  }

  /* ── 7. Student Identity Verification ── */

  async verifyStudentByQr(
    tenantId: string,
    actorUserId: string,
    qrPayload: string,
  ) {
    const payload = String(qrPayload ?? '').trim();
    if (!payload) {
      throw new BadRequestException(
        'Enter an enrollment number or scan a hall ticket QR',
      );
    }

    const studentMatch = payload.match(
      /student:([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i,
    );
    const bareUuid = payload.match(
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,
    );
    const studentUserId = studentMatch?.[1] ?? bareUuid?.[0];

    const studentSelect = `
      SELECT u.user_id, u.name, sp.profile_photo_url AS profile_picture_url,
             sp.enrollment_number, sp.prn_number,
             sp.branch_name,
             sp.branch_name AS branch,
             e.semester
      FROM users u
      JOIN roles student_role ON student_role.role_id = u.role_id AND student_role.role_name = 'Student'
      JOIN student_profiles sp ON sp.user_id = u.user_id AND sp.tenant_id = u.tenant_id
      LEFT JOIN LATERAL (
        SELECT semester FROM student_course_enrollments
        WHERE student_user_id = u.user_id AND tenant_id = u.tenant_id ORDER BY semester DESC LIMIT 1
      ) e ON true
    `;

    let student: Record<string, unknown> | undefined;

    if (studentUserId) {
      const rows = await this.queryOrEmpty<Record<string, unknown>>(
        `${studentSelect}
         WHERE u.user_id = $1::uuid AND u.tenant_id = $2 AND u.is_active = true
         LIMIT 1`,
        [studentUserId, tenantId],
      );
      student = rows[0];
    }

    if (!student && !studentUserId) {
      const rows = await this.queryOrEmpty<Record<string, unknown>>(
        `${studentSelect}
         WHERE u.tenant_id = $1 AND u.is_active = true
           AND (
             LOWER(TRIM(COALESCE(sp.enrollment_number, ''))) = LOWER($2)
             OR LOWER(TRIM(COALESCE(sp.enrollment_no, ''))) = LOWER($2)
             OR LOWER(TRIM(COALESCE(sp.prn_number, ''))) = LOWER($2)
             OR LOWER(TRIM(u.name)) = LOWER($2)
           )
         LIMIT 2`,
        [tenantId, payload],
      );
      if (rows.length > 1) {
        throw new BadRequestException(
          'Multiple students match this identifier. Use an exact enrollment number, PRN, or hall ticket QR.',
        );
      }
      student = rows[0];
    }

    if (!student) {
      throw new NotFoundException(
        'Student not found. Try enrollment number, PRN, or a hall ticket QR payload.',
      );
    }

    const seating = await this.queryOrEmpty<{
      room: string;
      seat_number: string;
      subject_name: string;
      exam_date: string;
    }>(
      `SELECT esa.room, esa.seat_number, es.exam_date, es.exam_type, sub.subject_name
       FROM exam_seating_allocations esa
       JOIN exam_schedules es ON es.exam_schedule_id = esa.exam_schedule_id AND es.tenant_id = esa.tenant_id
       LEFT JOIN academic_subjects sub ON sub.subject_id = es.subject_id
       WHERE esa.student_user_id = $1 AND esa.tenant_id = $2
       ORDER BY es.exam_date DESC
       LIMIT 5`,
      [student.user_id, tenantId],
    );

    const schedules = await this.queryOrEmpty(
      `SELECT es.*, sub.subject_name FROM exam_schedules es
       LEFT JOIN academic_subjects sub ON sub.subject_id = es.subject_id
       WHERE es.tenant_id = $1 AND es.exam_date >= CURRENT_DATE
         AND EXISTS (SELECT 1 FROM student_course_enrollments e
           JOIN academic_courses c ON c.course_id = e.course_id AND c.tenant_id = e.tenant_id
           WHERE e.tenant_id = es.tenant_id AND e.student_user_id = $2
             AND c.course_code = sub.subject_code AND e.semester = sub.semester)
       ORDER BY es.exam_date LIMIT 5`,
      [tenantId, student.user_id],
    );

    await this.db.query(
      `INSERT INTO student_identity_verifications
         (tenant_id, student_user_id, qr_payload, verified, verified_by, verified_at)
       VALUES ($1,$2,$3,true,$4,NOW())`,
      [tenantId, student.user_id, payload, actorUserId],
    );

    return {
      student: {
        user_id: student.user_id,
        name: student.name,
        enrollment_number: student.enrollment_number ?? null,
        profile_picture_url: student.profile_picture_url ?? null,
        branch: student.branch_name ?? student.branch ?? null,
        branch_name: student.branch_name ?? null,
        semester: student.semester ?? null,
      },
      seating,
      upcoming_exams: schedules,
      verified: true,
    };
  }

  /* ── 9. Live Examination Dashboard ── */

  async liveDashboard(tenantId: string) {
    const today = new Date().toISOString().slice(0, 10);
    const [
      [runningExams],
      [present],
      [absent],
      [activeRooms],
      [invigilators],
      [lateEntries],
      [ufmToday],
      [pendingIncidents],
    ] = await Promise.all([
      this.db.query(
        `SELECT COUNT(*)::int AS c FROM exam_schedules
         WHERE tenant_id = $1 AND exam_date = $2`,
        [tenantId, today],
      ),
      this.queryOrEmpty<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM exam_day_attendance
         WHERE tenant_id = $1 AND status = 'PRESENT'
           AND marked_at::date = $2::date`,
        [tenantId, today],
      ),
      this.queryOrEmpty<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM exam_day_attendance
         WHERE tenant_id = $1 AND status = 'ABSENT'
           AND marked_at::date = $2::date`,
        [tenantId, today],
      ),
      this.db.query(
        `SELECT COUNT(DISTINCT room)::int AS c FROM exam_seating_allocations esa
         JOIN exam_schedules es ON es.exam_schedule_id = esa.exam_schedule_id
         WHERE esa.tenant_id = $1 AND es.exam_date = $2`,
        [tenantId, today],
      ),
      this.db.query(
        `SELECT COUNT(DISTINCT d.faculty_user_id)::int AS c
         FROM exam_invigilation_duties d
         JOIN exam_schedules es ON es.exam_schedule_id = d.exam_schedule_id
         WHERE d.tenant_id = $1 AND es.exam_date = $2 AND d.published = true`,
        [tenantId, today],
      ),
      this.queryOrEmpty<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM exam_day_attendance
         WHERE tenant_id = $1 AND status = 'LATE' AND marked_at::date = $2::date`,
        [tenantId, today],
      ),
      this.db
        .query(
          `SELECT COUNT(*)::int AS c FROM ufm_cases
         WHERE tenant_id = $1 AND incident_date = $2::date`,
          [tenantId, today],
        )
        .catch(() => [{ c: 0 }]),
      this.queryOrEmpty<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM exam_question_papers
         WHERE tenant_id = $1 AND status = 'UPLOADED'`,
        [tenantId],
      ),
    ]);

    return {
      as_of: new Date().toISOString(),
      exams_running: runningExams?.c ?? 0,
      students_present: present[0]?.c ?? 0,
      students_absent: absent[0]?.c ?? 0,
      rooms_active: activeRooms?.c ?? 0,
      invigilators_present: invigilators?.c ?? 0,
      late_entries: lateEntries[0]?.c ?? 0,
      ufm_cases_today: ufmToday?.c ?? 0,
      pending_incidents: pendingIncidents[0]?.c ?? 0,
    };
  }

  /* ── 11. Grace Marks Engine ── */

  async listGraceMarksPolicies(tenantId: string) {
    return this.queryOrEmpty(
      `SELECT * FROM grace_marks_policies WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId],
    );
  }

  async applyGraceMarks(
    tenantId: string,
    dto: {
      student_user_id: string;
      subject_id: number;
      obtained_marks: number;
      max_marks: number;
    },
  ) {
    const shortfall = dto.max_marks - dto.obtained_marks;
    if (shortfall <= 0)
      return { grace_applied: 0, final_marks: dto.obtained_marks };

    const [policy] = await this.queryOrEmpty<Record<string, unknown>>(
      `SELECT * FROM grace_marks_policies
       WHERE tenant_id = $1 AND is_active = true
       ORDER BY scope_type DESC LIMIT 1`,
      [tenantId],
    );

    const maxGrace = Number(policy?.max_grace_marks ?? 5);
    const minShort = Number(policy?.min_shortfall ?? 1);
    const maxShort = Number(policy?.max_shortfall ?? 5);

    if (shortfall < minShort || shortfall > maxShort) {
      return {
        grace_applied: 0,
        final_marks: dto.obtained_marks,
        reason: 'Shortfall outside policy range',
      };
    }

    const grace = Math.min(maxGrace, shortfall);
    return {
      grace_applied: grace,
      final_marks: dto.obtained_marks + grace,
      policy_name: policy?.policy_name ?? 'Default University Policy',
    };
  }

  /* ── 12. Degree Eligibility Audit ── */

  async runDegreeEligibilityAudit(
    tenantId: string,
    studentUserId: string,
    actorUserId: string,
  ) {
    const tid = requireTenantId(tenantId);
    if (!isUUID(studentUserId)) {
      throw new BadRequestException('A valid student ID is required');
    }

    return this.db.transaction(async (manager) => {
    const [student] = await manager.query<Array<{ user_id: string }>>(
      'SELECT user_id FROM users WHERE user_id = $1 AND tenant_id = $2 FOR UPDATE',
      [studentUserId, tid],
    );
    if (!student) throw new NotFoundException('Student not found');

    type Check = 'CLEARED' | 'NOT_CLEARED' | 'UNAVAILABLE';
    const checks: Record<string, Check> = {
      credits: 'UNAVAILABLE',
      cgpa: 'UNAVAILABLE',
      backlogs: 'UNAVAILABLE',
      finance: 'UNAVAILABLE',
      library: 'UNAVAILABLE',
      // No tenant-scoped authoritative hostel-demand source is defined in the
      // current schema. Do not query the legacy, unverified table name.
      hostel: 'UNAVAILABLE',
    };

    let creditsEarned: number | null = null;
    let cgpaEarned: number | null = null;
    let pendingBacklogs: number | null = null;
    let pendingDues: Awaited<ReturnType<FinanceService['getPendingDues']>> | null = null;
    let activeLibraryLoans: number | null = null;

    await manager.query('SAVEPOINT degree_credits');
    try {
      const [credits] = await manager.query<Array<{ earned: unknown }>>(
        `SELECT COALESCE(SUM(c.credits), 0)::int AS earned
         FROM (
           SELECT DISTINCT e.course_id
           FROM student_course_enrollments e
           WHERE e.student_user_id = $1 AND e.tenant_id = $2 AND e.status = 'COMPLETED'
         ) completed
         JOIN academic_courses c ON c.course_id = completed.course_id AND c.tenant_id = $2`,
        [studentUserId, tid],
      );
      const value = Number(credits?.earned);
      if (Number.isFinite(value) && value >= 0) creditsEarned = value;
      await manager.query('RELEASE SAVEPOINT degree_credits');
    } catch {
      await manager.query('ROLLBACK TO SAVEPOINT degree_credits');
      await manager.query('RELEASE SAVEPOINT degree_credits');
      // Unknown source state remains unavailable and cannot pass.
    }
    // Earned credits are informational until an approved programme/regulation
    // rule and transfer-credit equivalency source are available. In particular,
    // the schema does not identify transferred credit mappings.

    await manager.query('SAVEPOINT degree_grade');
    try {
      const [grade] = await manager.query<Array<{ cgpa: unknown }>>(
        `SELECT cgpa FROM grade_cards
         WHERE student_user_id = $1 AND tenant_id = $2
           AND status = 'PUBLISHED' AND published_at IS NOT NULL
         ORDER BY semester DESC, published_at DESC LIMIT 1`,
        [studentUserId, tid],
      );
      if (grade?.cgpa !== null && grade?.cgpa !== undefined) {
        const value = Number(grade.cgpa);
        if (Number.isFinite(value) && value >= 0) cgpaEarned = value;
      }
      await manager.query('RELEASE SAVEPOINT degree_grade');
    } catch {
      await manager.query('ROLLBACK TO SAVEPOINT degree_grade');
      await manager.query('RELEASE SAVEPOINT degree_grade');
      // Missing grade data/schema is not evidence of a passing CGPA.
    }
    // CGPA is informational until the applicable, approved programme policy
    // is available. Draft/provisional grade cards are excluded above.

    await manager.query('SAVEPOINT degree_backlog');
    try {
      // Backlog history is tenant-scoped and records repeat attempts. Count
      // distinct unresolved course/subject keys, not attempts. An unlinked
      // backlog row cannot be safely matched and therefore remains unavailable.
      const backlogs = await manager.query<Array<{
        course_id: string | null;
        subject_id: string | null;
        course_in_tenant: boolean;
      }>>(
        `SELECT b.course_id::text AS course_id, b.subject_id::text AS subject_id,
                (b.course_id IS NULL OR c.course_id IS NOT NULL) AS course_in_tenant
         FROM student_backlog_history b
         LEFT JOIN academic_courses c
           ON c.course_id = b.course_id AND c.tenant_id = b.tenant_id
         WHERE b.student_user_id = $1 AND b.tenant_id = $2
           AND b.status IN ('ACTIVE', 'FAILED_AGAIN')`,
        [studentUserId, tid],
      );
      if (backlogs.every((row) => (row.course_id || row.subject_id) && row.course_in_tenant)) {
        pendingBacklogs = new Set(
          backlogs.map((row) => row.course_id ?? `subject:${row.subject_id}`),
        ).size;
      }
      await manager.query('RELEASE SAVEPOINT degree_backlog');
    } catch {
      await manager.query('ROLLBACK TO SAVEPOINT degree_backlog');
      await manager.query('RELEASE SAVEPOINT degree_backlog');
      // An unavailable backlog source cannot be treated as an empty backlog.
    }
    if (pendingBacklogs !== null) {
      checks.backlogs = pendingBacklogs === 0 ? 'CLEARED' : 'NOT_CLEARED';
    }

    try {
      pendingDues = await this.finance.getPendingDues(studentUserId, tid);
      if (!Array.isArray(pendingDues)) pendingDues = null;
    } catch {
      // Preserve an explicit unavailable state for Finance failures.
      pendingDues = null;
    }
    // finance_fee_demands exposes fee_head but no authoritative degree-blocking
    // classification. Do not treat unrelated pending demands as degree blockers
    // or an empty broad list as official clearance.
    void pendingDues;

    await manager.query('SAVEPOINT degree_library');
    try {
      // lib_circulation is tenant keyed in the migration and library service.
      const [library] = await manager.query<Array<{ c: unknown }>>(
        `SELECT COUNT(*)::int AS c
         FROM lib_circulation l
         JOIN users u ON u.user_id = l.user_id AND u.tenant_id = l.tenant_id
         WHERE l.tenant_id = $2 AND l.user_id = $1 AND l.returned_at IS NULL`,
        [studentUserId, tid],
      );
      const value = Number(library?.c);
      if (Number.isInteger(value) && value >= 0) activeLibraryLoans = value;
      await manager.query('RELEASE SAVEPOINT degree_library');
    } catch {
      await manager.query('ROLLBACK TO SAVEPOINT degree_library');
      await manager.query('RELEASE SAVEPOINT degree_library');
      // An unavailable library source cannot be treated as clear.
    }
    if (activeLibraryLoans !== null) {
      checks.library = activeLibraryLoans === 0 ? 'CLEARED' : 'NOT_CLEARED';
    }

    const knownBlocker = Object.values(checks).includes('NOT_CLEARED');
    const allVerified = Object.values(checks).every((status) => status === 'CLEARED');
    // The schema contains defaults of 160 credits / 5.0 CGPA, but the
    // university has not confirmed these as official degree policy.
    const requirementsPolicyStatus = 'UNCONFIRMED';
    const finalStatus = knownBlocker
      ? 'NOT_ELIGIBLE'
      : requirementsPolicyStatus === 'UNCONFIRMED'
        ? 'PENDING'
        : allVerified
          ? 'ELIGIBLE'
          : 'PENDING';

    let row: Record<string, unknown> | undefined;
    try {
      [row] = await manager.query<Record<string, unknown>[]>(
        `INSERT INTO degree_eligibility_audits
           (tenant_id, student_user_id, credits_earned, cgpa_earned, pending_backlogs,
            library_clearance, finance_clearance, hostel_clearance, examination_clearance,
            final_status, checked_at, checked_by, clearance_statuses, requirements_policy_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,clock_timestamp(),$11,$12::jsonb,$13)
         RETURNING *`,
        [
          tid,
          studentUserId,
          creditsEarned,
          cgpaEarned,
          pendingBacklogs,
          checks.library === 'CLEARED',
          checks.finance === 'CLEARED',
          checks.hostel === 'CLEARED',
          checks.backlogs === 'CLEARED',
          finalStatus,
          actorUserId,
          JSON.stringify(checks),
          requirementsPolicyStatus,
        ],
      );
    } catch {
      throw new ServiceUnavailableException(
        'The degree eligibility audit could not be saved; no audit result was produced.',
      );
    }
    if (!row) {
      throw new ServiceUnavailableException(
        'The degree eligibility audit could not be saved; no audit result was produced.',
      );
    }

    return {
      ...row,
      credits_earned: creditsEarned,
      cgpa_earned: cgpaEarned,
      pending_backlogs: pendingBacklogs,
      finance_clearance: checks.finance === 'CLEARED',
      examination_clearance: checks.backlogs === 'CLEARED',
      library_clearance: checks.library === 'CLEARED',
      hostel_clearance: checks.hostel === 'CLEARED',
      clearance_statuses: checks,
      requirements_policy_status: requirementsPolicyStatus,
      final_status: finalStatus,
    };
    });
  }

  /* ── 19. Student Examination Timeline ── */

  async studentExamTimeline(tenantId: string, studentUserId: string) {
    const [student] = await this.db.query(
      `SELECT u.name, sp.enrollment_number FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       WHERE u.user_id = $1 AND u.tenant_id = $2`,
      [studentUserId, tenantId],
    );
    if (!student) throw new NotFoundException('Student not found');

    const events: Array<{
      stage: string;
      status: string;
      at: string | null;
      detail?: string;
    }> = [];

    const reg = await this.db.query<Array<{ status: string; created_at: string }>>(
      `SELECT status, created_at FROM exam_semester_registrations
       WHERE tenant_id = $1 AND student_user_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [tenantId, studentUserId],
    );
    events.push({
      stage: 'Registration',
      status: reg[0]?.status ?? 'NOT_STARTED',
      at: reg[0]?.created_at ?? null,
    });

    const dues = await this.finance.getPendingDues(studentUserId, tenantId);
    events.push({
      stage: 'Fee Paid',
      status: dues.length === 0 ? 'COMPLETED' : 'PENDING',
      at: null,
    });

    const [admit] = await this.db.query(
      `SELECT e.created_at, e.eligible FROM exam_admit_card_entries e
       JOIN exam_admit_card_runs r ON r.run_id = e.run_id
       WHERE e.student_user_id = $1 AND r.tenant_id = $2 AND e.eligible = true
       ORDER BY e.created_at DESC LIMIT 1`,
      [studentUserId, tenantId],
    );
    events.push({
      stage: 'Hall Ticket',
      status: admit ? 'GENERATED' : 'PENDING',
      at: admit?.created_at ?? null,
    });

    const attendance = await this.db.query<Array<{
      status: string;
      marked_at: string;
    }>>(
      `SELECT status, marked_at FROM exam_day_attendance
       WHERE tenant_id = $1 AND student_user_id = $2 ORDER BY marked_at DESC LIMIT 1`,
      [tenantId, studentUserId],
    );
    events.push({
      stage: 'Exam Attendance',
      status: attendance[0]?.status ?? 'NOT_MARKED',
      at: attendance[0]?.marked_at ?? null,
    });

    const [result] = await this.db.query(
      `SELECT ser.result_status AS status, ser.declared_at
       FROM student_exam_reports ser
       JOIN exam_result_sessions ers
         ON ers.session_id = ser.session_id AND ers.tenant_id = ser.tenant_id
       WHERE ser.student_user_id = $1 AND ser.tenant_id = $2
         AND ser.declared_at IS NOT NULL AND ers.declared_at IS NOT NULL
       ORDER BY ser.declared_at DESC, ser.report_id DESC LIMIT 1`,
      [studentUserId, tenantId],
    );
    events.push({
      stage: 'Result',
      status: result?.status ?? 'PENDING',
      at: result?.declared_at ?? null,
    });

    const [reval] = await this.db.query(
      `SELECT a.status, a.created_at FROM exam_applications a
       JOIN users u ON u.user_id = a.student_user_id
       WHERE a.student_user_id = $1 AND u.tenant_id = $2 AND a.application_type = 'RE_EVALUATION'
       ORDER BY a.created_at DESC LIMIT 1`,
      [studentUserId, tenantId],
    );
    if (reval) {
      events.push({
        stage: 'Revaluation',
        status: reval.status,
        at: reval.created_at,
      });
    }

    return { student, timeline: events };
  }

  /* ── 20. Advanced Global Search ── */

  async advancedSearch(tenantId: string, query: string) {
    const q = `%${query.trim()}%`;
    if (!query.trim()) {
      return {
        students: [],
        schedules: [],
        subjects: [],
        answer_sheets: [],
        hall_tickets: [],
      };
    }

    const [students, schedules, subjects, answerSheets, hallTickets] =
      await Promise.all([
        this.db.query(
          `SELECT u.user_id, u.name, sp.enrollment_number, sp.prn_number
         FROM users u
         LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
         JOIN roles r ON r.role_id = u.role_id
         WHERE u.tenant_id = $1 AND r.role_name = 'Student'
           AND (u.name ILIKE $2 OR sp.enrollment_number ILIKE $2 OR sp.prn_number ILIKE $2)
         LIMIT 15`,
          [tenantId, q],
        ),
        this.db.query(
          `SELECT es.exam_schedule_id, es.exam_type, es.exam_date, es.venue,
                sub.subject_name, sub.subject_code
         FROM exam_schedules es
         LEFT JOIN academic_subjects sub ON sub.subject_id = es.subject_id
         WHERE es.tenant_id = $1
           AND (sub.subject_name ILIKE $2 OR sub.subject_code ILIKE $2 OR es.venue ILIKE $2)
         LIMIT 15`,
          [tenantId, q],
        ),
        this.db.query(
          `SELECT subject_id, subject_code, subject_name FROM academic_subjects
         WHERE subject_name ILIKE $1 OR subject_code ILIKE $1 LIMIT 15`,
          [q],
        ),
        this.queryOrEmpty(
          `SELECT sheet_id, sheet_number, status, qr_payload FROM answer_sheet_tracking
         WHERE tenant_id = $1 AND (sheet_number ILIKE $2 OR qr_payload ILIKE $2) LIMIT 10`,
          [tenantId, q],
        ),
        this.queryOrEmpty(
          `SELECT e.entry_id, u.name, sp.enrollment_number, e.eligible, e.created_at
         FROM exam_admit_card_entries e
         JOIN users u ON u.user_id = e.student_user_id
         LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
         JOIN exam_admit_card_runs r ON r.run_id = e.run_id
         WHERE r.tenant_id = $1 AND (u.name ILIKE $2 OR sp.enrollment_number ILIKE $2)
         LIMIT 10`,
          [tenantId, q],
        ),
      ]);

    return {
      students,
      schedules,
      subjects,
      answer_sheets: answerSheets,
      hall_tickets: hallTickets,
    };
  }

  /* ── 21. Student Document Verification ── */

  async listStudentExamDocuments(
    tenantId: string,
    filters: { status?: string; student_user_id?: string },
  ) {
    const params: unknown[] = [tenantId];
    let sql = `
      SELECT d.*, u.name AS student_name, sp.enrollment_number
      FROM student_exam_documents d
      JOIN users u ON u.user_id = d.student_user_id
      LEFT JOIN student_profiles sp ON sp.user_id = d.student_user_id
      WHERE d.tenant_id = $1`;
    if (filters.status) {
      params.push(filters.status);
      sql += ` AND d.verification_status = $${params.length}`;
    }
    if (filters.student_user_id) {
      params.push(filters.student_user_id);
      sql += ` AND d.student_user_id = $${params.length}`;
    }
    sql += ' ORDER BY d.created_at DESC LIMIT 200';
    return this.queryOrEmpty(sql, params);
  }

  async verifyStudentDocument(
    tenantId: string,
    docId: string,
    actorUserId: string,
    status: 'VERIFIED' | 'REJECTED',
  ) {
    const [row] = await this.queryOrEmpty<Record<string, unknown>>(
      `UPDATE student_exam_documents
       SET verification_status = $3, verified_by = $4, verified_at = NOW()
       WHERE tenant_id = $1 AND doc_id = $2 RETURNING *`,
      [tenantId, docId, status, actorUserId],
    );
    if (!row) throw new NotFoundException('Document not found');
    return row;
  }

  /* ── 22. Workflow Builder ── */

  async listWorkflows(tenantId: string) {
    return this.queryOrEmpty(
      `SELECT * FROM exam_workflow_definitions WHERE tenant_id = $1 AND is_active = true`,
      [tenantId],
    );
  }

  /* ── 23. Deadline Management ── */

  async listDeadlines(tenantId: string) {
    return this.queryOrEmpty(
      `SELECT *, EXTRACT(EPOCH FROM (due_at - NOW())) / 86400 AS days_remaining
       FROM exam_deadlines WHERE tenant_id = $1 AND status = 'ACTIVE'
       ORDER BY due_at ASC`,
      [tenantId],
    );
  }

  async createDeadline(
    tenantId: string,
    actorUserId: string,
    dto: Record<string, unknown>,
  ) {
    const [row] = await this.queryOrEmpty<Record<string, unknown>>(
      `INSERT INTO exam_deadlines
         (tenant_id, title, deadline_type, due_at, semester, program_label, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        tenantId,
        dto.title,
        dto.deadline_type ?? 'OTHER',
        dto.due_at,
        dto.semester ?? null,
        dto.program_label ?? null,
        actorUserId,
      ],
    );
    return row;
  }

  /* ── 25. Document Repository ── */

  async listDocumentRepository(tenantId: string, category?: string) {
    const params: unknown[] = [tenantId];
    let sql = `SELECT * FROM exam_document_repository WHERE tenant_id = $1`;
    if (category) {
      params.push(category);
      sql += ` AND category = $${params.length}`;
    }
    sql += ' ORDER BY created_at DESC LIMIT 100';
    return this.queryOrEmpty(sql, params);
  }

  async uploadRepositoryDocument(
    tenantId: string,
    actorUserId: string,
    dto: { title: string; category: string; file_url?: string },
  ) {
    const [row] = await this.queryOrEmpty<Record<string, unknown>>(
      `INSERT INTO exam_document_repository
         (tenant_id, title, category, file_url, uploaded_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [tenantId, dto.title, dto.category, dto.file_url ?? null, actorUserId],
    );
    return row;
  }

  /* ── 14. Advanced Analytics ── */

  async advancedAnalytics(tenantId: string, semester: number) {
    const [gradeDist, subjectAnalysis, facultyPerf, passFail] = await Promise.all([
      this.db.query(
        `SELECT COALESCE(br.grade, ser.grade) AS grade, COUNT(*)::int AS count
         FROM student_exam_reports ser
         JOIN exam_result_sessions ers
           ON ers.session_id = ser.session_id AND ers.tenant_id = ser.tenant_id
         LEFT JOIN exam_backlog_current_results br ON br.source_report_id = ser.report_id
           AND br.tenant_id = ser.tenant_id AND br.student_user_id = ser.student_user_id
           AND br.semester = ers.semester AND br.selected_attempt_id IS NOT NULL
         WHERE ser.tenant_id = $1 AND ers.semester = $2
           AND ser.declared_at IS NOT NULL AND ers.declared_at IS NOT NULL
         GROUP BY COALESCE(br.grade, ser.grade) ORDER BY grade`,
        [tenantId, semester],
      ),
      this.db.query(
        `SELECT c.course_code AS subject_code, c.course_name AS subject_name,
                AVG(COALESCE(br.marks_obtained, ser.marks_obtained))::float8 AS avg_marks,
                COUNT(DISTINCT ser.student_user_id)::int AS students
         FROM student_exam_reports ser
         JOIN exam_result_sessions ers
           ON ers.session_id = ser.session_id AND ers.tenant_id = ser.tenant_id
         LEFT JOIN exam_backlog_current_results br ON br.source_report_id = ser.report_id
           AND br.tenant_id = ser.tenant_id AND br.student_user_id = ser.student_user_id
           AND br.semester = ers.semester AND br.selected_attempt_id IS NOT NULL
         JOIN academic_courses c ON c.course_id = ser.course_id AND c.tenant_id = ser.tenant_id
         WHERE ser.tenant_id = $1 AND ers.semester = $2
           AND ser.declared_at IS NOT NULL AND ers.declared_at IS NOT NULL
         GROUP BY c.course_id, c.course_code, c.course_name
         ORDER BY avg_marks DESC, c.course_code LIMIT 15`,
        [tenantId, semester],
      ),
      this.db.query(
        `SELECT u.name, COUNT(am.mark_id)::int AS submissions
         FROM academic_marks am
         JOIN users u ON u.user_id = am.uploaded_by AND u.tenant_id = am.tenant_id
         WHERE am.tenant_id = $1 AND am.status != 'DRAFT'
           AND EXISTS (
             SELECT 1 FROM student_course_enrollments e
             WHERE e.tenant_id = am.tenant_id AND e.student_user_id = am.student_user_id
               AND e.course_id = am.course_id AND e.semester = $2
           )
         GROUP BY u.user_id, u.name ORDER BY submissions DESC, u.name LIMIT 10`,
        [tenantId, semester],
      ),
      this.db.query(
        `SELECT COALESCE(br.result_status, ser.result_status) AS label, COUNT(*)::int AS count
         FROM student_exam_reports ser
         JOIN exam_result_sessions ers
           ON ers.session_id = ser.session_id AND ers.tenant_id = ser.tenant_id
         LEFT JOIN exam_backlog_current_results br ON br.source_report_id = ser.report_id
           AND br.tenant_id = ser.tenant_id AND br.student_user_id = ser.student_user_id
           AND br.semester = ers.semester AND br.selected_attempt_id IS NOT NULL
         WHERE ser.tenant_id = $1 AND ers.semester = $2
           AND ser.declared_at IS NOT NULL AND ers.declared_at IS NOT NULL
         GROUP BY COALESCE(br.result_status, ser.result_status) ORDER BY label`,
        [tenantId, semester],
      ),
    ]);

    return {
      semester,
      grade_distribution: gradeDist,
      subject_analysis: subjectAnalysis,
      faculty_performance: facultyPerf,
      pass_fail: passFail,
    };
  }

  /* ── 26. AI Assistant Context (future-ready) ── */

  async aiAssistantContext(tenantId: string, studentUserId?: string) {
    const context: Record<string, unknown> = {
      module: 'Falcon Exam OS',
      version: '2.0',
      capabilities: [
        'exam_schedule_lookup',
        'eligibility_check',
        'hall_ticket_status',
        'seating_lookup',
        'result_status',
        'backlog_count',
        'revaluation_status',
      ],
      integration_note:
        'Wire to LLM via POST /api/exam-cell/ai/query with this context payload',
    };

    if (studentUserId) {
      const [timeline, eligibility] = await Promise.all([
        this.studentExamTimeline(tenantId, studentUserId).catch(() => null),
        this.categorizeStudent(tenantId, studentUserId, 4).catch(() => null),
      ]);
      context.student = { timeline, eligibility };
    }

    return context;
  }
}
