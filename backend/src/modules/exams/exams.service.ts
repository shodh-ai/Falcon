import {
  BadRequestException,
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ExamSchedule } from '../../entities/exam-schedule.entity';
import { ExamApplication } from '../../entities/exam-application.entity';
import { User } from '../../entities/user.entity';
import { FinanceService } from '../finance/finance.service';
import { CreateExamApplicationDto } from './dto/create-exam-application.dto';
import {
  AdmitCardPdfService,
  type AdmitCardExamRow,
} from './pdf/admit-card-pdf.service';
import { AttendanceEligibilityService } from '../attendance-policy/attendance-eligibility.service';
import { ExamCellAuditService } from '../exam-cell/exam-cell-audit.service';
import { FeeDemand } from '../../entities/fee-demand.entity';
import {
  listReEvaluationSources,
  resolveReEvaluationSource,
} from '../exam-cell/revaluation-source';
import { HallTicketVerificationService } from '../exam-cell/hall-ticket-verification.service';

export interface ExamEligibilityResult {
  eligible: boolean;
  attendance_percent: number;
  min_required: number;
  exempted: boolean;
  reasons: Array<{
    code: 'ATTENDANCE_SHORTFALL' | 'PENDING_FEE_DUES' | 'OPEN_UFM_CASE';
    message: string;
    details?: unknown;
  }>;
}

@Injectable()
export class ExamsService {
  constructor(
    @InjectRepository(ExamSchedule) private schedules: Repository<ExamSchedule>,
    @InjectRepository(ExamApplication)
    private applications: Repository<ExamApplication>,
    @InjectRepository(User) private users: Repository<User>,
    @InjectDataSource() private readonly db: DataSource,
    private readonly finance: FinanceService,
    private readonly pdf: AdmitCardPdfService,
    private readonly attendanceEligibility: AttendanceEligibilityService,
  ) {}

  async listUpcomingSchedulesForStudent(
    tenantId: string | undefined,
    studentUserId: string,
  ): Promise<ExamSchedule[]> {
    this.requireTenant(tenantId);
    const today = new Date().toISOString().slice(0, 10);
    return this.schedules
      .createQueryBuilder('s')
      .where('s.tenant_id = :tenantId', { tenantId })
      .andWhere(
        `EXISTS (
          SELECT 1
          FROM student_course_enrollments e
          JOIN academic_courses c ON c.course_id = e.course_id AND c.tenant_id = e.tenant_id
          JOIN academic_subjects enrolled_subject ON enrolled_subject.subject_code = c.course_code
          WHERE e.tenant_id = s.tenant_id
            AND e.student_user_id = :studentUserId
            AND enrolled_subject.subject_id = s.subject_id
        )`,
        { studentUserId },
      )
      .andWhere('s.exam_date >= :today', { today })
      .orderBy('s.exam_date', 'ASC')
      .addOrderBy('s.start_time', 'ASC')
      .getMany();
  }

  async listMyApplications(
    tenantId: string | undefined,
    studentUserId: string,
  ) {
    this.requireTenant(tenantId);
    return this.db.query<Array<Record<string, unknown>>>(
      `SELECT a.*,
              CASE WHEN a.status = 'COMPLETED' THEN a.revised_marks ELSE NULL END AS revised_marks,
              CASE WHEN a.status IN ('COMPLETED', 'REJECTED') THEN a.report_notes ELSE NULL END AS report_notes,
              sub.subject_name,
              sub.subject_code,
              f.name AS faculty_name
       FROM exam_applications a
       LEFT JOIN academic_subjects sub ON sub.subject_id = a.subject_id
       LEFT JOIN users f ON f.user_id = a.assigned_faculty_user_id
       WHERE a.tenant_id = $1 AND a.student_user_id = $2
       ORDER BY a.created_at DESC`,
      [tenantId, studentUserId],
    );
  }

  async createApplication(
    tenantId: string | undefined,
    studentUserId: string,
    dto: CreateExamApplicationDto,
  ): Promise<ExamApplication> {
    this.requireTenant(tenantId);
    if (dto.application_type === 'BACKLOG') {
      throw new BadRequestException(
        'Apply through an available backlog or supplementary examination offering',
      );
    }
    const student = await this.users.findOne({
      where: { user_id: studentUserId, tenant_id: tenantId },
    });
    if (!student)
      throw new ForbiddenException('Student account is not in this tenant');
    let demand: FeeDemand | undefined;
    const application = await this.db.transaction(async (manager) => {
      // Serialize repeated clicks for this student, including fee creation.
      await manager.query(
        `SELECT user_id FROM users WHERE user_id = $1 AND tenant_id = $2 FOR UPDATE`,
        [studentUserId, tenantId],
      );
      const duplicate = await manager.query<
        Array<{ exam_application_id: string }>
      >(
        `SELECT exam_application_id FROM exam_applications
         WHERE tenant_id = $1 AND student_user_id = $2 AND subject_id = $3
           AND application_type = $4 AND status NOT IN ('COMPLETED', 'REJECTED')
         LIMIT 1`,
        [tenantId, studentUserId, dto.subject_id, dto.application_type],
      );
      if (duplicate[0])
        throw new ConflictException(
          'An active application already exists for this subject',
        );
      const subject = await manager.query<Array<Record<string, unknown>>>(
        `SELECT 1
       FROM student_course_enrollments e
       JOIN academic_courses c ON c.course_id = e.course_id AND c.tenant_id = e.tenant_id
       JOIN academic_subjects s ON s.subject_code = c.course_code AND s.subject_id = $3
         AND s.semester = e.semester
       WHERE e.tenant_id = $1 AND e.student_user_id = $2
       LIMIT 1`,
        [tenantId, studentUserId, dto.subject_id],
      );
      if (!subject[0]) throw new NotFoundException('Subject not found');
      const source =
        dto.application_type === 'RE_EVALUATION'
          ? await resolveReEvaluationSource(manager, tenantId, {
              student_user_id: studentUserId,
              subject_id: dto.subject_id,
              source_result_id: dto.source_result_id,
              source_session_id: dto.source_session_id,
            })
          : null;
      if (dto.application_type === 'RE_EVALUATION' && !source) {
        // Reject unsupported or ambiguous examinations before charging the student.
        throw new BadRequestException('Select a published examination result');
      }
      const applications = manager.getRepository(ExamApplication);
      const created = applications.create({
        tenant_id: tenantId,
        student_user_id: studentUserId,
        subject_id: dto.subject_id,
        application_type: dto.application_type,
        fee_status: 'PENDING',
        status: dto.application_type === 'RE_EVALUATION' ? 'DRAFT' : 'PENDING',
        source_result_id: source?.result_id ?? null,
        source_session_id: source?.session_id ?? null,
        source_mark_id: source?.mark_id ?? null,
      });

      if (dto.application_type === 'RE_EVALUATION') {
        const academicYear = this.getAcademicYear();
        const dueDate = this.addDays(new Date(), 3).toISOString().slice(0, 10);
        demand = await this.finance.createDemand(
          {
            student_user_id: studentUserId,
            fee_head: 'RE_EVALUATION',
            academic_year: academicYear,
            total_amount: 500,
            due_date: dueDate,
          },
          tenantId,
          { manager, notify: false },
        );
        created.finance_demand_id = demand.demand_id;
      }
      const saved = await applications.save(created);
      await new ExamCellAuditService(this.db).log(
        tenantId,
        studentUserId,
        {
          action: 'EXAM_APPLICATION_CREATED',
          resource_type: 'exam_application',
          resource_id: saved.exam_application_id,
          new_value: {
            application_type: saved.application_type,
            subject_id: saved.subject_id,
            source_result_id: saved.source_result_id,
            source_session_id: saved.source_session_id,
            status: saved.status,
          },
        },
        manager,
      );
      return saved;
    });
    if (demand) this.finance.notifyDemandGenerated(demand, tenantId);
    return application;
  }

  async listReEvaluationSources(
    tenantId: string | undefined,
    studentUserId: string,
  ) {
    this.requireTenant(tenantId);
    const student = await this.users.findOne({
      where: { user_id: studentUserId, tenant_id: tenantId },
    });
    if (!student)
      throw new ForbiddenException('Student account is not in this tenant');
    return listReEvaluationSources(this.db, tenantId, studentUserId);
  }

  /**
   * Smoke-seed fee heads (e.g. SMOKE-FEE-2026-001) must not block hall tickets
   * during local demos. Production stays strict unless the head is clearly smoke.
   */
  private isNonBlockingSmokeFee(feeHead: string): boolean {
    return (
      this.isAdmitCardDemoBypassEnabled() &&
      /^SMOKE([\s_-]|$)/i.test(String(feeHead ?? '').trim())
    );
  }

  /** Local/demo: unlock admit card when smoke dues / seed attendance would otherwise lock it. */
  private isAdmitCardDemoBypassEnabled(): boolean {
    return (
      process.env.NODE_ENV === 'development' &&
      process.env.FALCON_LOCAL_EXAM_DEMO === 'true' &&
      process.env.STRICT_ADMIT_CARD_ELIGIBILITY !== 'true'
    );
  }

  async checkEligibility(
    tenantId: string | undefined,
    studentUserId: string,
  ): Promise<ExamEligibilityResult> {
    this.requireTenant(tenantId);
    const student = await this.users.findOne({
      where: { user_id: studentUserId, tenant_id: tenantId },
    });
    if (!student)
      throw new ForbiddenException('Student account is not in this tenant');

    const [attendance, pendingDues, ufm] = await Promise.all([
      this.attendanceEligibility.evaluate(tenantId, studentUserId, {
        context: 'EXAM_DESK',
      }),
      this.finance.getPendingDues(studentUserId, tenantId),
      this.db.query(
        `SELECT COUNT(*)::int AS c FROM ufm_cases
         WHERE tenant_id = $1 AND student_user_id = $2 AND status != 'CLOSED'`,
        [tenantId, studentUserId],
      ),
    ]);

    const blockingDues = pendingDues.filter(
      (d) => !this.isNonBlockingSmokeFee(String(d.fee_head ?? '')),
    );

    const reasons: ExamEligibilityResult['reasons'] = [];

    if ((ufm[0]?.c ?? 0) > 0) {
      reasons.push({
        code: 'OPEN_UFM_CASE',
        message: 'Blocked: Open UFM case',
      });
    }

    if (!attendance.eligible && attendance.reason) {
      reasons.push({
        code: 'ATTENDANCE_SHORTFALL',
        message: 'Blocked: Attendance Shortfall',
        details: {
          attendance_percent: attendance.attendance_percent,
          min_required: attendance.effective_threshold,
        },
      });
    }

    if (blockingDues.length > 0) {
      reasons.push({
        code: 'PENDING_FEE_DUES',
        message: 'Blocked: Pending Fee Dues',
        details: blockingDues.map((d) => ({
          demand_id: d.demand_id,
          fee_head: d.fee_head,
          due_date: d.due_date,
          outstanding: Number(d.total_amount) - Number(d.paid_amount),
          status: d.status,
        })),
      });
    }

    const demoBypass =
      this.isAdmitCardDemoBypassEnabled() &&
      reasons.length > 0 &&
      (ufm[0]?.c ?? 0) === 0;

    return {
      eligible: reasons.length === 0 || demoBypass,
      attendance_percent: demoBypass
        ? Math.max(
            attendance.attendance_percent,
            attendance.effective_threshold,
          )
        : attendance.attendance_percent,
      min_required: attendance.effective_threshold,
      exempted: attendance.threshold_source === 'EXEMPTION',
      reasons: demoBypass ? [] : reasons,
    };
  }

  private parseVenue(venue: string | null | undefined): {
    building: string;
    room: string;
  } {
    const raw = String(venue ?? '').trim();
    if (!raw) return { building: '-', room: '-' };
    const parts = raw
      .split(/\s*[—–-]\s*/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      return { building: parts[0], room: parts.slice(1).join(' - ') };
    }
    const labOrRoom = raw.match(/^(Lab|Room)\s+(.+)$/i);
    if (labOrRoom) return { building: labOrRoom[1], room: labOrRoom[2] };
    return { building: raw, room: '-' };
  }

  private isoPlus(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  /** Full timetable rows for the hall ticket (subject + venue split). */
  private async listAdmitCardExams(
    tenantId: string,
    studentUserId: string,
  ): Promise<AdmitCardExamRow[]> {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await this.db.query(
      `SELECT es.exam_schedule_id, es.exam_date::text AS exam_date,
                es.start_time::text AS start_time,
                es.end_time::text AS end_time,
                es.exam_type,
                es.venue,
                es.seat_no,
                COALESCE(sub.subject_code, c.course_code, 'SUB') AS subject_code,
                COALESCE(sub.subject_name, c.course_name, 'Examination') AS subject_name
         FROM exam_schedules es
         LEFT JOIN academic_subjects sub ON sub.subject_id = es.subject_id
         LEFT JOIN academic_courses c ON c.course_code = sub.subject_code AND c.tenant_id = es.tenant_id
         WHERE es.tenant_id = $1 AND es.exam_date >= $2::date
           AND EXISTS (
             SELECT 1
             FROM student_course_enrollments e
             JOIN academic_courses c ON c.course_id = e.course_id AND c.tenant_id = e.tenant_id
             JOIN academic_subjects enrolled_subject ON enrolled_subject.subject_code = c.course_code
             WHERE e.tenant_id = es.tenant_id
               AND e.student_user_id = $3
               AND enrolled_subject.subject_id = es.subject_id
           )
         ORDER BY es.exam_date ASC, es.start_time ASC`,
      [tenantId, today, studentUserId],
    );

    if (Array.isArray(rows) && rows.length > 0) {
      return rows.map(
        (r: {
          exam_schedule_id: string;
          exam_date: string;
          start_time: string;
          end_time: string;
          exam_type: string;
          venue: string;
          seat_no?: string | null;
          subject_code: string;
          subject_name: string;
        }) => {
          const venue = this.parseVenue(r.venue);
          return {
            exam_schedule_id: r.exam_schedule_id,
            exam_date: String(r.exam_date).slice(0, 10),
            start_time: String(r.start_time).slice(0, 8),
            end_time: String(r.end_time).slice(0, 8),
            exam_type: String(r.exam_type ?? 'END_TERM'),
            subject_code: String(r.subject_code ?? 'SUB'),
            subject_name: String(r.subject_name ?? 'Examination'),
            building: venue.building,
            room: venue.room,
            seat_no: r.seat_no ?? null,
          };
        },
      );
    }

    // Demo/local: when no live schedules exist, still issue a complete hall ticket.
    if (!this.isAdmitCardDemoBypassEnabled()) return [];

    const demo: Array<{
      days: number;
      start: string;
      end: string;
      type: string;
      code: string;
      name: string;
      venue: string;
    }> = [
      {
        days: 8,
        start: '09:30',
        end: '11:00',
        type: 'MID_TERM',
        code: 'CSE501',
        name: 'Design & Analysis of Algorithms',
        venue: 'Block C — Hall A',
      },
      {
        days: 9,
        start: '09:30',
        end: '11:00',
        type: 'MID_TERM',
        code: 'CSE502',
        name: 'Operating Systems',
        venue: 'Block A — Hall B',
      },
      {
        days: 18,
        start: '10:00',
        end: '13:00',
        type: 'PRACTICAL',
        code: 'CSE507',
        name: 'OS Laboratory',
        venue: 'Block D — Lab 204',
      },
      {
        days: 19,
        start: '10:00',
        end: '13:00',
        type: 'PRACTICAL',
        code: 'CSE508',
        name: 'DBMS Laboratory',
        venue: 'Block B — Lab 105',
      },
      {
        days: 45,
        start: '09:30',
        end: '12:30',
        type: 'END_TERM',
        code: 'CSE503',
        name: 'Database Management Systems',
        venue: 'Main Campus — Exam Hall',
      },
      {
        days: 47,
        start: '14:00',
        end: '17:00',
        type: 'END_TERM',
        code: 'CSE505',
        name: 'Machine Learning',
        venue: 'Block B — Hall D',
      },
    ];

    return demo.map((ex) => {
      const venue = this.parseVenue(ex.venue);
      return {
        exam_date: this.isoPlus(ex.days),
        start_time: ex.start,
        end_time: ex.end,
        exam_type: ex.type,
        subject_code: ex.code,
        subject_name: ex.name,
        building: venue.building,
        room: venue.room,
        seat_no: null,
      };
    });
  }

  private async loadAdmitCardStudent(tenantId: string, studentUserId: string) {
    const rows = await this.db
      .query(
        `SELECT u.user_id, u.name, u.official_email AS email,
                sp.enrollment_number, sp.enrollment_no, sp.admission_number,
                sp.batch, sp.section_code, sp.current_semester, sp.profile_photo_url,
                d.dept_name AS department
         FROM users u
         LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
         LEFT JOIN departments d ON d.dept_id = u.dept_id
         WHERE u.user_id = $1 AND u.tenant_id = $2
         LIMIT 1`,
        [studentUserId, tenantId],
      )
      .catch(() => []);

    const row = rows[0] as
      | {
          user_id: string;
          name: string;
          email: string;
          enrollment_number?: string | null;
          enrollment_no?: string | null;
          admission_number?: string | null;
          batch?: string | null;
          section_code?: string | null;
          current_semester?: number | null;
          profile_photo_url?: string | null;
          department?: string | null;
        }
      | undefined;

    if (!row) {
      throw new NotFoundException('Student profile not found');
    }

    const enrollment =
      row.enrollment_number ??
      row.enrollment_no ??
      row.admission_number ??
      null;

    return {
      user_id: studentUserId,
      name: row.name,
      email: row.email,
      enrollment_no: enrollment,
      program: row.department || 'Undergraduate Program',
      department: row.department || null,
      semester:
        row.current_semester != null ? Number(row.current_semester) : null,
      section: row.section_code || null,
      batch: row.batch || null,
      academic_year: this.getAcademicYear(),
      profile_picture_url: row.profile_photo_url ?? null,
    };
  }

  async generateAdmitCardOrThrow(
    tenantId: string | undefined,
    studentUserId?: string,
  ): Promise<Buffer> {
    this.requireTenant(tenantId);
    if (!studentUserId) {
      throw new ForbiddenException('Tenant and student identity are required');
    }
    const eligibility = await this.checkEligibility(tenantId, studentUserId);
    if (!eligibility.eligible) {
      const top = eligibility.reasons[0];
      throw new ForbiddenException(top?.message ?? 'Blocked');
    }

    const [student, exams] = await Promise.all([
      this.loadAdmitCardStudent(tenantId, studentUserId),
      this.listAdmitCardExams(tenantId, studentUserId),
    ]);

    if (!exams.length)
      throw new BadRequestException(
        'No scheduled examinations found for your enrolled subjects',
      );

    const issue = await new HallTicketVerificationService(this.db).issue(
      tenantId,
      studentUserId,
      exams
        .map((exam) => exam.exam_schedule_id)
        .filter((id): id is string => Boolean(id)),
    );

    return this.pdf.generate({
      student,
      exams,
      barcodePayload: issue.payload,
    });
  }

  private getAcademicYear(now = new Date()): string {
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const startYear = month >= 7 ? year : year - 1;
    return `${startYear}-${String(startYear + 1).slice(-2)}`;
  }

  private addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  private requireTenant(
    tenantId: string | undefined,
  ): asserts tenantId is string {
    if (!tenantId?.trim()) {
      throw new ForbiddenException('Tenant context is required');
    }
  }
}
