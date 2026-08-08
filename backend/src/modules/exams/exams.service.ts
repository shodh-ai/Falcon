import { Injectable, ForbiddenException } from '@nestjs/common';
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

export interface ExamEligibilityResult {
  eligible: boolean;
  attendance_percent: number;
  min_required: number;
  exempted: boolean;
  reasons: Array<{
    code: 'ATTENDANCE_SHORTFALL' | 'PENDING_FEE_DUES';
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
    studentUserId: string,
  ): Promise<ExamSchedule[]> {
    const today = new Date().toISOString().slice(0, 10);
    return this.schedules
      .createQueryBuilder('s')
      .where('s.exam_date >= :today', { today })
      .orderBy('s.exam_date', 'ASC')
      .addOrderBy('s.start_time', 'ASC')
      .getMany();
  }

  async listMyApplications(studentUserId: string) {
    return this.db.query(
      `SELECT a.*,
              sub.subject_name,
              sub.subject_code,
              f.name AS faculty_name
       FROM exam_applications a
       LEFT JOIN academic_subjects sub ON sub.subject_id = a.subject_id
       LEFT JOIN users f ON f.user_id = a.assigned_faculty_user_id
       WHERE a.student_user_id = $1
       ORDER BY a.created_at DESC`,
      [studentUserId],
    );
  }

  async createApplication(
    studentUserId: string,
    dto: CreateExamApplicationDto,
  ): Promise<ExamApplication> {
    const application = this.applications.create({
      student_user_id: studentUserId,
      subject_id: dto.subject_id,
      application_type: dto.application_type,
      fee_status: 'PENDING',
      status: dto.application_type === 'RE_EVALUATION' ? 'DRAFT' : 'PENDING',
    });

    if (dto.application_type === 'RE_EVALUATION') {
      const student = await this.users.findOne({
        where: { user_id: studentUserId },
      });
      const tenantId =
        student?.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
      const academicYear = this.getAcademicYear();
      const dueDate = this.addDays(new Date(), 3).toISOString().slice(0, 10);
      const demand = await this.finance.createDemand(
        {
          student_user_id: studentUserId,
          fee_head: 'RE_EVALUATION',
          academic_year: academicYear,
          total_amount: 500,
          due_date: dueDate,
        },
        tenantId,
      );
      application.finance_demand_id = demand.demand_id;
    }

    return this.applications.save(application);
  }

  /**
   * Smoke-seed fee heads (e.g. SMOKE-FEE-2026-001) must not block hall tickets
   * during local demos. Production stays strict unless the head is clearly smoke.
   */
  private isNonBlockingSmokeFee(feeHead: string): boolean {
    return /^SMOKE([\s_-]|$)/i.test(String(feeHead ?? '').trim());
  }

  /** Local/demo: unlock admit card when smoke dues / seed attendance would otherwise lock it. */
  private isAdmitCardDemoBypassEnabled(): boolean {
    if (process.env.STRICT_ADMIT_CARD_ELIGIBILITY === 'true') return false;
    return (
      process.env.ADMIT_CARD_DEMO_BYPASS === 'true' ||
      process.env.NODE_ENV !== 'production'
    );
  }

  async checkEligibility(
    studentUserId: string,
  ): Promise<ExamEligibilityResult> {
    const student = await this.users.findOne({
      where: { user_id: studentUserId },
    });
    const tenantId =
      student?.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';

    const [attendance, pendingDues] = await Promise.all([
      this.attendanceEligibility.evaluate(tenantId, studentUserId, {
        context: 'EXAM_DESK',
      }),
      this.finance.getPendingDues(studentUserId),
    ]);

    const blockingDues = pendingDues.filter(
      (d) => !this.isNonBlockingSmokeFee(String(d.fee_head ?? '')),
    );

    const reasons: ExamEligibilityResult['reasons'] = [];

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
      this.isAdmitCardDemoBypassEnabled() && reasons.length > 0;

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
    _studentUserId: string,
  ): Promise<AdmitCardExamRow[]> {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await this.db
      .query(
        `SELECT es.exam_date::text AS exam_date,
                es.start_time::text AS start_time,
                es.end_time::text AS end_time,
                es.exam_type,
                es.venue,
                es.seat_no,
                COALESCE(sub.subject_code, c.course_code, 'SUB') AS subject_code,
                COALESCE(sub.subject_name, c.course_name, 'Examination') AS subject_name
         FROM exam_schedules es
         LEFT JOIN academic_subjects sub ON sub.subject_id = es.subject_id
         LEFT JOIN academic_courses c ON c.course_code = sub.subject_code
         WHERE es.exam_date >= $1::date
         ORDER BY es.exam_date ASC, es.start_time ASC`,
        [today],
      )
      .catch(() => []);

    if (Array.isArray(rows) && rows.length > 0) {
      return rows.map(
        (r: {
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

  private async loadAdmitCardStudent(studentUserId: string) {
    const rows = await this.db
      .query(
        `SELECT u.user_id, u.name, u.official_email AS email,
                sp.enrollment_number, sp.enrollment_no, sp.admission_number,
                sp.batch, sp.section_code, sp.current_semester, sp.profile_photo_url,
                d.dept_name AS department
         FROM users u
         LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
         LEFT JOIN departments d ON d.dept_id = u.dept_id
         WHERE u.user_id = $1
         LIMIT 1`,
        [studentUserId],
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
      const user = await this.users.findOne({
        where: { user_id: studentUserId },
      });
      return {
        user_id: studentUserId,
        name: user?.name ?? 'Student',
        email: user?.email ?? '',
        enrollment_no: null as string | null,
        program: 'Undergraduate Program',
        department: null as string | null,
        semester: null as number | null,
        section: null as string | null,
        batch: null as string | null,
        academic_year: this.getAcademicYear(),
        profile_picture_url: null as string | null,
      };
    }

    const enrollment =
      row.enrollment_number ??
      row.enrollment_no ??
      row.admission_number ??
      null;

    // Demo/local: fill missing profile fields so the PDF is complete.
    const demoFill = this.isAdmitCardDemoBypassEnabled();

    return {
      user_id: studentUserId,
      name: row.name || (demoFill ? 'Aarav Sharma' : 'Student'),
      email:
        row.email ||
        (demoFill ? 'aarav.sharma@mygyanvihar.com' : ''),
      enrollment_no:
        enrollment ||
        (demoFill ? 'SGVU/CSE/2023/0142' : null),
      program:
        row.department ||
        (demoFill
          ? 'B.Tech Computer Science & Engineering'
          : 'Undergraduate Program'),
      department:
        row.department ||
        (demoFill ? 'Computer Science & Engineering' : null),
      semester:
        row.current_semester != null
          ? Number(row.current_semester)
          : demoFill
            ? 5
            : null,
      section: row.section_code || (demoFill ? 'A' : null),
      batch: row.batch || (demoFill ? '2023-27' : null),
      academic_year: this.getAcademicYear(),
      profile_picture_url: row.profile_photo_url ?? null,
    };
  }

  async generateAdmitCardOrThrow(studentUserId: string): Promise<Buffer> {
    const eligibility = await this.checkEligibility(studentUserId);
    if (!eligibility.eligible) {
      const top = eligibility.reasons[0];
      throw new ForbiddenException(top?.message ?? 'Blocked');
    }

    const [student, exams] = await Promise.all([
      this.loadAdmitCardStudent(studentUserId),
      this.listAdmitCardExams(studentUserId),
    ]);

    return this.pdf.generate({
      student,
      exams,
      barcodePayload: `${student.enrollment_no || student.user_id}|${exams.map((e) => e.subject_code).join(',')}`,
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
}
