import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThanOrEqual } from 'typeorm';
import { HrHoliday } from '../../entities/hr-holiday.entity';
import { HrDailyAttendance } from '../../entities/hr-daily-attendance.entity';
import { StaffLeaveRequest, StaffRequestType } from '../../entities/staff-leave-request.entity';
import { LeaveBalance } from '../../entities/leave-balance.entity';
import { StaffAttendance } from '../../entities/staff-attendance.entity';
import { User } from '../../entities/user.entity';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { WorkflowRoutingService } from '../../core/workflow/workflow-routing.service';
import { WorkflowNotificationService } from '../../core/workflow/workflow-notification.service';

const SHIFT_START_HOUR = 10;
const SHIFT_END_HOUR = 18;

export type ApplyWorkforceRequestDto = {
  request_type: StaffRequestType;
  leave_type?: string;
  start_date?: string;
  end_date?: string;
  regularization_date?: string;
  missed_punch_type?: 'IN' | 'OUT' | 'BOTH';
  reason?: string;
};

@Injectable()
export class HrWorkforceService {
  private readonly logger = new Logger(HrWorkforceService.name);

  constructor(
    @InjectRepository(HrHoliday) private readonly holidays: Repository<HrHoliday>,
    @InjectRepository(HrDailyAttendance) private readonly dailyAttendance: Repository<HrDailyAttendance>,
    @InjectRepository(StaffLeaveRequest) private readonly requests: Repository<StaffLeaveRequest>,
    @InjectRepository(LeaveBalance) private readonly balances: Repository<LeaveBalance>,
    @InjectRepository(StaffAttendance) private readonly legacyAttendance: Repository<StaffAttendance>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly notify: NotificationEmitterService,
    private readonly workflowRouting: WorkflowRoutingService,
    private readonly workflowNotify: WorkflowNotificationService,
  ) {}

  async getTodayWidget(userId: string) {
    const today = new Date().toISOString().slice(0, 10);
    const row = await this.dailyAttendance.findOne({ where: { user_id: userId, date: today } });
    const now = new Date();
    const shiftStart = new Date(`${today}T${String(SHIFT_START_HOUR).padStart(2, '0')}:00:00`);
    const shiftEnd = new Date(`${today}T${String(SHIFT_END_HOUR).padStart(2, '0')}:00:00`);
    const spanMs = shiftEnd.getTime() - shiftStart.getTime();
    const elapsedMs = Math.min(Math.max(now.getTime() - shiftStart.getTime(), 0), spanMs);
    const progressPercent = spanMs > 0 ? Math.round((elapsedMs / spanMs) * 100) : 0;

    const formatTime = (d: Date | null | undefined) =>
      d ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '--';

    const hours = row?.total_hours ? Number(row.total_hours) : this.computeHours(row?.first_in_time, row?.last_out_time);

    return {
      date: today,
      shift: { start: '10:00 AM', end: '06:00 PM', progress_percent: progressPercent },
      first_in: row?.first_in_time ?? null,
      last_out: row?.last_out_time ?? null,
      display: {
        in_time: formatTime(row?.first_in_time),
        out_time: formatTime(row?.last_out_time),
        hours_worked_today: hours > 0 ? this.formatHours(hours) : row?.first_in_time ? this.formatHours(hours) : '0:00',
      },
      status: row?.status ?? 'ABSENT',
      is_regularized: row?.is_regularized ?? false,
      read_only: true,
    };
  }

  listUpcomingHolidays(fromDate?: string) {
    const from = fromDate ?? new Date().toISOString().slice(0, 10);
    return this.holidays.find({
      where: { date: MoreThanOrEqual(from) },
      order: { date: 'ASC' },
      take: 30,
    });
  }

  async listHolidaysGrouped(fromDate?: string) {
    const rows = await this.listUpcomingHolidays(fromDate);
    return {
      mandatory: rows.filter((h) => h.type === 'MANDATORY'),
      restricted: rows.filter((h) => h.type === 'RESTRICTED'),
    };
  }

  async applyRequest(staffUserId: string, tenantId: string, dto: ApplyWorkforceRequestDto) {
    const staff = await this.users.findOne({ where: { user_id: staffUserId } });
    if (!staff) throw new NotFoundException('Employee not found');

    const requestType = dto.request_type;
    let startDate = dto.start_date;
    let endDate = dto.end_date;
    let leaveType = dto.leave_type ?? 'CL';

    if (requestType === 'REGULARIZATION') {
      if (!dto.regularization_date) {
        throw new BadRequestException('regularization_date is required');
      }
      startDate = dto.regularization_date;
      endDate = dto.regularization_date;
      leaveType = 'REGULARIZATION';
    } else if (requestType === 'ON_DUTY') {
      if (!startDate || !endDate) throw new BadRequestException('start_date and end_date are required for OD');
      leaveType = 'OD';
    } else if (requestType === 'COMP_OFF_CREDIT') {
      if (!startDate) throw new BadRequestException('start_date (worked date) is required for comp-off');
      endDate = startDate;
      leaveType = 'COMP_OFF';
    } else {
      if (!startDate || !endDate) throw new BadRequestException('start_date and end_date are required');
    }

    const row = this.requests.create({
      tenant_id: tenantId,
      staff_user_id: staffUserId,
      request_type: requestType,
      leave_type: leaveType,
      start_date: startDate!,
      end_date: endDate!,
      reason: dto.reason?.trim() ?? null,
      regularization_date: dto.regularization_date ?? null,
      missed_punch_type: dto.missed_punch_type ?? null,
      status: 'PENDING',
    });
    const saved = await this.requests.save(row);

    try {
      const approver = await this.workflowRouting.getReportingOfficer(staffUserId);
      const label = this.requestTypeLabel(requestType);
      this.workflowNotify.notifyApprover({
        tenantId,
        approver,
        title: `${label} pending your approval`,
        message: `${staff.name} submitted ${label} (${startDate}${endDate !== startDate ? ` – ${endDate}` : ''}).`,
        actionLink: '/faculty/team-requests',
        category: 'HR',
        requesterName: staff.name,
      });
    } catch {
      /* no reporting officer configured */
    }

    return saved;
  }

  listMyRequests(staffUserId: string, tenantId: string) {
    return this.requests.find({
      where: { staff_user_id: staffUserId, tenant_id: tenantId },
      order: { applied_at: 'DESC' },
    });
  }

  async listTeamPending(reportingOfficerId: string, tenantId: string, requestType?: StaffRequestType) {
    const reportees = await this.users.find({
      where: { tenant_id: tenantId, reporting_officer_id: reportingOfficerId, is_active: true },
    });
    const ids = reportees.map((u) => u.user_id);
    if (ids.length === 0) return [];

    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      staff_user_id: In(ids),
      status: 'PENDING',
    };
    if (requestType) where.request_type = requestType;

    const rows = await this.requests.find({
      where,
      relations: ['staff'],
      order: { applied_at: 'ASC' },
    });

    return rows.map((r) => ({
      leave_id: r.leave_id,
      request_type: r.request_type,
      leave_type: r.leave_type,
      start_date: r.start_date,
      end_date: r.end_date,
      regularization_date: r.regularization_date,
      missed_punch_type: r.missed_punch_type,
      reason: r.reason,
      status: r.status,
      applied_at: r.applied_at,
      employee: {
        user_id: r.staff_user_id,
        name: r.staff?.name ?? 'Employee',
        email: r.staff?.email ?? null,
      },
    }));
  }

  async actOnTeamRequest(
    reportingOfficerId: string,
    tenantId: string,
    leaveId: string,
    action: 'APPROVE' | 'REJECT',
    comment?: string,
  ) {
    const row = await this.requests.findOne({
      where: { leave_id: leaveId, tenant_id: tenantId },
      relations: ['staff'],
    });
    if (!row) throw new NotFoundException('Request not found');

    const staff = row.staff ?? (await this.users.findOne({ where: { user_id: row.staff_user_id } }));
    if (staff?.reporting_officer_id !== reportingOfficerId) {
      throw new ForbiddenException('Only the assigned reporting officer can act on this request');
    }
    if (row.status !== 'PENDING') {
      throw new BadRequestException('Request has already been processed');
    }

    if (action === 'REJECT') {
      row.status = 'REJECTED';
      const saved = await this.requests.save(row);
      this.notifyEmployeeDecision(staff, row, false, comment);
      return saved;
    }

    row.status = 'HR_APPROVED';
    const saved = await this.requests.save(row);

    await this.applyApprovalSideEffects(saved);

    this.notifyEmployeeDecision(staff, saved, true, comment);
    return saved;
  }

  /** Payroll: day counts as paid/present if biometric present, regularized, or approved OD. */
  async isPaidDay(userId: string, date: string): Promise<boolean> {
    const daily = await this.dailyAttendance.findOne({ where: { user_id: userId, date } });
    if (daily?.status === 'PRESENT' || daily?.is_regularized) return true;

    const od = await this.requests.findOne({
      where: {
        staff_user_id: userId,
        request_type: 'ON_DUTY',
        status: 'HR_APPROVED',
        start_date: date,
      },
    });
    if (od) return true;

    if (daily?.status === 'ABSENT' || !daily) {
      const odRange = await this.requests
        .createQueryBuilder('r')
        .where('r.staff_user_id = :userId', { userId })
        .andWhere('r.request_type = :type', { type: 'ON_DUTY' })
        .andWhere('r.status = :status', { status: 'HR_APPROVED' })
        .andWhere('r.start_date <= :date AND r.end_date >= :date', { date })
        .getOne();
      return Boolean(odRange);
    }

    return false;
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async syncBiometricAttendanceCron() {
    await this.syncFromBiometricSources();
  }

  async syncFromBiometricSources() {
    const today = new Date().toISOString().slice(0, 10);
    const legacyRows = await this.legacyAttendance.find({
      where: { work_date: today },
    });

    for (const leg of legacyRows) {
      await this.upsertDailyFromPunches(leg.user_id, leg.work_date, leg.check_in_at, leg.check_out_at);
    }

    this.logger.debug(`Biometric sync completed for ${legacyRows.length} legacy row(s) on ${today}`);
    return { synced: legacyRows.length, date: today };
  }

  async simulateBiometricPunch(
    userId: string,
    dto: { date?: string; action: 'IN' | 'OUT'; at?: string },
  ) {
    const date = dto.date ?? new Date().toISOString().slice(0, 10);
    const at = dto.at ? new Date(dto.at) : new Date();

    let row = await this.dailyAttendance.findOne({ where: { user_id: userId, date } });
    if (!row) {
      row = this.dailyAttendance.create({
        user_id: userId,
        date,
        status: 'ABSENT',
        is_regularized: false,
      });
    }

    if (dto.action === 'IN') {
      row.first_in_time = at;
      row.status = row.last_out_time ? 'PRESENT' : 'MISSED_PUNCH';
    } else {
      row.last_out_time = at;
      row.status = 'PRESENT';
    }
    row.total_hours = this.computeHours(row.first_in_time, row.last_out_time).toFixed(2);
    await this.dailyAttendance.save(row);

    let leg = await this.legacyAttendance.findOne({ where: { user_id: userId, work_date: date } });
    if (!leg) {
      leg = this.legacyAttendance.create({
        user_id: userId,
        work_date: date,
        source: 'BIOMETRIC',
        status: 'PRESENT',
      });
    }
    leg.check_in_at = row.first_in_time ?? leg.check_in_at;
    leg.check_out_at = row.last_out_time ?? leg.check_out_at;
    leg.source = 'BIOMETRIC';
    leg.status = 'PRESENT';
    await this.legacyAttendance.save(leg);

    return row;
  }

  private async applyApprovalSideEffects(row: StaffLeaveRequest) {
    if (row.request_type === 'REGULARIZATION' && row.regularization_date) {
      await this.regularizeDay(row.staff_user_id, row.regularization_date);
    } else if (row.request_type === 'ON_DUTY') {
      const dates = this.expandDates(row.start_date, row.end_date);
      for (const date of dates) {
        await this.markPresentForOd(row.staff_user_id, date);
      }
    } else if (row.request_type === 'COMP_OFF_CREDIT') {
      await this.creditCompOff(row.staff_user_id, 1);
    } else if (row.request_type === 'LEAVE') {
      await this.deductLeaveBalance(row);
    }
  }

  private async regularizeDay(userId: string, date: string) {
    let row = await this.dailyAttendance.findOne({ where: { user_id: userId, date } });
    if (!row) {
      row = this.dailyAttendance.create({ user_id: userId, date, status: 'ABSENT', is_regularized: false });
    }
    const baseIn = new Date(`${date}T10:00:00`);
    const baseOut = new Date(`${date}T18:00:00`);
    if (!row.first_in_time) row.first_in_time = baseIn;
    if (!row.last_out_time) row.last_out_time = baseOut;
    row.status = 'PRESENT';
    row.is_regularized = true;
    row.total_hours = this.computeHours(row.first_in_time, row.last_out_time).toFixed(2);
    await this.dailyAttendance.save(row);
  }

  private async markPresentForOd(userId: string, date: string) {
    let row = await this.dailyAttendance.findOne({ where: { user_id: userId, date } });
    if (!row) {
      row = this.dailyAttendance.create({ user_id: userId, date, status: 'ABSENT', is_regularized: false });
    }
    row.status = 'PRESENT';
    row.is_regularized = true;
    if (!row.first_in_time) row.first_in_time = new Date(`${date}T09:30:00`);
    if (!row.last_out_time) row.last_out_time = new Date(`${date}T17:30:00`);
    row.total_hours = this.computeHours(row.first_in_time, row.last_out_time).toFixed(2);
    await this.dailyAttendance.save(row);
  }

  private async creditCompOff(userId: string, days: number) {
    const year = new Date().getFullYear();
    let balance = await this.balances.findOne({
      where: { user_id: userId, leave_type: 'COMP_OFF', year },
    });
    if (!balance) {
      balance = this.balances.create({
        user_id: userId,
        leave_type: 'COMP_OFF',
        year,
        entitled: days,
        used: 0,
      });
    } else {
      balance.entitled = Number(balance.entitled) + days;
    }
    await this.balances.save(balance);
  }

  private async deductLeaveBalance(row: StaffLeaveRequest) {
    const year = new Date(row.start_date).getFullYear();
    const balance = await this.balances.findOne({
      where: { user_id: row.staff_user_id, leave_type: row.leave_type, year },
    });
    if (!balance) return;

    const days = this.expandDates(row.start_date, row.end_date).filter((d) => {
      const dow = new Date(d).getDay();
      return dow !== 0 && dow !== 6;
    }).length;

    balance.used = Number(balance.used) + days;
    await this.balances.save(balance);
  }

  private async upsertDailyFromPunches(
    userId: string,
    date: string,
    checkIn: Date | null,
    checkOut: Date | null,
  ) {
    let status: HrDailyAttendance['status'] = 'ABSENT';
    if (checkIn && checkOut) status = 'PRESENT';
    else if (checkIn) status = 'MISSED_PUNCH';

    const hours = this.computeHours(checkIn, checkOut);

    await this.dailyAttendance.upsert(
      {
        user_id: userId,
        date,
        first_in_time: checkIn,
        last_out_time: checkOut,
        total_hours: hours > 0 ? hours.toFixed(2) : null,
        status,
        is_regularized: false,
      },
      ['user_id', 'date'],
    );
  }

  private notifyEmployeeDecision(
    staff: User | null | undefined,
    row: StaffLeaveRequest,
    approved: boolean,
    comment?: string,
  ) {
    if (!staff?.tenant_id) return;
    const label = this.requestTypeLabel(row.request_type);
    this.notify.leaveApproved({
      tenantId: staff.tenant_id,
      userId: row.staff_user_id,
      title: approved ? `${label} approved` : `${label} rejected`,
      message: approved
        ? `Your ${label} request was approved.${comment ? ` Note: ${comment}` : ''}`
        : `Your ${label} request was rejected.${comment ? ` Reason: ${comment}` : ''}`,
      actionLink: '/faculty/hr',
      leaveType: row.leave_type,
      startDate: row.start_date,
      endDate: row.end_date,
    });
  }

  private requestTypeLabel(type: StaffRequestType) {
    switch (type) {
      case 'ON_DUTY':
        return 'On Duty (OD)';
      case 'REGULARIZATION':
        return 'Attendance regularization';
      case 'COMP_OFF_CREDIT':
        return 'Comp-off credit';
      default:
        return 'Leave';
    }
  }

  private expandDates(start: string, end: string): string[] {
    const dates: string[] = [];
    const cursor = new Date(start);
    const last = new Date(end);
    while (cursor <= last) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  }

  private computeHours(checkIn?: Date | null, checkOut?: Date | null): number {
    if (!checkIn) return 0;
    const out = checkOut ?? new Date();
    return Math.max(0, (out.getTime() - checkIn.getTime()) / 36e5);
  }

  private formatHours(hours: number): string {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}:${String(m).padStart(2, '0')}`;
  }
}
