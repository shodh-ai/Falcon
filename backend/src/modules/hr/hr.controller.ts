import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { HrPermissionGuard } from '../../common/guards/hr-permission.guard';
import { EntityScopeGuard } from '../../common/guards/entity-scope.guard';
import { SkipEntityScope } from '../../common/decorators/skip-entity-scope.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { HrPermission } from '../../common/decorators/hr-permission.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { HrService } from './hr.service';
import { HrAdminService } from './hr-admin.service';
import { HrWorkforceService } from './hr-workforce.service';
import { AttendanceCalculationService } from './attendance-calculation.service';
import { HrEntityContextService } from './hr-entity-context.service';
import { HrRulesService } from './hr-rules.service';
import { HrEssService } from './hr-ess.service';
import { HrDynamicRulesService } from './hr-dynamic-rules.service';
import { HrOrgStructureService } from './hr-org-structure.service';
import { HrLeavePolicyService } from './hr-leave-policy.service';
import { HrWorkflowBuilderService } from './hr-workflow-builder.service';
import { HrChecklistService } from './hr-checklist.service';
import { HrOnboardingWorkflowService } from './hr-onboarding-workflow.service';
import { HrDashboardService } from './hr-dashboard.service';
import { HrReportsService } from './hr-reports.service';
import type { StaffRequestType } from '../../entities/staff-leave-request.entity';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { LeaveActionDto } from './dto/leave-action.dto';
import { RunPayrollDto, UpdateEmployeeDto } from './dto/hr-operations.dto';
import type { LeaveRequestStatus } from '../../entities/leave-request.entity';
import type { StaffLeaveStatus } from '../../entities/staff-leave-request.entity';

type AuthUser = { user_id: string; tenant_id?: string; role?: string; roles?: string[]; dept_id?: number };

@Controller(['hr', 'api/hr'])
@UseGuards(JwtAuthGuard, RolesGuard, HrPermissionGuard, EntityScopeGuard)
export class HrController {
  constructor(
    private readonly hr: HrService,
    private readonly hrAdmin: HrAdminService,
    private readonly workforce: HrWorkforceService,
    private readonly attendanceCalc: AttendanceCalculationService,
    private readonly entityCtx: HrEntityContextService,
    private readonly rules: HrRulesService,
    private readonly ess: HrEssService,
    private readonly dynamicRules: HrDynamicRulesService,
    private readonly orgStructure: HrOrgStructureService,
    private readonly leavePolicies: HrLeavePolicyService,
    private readonly workflowBuilder: HrWorkflowBuilderService,
    private readonly checklists: HrChecklistService,
    private readonly onboardingWorkflow: HrOnboardingWorkflowService,
    private readonly dashboard: HrDashboardService,
    private readonly reports: HrReportsService,
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
  @Roles('HOD', 'Dean', 'HR', 'HRAdmin', 'SuperAdmin')
  act(@Param('id') id: string, @Body() dto: LeaveActionDto) {
    return this.hr.actOnLeave(id, dto);
  }

  @Get('balances/:userId')
  balances(@Param('userId') userId: string) {
    return this.hr.listBalances(userId);
  }

  @Post('staff-attendance/:userId/check-in')
  @Roles('HR', 'HRAdmin', 'SuperAdmin', 'Faculty', 'HOD')
  checkIn(@Param('userId') userId: string, @Body('work_date') workDate: string) {
    return this.hr.recordStaffAttendance(userId, workDate);
  }

  @Post('attendance/web-punch')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'HRAdmin', 'SuperAdmin')
  webPunch(@Req() req: { user: AuthUser }, @Body('action') action?: 'IN' | 'OUT') {
    return this.hr.webPunch(req.user.user_id, action);
  }

  @Get('attendance/my-summary')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'HRAdmin', 'SuperAdmin')
  myAttendanceSummary(@Req() req: { user: AuthUser }) {
    return this.hr.getAttendanceSummary(req.user.user_id);
  }

  @Get('attendance/my-calendar')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'HRAdmin', 'SuperAdmin')
  myAttendanceCalendar(@Req() req: { user: AuthUser }, @Query('month') month: string) {
    return this.hr.listAttendanceCalendar(
      req.user.user_id,
      month ?? new Date().toISOString().slice(0, 7),
    );
  }

  @Post('leaves/apply')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'HRAdmin', 'SuperAdmin')
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
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'HRAdmin', 'SuperAdmin')
  myStaffLeaves(@Req() req: { user: AuthUser }) {
    return this.hr.listMyStaffLeaves(req.user.user_id, this.resolveTenantId(req.user));
  }

  @Get('leaves/my-balances')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'HRAdmin', 'SuperAdmin')
  myLeaveBalances(@Req() req: { user: AuthUser }) {
    return this.hr.listBalances(req.user.user_id);
  }

  @Get('payslips/my-payslips')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'HRAdmin', 'SuperAdmin')
  myPayslips(@Req() req: { user: AuthUser }) {
    return this.hr.listMyPayslips(req.user.user_id, this.resolveTenantId(req.user));
  }

  @Post('gate-passes')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'HRAdmin', 'SuperAdmin')
  createGatePass(
    @Req() req: { user: AuthUser },
    @Body() dto: { out_time: string; expected_in_time: string; reason: string },
  ) {
    return this.hr.createGatePass(req.user.user_id, this.resolveTenantId(req.user), dto);
  }

  @Get('gate-passes/my')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'HRAdmin', 'SuperAdmin')
  myGatePasses(@Req() req: { user: AuthUser }) {
    return this.hr.listMyGatePasses(req.user.user_id, this.resolveTenantId(req.user));
  }

  @Get('gate-passes/pending-approvals')
  @Roles('HOD', 'Dean', 'HR', 'HRAdmin', 'SuperAdmin', 'Faculty')
  pendingGatePasses(@Req() req: { user: AuthUser }) {
    return this.hr.listPendingGatePassApprovals(req.user.user_id, this.resolveTenantId(req.user));
  }

  @Get('gate-passes/pending-hr')
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  pendingHrGatePasses(@Req() req: { user: AuthUser }) {
    return this.hr.listPendingHrGatePasses(this.resolveTenantId(req.user));
  }

  @Patch('gate-passes/:passId/action')
  @Roles('HOD', 'Dean', 'HR', 'HRAdmin', 'SuperAdmin', 'Faculty')
  actOnGatePass(
    @Param('passId') passId: string,
    @Req() req: { user: AuthUser },
    @Body('status') status: 'APPROVED' | 'REJECTED',
  ) {
    return this.hr.actOnGatePass(passId, req.user.user_id, this.resolveTenantId(req.user), status);
  }

  @Get('dashboard/metrics')
  @Roles('HR', 'HRAdmin', 'SuperAdmin', 'President')
  @HrPermission('dashboard', 'read')
  async dashboardMetrics(@Req() req: { user: AuthUser }, @Query('entity_id') entityId?: string) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.hr.getDashboardMetrics(tenantId, entity);
  }

  @Get('dashboard/master')
  @Roles('HR', 'HRAdmin', 'SuperAdmin', 'President')
  @HrPermission('dashboard', 'read')
  async masterDashboard(@Req() req: { user: AuthUser }, @Query('entity_id') entityId?: string) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.dashboard.getMasterDashboard(tenantId, entity);
  }

  @Get('reports/muster-roll')
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  @HrPermission('reports', 'read')
  async exportMusterRoll(
    @Req() req: { user: AuthUser },
    @Res({ passthrough: true }) res: Response,
    @Query('month') month?: string,
    @Query('entity_id') entityId?: string,
  ) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    const monthKey = month ?? new Date().toISOString().slice(0, 7);
    const buffer = await this.reports.buildMusterRoll(tenantId, entity, monthKey);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="muster-roll-${monthKey}.xlsx"`,
    });
    return new StreamableFile(buffer);
  }

  @Get('reports/leave-balances')
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  @HrPermission('reports', 'read')
  async exportLeaveBalances(
    @Req() req: { user: AuthUser },
    @Res({ passthrough: true }) res: Response,
    @Query('year') year?: string,
    @Query('entity_id') entityId?: string,
  ) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    const y = year ? Number(year) : new Date().getFullYear();
    const buffer = await this.reports.buildLeaveBalanceRegister(tenantId, entity, y);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="leave-balances-${y}.xlsx"`,
    });
    return new StreamableFile(buffer);
  }

  @Get('reports/payroll-register')
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  @HrPermission('reports', 'read')
  async exportPayrollRegister(
    @Req() req: { user: AuthUser },
    @Res({ passthrough: true }) res: Response,
    @Query('month') month?: string,
    @Query('entity_id') entityId?: string,
  ) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    const monthKey = month ?? new Date().toISOString().slice(0, 7);
    const buffer = await this.reports.buildPayrollRegister(tenantId, entity, monthKey);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="payroll-register-${monthKey}.xlsx"`,
    });
    return new StreamableFile(buffer);
  }

  @Get('reports/missing-punches')
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  @HrPermission('reports', 'read')
  async exportMissingPunches(
    @Req() req: { user: AuthUser },
    @Res({ passthrough: true }) res: Response,
    @Query('entity_id') entityId?: string,
  ) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    const buffer = await this.reports.buildMissingPunchesReport(tenantId, entity);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="missing-punches.xlsx"',
    });
    return new StreamableFile(buffer);
  }

  @Get('reports/employee-master')
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  @HrPermission('reports', 'read')
  async exportEmployeeMaster(
    @Req() req: { user: AuthUser },
    @Res({ passthrough: true }) res: Response,
    @Query('entity_id') entityId?: string,
  ) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    const buffer = await this.reports.buildEmployeeMasterDump(tenantId, entity);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="employee-master.xlsx"',
    });
    return new StreamableFile(buffer);
  }

  @Get('entities')
  @SkipEntityScope()
  @Roles('HR', 'HRAdmin', 'SuperAdmin', 'President', 'Faculty', 'HOD', 'Dean')
  listEntities(@Req() req: { user: AuthUser }) {
    const roles = req.user.roles?.length ? req.user.roles : req.user.role ? [req.user.role] : [];
    return this.entityCtx.listAllowedEntities(
      this.resolveTenantId(req.user),
      req.user.user_id,
      roles,
    );
  }

  @Get('admin/permissions')
  @SkipEntityScope()
  @Roles('HRAdmin', 'SuperAdmin')
  permissionMatrix(
    @Req() req: { user: AuthUser },
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.entityCtx.listPermissionMatrix(this.resolveTenantId(req.user), {
      q,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Put('admin/permissions')
  @SkipEntityScope()
  @Roles('HRAdmin', 'SuperAdmin')
  updatePermissionMatrix(
    @Req() req: { user: AuthUser },
    @Body() body: { rows: { user_id: string; capabilities: Record<string, string> }[] },
  ) {
    return this.entityCtx.upsertPermissionMatrix(
      this.resolveTenantId(req.user),
      req.user.user_id,
      body.rows ?? [],
    );
  }

  @Patch('admin/permissions/:userId')
  @SkipEntityScope()
  @Roles('HRAdmin', 'SuperAdmin')
  patchUserPermission(
    @Req() req: { user: AuthUser },
    @Param('userId') userId: string,
    @Body() body: { module: string; level: string },
  ) {
    return this.entityCtx.patchUserPermission(
      this.resolveTenantId(req.user),
      userId,
      req.user.user_id,
      body.module,
      body.level,
    );
  }

  @Get('admin/rules')
  @Roles('HRAdmin', 'SuperAdmin')
  async listDynamicRules(
    @Req() req: { user: AuthUser },
    @Query('entity_id') entityId?: string,
  ) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.dynamicRules.listRules(tenantId, entity);
  }

  @Post('admin/rules')
  @Roles('HRAdmin', 'SuperAdmin')
  async createDynamicRule(
    @Req() req: { user: AuthUser },
    @Query('entity_id') entityId: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.dynamicRules.createRule(
      tenantId,
      entity,
      body as Parameters<HrDynamicRulesService['createRule']>[2],
    );
  }

  @Put('admin/rules/:ruleId')
  @Roles('HRAdmin', 'SuperAdmin')
  async updateDynamicRule(
    @Req() req: { user: AuthUser },
    @Param('ruleId') ruleId: string,
    @Query('entity_id') entityId: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.dynamicRules.updateRule(
      tenantId,
      entity,
      ruleId,
      body as Parameters<HrDynamicRulesService['updateRule']>[3],
    );
  }

  @Patch('admin/rules/:ruleId')
  @Roles('HRAdmin', 'SuperAdmin')
  async toggleDynamicRule(
    @Req() req: { user: AuthUser },
    @Param('ruleId') ruleId: string,
    @Query('entity_id') entityId: string | undefined,
    @Body() body: { is_active?: boolean },
  ) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.dynamicRules.updateRule(tenantId, entity, ruleId, { is_active: body.is_active });
  }

  @Post('admin/rules/:ruleId/delete')
  @Roles('HRAdmin', 'SuperAdmin')
  async deleteDynamicRule(
    @Req() req: { user: AuthUser },
    @Param('ruleId') ruleId: string,
    @Query('entity_id') entityId: string | undefined,
  ) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.dynamicRules.deleteRule(tenantId, entity, ruleId);
  }

  @Get('admin/shifts')
  @Roles('HRAdmin', 'SuperAdmin')
  async listShifts(@Req() req: { user: AuthUser }, @Query('entity_id') entityId?: string) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.rules.listShifts(tenantId, entity);
  }

  @Get('employees')
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  @HrPermission('directory', 'read')
  async listEmployees(@Req() req: { user: AuthUser }, @Query('entity_id') entityId?: string) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.hrAdmin.listDirectory(tenantId, entity);
  }

  @Get('directory')
  @Roles('HR', 'HRAdmin', 'SuperAdmin', 'Faculty', 'HOD', 'Dean', 'President')
  @HrPermission('directory', 'read')
  async directory(@Req() req: { user: AuthUser }, @Query('entity_id') entityId?: string) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.hrAdmin.listDirectory(tenantId, entity);
  }

  @Get('employees/:userId/360')
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  @HrPermission('directory', 'read')
  employee360(@Param('userId') userId: string, @Req() req: { user: AuthUser }) {
    return this.hrAdmin.getEmployee360(this.resolveTenantId(req.user), userId, false);
  }

  @Post('employees/:userId/kyc/reveal')
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  @HrPermission('documents', 'write')
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
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  @HrPermission('directory', 'write')
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
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  @HrPermission('leaves', 'read')
  async leaveBalancesGrid(
    @Req() req: { user: AuthUser },
    @Query('year') year?: string,
    @Query('entity_id') entityId?: string,
  ) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.hrAdmin.listLeaveBalancesGrid(
      tenantId,
      year ? Number(year) : new Date().getFullYear(),
      entity,
    );
  }

  @Post('leaves/balance-adjust')
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  @HrPermission('leaves', 'write')
  adjustLeaveBalance(@Req() req: { user: AuthUser }, @Body() body: Record<string, unknown>) {
    return this.hrAdmin.adjustLeaveBalance(
      this.resolveTenantId(req.user),
      body.user_id as string,
      body as Parameters<HrAdminService['adjustLeaveBalance']>[2],
    );
  }

  @Post('biometric-sync')
  @HttpCode(HttpStatus.OK)
  @HrPermission('biometrics', 'write')
  async biometricSync(
    @Req() req: { user: AuthUser },
    @Query('entity_id') entityId: string | undefined,
    @Body() body: {
      secret?: string;
      punches?: { employee_id: string; punch_time: string; device_id?: string; punch_type: 'IN' | 'OUT'; entity_id?: number }[];
    },
  ) {
    if (body.punches?.length) {
      this.hrAdmin.validateBiometricWebhook(body.secret);
    }
    const tenantId = this.resolveTenantId(req.user);
    const entity = entityId ? await this.entityCtx.resolveEntityId(tenantId, entityId) : undefined;
    if (body.punches?.length) {
      return this.hrAdmin.ingestBiometricPunches(tenantId, body.punches, entity);
    }
    return this.hrAdmin.processBiometricLogs(tenantId);
  }

  @Post('biometrics/sync')
  @HttpCode(HttpStatus.OK)
  async biometricsSyncAlias(
    @Req() req: { user: AuthUser },
    @Query('entity_id') entityId: string | undefined,
    @Body() body: {
      secret?: string;
      emp_id?: string;
      timestamp?: string;
      device_id?: string;
      punches?: { employee_id: string; punch_time: string; device_id?: string; punch_type: 'IN' | 'OUT' }[];
    },
  ) {
    const normalized = body.punches ?? (body.emp_id && body.timestamp
      ? [{ employee_id: body.emp_id, punch_time: body.timestamp, device_id: body.device_id, punch_type: 'IN' as const }]
      : []);
    return this.biometricSync(req, entityId, { secret: body.secret, punches: normalized });
  }

  @Get('payroll/packages')
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  @HrPermission('payroll', 'read')
  async payPackages(@Req() req: { user: AuthUser }, @Query('entity_id') entityId?: string) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.hrAdmin.listPayPackages(tenantId, entity);
  }

  @Post('payroll/packages')
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  @HrPermission('payroll', 'write')
  upsertPayPackage(@Req() req: { user: AuthUser }, @Body() body: Record<string, unknown>) {
    return this.hrAdmin.upsertPayPackage(
      this.resolveTenantId(req.user),
      body as Parameters<HrAdminService['upsertPayPackage']>[1],
    );
  }

  @Get('appraisals/api-scores')
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  async apiScores(
    @Req() req: { user: AuthUser },
    @Query('year') year?: string,
    @Query('entity_id') entityId?: string,
  ) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.hrAdmin.listAppraisalsWithApi(
      tenantId,
      year ? Number(year) : new Date().getFullYear(),
      entity,
    );
  }

  @Get('promotions/candidates')
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  async promotionCandidates(@Req() req: { user: AuthUser }, @Query('entity_id') entityId?: string) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.hrAdmin.listPromotionCandidates(tenantId, entity);
  }

  @Post('recruitment/applicants/:applicantId/hire')
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
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
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  employeeProfile(@Param('userId') userId: string, @Req() req: { user: AuthUser }) {
    return this.hr.getEmployeeProfile(this.resolveTenantId(req.user), userId);
  }

  @Patch('employees/:userId')
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  updateEmployee(
    @Param('userId') userId: string,
    @Req() req: { user: AuthUser },
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.hr.updateEmployee(this.resolveTenantId(req.user), userId, dto);
  }

  @Get('attendance/matrix')
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  @HrPermission('attendance', 'read')
  async attendanceMatrix(
    @Req() req: { user: AuthUser },
    @Query('month') month?: string,
    @Query('entity_id') entityId?: string,
  ) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.attendanceCalc.getMatrixMonth(
      tenantId,
      month ?? new Date().toISOString().slice(0, 7),
      entity,
    );
  }

  @Get('attendance/calendar')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'HRAdmin', 'SuperAdmin')
  attendanceCalendar(@Req() req: { user: AuthUser }, @Query('month') month?: string) {
    return this.attendanceCalc.getMonthCalendar(
      req.user.user_id,
      month ?? new Date().toISOString().slice(0, 7),
    );
  }

  @Get('leaves/all')
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  @HrPermission('leaves', 'read')
  async allStaffLeaves(
    @Req() req: { user: AuthUser },
    @Query('status') status?: StaffLeaveStatus,
    @Query('entity_id') entityId?: string,
  ) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.hr.listAllStaffLeaves(tenantId, entity, status);
  }

  @Get('holidays')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'HRAdmin', 'SuperAdmin')
  holidays() {
    return this.workforce.listHolidaysGrouped();
  }

  @Get('action-center')
  @Roles('HR', 'HRAdmin', 'SuperAdmin', 'President')
  @HrPermission('dashboard', 'read')
  actionCenter(@Req() req: { user: AuthUser }) {
    return this.hr.getActionCenter(this.resolveTenantId(req.user));
  }

  @Patch('staff-leaves/:leaveId/status')
  @Roles('HR', 'HRAdmin', 'SuperAdmin', 'HOD')
  @HrPermission('leaves', 'write')
  actOnStaffLeave(
    @Param('leaveId') leaveId: string,
    @Req() req: { user: AuthUser },
    @Body('status') status: 'HOD_APPROVED' | 'HR_APPROVED' | 'REJECTED',
  ) {
    return this.hr.actOnStaffLeave(leaveId, this.resolveTenantId(req.user), status, req.user);
  }

  @Post('payroll/run')
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  @RequirePermission('payroll', 'write')
  async runPayroll(@Req() req: { user: AuthUser }, @Body() dto: RunPayrollDto) {
    return this.hr.queuePayrollRun(this.resolveTenantId(req.user), dto.month, req.user.user_id);
  }

  @Get('payroll/structures')
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  @HrPermission('payroll', 'read')
  async salaryStructures(@Req() req: { user: AuthUser }, @Query('entity_id') entityId?: string) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.hr.listSalaryStructures(tenantId, entity);
  }

  @Get('payroll/payslips')
  @Roles('HR', 'HRAdmin', 'SuperAdmin', 'President')
  @HrPermission('payroll', 'read')
  async listPayrollPayslips(
    @Req() req: { user: AuthUser },
    @Query('month') month?: string,
    @Query('entity_id') entityId?: string,
  ) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.hr.listPayrollPayslips(tenantId, entity, month);
  }

  @Patch('payslips/:id/publish')
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  @HrPermission('payroll', 'write')
  publishPayslip(@Param('id') id: string, @Req() req: { user: AuthUser }) {
    return this.hr.publishPayslip(this.resolveTenantId(req.user), id);
  }

  @Get('recruitment/jobs')
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  @HrPermission('recruitment', 'read')
  async recruitmentJobs(@Req() req: { user: AuthUser }, @Query('entity_id') entityId?: string) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.hr.listRecruitmentJobs(tenantId, entity);
  }

  @Post('recruitment/jobs')
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  @HrPermission('recruitment', 'write')
  createRecruitmentJob(
    @Req() req: { user: AuthUser },
    @Body() dto: { title?: string; department_id?: number; openings?: number; employment_type?: string; description?: string },
  ) {
    return this.hr.createRecruitmentJob(this.resolveTenantId(req.user), req.user.user_id, dto);
  }

  @Get('recruitment/pipeline')
  @Roles('HR', 'HRAdmin', 'SuperAdmin', 'Faculty', 'HOD', 'Dean')
  @HrPermission('recruitment', 'read')
  async recruitmentPipeline(@Req() req: { user: AuthUser }, @Query('entity_id') entityId?: string) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.hr.listRecruitmentPipeline(tenantId, entity);
  }

  @Patch('recruitment/applicants/:applicantId/stage')
  @Roles('HR', 'HRAdmin', 'SuperAdmin', 'Faculty', 'HOD', 'Dean')
  @HrPermission('recruitment', 'write')
  async moveApplicant(
    @Param('applicantId') applicantId: string,
    @Req() req: { user: AuthUser },
    @Body('stage') stage: string,
  ) {
    const tenantId = this.resolveTenantId(req.user);
    const result = await this.hr.moveApplicant(tenantId, applicantId, stage);
    if (stage === 'HIRED') {
      const spawn = await this.onboardingWorkflow.triggerOnHired(tenantId, applicantId);
      return { ...result, onboarding_spawn: spawn };
    }
    return result;
  }

  @Get('onboarding')
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  @HrPermission('onboarding', 'read')
  async listOnboardingNewHires(@Req() req: { user: AuthUser }, @Query('entity_id') entityId?: string) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.onboardingWorkflow.listNewHires(tenantId, entity);
  }

  @Get('onboarding/:userId')
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  @HrPermission('onboarding', 'read')
  async getOnboardingWorkflow(
    @Param('userId') userId: string,
    @Req() req: { user: AuthUser },
    @Query('entity_id') entityId?: string,
  ) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.onboardingWorkflow.getEmployeeWorkflow(tenantId, entity, userId);
  }

  @Patch('onboarding/tasks/:taskId')
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  @HrPermission('onboarding', 'write')
  async updateOnboardingTask(
    @Param('taskId') taskId: string,
    @Req() req: { user: AuthUser },
    @Body('completed') completed: boolean,
  ) {
    return this.onboardingWorkflow.setTaskStatus(taskId, req.user.user_id, completed !== false);
  }

  @Get('admin/workflow-templates')
  @Roles('HRAdmin', 'SuperAdmin')
  async listWorkflowTemplates(
    @Req() req: { user: AuthUser },
    @Query('entity_id') entityId?: string,
    @Query('workflow_type') workflowType?: string,
  ) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.onboardingWorkflow.listTemplates(tenantId, entity, workflowType ?? 'ONBOARDING');
  }

  @Post('admin/workflow-templates')
  @Roles('HRAdmin', 'SuperAdmin')
  async createWorkflowTemplate(
    @Req() req: { user: AuthUser },
    @Query('entity_id') entityId: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.onboardingWorkflow.createTemplate(tenantId, entity, body as Parameters<HrOnboardingWorkflowService['createTemplate']>[2]);
  }

  @Patch('admin/workflow-templates/reorder')
  @Roles('HRAdmin', 'SuperAdmin')
  async reorderWorkflowTemplates(
    @Req() req: { user: AuthUser },
    @Query('entity_id') entityId: string | undefined,
    @Body() body: { stage_name: string; ordered_template_ids: string[] },
  ) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.onboardingWorkflow.reorderTemplates(
      tenantId,
      entity,
      body.stage_name,
      body.ordered_template_ids ?? [],
    );
  }

  @Patch('admin/workflow-templates/:templateId')
  @Roles('HRAdmin', 'SuperAdmin')
  async updateWorkflowTemplate(
    @Param('templateId') templateId: string,
    @Req() req: { user: AuthUser },
    @Query('entity_id') entityId: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.onboardingWorkflow.updateTemplate(tenantId, entity, templateId, body as Parameters<HrOnboardingWorkflowService['updateTemplate']>[3]);
  }

  @Post('admin/workflow-templates/:templateId/delete')
  @Roles('HRAdmin', 'SuperAdmin')
  async deleteWorkflowTemplate(
    @Param('templateId') templateId: string,
    @Req() req: { user: AuthUser },
    @Query('entity_id') entityId: string | undefined,
  ) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.onboardingWorkflow.deleteTemplate(tenantId, entity, templateId);
  }

  @Get('offboarding')
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  @HrPermission('offboarding', 'read')
  async offboarding(@Req() req: { user: AuthUser }, @Query('entity_id') entityId?: string) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.ess.listResignations(tenantId, entity);
  }

  @Patch('offboarding/:resignationId/process')
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  @HrPermission('offboarding', 'write')
  hrProcessOffboarding(
    @Param('resignationId') resignationId: string,
    @Req() req: { user: AuthUser },
    @Body('separation_mode') separationMode: 'SERVE_NOTICE' | 'BUYOUT_NOTICE' | 'IMMEDIATE_SEPARATION',
  ) {
    return this.ess.hrProcessResignation(resignationId, req.user.user_id, separationMode);
  }

  @Get('ess/onboarding/progress')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'HRAdmin', 'SuperAdmin')
  async essOnboardingProgress(@Req() req: { user: AuthUser }, @Query('entity_id') entityId?: string) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.ess.getOnboardingProgress(tenantId, entity, req.user.user_id);
  }

  @Patch('ess/onboarding/steps/:stepKey')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'HRAdmin', 'SuperAdmin')
  completeOnboardingStep(
    @Param('stepKey') stepKey: string,
    @Body('pipeline_id') pipelineId: string,
  ) {
    return this.ess.completeOnboardingStep(pipelineId, stepKey);
  }

  @Post('ess/resignation')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'HRAdmin', 'SuperAdmin')
  async submitResignation(
    @Req() req: { user: AuthUser },
    @Query('entity_id') entityId: string | undefined,
    @Body() body: { last_working_day: string; reason: string },
  ) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.ess.submitResignation(tenantId, entity, req.user.user_id, body);
  }

  @Patch('ess/resignation/:resignationId/hod-clearance')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'HRAdmin', 'SuperAdmin')
  hodClearResignation(
    @Param('resignationId') resignationId: string,
    @Req() req: { user: AuthUser },
    @Body('approved') approved: boolean,
  ) {
    return this.ess.hodClearResignation(resignationId, req.user.user_id, approved);
  }

  @Get('ess/calendar')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'HRAdmin', 'SuperAdmin')
  async essCalendar(
    @Req() req: { user: AuthUser },
    @Query('month') month?: string,
    @Query('entity_id') entityId?: string,
  ) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.ess.getEmployeeCalendar(
      tenantId,
      entity,
      req.user.user_id,
      month ?? new Date().toISOString().slice(0, 7),
    );
  }

  @Get('ess/documents')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'HRAdmin', 'SuperAdmin')
  async essDocuments(@Req() req: { user: AuthUser }, @Query('entity_id') entityId?: string) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.ess.listEmployeeDocuments(tenantId, entity, req.user.user_id);
  }

  @Post('ess/documents')
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  async uploadEssDocument(
    @Req() req: { user: AuthUser },
    @Query('entity_id') entityId: string | undefined,
    @Body() body: { user_id: string; document_type: string; file_url: string },
  ) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.ess.uploadEmployeeDocument(tenantId, entity, body.user_id, body);
  }

  @Get('ess/policies')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'HRAdmin', 'SuperAdmin')
  async essPolicies(@Req() req: { user: AuthUser }, @Query('entity_id') entityId?: string) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.ess.listPoliciesForUser(tenantId, entity, req.user.user_id);
  }

  @Post('ess/policies/:policyId/acknowledge')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'HRAdmin', 'SuperAdmin')
  acknowledgePolicy(
    @Param('policyId') policyId: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.ess.acknowledgePolicy(this.resolveTenantId(req.user), policyId, req.user.user_id);
  }

  @Get('policies')
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  @HrPermission('policies', 'read')
  async listPolicies(@Req() req: { user: AuthUser }, @Query('entity_id') entityId?: string) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.ess.listPolicies(tenantId, entity);
  }

  @Post('policies')
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  @HrPermission('policies', 'write')
  async createPolicy(
    @Req() req: { user: AuthUser },
    @Query('entity_id') entityId: string | undefined,
    @Body() body: { title: string; category?: string; file_url?: string; is_mandatory?: boolean },
  ) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.ess.upsertPolicy(tenantId, entity, req.user.user_id, body);
  }

  @Get('pms/appraisals')
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  appraisalCycles(@Req() req: { user: AuthUser }) {
    return this.hr.listAppraisalCycles(this.resolveTenantId(req.user));
  }

  @Get('pms/faculty-kpis')
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  facultyKpis(@Req() req: { user: AuthUser }) {
    return this.hr.listFacultyKpis(this.resolveTenantId(req.user));
  }

  @Get('workforce/today')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'HRAdmin', 'SuperAdmin')
  workforceToday(@Req() req: { user: AuthUser }) {
    return this.workforce.getTodayWidget(req.user.user_id);
  }

  @Post('workforce/requests')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'HRAdmin', 'SuperAdmin')
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
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'HRAdmin', 'SuperAdmin')
  workforceMyRequests(@Req() req: { user: AuthUser }) {
    return this.workforce.listMyRequests(req.user.user_id, this.resolveTenantId(req.user));
  }

  @Get('workforce/team/pending')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'HRAdmin', 'SuperAdmin')
  workforceTeamPending(
    @Req() req: { user: AuthUser },
    @Query('type') type?: StaffRequestType,
  ) {
    return this.workforce.listTeamPending(req.user.user_id, this.resolveTenantId(req.user), type);
  }

  @Patch('workforce/team/:leaveId/action')
  @Roles('Faculty', 'HOD', 'Dean', 'HR', 'HRAdmin', 'SuperAdmin')
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
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  runBiometricSync() {
    return this.workforce.syncFromBiometricSources();
  }

  @Post('workforce/biometric/simulate')
  @Roles('HR', 'HRAdmin', 'SuperAdmin', 'Faculty', 'HOD')
  simulateBiometric(
    @Req() req: { user: AuthUser },
    @Body() dto: { user_id?: string; date?: string; action: 'IN' | 'OUT'; at?: string },
  ) {
    return this.workforce.simulateBiometricPunch(dto.user_id ?? req.user.user_id, dto);
  }

  @Get('admin/org-structure')
  @Roles('HRAdmin', 'SuperAdmin')
  async orgStructureTree(@Req() req: { user: AuthUser }, @Query('entity_id') entityId?: string) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.orgStructure.listTree(tenantId, entity);
  }

  @Post('admin/org-structure')
  @Roles('HRAdmin', 'SuperAdmin')
  async createOrgUnit(
    @Req() req: { user: AuthUser },
    @Query('entity_id') entityId: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.orgStructure.createUnit(tenantId, entity, body as Parameters<HrOrgStructureService['createUnit']>[2]);
  }

  @Put('admin/org-structure/:unitId')
  @Roles('HRAdmin', 'SuperAdmin')
  async updateOrgUnit(
    @Req() req: { user: AuthUser },
    @Param('unitId') unitId: string,
    @Query('entity_id') entityId: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.orgStructure.updateUnit(tenantId, entity, unitId, body as Parameters<HrOrgStructureService['updateUnit']>[3]);
  }

  @Get('admin/leave-policies')
  @Roles('HRAdmin', 'SuperAdmin')
  async listLeavePolicies(@Req() req: { user: AuthUser }, @Query('entity_id') entityId?: string) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.leavePolicies.listPolicies(tenantId, entity);
  }

  @Post('admin/leave-policies')
  @Roles('HRAdmin', 'SuperAdmin')
  async createLeavePolicy(
    @Req() req: { user: AuthUser },
    @Query('entity_id') entityId: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.leavePolicies.createPolicy(tenantId, entity, body);
  }

  @Put('admin/leave-policies/:policyId')
  @Roles('HRAdmin', 'SuperAdmin')
  async updateLeavePolicy(
    @Req() req: { user: AuthUser },
    @Param('policyId') policyId: string,
    @Query('entity_id') entityId: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.leavePolicies.updatePolicy(tenantId, entity, policyId, body);
  }

  @Get('admin/workflows')
  @Roles('HRAdmin', 'SuperAdmin')
  async listWorkflows(@Req() req: { user: AuthUser }, @Query('entity_id') entityId?: string) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.workflowBuilder.listWorkflows(tenantId, entity);
  }

  @Post('admin/workflows')
  @Roles('HRAdmin', 'SuperAdmin')
  async createWorkflow(
    @Req() req: { user: AuthUser },
    @Query('entity_id') entityId: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.workflowBuilder.createWorkflow(tenantId, entity, body as Parameters<HrWorkflowBuilderService['createWorkflow']>[2]);
  }

  @Put('admin/workflows/:workflowId')
  @Roles('HRAdmin', 'SuperAdmin')
  async updateWorkflow(
    @Req() req: { user: AuthUser },
    @Param('workflowId') workflowId: string,
    @Query('entity_id') entityId: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.workflowBuilder.updateWorkflow(tenantId, entity, workflowId, body as Parameters<HrWorkflowBuilderService['updateWorkflow']>[3]);
  }

  @Get('admin/checklist-templates')
  @Roles('HRAdmin', 'SuperAdmin')
  async listChecklistTemplates(
    @Req() req: { user: AuthUser },
    @Query('entity_id') entityId?: string,
    @Query('workflow_type') workflowType?: string,
  ) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.checklists.listTemplates(tenantId, entity, workflowType);
  }

  @Post('admin/checklist-templates')
  @Roles('HRAdmin', 'SuperAdmin')
  async createChecklistTemplate(
    @Req() req: { user: AuthUser },
    @Query('entity_id') entityId: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.checklists.createTemplate(tenantId, entity, body);
  }

  @Patch('offboarding/:resignationId/exit-status')
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  async updateExitStatus(
    @Param('resignationId') resignationId: string,
    @Body() body: { exit_status: string; fnf_deduct_checklist_penalty?: boolean },
  ) {
    return this.checklists.updateExitStatus(
      resignationId,
      body.exit_status,
      body.fnf_deduct_checklist_penalty,
    );
  }

  @Get('org-units')
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  async listOrgUnitsFlat(@Req() req: { user: AuthUser }, @Query('entity_id') entityId?: string) {
    const tenantId = this.resolveTenantId(req.user);
    const entity = await this.entityCtx.resolveEntityId(tenantId, entityId);
    return this.orgStructure.listFlat(tenantId, entity);
  }

  private resolveTenantId(user: AuthUser) {
    return user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }

}
