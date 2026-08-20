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
import { NotificationDispatchService } from '../../core/notifications/notification-dispatch.service';

@Injectable()
export class ExamCellOperationsService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly attendanceEligibility: AttendanceEligibilityService,
    private readonly finance: FinanceService,
    private readonly audit: ExamCellAuditService,
    private readonly notificationDispatch: NotificationDispatchService,
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
       LEFT JOIN exam_sessions s ON s.session_id = w.session_id
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
    const [row] = await this.db.query(
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
    await this.audit.log(tenantId, actorUserId, {
      action: 'FORM_WINDOW_CREATED',
      resource_type: 'exam_form_window',
      resource_id: row.window_id,
      new_value: { title: dto.title, semester: dto.semester },
    });
    return row;
  }

  async updateFormWindowStatus(
    tenantId: string,
    windowId: string,
    actorUserId: string,
    status: 'OPEN' | 'CLOSED' | 'DRAFT',
  ) {
    const [row] = await this.db.query(
      `UPDATE exam_form_windows SET status = $3, updated_at = NOW()
       WHERE tenant_id = $1 AND window_id = $2
       RETURNING *`,
      [tenantId, windowId, status],
    );
    if (!row) throw new NotFoundException('Form window not found');
    await this.audit.log(tenantId, actorUserId, {
      action: 'FORM_WINDOW_STATUS_CHANGED',
      resource_type: 'exam_form_window',
      resource_id: windowId,
      new_value: { status },
    });
    return row;
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
      JOIN users u ON u.user_id = r.student_user_id
      LEFT JOIN student_profiles sp ON sp.user_id = r.student_user_id
      LEFT JOIN exam_form_windows w ON w.window_id = r.window_id
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
    const [row] = await this.db.query(
      `UPDATE exam_semester_registrations
       SET status = $3, reviewed_by = $4, reviewed_at = NOW()
       WHERE tenant_id = $1 AND registration_id = $2
       RETURNING *`,
      [tenantId, registrationId, status, actorUserId],
    );
    if (!row) throw new NotFoundException('Registration not found');
    await this.audit.log(tenantId, actorUserId, {
      action:
        status === 'APPROVED'
          ? 'REGISTRATION_APPROVED'
          : 'REGISTRATION_REJECTED',
      resource_type: 'exam_semester_registration',
      resource_id: registrationId,
    });
    return row;
  }

  async seedRegistrationsFromSemester(
    tenantId: string,
    windowId: string,
    semester: number,
  ) {
    const students = await this.db.query(
      `SELECT DISTINCT u.user_id
       FROM users u
       JOIN student_course_enrollments e ON e.student_user_id = u.user_id AND e.tenant_id = $1
       WHERE u.tenant_id = $1 AND e.semester = $2`,
      [tenantId, semester],
    );

    let created = 0;
    for (const s of students) {
      const eligibility = await this.buildEligibilitySnapshot(
        tenantId,
        s.user_id,
      );
      const feeClear = eligibility.fee_clear;
      const [existing] = await this.db.query(
        `SELECT registration_id FROM exam_semester_registrations
         WHERE window_id = $1 AND student_user_id = $2`,
        [windowId, s.user_id],
      );
      if (existing) continue;

      await this.db.query(
        `INSERT INTO exam_semester_registrations
           (tenant_id, window_id, student_user_id, semester, fee_status, eligibility_snapshot, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          tenantId,
          windowId,
          s.user_id,
          semester,
          feeClear ? 'PAID' : 'PENDING',
          JSON.stringify(eligibility),
          eligibility.eligible ? 'PENDING' : 'REJECTED',
        ],
      );
      created++;
    }
    return { created, total_students: students.length };
  }

  private async buildEligibilitySnapshot(
    tenantId: string,
    studentUserId: string,
  ) {
    const [attendance, pendingDues] = await Promise.all([
      this.attendanceEligibility.evaluate(tenantId, studentUserId, {
        context: 'EXAM_DESK',
      }),
      this.finance.getPendingDues(studentUserId),
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
      WHERE u.tenant_id = $1 AND a.application_type = 'BACKLOG'`;
    if (status) {
      params.push(status);
      sql += ` AND a.status = $${params.length}`;
    }
    sql += ' ORDER BY a.created_at DESC LIMIT 200';
    return this.db.query(sql, params);
  }

  /* ── Question papers ── */

  async listQuestionPapers(tenantId: string, status?: string) {
    const params: unknown[] = [tenantId];
    let sql = `
      SELECT qp.*, sub.subject_name, sub.subject_code,
             es.exam_date, es.exam_type, setter.name AS setter_name
      FROM public.exam_question_papers qp
      LEFT JOIN academic_subjects sub ON sub.subject_id = qp.subject_id
      LEFT JOIN exam_schedules es ON es.exam_schedule_id = qp.exam_schedule_id
      LEFT JOIN users setter ON setter.user_id = qp.setter_user_id
      WHERE qp.tenant_id = $1`;
    if (status) {
      params.push(status);
      sql += ` AND qp.status = $${params.length}`;
    }
    sql += ' ORDER BY qp.created_at DESC LIMIT 100';
    return this.queryOrEmpty(sql, params);
  }

  async createQuestionPaperRecord(
    tenantId: string,
    actorUserId: string,
    dto: {
      exam_schedule_id?: string;
      subject_id?: number;
      setter_user_id?: string;
      notes?: string;
    },
  ) {
    let rows: Record<string, unknown>[];
    try {
      rows = await this.db.query(
        `INSERT INTO public.exam_question_papers
           (tenant_id, exam_schedule_id, subject_id, setter_user_id, notes, created_by, status)
         VALUES ($1,$2,$3,$4,$5,$6,'UPLOADED')
         RETURNING *`,
        [
          tenantId,
          dto.exam_schedule_id ?? null,
          dto.subject_id ?? null,
          dto.setter_user_id ?? null,
          dto.notes ?? null,
          actorUserId,
        ],
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/relation "exam_question_papers" does not exist/i.test(message)) {
        throw new BadRequestException(
          'Question paper table not found. Run database migrations (npm run db:migrate) and restart the backend.',
        );
      }
      throw new BadRequestException(
        message || 'Could not create question paper record',
      );
    }
    const row = rows[0];
    if (!row)
      throw new BadRequestException('Could not create question paper record');
    await this.audit.log(tenantId, actorUserId, {
      action: 'QP_UPLOADED',
      resource_type: 'exam_question_paper',
      resource_id: String(row.qp_id),
    });
    return row;
  }

  async updateQuestionPaperStatus(
    tenantId: string,
    qpId: string,
    actorUserId: string,
    status: string,
  ) {
    const allowed = [
      'UNDER_MODERATION',
      'COE_APPROVED',
      'PRINT_AUTHORIZED',
      'REJECTED',
    ];
    if (!allowed.includes(status)) {
      throw new BadRequestException('Invalid QP status transition');
    }
    const [row] = await this.queryOrEmpty<Record<string, unknown>>(
      `UPDATE exam_question_papers
       SET status = $3, updated_at = NOW(),
           approved_by = CASE WHEN $3 IN ('COE_APPROVED','PRINT_AUTHORIZED') THEN $4 ELSE approved_by END,
           approved_at = CASE WHEN $3 IN ('COE_APPROVED','PRINT_AUTHORIZED') THEN NOW() ELSE approved_at END
       WHERE tenant_id = $1 AND qp_id = $2
       RETURNING *`,
      [tenantId, qpId, status, actorUserId],
    );
    if (!row) throw new NotFoundException('Question paper not found');
    await this.audit.log(tenantId, actorUserId, {
      action: `QP_${status}`,
      resource_type: 'exam_question_paper',
      resource_id: qpId,
      new_value: { status },
    });
    return row;
  }

  /* ── Exam day ── */

  async listTodayExams(tenantId: string) {
    const today = new Date().toISOString().slice(0, 10);
    return this.queryOrEmpty(
      `SELECT es.exam_schedule_id, es.exam_type, es.exam_date, es.start_time, es.end_time, es.venue,
              sub.subject_name, sub.subject_code,
              COALESCE((
                SELECT COUNT(*)::int FROM exam_day_attendance da
                WHERE da.exam_schedule_id = es.exam_schedule_id
              ), 0) AS marked_count
       FROM exam_schedules es
       LEFT JOIN academic_subjects sub ON sub.subject_id = es.subject_id
       WHERE es.tenant_id = $1 AND es.exam_date = $2
       ORDER BY es.start_time`,
      [tenantId, today],
    );
  }

  async listExamDayRoster(tenantId: string, examScheduleId: string) {
    return this.queryOrEmpty(
      `SELECT esa.student_user_id, u.name AS student_name, sp.enrollment_number,
              esa.room, esa.seat_number,
              da.status AS attendance_status, da.attendance_id
       FROM exam_seating_allocations esa
       JOIN users u ON u.user_id = esa.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       LEFT JOIN exam_day_attendance da
         ON da.exam_schedule_id = esa.exam_schedule_id AND da.student_user_id = esa.student_user_id
       WHERE esa.tenant_id = $1 AND esa.exam_schedule_id = $2
       ORDER BY esa.room, esa.seat_number, u.name`,
      [tenantId, examScheduleId],
    );
  }

  async listExamDayAttendance(tenantId: string, examScheduleId: string) {
    return this.queryOrEmpty(
      `SELECT da.*, u.name AS student_name, sp.enrollment_number,
              marker.name AS marked_by_name
       FROM exam_day_attendance da
       JOIN users u ON u.user_id = da.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = da.student_user_id
       LEFT JOIN users marker ON marker.user_id = da.marked_by
       WHERE da.tenant_id = $1 AND da.exam_schedule_id = $2
       ORDER BY u.name`,
      [tenantId, examScheduleId],
    );
  }

  async markExamDayAttendance(
    tenantId: string,
    actorUserId: string,
    dto: {
      exam_schedule_id: string;
      student_user_id: string;
      status: string;
    },
  ) {
    const allowed = ['PRESENT', 'ABSENT', 'MEDICAL', 'DEBARRED', 'LATE'];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException('Invalid attendance status');
    }
    const [row] = await this.db.query(
      `INSERT INTO exam_day_attendance
         (tenant_id, exam_schedule_id, student_user_id, status, marked_by)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (exam_schedule_id, student_user_id)
       DO UPDATE SET status = EXCLUDED.status, marked_by = EXCLUDED.marked_by, marked_at = NOW()
       RETURNING *`,
      [
        tenantId,
        dto.exam_schedule_id,
        dto.student_user_id,
        dto.status,
        actorUserId,
      ],
    );
    await this.audit.log(tenantId, actorUserId, {
      action: 'EXAM_DAY_ATTENDANCE_MARKED',
      resource_type: 'exam_day_attendance',
      resource_id: row?.attendance_id,
      new_value: { status: dto.status, student_user_id: dto.student_user_id },
    });
    return row;
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
      this.queryOrEmpty<{ label: string; count: number }>(
        `SELECT ser.status AS label, COUNT(*)::int AS count
         FROM student_exam_reports ser
         JOIN exam_result_sessions ers ON ers.session_id = ser.session_id
         WHERE ers.tenant_id = $1 AND ers.semester = $2
         GROUP BY ser.status`,
        [tenantId, sem],
      ),
      this.queryOrEmpty(
        `SELECT u.name, sp.enrollment_number, sg.cgpa, sg.sgpa
         FROM student_grade_cards sg
         JOIN users u ON u.user_id = sg.student_user_id
         LEFT JOIN student_profiles sp ON sp.user_id = sg.student_user_id
         WHERE sg.tenant_id = $1 AND sg.semester = $2
         ORDER BY sg.cgpa DESC NULLS LAST
         LIMIT 10`,
        [tenantId, sem],
      ),
      this.queryOrEmpty(
        `SELECT COALESCE(sp.branch_name, d.dept_name, 'Unknown') AS department, COUNT(*)::int AS students
         FROM student_course_enrollments e
         JOIN users u ON u.user_id = e.student_user_id
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
    const passed =
      passFail.find((r) => r.label === 'PASS' || r.label === 'PUBLISHED')
        ?.count ?? 0;

    return {
      semester: sem,
      pass_fail: passFail,
      pass_percentage:
        totalPublished > 0 ? Math.round((passed / totalPublished) * 100) : 0,
      top_rankers: topRankers,
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
    const students = await this.db.query(
      `SELECT u.user_id FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND r.role_name = 'Student'`,
      [tenantId],
    );

    const [row] = await this.db.query(
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

    const queueDelivery =
      dto.channel === 'EMAIL' ||
      dto.channel === 'WHATSAPP' ||
      dto.channel === 'SMS';
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
          : dto.channel === 'IN_APP'
            ? `${delivered} in-app notifications created on student accounts.`
            : `${delivered} notifications queued (${dto.channel} + in-app). Check student portal or delivery logs.`,
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
