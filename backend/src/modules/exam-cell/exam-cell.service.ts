import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { FinanceService } from '../finance/finance.service';
import { AdmitCardPdfService } from '../exams/pdf/admit-card-pdf.service';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { NotificationEvents } from '../../core/notifications/notification.events';
import { AttendanceEligibilityService } from '../attendance-policy/attendance-eligibility.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ExamCellService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly finance: FinanceService,
    private readonly admitPdf: AdmitCardPdfService,
    private readonly notify: NotificationEmitterService,
    private readonly events: EventEmitter2,
    private readonly attendanceEligibility: AttendanceEligibilityService,
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
      [publishedResults],
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
        `SELECT COUNT(*)::int AS c FROM student_exam_reports ser
         JOIN exam_result_sessions ers ON ers.session_id = ser.session_id
         WHERE ers.tenant_id = $1 AND ser.status = 'PUBLISHED'`,
        [tenantId],
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

    const resultStats = await this.queryOrEmpty<{
      label: string;
      count: number;
    }>(
      `SELECT ser.status AS label, COUNT(*)::int AS count
       FROM student_exam_reports ser
       JOIN exam_result_sessions ers ON ers.session_id = ser.session_id
       WHERE ers.tenant_id = $1
       GROUP BY ser.status`,
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
      published_results: publishedResults?.c ?? 0,
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
        `SELECT es.exam_schedule_id, es.exam_type, es.exam_date, es.venue, sub.subject_name, sub.subject_code
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
        `SELECT es.*, sub.subject_name, sub.subject_code
         FROM exam_schedules es
         LEFT JOIN academic_subjects sub ON sub.subject_id = es.subject_id
         WHERE es.tenant_id = $1 OR es.tenant_id IS NULL
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
        `SELECT es.*, NULL::text AS subject_name, NULL::text AS subject_code
         FROM exam_schedules es
         WHERE es.tenant_id = $1 OR es.tenant_id IS NULL
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
    const rows = await this.db.query(
      `INSERT INTO exam_schedules (tenant_id, exam_type, subject_id, exam_date, start_time, end_time, venue, max_marks, batch_label, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'SCHEDULED') RETURNING *`,
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
      const subjectRows = await this.db.query(
        `SELECT subject_name, subject_code, semester FROM academic_subjects WHERE subject_id = $1`,
        [dto.subject_id],
      );
      const subject = subjectRows[0];
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
              sp.enrollment_number, sp.admission_number, sp.profile_photo_url
       FROM users u
       INNER JOIN student_course_enrollments e ON e.student_user_id = u.user_id AND e.tenant_id = $1
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       WHERE e.semester = $2 AND u.tenant_id = $1
       ORDER BY u.name`,
      [tenantId, semester],
    );

    const schedules = await this.db.query(
      `SELECT * FROM exam_schedules
       WHERE (tenant_id = $1 OR tenant_id IS NULL)
         AND ($2::text IS NULL OR batch_label = $2)
         AND exam_date >= CURRENT_DATE
       ORDER BY exam_date, start_time`,
      [tenantId, dto.batch_label || null],
    );

    const runRows = await this.db.query(
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

    const uploadDir = path.join(process.cwd(), 'uploads', 'admit-cards', runId);
    fs.mkdirSync(uploadDir, { recursive: true });

    for (const student of students) {
      const reasons = await this.getAdmitBlockReasons(
        student.user_id,
        tenantId,
      );
      const eligible = reasons.length === 0;

      if (eligible) {
        const seating = await this.db.query(
          `SELECT room, seat_number FROM exam_seating_allocations
           WHERE student_user_id = $1 ORDER BY created_at DESC LIMIT 20`,
          [student.user_id],
        );
        const pdf = await this.admitPdf.generate({
          student: {
            user_id: student.user_id,
            name: student.name,
            email: student.official_email ?? '',
            profile_picture_url: student.profile_photo_url ?? null,
          },
          schedules: schedules.map(
            (s: {
              exam_schedule_id: string;
              exam_date: string;
              start_time: string;
              end_time: string;
              exam_type: string;
              venue: string;
            }) => ({
              exam_schedule_id: s.exam_schedule_id,
              exam_date: s.exam_date,
              start_time: s.start_time,
              end_time: s.end_time,
              exam_type: s.exam_type,
              venue: s.venue,
              seat_no: seating[0]?.seat_number ?? 'TBA',
            }),
          ),
          barcodePayload: `${student.user_id}:${schedules.map((s: { exam_schedule_id: string }) => s.exam_schedule_id).join(',')}`,
        });
        const pdfPath = path.join(uploadDir, `${student.user_id}.pdf`);
        fs.writeFileSync(pdfPath, pdf);
        generated++;
        await this.db.query(
          `INSERT INTO exam_admit_card_entries (run_id, student_user_id, eligible, block_reasons, pdf_path)
           VALUES ($1,$2,true,'[]',$3)`,
          [runId, student.user_id, pdfPath],
        );
      } else {
        blocked++;
        for (const r of reasons) {
          this.notify.admitCardLocked({
            tenantId,
            userId: student.user_id,
            message: r,
          });
        }
        await this.db.query(
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

    await this.db.query(
      `UPDATE exam_admit_card_runs SET generated_count = $2, blocked_count = $3 WHERE run_id = $1`,
      [runId, generated, blocked],
    );

    return { run_id: runId, generated, blocked, students: results };
  }

  /** Pre-generation audit matrix for COE review before batch admit card PDFs. */
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
      const pendingDues = await this.finance.getPendingDues(student.user_id);
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
    tenantId = 'a0000000-0000-4000-8000-000000000001',
  ): Promise<string[]> {
    const reasons: string[] = [];
    const pendingDues = await this.finance.getPendingDues(studentUserId);
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
       WHERE student_user_id = $1 AND status = 'PENDING'`,
      [studentUserId],
    );
    if ((fines[0]?.c ?? 0) > 0) reasons.push('Blocked: Pending hostel fines');

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
    if (!dto.rooms?.length)
      throw new BadRequestException('Select at least one room');

    let scheduleIds: string[] = [];
    if (dto.allocation_strategy === 'by_schedule') {
      if (!dto.exam_schedule_id?.trim())
        throw new BadRequestException('Select an exam schedule');
      const examRows = await this.db.query(
        `SELECT 1 FROM exam_schedules WHERE exam_schedule_id = $1`,
        [dto.exam_schedule_id],
      );
      if (!examRows[0])
        throw new BadRequestException('Exam schedule not found');
      scheduleIds.push(dto.exam_schedule_id);
    } else {
      if (!dto.exam_type?.trim())
        throw new BadRequestException('Select an exam type');
      const exams = await this.db.query(
        `SELECT exam_schedule_id FROM exam_schedules WHERE tenant_id = $1 AND exam_type = $2`,
        [tenantId, dto.exam_type],
      );
      scheduleIds = exams.map((e: any) => e.exam_schedule_id);
      if (scheduleIds.length === 0)
        throw new BadRequestException('No schedules found for this exam type');
    }

    const branchFilter =
      dto.branch && dto.branch !== 'All Branches'
        ? `AND COALESCE(d.dept_name, 'GEN') = $3`
        : '';
    const params: any[] = [tenantId, dto.semester];
    if (dto.branch && dto.branch !== 'All Branches') params.push(dto.branch);

    const students = await this.db.query(
      `SELECT DISTINCT u.user_id, u.name,
              COALESCE(d.dept_name, 'GEN') AS branch_code
       FROM users u
       INNER JOIN student_course_enrollments e ON e.student_user_id = u.user_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       WHERE e.tenant_id = $1 AND e.semester = $2 ${branchFilter}
       ORDER BY branch_code, u.user_id`,
      params,
    );

    const spaces = await this.db.query(
      `SELECT room_number, capacity FROM campus_spaces WHERE tenant_id = $1`,
      [tenantId],
    );
    const capMap = new Map<string, number>(
      spaces.map((s: any) => [s.room_number, Number(s.capacity)]),
    );

    const schedulesInfo = await this.db.query(
      `
      SELECT es.exam_schedule_id, es.exam_date, sub.subject_name
      FROM exam_schedules es
      LEFT JOIN academic_subjects sub ON sub.subject_id = es.subject_id
      WHERE es.exam_schedule_id = ANY($1)
    `,
      [scheduleIds],
    );
    const schedMap = new Map<string, any>(
      schedulesInfo.map((s: any) => [s.exam_schedule_id, s]),
    );

    let totalAllocated = 0;
    const enrichedAllocations: any[] = [];

    for (const scheduleId of scheduleIds) {
      if (!dto.branch || dto.branch === 'All Branches') {
        await this.db.query(
          `DELETE FROM exam_seating_allocations WHERE exam_schedule_id = $1`,
          [scheduleId],
        );
      } else {
        await this.db.query(
          `DELETE FROM exam_seating_allocations WHERE exam_schedule_id = $1 AND branch_code = $2`,
          [scheduleId, dto.branch],
        );
      }

      const occupiedRows = await this.db.query(
        `SELECT room, seat_number FROM exam_seating_allocations WHERE exam_schedule_id = $1`,
        [scheduleId],
      );
      const occupied = new Set(
        occupiedRows.map((r: any) => `${r.room}-${Number(r.seat_number)}`),
      );

      let roomIdx = 0;
      let seatNum = 1;
      let prevBranch: string | null = null;
      const schedInfo = schedMap.get(scheduleId);

      for (const s of students) {
        let room = dto.rooms[roomIdx];
        let capacity = capMap.get(room) || 30;

        while (true) {
          if (seatNum > capacity) {
            roomIdx = (roomIdx + 1) % dto.rooms.length;
            room = dto.rooms[roomIdx];
            capacity = capMap.get(room) || 30;
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

        await this.db.query(
          `INSERT INTO exam_seating_allocations (tenant_id, exam_schedule_id, room, student_user_id, seat_number, branch_code)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [tenantId, scheduleId, room, s.user_id, seatString, s.branch_code],
        );

        enrichedAllocations.push({
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

    await this.db.query(
      `INSERT INTO exam_seating_runs (tenant_id, allocation_strategy, exam_type, exam_schedule_id, semester, branch, allocations)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
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

    await this.publishSeatingPlans(
      tenantId,
      dto.allocation_strategy === 'by_schedule'
        ? dto.exam_schedule_id
        : scheduleIds[0],
    );

    return { allocated: totalAllocated, rooms: dto.rooms };
  }

  async listSeatingRuns(tenantId: string) {
    const baseSql = (withSubjectJoin: boolean) => `
      SELECT r.run_id, r.allocation_strategy, r.exam_type, r.exam_schedule_id, r.semester, r.branch, r.created_at,
             CASE
               WHEN jsonb_typeof(r.allocations) = 'array' THEN jsonb_array_length(r.allocations)
               ELSE 0
             END AS total_allocated,
             r.allocations,
             ${withSubjectJoin ? 'sub.subject_name, es.exam_date' : 'NULL::text AS subject_name, es.exam_date'}
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
      `SELECT a.*, u.name AS student_name, es.exam_type, es.exam_date, sub.subject_name, sub.subject_code
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
    const rows = await this.db.query<
      Array<{ student_user_id: string; seat_number: string }>
    >(
      `SELECT student_user_id, seat_number FROM exam_seating_allocations
       WHERE tenant_id = $1 AND exam_schedule_id = $2 AND room = $3
         AND student_user_id IN ($4, $5)`,
      [
        tenantId,
        dto.exam_schedule_id,
        dto.room,
        dto.student_user_id_a,
        dto.student_user_id_b,
      ],
    );
    if (rows.length !== 2) {
      throw new BadRequestException(
        'Both students must be seated in the selected room',
      );
    }
    const a = rows.find((r) => r.student_user_id === dto.student_user_id_a)!;
    const b = rows.find((r) => r.student_user_id === dto.student_user_id_b)!;
    await this.db.query(
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
    await this.db.query(
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
    return { swapped: true };
  }

  listSeatingPlans(tenantId: string) {
    return this.db.query(
      `SELECT s.*, e.exam_type, e.exam_date, e.venue
       FROM exam_seating_plans s
       LEFT JOIN exam_schedules e ON e.exam_schedule_id = s.exam_schedule_id
       WHERE s.tenant_id = $1
       ORDER BY s.created_at DESC`,
      [tenantId],
    );
  }

  listScheduleSubjects() {
    return this.db.query(
      `SELECT subject_id, subject_code, subject_name, semester
       FROM academic_subjects
       ORDER BY semester, subject_code`,
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
  ) {
    if (!dto.exam_schedule_id?.trim() || !dto.faculty_user_id?.trim()) {
      throw new BadRequestException('Exam schedule and faculty are required');
    }
    const examRows = await this.db.query(
      `SELECT 1 FROM exam_schedules WHERE exam_schedule_id = $1`,
      [dto.exam_schedule_id],
    );
    if (!examRows[0]) throw new BadRequestException('Exam schedule not found');

    if (dto.is_coordinator) {
      await this.db.query(
        `UPDATE exam_invigilation_duties SET is_coordinator = false
         WHERE tenant_id = $1 AND exam_schedule_id = $2 AND room = $3`,
        [tenantId, dto.exam_schedule_id, dto.room],
      );
    }

    const rows = await this.db.query(
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
    if (!dto.exam_schedule_id?.trim() || !dto.room?.trim()) {
      throw new BadRequestException('Exam schedule and room are required');
    }

    const scheduleRows = await this.db.query(
      `SELECT es.exam_schedule_id, es.subject_id, sub.subject_name, sub.subject_code
       FROM exam_schedules es
       LEFT JOIN academic_subjects sub ON sub.subject_id = es.subject_id
       WHERE es.tenant_id = $1 AND es.exam_schedule_id = $2`,
      [tenantId, dto.exam_schedule_id],
    );
    const schedule = scheduleRows[0];
    if (!schedule) throw new BadRequestException('Exam schedule not found');

    const spaceRows = await this.db.query(
      `SELECT building_name, room_number, capacity FROM campus_spaces
       WHERE tenant_id = $1 AND room_number = $2 LIMIT 1`,
      [tenantId, dto.room],
    );
    const capacity =
      Number(spaceRows[0]?.capacity) > 0 ? Number(spaceRows[0].capacity) : 60;
    const block = dto.block ?? spaceRows[0]?.building_name ?? 'Main Block';

    const students = await this.db.query(
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
         ON e.course_id = c.course_id AND e.tenant_id = c.tenant_id AND e.semester = $3 AND e.status = 'ENROLLED'
       INNER JOIN users u ON u.user_id = e.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       WHERE es.exam_schedule_id = $2 AND es.tenant_id = $1
       ORDER BY sort_key`,
      [tenantId, dto.exam_schedule_id, dto.semester],
    );

    await this.db.query(
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
      if (seatNum > capacity) break;
      const seatString = String(seatNum).padStart(2, '0');
      await this.db.query(
        `INSERT INTO exam_seating_allocations (tenant_id, exam_schedule_id, room, student_user_id, seat_number, branch_code)
         VALUES ($1,$2,$3,$4,$5,'GEN')`,
        [tenantId, dto.exam_schedule_id, dto.room, student.user_id, seatString],
      );
      allocated.push({
        student_user_id: student.user_id,
        student_name: student.name,
        seat_number: seatString,
      });
      seatNum++;
    }

    if (dto.coordinator_faculty_user_id?.trim()) {
      await this.assignInvigilation(tenantId, {
        exam_schedule_id: dto.exam_schedule_id,
        room: dto.room,
        faculty_user_id: dto.coordinator_faculty_user_id,
        is_coordinator: true,
      });
    }

    await this.publishSeatingPlans(tenantId, dto.exam_schedule_id, block);

    return {
      subject_name: schedule.subject_name,
      room: dto.room,
      capacity,
      allocated: allocated.length,
      students: allocated,
      block,
    };
  }

  /** Sync seating allocations into published exam_seating_plans for the student portal. */
  async publishSeatingPlans(
    tenantId: string,
    examScheduleId?: string,
    defaultBlock?: string,
  ) {
    const filter = examScheduleId ? 'AND a.exam_schedule_id = $2' : '';
    const params = examScheduleId ? [tenantId, examScheduleId] : [tenantId];

    const rows = await this.db.query(
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

    let published = 0;
    for (const [key, roomRows] of byRoom) {
      const [scheduleId, room] = key.split('::');
      const block = roomRows[0]?.building_name ?? defaultBlock ?? 'Main Block';
      const seatingMap = roomRows.map((r) => ({
        student_user_id: r.student_user_id,
        seat_no: r.seat_number,
        block,
      }));

      await this.db.query(
        `DELETE FROM exam_seating_plans
         WHERE tenant_id = $1 AND exam_schedule_id = $2 AND room = $3`,
        [tenantId, scheduleId, room],
      );
      await this.db.query(
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
      `SELECT d.*, es.exam_date, es.start_time, es.end_time, es.exam_type
       FROM exam_invigilation_duties d
       JOIN exam_schedules es ON es.exam_schedule_id = d.exam_schedule_id
       WHERE d.tenant_id = $1 AND d.exam_schedule_id = $2`,
      [tenantId, examScheduleId],
    );

    for (const d of duties) {
      await this.db.query(
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

    await this.db.query(
      `UPDATE exam_invigilation_duties SET published = true, status = 'ASSIGNED'
       WHERE tenant_id = $1 AND exam_schedule_id = $2`,
      [tenantId, examScheduleId],
    );

    return { published: duties.length };
  }

  listInvigilationDuties(tenantId: string) {
    return this.db.query(
      `SELECT d.*, u.name AS faculty_name, es.exam_type, es.exam_date, es.start_time
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
       WHERE request_id = $3
       RETURNING *`,
      [status, comment, requestId],
    );

    if (status === 'APPROVED') {
      const assignmentRow = await this.db.query(
        `SELECT * FROM faculty_invigilation_assignments WHERE assignment_id = $1`,
        [request.assignment_id],
      );
      if (assignmentRow[0]) {
        const assignment = assignmentRow[0];

        // Delete from faculty assignments
        await this.db.query(
          `DELETE FROM faculty_invigilation_assignments WHERE assignment_id = $1`,
          [assignment.assignment_id],
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
      `SELECT student_user_id, exam_type, marks_obtained
       FROM academic_marks
       WHERE tenant_id = $1 AND course_id = $2`,
      [tenantId, courseId],
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
  ) {
    const updated = await this.db.query(
      `UPDATE academic_marks
       SET status = 'PUBLISHED', published_at = NOW(), updated_at = NOW()
       WHERE tenant_id = $1 AND course_id = $2 AND exam_type = $3 AND status = 'PENDING_COE'
       RETURNING student_user_id, marks_obtained, max_marks`,
      [tenantId, dto.course_id, dto.exam_type],
    );

    if (!updated.length)
      throw new BadRequestException('No PENDING_COE marks to publish');

    const courseRows = await this.db.query(
      `SELECT course_name FROM academic_courses WHERE course_id = $1`,
      [dto.course_id],
    );
    const courseName = courseRows[0]?.course_name ?? 'Course';

    const semester = dto.batch_semester ?? 4;
    const students = await this.db.query(
      `SELECT DISTINCT student_user_id FROM student_course_enrollments
       WHERE tenant_id = $1 AND semester = $2`,
      [tenantId, semester],
    );

    for (const s of students) {
      this.events.emit(NotificationEvents.EXAM_RESULTS_PUBLISHED, {
        tenantId,
        userId: s.student_user_id,
        courseName,
        examType: dto.exam_type,
        batchSemester: semester,
      });
      this.notify.examResultsPublished({
        tenantId,
        userId: s.student_user_id,
        courseName,
        examType: dto.exam_type,
      });
    }

    return { published: updated.length, course_name: courseName };
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
       WHERE u.tenant_id = $1
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

  async getReEvaluation(tenantId: string, applicationId: string) {
    const rows = await this.db.query(
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
         AND a.tenant_id = $2`,
      [applicationId, tenantId],
    );
    if (!rows[0])
      throw new NotFoundException('Re-evaluation application not found');
    return rows[0];
  }

  private async loadOriginalMarks(studentUserId: string, subjectId: number) {
    const rows = await this.db.query<Array<{ marks_obtained: string | null }>>(
      `SELECT marks_obtained
       FROM academic_exam_results
       WHERE student_user_id = $1 AND subject_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [studentUserId, subjectId],
    );
    if (rows[0]?.marks_obtained != null) return Number(rows[0].marks_obtained);
    const markRows = await this.db.query<
      Array<{ marks_obtained: string | null }>
    >(
      `SELECT m.marks_obtained
       FROM academic_marks m
       JOIN academic_courses c ON c.course_id = m.course_id
       JOIN academic_subjects s ON s.subject_code = c.course_code
       WHERE m.student_user_id = $1
         AND s.subject_id = $2
         AND m.status = 'PUBLISHED'
       ORDER BY m.published_at DESC NULLS LAST
       LIMIT 1`,
      [studentUserId, subjectId],
    );
    return markRows[0]?.marks_obtained != null
      ? Number(markRows[0].marks_obtained)
      : null;
  }

  private reEvalNotifyPayload(
    tenantId: string,
    row: {
      exam_application_id: string;
      student_user_id: string;
      student_name?: string;
      subject_name?: string;
      subject_code?: string;
      original_marks?: number | null;
      revised_marks?: number | null;
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
      originalMarks: row.original_marks ?? null,
      revisedMarks: row.revised_marks ?? null,
      reportNotes: row.report_notes ?? null,
    };
  }

  async assignReEvaluation(
    tenantId: string,
    actorUserId: string,
    applicationId: string,
    facultyUserId: string,
  ) {
    const application = await this.getReEvaluation(tenantId, applicationId);
    if (application.status !== 'PENDING') {
      throw new BadRequestException(
        'Only pending applications can be assigned',
      );
    }

    const facultyRows = await this.db.query(
      `SELECT 1 FROM users u
       JOIN user_roles ur ON ur.user_id = u.user_id
       JOIN roles r ON r.role_id = ur.role_id
       WHERE u.user_id = $1 AND u.tenant_id = $2 AND lower(r.role_name) = 'faculty'`,
      [facultyUserId, tenantId],
    );
    if (!facultyRows[0])
      throw new BadRequestException('Selected faculty is invalid');

    const originalMarks = await this.loadOriginalMarks(
      application.student_user_id,
      application.subject_id,
    );

    const rows = await this.db.query(
      `UPDATE exam_applications
       SET status = 'ASSIGNED',
           assigned_faculty_user_id = $2,
           assigned_by = $3,
           assigned_at = NOW(),
           original_marks = $4
       WHERE exam_application_id = $1
       RETURNING *`,
      [applicationId, facultyUserId, actorUserId, originalMarks],
    );
    const updated = {
      ...application,
      ...rows[0],
      original_marks: originalMarks,
    };

    this.notify.examRevaluationAssigned({
      ...this.reEvalNotifyPayload(tenantId, updated),
      userId: facultyUserId,
    });

    return this.getReEvaluation(tenantId, applicationId);
  }

  async submitReEvaluationReport(
    facultyUserId: string,
    applicationId: string,
    dto: { revised_marks: number; report_notes: string },
  ) {
    const [faculty] = await this.db.query<Array<{ tenant_id: string }>>(
      `SELECT tenant_id FROM users WHERE user_id = $1 LIMIT 1`,
      [facultyUserId],
    );
    const tenantId =
      faculty?.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';

    const application = await this.getReEvaluation(tenantId, applicationId);
    if (application.assigned_faculty_user_id !== facultyUserId) {
      throw new ForbiddenException(
        'You are not assigned to this re-evaluation',
      );
    }
    if (application.status !== 'ASSIGNED') {
      throw new BadRequestException(
        'Report can only be submitted for assigned applications',
      );
    }

    await this.db.query(
      `UPDATE exam_applications
       SET status = 'UNDER_REVIEW',
           revised_marks = $2,
           report_notes = $3,
           report_submitted_at = NOW()
       WHERE exam_application_id = $1`,
      [applicationId, dto.revised_marks, dto.report_notes.trim()],
    );

    const refreshed = await this.getReEvaluation(tenantId, applicationId);
    const [student] = await this.db.query<Array<{ tenant_id: string }>>(
      `SELECT tenant_id FROM users WHERE user_id = $1`,
      [refreshed.student_user_id],
    );
    const notifyTenantId = student?.tenant_id ?? tenantId;

    this.notify.examRevaluationReportReady({
      ...this.reEvalNotifyPayload(notifyTenantId, {
        ...refreshed,
        revised_marks: dto.revised_marks,
        report_notes: dto.report_notes,
      }),
      userId: refreshed.student_user_id,
    });

    return refreshed;
  }

  async publishReEvaluation(
    tenantId: string,
    actorUserId: string,
    applicationId: string,
  ) {
    const application = await this.getReEvaluation(tenantId, applicationId);
    if (application.status !== 'UNDER_REVIEW') {
      throw new BadRequestException(
        'Only applications with a submitted report can be published',
      );
    }

    await this.db.query(
      `UPDATE exam_applications
       SET status = 'COMPLETED',
           published_at = NOW(),
           published_by = $2
       WHERE exam_application_id = $1`,
      [applicationId, actorUserId],
    );

    if (application.revised_marks != null) {
      await this.db.query(
        `UPDATE academic_exam_results
         SET marks_obtained = $3, updated_at = NOW()
         WHERE student_user_id = $1 AND subject_id = $2`,
        [
          application.student_user_id,
          application.subject_id,
          application.revised_marks,
        ],
      );
    }

    const refreshed = await this.getReEvaluation(tenantId, applicationId);
    const payload = this.reEvalNotifyPayload(tenantId, refreshed);

    this.notify.examRevaluationPublished({
      ...payload,
      userId: refreshed.student_user_id,
      actionLink: '/student/exams?intent=revaluation',
    });

    const parentRows = await this.db.query<
      Array<{ parent_mobile: string; parent_name: string }>
    >(
      `SELECT parent_mobile, parent_name
       FROM parent_student_links
       WHERE student_user_id = $1`,
      [refreshed.student_user_id],
    );
    for (const parent of parentRows) {
      const revisedText =
        refreshed.revised_marks != null && refreshed.original_marks != null
          ? `Marks updated from ${refreshed.original_marks} to ${refreshed.revised_marks}.`
          : refreshed.revised_marks != null
            ? `Revised marks: ${refreshed.revised_marks}.`
            : 'Report published.';
      await this.db.query(
        `INSERT INTO integration_jobs (tenant_id, integration_type, entity_type, payload)
         VALUES ($1, 'WHATSAPP', 'revaluation_report', $2::jsonb)`,
        [
          tenantId,
          JSON.stringify({
            to: parent.parent_mobile,
            message: `Re-evaluation report for ${refreshed.student_name} (${refreshed.subject_name}): ${revisedText}`,
            provider: 'MSG91',
          }),
        ],
      );
    }

    return refreshed;
  }

  async rejectReEvaluation(
    tenantId: string,
    actorUserId: string,
    applicationId: string,
    reason?: string,
  ) {
    const application = await this.getReEvaluation(tenantId, applicationId);
    if (!['PENDING', 'ASSIGNED', 'UNDER_REVIEW'].includes(application.status)) {
      throw new BadRequestException('This application cannot be rejected');
    }

    await this.db.query(
      `UPDATE exam_applications
       SET status = 'REJECTED',
           report_notes = COALESCE($2, report_notes),
           published_at = NOW(),
           published_by = $3
       WHERE exam_application_id = $1`,
      [applicationId, reason?.trim() || null, actorUserId],
    );

    const refreshed = await this.getReEvaluation(tenantId, applicationId);
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

  listFacultyReEvaluations(facultyUserId: string) {
    return this.db.query(
      `SELECT a.*,
              u.name AS student_name,
              sub.subject_name,
              sub.subject_code
       FROM exam_applications a
       JOIN users u ON u.user_id = a.student_user_id
       JOIN academic_subjects sub ON sub.subject_id = a.subject_id
       WHERE a.application_type = 'RE_EVALUATION'
         AND a.assigned_faculty_user_id = $1
         AND a.status IN ('ASSIGNED', 'UNDER_REVIEW', 'COMPLETED')
       ORDER BY a.assigned_at DESC NULLS LAST, a.created_at DESC`,
      [facultyUserId],
    );
  }

  listStudentReEvaluations(studentUserId: string) {
    return this.db.query(
      `SELECT a.*,
              sub.subject_name,
              sub.subject_code,
              f.name AS faculty_name
       FROM exam_applications a
       JOIN academic_subjects sub ON sub.subject_id = a.subject_id
       LEFT JOIN users f ON f.user_id = a.assigned_faculty_user_id
       WHERE a.student_user_id = $1
         AND a.application_type = 'RE_EVALUATION'
       ORDER BY a.created_at DESC`,
      [studentUserId],
    );
  }

  listParentReEvaluations(studentUserId: string) {
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
       WHERE a.student_user_id = $1
         AND a.application_type = 'RE_EVALUATION'
         AND a.status = 'COMPLETED'
       ORDER BY a.published_at DESC NULLS LAST`,
      [studentUserId],
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

    const rows = await this.db.query(
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
      await this.db.query(
        `UPDATE academic_marks SET marks_obtained = 0, status = 'PUBLISHED', updated_at = NOW()
         WHERE student_user_id = $1 AND course_id = $2 AND tenant_id = $3`,
        [studentUserId, courseId, tenantId],
      );
    } else {
      await this.db.query(
        `UPDATE academic_marks SET marks_obtained = 0, status = 'PUBLISHED', updated_at = NOW()
         WHERE student_user_id = $1 AND tenant_id = $2`,
        [studentUserId, tenantId],
      );
    }

    await this.db.query(
      `UPDATE grade_cards
       SET status = 'WITHHELD',
           payload = COALESCE(payload, '{}'::jsonb) || '{"withheld_reason":"Open UFM case","result_stage":"WITHHELD"}'::jsonb
       WHERE student_user_id = $1 AND tenant_id = $2`,
      [studentUserId, tenantId],
    );

    await this.db.query(
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

    const enriched = await this.db.query(
      `SELECT c.*, u.name AS student_name
       FROM ufm_cases c
       LEFT JOIN users u ON u.user_id = c.student_user_id
       WHERE c.case_id = $1`,
      [rows[0].case_id],
    );
    return enriched[0] ?? rows[0];
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
