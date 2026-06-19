import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { FinanceService } from '../finance/finance.service';
import { AdmitCardPdfService } from '../exams/pdf/admit-card-pdf.service';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { NotificationEvents } from '../../core/notifications/notification.events';
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
  ) {}

  async dashboard(tenantId: string) {
    const [[schedules], [pendingMarks], [reEvals], [ufmOpen], [duties]] = await Promise.all([
      this.db.query(`SELECT COUNT(*)::int AS c FROM exam_schedules WHERE tenant_id = $1`, [tenantId]),
      this.db.query(
        `SELECT COUNT(*)::int AS c FROM academic_marks WHERE tenant_id = $1 AND status = 'PENDING_COE'`,
        [tenantId],
      ),
      this.db.query(
        `SELECT COUNT(*)::int AS c FROM exam_applications
         WHERE application_type = 'RE_EVALUATION' AND fee_status = 'PAID'
           AND status IN ('PENDING', 'ASSIGNED', 'UNDER_REVIEW')`,
      ),
      this.db.query(
        `SELECT COUNT(*)::int AS c FROM ufm_cases WHERE tenant_id = $1 AND status != 'CLOSED'`,
        [tenantId],
      ),
      this.db.query(
        `SELECT COUNT(*)::int AS c FROM exam_invigilation_duties WHERE tenant_id = $1 AND published = true`,
        [tenantId],
      ),
    ]);
    return {
      persona: 'Falcon Exam OS',
      schedules: schedules?.c ?? 0,
      pending_coe_marks: pendingMarks?.c ?? 0,
      re_evaluations_queue: reEvals?.c ?? 0,
      open_ufm_cases: ufmOpen?.c ?? 0,
      invigilation_duties_published: duties?.c ?? 0,
    };
  }

  listSchedules(tenantId: string) {
    return this.db.query(
      `SELECT es.*, sub.subject_name, sub.subject_code
       FROM exam_schedules es
       LEFT JOIN academic_subjects sub ON sub.subject_id = es.subject_id
       WHERE es.tenant_id = $1 OR es.tenant_id IS NULL
       ORDER BY es.exam_date ASC, es.start_time ASC`,
      [tenantId],
    );
  }

  createSchedule(
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
    return this.db.query(
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
              sp.enrollment_number, sp.admission_number
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
    const results: { student_user_id: string; name: string; eligible: boolean; reasons: string[] }[] =
      [];

    const uploadDir = path.join(process.cwd(), 'uploads', 'admit-cards', runId);
    fs.mkdirSync(uploadDir, { recursive: true });

    for (const student of students) {
      const reasons = await this.getAdmitBlockReasons(student.user_id);
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

  async getAdmitBlockReasons(studentUserId: string): Promise<string[]> {
    const reasons: string[] = [];
    const pendingDues = await this.finance.getPendingDues(studentUserId);
    if (pendingDues.length > 0) {
      reasons.push('Blocked: Pending fee dues');
    }

    const att = await this.db.query(
      `SELECT COUNT(*) FILTER (WHERE status IN ('PRESENT','LATE'))::float AS attended,
              COUNT(*)::float AS total
       FROM academic_attendance_records WHERE student_user_id = $1`,
      [studentUserId],
    );
    const total = Number(att[0]?.total ?? 0);
    const pct = total > 0 ? Math.round((Number(att[0]?.attended ?? 0) / total) * 100) : 0;
    if (pct < 75) reasons.push(`Blocked: Attendance ${pct}% (min 75%)`);

    const fines = await this.db.query(
      `SELECT COUNT(*)::int AS c FROM operations_hostel_fines
       WHERE student_user_id = $1 AND status = 'PENDING'`,
      [studentUserId],
    );
    if ((fines[0]?.c ?? 0) > 0) reasons.push('Blocked: Pending hostel fines');

    return reasons;
  }

  async getBranchesBySemester(tenantId: string, semester: number) {
    const rows = await this.db.query(
      `SELECT DISTINCT COALESCE(d.dept_name, 'GEN') AS branch_code
       FROM users u
       INNER JOIN student_course_enrollments e ON e.student_user_id = u.user_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       WHERE e.tenant_id = $1 AND e.semester = $2
       ORDER BY branch_code`,
      [tenantId, semester]
    );
    return rows.map((r: any) => r.branch_code);
  }

  async getBlocksAndHalls(tenantId: string) {
    const spaces = await this.db.query(
      `SELECT building_name AS block, room_number AS hall, capacity
       FROM campus_spaces
       WHERE tenant_id = $1 AND space_type = 'CLASSROOM'
       ORDER BY building_name, room_number`,
      [tenantId]
    );
    
    const blocksMap = new Map();
    for (const s of spaces) {
      if (!blocksMap.has(s.block)) blocksMap.set(s.block, { block: s.block, halls: [] });
      const cols = 5;
      const rows = Math.ceil(s.capacity / cols);
      blocksMap.get(s.block).halls.push({ name: s.hall, capacity: s.capacity, rows, cols });
    }
    return Array.from(blocksMap.values());
  }

  /** Auto-allocate seats — no adjacent same-branch students */
  async autoAllocateSeating(
    tenantId: string,
    dto: { allocation_strategy: string; exam_type?: string; exam_schedule_id?: string; semester: number; branch?: string; rooms: string[] },
  ) {
    if (!dto.rooms?.length) throw new BadRequestException('Select at least one room');

    let scheduleIds: string[] = [];
    if (dto.allocation_strategy === 'by_schedule') {
      if (!dto.exam_schedule_id?.trim()) throw new BadRequestException('Select an exam schedule');
      const examRows = await this.db.query(
        `SELECT 1 FROM exam_schedules WHERE exam_schedule_id = $1`,
        [dto.exam_schedule_id],
      );
      if (!examRows[0]) throw new BadRequestException('Exam schedule not found');
      scheduleIds.push(dto.exam_schedule_id);
    } else {
      if (!dto.exam_type?.trim()) throw new BadRequestException('Select an exam type');
      const exams = await this.db.query(`SELECT exam_schedule_id FROM exam_schedules WHERE tenant_id = $1 AND exam_type = $2`, [tenantId, dto.exam_type]);
      scheduleIds = exams.map((e: any) => e.exam_schedule_id);
      if (scheduleIds.length === 0) throw new BadRequestException('No schedules found for this exam type');
    }

    const branchFilter = dto.branch && dto.branch !== 'All Branches' ? `AND COALESCE(d.dept_name, 'GEN') = $3` : '';
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

    const spaces = await this.db.query(`SELECT room_number, capacity FROM campus_spaces WHERE tenant_id = $1`, [tenantId]);
    const capMap = new Map<string, number>(spaces.map((s: any) => [s.room_number, Number(s.capacity)]));

    const schedulesInfo = await this.db.query(`
      SELECT es.exam_schedule_id, es.exam_date, sub.subject_name
      FROM exam_schedules es
      LEFT JOIN academic_subjects sub ON sub.subject_id = es.subject_id
      WHERE es.exam_schedule_id = ANY($1)
    `, [scheduleIds]);
    const schedMap = new Map<string, any>(schedulesInfo.map((s: any) => [s.exam_schedule_id, s]));

    let totalAllocated = 0;
    const enrichedAllocations: any[] = [];

    for (const scheduleId of scheduleIds) {
      if (!dto.branch || dto.branch === 'All Branches') {
         await this.db.query(`DELETE FROM exam_seating_allocations WHERE exam_schedule_id = $1`, [scheduleId]);
      } else {
         await this.db.query(`DELETE FROM exam_seating_allocations WHERE exam_schedule_id = $1 AND branch_code = $2`, [scheduleId, dto.branch]);
      }

      const occupiedRows = await this.db.query(`SELECT room, seat_number FROM exam_seating_allocations WHERE exam_schedule_id = $1`, [scheduleId]);
      const occupied = new Set(occupiedRows.map((r: any) => `${r.room}-${Number(r.seat_number)}`));

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
           seat_number: seatString
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
      [tenantId, dto.allocation_strategy, dto.exam_type || null, dto.exam_schedule_id || null, dto.semester, dto.branch || 'All Branches', JSON.stringify(enrichedAllocations)]
    );

    return { allocated: totalAllocated, rooms: dto.rooms };
  }

  async listSeatingRuns(tenantId: string) {
    return this.db.query(
      `SELECT r.run_id, r.allocation_strategy, r.exam_type, r.exam_schedule_id, r.semester, r.branch, r.created_at,
              jsonb_array_length(r.allocations) as total_allocated, r.allocations,
              sub.subject_name, es.exam_date
       FROM exam_seating_runs r
       LEFT JOIN exam_schedules es ON es.exam_schedule_id = r.exam_schedule_id
       LEFT JOIN academic_subjects sub ON sub.subject_id = es.subject_id
       WHERE r.tenant_id = $1
       ORDER BY r.created_at DESC`,
       [tenantId]
    );
  }

  async deleteSeatingRun(tenantId: string, runId: string) {
    await this.db.query(`DELETE FROM exam_seating_runs WHERE tenant_id = $1 AND run_id = $2`, [tenantId, runId]);
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

  listSeatingPlans() {
    return this.db.query(
      `SELECT s.*, e.exam_type, e.exam_date, e.venue
       FROM exam_seating_plans s
       LEFT JOIN exam_schedules e ON e.exam_schedule_id = s.exam_schedule_id
       ORDER BY s.created_at DESC`,
    );
  }

  async assignInvigilation(
    tenantId: string,
    dto: { exam_schedule_id: string; room: string; faculty_user_id: string },
  ) {
    if (!dto.exam_schedule_id?.trim() || !dto.faculty_user_id?.trim()) {
      throw new BadRequestException('Exam schedule and faculty are required');
    }
    const examRows = await this.db.query(
      `SELECT 1 FROM exam_schedules WHERE exam_schedule_id = $1`,
      [dto.exam_schedule_id],
    );
    if (!examRows[0]) throw new BadRequestException('Exam schedule not found');

    const rows = await this.db.query(
      `INSERT INTO exam_invigilation_duties (tenant_id, exam_schedule_id, room, faculty_user_id)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (exam_schedule_id, room, faculty_user_id) DO UPDATE SET status = 'ASSIGNED'
       RETURNING *`,
      [tenantId, dto.exam_schedule_id, dto.room, dto.faculty_user_id],
    );
    return rows[0];
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
    comment: string
  ) {
    const reqRow = await this.db.query(
      `SELECT * FROM invigilation_unavailability_requests WHERE request_id = $1 AND tenant_id = $2`,
      [requestId, tenantId]
    );
    const request = reqRow[0];
    if (!request) throw new NotFoundException('Request not found');

    const updated = await this.db.query(
      `UPDATE invigilation_unavailability_requests
       SET status = $1, exam_cell_comment = $2, updated_at = NOW()
       WHERE request_id = $3
       RETURNING *`,
      [status, comment, requestId]
    );

    if (status === 'APPROVED') {
      const assignmentRow = await this.db.query(
        `SELECT * FROM faculty_invigilation_assignments WHERE assignment_id = $1`,
        [request.assignment_id]
      );
      if (assignmentRow[0]) {
        const assignment = assignmentRow[0];
        
        // Delete from faculty assignments
        await this.db.query(
          `DELETE FROM faculty_invigilation_assignments WHERE assignment_id = $1`,
          [assignment.assignment_id]
        );
        
        // Delete from exam_invigilation_duties
        // We know faculty_user_id, room, exam_schedule_id
        if (assignment.exam_schedule_id) {
          await this.db.query(
            `DELETE FROM exam_invigilation_duties 
             WHERE tenant_id = $1 AND exam_schedule_id = $2 AND room = $3 AND faculty_user_id = $4`,
            [tenantId, assignment.exam_schedule_id, assignment.room, assignment.faculty_user_id]
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
              f.name AS faculty_name,
              e.semester
       FROM academic_marks m
       JOIN users u ON u.user_id = m.student_user_id
       JOIN academic_courses c ON c.course_id = m.course_id
       LEFT JOIN users f ON f.user_id = m.uploaded_by
       LEFT JOIN student_course_enrollments e ON e.student_user_id = m.student_user_id AND e.course_id = m.course_id
       WHERE m.tenant_id = $1 AND m.status IN ('PENDING_COE', 'PUBLISHED')
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

  async getGradesAggregateTable(tenantId: string, semester: number, courseId: string) {
    const students = await this.db.query(
      `SELECT e.student_user_id, u.name AS student_name
       FROM student_course_enrollments e
       JOIN users u ON u.user_id = e.student_user_id
       WHERE e.tenant_id = $1 AND e.semester = $2 AND e.course_id = $3
       ORDER BY u.name`,
      [tenantId, semester, courseId]
    );

    const marks = await this.db.query(
      `SELECT student_user_id, exam_type, marks_obtained
       FROM academic_marks
       WHERE tenant_id = $1 AND course_id = $2`,
      [tenantId, courseId]
    );

    const marksMap = new Map<string, Record<string, number>>();
    for (const m of marks) {
      if (!marksMap.has(m.student_user_id)) {
        marksMap.set(m.student_user_id, {});
      }
      marksMap.get(m.student_user_id)![m.exam_type] = Number(m.marks_obtained) || 0;
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

      const isPending = quiz === undefined || internal === undefined || (cat1 === undefined && cat2 === undefined) || endTerm === undefined;
      const midTerm = (cat1 || 0) + (cat2 || 0);
      
      let aggregate: number | string = 'Pending';
      let grade = 'Pending';

      if (!isPending) {
        aggregate = Math.min(100, Math.round((quiz || 0) + (internal || 0) + midTerm + (endTerm || 0)));
        grade = calculateGrade(aggregate);
      }

      return {
        student_id: s.student_user_id,
        student_name: s.student_name,
        quiz_marks: quiz ?? '—',
        internal_marks: internal ?? '—',
        mid_term_marks: (cat1 !== undefined || cat2 !== undefined) ? midTerm : '—',
        end_term_marks: endTerm ?? '—',
        aggregate,
        grade
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

    if (!updated.length) throw new BadRequestException('No PENDING_COE marks to publish');



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

  listReEvaluations() {
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
       WHERE a.application_type = 'RE_EVALUATION'
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
    );
  }

  async getReEvaluation(applicationId: string) {
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
         AND a.application_type = 'RE_EVALUATION'`,
      [applicationId],
    );
    if (!rows[0]) throw new NotFoundException('Re-evaluation application not found');
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
    const markRows = await this.db.query<Array<{ marks_obtained: string | null }>>(
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
    return markRows[0]?.marks_obtained != null ? Number(markRows[0].marks_obtained) : null;
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
    const application = await this.getReEvaluation(applicationId);
    if (application.status !== 'PENDING') {
      throw new BadRequestException('Only pending applications can be assigned');
    }

    const facultyRows = await this.db.query(
      `SELECT 1 FROM users u
       JOIN user_roles ur ON ur.user_id = u.user_id
       JOIN roles r ON r.role_id = ur.role_id
       WHERE u.user_id = $1 AND u.tenant_id = $2 AND lower(r.role_name) = 'faculty'`,
      [facultyUserId, tenantId],
    );
    if (!facultyRows[0]) throw new BadRequestException('Selected faculty is invalid');

    const originalMarks = await this.loadOriginalMarks(application.student_user_id, application.subject_id);

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
    const updated = { ...application, ...rows[0], original_marks: originalMarks };

    this.notify.examRevaluationAssigned({
      ...this.reEvalNotifyPayload(tenantId, updated),
      userId: facultyUserId,
    });

    return this.getReEvaluation(applicationId);
  }

  async submitReEvaluationReport(
    facultyUserId: string,
    applicationId: string,
    dto: { revised_marks: number; report_notes: string },
  ) {
    const application = await this.getReEvaluation(applicationId);
    if (application.assigned_faculty_user_id !== facultyUserId) {
      throw new ForbiddenException('You are not assigned to this re-evaluation');
    }
    if (application.status !== 'ASSIGNED') {
      throw new BadRequestException('Report can only be submitted for assigned applications');
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

    const refreshed = await this.getReEvaluation(applicationId);
    const [student] = await this.db.query<Array<{ tenant_id: string }>>(
      `SELECT tenant_id FROM users WHERE user_id = $1`,
      [refreshed.student_user_id],
    );
    const tenantId = student?.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';

    this.notify.examRevaluationReportReady({
      ...this.reEvalNotifyPayload(tenantId, {
        ...refreshed,
        revised_marks: dto.revised_marks,
        report_notes: dto.report_notes,
      }),
      userId: refreshed.student_user_id,
    });

    return refreshed;
  }

  async publishReEvaluation(tenantId: string, actorUserId: string, applicationId: string) {
    const application = await this.getReEvaluation(applicationId);
    if (application.status !== 'UNDER_REVIEW') {
      throw new BadRequestException('Only applications with a submitted report can be published');
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
        [application.student_user_id, application.subject_id, application.revised_marks],
      );
    }

    const refreshed = await this.getReEvaluation(applicationId);
    const payload = this.reEvalNotifyPayload(tenantId, refreshed);

    this.notify.examRevaluationPublished({
      ...payload,
      userId: refreshed.student_user_id,
      actionLink: '/student/exams?intent=revaluation',
    });

    const parentRows = await this.db.query<Array<{ parent_mobile: string; parent_name: string }>>(
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
    const application = await this.getReEvaluation(applicationId);
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

    const refreshed = await this.getReEvaluation(applicationId);
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

  listUfmCases() {
    return this.db.query(
      `SELECT c.*, u.name AS student_name, u.official_email AS student_email,
              e.exam_type, e.exam_date, r.name AS reported_by_name
       FROM ufm_cases c
       LEFT JOIN users u ON u.user_id = c.student_user_id
       LEFT JOIN exam_schedules e ON e.exam_schedule_id = c.exam_id
       LEFT JOIN users r ON r.user_id = c.reported_by
       ORDER BY c.logged_at DESC`,
    );
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
    const rows = await this.db.query(
      `INSERT INTO ufm_cases (tenant_id, student_user_id, exam_id, description, penalty_applied, reported_by, marks_locked, status)
       VALUES ($1,$2,$3,$4,$5,$6,true,'OPEN') RETURNING *`,
      [
        tenantId,
        dto.student_user_id,
        dto.exam_id ?? null,
        dto.description,
        dto.penalty_applied ?? 'Exam cancelled — UFM',
        dto.reported_by ?? null,
      ],
    );

    if (dto.course_id) {
      await this.db.query(
        `UPDATE academic_marks SET marks_obtained = 0, status = 'PUBLISHED', updated_at = NOW()
         WHERE student_user_id = $1 AND course_id = $2 AND tenant_id = $3`,
        [dto.student_user_id, dto.course_id, tenantId],
      );
    } else {
      await this.db.query(
        `UPDATE academic_marks SET marks_obtained = 0, status = 'PUBLISHED', updated_at = NOW()
         WHERE student_user_id = $1 AND tenant_id = $2`,
        [dto.student_user_id, tenantId],
      );
    }

    await this.db.query(
      `UPDATE grade_cards SET status = 'WITHHELD' WHERE student_user_id = $1 AND tenant_id = $2`,
      [dto.student_user_id, tenantId],
    );

    return rows[0];
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
    const blockedSet = new Set(blocked.map((b: { student_user_id: string }) => b.student_user_id));

    return grads
      .filter((g: { user_id: string }) => !blockedSet.has(g.user_id))
      .map((g: { user_id: string; name: string; enrollment_number: string; abc_id: string }) => ({
        student_user_id: g.user_id,
        name: g.name,
        enrollment_number: g.enrollment_number,
        abc_id: g.abc_id,
        digilocker_ready: Boolean(g.abc_id),
        status: 'GENERATED',
      }));
  }

  listFacultyForInvigilation(tenantId: string) {
    return this.db.query(
      `SELECT user_id, name, official_email FROM users
       WHERE tenant_id = $1 AND is_active = true
         AND user_id IN (SELECT user_id FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id WHERE r.role_name = 'Faculty')
       ORDER BY name LIMIT 100`,
      [tenantId],
    );
  }

  listAdmitCardRuns(tenantId: string) {
    return this.db.query(
      `SELECT * FROM exam_admit_card_runs WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [tenantId],
    );
  }
}
