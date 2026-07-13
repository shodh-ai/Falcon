import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ExamSchedule } from '../../entities/exam-schedule.entity';
import { ExamApplication } from '../../entities/exam-application.entity';
import { User } from '../../entities/user.entity';
import { FinanceService } from '../finance/finance.service';
import { CreateExamApplicationDto } from './dto/create-exam-application.dto';
import { AdmitCardPdfService } from './pdf/admit-card-pdf.service';
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

    if (pendingDues.length > 0) {
      reasons.push({
        code: 'PENDING_FEE_DUES',
        message: 'Blocked: Pending Fee Dues',
        details: pendingDues.map((d) => ({
          demand_id: d.demand_id,
          fee_head: d.fee_head,
          due_date: d.due_date,
          outstanding: Number(d.total_amount) - Number(d.paid_amount),
          status: d.status,
        })),
      });
    }

    return {
      eligible: reasons.length === 0,
      attendance_percent: attendance.attendance_percent,
      min_required: attendance.effective_threshold,
      exempted: attendance.threshold_source === 'EXEMPTION',
      reasons,
    };
  }

  async generateAdmitCardOrThrow(studentUserId: string): Promise<Buffer> {
    const eligibility = await this.checkEligibility(studentUserId);
    if (!eligibility.eligible) {
      const top = eligibility.reasons[0];
      throw new ForbiddenException(top?.message ?? 'Blocked');
    }

    const user = await this.users.findOne({
      where: { user_id: studentUserId },
    });

    const profileRows = await this.db.query(
      `SELECT profile_photo_url FROM student_profiles WHERE user_id = $1 LIMIT 1`,
      [studentUserId],
    );
    const profile_picture_url = profileRows[0]?.profile_photo_url ?? null;

    const fs = require('fs');
    fs.appendFileSync(
      'admit-card-debug.log',
      `[DEBUG] generateAdmitCardOrThrow called for user ${studentUserId}. Photo URL length: ${profile_picture_url?.length || 0}. URL start: ${profile_picture_url?.substring(0, 30)}\n`,
    );

    const schedules = await this.listUpcomingSchedulesForStudent(studentUserId);

    return this.pdf.generate({
      student: {
        user_id: studentUserId,
        name: user?.name ?? 'Student',
        email: user?.email ?? '',
        profile_picture_url,
      },
      schedules,
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
