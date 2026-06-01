import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { HrService } from './hr.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { LeaveActionDto } from './dto/leave-action.dto';
import { RunPayrollDto, UpdateEmployeeDto } from './dto/hr-operations.dto';
import type { LeaveRequestStatus } from '../../entities/leave-request.entity';
import type { StaffLeaveStatus } from '../../entities/staff-leave-request.entity';

type AuthUser = { user_id: string; tenant_id?: string; role?: string; roles?: string[]; dept_id?: number };

@Controller(['hr', 'api/hr'])
@UseGuards(JwtAuthGuard, RolesGuard)
export class HrController {
  constructor(private readonly hr: HrService) {}

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
    return this.hr.listEmployees(this.resolveTenantId(req.user));
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
  @Roles('HR', 'SuperAdmin')
  holidays() {
    return this.hr.listHolidays();
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

  private resolveTenantId(user: AuthUser) {
    return user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }
}
