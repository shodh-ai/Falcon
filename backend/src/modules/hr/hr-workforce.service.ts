import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { HrHoliday } from '../../entities/hr-holiday.entity';
import { HrDailyAttendance } from '../../entities/hr-daily-attendance.entity';
import { StaffLeaveRequest, StaffRequestType } from '../../entities/staff-leave-request.entity';
import { LeaveBalance } from '../../entities/leave-balance.entity';
import { StaffAttendance } from '../../entities/staff-attendance.entity';
import { User } from '../../entities/user.entity';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { WorkflowRoutingService } from '../../core/workflow/workflow-routing.service';
import { WorkflowNotificationService } from '../../core/workflow/workflow-notification.service';
import { AttendanceCalculationService } from './attendance-calculation.service';
import { HrWorkflowRoutingService } from './hr-workflow-routing.service';
import { HrAccessControlService } from './hr-access-control.service';
import {
  assertNoOverlappingWorkforceDates,
  assertRetroactiveWorkforceLimit,
} from '../../common/validators/workforce-request.validator';

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
    private readonly attendanceCalc: AttendanceCalculationService,
    private readonly hrWorkflow: HrWorkflowRoutingService,
    private readonly accessControl: HrAccessControlService,
  ) {}

  async getTodayWidget(userId: string) {
    const today = new Date().toISOString().slice(0, 10);
    const calc = await this.attendanceCalc.calculateAndPersist(userId, today);
    const shift = calc.shift;

    const shiftStart = this.parseShiftClock(today, shift.start_time);
    const shiftEnd = this.parseShiftClock(today, shift.end_time);
    const now = new Date();
    const spanMs = Math.max(shiftEnd.getTime() - shiftStart.getTime(), 1);
    const elapsedMs = Math.min(Math.max(now.getTime() - shiftStart.getTime(), 0), spanMs);
    const progressPercent = Math.round((elapsedMs / spanMs) * 100);

    const formatTime = (d: Date | null | undefined) =>
      d ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '--';

    const hours = calc.first_in_time
      ? this.computeHours(calc.first_in_time, calc.last_out_time)
      : 0;

    return {
      date: today,
      shift: {
        name: shift.shift_name,
        start: this.formatTime12(shift.start_time),
        end: this.formatTime12(shift.end_time),
        progress_percent: progressPercent,
      },
      first_in: calc.first_in_time,
      last_out: calc.last_out_time,
      display: {
        in_time: formatTime(calc.first_in_time),
        out_time: formatTime(calc.last_out_time),
        hours_worked_today: calc.first_in_time ? this.formatHours(hours) : '0:00',
      },
      calculated_status: calc.calculated_status,
      status: calc.calculated_status,
      tooltip: calc.tooltip,
      is_regularized: false,
      read_only: true,
    };
  }

  private parseShiftClock(date: string, time: string) {
    const [h, m] = time.split(':').map(Number);
    const d = new Date(`${date}T00:00:00`);
    d.setHours(h, m, 0, 0);
    return d;
  }

  private formatTime12(time: string) {
    const [h, m] = time.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
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

  async listAdminHolidays(tenantId: string, entityId: number) {
    return this.dataSource.query(
      `SELECT * FROM hr_holidays WHERE entity_id = $1 OR entity_id IS NULL ORDER BY date ASC`,
      [entityId]
    );
  }

  async createHoliday(
    tenantId: string,
    entityId: number,
    dto: { title: string; date: string; type: string; description?: string; applicable_to?: string }
  ) {
    const rows = await this.dataSource.query(
      `INSERT INTO hr_holidays (entity_id, title, date, type, description, applicable_to)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [entityId, dto.title, dto.date, dto.type, dto.description || null, dto.applicable_to || 'ALL']
    );
    return rows[0];
  }

  async updateHoliday(
    tenantId: string,
    entityId: number,
    holidayId: string,
    dto: { title?: string; date?: string; type?: string; description?: string; applicable_to?: string }
  ) {
    const updates: string[] = [];
    const params: any[] = [entityId, holidayId];

    if (dto.title !== undefined) { params.push(dto.title); updates.push(`title = $${params.length}`); }
    if (dto.date !== undefined) { params.push(dto.date); updates.push(`date = $${params.length}`); }
    if (dto.type !== undefined) { params.push(dto.type); updates.push(`type = $${params.length}`); }
    if (dto.description !== undefined) { params.push(dto.description); updates.push(`description = $${params.length}`); }
    if (dto.applicable_to !== undefined) { params.push(dto.applicable_to); updates.push(`applicable_to = $${params.length}`); }

    if (updates.length === 0) return null;

    const rows = await this.dataSource.query(
      `UPDATE hr_holidays SET ${updates.join(', ')} WHERE holiday_id = $2 AND (entity_id = $1 OR entity_id IS NULL) RETURNING *`,
      params
    );
    if (!rows[0]) throw new NotFoundException('Holiday not found');
    return rows[0];
  }

  async deleteHoliday(tenantId: string, entityId: number, holidayId: string) {
    const rows = await this.dataSource.query(
      `DELETE FROM hr_holidays WHERE holiday_id = $2 AND (entity_id = $1 OR entity_id IS NULL) RETURNING *`,
      [entityId, holidayId]
    );
    if (!rows[0]) throw new NotFoundException('Holiday not found');
    return rows[0];
  }

  async applyRequest(
    staffUserId: string,
    tenantId: string,
    dto: ApplyWorkforceRequestDto,
    options?: { actorRoles?: string[] },
  ) {
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

    const actorRoles = options?.actorRoles ?? [];

    assertRetroactiveWorkforceLimit(
      requestType,
      startDate!,
      endDate!,
      actorRoles,
      dto.regularization_date,
    );

    await assertNoOverlappingWorkforceDates(
      this.dataSource,
      tenantId,
      staffUserId,
      startDate!,
      endDate!,
      requestType,
      dto.regularization_date,
    );

    const entityId = await this.resolveEmployeeEntityId(tenantId, staffUserId);
    const routing = await this.hrWorkflow.initializeRequest(
      tenantId,
      entityId,
      requestType,
      staffUserId,
    );

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
      status: routing.is_final ? 'HR_APPROVED' : 'PENDING',
      entity_id: entityId,
      workflow_id: routing.workflow_id,
      current_step_order: routing.step_order,
      current_approver_user_id: routing.approver_user_id,
    });
    const saved = await this.requests.save(row);

    if (routing.is_final) {
      await this.applyApprovalSideEffects(saved);
      return saved;
    }

    if (routing.approver_user_id) {
      await this.notifyWorkflowApprover(tenantId, staff, saved, routing.approver_user_id);
    }

    return saved;
  }

  listMyRequests(staffUserId: string, tenantId: string) {
    return this.requests.find({
      where: { staff_user_id: staffUserId, tenant_id: tenantId },
      order: { applied_at: 'DESC' },
    });
  }

  async listTeamPending(
    approverUserId: string,
    tenantId: string,
    requestType?: StaffRequestType,
    roles: string[] = [],
  ) {
    const queryParams: unknown[] = [tenantId, approverUserId];
    let paramIdx = 3;
    const typeClause = requestType ? ` AND r.request_type = $${paramIdx++}` : '';
    if (requestType) queryParams.push(requestType);

    const { clause, params: scopeParams } = await this.accessControl.departmentScopeClause(
      tenantId,
      approverUserId,
      roles,
      'u',
      paramIdx,
    );
    queryParams.push(...scopeParams);

    const rows = await this.dataSource.query<
      Array<{
        leave_id: string;
        request_type: StaffRequestType;
        leave_type: string | null;
        start_date: string;
        end_date: string;
        regularization_date: string | null;
        missed_punch_type: string | null;
        reason: string | null;
        status: string;
        applied_at: Date;
        staff_user_id: string;
        current_step_order: number | null;
        employee_name: string;
        employee_email: string | null;
        employee_dept: string | null;
      }>
    >(
      `SELECT r.leave_id, r.request_type, r.leave_type, r.start_date, r.end_date,
              r.regularization_date, r.missed_punch_type, r.reason, r.status, r.applied_at,
              r.staff_user_id, r.current_step_order,
              u.name AS employee_name, u.official_email AS employee_email, d.dept_name AS employee_dept
       FROM staff_leave_requests r
       JOIN users u ON u.user_id = r.staff_user_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       WHERE r.tenant_id = $1
         AND r.status = 'PENDING'
         AND r.current_approver_user_id = $2
         ${typeClause}
         ${clause}
       ORDER BY r.applied_at ASC`,
      queryParams,
    );

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
      current_step_order: r.current_step_order,
      employee: {
        user_id: r.staff_user_id,
        name: r.employee_name ?? 'Employee',
        email: r.employee_email ?? null,
        department: r.employee_dept,
      },
    }));
  }

  private get dataSource() {
    return this.users.manager.connection;
  }

  async listPendingInbox(userId: string, tenantId: string, roles: string[] = []) {
    const pending = await this.listTeamPending(userId, tenantId, undefined, roles);
    return {
      count: pending.length,
      items: pending.map((p) => ({
        ...p,
        inbox_type: 'WORKFLOW_APPROVAL',
        title: `${p.request_type.replace(/_/g, ' ')} — ${p.employee.name}`,
        action_link: '/hr/inbox',
      })),
    };
  }

  async actOnTeamRequest(
    reportingOfficerId: string,
    tenantId: string,
    leaveId: string,
    action: 'APPROVE' | 'REJECT',
    comment?: string,
    options?: { adminOverride?: boolean },
  ) {
    const row = await this.requests.findOne({
      where: { leave_id: leaveId, tenant_id: tenantId },
      relations: ['staff'],
    });
    if (!row) throw new NotFoundException('Request not found');

    const staff = row.staff ?? (await this.users.findOne({ where: { user_id: row.staff_user_id } }));
    const roles = (await this.users.manager.query(
      `SELECT r.role_name FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id WHERE ur.user_id = $1
       UNION SELECT r.role_name FROM users u JOIN roles r ON r.role_id = u.role_id WHERE u.user_id = $1`,
      [reportingOfficerId],
    )) as Array<{ role_name: string }>;
    const roleNames = roles.map((r) => r.role_name);

    const adminOverride =
      options?.adminOverride === true &&
      roleNames.some((r) => ['HRAdmin', 'SuperAdmin', 'HR'].includes(r));

    if (!adminOverride) {
      this.hrWorkflow.assertActorIsCurrentApprover(reportingOfficerId, row.current_approver_user_id);
    }

    if (action === 'APPROVE' && !adminOverride) {
      const stepType = await this.resolveCurrentStepApproverType(tenantId, row);
      await this.accessControl.assertWorkflowApproverPower(
        tenantId,
        reportingOfficerId,
        roleNames,
        stepType,
        row.request_type,
      );
    }

    if (row.status !== 'PENDING') {
      throw new BadRequestException('Request has already been processed');
    }

    if (action === 'REJECT') {
      row.status = 'REJECTED';
      row.current_approver_user_id = null;
      const saved = await this.requests.save(row);
      this.notifyEmployeeDecision(staff!, row, false, comment);
      return saved;
    }

    const entityId = row.entity_id ?? (await this.resolveEmployeeEntityId(tenantId, row.staff_user_id));
    const next = await this.hrWorkflow.advanceAfterApproval(
      tenantId,
      entityId,
      row.request_type,
      row.staff_user_id,
      row.current_step_order,
    );

    if (next.is_final) {
      row.status = 'HR_APPROVED';
      row.current_approver_user_id = null;
      const saved = await this.requests.save(row);
      await this.applyApprovalSideEffects(saved);
      this.notifyEmployeeDecision(staff!, saved, true, comment);
      return saved;
    }

    row.current_step_order = next.step_order;
    row.current_approver_user_id = next.approver_user_id;
    const saved = await this.requests.save(row);

    if (next.approver_user_id) {
      await this.notifyWorkflowApprover(tenantId, staff!, saved, next.approver_user_id);
    }

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
      await this.attendanceCalc.calculateAndPersist(leg.user_id, leg.work_date);
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

    await this.attendanceCalc.calculateAndPersist(userId, date);

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

  private async resolveEmployeeEntityId(tenantId: string, userId: string): Promise<number> {
    const profile = await this.users.manager.query(
      `SELECT entity_id FROM hr_employee_profiles WHERE user_id = $1 AND tenant_id = $2 LIMIT 1`,
      [userId, tenantId],
    );
    if (!profile[0]?.entity_id) throw new BadRequestException('Employee entity not configured');
    return Number(profile[0].entity_id);
  }

  private async notifyWorkflowApprover(
    tenantId: string,
    staff: User,
    row: StaffLeaveRequest,
    approverUserId: string,
  ) {
    const approver = await this.users.findOne({ where: { user_id: approverUserId } });
    if (!approver) return;
    const label = this.requestTypeLabel(row.request_type);
    this.workflowNotify.notifyApprover({
      tenantId,
      approver: {
        userId: approver.user_id,
        email: approver.email,
        name: approver.name,
        routeReason: `HR workflow step ${row.current_step_order}`,
      },
      title: `${label} pending your approval (Step ${row.current_step_order})`,
      message: `${staff.name} submitted ${label} (${row.start_date}${row.end_date !== row.start_date ? ` – ${row.end_date}` : ''}).`,
      actionLink: row.current_approver_user_id ? '/hr/inbox' : '/faculty/team-requests',
      category: 'HR',
      requesterName: staff.name,
    });
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
    await this.attendanceCalc.calculateAndPersist(userId, date);
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
    await this.attendanceCalc.calculateAndPersist(userId, date);
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

  private async resolveCurrentStepApproverType(
    tenantId: string,
    row: StaffLeaveRequest,
  ): Promise<string | null> {
    if (!row.workflow_id || !row.current_step_order) return null;
    const steps = await this.users.manager.query(
      `SELECT approver_type FROM hr_approval_workflow_steps
       WHERE workflow_id = $1 AND step_order = $2`,
      [row.workflow_id, row.current_step_order],
    );
    return (steps[0] as { approver_type: string } | undefined)?.approver_type ?? null;
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
