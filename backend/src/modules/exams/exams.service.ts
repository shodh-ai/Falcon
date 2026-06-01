import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExamSchedule } from '../../entities/exam-schedule.entity';
import { ExamApplication } from '../../entities/exam-application.entity';
import { AttendanceRecord } from '../../entities/attendance-record.entity';
import { User } from '../../entities/user.entity';
import { FinanceService } from '../finance/finance.service';
import { CreateExamApplicationDto } from './dto/create-exam-application.dto';
import { AdmitCardPdfService } from './pdf/admit-card-pdf.service';

export interface ExamEligibilityResult {
  eligible: boolean;
  attendance_percent: number;
  reasons: Array<{ code: 'ATTENDANCE_SHORTFALL' | 'PENDING_FEE_DUES'; message: string; details?: unknown }>;
}

@Injectable()
export class ExamsService {
  constructor(
    @InjectRepository(ExamSchedule) private schedules: Repository<ExamSchedule>,
    @InjectRepository(ExamApplication) private applications: Repository<ExamApplication>,
    @InjectRepository(AttendanceRecord) private attendanceRepo: Repository<AttendanceRecord>,
    @InjectRepository(User) private users: Repository<User>,
    private readonly finance: FinanceService,
    private readonly pdf: AdmitCardPdfService,
  ) {}

  async listUpcomingSchedulesForStudent(studentUserId: string): Promise<ExamSchedule[]> {
    const today = new Date().toISOString().slice(0, 10);
    return this.schedules
      .createQueryBuilder('s')
      .where('s.exam_date >= :today', { today })
      .orderBy('s.exam_date', 'ASC')
      .addOrderBy('s.start_time', 'ASC')
      .getMany();
  }

  async listMyApplications(studentUserId: string): Promise<ExamApplication[]> {
    return this.applications.find({ where: { student_user_id: studentUserId }, order: { created_at: 'DESC' } });
  }

  async createApplication(studentUserId: string, dto: CreateExamApplicationDto): Promise<ExamApplication> {
    const application = this.applications.create({
      student_user_id: studentUserId,
      subject_id: dto.subject_id,
      application_type: dto.application_type,
      fee_status: 'PENDING',
      status: 'PENDING',
    });

    if (dto.application_type === 'RE_EVALUATION') {
      const academicYear = this.getAcademicYear();
      const dueDate = this.addDays(new Date(), 3).toISOString().slice(0, 10);
      const demand = await this.finance.createDemand({
        student_user_id: studentUserId,
        fee_head: 'RE_EVALUATION',
        academic_year: academicYear,
        semester: null,
        total_amount: 500,
        paid_amount: 0,
        due_date: dueDate,
        status: 'PENDING',
        fee_breakup: { subject_id: dto.subject_id, type: 'RE_EVALUATION' },
      } as any);
      application.finance_demand_id = demand.demand_id;
    }

    return this.applications.save(application);
  }

  async checkEligibility(studentUserId: string): Promise<ExamEligibilityResult> {
    const [attendancePercent, pendingDues] = await Promise.all([
      this.getOverallAttendancePercent(studentUserId),
      this.finance.getPendingDues(studentUserId),
    ]);

    const reasons: ExamEligibilityResult['reasons'] = [];

    if (attendancePercent < 75) {
      reasons.push({
        code: 'ATTENDANCE_SHORTFALL',
        message: 'Blocked: Attendance Shortfall',
        details: { attendance_percent: attendancePercent, min_required: 75 },
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
      attendance_percent: attendancePercent,
      reasons,
    };
  }

  async generateAdmitCardOrThrow(studentUserId: string): Promise<Buffer> {
    const eligibility = await this.checkEligibility(studentUserId);
    if (!eligibility.eligible) {
      const top = eligibility.reasons[0];
      throw new ForbiddenException(top?.message ?? 'Blocked');
    }

    const user = await this.users.findOne({ where: { user_id: studentUserId } });
    const schedules = await this.listUpcomingSchedulesForStudent(studentUserId);

    return this.pdf.generate({
      student: {
        user_id: studentUserId,
        name: user?.name ?? 'Student',
        email: user?.email ?? '',
      },
      schedules,
    });
  }

  private async getOverallAttendancePercent(studentUserId: string): Promise<number> {
    const rows = await this.attendanceRepo.find({ where: { student_user_id: studentUserId } });
    if (rows.length === 0) return 0;
    const attended = rows.filter((a) => a.status === 'PRESENT' || a.status === 'LATE').length;
    return Math.round((attended / rows.length) * 100);
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
