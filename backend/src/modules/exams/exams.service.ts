import {
  BadRequestException,
  Injectable,
  ForbiddenException,
  ServiceUnavailableException,
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
import { requireTenantId } from '../../common/utils/require-tenant-id';
import { IssuedHallTicketService } from './issued-hall-ticket.service';

export interface ExamEligibilityResult {
  eligible: boolean;
  attendance_percent: number;
  min_required: number;
  exempted: boolean;
  finance_status: 'NO_OUTSTANDING_DEMANDS' | 'UNVERIFIED' | 'NOT_CHECKED';
  reasons: Array<{
    code: 'ATTENDANCE_SHORTFALL' | 'FINANCE_UNVERIFIED';
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
    private readonly issuedTickets?: IssuedHallTicketService,
  ) {}

  async listUpcomingSchedulesForStudent(
    studentUserId: string,
    tenantId: string,
    semester?: number,
  ): Promise<ExamSchedule[]> {
    if (
      semester !== undefined &&
      (!Number.isSafeInteger(semester) || semester <= 0)
    ) {
      throw new BadRequestException('Semester must be a positive integer');
    }
    const today = new Date().toISOString().slice(0, 10);
    return this.schedules
      .createQueryBuilder('s')
      .where(
        's.exam_date >= :today AND s.deleted_at IS NULL AND s.status = :released',
        { today, released: 'RELEASED' },
      )
      .andWhere(
        `s.session_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM exam_sessions released_session
          WHERE released_session.session_id = s.session_id
            AND released_session.tenant_id = s.tenant_id
        ) AND EXISTS (
          SELECT 1 FROM exam_audit_logs timetable_release
          WHERE timetable_release.tenant_id = s.tenant_id
            AND timetable_release.resource_type = 'exam_session'
            AND timetable_release.resource_id = s.session_id::text
            AND timetable_release.action = 'EXAM_TIMETABLE_RELEASED'
            AND timetable_release.new_value @> jsonb_build_array(
              jsonb_build_object('exam_schedule_id', s.exam_schedule_id, 'status', 'RELEASED')
            )
        )`,
      )
      .andWhere('s.tenant_id = :tenantId', {
        tenantId: requireTenantId(tenantId),
      })
      .andWhere(
        `EXISTS (
        SELECT 1 FROM academic_subjects sub
        JOIN academic_courses c ON (c.course_code = sub.subject_code OR c.course_name ILIKE sub.subject_name) AND c.tenant_id = :tenantId
        JOIN student_course_enrollments e ON e.course_id = c.course_id AND e.tenant_id = :tenantId
        WHERE sub.subject_id = s.subject_id AND e.student_user_id = :studentUserId AND e.status = 'ENROLLED' AND e.deleted_at IS NULL
        ${semester === undefined ? '' : 'AND e.semester = :semester'}
      )`,
        { studentUserId, ...(semester === undefined ? {} : { semester }) },
      )
      .orderBy('s.exam_date', 'ASC')
      .addOrderBy('s.start_time', 'ASC')
      .getMany();
  }

  async listMyApplications(studentUserId: string, tenantId: string) {
    return this.db.query<
      Array<
        ExamApplication & {
          subject_name: string | null;
          subject_code: string | null;
          faculty_name: string | null;
        }
      >
    >(
      `SELECT a.*,
              sub.subject_name,
              sub.subject_code,
              f.name AS faculty_name
       FROM exam_applications a
       LEFT JOIN academic_subjects sub ON sub.subject_id = a.subject_id
       LEFT JOIN users f ON f.user_id = a.assigned_faculty_user_id
       JOIN users u ON u.user_id = a.student_user_id AND u.tenant_id = $2
       WHERE a.student_user_id = $1
       ORDER BY a.created_at DESC`,
      [studentUserId, requireTenantId(tenantId)],
    );
  }

  async createApplication(
    studentUserId: string,
    dto: CreateExamApplicationDto,
    tenantId: string,
  ): Promise<ExamApplication> {
    const tid = requireTenantId(tenantId);
    const subjects = await this.db.query<Array<{ subject_id: number }>>(
      `SELECT sub.subject_id FROM academic_subjects sub
       JOIN academic_courses c ON (c.course_code = sub.subject_code OR c.course_name ILIKE sub.subject_name) AND c.tenant_id = $2
       JOIN student_course_enrollments e ON e.course_id = c.course_id AND e.tenant_id = $2
       WHERE sub.subject_id = $3 AND e.student_user_id = $1 AND e.deleted_at IS NULL
         AND e.status IN ('ENROLLED', 'COMPLETED', 'FAILED') LIMIT 1`,
      [studentUserId, tid, dto.subject_id],
    );
    if (!subjects[0])
      throw new ForbiddenException('Subject is not in your enrolled courses');
    const application = this.applications.create({
      student_user_id: studentUserId,
      subject_id: dto.subject_id,
      application_type: dto.application_type,
      fee_status: 'PENDING',
      status: dto.application_type === 'RE_EVALUATION' ? 'DRAFT' : 'PENDING',
    });

    if (dto.application_type === 'RE_EVALUATION') {
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
        tid,
      );
      application.finance_demand_id = demand.demand_id;
    }

    return this.applications.save(application);
  }

  /** Legacy local preview data only; never used to authorize clearance/download. */
  private isAdmitCardDemoBypassEnabled(): boolean {
    return (
      process.env.STRICT_ADMIT_CARD_ELIGIBILITY !== 'true' &&
      process.env.ADMIT_CARD_DEMO_BYPASS === 'true' &&
      process.env.NODE_ENV !== 'production'
    );
  }

  async checkEligibility(
    studentUserId: string,
    tenantId: string,
    issuedScope?: { semester: number; courseIds: string[] },
  ): Promise<ExamEligibilityResult> {
    const tid = requireTenantId(tenantId);

    const [attendance, pendingDues] = await Promise.all([
      this.attendanceEligibility.evaluate(tid, studentUserId, {
        context: issuedScope ? 'ADMIT_CARD' : 'EXAM_DESK',
        ...(issuedScope
          ? {
              strict: true,
              semester: issuedScope.semester,
              courseIds: issuedScope.courseIds,
            }
          : {}),
      }),
      // Finance returns every unpaid demand and has no authoritative
      // exam-blocking classification. New dues alone must not invalidate an
      // already-issued ticket; an authorized examination hold is a separate
      // workflow and is not inferred from a generic balance.
      issuedScope
        ? Promise.resolve([])
        : this.finance.getPendingDues(studentUserId, tid),
    ]);

    if (
      !Array.isArray(pendingDues) ||
      !attendance ||
      typeof attendance.eligible !== 'boolean' ||
      !Number.isFinite(attendance.attendance_percent) ||
      attendance.attendance_percent < 0 ||
      attendance.attendance_percent > 100 ||
      !Number.isFinite(attendance.effective_threshold) ||
      attendance.effective_threshold < 0 ||
      attendance.effective_threshold > 100
    )
      throw new ServiceUnavailableException(
        'Authoritative examination clearance is unavailable',
      );
    // Finance fee_head is free-form and the current schema has no official
    // exam-blocking designation. Do not label generic balances as a policy
    // violation; keep eligibility pending until Finance classifies them.
    const financeUnverified = !issuedScope && pendingDues.length > 0;

    const reasons: ExamEligibilityResult['reasons'] = [];

    if (!attendance.eligible) {
      reasons.push({
        code: 'ATTENDANCE_SHORTFALL',
        message: 'Blocked: Attendance Shortfall',
        details: {
          attendance_percent: attendance.attendance_percent,
          min_required: attendance.effective_threshold,
        },
      });
    }

    if (financeUnverified) {
      reasons.push({
        code: 'FINANCE_UNVERIFIED',
        message:
          'Finance records need review; no official examination-blocking fee classification is configured.',
      });
    }

    return {
      eligible: reasons.length === 0,
      attendance_percent: attendance.attendance_percent,
      min_required: attendance.effective_threshold,
      exempted: attendance.threshold_source === 'EXEMPTION',
      finance_status: issuedScope
        ? 'NOT_CHECKED'
        : financeUnverified
          ? 'UNVERIFIED'
          : 'NO_OUTSTANDING_DEMANDS',
      reasons,
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
    studentUserId: string,
    tenantId: string,
  ): Promise<AdmitCardExamRow[]> {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await this.db.query<
      Array<{
        exam_date: string;
        start_time: string;
        end_time: string;
        exam_type: string;
        venue: string;
        seat_no?: string | null;
        subject_code: string;
        subject_name: string;
      }>
    >(
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
         JOIN academic_courses c ON (c.course_code = sub.subject_code OR c.course_name ILIKE sub.subject_name) AND c.tenant_id = $2
         WHERE es.exam_date >= $1::date AND es.tenant_id = $2
           AND es.deleted_at IS NULL AND es.status = 'RELEASED'
           AND EXISTS (SELECT 1 FROM student_course_enrollments e
             WHERE e.course_id = c.course_id AND e.student_user_id = $3 AND e.tenant_id = $2 AND e.status = 'ENROLLED' AND e.deleted_at IS NULL)
         ORDER BY es.exam_date ASC, es.start_time ASC`,
      [today, tenantId, studentUserId],
    );

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

  private async loadAdmitCardStudent(studentUserId: string, tenantId: string) {
    const rows = await this.db.query<unknown[]>(
      `SELECT u.user_id, u.name, u.official_email AS email,
                sp.enrollment_number, sp.enrollment_no, sp.admission_number,
                sp.batch, sp.section_code, sp.current_semester, sp.profile_photo_url,
                d.dept_name AS department
         FROM users u
         LEFT JOIN student_profiles sp ON sp.user_id = u.user_id AND sp.tenant_id = u.tenant_id
         LEFT JOIN departments d ON d.dept_id = u.dept_id
         WHERE u.user_id = $1 AND u.tenant_id = $2
         LIMIT 1`,
      [studentUserId, tenantId],
    );

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
        where: { user_id: studentUserId, tenant_id: tenantId },
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
      email: row.email || (demoFill ? 'aarav.sharma@mygyanvihar.com' : ''),
      enrollment_no: enrollment || (demoFill ? 'SGVU/CSE/2023/0142' : null),
      program:
        row.department ||
        (demoFill
          ? 'B.Tech Computer Science & Engineering'
          : 'Undergraduate Program'),
      department:
        row.department || (demoFill ? 'Computer Science & Engineering' : null),
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

  async generateAdmitCardOrThrow(
    studentUserId: string,
    tenantId: string,
    entryId?: string,
  ): Promise<Buffer> {
    if (!this.issuedTickets)
      throw new ServiceUnavailableException(
        'Issued hall-ticket retrieval unavailable',
      );
    return this.issuedTickets.download(
      studentUserId,
      requireTenantId(tenantId),
      entryId,
      async (issuedScope) => {
        const eligibility = await this.checkEligibility(
          studentUserId,
          tenantId,
          issuedScope,
        );
        if (!eligibility.eligible)
          throw new ForbiddenException(
            eligibility.reasons[0]?.message ?? 'Blocked',
          );
      },
    );
  }

  listIssuedAdmitCards(studentUserId: string, tenantId: string) {
    if (!this.issuedTickets)
      throw new ServiceUnavailableException(
        'Issued hall-ticket retrieval unavailable',
      );
    return this.issuedTickets.list(studentUserId, requireTenantId(tenantId));
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
