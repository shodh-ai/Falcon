import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { FinanceService } from '../finance/finance.service';
import { AdmitCardPdfService } from '../exams/pdf/admit-card-pdf.service';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { NotificationEvents } from '../../core/notifications/notification.events';
import { AttendanceEligibilityService } from '../attendance-policy/attendance-eligibility.service';
import { ResultControlService } from './result-control.service';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { ExamCellAuditService } from './exam-cell-audit.service';
import { HallTicketVerificationService } from './hall-ticket-verification.service';
import { invalidateOfficialTranscripts } from './official-transcript-revisions';
import {
  computeGradeFromPercent,
  computePassFail,
  parseGradeBands,
} from './grading-engine';

import {
  resolveReEvaluationSource,
  type ReEvaluationSource,
} from './revaluation-source';

type ReEvaluationApplication = {
  source_result_id?: string | null;
  source_session_id?: string | null;
  source_mark_id?: string | null;
  exam_application_id: string;
  student_user_id: string;
  subject_id: number;
  status: string;
  fee_status: string;
  assigned_faculty_user_id: string | null;
  original_marks: number | string | null;
  revised_marks: number | string | null;
  report_notes: string | null;
  student_name: string;
  subject_name: string;
  subject_code: string;
};

@Injectable()
export class ExamCellService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly finance: FinanceService,
    private readonly admitPdf: AdmitCardPdfService,
    private readonly notify: NotificationEmitterService,
    private readonly events: EventEmitter2,
    private readonly attendanceEligibility: AttendanceEligibilityService,
    private readonly resultControl: ResultControlService,
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

  private normalizeSeatingAllocations(
    value: unknown,
  ): Array<Record<string, unknown>> {
    if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value) as unknown;
        return Array.isArray(parsed)
          ? (parsed as Array<Record<string, unknown>>)
          : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  async dashboard(tenantId: string) {
    const today = new Date().toISOString().slice(0, 10);
    const [
      [schedules],
      [upcoming],
      [todayExams],
      [activeSessions],
      [registeredStudents],
      [pendingHallTickets],
      [pendingMarks],
      [reEvals],
      [supplementaryApps],
      [ufmOpen],
      [duties],
      [invigilatorsToday],
      [pendingResultSessions],
      [hallTicketsGenerated],
      [studentsEligible],
      [todaysAttendance],
      [formRegistrations],
    ] = await Promise.all([
      this.queryOrEmpty<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM exam_schedules WHERE tenant_id = $1`,
        [tenantId],
      ),
      this.queryOrEmpty<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM exam_schedules WHERE tenant_id = $1 AND exam_date > $2::date`,
        [tenantId, today],
      ),
      this.queryOrEmpty<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM exam_schedules WHERE tenant_id = $1 AND exam_date = $2::date`,
        [tenantId, today],
      ),
      this.queryOrEmpty<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM exam_sessions WHERE tenant_id = $1 AND status IN ('OPEN','ACTIVE')`,
        [tenantId],
      ),
      this.queryOrEmpty<{ c: number }>(
        `SELECT COUNT(DISTINCT student_user_id)::int AS c FROM (
           SELECT student_user_id FROM exam_semester_registrations WHERE tenant_id = $1
           UNION
           SELECT a.student_user_id FROM exam_applications a
           JOIN users u ON u.user_id = a.student_user_id
           WHERE u.tenant_id = $1
         ) registered`,
        [tenantId],
      ),
      this.queryOrEmpty<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM exam_admit_card_entries e
         JOIN exam_admit_card_runs r ON r.run_id = e.run_id
         WHERE r.tenant_id = $1 AND e.eligible = true AND e.pdf_path IS NULL`,
        [tenantId],
      ),
      this.queryOrEmpty<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM academic_marks WHERE tenant_id = $1 AND status = 'PENDING_COE'`,
        [tenantId],
      ),
      this.queryOrEmpty<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM exam_applications a
         JOIN users u ON u.user_id = a.student_user_id
         WHERE u.tenant_id = $1 AND a.application_type = 'RE_EVALUATION'
           AND a.fee_status = 'PAID' AND a.status IN ('PENDING','ASSIGNED','UNDER_REVIEW')`,
        [tenantId],
      ),
      this.queryOrEmpty<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM exam_applications a
         JOIN users u ON u.user_id = a.student_user_id
         WHERE u.tenant_id = $1 AND a.application_type = 'BACKLOG' AND a.status = 'PENDING'`,
        [tenantId],
      ),
      this.queryOrEmpty<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM ufm_cases WHERE tenant_id = $1 AND status != 'CLOSED'`,
        [tenantId],
      ),
      this.queryOrEmpty<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM exam_invigilation_duties WHERE tenant_id = $1 AND published = true`,
        [tenantId],
      ),
      this.queryOrEmpty<{ c: number }>(
        `SELECT COUNT(DISTINCT d.faculty_user_id)::int AS c
         FROM exam_invigilation_duties d
         JOIN exam_schedules es ON es.exam_schedule_id = d.exam_schedule_id
         WHERE d.tenant_id = $1 AND es.exam_date = $2::date AND d.published = true`,
        [tenantId, today],
      ),
      this.queryOrEmpty<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM exam_result_sessions
         WHERE tenant_id = $1 AND declared_at IS NULL`,
        [tenantId],
      ),
      this.queryOrEmpty<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM exam_admit_card_entries e
         JOIN exam_admit_card_runs r ON r.run_id = e.run_id
         WHERE r.tenant_id = $1 AND e.eligible = true AND e.pdf_path IS NOT NULL`,
        [tenantId],
      ),
      this.queryOrEmpty<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM hall_ticket_approvals
         WHERE tenant_id = $1 AND stage = 'APPROVED'`,
        [tenantId],
      ),
      this.queryOrEmpty<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM exam_day_attendance
         WHERE tenant_id = $1 AND marked_at::date = $2::date`,
        [tenantId, today],
      ),
      this.queryOrEmpty<{ c: number }>(
        `SELECT COUNT(DISTINCT student_user_id)::int AS c FROM exam_semester_registrations
         WHERE tenant_id = $1 AND status IN ('PENDING','APPROVED')`,
        [tenantId],
      ),
    ]);

    // Outcomes are report records, not workflow stages or unique students.
    // Use the same declaration boundary as published student result history.
    // Do not turn a broken reporting query into an apparently empty chart.
    const resultStats = await this.db.query<
      Array<{ label: string; count: number }>
    >(
      `SELECT COALESCE(br.result_status, ser.result_status) AS label, COUNT(*)::int AS count
       FROM student_exam_reports ser
       JOIN exam_result_sessions ers
         ON ers.session_id = ser.session_id AND ers.tenant_id = ser.tenant_id
       LEFT JOIN exam_backlog_current_results br ON br.source_report_id = ser.report_id
         AND br.tenant_id = ser.tenant_id AND br.student_user_id = ser.student_user_id
         AND br.semester = ers.semester AND br.selected_attempt_id IS NOT NULL
       WHERE ser.tenant_id = $1
         AND ser.declared_at IS NOT NULL AND ers.declared_at IS NOT NULL
       GROUP BY COALESCE(br.result_status, ser.result_status)
       ORDER BY label`,
      [tenantId],
    );

    return {
      persona: 'Falcon Exam OS',
      schedules: schedules?.c ?? 0,
      upcoming_exams: upcoming?.c ?? 0,
      todays_exams: todayExams?.c ?? 0,
      active_exam_sessions: activeSessions?.c ?? 0,
      registered_students: registeredStudents?.c ?? 0,
      students_eligible: studentsEligible?.c ?? 0,
      hall_tickets_generated: hallTicketsGenerated?.c ?? 0,
      todays_attendance: todaysAttendance?.c ?? 0,
      form_registrations: formRegistrations?.c ?? 0,
      pending_hall_tickets: pendingHallTickets?.c ?? 0,
      pending_coe_marks: pendingMarks?.c ?? 0,
      pending_results: pendingResultSessions?.c ?? 0,
      re_evaluations_queue: reEvals?.c ?? 0,
      pending_supplementary: supplementaryApps?.c ?? 0,
      open_ufm_cases: ufmOpen?.c ?? 0,
      invigilation_duties_published: duties?.c ?? 0,
      invigilators_assigned_today: invigilatorsToday?.c ?? 0,
      published_results: resultStats.reduce((total, row) => total + row.count, 0),
      result_status_chart: resultStats,
    };
  }

  async globalSearch(tenantId: string, query: string) {
    const q = `%${query.trim()}%`;
    if (!query.trim()) return { students: [], schedules: [], subjects: [] };

    const [students, schedules, subjects] = await Promise.all([
      this.db.query(
        `SELECT u.user_id, u.name, sp.enrollment_number, sp.prn_number
         FROM users u
         LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
         JOIN roles r ON r.role_id = u.role_id
         WHERE u.tenant_id = $1 AND r.role_name = 'Student'
           AND (u.name ILIKE $2 OR sp.enrollment_number ILIKE $2 OR sp.prn_number ILIKE $2)
         LIMIT 10`,
        [tenantId, q],
      ),
      this.db.query(
        `SELECT es.exam_schedule_id, es.exam_type, es.exam_date::text AS exam_date, es.venue, sub.subject_name, sub.subject_code
         FROM exam_schedules es
         LEFT JOIN academic_subjects sub ON sub.subject_id = es.subject_id
         WHERE es.tenant_id = $1
           AND (sub.subject_name ILIKE $2 OR sub.subject_code ILIKE $2 OR es.venue ILIKE $2)
         LIMIT 10`,
        [tenantId, q],
      ),
      this.db.query(
        `SELECT subject_id, subject_code, subject_name FROM academic_subjects
         WHERE subject_name ILIKE $1 OR subject_code ILIKE $1
         LIMIT 10`,
        [q],
      ),
    ]);

    return { students, schedules, subjects };
  }

  async listSchedules(tenantId: string) {
    try {
      return await this.db.query(
        `SELECT es.*, es.exam_date::text AS exam_date, sub.subject_name, sub.subject_code
         FROM exam_schedules es
         LEFT JOIN academic_subjects sub ON sub.subject_id = es.subject_id
         WHERE es.tenant_id = $1
         ORDER BY es.exam_date ASC, es.start_time ASC`,
        [tenantId],
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        !/relation .* does not exist|column .* does not exist/i.test(message)
      ) {
        throw err;
      }
      return this.queryOrEmpty(
        `SELECT es.*, es.exam_date::text AS exam_date, NULL::text AS subject_name, NULL::text AS subject_code
         FROM exam_schedules es
         WHERE es.tenant_id = $1
         ORDER BY es.exam_date ASC, es.start_time ASC`,
        [tenantId],
      );
    }
  }

  async createSchedule(
    tenantId: string,
    dto: {
      exam_type: string;
      subject_id: number;
      exam_date: string;
      start_time: string;
      end_time: string;
      venue: string;
      max_marks?: number;
      batch_label?: string;
    },
  ) {
    const subjectRows = await this.db.query(
      `SELECT subject_name, subject_code, semester
       FROM academic_subjects
       WHERE subject_id = $1
       LIMIT 1`,
      [dto.subject_id],
    );
    const subject = subjectRows[0];
    if (!subject) throw new BadRequestException('Subject not found');
    const rows = await this.db.query(
      `INSERT INTO exam_schedules (tenant_id, exam_type, subject_id, exam_date, start_time, end_time, venue, max_marks, batch_label, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'SCHEDULED') RETURNING *, exam_date::text AS exam_date`,
      [
        tenantId,
        dto.exam_type,
        dto.subject_id,
        dto.exam_date,
        dto.start_time,
        dto.end_time,
        dto.venue,
        dto.max_marks ?? 100,
        dto.batch_label ?? null,
      ],
    );
    const schedule = rows[0];
    if (schedule) {
      const semester = subject?.semester ?? null;
      if (semester) {
        const students = await this.db.query(
          `SELECT DISTINCT e.student_user_id
           FROM student_course_enrollments e
           JOIN academic_subjects sub ON sub.subject_id = $3
           WHERE e.tenant_id = $1 AND e.semester = $2`,
          [tenantId, semester, dto.subject_id],
        );
        const label = subject?.subject_code
          ? `${subject.subject_code} — ${subject.subject_name}`
          : 'Examination';
        for (const s of students) {
          this.events.emit(NotificationEvents.ACADEMICS_TIMETABLE_CHANGED, {
            tenantId,
            userId: s.student_user_id,
            courseName: label,
            changeSummary: `${dto.exam_type.replace(/_/g, ' ')} on ${dto.exam_date} ${dto.start_time}–${dto.end_time} at ${dto.venue}`,
          });
        }
      }
    }
    return rows;
  }

  /** Loop 1: Batch admit card engine with finance + attendance + hostel fines gates */
  async generateAdmitCards(
    tenantId: string,
    dto: { batch_label: string; semester?: number },
    runBy: string,
  ) {
    const semester = dto.semester ?? 4;
    const students = await this.db.query(
      `SELECT DISTINCT u.user_id, u.name, u.official_email,
              sp.enrollment_number, sp.enrollment_no, sp.admission_number, sp.profile_photo_url,
              sp.program_name, sp.current_semester, sp.section_code, sp.batch, d.dept_name AS department
       FROM users u
       INNER JOIN student_course_enrollments e ON e.student_user_id = u.user_id AND e.tenant_id = $1
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id AND sp.tenant_id = u.tenant_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       WHERE e.semester = $2 AND u.tenant_id = $1
       ORDER BY u.name`,
      [tenantId, semester],
    );

    const preflightReasons = new Map<string, string[]>();
    for (const student of students as Array<{ user_id: string }>) {
      preflightReasons.set(
        student.user_id,
        await this.getAdmitBlockReasons(student.user_id, tenantId),
      );
    }
    const result = await this.db.transaction(async (manager) => {
      const runRows = await manager.query(
        `INSERT INTO exam_admit_card_runs (tenant_id, batch_label, semester, run_by)
       VALUES ($1,$2,$3,$4) RETURNING *`,
        [tenantId, dto.batch_label, semester, runBy],
      );
      const runId = runRows[0].run_id as string;

      let generated = 0;
      let blocked = 0;
      const results: {
        student_user_id: string;
        name: string;
        eligible: boolean;
        reasons: string[];
      }[] = [];

      const uploadDir = path.join(
        process.cwd(),
        'uploads',
        'admit-cards',
        runId,
      );
      fs.mkdirSync(uploadDir, { recursive: true });

      for (const student of students) {
        const reasons = [
          ...(preflightReasons.get(student.user_id as string) ?? []),
        ];
        const exams = await manager.query(
          `SELECT es.exam_schedule_id, es.exam_date::text AS exam_date,
                es.start_time::text AS start_time, es.end_time::text AS end_time,
                es.exam_type, sub.subject_code, sub.subject_name,
                cs.building_name AS building, COALESCE(seating.room, es.venue) AS room,
                seating.seat_number AS seat_no
         FROM exam_schedules es
         JOIN academic_subjects sub ON sub.subject_id = es.subject_id
         LEFT JOIN exam_seating_allocations seating ON seating.tenant_id = es.tenant_id
           AND seating.exam_schedule_id = es.exam_schedule_id AND seating.student_user_id = $3
         LEFT JOIN campus_spaces cs ON cs.tenant_id = seating.tenant_id AND cs.room_number = seating.room
         WHERE es.tenant_id = $1 AND ($2::text IS NULL OR es.batch_label = $2)
           AND es.exam_date >= CURRENT_DATE AND sub.semester = $4
           AND EXISTS (
             SELECT 1 FROM student_course_enrollments enrollment
             JOIN academic_courses course ON course.course_id = enrollment.course_id AND course.tenant_id = enrollment.tenant_id
             WHERE enrollment.tenant_id = es.tenant_id AND enrollment.student_user_id = $3
               AND enrollment.semester = $4 AND course.course_code = sub.subject_code
           )
         ORDER BY es.exam_date, es.start_time`,
          [tenantId, dto.batch_label || null, student.user_id, semester],
        );
        if (!exams.length)
          reasons.push(
            'Blocked: No scheduled examinations for enrolled subjects in this batch',
          );
        if (reasons.length === 0) {
          try {
            await new HallTicketVerificationService(this.db).check(
              tenantId,
              student.user_id as string,
              (exams as Array<{ exam_schedule_id: string }>).map(
                (exam) => exam.exam_schedule_id,
              ),
              manager,
            );
          } catch (error) {
            if (
              error instanceof BadRequestException ||
              error instanceof NotFoundException
            )
              reasons.push(error.message);
            else throw error;
          }
        }
        const eligible = reasons.length === 0;

        if (eligible) {
          const ticket = await new HallTicketVerificationService(this.db).issue(
            tenantId,
            student.user_id as string,
            (exams as Array<{ exam_schedule_id: string }>).map(
              (exam) => exam.exam_schedule_id,
            ),
            manager,
            runBy,
          );
          const pdf = await this.admitPdf.generate({
            student: {
              user_id: student.user_id,
              name: student.name,
              email: student.official_email ?? '',
              enrollment_no:
                student.enrollment_number ??
                student.enrollment_no ??
                student.admission_number ??
                null,
              program: student.program_name ?? student.department ?? null,
              department: student.department ?? null,
              semester: student.current_semester ?? semester,
              section: student.section_code ?? null,
              batch: student.batch ?? null,
              profile_picture_url: student.profile_photo_url ?? null,
            },
            exams,
            barcodePayload: ticket.payload,
          });
          const pdfPath = path.join(uploadDir, `${student.user_id}.pdf`);
          fs.writeFileSync(pdfPath, pdf);
          generated++;
          await manager.query(
            `INSERT INTO exam_admit_card_entries (run_id, student_user_id, eligible, block_reasons, pdf_path)
           VALUES ($1,$2,true,'[]',$3)`,
            [runId, student.user_id, pdfPath],
          );
        } else {
          blocked++;
          await manager.query(
            `INSERT INTO exam_admit_card_entries (run_id, student_user_id, eligible, block_reasons)
           VALUES ($1,$2,false,$3)`,
            [runId, student.user_id, JSON.stringify(reasons)],
          );
        }

        results.push({
          student_user_id: student.user_id,
          name: student.name,
          eligible,
          reasons,
        });
      }

      await manager.query(
        `UPDATE exam_admit_card_runs SET generated_count = $2, blocked_count = $3 WHERE run_id = $1`,
        [runId, generated, blocked],
      );
      await new ExamCellAuditService(this.db).log(
        tenantId,
        runBy,
        {
          action: 'ADMIT_CARDS_GENERATED',
          resource_type: 'admit_card_run',
          resource_id: runId,
          new_value: { generated, blocked },
        },
        manager,
      );

      return { run_id: runId, generated, blocked, students: results };
    });
    for (const student of result.students.filter(
      (student) => !student.eligible,
    )) {
      for (const reason of student.reasons)
        this.notify.admitCardLocked({
          tenantId,
          userId: student.student_user_id,
          message: reason,
          reason:
            reason === 'Blocked: Pending fee dues'
              ? 'FINANCE'
              : 'EXAM_ELIGIBILITY',
        });
    }
    return result;
  }

  /** Pre-generation audit matrix for COE review before batch admit card PDFs. */
  async verifyHallTicket(
    tenantId: string,
    actorUserId: string,
    payload: string,
  ) {
    const ticket = await new HallTicketVerificationService(this.db).verify(
      tenantId,
      payload,
    );
    const reasons = await this.getAdmitBlockReasons(
      ticket.student_user_id,
      tenantId,
    );
    if (reasons.length)
      throw new ForbiddenException(
        'Hall ticket is currently blocked by eligibility or dues',
      );
    await new ExamCellAuditService(this.db).log(tenantId, actorUserId, {
      action: 'HALL_TICKET_VERIFIED',
      resource_type: 'hall_ticket_issue',
      resource_id: ticket.issue_id,
      new_value: {
        student_user_id: ticket.student_user_id,
        schedule_ids: ticket.schedule_ids,
      },
    });
    return ticket;
  }

  revokeHallTicket(
    tenantId: string,
    issueId: string,
    actorUserId: string,
    reason: string,
  ) {
    return new HallTicketVerificationService(this.db).revoke(
      tenantId,
      issueId,
      actorUserId,
      reason,
    );
  }

  async auditAdmitCardsPreGeneration(
    tenantId: string,
    dto: { batch_label: string; semester?: number },
  ) {
    const semester = dto.semester ?? 4;
    const students = await this.db.query(
      `SELECT DISTINCT u.user_id, u.name,
              sp.enrollment_number, sp.admission_number
       FROM users u
       INNER JOIN student_course_enrollments e ON e.student_user_id = u.user_id AND e.tenant_id = $1
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       WHERE e.semester = $2 AND u.tenant_id = $1
       ORDER BY u.name`,
      [tenantId, semester],
    );

    const items: {
      student_user_id: string;
      student_id: string;
      name: string;
      semester: number;
      fee_status: 'Clear' | 'Pending';
      attendance_percent: number;
      has_exemption: boolean;
      eligible: boolean;
      block_reasons: string[];
    }[] = [];

    for (const student of students) {
      const pendingDues = await this.finance.getPendingDues(
        student.user_id,
        tenantId,
      );
      const feeStatus = pendingDues.length > 0 ? 'Pending' : 'Clear';
      const attendance = await this.attendanceEligibility.evaluate(
        tenantId,
        student.user_id,
        { context: 'ADMIT_CARD', audit: false },
      );
      const blockReasons = await this.getAdmitBlockReasons(
        student.user_id,
        tenantId,
      );
      items.push({
        student_user_id: student.user_id,
        student_id:
          student.enrollment_number ??
          student.admission_number ??
          String(student.user_id).slice(0, 8),
        name: student.name,
        semester,
        fee_status: feeStatus,
        attendance_percent: attendance.attendance_percent,
        has_exemption: attendance.threshold_source === 'EXEMPTION',
        eligible: blockReasons.length === 0,
        block_reasons: blockReasons,
      });
    }

    const eligibleCount = items.filter((i) => i.eligible).length;
    return {
      batch_label: dto.batch_label,
      semester,
      eligible_count: eligibleCount,
      blocked_count: items.length - eligibleCount,
      items,
    };
  }

  async getAdmitBlockReasons(
    studentUserId: string,
    tenantId: string,
  ): Promise<string[]> {
    const reasons: string[] = [];
    const pendingDues = await this.finance.getPendingDues(
      studentUserId,
      tenantId,
    );
    if (pendingDues.length > 0) {
      reasons.push('Blocked: Pending fee dues');
    }

    const attendance = await this.attendanceEligibility.evaluate(
      tenantId,
      studentUserId,
      {
        context: 'ADMIT_CARD',
        audit: true,
      },
    );
    if (!attendance.eligible && attendance.reason) {
      reasons.push(attendance.reason);
    }

    const fines = await this.db.query(
      `SELECT COUNT(*)::int AS c FROM operations_hostel_fines
       WHERE tenant_id = $1 AND student_user_id = $2 AND status = 'PENDING'`,
      [tenantId, studentUserId],
    );
    if ((fines[0]?.c ?? 0) > 0) reasons.push('Blocked: Pending hostel fines');

    const ufm = await this.db.query(
      `SELECT COUNT(*)::int AS c FROM ufm_cases
       WHERE tenant_id = $1 AND student_user_id = $2 AND status != 'CLOSED'`,
      [tenantId, studentUserId],
    );
    if ((ufm[0]?.c ?? 0) > 0) reasons.push('Blocked: Open UFM case');

    return reasons;
  }

  async getBranchesBySemester(tenantId: string, semester: number) {
    const rows = await this.queryOrEmpty<{ branch_code: string }>(
      `SELECT DISTINCT COALESCE(d.dept_name, 'GEN') AS branch_code
       FROM users u
       INNER JOIN student_course_enrollments e ON e.student_user_id = u.user_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       WHERE e.tenant_id = $1 AND e.semester = $2
       ORDER BY branch_code`,
      [tenantId, semester],
    );
    return rows.map((r) => r.branch_code);
  }

  async getBlocksAndHalls(tenantId: string) {
    const spaces = await this.queryOrEmpty<{
      block: string;
      hall: string;
      capacity: number | null;
    }>(
      `SELECT building_name AS block, room_number AS hall, capacity
       FROM campus_spaces
       WHERE tenant_id = $1 AND space_type = 'CLASSROOM'
       ORDER BY building_name, room_number`,
      [tenantId],
    );

    const blocksMap = new Map<
      string,
      {
        block: string;
        halls: Array<{
          name: string;
          capacity: number;
          rows: number;
          cols: number;
        }>;
      }
    >();
    for (const s of spaces) {
      if (!s.block || !s.hall) continue;
      if (!blocksMap.has(s.block))
        blocksMap.set(s.block, { block: s.block, halls: [] });
      const cols = 5;
      const capacity = Number(s.capacity) > 0 ? Number(s.capacity) : 30;
      const rows = Math.max(1, Math.ceil(capacity / cols));
      blocksMap
        .get(s.block)!
        .halls.push({ name: s.hall, capacity, rows, cols });
    }
    return Array.from(blocksMap.values());
  }

  /** Auto-allocate seats — no adjacent same-branch students */
  async autoAllocateSeating(
    tenantId: string,
    dto: {
      allocation_strategy: string;
      exam_type?: string;
      exam_schedule_id?: string;
      semester: number;
      branch?: string;
      rooms: string[];
    },
  ) {
    return this.db.transaction(async (manager) => {
      if (!dto.rooms?.length)
        throw new BadRequestException('Select at least one room');

      let scheduleIds: string[] = [];
      if (dto.allocation_strategy === 'by_schedule') {
        if (!dto.exam_schedule_id?.trim())
          throw new BadRequestException('Select an exam schedule');
        const examRows = await manager.query(
          `SELECT 1 FROM exam_schedules es JOIN academic_subjects sub ON sub.subject_id = es.subject_id
           WHERE es.exam_schedule_id = $1 AND es.tenant_id = $2 AND sub.semester = $3`,
          [dto.exam_schedule_id, tenantId, dto.semester],
        );
        if (!examRows[0])
          throw new BadRequestException('Exam schedule not found');
        scheduleIds.push(dto.exam_schedule_id);
      } else {
        if (!dto.exam_type?.trim())
          throw new BadRequestException('Select an exam type');
        const exams = await manager.query(
          `SELECT es.exam_schedule_id FROM exam_schedules es
           JOIN academic_subjects sub ON sub.subject_id = es.subject_id
           WHERE es.tenant_id = $1 AND es.exam_type = $2 AND sub.semester = $3`,
          [tenantId, dto.exam_type, dto.semester],
        );
        scheduleIds = exams.map((e: any) => e.exam_schedule_id);
        if (scheduleIds.length === 0)
          throw new BadRequestException(
            'No schedules found for this exam type',
          );
      }

      scheduleIds.sort();
      await manager.query(
        `SELECT exam_schedule_id FROM exam_schedules WHERE tenant_id = $1 AND exam_schedule_id = ANY($2::uuid[]) ORDER BY exam_schedule_id FOR UPDATE`,
        [tenantId, scheduleIds],
      );

      const spaces = await manager.query(
        `SELECT room_number, capacity FROM campus_spaces WHERE tenant_id = $1 AND space_type = 'CLASSROOM' AND status = 'AVAILABLE'`,
        [tenantId],
      );
      const capMap = new Map<string, number>(
        spaces.map((s: any) => [s.room_number, Number(s.capacity)]),
      );

      if (
        new Set(dto.rooms).size !== dto.rooms.length ||
        dto.rooms.some(
          (room) =>
            !capMap.has(room) ||
            !Number.isFinite(capMap.get(room)) ||
            Number(capMap.get(room)) <= 0,
        )
      ) {
        throw new BadRequestException(
          'Select available rooms with a valid seating capacity',
        );
      }

      const schedulesInfo = await manager.query(
        `
        SELECT es.exam_schedule_id, es.exam_date::text AS exam_date, sub.subject_name
        FROM exam_schedules es
        LEFT JOIN academic_subjects sub ON sub.subject_id = es.subject_id
        WHERE es.exam_schedule_id = ANY($1) AND es.tenant_id = $2
      `,
        [scheduleIds, tenantId],
      );
      const schedMap = new Map<string, any>(
        schedulesInfo.map((s: any) => [s.exam_schedule_id, s]),
      );

      let totalAllocated = 0;
      const enrichedAllocations: any[] = [];

      for (const scheduleId of scheduleIds) {
        if (!dto.branch || dto.branch === 'All Branches') {
          await manager.query(
            `DELETE FROM exam_seating_allocations WHERE tenant_id = $1 AND exam_schedule_id = $2`,
            [tenantId, scheduleId],
          );
        } else {
          await manager.query(
            `DELETE FROM exam_seating_allocations WHERE tenant_id = $1 AND exam_schedule_id = $2 AND branch_code = $3`,
            [tenantId, scheduleId, dto.branch],
          );
        }

        const occupiedRows = await manager.query(
          `SELECT room, seat_number FROM exam_seating_allocations WHERE tenant_id = $1 AND exam_schedule_id = $2`,
          [tenantId, scheduleId],
        );
        const occupied = new Set(
          occupiedRows
            .filter((r: any) => dto.rooms.includes(r.room))
            .map((r: any) => `${r.room}-${Number(r.seat_number)}`),
        );

        // A schedule must allocate only students enrolled in its subject. The
        // previous implementation selected every student in the semester,
        // which could put students into an exam they were not registered for.
        const branchFilter =
          dto.branch && dto.branch !== 'All Branches'
            ? `AND COALESCE(d.dept_name, 'GEN') = $4`
            : '';
        const studentParams: unknown[] = [tenantId, scheduleId, dto.semester];
        if (dto.branch && dto.branch !== 'All Branches') {
          studentParams.push(dto.branch);
        }
        const students = await manager.query(
          `SELECT DISTINCT u.user_id, u.name,
                  COALESCE(d.dept_name, 'GEN') AS branch_code
           FROM exam_schedules es
           INNER JOIN academic_subjects sub ON sub.subject_id = es.subject_id
           INNER JOIN academic_courses c ON c.tenant_id = es.tenant_id
             AND (c.course_code = sub.subject_code OR c.course_name ILIKE sub.subject_name)
           INNER JOIN student_course_enrollments e
             ON e.course_id = c.course_id
            AND e.tenant_id = c.tenant_id
            AND e.semester = $3
            AND e.status IN ('ENROLLED', 'COMPLETED', 'FAILED')
           INNER JOIN users u ON u.user_id = e.student_user_id AND u.tenant_id = $1
           LEFT JOIN departments d ON d.dept_id = u.dept_id
           WHERE es.exam_schedule_id = $2 AND es.tenant_id = $1 ${branchFilter}
           ORDER BY branch_code, u.user_id`,
          studentParams,
        );

        const roomCapacity = dto.rooms.reduce(
          (total, room) => total + Number(capMap.get(room)),
          0,
        );
        if (students.length > roomCapacity - occupied.size) {
          throw new BadRequestException(
            `Not enough available seats for ${students.length} enrolled students`,
          );
        }

        let roomIdx = 0;
        let seatNum = 1;
        let prevBranch: string | null = null;
        const schedInfo = schedMap.get(scheduleId);

        for (const s of students) {
          let attempts = 0;
          let room = dto.rooms[roomIdx];
          let capacity = Number(capMap.get(room));

          while (true) {
            attempts += 1;
            if (attempts > roomCapacity * 2) {
              throw new BadRequestException(
                'Could not find a valid seat for every enrolled student',
              );
            }
            if (seatNum > capacity) {
              roomIdx = (roomIdx + 1) % dto.rooms.length;
              room = dto.rooms[roomIdx];
              capacity = Number(capMap.get(room));
              seatNum = 1;
              prevBranch = null;
            }

            if (s.branch_code === prevBranch) {
              seatNum++;
              prevBranch = null;
              continue;
            }

            if (occupied.has(`${room}-${seatNum}`)) {
              seatNum++;
              continue;
            }

            break;
          }

          const seatString = String(seatNum).padStart(2, '0');

          await manager.query(
            `INSERT INTO exam_seating_allocations (tenant_id, exam_schedule_id, room, student_user_id, seat_number, branch_code)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [tenantId, scheduleId, room, s.user_id, seatString, s.branch_code],
          );

          enrichedAllocations.push({
            exam_schedule_id: scheduleId,
            student_name: s.name,
            student_user_id: s.user_id,
            branch_code: s.branch_code,
            subject_name: schedInfo?.subject_name,
            exam_date: schedInfo?.exam_date,
            room: room,
            seat_number: seatString,
          });

          occupied.add(`${room}-${seatNum}`);
          prevBranch = s.branch_code;
          seatNum++;
          totalAllocated++;
        }
      }

      const [run] = await manager.query(
        `INSERT INTO exam_seating_runs (tenant_id, allocation_strategy, exam_type, exam_schedule_id, semester, branch, allocations)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING run_id`,
        [
          tenantId,
          dto.allocation_strategy,
          dto.exam_type || null,
          dto.exam_schedule_id || null,
          dto.semester,
          dto.branch || 'All Branches',
          JSON.stringify(enrichedAllocations),
        ],
      );

      for (const scheduleId of scheduleIds) {
        await this.publishSeatingPlans(
          tenantId,
          scheduleId,
          undefined,
          manager,
        );
      }

      return {
        allocated: totalAllocated,
        rooms: dto.rooms,
        run_id: run.run_id,
        allocations: enrichedAllocations,
      };
    });
  }

  async listSeatingRuns(tenantId: string) {
    const baseSql = (withSubjectJoin: boolean) => `
      SELECT r.run_id, r.allocation_strategy, r.exam_type, r.exam_schedule_id, r.semester, r.branch, r.created_at,
             CASE
               WHEN jsonb_typeof(r.allocations) = 'array' THEN jsonb_array_length(r.allocations)
               ELSE 0
             END AS total_allocated,
             r.allocations,
             ${withSubjectJoin ? 'sub.subject_name, es.exam_date::text AS exam_date' : 'NULL::text AS subject_name, es.exam_date::text AS exam_date'}
      FROM exam_seating_runs r
      LEFT JOIN exam_schedules es ON es.exam_schedule_id = r.exam_schedule_id
      ${withSubjectJoin ? 'LEFT JOIN academic_subjects sub ON sub.subject_id = es.subject_id' : ''}
      WHERE r.tenant_id = $1
      ORDER BY r.created_at DESC`;

    let rows: Array<{
      run_id: string;
      allocation_strategy: string;
      exam_type: string | null;
      exam_schedule_id: string | null;
      semester: number;
      branch: string;
      created_at: string;
      total_allocated: number | null;
      allocations: unknown;
      subject_name: string | null;
      exam_date: string | null;
    }> = [];

    try {
      rows = await this.db.query(baseSql(true), [tenantId]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        /relation .* does not exist|column .* does not exist/i.test(message)
      ) {
        rows = await this.queryOrEmpty(baseSql(false), [tenantId]);
      } else {
        throw err;
      }
    }

    return rows.map((row) => ({
      ...row,
      total_allocated: Number(row.total_allocated ?? 0),
      allocations: this.normalizeSeatingAllocations(row.allocations),
    }));
  }

  async deleteSeatingRun(tenantId: string, runId: string) {
    await this.db.query(
      `DELETE FROM exam_seating_runs WHERE tenant_id = $1 AND run_id = $2`,
      [tenantId, runId],
    );
    return { success: true };
  }

  listSeatingAllocations(tenantId: string, examScheduleId?: string) {
    const filter = examScheduleId ? 'AND a.exam_schedule_id = $2' : '';
    const params = examScheduleId ? [tenantId, examScheduleId] : [tenantId];
    return this.db.query(
      `SELECT a.*, u.name AS student_name, es.exam_type, es.exam_date::text AS exam_date, sub.subject_name, sub.subject_code
       FROM exam_seating_allocations a
       JOIN users u ON u.user_id = a.student_user_id
       JOIN exam_schedules es ON es.exam_schedule_id = a.exam_schedule_id
       LEFT JOIN academic_subjects sub ON sub.subject_id = es.subject_id
       WHERE a.tenant_id = $1 ${filter}
       ORDER BY a.room, a.seat_number`,
      params,
    );
  }

  async swapSeatingAllocations(
    tenantId: string,
    dto: {
      exam_schedule_id: string;
      room: string;
      student_user_id_a: string;
      student_user_id_b: string;
    },
  ) {
    await this.db.transaction(async (manager) => {
      // Keep the same lock order as allocation and publication.
      await manager.query(
        `SELECT exam_schedule_id FROM exam_schedules WHERE tenant_id = $1 AND exam_schedule_id = $2 FOR UPDATE`,
        [tenantId, dto.exam_schedule_id],
      );
      const rows = (await manager.query(
        `SELECT student_user_id, seat_number FROM exam_seating_allocations
         WHERE tenant_id = $1 AND exam_schedule_id = $2 AND room = $3
           AND student_user_id IN ($4, $5)
         FOR UPDATE`,
        [
          tenantId,
          dto.exam_schedule_id,
          dto.room,
          dto.student_user_id_a,
          dto.student_user_id_b,
        ],
      )) as Array<{ student_user_id: string; seat_number: string }>;
      if (rows.length !== 2) {
        throw new BadRequestException(
          'Both students must be seated in the selected room',
        );
      }
      const a = rows.find((r) => r.student_user_id === dto.student_user_id_a)!;
      const b = rows.find((r) => r.student_user_id === dto.student_user_id_b)!;
      // The seat number has a unique constraint. Move one row through a
      // temporary value so exchanging two seats never causes a 500 error.
      // seat_number is varchar(20), so keep the transient marker within the
      // column limit while remaining unique for concurrent swaps.
      const temporarySeat = `__swap_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
      await manager.query(
        `UPDATE exam_seating_allocations SET seat_number = $4
         WHERE tenant_id = $1 AND exam_schedule_id = $2 AND room = $3 AND student_user_id = $5`,
        [
          tenantId,
          dto.exam_schedule_id,
          dto.room,
          temporarySeat,
          dto.student_user_id_a,
        ],
      );
      await manager.query(
        `UPDATE exam_seating_allocations SET seat_number = $4
         WHERE tenant_id = $1 AND exam_schedule_id = $2 AND room = $3 AND student_user_id = $5`,
        [
          tenantId,
          dto.exam_schedule_id,
          dto.room,
          a.seat_number,
          dto.student_user_id_b,
        ],
      );
      await manager.query(
        `UPDATE exam_seating_allocations SET seat_number = $4
         WHERE tenant_id = $1 AND exam_schedule_id = $2 AND room = $3 AND student_user_id = $5`,
        [
          tenantId,
          dto.exam_schedule_id,
          dto.room,
          b.seat_number,
          dto.student_user_id_a,
        ],
      );
      await this.publishSeatingPlans(
        tenantId,
        dto.exam_schedule_id,
        undefined,
        manager,
      );
    });
    return { swapped: true };
  }

  listSeatingPlans(tenantId: string) {
    return this.db.query(
      `SELECT s.*, e.exam_type, e.exam_date::text AS exam_date, e.venue
       FROM exam_seating_plans s
       LEFT JOIN exam_schedules e ON e.exam_schedule_id = s.exam_schedule_id
       WHERE s.tenant_id = $1
       ORDER BY s.created_at DESC`,
      [tenantId],
    );
  }

  listScheduleSubjects(tenantId: string) {
    return this.db.query(
      `SELECT subject_id, subject_code, subject_name, semester
       FROM academic_subjects
       WHERE EXISTS (SELECT 1 FROM tenants t WHERE t.tenant_id = $1)
       ORDER BY semester, subject_code`,
      [tenantId],
    );
  }

  async assignInvigilation(
    tenantId: string,
    dto: {
      exam_schedule_id: string;
      room: string;
      faculty_user_id: string;
      is_coordinator?: boolean;
    },
    manager: EntityManager | DataSource = this.db,
  ) {
    if (manager === this.db)
      return this.db.transaction((executor) =>
        this.assignInvigilation(tenantId, dto, executor),
      );
    if (!dto.exam_schedule_id?.trim() || !dto.faculty_user_id?.trim()) {
      throw new BadRequestException('Exam schedule and faculty are required');
    }
    const examRows = await manager.query(
      `SELECT 1 FROM exam_schedules WHERE exam_schedule_id = $1 AND tenant_id = $2`,
      [dto.exam_schedule_id, tenantId],
    );
    if (!examRows[0]) throw new BadRequestException('Exam schedule not found');

    const facultyRows = await manager.query(
      `SELECT 1
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.user_id = $1 AND u.tenant_id = $2
         AND u.is_active = true AND r.role_name IN ('Faculty','HOD','Dean')
       LIMIT 1`,
      [dto.faculty_user_id, tenantId],
    );
    if (!facultyRows[0])
      throw new BadRequestException('Faculty member not found in tenant');

    if (dto.is_coordinator) {
      await manager.query(
        `UPDATE exam_invigilation_duties SET is_coordinator = false
         WHERE tenant_id = $1 AND exam_schedule_id = $2 AND room = $3`,
        [tenantId, dto.exam_schedule_id, dto.room],
      );
    }

    const rows = await manager.query(
      `INSERT INTO exam_invigilation_duties (tenant_id, exam_schedule_id, room, faculty_user_id, is_coordinator)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (exam_schedule_id, room, faculty_user_id) DO UPDATE SET
         status = 'ASSIGNED',
         is_coordinator = EXCLUDED.is_coordinator
       RETURNING *`,
      [
        tenantId,
        dto.exam_schedule_id,
        dto.room,
        dto.faculty_user_id,
        dto.is_coordinator ?? false,
      ],
    );
    return rows[0];
  }

  /**
   * Assign students enrolled in the exam subject to a single room (seat 1..capacity).
   * Optionally designate one faculty member as exam coordinator / invigilator for that room.
   */
  async assignSubjectToRoom(
    tenantId: string,
    dto: {
      exam_schedule_id: string;
      room: string;
      semester: number;
      coordinator_faculty_user_id?: string;
      block?: string;
    },
  ) {
    return this.db.transaction(async (manager) => {
      if (!dto.exam_schedule_id?.trim() || !dto.room?.trim()) {
        throw new BadRequestException('Exam schedule and room are required');
      }

      const scheduleRows = await manager.query(
        `SELECT es.exam_schedule_id, es.subject_id, sub.subject_name, sub.subject_code
         FROM exam_schedules es
         LEFT JOIN academic_subjects sub ON sub.subject_id = es.subject_id
         WHERE es.tenant_id = $1 AND es.exam_schedule_id = $2 AND sub.semester = $3
         FOR UPDATE OF es`,
        [tenantId, dto.exam_schedule_id, dto.semester],
      );
      const schedule = scheduleRows[0];
      if (!schedule) throw new BadRequestException('Exam schedule not found');

      const spaceRows = await manager.query(
        `SELECT building_name, room_number, capacity FROM campus_spaces
         WHERE tenant_id = $1 AND room_number = $2 AND space_type = 'CLASSROOM' AND status = 'AVAILABLE' LIMIT 1`,
        [tenantId, dto.room],
      );
      const capacity = Number(spaceRows[0]?.capacity);
      if (!Number.isFinite(capacity) || capacity <= 0)
        throw new BadRequestException(
          'Select an available room with a valid seating capacity',
        );
      const block = dto.block ?? spaceRows[0]?.building_name ?? 'Main Block';

      const students = await manager.query(
        `SELECT DISTINCT u.user_id, u.name,
                COALESCE(
                  NULLIF(BTRIM(e.roll_number), ''),
                  NULLIF(BTRIM(sp.prn_number), ''),
                  NULLIF(BTRIM(sp.enrollment_no), ''),
                  u.user_id::text
                ) AS sort_key
         FROM exam_schedules es
         LEFT JOIN academic_subjects sub ON sub.subject_id = es.subject_id
         INNER JOIN academic_courses c ON c.tenant_id = es.tenant_id
           AND (
             c.course_code = sub.subject_code
             OR c.course_name ILIKE sub.subject_name
           )
         INNER JOIN student_course_enrollments e
           ON e.course_id = c.course_id AND e.tenant_id = c.tenant_id AND e.semester = $3 AND e.status IN ('ENROLLED', 'COMPLETED', 'FAILED')
         INNER JOIN users u ON u.user_id = e.student_user_id AND u.tenant_id = $1
         LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
         WHERE es.exam_schedule_id = $2 AND es.tenant_id = $1
         ORDER BY sort_key`,
        [tenantId, dto.exam_schedule_id, dto.semester],
      );

      if (students.length > capacity)
        throw new BadRequestException(
          `Not enough available seats for ${students.length} enrolled students`,
        );

      await manager.query(
        `DELETE FROM exam_seating_allocations
         WHERE tenant_id = $1 AND exam_schedule_id = $2 AND room = $3`,
        [tenantId, dto.exam_schedule_id, dto.room],
      );

      let seatNum = 1;
      const allocated: Array<{
        student_user_id: string;
        student_name: string;
        seat_number: string;
      }> = [];
      for (const student of students) {
        const seatString = String(seatNum).padStart(2, '0');
        await manager.query(
          `INSERT INTO exam_seating_allocations (tenant_id, exam_schedule_id, room, student_user_id, seat_number, branch_code)
           VALUES ($1,$2,$3,$4,$5,'GEN')`,
          [
            tenantId,
            dto.exam_schedule_id,
            dto.room,
            student.user_id,
            seatString,
          ],
        );
        allocated.push({
          student_user_id: student.user_id,
          student_name: student.name,
          seat_number: seatString,
        });
        seatNum++;
      }

      if (dto.coordinator_faculty_user_id?.trim()) {
        await this.assignInvigilation(
          tenantId,
          {
            exam_schedule_id: dto.exam_schedule_id,
            room: dto.room,
            faculty_user_id: dto.coordinator_faculty_user_id,
            is_coordinator: true,
          },
          manager,
        );
      }

      await this.publishSeatingPlans(
        tenantId,
        dto.exam_schedule_id,
        block,
        manager,
      );

      return {
        subject_name: schedule.subject_name,
        room: dto.room,
        capacity,
        allocated: allocated.length,
        students: allocated,
        block,
      };
    });
  }

  /** Sync seating allocations into published exam_seating_plans for the student portal. */
  async publishSeatingPlans(
    tenantId: string,
    examScheduleId?: string,
    defaultBlock?: string,
    manager: EntityManager | DataSource = this.db,
  ) {
    if (manager === this.db)
      return this.db.transaction((executor) =>
        this.publishSeatingPlans(
          tenantId,
          examScheduleId,
          defaultBlock,
          executor,
        ),
      );
    const filter = examScheduleId ? 'AND a.exam_schedule_id = $2' : '';
    const params = examScheduleId ? [tenantId, examScheduleId] : [tenantId];

    await manager.query(
      `SELECT exam_schedule_id FROM exam_schedules WHERE tenant_id = $1 ${examScheduleId ? 'AND exam_schedule_id = $2' : ''} ORDER BY exam_schedule_id FOR UPDATE`,
      params,
    );

    const rows = await manager.query(
      `SELECT a.exam_schedule_id, a.room, a.student_user_id, a.seat_number,
              cs.building_name
       FROM exam_seating_allocations a
       LEFT JOIN campus_spaces cs ON cs.tenant_id = a.tenant_id AND cs.room_number = a.room
       WHERE a.tenant_id = $1 ${filter}
       ORDER BY a.exam_schedule_id, a.room, a.seat_number`,
      params,
    );

    const byRoom = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = `${row.exam_schedule_id}::${row.room}`;
      if (!byRoom.has(key)) byRoom.set(key, []);
      byRoom.get(key)!.push(row);
    }

    // Replace the selected schedule's full snapshot, including rooms now empty.
    await manager.query(
      `DELETE FROM exam_seating_plans WHERE tenant_id = $1 ${examScheduleId ? 'AND exam_schedule_id = $2' : ''}`,
      params,
    );

    let published = 0;
    for (const [key, roomRows] of byRoom) {
      const [scheduleId, room] = key.split('::');
      const block = roomRows[0]?.building_name ?? defaultBlock ?? 'Main Block';
      const seatingMap = roomRows.map((r) => ({
        student_user_id: r.student_user_id,
        seat_no: r.seat_number,
        block,
      }));

      await manager.query(
        `INSERT INTO exam_seating_plans (tenant_id, exam_schedule_id, room, seating_map, published)
         VALUES ($1,$2,$3,$4,true)`,
        [tenantId, scheduleId, room, JSON.stringify(seatingMap)],
      );
      published++;
    }

    return { published_rooms: published };
  }

  async publishInvigilationRoster(tenantId: string, examScheduleId: string) {
    const duties = await this.db.query(
      `SELECT d.*, es.exam_date::text AS exam_date, es.start_time, es.end_time, es.exam_type
       FROM exam_invigilation_duties d
       JOIN exam_schedules es ON es.exam_schedule_id = d.exam_schedule_id
       WHERE d.tenant_id = $1 AND d.exam_schedule_id = $2`,
      [tenantId, examScheduleId],
    );

    await this.db.transaction(async (manager) => {
      // Publishing is a sync operation. Remove the existing published roster
      // for this schedule first so clicking Publish repeatedly cannot create
      // duplicate faculty assignments.
      await manager.query(
        `DELETE FROM faculty_invigilation_assignments
         WHERE tenant_id = $1 AND exam_schedule_id = $2`,
        [tenantId, examScheduleId],
      );
      for (const d of duties) {
        await manager.query(
          `INSERT INTO faculty_invigilation_assignments (
           tenant_id, faculty_user_id, exam_schedule_id, exam_date, block_name, room, session_label
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            tenantId,
            d.faculty_user_id,
            d.exam_schedule_id,
            d.exam_date,
            d.room,
            d.room,
            `${d.exam_type} ${String(d.start_time).slice(0, 5)}`,
          ],
        );
      }
      await manager.query(
        `UPDATE exam_invigilation_duties SET published = true, status = 'ASSIGNED'
         WHERE tenant_id = $1 AND exam_schedule_id = $2`,
        [tenantId, examScheduleId],
      );
    });

    return { published: duties.length };
  }

  listInvigilationDuties(tenantId: string) {
    return this.db.query(
      `SELECT d.*, u.name AS faculty_name, es.exam_type, es.exam_date::text AS exam_date, es.start_time
       FROM exam_invigilation_duties d
       JOIN users u ON u.user_id = d.faculty_user_id
       JOIN exam_schedules es ON es.exam_schedule_id = d.exam_schedule_id
       WHERE d.tenant_id = $1
       ORDER BY es.exam_date, d.room`,
      [tenantId],
    );
  }

  async listInvigilationRequests(tenantId: string) {
    return this.db.query(
      `SELECT r.*, u.name AS faculty_name, a.exam_date, a.room, a.session_label
       FROM invigilation_unavailability_requests r
       JOIN users u ON u.user_id = r.faculty_user_id
       JOIN faculty_invigilation_assignments a ON a.assignment_id = r.assignment_id
       WHERE r.tenant_id = $1
       ORDER BY CASE WHEN r.status = 'PENDING' THEN 1 ELSE 2 END, r.created_at DESC`,
      [tenantId],
    );
  }

  async resolveInvigilationRequest(
    tenantId: string,
    requestId: string,
    status: 'APPROVED' | 'REJECTED',
    comment: string,
  ) {
    const reqRow = await this.db.query(
      `SELECT * FROM invigilation_unavailability_requests WHERE request_id = $1 AND tenant_id = $2`,
      [requestId, tenantId],
    );
    const request = reqRow[0];
    if (!request) throw new NotFoundException('Request not found');

    const updated = await this.db.query(
      `UPDATE invigilation_unavailability_requests
       SET status = $1, exam_cell_comment = $2, updated_at = NOW()
       WHERE request_id = $3 AND tenant_id = $4
       RETURNING *`,
      [status, comment, requestId, tenantId],
    );

    if (status === 'APPROVED') {
      const assignmentRow = await this.db.query(
        `SELECT * FROM faculty_invigilation_assignments
         WHERE assignment_id = $1 AND tenant_id = $2`,
        [request.assignment_id, tenantId],
      );
      if (assignmentRow[0]) {
        const assignment = assignmentRow[0];

        // Delete from faculty assignments
        await this.db.query(
          `DELETE FROM faculty_invigilation_assignments
             WHERE assignment_id = $1 AND tenant_id = $2`,
          [assignment.assignment_id, tenantId],
        );

        // Delete from exam_invigilation_duties
        // We know faculty_user_id, room, exam_schedule_id
        if (assignment.exam_schedule_id) {
          await this.db.query(
            `DELETE FROM exam_invigilation_duties 
             WHERE tenant_id = $1 AND exam_schedule_id = $2 AND room = $3 AND faculty_user_id = $4`,
            [
              tenantId,
              assignment.exam_schedule_id,
              assignment.room,
              assignment.faculty_user_id,
            ],
          );
        }
      }
    }

    return updated[0];
  }

  async listInvigilationDutySwaps(tenantId: string) {
    return this.queryOrEmpty(
      `SELECT s.*,
              a.exam_date, a.room, a.session_label, a.block_name, a.exam_schedule_id,
              req.name AS requester_name,
              tgt.name AS target_name,
              ec.name AS exam_cell_name
       FROM invigilation_duty_swaps s
       JOIN faculty_invigilation_assignments a ON a.assignment_id = s.assignment_id
       JOIN users req ON req.user_id = s.requester_faculty_user_id
       JOIN users tgt ON tgt.user_id = s.target_faculty_user_id
       LEFT JOIN users ec ON ec.user_id = s.exam_cell_user_id
       WHERE s.tenant_id = $1 AND s.deleted_at IS NULL
       ORDER BY CASE WHEN s.status = 'PENDING_EXAM_CELL' THEN 1 ELSE 2 END,
                s.created_at DESC`,
      [tenantId],
    );
  }

  async listInvigilationDutySwapAudits(tenantId: string, swapId: string) {
    return this.queryOrEmpty(
      `SELECT a.*, u.name AS actor_name
       FROM invigilation_duty_swap_audits a
       LEFT JOIN users u ON u.user_id = a.actor_user_id
       WHERE a.tenant_id = $1 AND a.swap_id = $2
       ORDER BY a.created_at ASC`,
      [tenantId, swapId],
    );
  }

  async resolveInvigilationDutySwap(
    tenantId: string,
    swapId: string,
    actorUserId: string,
    status: 'APPROVED' | 'REJECTED',
    comment: string,
  ) {
    if (!comment?.trim()) {
      throw new BadRequestException('Comment is required');
    }

    const rows = await this.db.query(
      `SELECT s.*,
              a.exam_date, a.room, a.session_label, a.exam_schedule_id, a.block_name,
              a.faculty_user_id AS current_faculty_user_id,
              req.name AS requester_name,
              tgt.name AS target_name
       FROM invigilation_duty_swaps s
       JOIN faculty_invigilation_assignments a ON a.assignment_id = s.assignment_id
       JOIN users req ON req.user_id = s.requester_faculty_user_id
       JOIN users tgt ON tgt.user_id = s.target_faculty_user_id
       WHERE s.swap_id = $1 AND s.tenant_id = $2 AND s.deleted_at IS NULL`,
      [swapId, tenantId],
    );
    const swap = rows[0];
    if (!swap) throw new NotFoundException('Swap request not found');
    if (swap.status !== 'PENDING_EXAM_CELL') {
      throw new BadRequestException('Swap is not awaiting Exam Cell approval');
    }
    if (swap.current_faculty_user_id !== swap.requester_faculty_user_id) {
      throw new BadRequestException(
        'Duty ownership changed; cancel and re-request the swap',
      );
    }

    const nextStatus =
      status === 'APPROVED' ? 'APPROVED' : 'REJECTED_BY_EXAM_CELL';

    if (status === 'APPROVED') {
      const conflict = await this.db.query(
        `SELECT 1 FROM faculty_invigilation_assignments
         WHERE tenant_id = $1
           AND faculty_user_id = $2
           AND exam_date = $3::date
           AND COALESCE(session_label, '') = COALESCE($4, '')
           AND assignment_id <> $5
         LIMIT 1`,
        [
          tenantId,
          swap.target_faculty_user_id,
          swap.exam_date,
          swap.session_label ?? null,
          swap.assignment_id,
        ],
      );
      if (conflict[0]) {
        throw new BadRequestException(
          'Target faculty already has a conflicting duty in this session',
        );
      }

      await this.db.query(
        `UPDATE faculty_invigilation_assignments
         SET faculty_user_id = $1
         WHERE assignment_id = $2 AND tenant_id = $3`,
        [swap.target_faculty_user_id, swap.assignment_id, tenantId],
      );

      if (swap.exam_schedule_id) {
        await this.db.query(
          `UPDATE exam_invigilation_duties
           SET faculty_user_id = $1
           WHERE tenant_id = $2
             AND exam_schedule_id = $3
             AND room = $4
             AND faculty_user_id = $5`,
          [
            swap.target_faculty_user_id,
            tenantId,
            swap.exam_schedule_id,
            swap.room,
            swap.requester_faculty_user_id,
          ],
        );
      }
    }

    const updated = await this.db.query(
      `UPDATE invigilation_duty_swaps
       SET status = $1,
           exam_cell_user_id = $2,
           exam_cell_comment = $3,
           exam_cell_resolved_at = NOW(),
           updated_at = NOW()
       WHERE swap_id = $4 AND tenant_id = $5
       RETURNING *`,
      [nextStatus, actorUserId, comment.trim(), swapId, tenantId],
    );

    await this.db.query(
      `INSERT INTO invigilation_duty_swap_audits
         (tenant_id, swap_id, actor_user_id, action, from_status, to_status, details)
       VALUES ($1, $2, $3, $4, 'PENDING_EXAM_CELL', $5, $6::jsonb)`,
      [
        tenantId,
        swapId,
        actorUserId,
        status === 'APPROVED' ? 'EXAM_CELL_APPROVED' : 'EXAM_CELL_REJECTED',
        nextStatus,
        JSON.stringify({ comment: comment.trim() }),
      ],
    );

    const notifyBase = {
      swapId: swap.swap_id,
      assignmentId: swap.assignment_id,
      requesterName: swap.requester_name,
      targetName: swap.target_name,
      examDate: String(swap.exam_date).slice(0, 10),
      room: swap.room,
      sessionLabel: swap.session_label,
      decision: status,
      comment: comment.trim(),
    };

    for (const userId of [
      swap.requester_faculty_user_id,
      swap.target_faculty_user_id,
    ]) {
      this.notify.examDutySwapResolved({
        tenantId,
        userId,
        ...notifyBase,
      });
    }

    return updated[0];
  }

  listPendingCoeMarks(tenantId: string) {
    return this.db.query(
      `SELECT m.*, u.name AS student_name, c.course_code, c.course_name,
              m.marks_obtained, m.max_marks,
              ROUND(100.0 * m.marks_obtained / NULLIF(m.max_marks, 0), 1) AS percent,
              sess.session_id,
              sess.entry_status AS session_entry_status,
              sess.declared_at AS session_declared_at,
              f.name AS faculty_name,
              e.semester
       FROM academic_marks m
       JOIN users u ON u.user_id = m.student_user_id
       JOIN academic_courses c ON c.course_id = m.course_id
       LEFT JOIN users f ON f.user_id = m.uploaded_by
       LEFT JOIN student_course_enrollments e ON e.student_user_id = m.student_user_id AND e.course_id = m.course_id
       LEFT JOIN LATERAL (
         SELECT s.session_id, s.entry_status, s.declared_at
         FROM exam_result_sessions s
         WHERE s.tenant_id = m.tenant_id
           AND s.course_id = m.course_id
           AND s.exam_type = m.exam_type
         ORDER BY s.semester DESC
         LIMIT 1
       ) sess ON TRUE
       WHERE m.tenant_id = $1 AND m.status = 'PENDING_COE'
       ORDER BY c.course_code, m.exam_type, u.name`,
      [tenantId],
    );
  }

  getGradesAggregateCourses(tenantId: string, semester: number) {
    return this.db.query(
      `SELECT DISTINCT c.course_id, c.course_code, c.course_name
       FROM student_course_enrollments e
       JOIN academic_courses c ON c.course_id = e.course_id
       WHERE e.tenant_id = $1 AND e.semester = $2
       ORDER BY c.course_code`,
      [tenantId, semester],
    );
  }

  async getGradesAggregateTable(
    tenantId: string,
    semester: number,
    courseId: string,
  ) {
    const students = await this.db.query(
      `SELECT e.student_user_id, u.name AS student_name
       FROM student_course_enrollments e
       JOIN users u ON u.user_id = e.student_user_id
       WHERE e.tenant_id = $1 AND e.semester = $2 AND e.course_id = $3
       ORDER BY u.name`,
      [tenantId, semester, courseId],
    );

    const marks = await this.db.query(
      `SELECT m.student_user_id, m.exam_type, COALESCE(retake.marks_obtained, m.marks_obtained) AS marks_obtained
       FROM academic_marks m
       LEFT JOIN exam_backlog_current_results retake ON retake.tenant_id=m.tenant_id
         AND retake.student_user_id=m.student_user_id AND retake.course_id=m.course_id
         AND retake.source_exam_type=m.exam_type AND retake.selected_attempt_id IS NOT NULL
         AND retake.semester=$3
       WHERE m.tenant_id = $1 AND m.course_id = $2`,
      [tenantId, courseId, semester],
    );

    const marksMap = new Map<string, Record<string, number>>();
    for (const m of marks) {
      if (!marksMap.has(m.student_user_id)) {
        marksMap.set(m.student_user_id, {});
      }
      marksMap.get(m.student_user_id)![m.exam_type] =
        Number(m.marks_obtained) || 0;
    }

    function calculateGrade(total: number) {
      if (total >= 90) return 'AA';
      if (total >= 80) return 'AB';
      if (total >= 70) return 'BB';
      if (total >= 60) return 'BC';
      if (total >= 50) return 'CC';
      if (total >= 40) return 'CD';
      if (total >= 33) return 'DD';
      return 'F';
    }

    return students.map((s: any) => {
      const stuMarks = marksMap.get(s.student_user_id) || {};
      const quiz = stuMarks['QUIZ'];
      const internal = stuMarks['INTERNAL'];
      const cat1 = stuMarks['CAT1'];
      const cat2 = stuMarks['CAT2'];
      const endTerm = stuMarks['END_TERM'];

      const isPending =
        quiz === undefined ||
        internal === undefined ||
        (cat1 === undefined && cat2 === undefined) ||
        endTerm === undefined;
      const midTerm = (cat1 || 0) + (cat2 || 0);

      let aggregate: number | string = 'Pending';
      let grade = 'Pending';

      if (!isPending) {
        aggregate = Math.min(
          100,
          Math.round((quiz || 0) + (internal || 0) + midTerm + (endTerm || 0)),
        );
        grade = calculateGrade(aggregate);
      }

      return {
        student_id: s.student_user_id,
        student_name: s.student_name,
        quiz_marks: quiz ?? '—',
        internal_marks: internal ?? '—',
        mid_term_marks:
          cat1 !== undefined || cat2 !== undefined ? midTerm : '—',
        end_term_marks: endTerm ?? '—',
        aggregate,
        grade,
      };
    });
  }

  marksDistribution(tenantId: string, courseId: string, examType: string) {
    return this.db.query(
      `SELECT
         COUNT(*)::int AS count,
         ROUND(AVG(marks_obtained)::numeric, 2) AS avg_marks,
         MIN(marks_obtained) AS min_marks,
         MAX(marks_obtained) AS max_marks,
         COUNT(*) FILTER (WHERE marks_obtained >= max_marks * 0.9)::int AS above_90pct,
         COUNT(*) FILTER (WHERE marks_obtained < max_marks * 0.4)::int AS below_40pct
       FROM academic_marks
       WHERE tenant_id = $1 AND course_id = $2 AND exam_type = $3 AND status = 'PENDING_COE'`,
      [tenantId, courseId, examType],
    );
  }

  /** Loop 4: COE publishes results → notify all students in batch */
  async publishResults(
    tenantId: string,
    dto: { course_id: string; exam_type: string; batch_semester?: number },
    actorUserId: string,
  ) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dto.course_id)) {
      throw new BadRequestException('A valid course ID is required');
    }
    const session = await this.resultControl.getSessionForCourse(
      tenantId,
      dto.course_id,
      dto.exam_type,
      dto.batch_semester,
    );
    if (!session) {
      throw new BadRequestException(
        'Result session not found; use the Result Control Centre workflow',
      );
    }
    if (dto.batch_semester != null && Number(session.semester) !== dto.batch_semester) {
      throw new BadRequestException('Result session semester does not match the requested batch');
    }

    return this.resultControl.declareSession(
      tenantId,
      session.session_id,
      actorUserId,
      { declaration_note: 'Published via legacy results endpoint' },
    );
  }

  listReEvaluations(tenantId: string) {
    return this.db.query(
      `SELECT a.*,
              u.name AS student_name,
              u.official_email AS student_email,
              sub.subject_name,
              sub.subject_code,
              f.name AS faculty_name
       FROM exam_applications a
       JOIN users u ON u.user_id = a.student_user_id
       JOIN academic_subjects sub ON sub.subject_id = a.subject_id
       LEFT JOIN users f ON f.user_id = a.assigned_faculty_user_id
       WHERE a.tenant_id = $1 AND u.tenant_id = $1
         AND a.application_type = 'RE_EVALUATION'
         AND a.fee_status = 'PAID'
         AND a.status NOT IN ('DRAFT', 'REJECTED')
       ORDER BY
         CASE a.status
           WHEN 'PENDING' THEN 1
           WHEN 'ASSIGNED' THEN 2
           WHEN 'UNDER_REVIEW' THEN 3
           WHEN 'COMPLETED' THEN 4
           ELSE 5
         END,
         a.created_at ASC`,
      [tenantId],
    );
  }

  async getReEvaluation(
    tenantId: string,
    applicationId: string,
    queryExecutor: Pick<EntityManager, 'query'> = this.db,
  ) {
    const rows = await queryExecutor.query<ReEvaluationApplication[]>(
      `SELECT a.*,
              u.name AS student_name,
              sub.subject_name,
              sub.subject_code,
              f.name AS faculty_name
       FROM exam_applications a
       JOIN users u ON u.user_id = a.student_user_id
       JOIN academic_subjects sub ON sub.subject_id = a.subject_id
       LEFT JOIN users f ON f.user_id = a.assigned_faculty_user_id
       WHERE a.exam_application_id = $1
         AND a.application_type = 'RE_EVALUATION'
         AND a.tenant_id = $2
         AND u.tenant_id = $2`,
      [applicationId, tenantId],
    );
    if (!rows[0])
      throw new NotFoundException('Re-evaluation application not found');
    return rows[0];
  }

  private async loadOriginalMarks(
    tenantId: string,
    studentUserId: string,
    subjectId: number,
    queryExecutor: Pick<EntityManager, 'query'> = this.db,
  ) {
    const rows = await queryExecutor.query<
      Array<{ marks_obtained: string | null }>
    >(
      `SELECT marks_obtained
       FROM academic_exam_results
       WHERE tenant_id = $1 AND student_user_id = $2 AND subject_id = $3
       ORDER BY created_at DESC
       LIMIT 1`,
      [tenantId, studentUserId, subjectId],
    );
    if (rows[0]?.marks_obtained != null) return Number(rows[0].marks_obtained);
    const markRows = await queryExecutor.query<
      Array<{ marks_obtained: string | null }>
    >(
      `SELECT m.marks_obtained
       FROM academic_marks m
       JOIN academic_courses c ON c.course_id = m.course_id
       JOIN academic_subjects s ON s.subject_code = c.course_code
       WHERE m.tenant_id = $1
         AND m.student_user_id = $2
         AND s.subject_id = $3
         AND m.status = 'PUBLISHED'
       ORDER BY m.published_at DESC NULLS LAST
       LIMIT 1`,
      [tenantId, studentUserId, subjectId],
    );
    return markRows[0]?.marks_obtained != null
      ? Number(markRows[0].marks_obtained)
      : null;
  }

  private async lockReEvaluation(
    manager: EntityManager,
    tenantId: string,
    applicationId: string,
  ) {
    await manager.query(
      `SELECT exam_application_id FROM exam_applications
       WHERE tenant_id = $1 AND exam_application_id = $2 FOR UPDATE`,
      [tenantId, applicationId],
    );
    return this.getReEvaluation(tenantId, applicationId, manager);
  }

  private reEvaluationSource(
    manager: EntityManager,
    tenantId: string,
    application: {
      student_user_id: string;
      subject_id: number;
      source_result_id?: string | null;
      source_session_id?: string | null;
      source_mark_id?: string | null;
    },
  ): Promise<ReEvaluationSource> {
    return resolveReEvaluationSource(manager, tenantId, application);
  }

  private validateRevisedMarks(value: number, source: ReEvaluationSource) {
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      !Number.isFinite(Number(source.max_marks)) ||
      Number(source.max_marks) <= 0 ||
      value > Number(source.max_marks)
    ) {
      throw new BadRequestException(
        'Revised marks must be between zero and the published maximum marks',
      );
    }
  }

  private reEvalNotifyPayload(
    tenantId: string,
    row: {
      exam_application_id: string;
      student_user_id: string;
      student_name?: string;
      subject_name?: string;
      subject_code?: string;
      original_marks?: number | string | null;
      revised_marks?: number | string | null;
      report_notes?: string | null;
    },
  ) {
    return {
      tenantId,
      userId: row.student_user_id,
      applicationId: row.exam_application_id,
      subjectName: row.subject_name ?? 'Subject',
      subjectCode: row.subject_code,
      studentName: row.student_name,
      originalMarks:
        row.original_marks == null ? null : Number(row.original_marks),
      revisedMarks:
        row.revised_marks == null ? null : Number(row.revised_marks),
      reportNotes: row.report_notes ?? null,
    };
  }

  async assignReEvaluation(
    tenantId: string,
    actorUserId: string,
    applicationId: string,
    facultyUserId: string,
  ) {
    const updated = await this.db.transaction(async (manager) => {
      const application = await this.lockReEvaluation(
        manager,
        tenantId,
        applicationId,
      );
      if (
        application.status !== 'PENDING' ||
        application.fee_status !== 'PAID'
      ) {
        throw new BadRequestException(
          'Only paid pending applications can be assigned',
        );
      }
      const facultyRows = await manager.query<Array<Record<string, unknown>>>(
        `SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id = u.user_id
         JOIN roles r ON r.role_id = ur.role_id
         WHERE u.user_id = $1 AND u.tenant_id = $2 AND lower(r.role_name) = 'faculty'`,
        [facultyUserId, tenantId],
      );
      if (!facultyRows[0])
        throw new BadRequestException('Selected faculty is invalid');
      const selectedSource = await this.reEvaluationSource(
        manager,
        tenantId,
        application,
      );
      const originalMarks = Number(selectedSource.marks_obtained);
      if (!Number.isFinite(originalMarks))
        throw new BadRequestException(
          'The selected published marks are invalid',
        );
      await manager.query(
        `UPDATE exam_applications SET status = 'ASSIGNED', assigned_faculty_user_id = $2,
         assigned_by = $3, assigned_at = NOW(), original_marks = $4
         WHERE exam_application_id = $1 AND tenant_id = $5`,
        [applicationId, facultyUserId, actorUserId, originalMarks, tenantId],
      );
      await new ExamCellAuditService(this.db).log(
        tenantId,
        actorUserId,
        {
          action: 'REVALUATION_ASSIGNED',
          resource_type: 'exam_application',
          resource_id: applicationId,
          old_value: { status: application.status },
          new_value: {
            status: 'ASSIGNED',
            faculty_user_id: facultyUserId,
            original_marks: originalMarks,
          },
        },
        manager,
      );
      return this.getReEvaluation(tenantId, applicationId, manager);
    });
    this.notify.examRevaluationAssigned({
      ...this.reEvalNotifyPayload(tenantId, updated),
      userId: facultyUserId,
    });
    return updated;
  }

  async submitReEvaluationReport(
    tenantId: string,
    facultyUserId: string,
    applicationId: string,
    dto: { revised_marks: number; report_notes: string },
  ) {
    const refreshed = await this.db.transaction(async (manager) => {
      const application = await this.lockReEvaluation(
        manager,
        tenantId,
        applicationId,
      );
      if (application.assigned_faculty_user_id !== facultyUserId)
        throw new ForbiddenException(
          'You are not assigned to this re-evaluation',
        );
      if (application.status !== 'ASSIGNED')
        throw new BadRequestException(
          'Report can only be submitted for assigned applications',
        );
      if (!dto.report_notes?.trim())
        throw new BadRequestException('Report notes are required');
      const source = await this.reEvaluationSource(
        manager,
        tenantId,
        application,
      );
      this.validateRevisedMarks(dto.revised_marks, source);
      await manager.query(
        `UPDATE exam_applications SET status = 'UNDER_REVIEW', revised_marks = $2,
         report_notes = $3, report_submitted_at = NOW()
         WHERE exam_application_id = $1 AND tenant_id = $4`,
        [applicationId, dto.revised_marks, dto.report_notes.trim(), tenantId],
      );
      await new ExamCellAuditService(this.db).log(
        tenantId,
        facultyUserId,
        {
          action: 'REVALUATION_REPORT_SUBMITTED',
          resource_type: 'exam_application',
          resource_id: applicationId,
          old_value: { status: application.status },
          new_value: {
            status: 'UNDER_REVIEW',
            revised_marks: dto.revised_marks,
          },
        },
        manager,
      );
      return this.getReEvaluation(tenantId, applicationId, manager);
    });
    this.notify.examRevaluationReportReady({
      ...this.reEvalNotifyPayload(tenantId, refreshed),
      userId: refreshed.student_user_id,
    });
    return refreshed;
  }

  async publishReEvaluation(
    tenantId: string,
    actorUserId: string,
    applicationId: string,
  ) {
    const refreshed = await this.db.transaction(async (manager) => {
      // Generation and publication share this transaction lock, so an older
      // grade-card snapshot cannot overwrite result invalidation after commit.
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `exam-grade-cards:${tenantId}`,
      ]);
      const application = await this.lockReEvaluation(
        manager,
        tenantId,
        applicationId,
      );
      if (application.status !== 'UNDER_REVIEW')
        throw new BadRequestException(
          'Only applications with a submitted report can be published',
        );
      if (application.revised_marks == null)
        throw new BadRequestException('Revised marks are required');
      const source = await this.reEvaluationSource(
        manager,
        tenantId,
        application,
      );
      const obtained = Number(application.revised_marks);
      this.validateRevisedMarks(obtained, source);
      const max = Number(source.max_marks);
      const percent = Number(((obtained / max) * 100).toFixed(2));
      const policies = source.grading_policy_id
        ? await manager.query<Array<{ rules: Record<string, unknown> }>>(
            `SELECT rules FROM academic_grading_policies WHERE policy_id = $1`,
            [source.grading_policy_id],
          )
        : [];
      const { grade, gradePoints } = computeGradeFromPercent(
        percent,
        parseGradeBands(policies[0]?.rules),
      );
      const resultStatus = computePassFail(
        obtained,
        max,
        source.pass_marks == null ? null : Number(source.pass_marks),
      );
      await manager.query(
        `UPDATE academic_exam_results SET marks_obtained = $3, grade = $4, grade_points = $5, updated_at = NOW()
         WHERE tenant_id = $1 AND result_id = $2`,
        [tenantId, source.result_id, obtained, grade, gradePoints],
      );
      if (source.mark_id)
        await manager.query(
          `UPDATE academic_marks SET marks_obtained = $3, updated_at = NOW()
         WHERE tenant_id = $1 AND mark_id = $2 AND status = 'PUBLISHED'`,
          [tenantId, source.mark_id, obtained],
        );
      if (source.session_id)
        await manager.query(
          `UPDATE student_exam_reports SET marks_obtained = $4, percent = $5, grade = $6,
         grade_points = $7, result_status = $8, report_summary = $9
         WHERE tenant_id = $1 AND session_id = $2 AND student_user_id = $3`,
          [
            tenantId,
            source.session_id,
            application.student_user_id,
            obtained,
            percent,
            grade,
            gradePoints,
            resultStatus,
            `${source.course_name} ${source.exam_type}: ${obtained}/${max} (${percent}%) — Grade ${grade}`,
          ],
        );
      if (
        source.course_id &&
        ['END_TERM', 'INTERNAL'].includes(source.exam_type ?? '')
      )
        await manager.query(
          `UPDATE student_course_enrollments SET grade = $4, grade_points = $5,
         status = CASE WHEN $6 = 'PASS' THEN 'COMPLETED' ELSE 'FAILED' END
         WHERE tenant_id = $1 AND student_user_id = $2 AND course_id = $3 AND semester = $7`,
          [
            tenantId,
            application.student_user_id,
            source.course_id,
            grade,
            gradePoints,
            resultStatus,
            source.semester,
          ],
        );
      // Existing CGPA uses all enrollments and also breaks ranking ties.
      // Lock affected cohort snapshots in the same order as publication.
      await manager.query(
        `SELECT grade_card_id FROM grade_cards
         WHERE tenant_id = $1 AND (student_user_id = $2 OR semester = $3
           OR semester IN (SELECT semester FROM grade_cards WHERE tenant_id = $1 AND student_user_id = $2))
         ORDER BY grade_card_id FOR UPDATE`,
        [tenantId, application.student_user_id, source.semester],
      );
      // Require normal regeneration for every affected stored snapshot.
      await manager.query(
        `UPDATE grade_cards SET status = CASE WHEN status = 'WITHHELD' THEN 'WITHHELD' ELSE 'DRAFT' END,
         published_at = NULL,
         payload = jsonb_set(jsonb_set(COALESCE(payload, '{}'::jsonb), '{result_stage}', '"DRAFT"'::jsonb), '{requires_regeneration}', 'true'::jsonb)
         WHERE tenant_id = $1 AND (student_user_id = $2 OR semester = $3
           OR semester IN (SELECT semester FROM grade_cards WHERE tenant_id = $1 AND student_user_id = $2))`,
        [tenantId, application.student_user_id, source.semester],
      );
      await manager.query(
        `UPDATE exam_applications SET status = 'COMPLETED', published_at = NOW(), published_by = $2
         WHERE exam_application_id = $1 AND tenant_id = $3`,
        [applicationId, actorUserId, tenantId],
      );
      await invalidateOfficialTranscripts(manager, {
        tenantId,
        studentUserId: application.student_user_id,
        semester: source.semester,
        actor: { userId: actorUserId },
        reason: `Revaluation published for application ${applicationId}`,
      });
      await new ExamCellAuditService(this.db).log(
        tenantId,
        actorUserId,
        {
          action: 'REVALUATION_PUBLISHED',
          resource_type: 'exam_application',
          resource_id: applicationId,
          old_value: {
            status: application.status,
            marks_obtained: source.marks_obtained,
          },
          new_value: {
            status: 'COMPLETED',
            revised_marks: obtained,
            result_id: source.result_id,
            session_id: source.session_id,
            grade,
            grade_points: gradePoints,
            result_status: resultStatus,
          },
        },
        manager,
      );
      const parents = await manager.query<Array<{ parent_mobile: string }>>(
        `SELECT parent_mobile FROM parent_student_links WHERE tenant_id = $1 AND student_user_id = $2`,
        [tenantId, application.student_user_id],
      );
      for (const parent of parents)
        await manager.query(
          `INSERT INTO integration_jobs (tenant_id, integration_type, entity_type, payload)
         VALUES ($1, 'WHATSAPP', 'revaluation_report', $2::jsonb)`,
          [
            tenantId,
            JSON.stringify({
              to: parent.parent_mobile,
              message: `Re-evaluation report for ${application.student_name} (${application.subject_name}): Marks updated from ${application.original_marks} to ${obtained}.`,
              provider: 'MSG91',
            }),
          ],
        );
      return this.getReEvaluation(tenantId, applicationId, manager);
    });
    this.notify.examRevaluationPublished({
      ...this.reEvalNotifyPayload(tenantId, refreshed),
      userId: refreshed.student_user_id,
      actionLink: '/student/exams?intent=revaluation',
    });
    return refreshed;
  }

  async rejectReEvaluation(
    tenantId: string,
    actorUserId: string,
    applicationId: string,
    reason?: string,
  ) {
    const refreshed = await this.db.transaction(async (manager) => {
      const application = await this.lockReEvaluation(
        manager,
        tenantId,
        applicationId,
      );
      if (!['PENDING', 'ASSIGNED', 'UNDER_REVIEW'].includes(application.status))
        throw new BadRequestException('This application cannot be rejected');
      await manager.query(
        `UPDATE exam_applications SET status = 'REJECTED', report_notes = COALESCE($2, report_notes),
         published_at = NOW(), published_by = $3 WHERE exam_application_id = $1 AND tenant_id = $4`,
        [applicationId, reason?.trim() || null, actorUserId, tenantId],
      );
      await new ExamCellAuditService(this.db).log(
        tenantId,
        actorUserId,
        {
          action: 'REVALUATION_REJECTED',
          resource_type: 'exam_application',
          resource_id: applicationId,
          old_value: { status: application.status },
          new_value: { status: 'REJECTED', reason: reason?.trim() || null },
        },
        manager,
      );
      return this.getReEvaluation(tenantId, applicationId, manager);
    });
    this.notify.examRevaluationPublished({
      ...this.reEvalNotifyPayload(tenantId, refreshed),
      userId: refreshed.student_user_id,
      title: `Re-evaluation declined — ${refreshed.subject_name}`,
      message: reason?.trim()
        ? `Your re-evaluation request for ${refreshed.subject_name} was declined. Reason: ${reason.trim()}`
        : `Your re-evaluation request for ${refreshed.subject_name} was declined by Exam Cell.`,
      actionLink: '/student/exams?intent=revaluation',
    });
    return refreshed;
  }

  listFacultyReEvaluations(tenantId: string, facultyUserId: string) {
    return this.db.query(
      `SELECT a.*,
              u.name AS student_name,
              sub.subject_name,
              sub.subject_code
       FROM exam_applications a
       JOIN users u ON u.user_id = a.student_user_id
       JOIN academic_subjects sub ON sub.subject_id = a.subject_id
       WHERE a.tenant_id = $1 AND u.tenant_id = $1
         AND a.application_type = 'RE_EVALUATION'
         AND a.assigned_faculty_user_id = $2
         AND a.status IN ('ASSIGNED', 'UNDER_REVIEW', 'COMPLETED')
       ORDER BY a.assigned_at DESC NULLS LAST, a.created_at DESC`,
      [tenantId, facultyUserId],
    );
  }

  listStudentReEvaluations(tenantId: string, studentUserId: string) {
    return this.db.query(
      `SELECT a.*,
              sub.subject_name,
              sub.subject_code,
              f.name AS faculty_name
       FROM exam_applications a
       JOIN academic_subjects sub ON sub.subject_id = a.subject_id
       LEFT JOIN users f ON f.user_id = a.assigned_faculty_user_id
       WHERE a.tenant_id = $1 AND a.student_user_id = $2
         AND a.application_type = 'RE_EVALUATION'
       ORDER BY a.created_at DESC`,
      [tenantId, studentUserId],
    );
  }

  listParentReEvaluations(tenantId: string, studentUserId: string) {
    return this.db.query(
      `SELECT a.exam_application_id,
              a.status,
              a.original_marks,
              a.revised_marks,
              a.report_notes,
              a.published_at,
              sub.subject_name,
              sub.subject_code
       FROM exam_applications a
       JOIN academic_subjects sub ON sub.subject_id = a.subject_id
       WHERE a.tenant_id = $1 AND a.student_user_id = $2
         AND a.application_type = 'RE_EVALUATION'
         AND a.status = 'COMPLETED'
       ORDER BY a.published_at DESC NULLS LAST`,
      [tenantId, studentUserId],
    );
  }

  listGradeCards() {
    return this.db.query(
      `SELECT g.*, u.name AS student_name, u.official_email AS student_email
       FROM grade_cards g
       JOIN users u ON u.user_id = g.student_user_id
       ORDER BY g.created_at DESC`,
    );
  }

  private studentDepartmentSql(spAlias = 'sp', deptAlias = 'd'): string {
    return `COALESCE(${spAlias}.branch_name, ${deptAlias}.dept_name, 'General')`;
  }

  listUfmCases(tenantId: string, filters?: { year?: number; month?: number }) {
    const params: unknown[] = [tenantId];
    let sql = `
      SELECT c.*, u.name AS student_name, u.official_email AS student_email,
             e.exam_type, e.exam_date, r.name AS reported_by_name,
             COALESCE(sub.subject_code, sub.subject_name) AS course_scope
      FROM ufm_cases c
      LEFT JOIN users u ON u.user_id = c.student_user_id
      LEFT JOIN exam_schedules e ON e.exam_schedule_id = c.exam_id
      LEFT JOIN academic_subjects sub ON sub.subject_id = e.subject_id
      LEFT JOIN users r ON r.user_id = c.reported_by
      WHERE c.tenant_id = $1`;

    if (filters?.year) {
      params.push(filters.year);
      sql += ` AND EXTRACT(YEAR FROM c.logged_at) = $${params.length}`;
    }
    if (filters?.month) {
      params.push(filters.month);
      sql += ` AND EXTRACT(MONTH FROM c.logged_at) = $${params.length}`;
    } else if (!filters?.year) {
      sql += ` AND c.logged_at >= NOW() - INTERVAL '1 month'`;
    }

    sql += ' ORDER BY c.logged_at DESC LIMIT 200';
    return this.db.query(sql, params);
  }

  /** Loop 3: UFM → zero marks + lock transcripts */
  async createUfmCase(
    tenantId: string,
    dto: {
      student_user_id: string;
      exam_id?: string;
      description: string;
      penalty_applied?: string;
      reported_by?: string;
      course_id?: string;
    },
  ) {
    if (!dto.student_user_id?.trim()) {
      throw new BadRequestException('Student is required');
    }
    if (!dto.description?.trim()) {
      throw new BadRequestException('Incident description is required');
    }

    const studentUserId = await this.resolveStudentUserId(
      tenantId,
      dto.student_user_id.trim(),
    );
    const courseId = dto.course_id?.trim()
      ? await this.resolveCourseId(tenantId, dto.course_id.trim())
      : null;

    if (dto.exam_id?.trim()) {
      const [exam] = await this.db.query(
        `SELECT 1 FROM exam_schedules
         WHERE exam_schedule_id = $1 AND tenant_id = $2 LIMIT 1`,
        [dto.exam_id.trim(), tenantId],
      );
      if (!exam) throw new NotFoundException('Exam schedule not found');
    }

    let description = dto.description.trim();
    if (courseId) {
      const courseRows = await this.db.query<Array<{ course_code: string }>>(
        `SELECT course_code FROM academic_courses WHERE course_id = $1 AND tenant_id = $2 LIMIT 1`,
        [courseId, tenantId],
      );
      const code = courseRows[0]?.course_code;
      if (code && !description.includes(code)) {
        description = `[${code}] ${description}`;
      }
    }

    if (!dto.reported_by)
      throw new BadRequestException('Reporting officer is required');
    return this.db.transaction(async (manager) => {
      const rows = await manager.query(
        `INSERT INTO ufm_cases (tenant_id, student_user_id, exam_id, description, penalty_applied, reported_by, marks_locked, status)
       VALUES ($1,$2,$3,$4,$5,$6,true,'OPEN') RETURNING *`,
        [
          tenantId,
          studentUserId,
          dto.exam_id ?? null,
          description,
          dto.penalty_applied?.trim() || 'Exam cancelled — UFM',
          dto.reported_by ?? null,
        ],
      );

      if (courseId) {
        await manager.query(
          `UPDATE academic_marks SET marks_obtained = 0, status = 'PUBLISHED', updated_at = NOW()
         WHERE student_user_id = $1 AND course_id = $2 AND tenant_id = $3`,
          [studentUserId, courseId, tenantId],
        );
      } else {
        await manager.query(
          `UPDATE academic_marks SET marks_obtained = 0, status = 'PUBLISHED', updated_at = NOW()
         WHERE student_user_id = $1 AND tenant_id = $2`,
          [studentUserId, tenantId],
        );
      }

      await manager.query(
        `UPDATE grade_cards
       SET status = 'WITHHELD',
           payload = COALESCE(payload, '{}'::jsonb) || '{"withheld_reason":"Open UFM case","result_stage":"WITHHELD"}'::jsonb
       WHERE student_user_id = $1 AND tenant_id = $2`,
        [studentUserId, tenantId],
      );

      await manager.query(
        `INSERT INTO grade_cards (tenant_id, student_user_id, semester, cgpa, status, payload)
       SELECT $1, $2, e.semester, 0, 'WITHHELD',
              jsonb_build_object(
                'withheld_reason', 'Open UFM case',
                'result_stage', 'WITHHELD',
                'semester', e.semester
              )
       FROM student_course_enrollments e
       WHERE e.tenant_id = $1 AND e.student_user_id = $2
         AND NOT EXISTS (
           SELECT 1 FROM grade_cards g
           WHERE g.tenant_id = $1 AND g.student_user_id = $2 AND g.semester = e.semester
         )`,
        [tenantId, studentUserId],
      );

      await invalidateOfficialTranscripts(manager, {
        tenantId,
        studentUserId,
        actor: { userId: dto.reported_by! },
        reason: `Open UFM case ${rows[0].case_id}`,
      });
      await new ExamCellAuditService(this.db).log(
        tenantId,
        dto.reported_by,
        {
          action: 'UFM_CASE_CREATED',
          resource_type: 'ufm_case',
          resource_id: rows[0].case_id as string,
          new_value: { student_user_id: studentUserId, course_id: courseId },
        },
        manager,
      );
      const enriched = await manager.query(
        `SELECT c.*, u.name AS student_name
       FROM ufm_cases c
       LEFT JOIN users u ON u.user_id = c.student_user_id
       WHERE c.case_id = $1`,
        [rows[0].case_id],
      );
      return enriched[0] ?? rows[0];
    });
  }

  listUfmFormOptions(
    tenantId: string,
    filters?: { semester?: number; department?: string },
  ) {
    const deptSql = this.studentDepartmentSql();
    const studentRole = this.studentRoleClause('u');
    const params: unknown[] = [tenantId];
    let studentSql = `
      SELECT DISTINCT u.user_id, u.name, u.official_email,
             COALESCE(sp.enrollment_number, sp.enrollment_no, sp.prn_number) AS enrollment_number,
             sp.prn_number,
             sp.abc_id,
             ${deptSql} AS department
      FROM users u
      LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
      LEFT JOIN departments d ON d.dept_id = u.dept_id
      WHERE u.tenant_id = $1 AND u.is_active = true AND ${studentRole}`;

    if (filters?.semester) {
      params.push(filters.semester);
      studentSql += `
        AND EXISTS (
          SELECT 1 FROM student_course_enrollments e
          WHERE e.student_user_id = u.user_id AND e.tenant_id = $1 AND e.semester = $${params.length}
        )`;
    }
    if (filters?.department) {
      params.push(filters.department);
      studentSql += `
        AND (
          ${deptSql} ILIKE $${params.length}
          OR ${deptSql} = $${params.length}
        )`;
    }
    studentSql += ' ORDER BY u.name LIMIT 500';

    const courseParams: unknown[] = [tenantId];
    let courseSql = `
      SELECT DISTINCT c.course_id, c.course_code, c.course_name, e.semester
      FROM academic_courses c
      JOIN student_course_enrollments e ON e.course_id = c.course_id AND e.tenant_id = c.tenant_id
      LEFT JOIN users u ON u.user_id = e.student_user_id
      LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
      LEFT JOIN departments d ON d.dept_id = u.dept_id
      WHERE c.tenant_id = $1`;
    if (filters?.department) {
      courseParams.push(filters.department);
      courseSql += ` AND ${deptSql} ILIKE $${courseParams.length}`;
    }
    if (filters?.semester) {
      courseParams.push(filters.semester);
      courseSql += ` AND e.semester = $${courseParams.length}`;
    }
    courseSql += ' ORDER BY c.course_code LIMIT 300';

    return Promise.all([
      this.queryOrEmpty(studentSql, params),
      this.queryOrEmpty(courseSql, courseParams),
      this.queryOrEmpty(
        `SELECT DISTINCT ${deptSql} AS department
         FROM users u
         LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
         LEFT JOIN departments d ON d.dept_id = u.dept_id
         WHERE u.tenant_id = $1 AND u.is_active = true AND ${studentRole}
         ORDER BY department`,
        [tenantId],
      ),
    ]).then(([students, courses, departments]) => ({
      students,
      courses,
      departments: departments
        .map((d: { department: string }) => d.department)
        .filter(Boolean),
    }));
  }

  private static readonly UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  /** Matches users with Student role via user_roles or legacy users.role_id. */
  private studentRoleClause(userAlias = 'u'): string {
    return `(
      EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN roles r ON r.role_id = ur.role_id
        WHERE ur.user_id = ${userAlias}.user_id AND r.role_name = 'Student'
      )
      OR EXISTS (
        SELECT 1 FROM roles r
        WHERE r.role_id = ${userAlias}.role_id AND r.role_name = 'Student'
      )
    )`;
  }

  /** Normalized text match for enrollment / PRN / ABC identifiers (ignores dashes and spaces). */
  private studentIdentifierMatchSql(param = '$2'): string {
    const norm = (expr: string) =>
      `REPLACE(REPLACE(lower(BTRIM(COALESCE(${expr}, ''))), '-', ''), ' ', '')`;
    const normParam = `REPLACE(REPLACE(lower(BTRIM(${param})), '-', ''), ' ', '')`;
    return `(
      lower(u.official_email) = lower(${param})
      OR ${norm('sp.enrollment_no')} = ${normParam}
      OR ${norm('sp.enrollment_number')} = ${normParam}
      OR ${norm('sp.admission_number')} = ${normParam}
      OR ${norm('sp.abc_id')} = ${normParam}
      OR ${norm('sp.prn_number')} = ${normParam}
      OR EXISTS (
        SELECT 1 FROM student_course_enrollments e
        WHERE e.student_user_id = u.user_id
          AND ${norm('e.roll_number')} = ${normParam}
      )
    )`;
  }

  private async resolveStudentUserId(
    tenantId: string,
    identifier: string,
  ): Promise<string> {
    const trimmed = identifier.trim();
    const isUuid = ExamCellService.UUID_RE.test(trimmed);

    if (isUuid) {
      const byId = await this.db.query<Array<{ user_id: string }>>(
        `SELECT u.user_id
         FROM users u
         WHERE u.tenant_id = $1
           AND u.is_active = true
           AND ${this.studentRoleClause('u')}
           AND u.user_id = $2::uuid
         LIMIT 1`,
        [tenantId, trimmed],
      );
      if (byId[0]?.user_id) return byId[0].user_id;
    }

    const rows = await this.db.query<Array<{ user_id: string }>>(
      `SELECT u.user_id
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       WHERE u.tenant_id = $1
         AND u.is_active = true
         AND ${this.studentRoleClause('u')}
         AND ${this.studentIdentifierMatchSql('$2')}
       LIMIT 1`,
      [tenantId, trimmed],
    );
    if (!rows[0]?.user_id) {
      throw new BadRequestException(
        'Student not found. Select from the list or enter enrollment / PRN / ABC ID / email.',
      );
    }
    return rows[0].user_id;
  }

  private async resolveCourseId(
    tenantId: string,
    identifier: string,
  ): Promise<string> {
    const isUuid = ExamCellService.UUID_RE.test(identifier);
    const rows = isUuid
      ? await this.db.query<Array<{ course_id: string }>>(
          `SELECT course_id FROM academic_courses
           WHERE tenant_id = $1 AND course_id = $2::uuid
           LIMIT 1`,
          [tenantId, identifier],
        )
      : await this.db.query<Array<{ course_id: string }>>(
          `SELECT course_id FROM academic_courses
           WHERE tenant_id = $1 AND upper(course_code) = upper($2)
           LIMIT 1`,
          [tenantId, identifier],
        );
    if (!rows[0]?.course_id) {
      throw new BadRequestException(
        'Course not found. Use course code (e.g. SMOKE101) or course UUID.',
      );
    }
    return rows[0].course_id;
  }

  async generateTranscripts(tenantId: string, semester: number) {
    const grads = await this.db.query(
      `SELECT DISTINCT u.user_id, u.name, sp.enrollment_number, sp.abc_id
       FROM users u
       JOIN student_course_enrollments e ON e.student_user_id = u.user_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       WHERE e.tenant_id = $1 AND e.semester = $2`,
      [tenantId, semester],
    );

    const blocked = await this.db.query(
      `SELECT student_user_id FROM ufm_cases WHERE tenant_id = $1 AND status != 'CLOSED' AND marks_locked = true`,
      [tenantId],
    );
    const blockedSet = new Set(
      blocked.map((b: { student_user_id: string }) => b.student_user_id),
    );

    return grads
      .filter((g: { user_id: string }) => !blockedSet.has(g.user_id))
      .map(
        (g: {
          user_id: string;
          name: string;
          enrollment_number: string;
          abc_id: string;
        }) => ({
          student_user_id: g.user_id,
          name: g.name,
          enrollment_number: g.enrollment_number,
          abc_id: g.abc_id,
          digilocker_ready: Boolean(g.abc_id),
          status: 'GENERATED',
        }),
      );
  }

  listFacultyForInvigilation(tenantId: string, examDate?: string) {
    let query = `
      SELECT user_id, name, official_email FROM users
      WHERE tenant_id = $1 AND is_active = true
        AND user_id IN (SELECT user_id FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id WHERE r.role_name = 'Faculty')
    `;
    const params: any[] = [tenantId];
    if (examDate) {
      query += ` AND user_id NOT IN (
        SELECT requester_user_id FROM hr_leave_requests 
        WHERE status = 'APPROVED' AND $2::date BETWEEN start_date AND end_date
      )`;
      params.push(examDate);
    }
    query += ` ORDER BY name LIMIT 100`;
    return this.db.query(query, params);
  }

  listAdmitCardRuns(tenantId: string) {
    return this.db.query(
      `SELECT * FROM exam_admit_card_runs WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [tenantId],
    );
  }
}
