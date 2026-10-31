import { requireTenantId } from '../../common/utils/require-tenant-id';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { QuestionPaperWorkflowService } from './question-paper-workflow.service';
import { CreateQuestionPaperDto } from './dto/question-paper.dto';
import { EXAM_DAY_ATTENDANCE_STATUSES, ExamDayDateQueryDto, MarkExamDayAttendanceDto } from './dto/exam-day.dto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Optional,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { isUUID } from 'class-validator';
import { AttendanceEligibilityService } from '../attendance-policy/attendance-eligibility.service';
import { FinanceService } from '../finance/finance.service';
import { ExamCellAuditService } from './exam-cell-audit.service';
import { NotificationDispatchService } from '../../core/notifications/notification-dispatch.service';
import { SemesterResultsService } from './semester-results.service';

@Injectable()
export class ExamCellOperationsService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly attendanceEligibility: AttendanceEligibilityService,
    private readonly finance: FinanceService,
    private readonly audit: ExamCellAuditService,
    private readonly notificationDispatch: NotificationDispatchService,
    private readonly semesterResults: SemesterResultsService,
    @Optional() private readonly questionPapers?: QuestionPaperWorkflowService,
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

  /* ── Form windows ── */

  async listFormWindows(tenantId: string) {
    return this.queryOrEmpty(
      `SELECT w.*, s.session_name
       FROM exam_form_windows w
       LEFT JOIN exam_sessions s ON s.session_id = w.session_id AND s.tenant_id = w.tenant_id
       WHERE w.tenant_id = $1
       ORDER BY w.opens_at DESC`,
      [tenantId],
    );
  }

  async createFormWindow(
    tenantId: string,
    actorUserId: string,
    dto: {
      title: string;
      semester: number;
      program_label?: string;
      session_id?: string;
      opens_at: string;
      closes_at: string;
    },
  ) {
    if (dto.session_id != null && !isUUID(dto.session_id)) {
      throw new BadRequestException('session_id must be a UUID');
    }
    return this.db.transaction(async (manager) => {
      if (dto.session_id != null) {
        const [session] = await manager.query<Array<{ session_id: string }>>(
          `SELECT session_id FROM exam_sessions
           WHERE tenant_id = $1 AND session_id = $2 FOR KEY SHARE`,
          [tenantId, dto.session_id],
        );
        if (!session) throw new NotFoundException('Exam session not found');
      }
      const [row] = await manager.query<Array<{ window_id: string }>>(
        `INSERT INTO exam_form_windows
         (tenant_id, session_id, title, semester, program_label, opens_at, closes_at, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'DRAFT',$8)
       RETURNING *`,
        [
          tenantId,
          dto.session_id ?? null,
          dto.title,
          dto.semester,
          dto.program_label ?? null,
          dto.opens_at,
          dto.closes_at,
          actorUserId,
        ],
      );
      await this.audit.log(
        tenantId,
        actorUserId,
        {
          action: 'FORM_WINDOW_CREATED',
          resource_type: 'exam_form_window',
          resource_id: row.window_id,
          new_value: { title: dto.title, semester: dto.semester },
        },
        manager,
      );
      return row;
    });
  }

  async updateFormWindowStatus(
    tenantId: string,
    windowId: string,
    actorUserId: string,
    status: 'OPEN' | 'CLOSED' | 'DRAFT',
  ) {
    return this.db.transaction(async (manager) => {
      const [row] = await manager.query(
        `WITH updated AS (UPDATE exam_form_windows SET status = $3, updated_at = NOW()
         WHERE tenant_id = $1 AND window_id = $2
         RETURNING *) SELECT * FROM updated`,
        [tenantId, windowId, status],
      );
      if (!row) throw new NotFoundException('Form window not found');
      await this.audit.log(
        tenantId,
        actorUserId,
        {
          action: 'FORM_WINDOW_STATUS_CHANGED',
          resource_type: 'exam_form_window',
          resource_id: windowId,
          new_value: { status },
        },
        manager,
      );
      return row;
    });
  }

  /* ── Semester registrations desk ── */

  async listRegistrations(
    tenantId: string,
    filters: { window_id?: string; status?: string; semester?: number },
  ) {
    const params: unknown[] = [tenantId];
    let sql = `
      SELECT r.*, u.name AS student_name, sp.enrollment_number, sp.prn_number,
             w.title AS window_title
      FROM exam_semester_registrations r
      JOIN users u ON u.user_id = r.student_user_id AND u.tenant_id = r.tenant_id
      LEFT JOIN student_profiles sp ON sp.user_id = r.student_user_id
      LEFT JOIN exam_form_windows w ON w.window_id = r.window_id AND w.tenant_id = r.tenant_id
      WHERE r.tenant_id = $1`;
    if (filters.window_id) {
      params.push(filters.window_id);
      sql += ` AND r.window_id = $${params.length}`;
    }
    if (filters.status) {
      params.push(filters.status);
      sql += ` AND r.status = $${params.length}`;
    }
    if (filters.semester) {
      params.push(filters.semester);
      sql += ` AND r.semester = $${params.length}`;
    }
    sql += ' ORDER BY r.created_at DESC LIMIT 200';
    return this.queryOrEmpty(sql, params);
  }

  async reviewRegistration(
    tenantId: string,
    registrationId: string,
    actorUserId: string,
    status: 'APPROVED' | 'REJECTED',
  ) {
    return this.db.transaction(async (manager) => {
      const [row] = await manager.query(
        `WITH updated AS (UPDATE exam_semester_registrations
         SET status = $3, reviewed_by = $4, reviewed_at = NOW()
         WHERE tenant_id = $1 AND registration_id = $2
         RETURNING *) SELECT * FROM updated`,
        [tenantId, registrationId, status, actorUserId],
      );
      if (!row) throw new NotFoundException('Registration not found');
      await this.audit.log(
        tenantId,
        actorUserId,
        {
          action:
            status === 'APPROVED'
              ? 'REGISTRATION_APPROVED'
              : 'REGISTRATION_REJECTED',
          resource_type: 'exam_semester_registration',
          resource_id: registrationId,
        },
        manager,
      );
      return row;
    });
  }

  async seedRegistrationsFromSemester(
    tenantId: string,
    windowId: string,
    semester: number,
  ) {
    return this.db.transaction(async (manager) => {
      const [window] = await manager.query<
        Array<{ semester: number; session_id: string | null }>
      >(
        `SELECT semester, session_id FROM exam_form_windows
         WHERE tenant_id = $1 AND window_id = $2 FOR UPDATE`,
        [tenantId, windowId],
      );
      if (!window) throw new NotFoundException('Form window not found');
      if (Number(window.semester) !== semester) {
        throw new BadRequestException(
          'Semester must match the selected form window',
        );
      }
      const students = await manager.query<Array<{ user_id: string }>>(
        `SELECT DISTINCT u.user_id
         FROM users u
         JOIN student_course_enrollments e ON e.student_user_id = u.user_id AND e.tenant_id = $1
         WHERE u.tenant_id = $1 AND e.semester = $2`,
        [tenantId, semester],
      );
      let created = 0;
      for (const student of students) {
        const eligibility = await this.buildEligibilitySnapshot(
          tenantId,
          student.user_id,
        );
        const rows = await manager.query<Array<{ registration_id: string }>>(
          `INSERT INTO exam_semester_registrations
             (tenant_id, window_id, student_user_id, semester, fee_status, eligibility_snapshot, status, session_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (window_id, student_user_id) DO NOTHING RETURNING registration_id`,
          [
            tenantId,
            windowId,
            student.user_id,
            semester,
            eligibility.fee_clear ? 'PAID' : 'PENDING',
            JSON.stringify(eligibility),
            eligibility.eligible ? 'PENDING' : 'REJECTED',
            window.session_id,
          ],
        );
        created += rows.length;
      }
      return { created, total_students: students.length };
    });
  }

  private async buildEligibilitySnapshot(
    tenantId: string,
    studentUserId: string,
  ) {
    const [attendance, pendingDues] = await Promise.all([
      this.attendanceEligibility.evaluate(tenantId, studentUserId, {
        context: 'EXAM_DESK',
      }),
      this.finance.getPendingDues(studentUserId, tenantId),
    ]);
    const blockReasons: string[] = [];
    if (!attendance.eligible && attendance.reason) {
      blockReasons.push(attendance.reason);
    }
    if (pendingDues.length > 0) {
      blockReasons.push('Pending fee dues');
    }
    return {
      eligible: blockReasons.length === 0,
      attendance_percent: attendance.attendance_percent ?? 0,
      fee_clear: pendingDues.length === 0,
      block_reasons: blockReasons,
    };
  }

  /* ── Backlog / supplementary ── */

  async listBacklogApplications(tenantId: string, status?: string) {
    const params: unknown[] = [tenantId];
    let sql = `
      SELECT a.*, u.name AS student_name, sp.enrollment_number,
             sub.subject_name, sub.subject_code
      FROM exam_applications a
      JOIN users u ON u.user_id = a.student_user_id
      LEFT JOIN student_profiles sp ON sp.user_id = a.student_user_id
      LEFT JOIN academic_subjects sub ON sub.subject_id = a.subject_id
      WHERE u.tenant_id = $1 AND a.tenant_id = $1 AND a.application_type = 'BACKLOG'`;
    if (status) {
      params.push(status);
      sql += ` AND a.status = $${params.length}`;
    }
    sql += ' ORDER BY a.created_at DESC LIMIT 200';
    return this.db.query(sql, params);
  }

  /* ── Question papers ── */

  async listQuestionPapers(tenantId: string, status?: string) {
    return this.paperWorkflow().list(tenantId, status);
  }

  async createQuestionPaperRecord(
    tenantId: string,
    actorUserId: string,
    dto: CreateQuestionPaperDto,
    role: string,
  ) {
    return this.paperWorkflow().create(tenantId, actorUserId, role, dto);
  }

  async updateQuestionPaperStatus(
    tenantId: string,
    qpId: string,
    actorUserId: string,
    status: string,
    role: string,
    reason?: string,
  ) {
    return this.paperWorkflow().updateStatus(
      tenantId,
      qpId,
      actorUserId,
      role,
      { status, reason },
    );
  }

  private paperWorkflow(): QuestionPaperWorkflowService {
    if (!this.questionPapers)
      throw new ServiceUnavailableException(
        'Question-paper workflow is unavailable',
      );
    return this.questionPapers;
  }

  /* ── Exam day ── */

  private examDayTenant(tenantId: string): string {
    const scopedTenantId = requireTenantId(tenantId);
    if (!isUUID(scopedTenantId)) {
      throw new ForbiddenException('Valid tenant context required');
    }
    return scopedTenantId;
  }

  private validateExamDayScheduleId(examScheduleId: string): void {
    if (!isUUID(examScheduleId)) {
      throw new BadRequestException('A valid examination schedule is required');
    }
  }

  async listTodayExams(tenantId: string, date?: string) {
    const scopedTenantId = this.examDayTenant(tenantId);
    if (validateSync(plainToInstance(ExamDayDateQueryDto, { date })).length)
      throw new BadRequestException(
        'Use a valid examination date (YYYY-MM-DD)',
      );
    const today = date ?? new Date().toISOString().slice(0, 10);
    return this.db.query<Array<Record<string, unknown>>>(
      `SELECT es.exam_schedule_id, es.exam_type, es.exam_date::text AS exam_date, es.start_time, es.end_time, es.venue,
              sub.subject_name, sub.subject_code,
              COALESCE((
                SELECT COUNT(*)::int FROM exam_day_attendance da
                WHERE da.exam_schedule_id = es.exam_schedule_id AND da.tenant_id = es.tenant_id
              ), 0) AS marked_count
       FROM exam_schedules es
       LEFT JOIN academic_subjects sub ON sub.subject_id = es.subject_id
       WHERE es.tenant_id = $1 AND es.exam_date = $2 AND es.deleted_at IS NULL AND es.status <> 'CANCELLED'
       ORDER BY es.start_time`,
      [scopedTenantId, today],
    );
  }

  async listExamDayRoster(tenantId: string, examScheduleId: string) {
    const scopedTenantId = this.examDayTenant(tenantId);
    this.validateExamDayScheduleId(examScheduleId);
    return this.db.query<Array<Record<string, unknown>>>(
      `SELECT esa.student_user_id, u.name AS student_name,
              COALESCE(to_jsonb(sp)->>'enrollment_number', sp.enrollment_no, sp.prn_number) AS enrollment_number,
              esa.room, esa.seat_number,
              da.status AS attendance_status, da.attendance_id
       FROM exam_seating_allocations esa
       JOIN exam_schedules es
         ON es.exam_schedule_id = esa.exam_schedule_id AND es.tenant_id = esa.tenant_id
       JOIN users u ON u.user_id = esa.student_user_id AND u.tenant_id = esa.tenant_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id AND sp.tenant_id = esa.tenant_id
       LEFT JOIN exam_day_attendance da
         ON da.exam_schedule_id = esa.exam_schedule_id AND da.student_user_id = esa.student_user_id
           AND da.tenant_id = esa.tenant_id
       WHERE esa.tenant_id = $1 AND esa.exam_schedule_id = $2
       ORDER BY esa.room, esa.seat_number, u.name`,
      [scopedTenantId, examScheduleId],
    );
  }

  async listExamDayAttendance(tenantId: string, examScheduleId: string) {
    const scopedTenantId = this.examDayTenant(tenantId);
    this.validateExamDayScheduleId(examScheduleId);
    return this.db.query<Array<Record<string, unknown>>>(
      `SELECT da.*, u.name AS student_name,
              COALESCE(to_jsonb(sp)->>'enrollment_number', sp.enrollment_no, sp.prn_number) AS enrollment_number,
              marker.name AS marked_by_name
       FROM exam_day_attendance da
       JOIN exam_schedules es
         ON es.exam_schedule_id = da.exam_schedule_id AND es.tenant_id = da.tenant_id
       JOIN users u ON u.user_id = da.student_user_id AND u.tenant_id = da.tenant_id
       LEFT JOIN student_profiles sp ON sp.user_id = da.student_user_id AND sp.tenant_id = da.tenant_id
       LEFT JOIN users marker ON marker.user_id = da.marked_by AND marker.tenant_id = da.tenant_id
       WHERE da.tenant_id = $1 AND da.exam_schedule_id = $2
       ORDER BY u.name`,
      [scopedTenantId, examScheduleId],
    );
  }

  async markExamDayAttendance(
    tenantId: string,
    actorUserId: string,
    dto: MarkExamDayAttendanceDto,
  ) {
    const scopedTenantId = this.examDayTenant(tenantId);
    this.validateExamDayScheduleId(dto.exam_schedule_id);
    if (!isUUID(dto.student_user_id)) {
      throw new BadRequestException('A valid student is required');
    }
    if (
      !(EXAM_DAY_ATTENDANCE_STATUSES as readonly string[]).includes(dto.status)
    ) {
      throw new BadRequestException('Invalid attendance status');
    }

    return this.db.transaction(async (manager) => {
      const [schedule] = await manager.query<
        Array<{ exam_schedule_id: string }>
      >(
        `SELECT exam_schedule_id FROM exam_schedules
         WHERE tenant_id = $1 AND exam_schedule_id = $2 AND deleted_at IS NULL AND status <> 'CANCELLED'
         FOR UPDATE`,
        [scopedTenantId, dto.exam_schedule_id],
      );
      if (!schedule) throw new NotFoundException('Exam schedule not found');

      // The existing seating roster is the Exam Day screen's source of candidates.
      // Keep its ownership and membership stable until the write has committed.
      const [candidate] = await manager.query<Array<{ seating_id: string }>>(
        `SELECT esa.seating_id FROM exam_seating_allocations esa
         JOIN users u ON u.user_id = esa.student_user_id AND u.tenant_id = esa.tenant_id
         WHERE esa.tenant_id = $1 AND esa.exam_schedule_id = $2 AND esa.student_user_id = $3
         FOR SHARE OF esa, u`,
        [scopedTenantId, dto.exam_schedule_id, dto.student_user_id],
      );
      if (!candidate) {
        throw new BadRequestException(
          'Student is not on this examination roster',
        );
      }

      // Receipt/missing-report writers take this same schedule lock first.
      // Never turn a candidate absent while a physical receipt or unresolved
      // missing-script report still says that the candidate sat the exam.
      if (!['PRESENT', 'LATE'].includes(dto.status)) {
        const conflicts = await manager.query<Array<{ kind: string }>>(
          `SELECT 'RECEIPT' AS kind FROM answer_sheet_tracking
           WHERE tenant_id=$1 AND exam_schedule_id=$2 AND student_user_id=$3 AND collected_at IS NOT NULL
           UNION ALL
           SELECT 'MISSING' AS kind FROM exam_script_discrepancies
           WHERE tenant_id=$1 AND exam_schedule_id=$2 AND student_user_id=$3 AND status='MISSING'
           LIMIT 1`,
          [scopedTenantId, dto.exam_schedule_id, dto.student_user_id],
        );
        if (conflicts.length)
          throw new ConflictException(
            'Resolve the script receipt or missing-script discrepancy before marking this candidate absent, medical or debarred',
          );
      }

      const result = await manager.query<
        | Array<{ attendance_id: string; status: string }>
        | [Array<{ attendance_id: string; status: string }>, number]
      >(
        `INSERT INTO exam_day_attendance
         (tenant_id, exam_schedule_id, student_user_id, status, marked_by)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (exam_schedule_id, student_user_id)
       DO UPDATE SET status = EXCLUDED.status, marked_by = EXCLUDED.marked_by, marked_at = NOW()
       WHERE exam_day_attendance.tenant_id = EXCLUDED.tenant_id
       RETURNING *`,
        [
          scopedTenantId,
          dto.exam_schedule_id,
          dto.student_user_id,
          dto.status,
          actorUserId,
        ],
      );
      const [row] = (Array.isArray(result[0]) ? result[0] : result) as Array<{
        attendance_id: string;
        status: string;
      }>;
      if (!row) {
        throw new BadRequestException(
          'Attendance record scope is inconsistent',
        );
      }
      await this.audit.log(
        scopedTenantId,
        actorUserId,
        {
          action: 'EXAM_DAY_ATTENDANCE_MARKED',
          resource_type: 'exam_day_attendance',
          resource_id: row.attendance_id,
          new_value: {
            status: dto.status,
            exam_schedule_id: dto.exam_schedule_id,
            student_user_id: dto.student_user_id,
          },
        },
        manager,
      );
      return row;
    });
  }

  /* ── Exam centres ── */

  async listExamCentres(tenantId: string) {
    return this.queryOrEmpty(
      `SELECT space_id, building_name, room_number, capacity, status, facilities
       FROM campus_spaces
       WHERE tenant_id = $1 AND space_type = 'CLASSROOM'
       ORDER BY building_name, room_number`,
      [tenantId],
    );
  }

  /* ── Reports ── */

  async getReportsSummary(tenantId: string, semester?: number) {
    const sem = semester ?? 4;
    const [passFail, topRankers, deptStats, backlogCount] = await Promise.all([
      this.db.query<Array<{ label: string; count: number }>>(
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
        [tenantId, sem],
      ),
      this.semesterResults.topStudents(tenantId, sem, 10),
      this.db.query(
        `SELECT COALESCE(sp.branch_name, d.dept_name, 'Unknown') AS department, COUNT(DISTINCT e.student_user_id)::int AS students
         FROM student_course_enrollments e
         JOIN users u ON u.user_id = e.student_user_id AND u.tenant_id = e.tenant_id
         LEFT JOIN student_profiles sp ON sp.user_id = e.student_user_id
         LEFT JOIN departments d ON d.dept_id = u.dept_id
         WHERE e.tenant_id = $1 AND e.semester = $2
         GROUP BY COALESCE(sp.branch_name, d.dept_name, 'Unknown')
         ORDER BY students DESC`,
        [tenantId, sem],
      ),
      this.db.query(
        `SELECT COUNT(*)::int AS c FROM exam_applications a
         JOIN users u ON u.user_id = a.student_user_id
         WHERE u.tenant_id = $1 AND a.application_type = 'BACKLOG' AND a.status = 'PENDING'`,
        [tenantId],
      ),
    ]);

    const totalPublished = passFail.reduce((s, r) => s + r.count, 0);
    const passed = passFail.find((r) => r.label === 'PASS')?.count ?? 0;

    return {
      semester: sem,
      pass_fail: passFail,
      pass_percentage:
        totalPublished > 0 ? Math.round((passed / totalPublished) * 100) : 0,
      // Reuse the Grade Cards & Merit ranking rules; keep this API's shape and
      // return numbers because the report page formats GPA with toFixed().
      top_rankers: topRankers.map((row) => ({
        name: row.student_name,
        enrollment_number: row.enrollment_number,
        cgpa: row.cgpa == null ? null : Number(row.cgpa),
        sgpa: row.sgpa == null ? null : Number(row.sgpa),
      })),
      department_enrollment: deptStats,
      pending_backlog: backlogCount[0]?.c ?? 0,
    };
  }

  /* ── Notifications ── */

  async sendNotificationCampaign(
    tenantId: string,
    actorUserId: string,
    dto: { channel: string; subject: string; body: string; audience: string },
  ) {
    const channel = String(dto.channel ?? '')
      .trim()
      .toUpperCase();
    if (['EMAIL', 'SMS', 'WHATSAPP'].includes(channel)) {
      throw new ServiceUnavailableException(
        'External examination alerts are unavailable: email, SMS and WhatsApp provider delivery has not been implemented. Use in-app notifications.',
      );
    }
    if (channel !== 'IN_APP')
      throw new BadRequestException(
        'Unsupported examination notification channel',
      );
    const subject = typeof dto.subject === 'string' ? dto.subject.trim() : '';
    const body = typeof dto.body === 'string' ? dto.body.trim() : '';
    if (!subject || subject.length > 200 || !body)
      throw new BadRequestException(
        'A subject of at most 200 characters and a non-empty message are required',
      );
    if (dto.audience !== 'ALL_STUDENTS')
      throw new BadRequestException(
        'Only the all active students audience is supported',
      );
    dto = { ...dto, channel, subject, body };

    const students = await this.db.query<Array<{ user_id: string }>>(
      `SELECT u.user_id FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND r.role_name = 'Student'
         AND u.is_active = TRUE AND u.deleted_at IS NULL`,
      [tenantId],
    );

    const [row] = await this.db.query<
      Array<{ campaign_id: string } & Record<string, unknown>>
    >(
      `INSERT INTO exam_notification_campaigns
         (tenant_id, channel, subject, body, audience, recipient_count, sent_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        tenantId,
        dto.channel,
        dto.subject,
        dto.body,
        dto.audience,
        students.length,
        actorUserId,
      ],
    );

    // External provider implementations are absent; never enqueue delivery stubs.
    const queueDelivery = false;
    const userIds = students.map((s) => s.user_id);

    let delivered = 0;
    if (userIds.length > 0) {
      for (const userId of userIds) {
        await this.notificationDispatch.dispatch({
          tenantId,
          userId,
          category: 'EXAMS',
          title: dto.subject,
          message: dto.body,
          actionLink: '/student/exams',
          severity: 'info',
          intent: 'info',
          queueDelivery,
          metadata: { channel: dto.channel, campaign: true },
        });
        delivered += 1;
      }
    }

    await this.audit.log(tenantId, actorUserId, {
      action: 'NOTIFICATION_CAMPAIGN_SENT',
      resource_type: 'exam_notification_campaign',
      resource_id: String(row?.campaign_id ?? ''),
      new_value: {
        subject: dto.subject,
        channel: dto.channel,
        delivered: userIds.length,
      },
    });

    return {
      ...row,
      delivered,
      channel: dto.channel,
      message:
        delivered === 0
          ? 'No students found for this tenant — campaign saved but nothing was delivered.'
          : `${delivered} in-app notifications created on student accounts.`,
    };
  }

  async listNotificationCampaigns(tenantId: string) {
    return this.queryOrEmpty(
      `SELECT c.*, u.name AS sent_by_name
       FROM exam_notification_campaigns c
       LEFT JOIN users u ON u.user_id = c.sent_by
       WHERE c.tenant_id = $1
       ORDER BY c.sent_at DESC LIMIT 50`,
      [tenantId],
    );
  }

  /* ── Role task inbox ── */

  async listMyTasks(tenantId: string) {
    const today = new Date().toISOString().slice(0, 10);
    const [pendingRegs, pendingQp, todayExams, pendingReEval, openWindows] =
      await Promise.all([
        this.queryOrEmpty<{ c: number }>(
          `SELECT COUNT(*)::int AS c FROM exam_semester_registrations WHERE tenant_id = $1 AND status = 'PENDING'`,
          [tenantId],
        ),
        this.queryOrEmpty<{ c: number }>(
          `SELECT COUNT(*)::int AS c FROM exam_question_papers WHERE tenant_id = $1 AND status = 'UPLOADED'`,
          [tenantId],
        ),
        this.db.query(
          `SELECT COUNT(*)::int AS c FROM exam_schedules WHERE tenant_id = $1 AND exam_date = $2`,
          [tenantId, today],
        ),
        this.db.query(
          `SELECT COUNT(*)::int AS c FROM exam_applications a
         JOIN users u ON u.user_id = a.student_user_id
         WHERE u.tenant_id = $1 AND a.application_type = 'RE_EVALUATION'
           AND a.status IN ('PENDING','ASSIGNED','UNDER_REVIEW')`,
          [tenantId],
        ),
        this.queryOrEmpty<{ c: number }>(
          `SELECT COUNT(*)::int AS c FROM exam_form_windows WHERE tenant_id = $1 AND status = 'OPEN'`,
          [tenantId],
        ),
      ]);

    const tasks: Array<{
      id: string;
      title: string;
      count: number;
      priority: 'HIGH' | 'MEDIUM' | 'LOW';
      href: string;
    }> = [];

    const regCount = pendingRegs[0]?.c ?? 0;
    if (regCount > 0) {
      tasks.push({
        id: 'registrations',
        title: 'Review pending exam registrations',
        count: regCount,
        priority: 'HIGH',
        href: '/exam-cell/form-fillup',
      });
    }

    const qpCount = pendingQp[0]?.c ?? 0;
    if (qpCount > 0) {
      tasks.push({
        id: 'question-papers',
        title: 'Moderate uploaded question papers',
        count: qpCount,
        priority: 'HIGH',
        href: '/exam-cell/question-papers',
      });
    }

    const examCount = todayExams[0]?.c ?? 0;
    if (examCount > 0) {
      tasks.push({
        id: 'exam-day',
        title: "Today's exam sessions need attendance",
        count: examCount,
        priority: 'HIGH',
        href: '/exam-cell/exam-day',
      });
    }

    const reEvalCount = pendingReEval[0]?.c ?? 0;
    if (reEvalCount > 0) {
      tasks.push({
        id: 're-evaluations',
        title: 'Process revaluation applications',
        count: reEvalCount,
        priority: 'MEDIUM',
        href: '/exam-cell/re-evaluations',
      });
    }

    const windowCount = openWindows[0]?.c ?? 0;
    if (windowCount > 0) {
      tasks.push({
        id: 'form-windows',
        title: 'Open form fill-up windows active',
        count: windowCount,
        priority: 'LOW',
        href: '/exam-cell/form-fillup',
      });
    }

    return tasks;
  }
}
