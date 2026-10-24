import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, MoreThanOrEqual } from 'typeorm';
import { HrHoliday } from '../../entities/hr-holiday.entity';
import { HrDailyAttendance } from '../../entities/hr-daily-attendance.entity';
import {
  StaffLeaveRequest,
  StaffRequestType,
} from '../../entities/staff-leave-request.entity';
import { LeaveBalance } from '../../entities/leave-balance.entity';
import { StaffAttendance } from '../../entities/staff-attendance.entity';
import { User } from '../../entities/user.entity';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { FalconNotificationsService } from '../../core/notifications/falcon-notifications.service';
import { WorkflowRoutingService } from '../../core/workflow/workflow-routing.service';
import { WorkflowNotificationService } from '../../core/workflow/workflow-notification.service';
import { AttendanceCalculationService } from './attendance-calculation.service';
import { HrWorkflowRoutingService } from './hr-workflow-routing.service';
import { HrAccessControlService } from './hr-access-control.service';
import {
  assertNoOverlappingWorkforceDates,
  assertRetroactiveWorkforceLimit,
} from '../../common/validators/workforce-request.validator';
import { canAccessTeamApprovals } from './utils/reporting-officer.util';
import { workforceStatusPathForRoles } from './utils/workforce-portal-links.util';
import { finalHrReviewSql, hrRequestScopeSql } from './hr-final-review.sql';

export type ApplyWorkforceRequestDto = {
  request_type: StaffRequestType;
  leave_type?: string;
  start_date?: string;
  end_date?: string;
  start_time?: string;
  end_time?: string;
  regularization_date?: string;
  missed_punch_type?: 'IN' | 'OUT' | 'BOTH';
  reason?: string;
  supporting_doc_urls?: string[];
};

type LegacyHodApprovalRow = {
  leave_id: string;
  tenant_id: string;
  staff_user_id: string;
  entity_id: number | null;
  request_type: StaffRequestType;
  leave_type: string;
  workflow_id: string | null;
  status: string;
  current_step_order: number;
  current_approver_user_id: string | null;
  start_date: string;
  end_date: string;
  reason: string | null;
  applied_at: Date;
  employee_name?: string;
  employee_id?: string | null;
};

type LegacyReapprovalTarget = {
  step_order: number;
  approver_user_id: string;
};

@Injectable()
export class HrWorkforceService {
  private readonly logger = new Logger(HrWorkforceService.name);

  constructor(
    @InjectRepository(HrHoliday)
    private readonly holidays: Repository<HrHoliday>,
    @InjectRepository(HrDailyAttendance)
    private readonly dailyAttendance: Repository<HrDailyAttendance>,
    @InjectRepository(StaffLeaveRequest)
    private readonly requests: Repository<StaffLeaveRequest>,
    @InjectRepository(LeaveBalance)
    private readonly balances: Repository<LeaveBalance>,
    @InjectRepository(StaffAttendance)
    private readonly legacyAttendance: Repository<StaffAttendance>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly notify: NotificationEmitterService,
    private readonly workflowRouting: WorkflowRoutingService,
    private readonly workflowNotify: WorkflowNotificationService,
    private readonly attendanceCalc: AttendanceCalculationService,
    private readonly hrWorkflow: HrWorkflowRoutingService,
    private readonly accessControl: HrAccessControlService,
    @Optional() private readonly falconNotifications?: FalconNotificationsService,
  ) {}

  async getTodayWidget(userId: string) {
    const today = new Date().toISOString().slice(0, 10);
    const calc = await this.attendanceCalc.calculateAndPersist(userId, today);
    const shift = calc.shift;

    const shiftStart = this.parseShiftClock(today, shift.start_time);
    const shiftEnd = this.parseShiftClock(today, shift.end_time);
    const now = new Date();
    const spanMs = Math.max(shiftEnd.getTime() - shiftStart.getTime(), 1);
    const elapsedMs = Math.min(
      Math.max(now.getTime() - shiftStart.getTime(), 0),
      spanMs,
    );
    const progressPercent = Math.round((elapsedMs / spanMs) * 100);

    const formatTime = (d: Date | null | undefined) =>
      d
        ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
        : '--';

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
        hours_worked_today: calc.first_in_time
          ? this.formatHours(hours)
          : '0:00',
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
    return d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
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
      [entityId],
    );
  }

  async createHoliday(
    tenantId: string,
    entityId: number,
    dto: {
      title: string;
      date: string;
      type: string;
      description?: string;
      applicable_to?: string;
    },
  ) {
    const rows = await this.dataSource.query(
      `INSERT INTO hr_holidays (entity_id, title, date, type, description, applicable_to)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        entityId,
        dto.title,
        dto.date,
        dto.type,
        dto.description || null,
        dto.applicable_to || 'ALL',
      ],
    );
    return rows[0];
  }

  async updateHoliday(
    tenantId: string,
    entityId: number,
    holidayId: string,
    dto: {
      title?: string;
      date?: string;
      type?: string;
      description?: string;
      applicable_to?: string;
    },
  ) {
    const updates: string[] = [];
    const params: any[] = [entityId, holidayId];

    if (dto.title !== undefined) {
      params.push(dto.title);
      updates.push(`title = $${params.length}`);
    }
    if (dto.date !== undefined) {
      params.push(dto.date);
      updates.push(`date = $${params.length}`);
    }
    if (dto.type !== undefined) {
      params.push(dto.type);
      updates.push(`type = $${params.length}`);
    }
    if (dto.description !== undefined) {
      params.push(dto.description);
      updates.push(`description = $${params.length}`);
    }
    if (dto.applicable_to !== undefined) {
      params.push(dto.applicable_to);
      updates.push(`applicable_to = $${params.length}`);
    }

    if (updates.length === 0) return null;

    const rows = await this.dataSource.query(
      `UPDATE hr_holidays SET ${updates.join(', ')} WHERE holiday_id = $2 AND (entity_id = $1 OR entity_id IS NULL) RETURNING *`,
      params,
    );
    if (!rows[0]) throw new NotFoundException('Holiday not found');
    return rows[0];
  }

  async deleteHoliday(tenantId: string, entityId: number, holidayId: string) {
    const rows = await this.dataSource.query(
      `DELETE FROM hr_holidays WHERE holiday_id = $2 AND (entity_id = $1 OR entity_id IS NULL) RETURNING *`,
      [entityId, holidayId],
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

    const hasStartTime = Boolean(dto.start_time?.trim());
    const hasEndTime = Boolean(dto.end_time?.trim());
    if (hasStartTime !== hasEndTime) {
      throw new BadRequestException('Both start_time and end_time are required for a partial-day request');
    }
    if (hasStartTime && hasEndTime) {
      if (!startDate || !endDate || startDate !== endDate) {
        throw new BadRequestException('Partial-day leave/on-duty must be for one date');
      }
      const timePattern = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
      if (!timePattern.test(dto.start_time!.trim()) || !timePattern.test(dto.end_time!.trim())) {
        throw new BadRequestException('Times must use HH:MM format');
      }
      if (dto.start_time!.trim() >= dto.end_time!.trim()) {
        throw new BadRequestException('end_time must be after start_time');
      }
    }

    if (requestType === 'REGULARIZATION') {
      if (!dto.regularization_date) {
        throw new BadRequestException('regularization_date is required');
      }
      startDate = dto.regularization_date;
      endDate = dto.regularization_date;
      leaveType = 'REGULARIZATION';
    } else if (requestType === 'ON_DUTY') {
      if (!startDate || !endDate)
        throw new BadRequestException(
          'start_date and end_date are required for OD',
        );
      leaveType = 'OD';
    } else if (requestType === 'COMP_OFF_CREDIT') {
      if (!startDate)
        throw new BadRequestException(
          'start_date (worked date) is required for comp-off',
        );
      endDate = startDate;
      leaveType = 'COMP_OFF';
    } else {
      if (!startDate || !endDate)
        throw new BadRequestException('start_date and end_date are required');
    }

    if (startDate && endDate && endDate < startDate) {
      throw new BadRequestException('end_date cannot be before start_date');
    }

    const actorRoles = options?.actorRoles ?? [];

    assertRetroactiveWorkforceLimit(
      requestType,
      startDate,
      endDate,
      actorRoles,
      dto.regularization_date,
    );

    await assertNoOverlappingWorkforceDates(
      this.dataSource,
      tenantId,
      staffUserId,
      startDate,
      endDate,
      requestType,
      dto.regularization_date,
    );

    const entityId = await this.resolveEmployeeEntityId(tenantId, staffUserId);
    const saved = await this.hrWorkflow.withInitializedRequest(
      tenantId, entityId, requestType, staffUserId,
      async (routing, manager) => {
        if (routing.is_final || !routing.approver_user_id) {
          throw new BadRequestException('An assigned approval workflow is required before submission');
        }
        const row = this.requests.create({
          tenant_id: tenantId,
          staff_user_id: staffUserId,
          request_type: requestType,
          leave_type: leaveType,
          start_date: startDate,
          end_date: endDate,
          start_time: hasStartTime ? dto.start_time!.trim() : null,
          end_time: hasEndTime ? dto.end_time!.trim() : null,
          reason: dto.reason?.trim() ?? null,
          regularization_date: dto.regularization_date ?? null,
          missed_punch_type: dto.missed_punch_type ?? null,
          supporting_doc_urls: Array.isArray(dto.supporting_doc_urls)
            ? dto.supporting_doc_urls.filter(
                (u) => typeof u === 'string' && u.trim(),
              )
            : [],
          status: 'PENDING',
          entity_id: entityId,
          workflow_id: routing.workflow_id,
          current_step_order: routing.step_order,
          current_approver_user_id: routing.approver_user_id,
        });
        return manager.getRepository(StaffLeaveRequest).save(row);
      },
    );

    if (saved.current_approver_user_id) {
      await this.notifyWorkflowApprover(
        tenantId,
        staff,
        saved,
        saved.current_approver_user_id,
      );
    }

    void this.falconNotifications?.create({
      tenantId,
      userId: staffUserId,
      category: 'HR',
      title: `${this.requestTypeLabel(requestType)} submitted`,
      message: 'Your request is waiting for independent review. You will be notified when a decision is recorded.',
      actionLink: '/notifications',
      intent: 'status_update',
    }).catch((error: unknown) => this.logger.warn(`Submission notification failed: ${String(error)}`));

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
    const allowed = await canAccessTeamApprovals(
      (sql, params) => this.dataSource.query(sql, params),
      tenantId,
      approverUserId,
      roles,
    );
    if (!allowed) return [];

    const queryParams: unknown[] = [tenantId, approverUserId];
    let paramIdx = 3;
    const typeClause = requestType
      ? ` AND r.request_type = $${paramIdx++}`
      : '';
    if (requestType) queryParams.push(requestType);

    const { clause, params: scopeParams } =
      await this.accessControl.departmentScopeClause(
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
        start_time: string | null;
        end_time: string | null;
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
              r.start_time, r.end_time, r.regularization_date, r.missed_punch_type, r.reason, r.status, r.applied_at,
              r.staff_user_id, r.current_step_order,
              u.name AS employee_name, u.official_email AS employee_email, d.dept_name AS employee_dept
       FROM staff_leave_requests r
       JOIN users u ON u.user_id = r.staff_user_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       LEFT JOIN hr_approval_workflow_steps hr_step
         ON hr_step.workflow_id = r.workflow_id AND hr_step.step_order = r.current_step_order
       WHERE r.tenant_id = $1
         AND r.status IN ('PENDING', 'HOD_APPROVED')
         AND r.current_approver_user_id = $2
         AND NOT (r.request_type IN ('LEAVE', 'ON_DUTY', 'REGULARIZATION')
           AND ${finalHrReviewSql('r', 'hr_step')})
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
      start_time: r.start_time,
      end_time: r.end_time,
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

  /** The final HR review queue is scoped to the selected entity and assigned approver.
   * The LEAVE workspace also owns on-duty final review; regularization is separate.
   */
  async listHrReviewPending(
    tenantId: string,
    entityId: number,
    approverUserId: string,
    requestType: 'LEAVE' | 'REGULARIZATION',
    includeFirstLevel = false,
  ) {
    return this.dataSource.query<
      Array<{
        leave_id: string;
        request_type: StaffRequestType;
        leave_type: string;
        start_date: string;
        end_date: string;
        regularization_date: string | null;
        missed_punch_type: 'IN' | 'OUT' | 'BOTH' | null;
        start_time: string | null;
        end_time: string | null;
        reason: string | null;
        status: string;
        applied_at: Date;
        current_step_order: number;
        employee_name: string;
        employee_id: string | null;
        recorded_check_in: Date | null;
        recorded_check_out: Date | null;
        review_stage: 'FIRST_LEVEL' | 'FINAL_HR';
        can_review: boolean;
      }>
    >(
      `SELECT r.leave_id, r.request_type, r.leave_type, r.start_date, r.end_date,
              r.regularization_date, r.missed_punch_type, r.start_time, r.end_time,
              r.reason, r.status, r.applied_at,
              r.current_step_order, u.name AS employee_name, p.employee_id,
              da.first_in_time AS recorded_check_in,
              da.last_out_time AS recorded_check_out,
              CASE WHEN ${finalHrReviewSql('r', 'hr_step')} THEN 'FINAL_HR' ELSE 'FIRST_LEVEL' END AS review_stage,
              COALESCE((${finalHrReviewSql('r', 'hr_step')} AND r.current_approver_user_id = $3
                AND r.staff_user_id <> $3
                AND ${hrRequestScopeSql('r', 'p', 'u', '$3', true)}
                AND NOT EXISTS (SELECT 1 FROM hr_staff_request_decisions prior
                  WHERE prior.tenant_id = r.tenant_id AND prior.leave_id = r.leave_id
                    AND prior.action = 'APPROVE' AND prior.actor_user_id = $3)), false) AS can_review
       FROM staff_leave_requests r
       JOIN hr_employee_profiles p ON p.user_id = r.staff_user_id
         AND p.tenant_id = r.tenant_id
       JOIN users u ON u.user_id = r.staff_user_id AND u.tenant_id = r.tenant_id
       LEFT JOIN hr_approval_workflow_steps hr_step
         ON hr_step.workflow_id = r.workflow_id AND hr_step.step_order = r.current_step_order
       LEFT JOIN hr_daily_attendance da ON da.user_id = r.staff_user_id
         AND da.date = r.regularization_date
       WHERE r.tenant_id = $1 AND p.entity_id = $2
         AND (r.request_type = $4 OR ($4 = 'LEAVE' AND r.request_type = 'ON_DUTY'))
         AND r.status IN ('PENDING', 'HOD_APPROVED')
         AND ${hrRequestScopeSql('r', 'p', 'u', '$3')}
         AND ${includeFirstLevel && requestType === 'REGULARIZATION'
           ? 'TRUE /* supervisory visibility; actions still require final HR assignment */'
           : `r.current_approver_user_id = $3 AND ${finalHrReviewSql('r', 'hr_step')}`}
       ORDER BY r.applied_at ASC`,
      [tenantId, entityId, approverUserId, requestType],
    );
  }

  /** Pre-history HOD approvals need a new real manager decision, not a forged backfill. */
  async listLegacyHodReconciliations(
    tenantId: string,
    entityId: number,
    actorUserId: string,
  ) {
    await this.assertLiveReconciliationAdmin(
      this.users.manager,
      tenantId,
      actorUserId,
    );
    const rows = await this.dataSource.query<LegacyHodApprovalRow[]>(
      `SELECT r.leave_id, r.tenant_id, r.staff_user_id, r.entity_id,
              r.request_type, r.leave_type, r.workflow_id, r.status,
              r.current_step_order, r.current_approver_user_id,
              r.start_date, r.end_date, r.reason, r.applied_at,
              u.name AS employee_name, p.employee_id
       FROM staff_leave_requests r
       JOIN hr_employee_profiles p ON p.user_id = r.staff_user_id
         AND p.tenant_id = r.tenant_id AND p.entity_id = $2
       JOIN users u ON u.user_id = r.staff_user_id AND u.tenant_id = r.tenant_id
       WHERE r.tenant_id = $1 AND (r.entity_id = $2 OR r.entity_id IS NULL)
         AND r.status = 'HOD_APPROVED'
         AND r.request_type IN ('LEAVE', 'ON_DUTY', 'REGULARIZATION')
         AND NOT EXISTS (
           SELECT 1 FROM hr_staff_request_decisions decision
           WHERE decision.tenant_id = r.tenant_id AND decision.leave_id = r.leave_id
         )
       ORDER BY r.applied_at ASC`,
      [tenantId, entityId],
    );
    return Promise.all(rows.map(async (row) => {
      try {
        const target = await this.resolveLegacyReapprovalTarget(
          this.users.manager,
          row,
          tenantId,
          entityId,
          actorUserId,
        );
        return {
          ...row,
          can_reconcile: true,
          reroute_step_order: target.step_order,
          reroute_approver_user_id: target.approver_user_id,
        };
      } catch (error) {
        return {
          ...row,
          can_reconcile: false,
          block_reason: error instanceof Error ? error.message : 'Manual review required',
        };
      }
    }));
  }

  async reconcileLegacyHodApproval(
    actorUserId: string,
    tenantId: string,
    entityId: number,
    leaveId: string,
    reasonRaw: string,
    evidenceReferenceRaw?: string,
  ) {
    const reason = typeof reasonRaw === 'string' ? reasonRaw.trim() : '';
    const evidenceReference = typeof evidenceReferenceRaw === 'string'
      ? evidenceReferenceRaw.trim() : '';
    if (reason.length < 10 || reason.length > 2000) {
      throw new BadRequestException('A reconciliation reason of 10–2000 characters is required');
    }
    if (evidenceReference.length > 1000) {
      throw new BadRequestException('Evidence reference is too long');
    }

    const result = await this.dataSource.transaction(async (manager) => {
      await this.assertLiveReconciliationAdmin(manager, tenantId, actorUserId);
      const rows = await manager.query<LegacyHodApprovalRow[]>(
        `SELECT r.leave_id, r.tenant_id, r.staff_user_id, r.entity_id,
                r.request_type, r.leave_type, r.workflow_id, r.status,
                r.current_step_order, r.current_approver_user_id,
                r.start_date, r.end_date, r.reason, r.applied_at
         FROM staff_leave_requests r
         WHERE r.tenant_id = $1 AND r.leave_id = $2
         FOR UPDATE OF r`,
        [tenantId, leaveId],
      );
      const row = rows[0];
      if (!row) throw new NotFoundException('Request not found');
      const profile = await manager.query<Array<{ entity_id: number }>>(
        `SELECT p.entity_id FROM hr_employee_profiles p
         JOIN users u ON u.user_id = p.user_id AND u.tenant_id = p.tenant_id
         WHERE p.tenant_id = $1 AND p.user_id = $2 AND p.entity_id = $3`,
        [tenantId, row.staff_user_id, entityId],
      );
      if (!profile[0] || (row.entity_id !== null && Number(row.entity_id) !== entityId)) {
        throw new NotFoundException('Request not found in this organization entity');
      }
      if (row.status !== 'HOD_APPROVED' ||
          !['LEAVE', 'ON_DUTY', 'REGULARIZATION'].includes(row.request_type)) {
        throw new ConflictException('Request is not awaiting legacy HOD reconciliation');
      }
      const prior = await manager.query<Array<{ decision_id: string }>>(
        `SELECT decision_id FROM hr_staff_request_decisions
         WHERE tenant_id = $1 AND leave_id = $2 LIMIT 1`,
        [tenantId, leaveId],
      );
      if (prior[0]) {
        throw new ConflictException('Request already has verifiable approval history');
      }
      const target = await this.resolveLegacyReapprovalTarget(
        manager, row, tenantId, entityId, actorUserId,
      );
      const updated = await manager.query<Array<{
        leave_id: string;
        status: string;
        current_step_order: number;
        current_approver_user_id: string;
      }>>(
        `UPDATE staff_leave_requests
         SET status = 'PENDING', current_step_order = $4,
             current_approver_user_id = $5
         WHERE tenant_id = $1 AND leave_id = $2 AND status = 'HOD_APPROVED'
           AND current_step_order = $3
           AND current_approver_user_id IS NOT DISTINCT FROM $6::uuid
           AND NOT EXISTS (
             SELECT 1 FROM hr_staff_request_decisions decision
             WHERE decision.tenant_id = $1 AND decision.leave_id = $2
           )
         RETURNING leave_id, status, current_step_order, current_approver_user_id`,
        [tenantId, leaveId, row.current_step_order, target.step_order,
          target.approver_user_id, row.current_approver_user_id],
      );
      if (!updated[0]) {
        throw new ConflictException('Request changed during reconciliation');
      }
      const audit = await manager.query<Array<{ reconciliation_id: string }>>(
        `INSERT INTO hr_staff_request_reconciliations
           (tenant_id, entity_id, leave_id, reconciled_by_user_id,
            previous_status, previous_step_order, previous_approver_user_id,
            rerouted_step_order, rerouted_approver_user_id, reason, evidence_reference)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING reconciliation_id`,
        [tenantId, entityId, leaveId, actorUserId, row.status,
          row.current_step_order, row.current_approver_user_id,
          target.step_order, target.approver_user_id, reason,
          evidenceReference || null],
      );
      return { ...updated[0], reconciliation_id: audit[0].reconciliation_id };
    });
    return result;
  }

  private async assertLiveReconciliationAdmin(
    manager: EntityManager,
    tenantId: string,
    actorUserId: string,
  ) {
    const roles = await manager.query<Array<{ role_name: string }>>(
      `SELECT DISTINCT role_name FROM (
         SELECT r.role_name FROM users u JOIN roles r ON r.role_id = u.role_id
         WHERE u.user_id = $1 AND u.tenant_id = $2 AND u.is_active = true
         UNION ALL
         SELECT r.role_name FROM users u
         JOIN user_roles ur ON ur.user_id = u.user_id
         JOIN roles r ON r.role_id = ur.role_id
         WHERE u.user_id = $1 AND u.tenant_id = $2 AND u.is_active = true
       ) current_roles`,
      [actorUserId, tenantId],
    );
    if (!roles.some(({ role_name }) => role_name === 'HRAdmin' || role_name === 'SuperAdmin')) {
      throw new ForbiddenException('Current HR administrator role is required for reconciliation');
    }
  }

  private async resolveLegacyReapprovalTarget(
    manager: EntityManager,
    row: LegacyHodApprovalRow,
    tenantId: string,
    entityId: number,
    actorUserId: string,
  ): Promise<LegacyReapprovalTarget> {
    let priorStepOrder = 1;
    let priorStepType = 'REPORTING_MANAGER';
    if (row.workflow_id === null) {
      if (row.current_step_order !== 2) {
        throw new ConflictException('Legacy fallback is not at its final HR step');
      }
    } else {
      const steps = await manager.query<Array<{
        current_type: string;
        current_ref: string | null;
        previous_order: number | null;
        previous_type: string | null;
      }>>(
        `SELECT current_step.approver_type AS current_type,
                current_step.approver_ref AS current_ref,
                previous_step.step_order AS previous_order,
                previous_step.approver_type AS previous_type
         FROM hr_approval_workflows workflow
         JOIN hr_approval_workflow_steps current_step
           ON current_step.workflow_id = workflow.workflow_id
          AND current_step.step_order = $5
         LEFT JOIN LATERAL (
           SELECT step_order, approver_type FROM hr_approval_workflow_steps prior
           WHERE prior.workflow_id = workflow.workflow_id AND prior.step_order < $5
           ORDER BY prior.step_order DESC LIMIT 1
         ) previous_step ON true
         WHERE workflow.workflow_id = $1 AND workflow.tenant_id = $2
           AND workflow.entity_id = $3 AND workflow.action_type = $4
           AND NOT EXISTS (
             SELECT 1 FROM hr_approval_workflow_steps later
             WHERE later.workflow_id = workflow.workflow_id AND later.step_order > $5
           )`,
        [row.workflow_id, tenantId, entityId, row.request_type, row.current_step_order],
      );
      const step = steps[0];
      const currentIsHr = step && (
        step.current_type === 'HR_ADMIN' || step.current_type === 'HR_EXECUTIVE' ||
        (step.current_type === 'ROLE' &&
          ['HR', 'HRAdmin', 'SuperAdmin'].includes(step.current_ref ?? ''))
      );
      if (!currentIsHr || !step.previous_order || !step.previous_type) {
        throw new ConflictException('Pinned workflow has no verifiable final HR and prior manager steps');
      }
      priorStepOrder = Number(step.previous_order);
      priorStepType = step.previous_type;
    }
    if (priorStepType !== 'REPORTING_MANAGER' && priorStepType !== 'DEPT_HEAD') {
      throw new ConflictException('Prior workflow step is not a manager/HOD approval');
    }
    const candidate = await manager.query<Array<{ approver_user_id: string | null }>>(
      `SELECT CASE WHEN $3 = 'DEPT_HEAD'
              THEN NULLIF(department.hod_user_id, staff.user_id)
              ELSE COALESCE(
                NULLIF(staff.reporting_officer_id, staff.user_id),
                NULLIF(department.hod_user_id, staff.user_id)
              ) END AS approver_user_id
       FROM users staff
       LEFT JOIN departments department ON department.dept_id = staff.dept_id
       WHERE staff.user_id = $1 AND staff.tenant_id = $2`,
      [row.staff_user_id, tenantId, priorStepType],
    );
    const approverId = candidate[0]?.approver_user_id;
    if (!approverId) {
      throw new ConflictException('No current manager/HOD is configured for fresh approval');
    }
    if (approverId === actorUserId || approverId === row.current_approver_user_id) {
      throw new ConflictException('Fresh manager/HOD reviewer must be independent of HR reconciliation and final review');
    }
    const active = await manager.query<Array<{ user_id: string }>>(
      `SELECT approver.user_id FROM users approver
       JOIN hr_employee_profiles approver_profile
         ON approver_profile.user_id = approver.user_id
        AND approver_profile.tenant_id = approver.tenant_id
       WHERE approver.user_id = $1 AND approver.tenant_id = $2
         AND approver_profile.entity_id = $3 AND approver.is_active = true`,
      [approverId, tenantId, entityId],
    );
    if (!active[0]) {
      throw new ConflictException('The configured manager/HOD is inactive or outside this tenant/entity');
    }
    return { step_order: priorStepOrder, approver_user_id: approverId };
  }

  /** Compatibility mutations must enter the same workflow path as the current review UI. */
  async actOnScopedTeamRequest(
    actorUserId: string,
    tenantId: string,
    entityId: number,
    leaveId: string,
    action: 'APPROVE' | 'REJECT',
    roles: string[],
    comment?: string,
  ) {
    const assigned = await this.dataSource.query<Array<{ leave_id: string }>>(
      `SELECT r.leave_id
       FROM staff_leave_requests r
       JOIN hr_employee_profiles p ON p.user_id = r.staff_user_id
         AND p.tenant_id = r.tenant_id
       WHERE r.tenant_id = $1 AND p.entity_id = $2 AND r.leave_id = $3
         AND r.current_approver_user_id = $4
         AND r.status IN ('PENDING', 'HOD_APPROVED')`,
      [tenantId, entityId, leaveId, actorUserId],
    );
    if (!assigned[0]) {
      throw new ForbiddenException('Request is not pending your approval in this entity');
    }
    return this.actOnTeamRequest(actorUserId, tenantId, leaveId, action, comment, {
      roles,
    });
  }

  private get dataSource() {
    return this.users.manager.connection;
  }

  async listPendingInbox(
    userId: string,
    tenantId: string,
    roles: string[] = [],
  ) {
    const pending = await this.listTeamPending(
      userId,
      tenantId,
      undefined,
      roles,
    );
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
    options?: { adminOverride?: boolean; roles?: string[] },
  ) {
    const row = await this.requests.findOne({
      where: { leave_id: leaveId, tenant_id: tenantId },
      relations: ['staff'],
    });
    if (!row) throw new NotFoundException('Request not found');
    if (row.staff_user_id === reportingOfficerId) {
      throw new ForbiddenException('You cannot approve or reject your own request');
    }
    if (action !== 'APPROVE' && action !== 'REJECT') {
      throw new BadRequestException('action must be APPROVE or REJECT');
    }

    const staff =
      row.staff ??
      (await this.users.findOne({ where: { user_id: row.staff_user_id } }));
    const roles = await this.users.manager.query(
      `SELECT r.role_name FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id
       JOIN users actor ON actor.user_id = ur.user_id
       WHERE ur.user_id = $1 AND actor.tenant_id = $2 AND actor.is_active = true
       UNION SELECT r.role_name FROM users u JOIN roles r ON r.role_id = u.role_id
       WHERE u.user_id = $1 AND u.tenant_id = $2 AND u.is_active = true`,
      [reportingOfficerId, tenantId],
    );
    // JWT/workspace roles can outlive a demotion. Approval power is checked
    // against the actor's current database roles at decision time.
    const roleNames = roles.map((r) => r.role_name);

    const adminOverride =
      options?.adminOverride === true &&
      roleNames.some((r) => ['HRAdmin', 'SuperAdmin', 'HR'].includes(r));

    if (!adminOverride) {
      const allowed = await canAccessTeamApprovals(
        (sql, params) => this.dataSource.query(sql, params),
        tenantId,
        reportingOfficerId,
        roleNames,
      );
      if (!allowed) {
        throw new ForbiddenException(
          'Team approval features are not enabled for your account',
        );
      }
    }

    if (!adminOverride) {
      this.hrWorkflow.assertActorIsCurrentApprover(
        reportingOfficerId,
        row.current_approver_user_id,
      );
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

    if (row.status !== 'PENDING' && row.status !== 'HOD_APPROVED') {
      throw new BadRequestException('Request has already been processed');
    }

    if (adminOverride) {
      if (!comment || comment.trim().length < 10 || comment.trim().length > 2000) {
        throw new BadRequestException('An override reason of 10–2000 characters is required');
      }
      const permitted = await this.dataSource.query<Array<{ leave_id: string }>>(
        `SELECT r.leave_id FROM staff_leave_requests r
         JOIN users u ON u.user_id = r.staff_user_id AND u.tenant_id = r.tenant_id
         JOIN hr_employee_profiles p ON p.user_id = u.user_id AND p.tenant_id = r.tenant_id
         WHERE r.tenant_id = $1 AND r.leave_id = $2
           AND ${hrRequestScopeSql('r', 'p', 'u', '$3', true)}`,
        [tenantId, leaveId, reportingOfficerId],
      );
      if (!permitted[0]) throw new ForbiddenException('Request is outside your HR approval scope');
    }

    let overrideAuditParams: string[] | null = null;
    if (adminOverride) {
      const approverDesignationRow = row.current_approver_user_id
        ? await this.users.manager.query(
            `SELECT r.role_name FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.user_id = $1`,
            [row.current_approver_user_id],
          )
        : [{ role_name: 'Unknown' }];
      const assignedApproverDesignation =
        approverDesignationRow[0]?.role_name || 'Unknown';

      const employeeIdRow = await this.users.manager.query(
        `SELECT employee_id FROM hr_employee_profiles WHERE user_id = $1`,
        [row.staff_user_id],
      );
      const employeeId = employeeIdRow[0]?.employee_id || row.staff_user_id;

      const bypassedByDesignation =
        roleNames.find((r) => ['HRAdmin', 'SuperAdmin', 'HR'].includes(r)) ||
        'HR Admin';
      const actionType =
        action === 'APPROVE' ? 'Bypass Approve' : 'Force Reject';
      const requestType =
        row.request_type === 'LEAVE'
          ? row.leave_type || 'LEAVE'
          : row.request_type;

      overrideAuditParams = [
        tenantId, employeeId, assignedApproverDesignation,
        bypassedByDesignation, actionType, requestType,
        reportingOfficerId, leaveId, String(row.current_step_order), comment!.trim(),
      ];
    }

    const expectedDecisionState = {
      status: row.status,
      stepOrder: row.current_step_order,
      approverUserId: row.current_approver_user_id,
    };

    if (action === 'REJECT') {
      row.status = 'REJECTED';
      row.current_approver_user_id = null;
      row.approver_remarks = comment?.trim() ?? row.approver_remarks;
      const saved = await this.dataSource.transaction((manager) => this.commitDecision(
        row, expectedDecisionState, reportingOfficerId, action,
        adminOverride, manager, overrideAuditParams,
      ));
      void this.notifyEmployeeDecision(staff, saved, false, comment);
      return saved;
    }

    const entityId =
      row.entity_id ??
      (await this.resolveEmployeeEntityId(tenantId, row.staff_user_id));
    const stepType = await this.resolveCurrentStepApproverType(tenantId, row);
    const isHodStep =
      stepType === 'REPORTING_MANAGER' || stepType === 'DEPT_HEAD';

    const next = await this.hrWorkflow.advanceAfterApproval(
      tenantId,
      entityId,
      row.request_type,
      row.staff_user_id,
      row.current_step_order,
      row.workflow_id,
      reportingOfficerId,
    );

    if (next.is_final) {
      row.status = 'HR_APPROVED';
      row.current_approver_user_id = null;
      row.approver_remarks = comment?.trim() ?? row.approver_remarks;
      const saved = await this.dataSource.transaction(async (manager) => {
        await this.assertIndependentFinalDecision(
          manager, row, expectedDecisionState, reportingOfficerId,
        );
        const claimed = await this.commitDecision(
          row, expectedDecisionState, reportingOfficerId, action,
          adminOverride, manager, overrideAuditParams,
        );
        await this.applyApprovalSideEffects(claimed, manager);
        return claimed;
      });
      await this.recalculateApprovedAttendance(saved);
      void this.notifyEmployeeDecision(staff, saved, true, comment);
      return saved;
    }

    // Keep the HoD decision visible while the request awaits independent HR sign-off.
    if (isHodStep) row.status = 'HOD_APPROVED';
    row.current_step_order = next.step_order;
    row.current_approver_user_id = next.approver_user_id;
    row.approver_remarks = comment?.trim() ?? row.approver_remarks;
    const saved = await this.dataSource.transaction((manager) => this.commitDecision(
      row, expectedDecisionState, reportingOfficerId, action,
      adminOverride, manager, overrideAuditParams,
    ));

    if (next.approver_user_id) {
      await this.notifyWorkflowApprover(
        tenantId,
        staff,
        saved,
        next.approver_user_id,
      );
    }

    return saved;
  }

  /** Only one concurrent reviewer may claim a pending decision and its side effects. */
  private async commitDecision(
    row: StaffLeaveRequest,
    expected: {
      status: string;
      stepOrder: number;
      approverUserId: string | null;
    },
    actorUserId: string,
    action: 'APPROVE' | 'REJECT',
    wasOverride: boolean,
    manager: EntityManager,
    overrideAuditParams: string[] | null,
  ): Promise<StaffLeaveRequest> {
    const updated = await manager.query<StaffLeaveRequest[]>(
      `UPDATE staff_leave_requests
       SET status = $1, current_step_order = $2,
           current_approver_user_id = $3, approver_remarks = $4
       WHERE tenant_id = $5 AND leave_id = $6
         AND status = $7 AND current_step_order = $8
         AND current_approver_user_id IS NOT DISTINCT FROM $9::uuid
       RETURNING *`,
      [
        row.status,
        row.current_step_order,
        row.current_approver_user_id,
        row.approver_remarks ?? null,
        row.tenant_id,
        row.leave_id,
        expected.status,
        expected.stepOrder,
        expected.approverUserId,
      ],
    );
    if (!updated[0]) {
      throw new ConflictException('Request changed while approval was in progress');
    }
    await manager.query(
      `INSERT INTO hr_staff_request_decisions
         (tenant_id, leave_id, step_order, actor_user_id, action, was_override)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [row.tenant_id, row.leave_id, expected.stepOrder,
        actorUserId, action, wasOverride],
    );
    await this.recordOverrideAfterClaim(overrideAuditParams, manager);
    return Object.assign(row, updated[0]);
  }

  private async assertIndependentFinalDecision(
    manager: EntityManager,
    row: StaffLeaveRequest,
    expected: { status: string; stepOrder: number; approverUserId: string | null },
    actorUserId: string,
  ) {
    const previous = await manager.query<Array<{ actor_user_id: string }>>(
      `SELECT actor_user_id FROM hr_staff_request_decisions
       WHERE tenant_id = $1 AND leave_id = $2 AND action = 'APPROVE'`,
      [row.tenant_id, row.leave_id],
    );
    if (previous.some((decision) => decision.actor_user_id === actorUserId)) {
      throw new ForbiddenException('The previous approver cannot provide final HR sign-off');
    }
    if (expected.status === 'HOD_APPROVED' && previous.length === 0) {
      throw new ConflictException(
        'Prior approval actor is unverified; this legacy request requires HR reconciliation before final sign-off',
      );
    }
  }

  private async recordOverrideAfterClaim(
    params: string[] | null,
    manager: EntityManager,
  ) {
    if (!params) return;
    await manager.query(
      `INSERT INTO hr_override_logs
         (tenant_id, employee_id, assigned_approver, bypassed_by,
          type_of_action, type_of_request, actor_user_id, leave_id, step_order, reason, date_and_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7::uuid, $8::uuid, $9::integer, $10, CURRENT_TIMESTAMP)`,
      params,
    );
  }

  /** Payroll: day counts as paid/present if biometric present, regularized, or approved OD. */
  async isPaidDay(userId: string, date: string): Promise<boolean> {
    const daily = await this.dailyAttendance.findOne({
      where: { user_id: userId, date },
    });
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
      await this.upsertDailyFromPunches(
        leg.user_id,
        leg.work_date,
        leg.check_in_at,
        leg.check_out_at,
      );
      await this.attendanceCalc.calculateAndPersist(leg.user_id, leg.work_date);
    }

    this.logger.debug(
      `Biometric sync completed for ${legacyRows.length} legacy row(s) on ${today}`,
    );
    return { synced: legacyRows.length, date: today };
  }

  async simulateBiometricPunch(
    userId: string,
    dto: { date?: string; action: 'IN' | 'OUT'; at?: string },
  ) {
    const date = dto.date ?? new Date().toISOString().slice(0, 10);
    const at = dto.at ? new Date(dto.at) : new Date();

    let row = await this.dailyAttendance.findOne({
      where: { user_id: userId, date },
    });
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
    row.total_hours = this.computeHours(
      row.first_in_time,
      row.last_out_time,
    ).toFixed(2);
    await this.dailyAttendance.save(row);

    await this.attendanceCalc.calculateAndPersist(userId, date);

    let leg = await this.legacyAttendance.findOne({
      where: { user_id: userId, work_date: date },
    });
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

  private async resolveEmployeeEntityId(
    tenantId: string,
    userId: string,
  ): Promise<number> {
    const profile = await this.users.manager.query(
      `SELECT entity_id FROM hr_employee_profiles WHERE user_id = $1 AND tenant_id = $2 LIMIT 1`,
      [userId, tenantId],
    );
    if (!profile[0]?.entity_id)
      throw new BadRequestException('Employee entity not configured');
    return Number(profile[0].entity_id);
  }

  private async notifyWorkflowApprover(
    tenantId: string,
    staff: User,
    row: StaffLeaveRequest,
    approverUserId: string,
  ) {
    const approver = await this.users.findOne({
      where: { user_id: approverUserId },
    });
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
      actionLink: row.status === 'HOD_APPROVED' && ['LEAVE', 'ON_DUTY'].includes(row.request_type)
        ? '/hr/leaves'
        : row.status === 'HOD_APPROVED' && row.request_type === 'REGULARIZATION'
          ? '/hr/regularizations'
          : row.current_approver_user_id
            ? '/hr/inbox'
            : '/faculty/team-requests',
      category: 'HR',
      requesterName: staff.name,
    });
  }

  private async applyApprovalSideEffects(row: StaffLeaveRequest, manager: EntityManager) {
    if (row.request_type === 'REGULARIZATION' && row.regularization_date) {
      await this.regularizeDay(row.staff_user_id, row.regularization_date, manager);
    } else if (row.request_type === 'ON_DUTY') {
      const dates = this.expandDates(row.start_date, row.end_date);
      for (const date of dates) {
        if (row.start_time && row.end_time && dates.length === 1) {
          await this.markPresentForOdWindow(
            row.staff_user_id,
            date,
            row.start_time,
            row.end_time,
            manager,
          );
        } else {
          await this.markPresentForOd(row.staff_user_id, date, manager);
        }
      }
    } else if (row.request_type === 'COMP_OFF_CREDIT') {
      await this.creditCompOff(row.staff_user_id, 1, manager);
    } else if (row.request_type === 'LEAVE') {
      await this.deductLeaveBalance(row, manager);
    }
  }

  /** The authoritative daily row is written in the same transaction as final approval. */
  private async regularizeDay(userId: string, date: string, manager: EntityManager) {
    const daily = manager.getRepository(HrDailyAttendance);
    let row = await daily.findOne({
      where: { user_id: userId, date },
      lock: { mode: 'pessimistic_write' },
    });
    if (!row) {
      row = daily.create({
        user_id: userId,
        date,
        status: 'ABSENT',
        is_regularized: false,
      });
    }
    const baseIn = new Date(`${date}T10:00:00`);
    const baseOut = new Date(`${date}T18:00:00`);
    if (!row.first_in_time) row.first_in_time = baseIn;
    if (!row.last_out_time) row.last_out_time = baseOut;
    row.status = 'PRESENT';
    row.is_regularized = true;
    row.total_hours = this.computeHours(
      row.first_in_time,
      row.last_out_time,
    ).toFixed(2);
    await daily.save(row);
  }

  private async markPresentForOd(userId: string, date: string, manager: EntityManager) {
    const daily = manager.getRepository(HrDailyAttendance);
    let row = await daily.findOne({
      where: { user_id: userId, date },
      lock: { mode: 'pessimistic_write' },
    });
    if (!row) {
      row = daily.create({
        user_id: userId,
        date,
        status: 'ABSENT',
        is_regularized: false,
      });
    }
    row.status = 'PRESENT';
    row.is_regularized = true;
    if (!row.first_in_time) row.first_in_time = new Date(`${date}T09:30:00`);
    if (!row.last_out_time) row.last_out_time = new Date(`${date}T17:30:00`);
    row.total_hours = this.computeHours(
      row.first_in_time,
      row.last_out_time,
    ).toFixed(2);
    await daily.save(row);
  }

  /** Apply a partial OD window without manufacturing a full 8-hour day. */
  private async markPresentForOdWindow(
    userId: string,
    date: string,
    startTime: string,
    endTime: string,
    manager: EntityManager,
  ) {
    const daily = manager.getRepository(HrDailyAttendance);
    let row = await daily.findOne({
      where: { user_id: userId, date },
      lock: { mode: 'pessimistic_write' },
    });
    if (!row) {
      row = daily.create({
        user_id: userId,
        date,
        status: 'PRESENT',
        is_regularized: false,
      });
    }
    if (!row.first_in_time) row.first_in_time = new Date(`${date}T${startTime}`);
    if (!row.last_out_time) row.last_out_time = new Date(`${date}T${endTime}`);
    row.status = 'PRESENT';
    // Keep this false so the attendance calculator reports the actual partial
    // hours instead of converting the request into FULL_DAY.
    row.is_regularized = false;
    row.total_hours = this.computeHours(row.first_in_time, row.last_out_time).toFixed(2);
    await daily.save(row);
  }

  private async creditCompOff(userId: string, days: number, manager: EntityManager) {
    const year = new Date().getFullYear();
    await manager.query(
      `INSERT INTO hr_leave_balances (user_id, leave_type, year, entitled, used)
       VALUES ($1, 'COMP_OFF', $2, $3, 0)
       ON CONFLICT (user_id, leave_type, year)
       DO UPDATE SET entitled = hr_leave_balances.entitled + EXCLUDED.entitled,
                     updated_at = NOW()`,
      [userId, year, days],
    );
  }

  private async deductLeaveBalance(row: StaffLeaveRequest, manager: EntityManager) {
    const year = new Date(row.start_date).getFullYear();
    const dates = this.expandDates(row.start_date, row.end_date).filter((d) => {
      const dow = new Date(d).getDay();
      return dow !== 0 && dow !== 6;
    });
    let days = dates.length;
    if (row.start_time && row.end_time && dates.length === 1) {
      let fullDayHours = 8;
      try {
        const shift = await this.attendanceCalc.getEmployeeShift(row.staff_user_id);
        fullDayHours = Number(shift.full_day_min_hours || 8);
      } catch {
        // The configured default is explicit and keeps balance deduction safe
        // when an employee has no shift assignment yet.
      }
      const partialHours = this.hoursBetweenClocks(row.start_time, row.end_time);
      days = Math.min(1, Math.max(0, partialHours / fullDayHours));
    }

    await manager.query(
      `UPDATE hr_leave_balances SET used = used + $4, updated_at = NOW()
       WHERE user_id = $1 AND leave_type = $2 AND year = $3`,
      [row.staff_user_id, row.leave_type, year, days],
    );
  }

  /** Derived attendance classifications may be retried; core daily rows already committed. */
  private async recalculateApprovedAttendance(row: StaffLeaveRequest) {
    const dates = row.request_type === 'REGULARIZATION' && row.regularization_date
      ? [row.regularization_date]
      : row.request_type === 'ON_DUTY'
        ? this.expandDates(row.start_date, row.end_date)
        : [];
    for (const date of dates) {
      try {
        await this.attendanceCalc.calculateAndPersist(row.staff_user_id, date);
      } catch (error) {
        this.logger.warn(`Attendance projection pending recalculation for ${row.leave_id} on ${date}: ${String(error)}`);
      }
    }
  }

  private hoursBetweenClocks(start: string, end: string): number {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    return Math.max(0, (eh * 60 + em - (sh * 60 + sm)) / 60);
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

  private async notifyEmployeeDecision(
    staff: User | null | undefined,
    row: StaffLeaveRequest,
    approved: boolean,
    comment?: string,
  ) {
    if (!staff?.tenant_id) return;
    const label = this.requestTypeLabel(row.request_type);
    const roleRows = await this.users.manager.query(
      `SELECT r.role_name FROM users u JOIN roles r ON r.role_id = u.role_id WHERE u.user_id = $1
       UNION SELECT r.role_name FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id WHERE ur.user_id = $1`,
      [row.staff_user_id],
    );
    const actionLink = workforceStatusPathForRoles(
      roleRows.map((row) => row.role_name),
    );
    this.notify.leaveApproved({
      tenantId: staff.tenant_id,
      userId: row.staff_user_id,
      title: approved ? `${label} approved` : `${label} rejected`,
      message: approved
        ? `Your ${label} request was approved.${comment ? ` Note: ${comment}` : ''}`
        : `Your ${label} request was rejected.${comment ? ` Reason: ${comment}` : ''}`,
      actionLink,
      leaveType: row.leave_type,
      startDate: row.start_date,
      endDate: row.end_date,
    });
  }

  private async resolveCurrentStepApproverType(
    tenantId: string,
    row: StaffLeaveRequest,
  ): Promise<string | null> {
    if (!row.workflow_id) {
      return row.current_step_order === 1
        ? 'REPORTING_MANAGER'
        : row.current_step_order === 2
          ? 'HR_ADMIN'
          : null;
    }
    if (!row.current_step_order) return null;
    const steps = await this.users.manager.query(
      `SELECT approver_type, approver_ref FROM hr_approval_workflow_steps
       WHERE workflow_id = $1 AND step_order = $2`,
      [row.workflow_id, row.current_step_order],
    );
    const step = steps[0] as { approver_type: string; approver_ref?: string | null } | undefined;
    if (!step) return null;
    return step.approver_type === 'ROLE'
      ? `ROLE:${step.approver_ref ?? ''}`
      : step.approver_type;
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
