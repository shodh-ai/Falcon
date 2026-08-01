import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository, In } from 'typeorm';
import { HR_PAYROLL_QUEUE } from '../../common/constants/hr-payroll-queue.constants';
import {
  LeaveRequest,
  LeaveRequestStatus,
} from '../../entities/leave-request.entity';
import { LeaveBalance } from '../../entities/leave-balance.entity';
import { StaffAttendance } from '../../entities/staff-attendance.entity';
import { StaffLeaveRequest } from '../../entities/staff-leave-request.entity';
import { StaffPayslip } from '../../entities/staff-payslip.entity';
import { StaffPayslipDownloadRequest } from '../../entities/staff-payslip-download-request.entity';
import { StaffGatePass } from '../../entities/staff-gate-pass.entity';
import { User } from '../../entities/user.entity';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { LeaveActionDto } from './dto/leave-action.dto';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { WorkflowRoutingService } from '../../core/workflow/workflow-routing.service';
import { WorkflowNotificationService } from '../../core/workflow/workflow-notification.service';
import { HrLeavePolicyService } from './hr-leave-policy.service';
import { HrWorkflowBuilderService } from './hr-workflow-builder.service';
import { HrWorkflowRoutingService } from './hr-workflow-routing.service';
import { assertNoPendingRow } from '../../common/validators/pending-request.util';
import {
  assertNoOverlappingWorkforceDates,
  assertRetroactiveWorkforceLimit,
} from '../../common/validators/workforce-request.validator';
import { FinanceLedgerService } from '../finance/finance-ledger.service';
import { PayslipPdfService } from './payslip-pdf.service';
import {
  compareYearMonthKeys,
  enumerateYearMonthKeys,
  parseYearMonthKey,
  payslipToYearMonthKey,
} from './payslip-period.util';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import {
  fetchDepartmentHodUserId,
  resolveDefaultReportingOfficerId,
  canAccessTeamApprovals as canAccessTeamApprovalsUtil,
} from './utils/reporting-officer.util';
import { validatePillarReporting } from './utils/pillar-reporting.util';

/** HOD (reporting officer) first, then HR admin — no generic HR inbox on create. */
const APPROVAL_FLOW: Partial<Record<LeaveRequestStatus, LeaveRequestStatus>> = {
  PENDING_HOD: 'PENDING_HR',
  PENDING_DEAN: 'PENDING_HR',
  PENDING_HR: 'APPROVED',
};

@Injectable()
export class HrService {
  constructor(
    @InjectRepository(LeaveRequest) private leaves: Repository<LeaveRequest>,
    @InjectRepository(LeaveBalance) private balances: Repository<LeaveBalance>,
    @InjectRepository(StaffAttendance)
    private staffAttendance: Repository<StaffAttendance>,
    @InjectRepository(StaffLeaveRequest)
    private staffLeaveRequests: Repository<StaffLeaveRequest>,
    @InjectRepository(StaffPayslip) private payslips: Repository<StaffPayslip>,
    @InjectRepository(StaffPayslipDownloadRequest)
    private payslipDownloadRequests: Repository<StaffPayslipDownloadRequest>,
    @InjectRepository(StaffGatePass)
    private gatePasses: Repository<StaffGatePass>,
    @InjectRepository(User) private users: Repository<User>,
    private readonly notify: NotificationEmitterService,
    private readonly workflowRouting: WorkflowRoutingService,
    private readonly workflowNotify: WorkflowNotificationService,
    private readonly leavePolicies: HrLeavePolicyService,
    private readonly workflowBuilder: HrWorkflowBuilderService,
    private readonly hrWorkflow: HrWorkflowRoutingService,
    @InjectQueue(HR_PAYROLL_QUEUE) private readonly payrollQueue: Queue,
    private readonly financeLedger: FinanceLedgerService,
    private readonly payslipPdf: PayslipPdfService,
  ) {}

  async createLeaveRequest(dto: CreateLeaveRequestDto) {
    const requester = await this.users.findOne({
      where: { user_id: dto.requester_user_id },
    });
    if (!requester?.tenant_id) {
      throw new BadRequestException('Requester tenant not found');
    }

    const entity = this.leaves.create({
      ...dto,
      status: 'PENDING_HOD',
      approval_trail: { history: [] },
    });
    const saved = await this.leaves.save(entity);

    const approver = await this.workflowRouting.getReportingOfficer(
      dto.requester_user_id,
    );
    this.workflowNotify.notifyApprover({
      tenantId: requester.tenant_id,
      approver,
      title: 'Leave approval required',
      message: `${requester.name} applied for ${saved.leave_type} leave (${saved.start_date} – ${saved.end_date}). Review dates and approve or reject.`,
      actionLink: '/faculty/inbox',
      category: 'HR',
      requesterName: requester.name,
      requestType: 'Leave request',
      startDate: saved.start_date,
      endDate: saved.end_date,
    });

    return saved;
  }

  listLeaveRequests(userId?: string, status?: LeaveRequestStatus) {
    const where: Record<string, unknown> = {};
    if (userId) where.requester_user_id = userId;
    if (status) where.status = status;
    return this.leaves.find({ where, order: { created_at: 'DESC' } });
  }

  async actOnLeave(leaveId: string, dto: LeaveActionDto) {
    const leave = await this.leaves.findOne({
      where: { leave_request_id: leaveId },
    });
    if (!leave) throw new NotFoundException('Leave request not found');

    const next = APPROVAL_FLOW[leave.status];
    if (!next && leave.status !== 'REJECTED') {
      throw new BadRequestException(
        `Cannot act on leave in status ${leave.status}`,
      );
    }

    const trail = (leave.approval_trail as { history?: unknown[] }) ?? {
      history: [],
    };
    const history = Array.isArray(trail.history) ? trail.history : [];
    history.push({
      step: leave.status,
      action: dto.action,
      actor_user_id: dto.actor_user_id,
      comment: dto.comment ?? null,
      at: new Date().toISOString(),
    });

    leave.status =
      dto.action === 'REJECT' ? 'REJECTED' : (next ?? leave.status);
    leave.approval_trail = { history };
    const previousStatus = leave.status;
    const saved = await this.leaves.save(leave);

    const requester = await this.users.findOne({
      where: { user_id: saved.requester_user_id },
    });
    const tenantId = requester?.tenant_id;
    if (!tenantId) return saved;

    if (
      dto.action !== 'REJECT' &&
      previousStatus === 'PENDING_HOD' &&
      saved.status === 'PENDING_HR'
    ) {
      const hrAdmin = await this.workflowRouting.getHrAdmin(tenantId);
      this.workflowNotify.notifyApprover({
        tenantId,
        approver: hrAdmin,
        title: 'Leave awaiting HR approval',
        message: `${requester.name}'s ${saved.leave_type} leave (${saved.start_date} – ${saved.end_date}) was approved by HOD and needs your final sign-off.`,
        actionLink: '/hr/inbox',
        category: 'HR',
        requesterName: requester.name,
        requestType: 'Leave request',
        startDate: saved.start_date,
        endDate: saved.end_date,
      });
    }

    if (saved.status === 'APPROVED') {
      this.notify.leaveApproved({
        tenantId,
        userId: saved.requester_user_id,
        leaveType: saved.leave_type,
        startDate: saved.start_date,
        endDate: saved.end_date,
      });
    }

    return saved;
  }

  listBalances(userId: string) {
    return this.balances.find({ where: { user_id: userId } });
  }

  recordStaffAttendance(userId: string, workDate: string) {
    const row = this.staffAttendance.create({
      user_id: userId,
      work_date: workDate,
      check_in_at: new Date(),
      status: 'PRESENT',
      source: 'MANUAL',
    });
    return this.staffAttendance.save(row);
  }

  async webPunch(_userId: string, _action?: 'IN' | 'OUT') {
    throw new ForbiddenException(
      'Web punch-in is disabled. Attendance is synced from biometrics only. Use Regularize Attendance for corrections.',
    );
  }

  async getThisWeekHours(userId: string) {
    const now = new Date();
    const day = now.getDay() === 0 ? 7 : now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - day + 1);
    monday.setHours(0, 0, 0, 0);

    const rows = await this.staffAttendance
      .createQueryBuilder('attendance')
      .where('attendance.user_id = :userId', { userId })
      .andWhere('attendance.work_date >= :from', {
        from: monday.toISOString().slice(0, 10),
      })
      .getMany();

    const hours = rows.reduce((sum, row) => {
      if (!row.check_in_at) return sum;
      const out = row.check_out_at ?? new Date();
      return (
        sum + Math.max(0, out.getTime() - row.check_in_at.getTime()) / 36e5
      );
    }, 0);

    return Number(hours.toFixed(2));
  }

  async getAttendanceSummary(userId: string) {
    const today = new Date().toISOString().slice(0, 10);
    const row = await this.staffAttendance.findOne({
      where: { user_id: userId, work_date: today },
    });
    return {
      today: row ?? null,
      week_hours: await this.getThisWeekHours(userId),
    };
  }

  async listAttendanceCalendar(userId: string, month: string) {
    const [year, monthValue] = month.split('-').map(Number);
    const start = `${year}-${String(monthValue).padStart(2, '0')}-01`;
    const endDate = new Date(year, monthValue, 0);
    const end = endDate.toISOString().slice(0, 10);

    const [attendanceRows, leaveRows] = await Promise.all([
      this.staffAttendance
        .createQueryBuilder('attendance')
        .where('attendance.user_id = :userId', { userId })
        .andWhere('attendance.work_date BETWEEN :start AND :end', {
          start,
          end,
        })
        .getMany(),
      this.staffLeaveRequests
        .createQueryBuilder('leave')
        .where('leave.staff_user_id = :userId', { userId })
        .andWhere('leave.status IN (:...statuses)', {
          statuses: ['PENDING', 'HOD_APPROVED', 'HR_APPROVED'],
        })
        .andWhere('leave.start_date <= :end AND leave.end_date >= :start', {
          start,
          end,
        })
        .getMany(),
    ]);

    return {
      month,
      attendance: attendanceRows.map((row) => ({
        date: row.work_date,
        status: row.check_in_at ? 'PRESENT' : 'ABSENT',
        check_in_at: row.check_in_at,
        check_out_at: row.check_out_at,
      })),
      leaves: leaveRows.map((row) => ({
        leave_id: row.leave_id,
        leave_type: row.leave_type,
        start_date: row.start_date,
        end_date: row.end_date,
        status: row.status,
      })),
    };
  }

  async applyStaffLeave(
    staffUserId: string,
    tenantId: string,
    dto: {
      leave_type: string;
      start_date: string;
      end_date: string;
      reason?: string;
    },
    actorRoles: string[] = [],
  ) {
    const profile = await this.users.manager.query(
      `SELECT entity_id FROM hr_employee_profiles WHERE user_id = $1 AND tenant_id = $2`,
      [staffUserId, tenantId],
    );
    const entityId = Number(profile[0]?.entity_id ?? 1);
    await this.leavePolicies.validateLeaveApplication(
      tenantId,
      entityId,
      staffUserId,
      dto,
    );

    assertRetroactiveWorkforceLimit(
      'LEAVE',
      dto.start_date,
      dto.end_date,
      actorRoles,
    );
    await assertNoOverlappingWorkforceDates(
      this.users.manager.connection,
      tenantId,
      staffUserId,
      dto.start_date,
      dto.end_date,
      'LEAVE',
    );

    const routing = await this.hrWorkflow.initializeRequest(
      tenantId,
      entityId,
      'LEAVE',
      staffUserId,
    );

    const row = this.staffLeaveRequests.create({
      tenant_id: tenantId,
      staff_user_id: staffUserId,
      leave_type: dto.leave_type,
      start_date: dto.start_date,
      end_date: dto.end_date,
      reason: dto.reason ?? null,
      status: routing.is_final ? 'HR_APPROVED' : 'PENDING',
      request_type: 'LEAVE',
      entity_id: entityId,
      workflow_id: routing.workflow_id,
      current_step_order: routing.step_order,
      current_approver_user_id: routing.approver_user_id,
    });
    return this.staffLeaveRequests.save(row);
  }

  listMyStaffLeaves(staffUserId: string, tenantId: string) {
    return this.staffLeaveRequests.find({
      where: { staff_user_id: staffUserId, tenant_id: tenantId },
      order: { applied_at: 'DESC' },
    });
  }

  async listMyPayslips(staffUserId: string, tenantId: string) {
    const rows = await this.payslips.find({
      where: {
        staff_user_id: staffUserId,
        tenant_id: tenantId,
        is_published: true,
      },
      order: { year: 'DESC', generated_at: 'DESC' },
    });
    return rows
      .map((p) => {
        const period_key = payslipToYearMonthKey(p.month, p.year);
        if (!period_key) return null;
        return {
          payslip_id: p.payslip_id,
          month: p.month,
          year: p.year,
          net_pay: p.net_pay,
          gross_pay: p.gross_pay,
          period_key,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }

  async listMyPayslipDownloadRequests(staffUserId: string, tenantId: string) {
    return this.payslipDownloadRequests.find({
      where: { staff_user_id: staffUserId, tenant_id: tenantId },
      order: { created_at: 'DESC' },
    });
  }

  async requestPayslipDownload(
    staffUserId: string,
    tenantId: string,
    dto: { period_from: string; period_to: string; reason: string },
  ) {
    const trimmed = dto.reason?.trim();
    if (!trimmed || trimmed.length < 10) {
      throw new BadRequestException(
        'Please provide a reason (at least 10 characters) for requesting this payslip.',
      );
    }

    const periodFrom = dto.period_from?.trim();
    const periodTo = dto.period_to?.trim();
    parseYearMonthKey(periodFrom);
    parseYearMonthKey(periodTo);
    if (compareYearMonthKeys(periodFrom, periodTo) > 0) {
      throw new BadRequestException(
        'Start month must be before or equal to end month.',
      );
    }

    const monthsInRange = enumerateYearMonthKeys(periodFrom, periodTo);
    const published = await this.listMyPayslips(staffUserId, tenantId);
    const publishedKeys = new Set(published.map((p) => p.period_key));
    const covered = monthsInRange.filter((k) => publishedKeys.has(k));
    if (!covered.length) {
      throw new BadRequestException(
        'No published payslips found for the selected period. Choose months where payroll has been published.',
      );
    }

    const pending = await this.payslipDownloadRequests.findOne({
      where: {
        staff_user_id: staffUserId,
        tenant_id: tenantId,
        status: 'PENDING',
      },
    });
    if (pending) {
      throw new BadRequestException(
        'You already have a payslip download request pending HR approval.',
      );
    }

    const row = this.payslipDownloadRequests.create({
      tenant_id: tenantId,
      payslip_id: null,
      period_from: periodFrom,
      period_to: periodTo,
      staff_user_id: staffUserId,
      reason: trimmed,
      status: 'PENDING',
    });
    return this.payslipDownloadRequests.save(row);
  }

  async listPendingPayslipDownloadRequests(tenantId: string) {
    return this.users.manager.query(
      `SELECT r.request_id, r.period_from, r.period_to, r.reason, r.status, r.created_at,
              u.user_id AS staff_user_id, u.name AS staff_name, u.official_email AS staff_email
       FROM staff_payslip_download_requests r
       INNER JOIN users u ON u.user_id = r.staff_user_id
       WHERE r.tenant_id = $1 AND r.status = 'PENDING'
       ORDER BY r.created_at ASC`,
      [tenantId],
    );
  }

  async actOnPayslipDownloadRequest(
    requestId: string,
    tenantId: string,
    hrUserId: string,
    approved: boolean,
    remarks?: string,
  ) {
    const row = await this.payslipDownloadRequests.findOne({
      where: { request_id: requestId, tenant_id: tenantId },
    });
    if (!row) throw new NotFoundException('Download request not found');
    if (row.status !== 'PENDING') {
      throw new BadRequestException('This request has already been processed.');
    }
    row.status = approved ? 'APPROVED' : 'REJECTED';
    row.reviewed_by = hrUserId;
    row.reviewed_at = new Date();
    row.reviewer_remarks = remarks?.trim() || null;
    return this.payslipDownloadRequests.save(row);
  }

  async downloadApprovedPayslipRequest(
    requestId: string,
    staffUserId: string,
    tenantId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const request = await this.payslipDownloadRequests.findOne({
      where: {
        request_id: requestId,
        staff_user_id: staffUserId,
        tenant_id: tenantId,
      },
    });
    if (!request) throw new NotFoundException('Download request not found');
    if (request.status !== 'APPROVED') {
      throw new ForbiddenException(
        'HR must approve this request before you can download.',
      );
    }
    if (!request.period_from || !request.period_to) {
      throw new BadRequestException('Request is missing period range.');
    }

    const staffRows = await this.users.manager.query<
      Array<{
        name: string;
        official_email: string | null;
        employee_id: string | null;
        designation: string | null;
        dept_name: string | null;
      }>
    >(
      `SELECT u.name, u.official_email,
              hep.employee_id, hep.designation, d.dept_name
       FROM users u
       LEFT JOIN hr_employee_profiles hep ON hep.user_id = u.user_id AND hep.tenant_id = u.tenant_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       WHERE u.user_id = $1 AND u.tenant_id = $2
       LIMIT 1`,
      [staffUserId, tenantId],
    );
    const staff = staffRows[0];

    const monthKeys = enumerateYearMonthKeys(
      request.period_from,
      request.period_to,
    );
    const published = await this.payslips.find({
      where: {
        staff_user_id: staffUserId,
        tenant_id: tenantId,
        is_published: true,
      },
    });

    const byKey = new Map<string, StaffPayslip>();
    for (const p of published) {
      const key = payslipToYearMonthKey(p.month, p.year);
      if (key) byKey.set(key, p);
    }
    const rows = monthKeys
      .filter((k) => byKey.has(k))
      .map((k) => {
        const p = byKey.get(k)!;
        return {
          periodKey: k,
          grossPay: Number(p.gross_pay ?? 0),
          netPay: Number(p.net_pay ?? 0),
          workingDays: p.working_days,
          lwpDays: Number(p.lwp_days ?? 0),
        };
      });

    if (!rows.length) {
      throw new NotFoundException(
        'No published payslips found for the approved period.',
      );
    }

    const buffer = await this.payslipPdf.generatePeriodStatement({
      staffName: staff?.name ?? 'Employee',
      employeeId: staff?.employee_id ?? null,
      designation: staff?.designation ?? null,
      department: staff?.dept_name ?? null,
      email: staff?.official_email ?? null,
      periodFrom: request.period_from,
      periodTo: request.period_to,
      documentRef: `SGVU/PAY/${request.request_id.slice(0, 8).toUpperCase()}`,
      purpose: request.reason,
      rows,
    });

    const filename = `salary-certificate-${request.period_from}-to-${request.period_to}.pdf`;
    return { buffer, filename };
  }

  private readPayslipFileIfExists(filePath?: string | null): Buffer | null {
    if (!filePath?.trim()) return null;
    const uploadRoot = resolve(process.env.UPLOAD_PATH || './uploads');
    let resolvedPath = resolve(filePath);
    if (filePath.startsWith('/uploads/')) {
      resolvedPath = resolve(uploadRoot, filePath.replace(/^\/uploads\//, ''));
    }
    if (!resolvedPath.startsWith(uploadRoot) || !existsSync(resolvedPath))
      return null;
    return readFileSync(resolvedPath);
  }

  private async ensurePayslipPdfOnDisk(
    payslip: StaffPayslip,
    staff: { name?: string | null },
  ): Promise<string> {
    const uploadRoot = resolve(process.env.UPLOAD_PATH || './uploads');
    const payslipDir = resolve(uploadRoot, 'payslips');
    mkdirSync(payslipDir, { recursive: true });
    const fileName =
      `${payslip.staff_user_id}-${payslip.month}-${payslip.year}.pdf`
        .replace(/\s+/g, '-')
        .toLowerCase();
    const relativePath = `/uploads/payslips/${fileName}`;
    const fullPath = resolve(uploadRoot, 'payslips', fileName);

    const existing = this.readPayslipFileIfExists(relativePath);
    if (!existing) {
      const buffer = await this.payslipPdf.generate({
        staffName: staff.name ?? 'Employee',
        month: payslip.month,
        year: payslip.year,
        grossPay: payslip.gross_pay,
        netPay: payslip.net_pay,
        workingDays: payslip.working_days,
        lwpDays: payslip.lwp_days,
      });
      writeFileSync(fullPath, buffer);
    }
    return relativePath;
  }

  async createGatePass(
    staffUserId: string,
    tenantId: string,
    dto: { out_time: string; expected_in_time: string; reason: string },
  ) {
    await assertNoPendingRow(this.gatePasses, {
      tenant_id: tenantId,
      staff_user_id: staffUserId,
      status: 'PENDING',
    });

    const user = await this.users.findOne({ where: { user_id: staffUserId } });
    const reportingOfficerId = user?.reporting_officer_id ?? null;
    const row = this.gatePasses.create({
      tenant_id: tenantId,
      staff_user_id: staffUserId,
      reporting_officer_id: reportingOfficerId,
      out_time: new Date(dto.out_time),
      expected_in_time: new Date(dto.expected_in_time),
      reason: dto.reason,
      status: 'PENDING',
    });
    const saved = await this.gatePasses.save(row);

    if (reportingOfficerId) {
      const approver =
        await this.workflowRouting.getReportingOfficer(staffUserId);
      this.workflowNotify.notifyApprover({
        tenantId,
        approver,
        title: 'Gate pass approval required',
        message: `${user?.name ?? 'Staff member'} requested a mid-duty gate pass.`,
        actionLink: '/faculty/gate-pass',
        category: 'HR',
        requesterName: user?.name,
      });
    }

    return saved;
  }

  listMyGatePasses(staffUserId: string, tenantId: string) {
    return this.gatePasses.find({
      where: { staff_user_id: staffUserId, tenant_id: tenantId },
      order: { out_time: 'DESC' },
    });
  }

  async canAccessTeamApprovals(
    userId: string,
    tenantId: string,
    roles: string[],
  ): Promise<boolean> {
    return canAccessTeamApprovalsUtil(
      (sql, params) => this.users.manager.query(sql, params),
      tenantId,
      userId,
      roles,
    );
  }

  async listPendingGatePassApprovals(
    reportingOfficerId: string,
    tenantId: string,
    roles: string[] = [],
  ) {
    const allowed = await this.canAccessTeamApprovals(
      reportingOfficerId,
      tenantId,
      roles,
    );
    if (!allowed) return [];

    return this.gatePasses.find({
      where: {
        reporting_officer_id: reportingOfficerId,
        tenant_id: tenantId,
        status: 'PENDING',
      },
      relations: ['staff'],
      order: { out_time: 'ASC' },
    });
  }

  listPendingHrGatePasses(tenantId: string) {
    return this.gatePasses.find({
      where: { tenant_id: tenantId, status: 'PENDING_HR' },
      relations: ['staff'],
      order: { out_time: 'ASC' },
    });
  }

  async actOnGatePass(
    passId: string,
    actorUserId: string,
    tenantId: string,
    status: 'APPROVED' | 'REJECTED',
    roles: string[] = [],
  ) {
    const pass = await this.gatePasses.findOne({
      where: { pass_id: passId, tenant_id: tenantId },
      relations: ['staff'],
    });
    if (!pass) throw new NotFoundException('Gate pass not found');

    const staff = await this.users.findOne({
      where: { user_id: pass.staff_user_id },
    });

    if (pass.status === 'PENDING') {
      const allowed = await this.canAccessTeamApprovals(
        actorUserId,
        tenantId,
        roles,
      );
      if (!allowed) {
        throw new ForbiddenException(
          'Team approval features are not enabled for your account',
        );
      }
      if (pass.reporting_officer_id !== actorUserId) {
        throw new ForbiddenException(
          'Only the assigned reporting officer can act on this pass',
        );
      }
      if (status === 'REJECTED') {
        pass.status = 'REJECTED';
        const saved = await this.gatePasses.save(pass);
        if (staff?.tenant_id) {
          this.notify.gatePassUpdated({
            tenantId: staff.tenant_id,
            userId: pass.staff_user_id,
            status: 'REJECTED',
            actionLink: '/faculty/gate-pass',
          });
        }
        return saved;
      }
      pass.status = 'PENDING_HR';
      const saved = await this.gatePasses.save(pass);
      const hrAdmin = await this.workflowRouting.getHrAdmin(tenantId);
      this.workflowNotify.notifyApprover({
        tenantId,
        approver: hrAdmin,
        title: 'Gate pass awaiting HR approval',
        message: `${staff?.name ?? 'Staff'} gate pass was approved by HOD and needs HR sign-off.`,
        actionLink: '/hr/gate-passes',
        category: 'HR',
        requesterName: staff?.name,
      });
      return saved;
    }

    if (pass.status === 'PENDING_HR') {
      const hrAdmin = await this.workflowRouting.getHrAdmin(tenantId);
      if (hrAdmin.userId !== actorUserId) {
        throw new ForbiddenException(
          'Only HR admin can finalize this gate pass',
        );
      }
      pass.status = status === 'APPROVED' ? 'APPROVED' : 'REJECTED';
      const saved = await this.gatePasses.save(pass);
      if (staff?.tenant_id) {
        this.notify.gatePassUpdated({
          tenantId: staff.tenant_id,
          userId: pass.staff_user_id,
          status: status === 'APPROVED' ? 'APPROVED' : 'REJECTED',
          actionLink: '/faculty/gate-pass',
        });
      }
      return saved;
    }

    throw new BadRequestException(
      `Cannot act on gate pass in status ${pass.status}`,
    );
  }

  private countWeekdaysInMonth(year: number, month: number): number {
    const daysInMonth = new Date(year, month, 0).getDate();
    let count = 0;
    for (let day = 1; day <= daysInMonth; day += 1) {
      const dow = new Date(year, month - 1, day).getDay();
      if (dow !== 0 && dow !== 6) count += 1;
    }
    return count;
  }

  private expandDateRange(start: string, end: string): string[] {
    const dates: string[] = [];
    const cursor = new Date(start);
    const last = new Date(end);
    while (cursor <= last) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  }

  private weekdayDatesInMonth(year: number, month: number): string[] {
    const daysInMonth = new Date(year, month, 0).getDate();
    const dates: string[] = [];
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month - 1, day);
      const dow = date.getDay();
      if (dow !== 0 && dow !== 6) {
        dates.push(date.toISOString().slice(0, 10));
      }
    }
    return dates;
  }

  private monthLabel(year: number, month: number): string {
    return new Date(year, month - 1, 1).toLocaleString('en-US', {
      month: 'long',
    });
  }

  async getDashboardMetrics(tenantId: string, entityId: number) {
    const today = new Date().toISOString().slice(0, 10);
    const staffUsers = await this.users
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .where('user.tenant_id = :tenantId', { tenantId })
      .andWhere('user.is_active = true')
      .andWhere("role.role_name NOT IN ('Student', 'Applicant')")
      .andWhere(
        `user.user_id IN (
          SELECT p.user_id FROM hr_employee_profiles p
          WHERE p.tenant_id = :tenantId AND p.entity_id = :entityId
        )`,
        { tenantId, entityId },
      )
      .getMany();

    const staffIds = staffUsers.map((u) => u.user_id);
    const presentToday =
      staffIds.length === 0
        ? 0
        : await this.staffAttendance
            .createQueryBuilder('attendance')
            .where('attendance.user_id IN (:...staffIds)', { staffIds })
            .andWhere('attendance.work_date = :today', { today })
            .andWhere('attendance.check_in_at IS NOT NULL')
            .getCount();

    const onLeaveToday =
      staffIds.length === 0
        ? 0
        : await this.staffLeaveRequests
            .createQueryBuilder('leave')
            .where('leave.tenant_id = :tenantId', { tenantId })
            .andWhere('leave.staff_user_id IN (:...staffIds)', { staffIds })
            .andWhere('leave.status IN (:...statuses)', {
              statuses: ['PENDING', 'HOD_APPROVED', 'HR_APPROVED'],
            })
            .andWhere(
              'leave.start_date <= :today AND leave.end_date >= :today',
              { today },
            )
            .getCount();

    const [pendingLeaves, pendingGatePasses] = await Promise.all([
      this.staffLeaveRequests.count({
        where: [
          { tenant_id: tenantId, status: 'PENDING' as const },
          { tenant_id: tenantId, status: 'HOD_APPROVED' as const },
        ],
      }),
      this.gatePasses.count({
        where: { tenant_id: tenantId, status: 'PENDING' },
      }),
    ]);

    return {
      headcount: staffUsers.length,
      present_today: presentToday,
      on_leave_today: onLeaveToday,
      pending_actions: pendingLeaves + pendingGatePasses,
      pending_leaves: pendingLeaves,
      pending_gate_passes: pendingGatePasses,
    };
  }

  async listEmployees(tenantId: string) {
    const rows = await this.users
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .leftJoinAndSelect('user.department', 'department')
      .where('user.tenant_id = :tenantId', { tenantId })
      .andWhere("role.role_name NOT IN ('Student', 'Applicant')")
      .orderBy('user.name', 'ASC')
      .getMany();

    const officerIds = rows
      .map((row) => row.reporting_officer_id)
      .filter((id): id is string => Boolean(id));
    const officers =
      officerIds.length > 0
        ? await this.users.findBy({ user_id: In(officerIds) })
        : [];
    const officerMap = new Map(officers.map((o) => [o.user_id, o]));

    return rows.map((row) => ({
      user_id: row.user_id,
      name: row.name,
      email: row.email,
      role: row.role?.role_name ?? null,
      role_id: row.role_id,
      department: row.department?.dept_name ?? null,
      dept_id: row.dept_id,
      salary_base: row.salary_base,
      reporting_officer_id: row.reporting_officer_id,
      reporting_officer_name: row.reporting_officer_id
        ? (officerMap.get(row.reporting_officer_id)?.name ?? null)
        : null,
      is_active: row.is_active,
    }));
  }

  async getEmployeeProfile(tenantId: string, userId: string) {
    const employee = await this.users.findOne({
      where: { user_id: userId, tenant_id: tenantId },
      relations: ['role', 'department'],
    });
    if (!employee) throw new NotFoundException('Employee not found');
    const [attendance, leaves, payslips] = await Promise.all([
      this.listAttendanceCalendar(userId, new Date().toISOString().slice(0, 7)),
      this.listMyStaffLeaves(userId, tenantId),
      this.listMyPayslips(userId, tenantId),
    ]);
    return {
      personal: {
        user_id: employee.user_id,
        name: employee.name,
        email: employee.email,
        role: employee.role?.role_name ?? null,
        department: employee.department?.dept_name ?? null,
        active: employee.is_active,
      },
      bank_tax: {
        pan: 'AAAAA0000A',
        bank_account_status: 'Verified',
        salary_base: employee.salary_base,
      },
      assets: [
        {
          asset: 'Laptop',
          serial: `FAL-${employee.user_id.slice(0, 6).toUpperCase()}`,
          status: 'Assigned',
        },
        {
          asset: 'ID Card',
          serial: `SGVU-${employee.user_id.slice(0, 4).toUpperCase()}`,
          status: 'Printed',
        },
      ],
      employment_history: [
        {
          event: 'Joined SGVU',
          date: employee.created_at,
          status: 'Completed',
        },
        {
          event: 'Current Role',
          date: employee.updated_at,
          status: employee.role?.role_name ?? 'Assigned',
        },
      ],
      attendance,
      leaves,
      payslips,
    };
  }

  async updateEmployee(
    tenantId: string,
    userId: string,
    dto: {
      role_id?: number;
      dept_id?: number;
      salary_base?: string;
      reporting_officer_id?: string | null;
    },
  ) {
    const user = await this.users.findOne({
      where: { user_id: userId, tenant_id: tenantId },
      relations: ['role'],
    });
    if (!user) throw new NotFoundException('Employee not found');

    const deptChanged = dto.dept_id !== undefined;
    const roleChanged = dto.role_id !== undefined;
    const explicitReportingOfficer = dto.reporting_officer_id;

    if (dto.role_id !== undefined) user.role_id = dto.role_id;
    if (dto.dept_id !== undefined) user.dept_id = dto.dept_id;
    if (dto.salary_base !== undefined) user.salary_base = dto.salary_base;

    if (explicitReportingOfficer !== undefined) {
      user.reporting_officer_id = explicitReportingOfficer;
    } else if (deptChanged || roleChanged) {
      let roleName = user.role?.role_name;
      if (roleChanged && user.role_id) {
        const roleRows = await this.users.manager.query<
          Array<{ role_name: string }>
        >(`SELECT role_name FROM roles WHERE role_id = $1 LIMIT 1`, [
          user.role_id,
        ]);
        roleName = roleRows[0]?.role_name ?? roleName;
      }

      const hodUserId = await fetchDepartmentHodUserId(
        (sql, params) => this.users.manager.query(sql, params),
        user.dept_id,
      );

      user.reporting_officer_id = resolveDefaultReportingOfficerId({
        roleName,
        hodUserId,
        employeeUserId: user.user_id,
      });
    }

    // Resolve subject role name for pillar checks
    let subjectRole = user.role?.role_name ?? null;
    if (user.role_id) {
      const roleRows = await this.users.manager.query<
        Array<{ role_name: string }>
      >(`SELECT role_name FROM roles WHERE role_id = $1 LIMIT 1`, [user.role_id]);
      subjectRole = roleRows[0]?.role_name ?? subjectRole;
    }

    if (subjectRole && user.reporting_officer_id) {
      await this.assertPillarReportingAllowed(
        tenantId,
        user.user_id,
        subjectRole,
        user.reporting_officer_id,
      );
    }

    await this.users.save(user);
    return this.listEmployees(tenantId).then((all) =>
      all.find((row) => row.user_id === userId),
    );
  }

  /** Anti-collusion: Finance↛COO, Procurement≠Stores manager, Auditor→Chairman */
  private async assertPillarReportingAllowed(
    tenantId: string,
    subjectUserId: string,
    subjectRole: string,
    officerId: string,
  ) {
    const officer = await this.users.findOne({
      where: { user_id: officerId, tenant_id: tenantId },
      relations: ['role'],
    });
    if (!officer) {
      throw new BadRequestException('reporting_officer_id not found');
    }

    const chainRoles: string[] = [];
    let cursor: string | null = officerId;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      const row = await this.users.manager.query(
        `SELECT u.user_id, u.reporting_officer_id, r.role_name
         FROM users u LEFT JOIN roles r ON r.role_id = u.role_id
         WHERE u.user_id = $1 AND u.tenant_id = $2`,
        [cursor, tenantId],
      );
      if (!row[0]) break;
      if (row[0].role_name) chainRoles.push(String(row[0].role_name));
      cursor = row[0].reporting_officer_id ?? null;
      if (seen.size > 20) break;
    }

    const peers = await this.users.manager.query(
      `SELECT r.role_name FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND u.reporting_officer_id = $2
         AND u.user_id <> $3 AND u.is_active = true`,
      [tenantId, officerId, subjectUserId],
    );

    const existingRoles = await this.users.manager.query(
      `SELECT r.role_name FROM user_roles ur
       JOIN roles r ON r.role_id = ur.role_id
       WHERE ur.user_id = $1`,
      [subjectUserId],
    );

    const violation = validatePillarReporting({
      subjectRole,
      officerRole: officer.role?.role_name ?? null,
      officerChainRoles: chainRoles,
      managerId: officerId,
      peersUnderSameManager: peers.map((p: { role_name: string }) => ({
        role_name: p.role_name,
      })),
      existingPrimaryRoles: existingRoles.map(
        (r: { role_name: string }) => r.role_name,
      ),
    });
    if (violation) {
      throw new BadRequestException({
        message: violation.message,
        code: violation.code,
      });
    }
  }

  async getAttendanceMatrix(tenantId: string, month: string) {
    const [year, monthValue] = month.split('-').map(Number);
    const start = `${year}-${String(monthValue).padStart(2, '0')}-01`;
    const end = new Date(year, monthValue, 0).toISOString().slice(0, 10);

    const staffUsers = await this.users
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .where('user.tenant_id = :tenantId', { tenantId })
      .andWhere("role.role_name NOT IN ('Student', 'Applicant')")
      .orderBy('user.name', 'ASC')
      .getMany();

    const staffIds = staffUsers.map((u) => u.user_id);
    if (staffIds.length === 0) {
      return { month, employees: [] };
    }

    const [attendanceRows, leaveRows] = await Promise.all([
      this.staffAttendance
        .createQueryBuilder('attendance')
        .where('attendance.user_id IN (:...staffIds)', { staffIds })
        .andWhere('attendance.work_date BETWEEN :start AND :end', {
          start,
          end,
        })
        .getMany(),
      this.staffLeaveRequests
        .createQueryBuilder('leave')
        .where('leave.tenant_id = :tenantId', { tenantId })
        .andWhere('leave.staff_user_id IN (:...staffIds)', { staffIds })
        .andWhere('leave.status IN (:...statuses)', {
          statuses: ['PENDING', 'HOD_APPROVED', 'HR_APPROVED'],
        })
        .andWhere('leave.start_date <= :end AND leave.end_date >= :start', {
          start,
          end,
        })
        .getMany(),
    ]);

    const attendanceByUser = new Map<string, Map<string, StaffAttendance>>();
    for (const row of attendanceRows) {
      if (!attendanceByUser.has(row.user_id)) {
        attendanceByUser.set(row.user_id, new Map());
      }
      attendanceByUser.get(row.user_id)!.set(row.work_date, row);
    }

    const leaveByUser = new Map<string, StaffLeaveRequest[]>();
    for (const row of leaveRows) {
      if (!leaveByUser.has(row.staff_user_id)) {
        leaveByUser.set(row.staff_user_id, []);
      }
      leaveByUser.get(row.staff_user_id)!.push(row);
    }

    const weekdayDates = this.weekdayDatesInMonth(year, monthValue);

    const employees = staffUsers.map((staff) => {
      const userAttendance = attendanceByUser.get(staff.user_id) ?? new Map();
      const userLeaves = leaveByUser.get(staff.user_id) ?? [];

      const days = weekdayDates.map((date) => {
        const leave = userLeaves.find((row) => {
          const range = this.expandDateRange(row.start_date, row.end_date);
          return range.includes(date);
        });
        if (leave) {
          return { date, status: 'LEAVE', leave_status: leave.status };
        }
        const attendance = userAttendance.get(date);
        if (attendance?.check_in_at) {
          return { date, status: 'PRESENT' };
        }
        return { date, status: 'ABSENT' };
      });

      return {
        user_id: staff.user_id,
        name: staff.name,
        email: staff.email,
        role: staff.role?.role_name ?? null,
        days,
      };
    });

    return { month, employees };
  }

  listHolidays() {
    return this.users.manager.query(
      `SELECT holiday_id, title AS name, date AS start_date, date AS end_date, type, description
       FROM hr_holidays
       WHERE date >= CURRENT_DATE
       ORDER BY date ASC
       LIMIT 40`,
    );
  }

  listAllStaffLeaves(
    tenantId: string,
    entityId: number,
    status?: StaffLeaveRequest['status'],
  ) {
    const qb = this.staffLeaveRequests
      .createQueryBuilder('leave')
      .leftJoinAndSelect('leave.staff', 'staff')
      .where('leave.tenant_id = :tenantId', { tenantId })
      .andWhere(
        `leave.staff_user_id IN (
          SELECT p.user_id FROM hr_employee_profiles p
          WHERE p.tenant_id = :tenantId AND p.entity_id = :entityId
        )`,
        { tenantId, entityId },
      )
      .orderBy('leave.applied_at', 'DESC');
    if (status) qb.andWhere('leave.status = :status', { status });
    return qb.getMany();
  }

  async getActionCenter(tenantId: string) {
    const [pendingLeaves, pendingGatePasses] = await Promise.all([
      this.staffLeaveRequests.find({
        where: [
          { tenant_id: tenantId, status: 'PENDING' },
          { tenant_id: tenantId, status: 'HOD_APPROVED' },
        ],
        relations: ['staff'],
        order: { applied_at: 'ASC' },
      }),
      this.gatePasses.find({
        where: { tenant_id: tenantId, status: 'PENDING' },
        relations: ['staff'],
        order: { out_time: 'ASC' },
      }),
    ]);

    return {
      pending_leaves: pendingLeaves,
      pending_gate_passes: pendingGatePasses,
    };
  }

  async runPayroll(tenantId: string, monthKey: string) {
    const [year, monthValue] = monthKey.split('-').map(Number);
    if (!year || !monthValue) {
      throw new BadRequestException('month must be YYYY-MM');
    }

    const workingDays = this.countWeekdaysInMonth(year, monthValue);
    const monthStart = `${year}-${String(monthValue).padStart(2, '0')}-01`;
    const monthEnd = new Date(year, monthValue, 0).toISOString().slice(0, 10);
    const monthName = this.monthLabel(year, monthValue);

    const staffUsers = await this.users
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .where('user.tenant_id = :tenantId', { tenantId })
      .andWhere('user.is_active = true')
      .andWhere('user.salary_base IS NOT NULL')
      .andWhere("role.role_name NOT IN ('Student', 'Applicant')")
      .getMany();

    const eligibleStaff = staffUsers.filter(
      (s) => Number(s.salary_base ?? 0) > 0,
    );
    const staffUserIds = eligibleStaff.map((s) => s.user_id);

    const presentCounts =
      staffUserIds.length > 0
        ? await this.staffAttendance
            .createQueryBuilder('attendance')
            .select('attendance.user_id', 'user_id')
            .addSelect('COUNT(*)', 'count')
            .where('attendance.user_id IN (:...ids)', { ids: staffUserIds })
            .andWhere(
              'attendance.work_date BETWEEN :monthStart AND :monthEnd',
              {
                monthStart,
                monthEnd,
              },
            )
            .andWhere('attendance.check_in_at IS NOT NULL')
            .groupBy('attendance.user_id')
            .getRawMany<{ user_id: string; count: string }>()
        : [];
    const presentByUser = new Map(
      presentCounts.map((r) => [r.user_id, Number(r.count)]),
    );

    const approvedLeaves =
      staffUserIds.length > 0
        ? await this.staffLeaveRequests
            .createQueryBuilder('leave')
            .where('leave.tenant_id = :tenantId', { tenantId })
            .andWhere('leave.staff_user_id IN (:...ids)', { ids: staffUserIds })
            .andWhere('leave.status = :status', { status: 'HR_APPROVED' })
            .andWhere(
              'leave.start_date <= :monthEnd AND leave.end_date >= :monthStart',
              {
                monthStart,
                monthEnd,
              },
            )
            .getMany()
        : [];
    const leavesByUser = new Map<string, typeof approvedLeaves>();
    for (const leave of approvedLeaves) {
      const list = leavesByUser.get(leave.staff_user_id) ?? [];
      list.push(leave);
      leavesByUser.set(leave.staff_user_id, list);
    }

    const existingPayslips =
      staffUserIds.length > 0
        ? await this.payslips.find({
            where: {
              tenant_id: tenantId,
              staff_user_id: In(staffUserIds),
              month: monthName,
              year,
            },
          })
        : [];
    const payslipByUser = new Map(
      existingPayslips.map((p) => [p.staff_user_id, p]),
    );

    const results: Array<{
      payslip_id: string;
      staff_user_id: string;
      staff_name: string;
      month: string;
      year: number;
      gross_pay: string | null;
      net_pay: string | null;
      working_days: number | null;
      lwp_days: string | null;
      is_published: boolean;
    }> = [];
    const toSave: StaffPayslip[] = [];

    for (const staff of eligibleStaff) {
      const salaryBase = Number(staff.salary_base ?? 0);
      const presentDays = presentByUser.get(staff.user_id) ?? 0;
      const staffLeaves = leavesByUser.get(staff.user_id) ?? [];

      let paidLeaveDays = 0;
      for (const leave of staffLeaves) {
        const dates = this.expandDateRange(
          leave.start_date,
          leave.end_date,
        ).filter((date) => {
          const d = new Date(date);
          return (
            d.getFullYear() === year &&
            d.getMonth() === monthValue - 1 &&
            d.getDay() !== 0 &&
            d.getDay() !== 6
          );
        });
        paidLeaveDays += dates.length;
      }

      const lwpDays = Math.max(0, workingDays - presentDays - paidLeaveDays);
      const dailyRate = salaryBase / workingDays;
      const netPay = Number((salaryBase - dailyRate * lwpDays).toFixed(2));

      let payslip = payslipByUser.get(staff.user_id);
      if (payslip) {
        payslip.gross_pay = salaryBase.toFixed(2);
        payslip.net_pay = netPay.toFixed(2);
        payslip.working_days = workingDays;
        payslip.lwp_days = lwpDays.toFixed(2);
      } else {
        payslip = this.payslips.create({
          tenant_id: tenantId,
          staff_user_id: staff.user_id,
          month: monthName,
          year,
          gross_pay: salaryBase.toFixed(2),
          net_pay: netPay.toFixed(2),
          working_days: workingDays,
          lwp_days: lwpDays.toFixed(2),
          file_path: '',
          is_published: false,
        });
      }
      payslip.file_path = await this.ensurePayslipPdfOnDisk(payslip, {
        name: staff.name,
      });
      toSave.push(payslip);
    }

    const saved = toSave.length ? await this.payslips.save(toSave) : [];

    const payrollTotal = saved.reduce(
      (sum, slip) => sum + Number(slip.net_pay ?? 0),
      0,
    );
    await this.financeLedger.postPayrollDisbursement(
      tenantId,
      monthKey,
      payrollTotal,
    );
    for (const slip of saved) {
      const staff = eligibleStaff.find((s) => s.user_id === slip.staff_user_id);
      results.push({
        payslip_id: slip.payslip_id,
        staff_user_id: slip.staff_user_id,
        staff_name: staff?.name ?? '',
        month: monthName,
        year,
        gross_pay: slip.gross_pay,
        net_pay: slip.net_pay,
        working_days: slip.working_days,
        lwp_days: slip.lwp_days,
        is_published: slip.is_published,
      });
    }

    return {
      month: monthKey,
      working_days: workingDays,
      generated: results.length,
      payslips: results,
    };
  }

  async queuePayrollRun(
    tenantId: string,
    monthKey: string,
    startedByUserId?: string,
  ) {
    const staffCount = await this.users
      .createQueryBuilder('user')
      .leftJoin('user.role', 'role')
      .where('user.tenant_id = :tenantId', { tenantId })
      .andWhere('user.is_active = true')
      .andWhere("role.role_name NOT IN ('Student', 'Applicant')")
      .getCount();
    const jobId = `payroll-${monthKey}-${Date.now()}`;
    await this.payrollQueue.add(
      'run',
      { jobId, tenantId, monthKey, startedByUserId },
      { jobId, removeOnComplete: 100, removeOnFail: 50 },
    );
    return {
      statusCode: 202,
      queued: true,
      job_id: jobId,
      month: monthKey,
      total_staff: staffCount,
      processed_staff: 0,
      progress: 0,
      started_by_user_id: startedByUserId ?? null,
      message:
        'Payroll run queued. BullMQ worker will calculate LWP, PF, taxes, and payslip PDFs.',
    };
  }

  listPayrollPayslips(tenantId: string, entityId: number, month?: string) {
    const qb = this.payslips
      .createQueryBuilder('payslip')
      .leftJoinAndSelect('payslip.staff', 'staff')
      .where('payslip.tenant_id = :tenantId', { tenantId })
      .andWhere(
        `payslip.staff_user_id IN (
          SELECT p.user_id FROM hr_employee_profiles p
          WHERE p.tenant_id = :tenantId AND p.entity_id = :entityId
        )`,
        { tenantId, entityId },
      )
      .orderBy('payslip.year', 'DESC')
      .addOrderBy('payslip.generated_at', 'DESC');

    if (month) {
      const [year, monthValue] = month.split('-').map(Number);
      qb.andWhere('payslip.year = :year', { year }).andWhere(
        'payslip.month = :month',
        {
          month: this.monthLabel(year, monthValue),
        },
      );
    }

    return qb.getMany();
  }

  async publishPayslip(tenantId: string, payslipId: string) {
    const payslip = await this.payslips.findOne({
      where: { payslip_id: payslipId, tenant_id: tenantId },
    });
    if (!payslip) throw new NotFoundException('Payslip not found');
    payslip.is_published = true;
    payslip.published_at = new Date();
    return this.payslips.save(payslip);
  }

  async actOnStaffLeave(
    leaveId: string,
    tenantId: string,
    status: 'HOD_APPROVED' | 'HR_APPROVED' | 'REJECTED',
    actor?: {
      user_id: string;
      role?: string;
      roles?: string[];
      dept_id?: number;
    },
  ) {
    const leave = await this.staffLeaveRequests.findOne({
      where: { leave_id: leaveId, tenant_id: tenantId },
      relations: ['staff'],
    });
    if (!leave) throw new NotFoundException('Leave request not found');
    const actorRoles = actor?.roles ?? (actor?.role ? [actor.role] : []);
    if (
      actorRoles.includes('HOD') &&
      !actorRoles.includes('HR') &&
      !actorRoles.includes('SuperAdmin')
    ) {
      const hodDepartments = await this.users.manager.query(
        `SELECT dept_id FROM departments WHERE hod_user_id = $1`,
        [actor?.user_id],
      );
      const allowedDeptIds = new Set<number>([
        ...hodDepartments.map((row: { dept_id: number }) =>
          Number(row.dept_id),
        ),
        ...(actor?.dept_id ? [actor.dept_id] : []),
      ]);
      if (!leave.staff?.dept_id || !allowedDeptIds.has(leave.staff.dept_id)) {
        throw new ForbiddenException(
          'HOD can act only on faculty from their department',
        );
      }
    }
    const profile = await this.users.manager.query(
      `SELECT entity_id FROM hr_employee_profiles WHERE user_id = $1 AND tenant_id = $2`,
      [leave.staff_user_id, tenantId],
    );
    const entityId = Number(profile[0]?.entity_id ?? leave.entity_id ?? 1);

    if (status === 'REJECTED') {
      leave.status = 'REJECTED';
      leave.current_approver_user_id = null;
      return this.staffLeaveRequests.save(leave);
    }

    if (leave.current_approver_user_id && actor?.user_id) {
      this.hrWorkflow.assertActorIsCurrentApprover(
        actor.user_id,
        leave.current_approver_user_id,
      );
    }

    const next = await this.hrWorkflow.advanceAfterApproval(
      tenantId,
      entityId,
      leave.request_type ?? 'LEAVE',
      leave.staff_user_id,
      leave.current_step_order,
    );

    if (next.is_final) {
      leave.status = 'HR_APPROVED';
      leave.current_approver_user_id = null;
    } else {
      leave.status = 'PENDING';
      leave.current_step_order = next.step_order;
      leave.current_approver_user_id = next.approver_user_id;
    }

    return this.staffLeaveRequests.save(leave);
  }

  async hodApproveStaffLeave(
    leaveId: string,
    tenantId: string,
    actor: {
      user_id: string;
      role?: string;
      roles?: string[];
      dept_id?: number;
    },
  ) {
    const leave = await this.staffLeaveRequests.findOne({
      where: { leave_id: leaveId, tenant_id: tenantId },
      relations: ['staff'],
    });
    if (!leave) throw new NotFoundException('Leave request not found');
    if (leave.status !== 'PENDING') {
      throw new BadRequestException('Leave request has already been processed');
    }

    const actorRoles = actor.roles ?? (actor.role ? [actor.role] : []);
    if (
      actorRoles.includes('HOD') &&
      !actorRoles.includes('HR') &&
      !actorRoles.includes('SuperAdmin')
    ) {
      const hodDepartments = await this.users.manager.query(
        `SELECT dept_id FROM departments WHERE hod_user_id = $1`,
        [actor.user_id],
      );
      const allowedDeptIds = new Set<number>([
        ...hodDepartments.map((row: { dept_id: number }) =>
          Number(row.dept_id),
        ),
        ...(actor.dept_id ? [actor.dept_id] : []),
      ]);
      if (!leave.staff?.dept_id || !allowedDeptIds.has(leave.staff.dept_id)) {
        throw new ForbiddenException(
          'HOD can act only on faculty from their department',
        );
      }
    }

    const profile = await this.users.manager.query(
      `SELECT entity_id FROM hr_employee_profiles WHERE user_id = $1 AND tenant_id = $2`,
      [leave.staff_user_id, tenantId],
    );
    const entityId = Number(profile[0]?.entity_id ?? leave.entity_id ?? 1);

    if (leave.current_approver_user_id && actor.user_id) {
      this.hrWorkflow.assertActorIsCurrentApprover(
        actor.user_id,
        leave.current_approver_user_id,
      );
    }

    const next = await this.hrWorkflow.advanceAfterApproval(
      tenantId,
      entityId,
      leave.request_type ?? 'LEAVE',
      leave.staff_user_id,
      leave.current_step_order,
    );

    if (next.is_final) {
      leave.status = 'HR_APPROVED';
      leave.current_approver_user_id = null;
    } else {
      leave.status = 'HOD_APPROVED';
      leave.current_step_order = next.step_order;
      leave.current_approver_user_id = next.approver_user_id;
    }

    const saved = await this.staffLeaveRequests.save(leave);
    const staff =
      leave.staff ??
      (await this.users.findOne({ where: { user_id: leave.staff_user_id } }));
    if (staff?.tenant_id) {
      this.notify.leaveApproved({
        tenantId: staff.tenant_id,
        userId: leave.staff_user_id,
        title: 'Leave approved by HOD',
        message:
          'Your leave request was approved by your HOD and forwarded for final processing.',
        actionLink: '/faculty/hr',
      });
    }
    if (next.approver_user_id && staff) {
      this.workflowNotify.notifyApprover({
        tenantId,
        approver: {
          userId: next.approver_user_id,
          email: '',
          name: 'Approver',
          routeReason: 'HR_LEAVE',
        },
        title: 'Leave awaiting HR approval',
        message: `${staff.name} leave was HOD-approved and needs HR sign-off.`,
        actionLink: '/hr/leaves',
        category: 'HR',
        requesterName: staff.name,
      });
    }
    return saved;
  }

  async hodRejectStaffLeave(
    leaveId: string,
    tenantId: string,
    actor: {
      user_id: string;
      role?: string;
      roles?: string[];
      dept_id?: number;
    },
    remarks: string,
  ) {
    if (!remarks?.trim()) {
      throw new BadRequestException('Rejection remarks are required');
    }
    const leave = await this.staffLeaveRequests.findOne({
      where: { leave_id: leaveId, tenant_id: tenantId },
      relations: ['staff'],
    });
    if (!leave) throw new NotFoundException('Leave request not found');
    if (leave.status !== 'PENDING') {
      throw new BadRequestException('Leave request has already been processed');
    }

    const actorRoles = actor.roles ?? (actor.role ? [actor.role] : []);
    if (
      actorRoles.includes('HOD') &&
      !actorRoles.includes('HR') &&
      !actorRoles.includes('SuperAdmin')
    ) {
      const hodDepartments = await this.users.manager.query(
        `SELECT dept_id FROM departments WHERE hod_user_id = $1`,
        [actor.user_id],
      );
      const allowedDeptIds = new Set<number>([
        ...hodDepartments.map((row: { dept_id: number }) =>
          Number(row.dept_id),
        ),
        ...(actor.dept_id ? [actor.dept_id] : []),
      ]);
      if (!leave.staff?.dept_id || !allowedDeptIds.has(leave.staff.dept_id)) {
        throw new ForbiddenException(
          'HOD can act only on faculty from their department',
        );
      }
    }

    leave.status = 'REJECTED';
    leave.approver_remarks = remarks.trim();
    leave.current_approver_user_id = null;
    const saved = await this.staffLeaveRequests.save(leave);

    const staff =
      leave.staff ??
      (await this.users.findOne({ where: { user_id: leave.staff_user_id } }));
    if (staff?.tenant_id) {
      this.notify.leaveApproved({
        tenantId: staff.tenant_id,
        userId: leave.staff_user_id,
        title: 'Leave rejected',
        message: `Your leave request was rejected. Reason: ${remarks.trim()}`,
        actionLink: '/faculty/hr',
      });
    }
    return saved;
  }

  async listSalaryStructures(tenantId: string, entityId: number) {
    return this.users.manager.query(
      `SELECT s.*, u.name AS employee_name, u.official_email AS employee_email
       FROM hr_salary_structures s
       LEFT JOIN users u ON u.user_id = s.assigned_user_id
       WHERE s.tenant_id = $1 AND (s.entity_id = $2 OR s.entity_id IS NULL)
       ORDER BY s.structure_name ASC`,
      [tenantId, entityId],
    );
  }

  async listRecruitmentJobs(tenantId: string, entityId: number) {
    return this.users.manager.query(
      `SELECT j.*, d.dept_name AS department_name
       FROM hr_job_postings j
       LEFT JOIN departments d ON d.dept_id = j.department_id
       WHERE j.tenant_id = $1 AND j.entity_id = $2
       ORDER BY j.created_at DESC`,
      [tenantId, entityId],
    );
  }

  async createRecruitmentJob(
    tenantId: string,
    createdByUserId: string,
    dto: {
      title?: string;
      department_id?: number;
      openings?: number;
      employment_type?: string;
      description?: string;
    },
  ) {
    const rows = await this.users.manager.query(
      `INSERT INTO hr_job_postings
        (tenant_id, title, department_id, openings, employment_type, description, created_by_user_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPEN')
       RETURNING *`,
      [
        tenantId,
        dto.title ?? 'New Faculty Opening',
        dto.department_id ?? null,
        dto.openings ?? 1,
        dto.employment_type ?? 'FULL_TIME',
        dto.description ?? null,
        createdByUserId,
      ],
    );
    return rows[0];
  }

  async listRecruitmentPipeline(tenantId: string, entityId: number) {
    const applicants = await this.users.manager.query(
      `SELECT a.*, j.title AS job_title
       FROM hr_applicants a
       LEFT JOIN hr_job_postings j ON j.job_id = a.job_id
       WHERE a.tenant_id = $1 AND a.entity_id = $2
         AND a.hired_user_id IS NULL
       ORDER BY a.created_at ASC`,
      [tenantId, entityId],
    );
    const stages = [
      'APPLIED',
      'SHORTLISTED',
      'INTERVIEW_SCHEDULED',
      'OFFERED',
      'HIRED',
    ];
    return {
      stages: stages.map((stage) => ({
        id: stage,
        title: stage.replaceAll('_', ' '),
        cards: applicants.filter(
          (row: { stage: string }) => row.stage === stage,
        ),
      })),
    };
  }

  async moveApplicant(tenantId: string, applicantId: string, stage: string) {
    const rows = await this.users.manager.query(
      `UPDATE hr_applicants
       SET stage = $1, updated_at = NOW()
       WHERE tenant_id = $2 AND applicant_id = $3
       RETURNING *`,
      [stage, tenantId, applicantId],
    );
    if (!rows[0]) throw new NotFoundException('Applicant not found');
    return rows[0];
  }

  listClearanceTasks(
    tenantId: string,
    lifecycleType: 'ONBOARDING' | 'OFFBOARDING',
  ) {
    return this.users.manager.query(
      `SELECT t.*, u.name AS employee_name, a.name AS applicant_name, a.email AS applicant_email
       FROM hr_clearance_tasks t
       LEFT JOIN users u ON u.user_id = t.employee_user_id
       LEFT JOIN hr_applicants a ON a.applicant_id = t.applicant_id
       WHERE t.tenant_id = $1 AND t.lifecycle_type = $2
       ORDER BY t.created_at DESC`,
      [tenantId, lifecycleType],
    );
  }

  listAppraisalCycles(tenantId: string) {
    return this.users.manager.query(
      `SELECT c.*, COUNT(k.submission_id)::int AS submissions
       FROM hr_appraisal_cycles c
       LEFT JOIN hr_kpi_submissions k ON k.cycle_id = c.cycle_id
       WHERE c.tenant_id = $1
       GROUP BY c.cycle_id
       ORDER BY c.start_date DESC`,
      [tenantId],
    );
  }

  listFacultyKpis(tenantId: string) {
    return this.users.manager.query(
      `SELECT k.*, c.name AS cycle_name, u.name AS employee_name, u.official_email AS employee_email
       FROM hr_kpi_submissions k
       JOIN hr_appraisal_cycles c ON c.cycle_id = k.cycle_id
       JOIN users u ON u.user_id = k.employee_user_id
       WHERE k.tenant_id = $1
       ORDER BY k.submitted_at DESC`,
      [tenantId],
    );
  }
}
