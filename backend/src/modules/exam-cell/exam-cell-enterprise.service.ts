import {
  BadRequestException,
  Injectable,
  NotFoundException,
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

@Injectable()
export class ExamCellEnterpriseService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly attendanceEligibility: AttendanceEligibilityService,
    private readonly finance: FinanceService,
    private readonly audit: ExamCellAuditService,
  ) {}

  private async queryOrEmpty<T extends Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    try {
      return await this.db.query(sql, params);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/relation .* does not exist|column .* does not exist/i.test(message)) {
        return [];
      }
      throw err;
    }
  }

  /* ── 1. Examination Calendar ── */

  async listCalendarEvents(
    tenantId: string,
    filters: { from?: string; to?: string; event_type?: string; semester?: number },
  ) {
    const params: unknown[] = [tenantId];
    let sql = `SELECT * FROM exam_calendar_events WHERE tenant_id = $1`;
    if (filters.from) {
      params.push(filters.from);
      sql += ` AND event_date >= $${params.length}::date`;
    }
    if (filters.to) {
      params.push(filters.to);
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
    sql += ' ORDER BY event_date, start_time NULLS LAST';

    const [customEvents, scheduleEvents] = await Promise.all([
      this.queryOrEmpty(sql, params),
      this.db.query(
        `SELECT es.exam_schedule_id, es.exam_type, es.exam_date, es.start_time, es.end_time,
                es.venue, es.batch_label, sub.subject_name, sub.subject_code
         FROM exam_schedules es
         LEFT JOIN academic_subjects sub ON sub.subject_id = es.subject_id
         WHERE es.tenant_id = $1
           ${filters.from ? `AND es.exam_date >= '${filters.from}'::date` : ''}
           ${filters.to ? `AND es.exam_date <= '${filters.to}'::date` : ''}
         ORDER BY es.exam_date, es.start_time`,
        [tenantId],
      ),
    ]);

    const mappedSchedules = scheduleEvents.map((s: Record<string, unknown>) => ({
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
    }));

    return [...customEvents.map((e) => ({ ...e, source: 'CALENDAR' })), ...mappedSchedules];
  }

  async createCalendarEvent(tenantId: string, actorUserId: string, dto: Record<string, unknown>) {
    const [row] = await this.queryOrEmpty<Record<string, unknown>>(
      `INSERT INTO exam_calendar_events
         (tenant_id, title, event_type, event_date, end_date, start_time, end_time,
          department, program_label, semester, color_code, description, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
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
    if (!row) throw new BadRequestException('Could not create calendar event');
    await this.audit.log(tenantId, actorUserId, {
      action: 'CALENDAR_EVENT_CREATED',
      resource_type: 'exam_calendar_event',
      resource_id: String(row.event_id),
    });
    return row;
  }

  async updateCalendarEventDate(
    tenantId: string,
    eventId: string,
    actorUserId: string,
    eventDate: string,
  ) {
    const [row] = await this.queryOrEmpty<Record<string, unknown>>(
      `UPDATE exam_calendar_events SET event_date = $3, updated_at = NOW()
       WHERE tenant_id = $1 AND event_id = $2 RETURNING *`,
      [tenantId, eventId, eventDate],
    );
    if (!row) throw new NotFoundException('Calendar event not found');
    await this.audit.log(tenantId, actorUserId, {
      action: 'CALENDAR_EVENT_RESCHEDULED',
      resource_type: 'exam_calendar_event',
      resource_id: eventId,
      new_value: { event_date: eventDate },
    });
    return row;
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
      const category = await this.categorizeStudent(tenantId, s.user_id, semester);
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

  private async categorizeStudent(tenantId: string, studentUserId: string, semester: number) {
    const [attendance, pendingDues, ufm, pendingDocs, pendingMarks] = await Promise.all([
      this.attendanceEligibility.evaluate(tenantId, studentUserId, { context: 'EXAM_DESK' }),
      this.finance.getPendingDues(studentUserId),
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
  ) {
    const dash = await this.eligibilityDashboard(tenantId, semester);
    let synced = 0;

    for (const item of dash.items) {
      const stage =
        item.category === 'ELIGIBLE'
          ? 'ELIGIBILITY'
          : item.category === 'FEE_PENDING'
            ? 'FINANCE'
            : 'REGISTRATION';

      try {
        await this.db.query(
          `INSERT INTO hall_ticket_approvals
             (tenant_id, student_user_id, semester, batch_label, stage, block_reasons,
              eligibility_status, finance_status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (tenant_id, student_user_id, semester, batch_label)
           DO UPDATE SET
             stage = EXCLUDED.stage,
             block_reasons = EXCLUDED.block_reasons,
             eligibility_status = EXCLUDED.eligibility_status,
             finance_status = EXCLUDED.finance_status,
             updated_at = NOW()`,
          [
            tenantId,
            item.student_user_id,
            semester,
            batchLabel,
            stage,
            JSON.stringify(item.block_reasons),
            item.category === 'ELIGIBLE' ? 'APPROVED' : 'PENDING',
            item.fee_clear ? 'APPROVED' : 'PENDING',
          ],
        );
        synced++;
      } catch {
        /* skip row on conflict with missing table — caller sees synced < total */
      }
    }
    return { synced, total: dash.items.length };
  }

  async listHallTicketApprovals(
    tenantId: string,
    filters: { semester?: number; batch_label?: string; stage?: string },
  ) {
    const params: unknown[] = [tenantId];
    let sql = `
      SELECT a.*, u.name AS student_name, sp.enrollment_number
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
    sql += ' ORDER BY u.name LIMIT 500';
    return this.queryOrEmpty(sql, params);
  }

  async advanceHallTicketApproval(
    tenantId: string,
    approvalId: string,
    actorUserId: string,
    action: 'APPROVE' | 'REJECT',
    stage?: string,
  ) {
    const [current] = await this.queryOrEmpty<Record<string, unknown>>(
      `SELECT * FROM hall_ticket_approvals WHERE tenant_id = $1 AND approval_id = $2`,
      [tenantId, approvalId],
    );
    if (!current) throw new NotFoundException('Approval record not found');

    const flow = ['REGISTRATION', 'ELIGIBILITY', 'FINANCE', 'EXAM_OFFICE', 'COE', 'APPROVED'];
    let nextStage = String(current.stage);

    if (action === 'REJECT') {
      nextStage = 'REJECTED';
    } else if (stage) {
      nextStage = stage;
    } else {
      const idx = flow.indexOf(nextStage);
      nextStage = idx >= 0 && idx < flow.length - 1 ? flow[idx + 1] : 'APPROVED';
    }

    const [row] = await this.queryOrEmpty<Record<string, unknown>>(
      `UPDATE hall_ticket_approvals
       SET stage = $3, approved_by = $4, approved_at = NOW(), updated_at = NOW(),
           coe_status = CASE WHEN $3 = 'APPROVED' THEN 'APPROVED' ELSE coe_status END
       WHERE tenant_id = $1 AND approval_id = $2
       RETURNING *`,
      [tenantId, approvalId, nextStage, actorUserId],
    );

    await this.audit.log(tenantId, actorUserId, {
      action: action === 'REJECT' ? 'HALL_TICKET_REJECTED' : 'HALL_TICKET_APPROVED',
      resource_type: 'hall_ticket_approval',
      resource_id: approvalId,
      new_value: { stage: nextStage },
    });
    return row;
  }

  async bulkApproveHallTickets(
    tenantId: string,
    actorUserId: string,
    dto: { semester: number; batch_label: string; target_stage: string },
  ) {
    const result = await this.db.query(
      `UPDATE hall_ticket_approvals
       SET stage = $4, approved_by = $5, approved_at = NOW(), updated_at = NOW()
       WHERE tenant_id = $1 AND semester = $2 AND batch_label = $3
         AND stage NOT IN ('REJECTED', 'APPROVED')
       RETURNING approval_id`,
      [tenantId, dto.semester, dto.batch_label, dto.target_stage, actorUserId],
    );
    await this.audit.log(tenantId, actorUserId, {
      action: 'HALL_TICKET_BULK_APPROVED',
      resource_type: 'hall_ticket_approval',
      new_value: { count: result.length, target_stage: dto.target_stage },
    });
    return { approved: result.length };
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
        const onLeave = await this.db.query(
          `SELECT COUNT(*)::int AS c FROM hr_leave_requests
           WHERE user_id = $1 AND status = 'APPROVED'
             AND $2::date BETWEEN start_date AND end_date`,
          [f.user_id, examDate],
        ).catch(() => [{ c: 0 }]);

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

  async listAnswerSheets(tenantId: string, status?: string) {
    const params: unknown[] = [tenantId];
    let sql = `
      SELECT s.*, u.name AS student_name, sub.subject_name, es.exam_date
      FROM answer_sheet_tracking s
      LEFT JOIN users u ON u.user_id = s.student_user_id
      LEFT JOIN exam_schedules es ON es.exam_schedule_id = s.exam_schedule_id
      LEFT JOIN academic_subjects sub ON sub.subject_id = es.subject_id
      WHERE s.tenant_id = $1`;
    if (status) {
      params.push(status);
      sql += ` AND s.status = $${params.length}`;
    }
    sql += ' ORDER BY s.created_at DESC LIMIT 200';
    return this.queryOrEmpty(sql, params);
  }

  async createAnswerSheet(
    tenantId: string,
    actorUserId: string,
    dto: {
      sheet_number: string;
      exam_schedule_id?: string;
      student_user_id?: string;
    },
  ) {
    const qrPayload = `AS-${dto.sheet_number}-${Date.now()}`;
    const [row] = await this.queryOrEmpty<Record<string, unknown>>(
      `INSERT INTO answer_sheet_tracking
         (tenant_id, sheet_number, exam_schedule_id, student_user_id, qr_payload, barcode_payload)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        tenantId,
        dto.sheet_number,
        dto.exam_schedule_id ?? null,
        dto.student_user_id ?? null,
        qrPayload,
        dto.sheet_number.replace(/\D/g, '').slice(0, 12),
      ],
    );
    await this.audit.log(tenantId, actorUserId, {
      action: 'ANSWER_SHEET_ISSUED',
      resource_type: 'answer_sheet',
      resource_id: String(row?.sheet_id ?? ''),
    });
    return row;
  }

  async updateAnswerSheetStatus(
    tenantId: string,
    sheetId: string,
    actorUserId: string,
    status: string,
    evaluatorUserId?: string,
  ) {
    const [row] = await this.queryOrEmpty<Record<string, unknown>>(
      `UPDATE answer_sheet_tracking
       SET status = $3, evaluator_user_id = COALESCE($4, evaluator_user_id), status_changed_at = NOW()
       WHERE tenant_id = $1 AND sheet_id = $2
       RETURNING *`,
      [tenantId, sheetId, status, evaluatorUserId ?? null],
    );
    if (!row) throw new NotFoundException('Answer sheet not found');
    await this.audit.log(tenantId, actorUserId, {
      action: `ANSWER_SHEET_${status}`,
      resource_type: 'answer_sheet',
      resource_id: sheetId,
    });
    return row;
  }

  /* ── 7. Student Identity Verification ── */

  async verifyStudentByQr(
    tenantId: string,
    actorUserId: string,
    qrPayload: string,
  ) {
    const studentMatch = qrPayload.match(/student:([a-f0-9-]{36})/i);
    const studentUserId = studentMatch?.[1];

    let student;
    if (studentUserId) {
      [student] = await this.db.query(
        `SELECT u.user_id, u.name, u.profile_picture_url, sp.enrollment_number, sp.prn_number,
                sp.branch_name, e.semester
         FROM users u
         LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
         LEFT JOIN LATERAL (
           SELECT semester FROM student_course_enrollments
           WHERE student_user_id = u.user_id ORDER BY semester DESC LIMIT 1
         ) e ON true
         WHERE u.user_id = $1 AND u.tenant_id = $2`,
        [studentUserId, tenantId],
      );
    }

    if (!student) {
      [student] = await this.db.query(
        `SELECT u.user_id, u.name, u.profile_picture_url, sp.enrollment_number, sp.prn_number,
                sp.branch_name, e.semester
         FROM users u
         LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
         LEFT JOIN LATERAL (
           SELECT semester FROM student_course_enrollments
           WHERE student_user_id = u.user_id ORDER BY semester DESC LIMIT 1
         ) e ON true
         WHERE u.tenant_id = $1
           AND (sp.enrollment_number = $2 OR sp.prn_number = $2)`,
        [tenantId, qrPayload],
      );
    }

    if (!student) throw new NotFoundException('Student not found for QR payload');

    const [seating, schedules] = await Promise.all([
      this.db.query(
        `SELECT esa.room, esa.seat_number, es.exam_date, es.exam_type, sub.subject_name
         FROM exam_seating_allocations esa
         JOIN exam_schedules es ON es.exam_schedule_id = esa.exam_schedule_id
         LEFT JOIN academic_subjects sub ON sub.subject_id = es.subject_id
         WHERE esa.student_user_id = $1 AND esa.tenant_id = $2
         ORDER BY es.exam_date LIMIT 5`,
        [student.user_id, tenantId],
      ),
      this.db.query(
        `SELECT es.*, sub.subject_name FROM exam_schedules es
         LEFT JOIN academic_subjects sub ON sub.subject_id = es.subject_id
         WHERE es.tenant_id = $1 AND es.exam_date >= CURRENT_DATE
         ORDER BY es.exam_date LIMIT 5`,
        [tenantId],
      ),
    ]);

    await this.queryOrEmpty(
      `INSERT INTO student_identity_verifications
         (tenant_id, student_user_id, qr_payload, verified, verified_by, verified_at)
       VALUES ($1,$2,$3,true,$4,NOW())`,
      [tenantId, student.user_id, qrPayload, actorUserId],
    );

    return { student, seating, upcoming_exams: schedules, verified: true };
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
      this.db.query(
        `SELECT COUNT(*)::int AS c FROM ufm_cases
         WHERE tenant_id = $1 AND incident_date = $2::date`,
        [tenantId, today],
      ).catch(() => [{ c: 0 }]),
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
    dto: { student_user_id: string; subject_id: number; obtained_marks: number; max_marks: number },
  ) {
    const shortfall = dto.max_marks - dto.obtained_marks;
    if (shortfall <= 0) return { grace_applied: 0, final_marks: dto.obtained_marks };

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
      return { grace_applied: 0, final_marks: dto.obtained_marks, reason: 'Shortfall outside policy range' };
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
    const [credits] = await this.db.query(
      `SELECT COALESCE(SUM(c.credits), 0)::int AS earned
       FROM student_course_enrollments e
       JOIN academic_courses c ON c.course_id = e.course_id
       WHERE e.student_user_id = $1 AND e.tenant_id = $2 AND e.status = 'COMPLETED'`,
      [studentUserId, tenantId],
    );

    const [grade] = await this.db.query(
      `SELECT cgpa FROM student_grade_cards
       WHERE student_user_id = $1 AND tenant_id = $2
       ORDER BY semester DESC LIMIT 1`,
      [studentUserId, tenantId],
    ).catch(() => [{ cgpa: null }]);

    const [backlogs] = await this.db.query(
      `SELECT COUNT(*)::int AS c FROM exam_applications
       WHERE student_user_id = $1 AND application_type = 'BACKLOG' AND status = 'PENDING'`,
      [studentUserId],
    );

    const pendingDues = await this.finance.getPendingDues(studentUserId);
    const cgpaEarned = grade?.cgpa != null ? Number(grade.cgpa) : null;
    const creditsEarned = credits?.earned ?? 0;
    const pendingBacklogs = backlogs?.c ?? 0;

    const financeClear = pendingDues.length === 0;
    const examClear = pendingBacklogs === 0;
    const creditsOk = creditsEarned >= 160;
    const cgpaOk = cgpaEarned != null && cgpaEarned >= 5.0;

    const [libraryDues] = await this.db.query(
      `SELECT COUNT(*)::int AS c FROM library_circulation
       WHERE student_user_id = $1 AND status IN ('ISSUED','OVERDUE')`,
      [studentUserId],
    ).catch(() => [{ c: 0 }]);

    const [hostelDues] = await this.db.query(
      `SELECT COUNT(*)::int AS c FROM hostel_fee_demands
       WHERE student_user_id = $1 AND status NOT IN ('PAID','WAIVED')`,
      [studentUserId],
    ).catch(() => [{ c: 0 }]);

    const libraryClear = (libraryDues?.c ?? 0) === 0;
    const hostelClear = (hostelDues?.c ?? 0) === 0;

    const finalStatus =
      creditsOk && cgpaOk && financeClear && examClear && libraryClear && hostelClear
        ? 'ELIGIBLE'
        : 'NOT_ELIGIBLE';

    const [row] = await this.queryOrEmpty<Record<string, unknown>>(
      `INSERT INTO degree_eligibility_audits
         (tenant_id, student_user_id, credits_earned, cgpa_earned, pending_backlogs,
          library_clearance, finance_clearance, hostel_clearance, examination_clearance,
          final_status, checked_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        tenantId,
        studentUserId,
        creditsEarned,
        cgpaEarned,
        pendingBacklogs,
        libraryClear,
        financeClear,
        hostelClear,
        examClear,
        finalStatus,
        actorUserId,
      ],
    );

    return row ?? {
      final_status: finalStatus,
      credits_earned: creditsEarned,
      cgpa_earned: cgpaEarned,
      pending_backlogs: pendingBacklogs,
      finance_clearance: financeClear,
      examination_clearance: examClear,
    };
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

    const events: Array<{ stage: string; status: string; at: string | null; detail?: string }> = [];

    const reg = await this.queryOrEmpty<{ status: string; created_at: string }>(
      `SELECT status, created_at FROM exam_semester_registrations
       WHERE tenant_id = $1 AND student_user_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [tenantId, studentUserId],
    );
    events.push({
      stage: 'Registration',
      status: reg[0]?.status ?? 'NOT_STARTED',
      at: reg[0]?.created_at ?? null,
    });

    const dues = await this.finance.getPendingDues(studentUserId);
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
      status: admit[0] ? 'GENERATED' : 'PENDING',
      at: admit[0]?.created_at ?? null,
    });

    const attendance = await this.queryOrEmpty<{ status: string; marked_at: string }>(
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
      `SELECT ser.status, ser.updated_at FROM student_exam_reports ser
       JOIN exam_result_sessions ers ON ers.session_id = ser.session_id
       WHERE ser.student_user_id = $1 AND ers.tenant_id = $2
       ORDER BY ser.updated_at DESC LIMIT 1`,
      [studentUserId, tenantId],
    ).catch(() => []);
    events.push({
      stage: 'Result',
      status: result[0]?.status ?? 'PENDING',
      at: result[0]?.updated_at ?? null,
    });

    const [reval] = await this.db.query(
      `SELECT status, created_at FROM exam_applications
       WHERE student_user_id = $1 AND application_type = 'RE_EVALUATION'
       ORDER BY created_at DESC LIMIT 1`,
      [studentUserId],
    );
    if (reval[0]) {
      events.push({
        stage: 'Revaluation',
        status: reval[0].status,
        at: reval[0].created_at,
      });
    }

    return { student, timeline: events };
  }

  /* ── 20. Advanced Global Search ── */

  async advancedSearch(tenantId: string, query: string) {
    const q = `%${query.trim()}%`;
    if (!query.trim()) {
      return { students: [], schedules: [], subjects: [], answer_sheets: [], hall_tickets: [] };
    }

    const [students, schedules, subjects, answerSheets, hallTickets] = await Promise.all([
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

    return { students, schedules, subjects, answer_sheets: answerSheets, hall_tickets: hallTickets };
  }

  /* ── 21. Student Document Verification ── */

  async listStudentExamDocuments(tenantId: string, filters: { status?: string; student_user_id?: string }) {
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

  async createDeadline(tenantId: string, actorUserId: string, dto: Record<string, unknown>) {
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
    const [gradeDist, subjectAnalysis, facultyPerf] = await Promise.all([
      this.db.query(
        `SELECT aer.grade, COUNT(*)::int AS count
         FROM academic_exam_results aer
         JOIN student_course_enrollments e ON e.student_user_id = aer.student_user_id AND e.semester = $2
         WHERE aer.tenant_id = $1
         GROUP BY aer.grade ORDER BY aer.grade`,
        [tenantId, semester],
      ).catch(() => []),
      this.db.query(
        `SELECT sub.subject_code, sub.subject_name,
                AVG(r.marks_obtained)::numeric(6,2) AS avg_marks,
                COUNT(*)::int AS students
         FROM academic_exam_results r
         JOIN academic_courses c ON c.course_id = r.course_id
         JOIN academic_subjects sub ON sub.subject_id = c.subject_id
         JOIN student_course_enrollments e ON e.student_user_id = r.student_user_id AND e.semester = $2
         WHERE r.tenant_id = $1
         GROUP BY sub.subject_code, sub.subject_name
         ORDER BY avg_marks DESC LIMIT 15`,
        [tenantId, semester],
      ).catch(() => []),
      this.queryOrEmpty(
        `SELECT u.name, COUNT(am.mark_id)::int AS submissions
         FROM academic_marks am
         JOIN users u ON u.user_id = am.submitted_by
         WHERE am.tenant_id = $1 AND am.status != 'DRAFT'
         GROUP BY u.name ORDER BY submissions DESC LIMIT 10`,
        [tenantId],
      ).catch(() => []),
    ]);

    const passFail = await this.db.query(
      `SELECT ser.status AS label, COUNT(*)::int AS count
       FROM student_exam_reports ser
       JOIN exam_result_sessions ers ON ers.session_id = ser.session_id
       WHERE ers.tenant_id = $1 AND ers.semester = $2
       GROUP BY ser.status`,
      [tenantId, semester],
    ).catch(() => []);

    return { semester, grade_distribution: gradeDist, subject_analysis: subjectAnalysis, faculty_performance: facultyPerf, pass_fail: passFail };
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
      integration_note: 'Wire to LLM via POST /api/exam-cell/ai/query with this context payload',
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
