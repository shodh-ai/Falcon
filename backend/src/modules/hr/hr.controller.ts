import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { HrService } from './hr.service';
import { HrAdminService } from './hr-admin.service';
import { HrWorkforceService } from './hr-workforce.service';
import type { StaffRequestType } from '../../entities/staff-leave-request.entity';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { LeaveActionDto } from './dto/leave-action.dto';
import { RunPayrollDto, UpdateEmployeeDto } from './dto/hr-operations.dto';
import type { LeaveRequestStatus } from '../../entities/leave-request.entity';
import type { StaffLeaveStatus } from '../../entities/staff-leave-request.entity';

type AuthUser = { user_id: string; tenant_id?: string; role?: string; roles?: string[]; dept_id?: number };

@Controller(['hr', 'api/hr'])
@UseGuards(JwtAuthGuard, RolesGuard)
export class HrController {
  constructor(
    private readonly hr: HrService,
    private readonly hrAdmin: HrAdminService,
    private readonly workforce: HrWorkforceService,
  ) {}

  @Post('leaves')
  createLeave(@Body() dto: CreateLeaveRequestDto) {
    return this.hr.createLeaveRequest(dto);
  }

  @Get('leaves')
  listLeaves(
    @Query('userId') userId?: string,
    @Query('status') status?: LeaveRequestStatus,
  ) {
    return this.hr.listLeaveRequests(userId, status);
  }

  @Patch('leaves/:id/action')
  @Roles('HOD', 'Dean', 'HR', 'SuperAdmin')
  act(@Param('id') id: string, @Body() dto: LeaveActionDto) {
    return this.hr.actOnLeave(id, dto);
  }

  @Get('balances/:userId')
  balances(@Param('userId') userId: string) {
    return this.hr.listBalances(userId);
  }

  @Post('staff-attendance/:userId/check-in')
  @Roles('HR', 'SuperAdmin', 'Faculty', 'HOD')
  checkIn(@Param('userId') userId: string, @Body('work_date') workDate: string) {
    return this.hr.recordStaffAttendance(userId, workDate);
  }

  @Post('attendance/web-punch')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'SuperAdmin')
  webPunch(@Req() req: { user: AuthUser }, @Body('action') action?: 'IN' | 'OUT') {
    return this.hr.webPunch(req.user.user_id, action);
  }

  @Get('attendance/my-summary')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'SuperAdmin')
  myAttendanceSummary(@Req() req: { user: AuthUser }) {
    return this.hr.getAttendanceSummary(req.user.user_id);
  }

  @Get('attendance/my-calendar')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'SuperAdmin')
  myAttendanceCalendar(@Req() req: { user: AuthUser }, @Query('month') month: string) {
    return this.hr.listAttendanceCalendar(
      req.user.user_id,
      month ?? new Date().toISOString().slice(0, 7),
    );
  }

  @Post('leaves/apply')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'SuperAdmin')
  applyLeave(
    @Req() req: { user: AuthUser },
    @Body() dto: { leave_type: string; start_date: string; end_date: string; reason?: string },
  ) {
    return this.hr.applyStaffLeave(
      req.user.user_id,
      this.resolveTenantId(req.user),
      dto,
    );
  }

  @Get('leaves/my-requests')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'SuperAdmin')
  myStaffLeaves(@Req() req: { user: AuthUser }) {
    return this.hr.listMyStaffLeaves(req.user.user_id, this.resolveTenantId(req.user));
  }

  @Get('payslips/my-payslips')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'SuperAdmin')
  myPayslips(@Req() req: { user: AuthUser }) {
    return this.hr.listMyPayslips(req.user.user_id, this.resolveTenantId(req.user));
  }

  @Post('gate-passes')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'SuperAdmin')
  createGatePass(
    @Req() req: { user: AuthUser },
    @Body() dto: { out_time: string; expected_in_time: string; reason: string },
  ) {
    return this.hr.createGatePass(req.user.user_id, this.resolveTenantId(req.user), dto);
  }

  @Get('gate-passes/my')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'SuperAdmin')
  myGatePasses(@Req() req: { user: AuthUser }) {
    return this.hr.listMyGatePasses(req.user.user_id, this.resolveTenantId(req.user));
  }

  @Get('gate-passes/pending-approvals')
  @Roles('HOD', 'Dean', 'HR', 'SuperAdmin', 'Faculty')
  pendingGatePasses(@Req() req: { user: AuthUser }) {
    return this.hr.listPendingGatePassApprovals(req.user.user_id, this.resolveTenantId(req.user));
  }

  @Get('gate-passes/pending-hr')
  @Roles('HR', 'SuperAdmin')
  pendingHrGatePasses(@Req() req: { user: AuthUser }) {
    return this.hr.listPendingHrGatePasses(this.resolveTenantId(req.user));
  }

  @Patch('gate-passes/:passId/action')
  @Roles('HOD', 'Dean', 'HR', 'SuperAdmin', 'Faculty')
  actOnGatePass(
    @Param('passId') passId: string,
    @Req() req: { user: AuthUser },
    @Body('status') status: 'APPROVED' | 'REJECTED',
  ) {
    return this.hr.actOnGatePass(passId, req.user.user_id, this.resolveTenantId(req.user), status);
  }

  @Get('dashboard/metrics')
  @Roles('HR', 'SuperAdmin', 'President')
  dashboardMetrics(@Req() req: { user: AuthUser }) {
    return this.hr.getDashboardMetrics(this.resolveTenantId(req.user));
  }

  @Get('employees')
  @Roles('HR', 'SuperAdmin')
  listEmployees(@Req() req: { user: AuthUser }) {
    return this.hrAdmin.listDirectory(this.resolveTenantId(req.user));
  }

  @Get('directory')
  @Roles('HR', 'SuperAdmin')
  directory(@Req() req: { user: AuthUser }) {
    return this.hrAdmin.listDirectory(this.resolveTenantId(req.user));
  }

  @Get('employees/:userId/360')
  @Roles('HR', 'SuperAdmin')
  employee360(@Param('userId') userId: string, @Req() req: { user: AuthUser }) {
    return this.hrAdmin.getEmployee360(this.resolveTenantId(req.user), userId, false);
  }

  @Post('employees/:userId/kyc/reveal')
  @Roles('HR', 'SuperAdmin')
  revealKyc(
    @Param('userId') userId: string,
    @Req() req: { user: AuthUser },
    @Body('field_group') fieldGroup: 'PAN' | 'AADHAAR' | 'BANK' | 'ALL' = 'ALL',
  ) {
    return this.hrAdmin.revealKyc(
      this.resolveTenantId(req.user),
      userId,
      req.user.user_id,
      fieldGroup,
    );
  }

  @Patch('employees/:userId/master')
  @Roles('HR', 'SuperAdmin')
  updateEmployeeMaster(
    @Param('userId') userId: string,
    @Req() req: { user: AuthUser },
    @Body() body: Record<string, unknown>,
  ) {
    return this.hrAdmin.upsertEmployeeProfile(
      this.resolveTenantId(req.user),
      userId,
      body as Parameters<HrAdminService['upsertEmployeeProfile']>[2],
    );
  }

  @Get('leaves/balances-grid')
  @Roles('HR', 'SuperAdmin')
  leaveBalancesGrid(@Req() req: { user: AuthUser }, @Query('year') year?: string) {
    return this.hrAdmin.listLeaveBalancesGrid(
      this.resolveTenantId(req.user),
      year ? Number(year) : new Date().getFullYear(),
    );
  }

  @Post('leaves/balance-adjust')
  @Roles('HR', 'SuperAdmin')
  adjustLeaveBalance(@Req() req: { user: AuthUser }, @Body() body: Record<string, unknown>) {
    return this.hrAdmin.adjustLeaveBalance(
      this.resolveTenantId(req.user),
      body.user_id as string,
      body as Parameters<HrAdminService['adjustLeaveBalance']>[2],
    );
  }

  @Post('biometric-sync')
  @HttpCode(HttpStatus.OK)
  biometricSync(
    @Req() req: { user: AuthUser },
    @Body() body: { secret?: string; punches?: { employee_id: string; punch_time: string; device_id?: string; punch_type: 'IN' | 'OUT' }[] },
  ) {
    if (body.punches?.length) {
      this.hrAdmin.validateBiometricWebhook(body.secret);
    }
    const tenantId = this.resolveTenantId(req.user);
    if (body.punches?.length) {
      return this.hrAdmin.ingestBiometricPunches(tenantId, body.punches);
    }
    return this.hrAdmin.processBiometricLogs(tenantId);
  }

  @Get('payroll/packages')
  @Roles('HR', 'SuperAdmin')
  payPackages(@Req() req: { user: AuthUser }) {
    return this.hrAdmin.listPayPackages(this.resolveTenantId(req.user));
  }

  @Post('payroll/packages')
  @Roles('HR', 'SuperAdmin')
  upsertPayPackage(@Req() req: { user: AuthUser }, @Body() body: Record<string, unknown>) {
    return this.hrAdmin.upsertPayPackage(
      this.resolveTenantId(req.user),
      body as Parameters<HrAdminService['upsertPayPackage']>[1],
    );
  }

  @Get('appraisals/api-scores')
  @Roles('HR', 'SuperAdmin')
  apiScores(@Req() req: { user: AuthUser }, @Query('year') year?: string) {
    return this.hrAdmin.listAppraisalsWithApi(
      this.resolveTenantId(req.user),
      year ? Number(year) : new Date().getFullYear(),
    );
  }

  @Get('promotions/candidates')
  @Roles('HR', 'SuperAdmin')
  promotionCandidates(@Req() req: { user: AuthUser }) {
    return this.hrAdmin.listPromotionCandidates(this.resolveTenantId(req.user));
  }

  @Post('recruitment/applicants/:applicantId/hire')
  @Roles('HR', 'SuperAdmin')
  hireApplicant(
    @Param('applicantId') applicantId: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.hrAdmin.hireApplicant(
      this.resolveTenantId(req.user),
      applicantId,
      req.user.user_id,
    );
  }

  @Get('employees/:userId/profile')
  @Roles('HR', 'SuperAdmin')
  employeeProfile(@Param('userId') userId: string, @Req() req: { user: AuthUser }) {
    return this.hr.getEmployeeProfile(this.resolveTenantId(req.user), userId);
  }

  @Patch('employees/:userId')
  @Roles('HR', 'SuperAdmin')
  updateEmployee(
    @Param('userId') userId: string,
    @Req() req: { user: AuthUser },
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.hr.updateEmployee(this.resolveTenantId(req.user), userId, dto);
  }

  @Get('attendance/matrix')
  @Roles('HR', 'SuperAdmin')
  attendanceMatrix(@Req() req: { user: AuthUser }, @Query('month') month?: string) {
    return this.hr.getAttendanceMatrix(
      this.resolveTenantId(req.user),
      month ?? new Date().toISOString().slice(0, 7),
    );
  }

  @Get('leaves/all')
  @Roles('HR', 'SuperAdmin')
  allStaffLeaves(@Req() req: { user: AuthUser }, @Query('status') status?: StaffLeaveStatus) {
    return this.hr.listAllStaffLeaves(this.resolveTenantId(req.user), status);
  }

  @Get('holidays')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'SuperAdmin')
  holidays() {
    return this.workforce.listHolidaysGrouped();
  }

  @Get('action-center')
  @Roles('HR', 'SuperAdmin', 'President')
  actionCenter(@Req() req: { user: AuthUser }) {
    return this.hr.getActionCenter(this.resolveTenantId(req.user));
  }

  @Patch('staff-leaves/:leaveId/status')
  @Roles('HR', 'SuperAdmin', 'HOD')
  actOnStaffLeave(
    @Param('leaveId') leaveId: string,
    @Req() req: { user: AuthUser },
    @Body('status') status: 'HOD_APPROVED' | 'HR_APPROVED' | 'REJECTED',
  ) {
    return this.hr.actOnStaffLeave(leaveId, this.resolveTenantId(req.user), status, req.user);
  }

  @Post('payroll/run')
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles('HR', 'SuperAdmin')
  runPayroll(@Req() req: { user: AuthUser }, @Body() dto: RunPayrollDto) {
    return this.hr.queuePayrollRun(this.resolveTenantId(req.user), dto.month, req.user.user_id);
  }

  @Get('payroll/structures')
  @Roles('HR', 'SuperAdmin')
  salaryStructures(@Req() req: { user: AuthUser }) {
    return this.hr.listSalaryStructures(this.resolveTenantId(req.user));
  }

  @Get('payroll/payslips')
  @Roles('HR', 'SuperAdmin', 'President')
  listPayrollPayslips(@Req() req: { user: AuthUser }, @Query('month') month?: string) {
    return this.hr.listPayrollPayslips(this.resolveTenantId(req.user), month);
  }

  @Patch('payslips/:id/publish')
  @Roles('HR', 'SuperAdmin')
  publishPayslip(@Param('id') id: string, @Req() req: { user: AuthUser }) {
    return this.hr.publishPayslip(this.resolveTenantId(req.user), id);
  }

  @Get('recruitment/jobs')
  @Roles('HR', 'SuperAdmin')
  recruitmentJobs(@Req() req: { user: AuthUser }) {
    return this.hr.listRecruitmentJobs(this.resolveTenantId(req.user));
  }

  @Post('recruitment/jobs')
  @Roles('HR', 'SuperAdmin')
  createRecruitmentJob(
    @Req() req: { user: AuthUser },
    @Body() dto: { title?: string; department_id?: number; openings?: number; employment_type?: string; description?: string },
  ) {
    return this.hr.createRecruitmentJob(this.resolveTenantId(req.user), req.user.user_id, dto);
  }

  @Get('recruitment/pipeline')
  @Roles('HR', 'SuperAdmin')
  recruitmentPipeline(@Req() req: { user: AuthUser }) {
    return this.hr.listRecruitmentPipeline(this.resolveTenantId(req.user));
  }

  @Patch('recruitment/applicants/:applicantId/stage')
  @Roles('HR', 'SuperAdmin')
  moveApplicant(
    @Param('applicantId') applicantId: string,
    @Req() req: { user: AuthUser },
    @Body('stage') stage: string,
  ) {
    return this.hr.moveApplicant(this.resolveTenantId(req.user), applicantId, stage);
  }

  @Get('onboarding')
  @Roles('HR', 'SuperAdmin')
  onboarding(@Req() req: { user: AuthUser }) {
    return this.hr.listClearanceTasks(this.resolveTenantId(req.user), 'ONBOARDING');
  }

  @Get('offboarding')
  @Roles('HR', 'SuperAdmin')
  offboarding(@Req() req: { user: AuthUser }) {
    return this.hr.listClearanceTasks(this.resolveTenantId(req.user), 'OFFBOARDING');
  }

  @Get('pms/appraisals')
  @Roles('HR', 'SuperAdmin')
  appraisalCycles(@Req() req: { user: AuthUser }) {
    return this.hr.listAppraisalCycles(this.resolveTenantId(req.user));
  }

  @Get('pms/faculty-kpis')
  @Roles('HR', 'SuperAdmin')
  facultyKpis(@Req() req: { user: AuthUser }) {
    return this.hr.listFacultyKpis(this.resolveTenantId(req.user));
  }

  @Get('workforce/today')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'SuperAdmin')
  workforceToday(@Req() req: { user: AuthUser }) {
    return this.workforce.getTodayWidget(req.user.user_id);
  }

  @Post('workforce/requests')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'SuperAdmin')
  workforceApply(
    @Req() req: { user: AuthUser },
    @Body() dto: {
      request_type: StaffRequestType;
      leave_type?: string;
      start_date?: string;
      end_date?: string;
      regularization_date?: string;
      missed_punch_type?: 'IN' | 'OUT' | 'BOTH';
      reason?: string;
    },
  ) {
    return this.workforce.applyRequest(req.user.user_id, this.resolveTenantId(req.user), dto);
  }

  @Get('workforce/my-requests')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'SuperAdmin')
  workforceMyRequests(@Req() req: { user: AuthUser }) {
    return this.workforce.listMyRequests(req.user.user_id, this.resolveTenantId(req.user));
  }

  @Get('workforce/team/pending')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'SuperAdmin')
  workforceTeamPending(
    @Req() req: { user: AuthUser },
    @Query('type') type?: StaffRequestType,
  ) {
    return this.workforce.listTeamPending(req.user.user_id, this.resolveTenantId(req.user), type);
  }

  @Patch('workforce/team/:leaveId/action')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'SuperAdmin')
  workforceTeamAction(
    @Param('leaveId') leaveId: string,
    @Req() req: { user: AuthUser },
    @Body() dto: { action: 'APPROVE' | 'REJECT'; comment?: string },
  ) {
    return this.workforce.actOnTeamRequest(
      req.user.user_id,
      this.resolveTenantId(req.user),
      leaveId,
      dto.action,
      dto.comment,
    );
  }

  @Post('workforce/biometric/sync')
  @Roles('HR', 'SuperAdmin')
  runBiometricSync() {
    return this.workforce.syncFromBiometricSources();
  }

  @Post('workforce/biometric/simulate')
  @Roles('HR', 'SuperAdmin', 'Faculty', 'HOD')
  simulateBiometric(
    @Req() req: { user: AuthUser },
    @Body() dto: { user_id?: string; date?: string; action: 'IN' | 'OUT'; at?: string },
  ) {
    return this.workforce.simulateBiometricPunch(dto.user_id ?? req.user.user_id, dto);
  }

  private resolveTenantId(user: AuthUser) {
    return user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }
}
