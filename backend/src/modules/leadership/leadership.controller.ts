import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { OwnerAccessGuard } from '../../common/guards/owner-access.guard';
import { LeadershipService } from './leadership.service';
import { LeadershipIntelligenceService } from './leadership-intelligence.service';
import { BudgetFpaService } from './budget-fpa.service';
import { ExecutiveActionService } from './executive-action.service';
import { FinancialOversightService } from './financial-oversight.service';

type AuthUser = { user_id: string; tenant_id?: string };

@Controller('api/leadership')
@UseGuards(JwtAuthGuard, RolesGuard, OwnerAccessGuard)
@Roles('Chairman', 'President', 'SuperAdmin')
export class LeadershipController {
  constructor(
    private readonly leadership: LeadershipService,
    private readonly intelligence: LeadershipIntelligenceService,
    private readonly budgetFpa: BudgetFpaService,
    private readonly executiveAction: ExecutiveActionService,
    private readonly financialOversight: FinancialOversightService,
  ) {}

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  @Get('overview')
  overview(@Req() req: { user: AuthUser }) {
    return this.leadership.getOverview(req.user.tenant_id);
  }

  @Get('red-flags')
  redFlags(@Req() req: { user: AuthUser }, @Query('period') period?: string) {
    return this.leadership.getRedFlags(req.user.tenant_id, period);
  }

  @Get('pillar-summary')
  pillarSummary(@Req() req: { user: AuthUser }, @Query('period') period?: string) {
    return this.leadership.getPillarSummary(req.user.tenant_id, period);
  }

  @Get('finance-summary')
  financeSummary(@Req() req: { user: AuthUser }) {
    return this.leadership.getFinanceSummary(req.user.tenant_id);
  }

  @Get('alumni-summary')
  alumniSummary(@Req() req: { user: AuthUser }) {
    return this.leadership.getAlumniSummary(req.user.tenant_id);
  }

  @Get('compliance-summary')
  complianceSummary(@Req() req: { user: AuthUser }) {
    return this.leadership.getComplianceSummary(req.user.tenant_id);
  }

  @Get('infrastructure')
  infrastructure(@Req() req: { user: AuthUser }) {
    return this.leadership.getInfrastructureSummary(req.user.tenant_id);
  }

  @Get('finance')
  finance(@Req() req: { user: AuthUser }) {
    return this.intelligence.getRealFinance(req.user.tenant_id);
  }

  @Get('intelligence/ticker')
  ticker(@Req() req: { user: AuthUser }) {
    return this.intelligence.getTicker(req.user.tenant_id);
  }

  @Get('intelligence/quadrants')
  quadrants(@Req() req: { user: AuthUser }, @Query('period') period?: string) {
    const p = (
      ['day', 'week', 'month', 'year'].includes(period ?? '') ? period : 'month'
    ) as 'day' | 'week' | 'month' | 'year';
    return this.intelligence.getQuadrants(req.user.tenant_id, p);
  }

  @Get('intelligence/feed')
  feed(@Req() req: { user: AuthUser }, @Query('limit') limit?: string) {
    return this.intelligence.getFeedEvents(
      req.user.tenant_id,
      limit ? Number(limit) : 50,
    );
  }

  @Get('owners/brief')
  ownersBrief(@Req() req: { user: AuthUser }) {
    return this.intelligence.getOwnerBrief(req.user.tenant_id);
  }

  @Get('cash-flow/sankey')
  cashFlowSankey(
    @Req() req: { user: AuthUser },
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.intelligence.getCashFlowSankey(req.user.tenant_id, {
      from,
      to,
    });
  }

  @Get('cash-flow/waterfall')
  cashFlowWaterfall(
    @Req() req: { user: AuthUser },
    @Query('date') date?: string,
    @Query('bank_account_key') bankAccountKey?: string,
  ) {
    return this.intelligence.getDailyCashWaterfall(req.user.tenant_id, {
      date,
      bankAccountKey,
    });
  }

  @Get('versus/variance')
  versusVariance(
    @Req() req: { user: AuthUser },
    @Query('metric') metric: string,
    @Query('compare') compare?: string,
  ) {
    const mode = (
      ['MoM', 'YoY', 'BUDGET'].includes(compare ?? '') ? compare : 'MoM'
    ) as 'MoM' | 'YoY' | 'BUDGET';
    return this.intelligence.getVariance(req.user.tenant_id, {
      metric,
      compare: mode,
    });
  }

  @Get('versus/dept-scatter')
  deptScatter(@Req() req: { user: AuthUser }, @Query('month') month?: string) {
    return this.intelligence.getDeptScatter(req.user.tenant_id, { month });
  }

  @Get('versus/ratios')
  ownerRatios(@Req() req: { user: AuthUser }, @Query('date') date?: string) {
    return this.intelligence.getOwnerRatios(req.user.tenant_id, { date });
  }

  @Get('finance/allocation-rules')
  allocationRules(
    @Req() req: { user: AuthUser },
    @Query('fee_head') feeHead?: string,
  ) {
    return this.intelligence.listAllocationRules(req.user.tenant_id, {
      feeHead,
    });
  }

  @Post('finance/allocation-rules')
  upsertAllocationRule(
    @Req() req: { user: AuthUser },
    @Body() dto: Record<string, unknown>,
  ) {
    return this.intelligence.upsertAllocationRule(req.user.tenant_id, dto);
  }

  @Get('finance/bank-balance-snapshots')
  bankSnapshots(
    @Req() req: { user: AuthUser },
    @Query('bank_account_key') bankAccountKey?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.intelligence.listBankBalanceSnapshots(req.user.tenant_id, {
      bankAccountKey,
      from,
      to,
    });
  }

  @Post('finance/bank-balance-snapshots')
  upsertBankSnapshot(
    @Req() req: { user: AuthUser },
    @Body() dto: Record<string, unknown>,
  ) {
    return this.intelligence.upsertBankBalanceSnapshot(req.user.tenant_id, dto);
  }

  @Get('department-scores')
  departmentScores(@Req() req: { user: AuthUser }) {
    return this.intelligence.getDepartmentScores(req.user.tenant_id);
  }

  @Get('vendors/risk-ranking')
  vendorRisk(@Req() req: { user: AuthUser }) {
    return this.intelligence.getVendorRiskRanking(req.user.tenant_id);
  }

  @Get('audit-log')
  auditLog(
    @Req() req: { user: AuthUser },
    @Query('table') table?: string,
    @Query('record_id') recordId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.intelligence.getAuditLog(
      req.user.tenant_id,
      table,
      recordId,
      limit ? Number(limit) : 100,
    );
  }

  @Get('academics')
  academics(
    @Req() req: { user: AuthUser },
    @Query('semester') semester?: string,
  ) {
    return this.leadership.getAcademics(
      req.user.tenant_id,
      semester ? Number(semester) : undefined,
    );
  }

  @Get('admissions-funnel')
  admissionsFunnel(@Req() req: { user: AuthUser }) {
    return this.leadership.getAdmissionsFunnel(req.user.tenant_id);
  }

  @Get('admissions-analytics')
  admissionsAnalytics(
    @Req() req: { user: AuthUser },
    @Query('period') period?: string,
  ) {
    return this.leadership.getAdmissionsAnalytics(req.user.tenant_id, period);
  }

  @Get('dropout-analytics')
  dropoutAnalytics(@Req() req: { user: AuthUser }) {
    return this.leadership.getDropoutAnalytics(req.user.tenant_id);
  }

  @Get('academic-drilldown')
  academicDrilldown(
    @Req() req: { user: AuthUser },
    @Query('level') level: string,
    @Query('parentKey') parentKey?: string,
  ) {
    return this.leadership.getAcademicDrilldown(
      req.user.tenant_id,
      level,
      parentKey,
    );
  }

  @Get('placements')
  placements(@Req() req: { user: AuthUser }) {
    return this.leadership.getPlacements(req.user.tenant_id);
  }

  @Get('hr-ops')
  hrOps(@Req() req: { user: AuthUser }) {
    return this.leadership.getHrOps(req.user.tenant_id);
  }

  @Get('drilldown')
  drilldown(
    @Req() req: { user: AuthUser },
    @Query('level') level: string,
    @Query('parentKey') parentKey?: string,
  ) {
    return this.leadership.getDrilldown(req.user.tenant_id, level, parentKey);
  }

  @Post('flag-to-hod')
  flagToHod(
    @Req() req: { user: AuthUser },
    @Body() body: { node_key: string; label: string; message?: string },
  ) {
    return this.leadership.flagToHod(
      req.user.tenant_id,
      req.user.user_id,
      body,
    );
  }

  @Post('refresh-views')
  refreshViews() {
    return this.leadership.refreshMaterializedViews();
  }

  @Get('issues')
  @Roles('Chairman', 'President', 'SuperAdmin', 'Registrar', 'Vice Chancellor')
  issues(@Req() req: { user: AuthUser }) {
    return this.leadership.getIssuesDashboard(req.user.tenant_id);
  }

  @Post('issues/:ticketId/escalate')
  @Roles('Chairman', 'President', 'SuperAdmin', 'Registrar', 'Vice Chancellor')
  escalate(
    @Req() req: { user: AuthUser },
    @Param('ticketId') ticketId: string,
  ) {
    return this.leadership.escalateIssue(
      req.user.tenant_id,
      ticketId,
      req.user.user_id,
    );
  }

  @Get('budget/allocation')
  allocationBoard(
    @Req() req: { user: AuthUser },
    @Query('financial_year') fy?: string,
  ) {
    return this.budgetFpa.getAllocationBoard(this.tenant(req), fy);
  }

  @Post('budget/allocation/draft')
  saveDraftAllocation(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      financial_year: string;
      total_university_budget: number;
      departments: Array<{ department_id: number; allocated_amount: number }>;
    },
  ) {
    return this.budgetFpa.saveDraftAllocation(
      this.tenant(req),
      req.user.user_id,
      body,
    );
  }

  @Post('budget/allocation/lock')
  lockBudget(
    @Req() req: { user: AuthUser },
    @Body() body: { financial_year: string },
  ) {
    return this.budgetFpa.lockFinancialYear(
      this.tenant(req),
      req.user.user_id,
      body.financial_year,
    );
  }

  @Get('budget/programs')
  listPrograms(
    @Req() req: { user: AuthUser },
    @Query('budget_id') budgetId: string,
  ) {
    return this.budgetFpa.listProgramBudgets(this.tenant(req), budgetId);
  }

  @Post('budget/programs')
  createProgram(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      budget_id: string;
      program_name: string;
      allocated_amount: number;
      program_type?: string;
    },
  ) {
    return this.budgetFpa.createProgramBudget(this.tenant(req), body);
  }

  @Get('budget/monitor/departments')
  monitorDepartments(
    @Req() req: { user: AuthUser },
    @Query('financial_year') fy?: string,
  ) {
    return this.budgetFpa.getDeptMonitorList(this.tenant(req), fy);
  }

  @Get('budget/monitor/sankey')
  monitorSankey(
    @Req() req: { user: AuthUser },
    @Query('financial_year') fy?: string,
  ) {
    return this.budgetFpa.getSankeyData(this.tenant(req), fy);
  }

  @Get('budget/monitor/programs/:programId')
  programLedger(
    @Req() req: { user: AuthUser },
    @Param('programId') programId: string,
  ) {
    return this.budgetFpa.getProgramLedger(this.tenant(req), programId);
  }

  @Get('budget/monitor/expenses/:programId')
  expenseGroundTruth(
    @Req() req: { user: AuthUser },
    @Param('programId') programId: string,
    @Query('category') category?: string,
  ) {
    return this.budgetFpa.getExpenseGroundTruth(
      this.tenant(req),
      programId,
      category,
    );
  }

  @Post('budget/expansion/:requestId/review')
  reviewExpansion(
    @Req() req: { user: AuthUser },
    @Param('requestId') requestId: string,
    @Body() body: { approve: boolean },
  ) {
    return this.budgetFpa.reviewBudgetExpansion(
      this.tenant(req),
      req.user.user_id,
      requestId,
      body.approve,
    );
  }

  @Get('action/summary')
  actionSummary(@Req() req: { user: AuthUser }) {
    return this.executiveAction.getActionCenterSummary(req.user.tenant_id);
  }

  @Get('action/approvals/inbox')
  approvalInbox(@Req() req: { user: AuthUser }) {
    return this.executiveAction.getApprovalInbox(req.user.tenant_id);
  }

  @Post('action/approvals/review')
  reviewApproval(
    @Req() req: { user: AuthUser },
    @Body()
    body: { category: string; id: string; approve: boolean; note?: string },
  ) {
    return this.executiveAction.reviewApproval(
      req.user.tenant_id,
      req.user.user_id,
      body,
    );
  }

  @Get('action/thresholds')
  approvalThresholds(@Req() req: { user: AuthUser }) {
    return this.executiveAction.getThresholds(req.user.tenant_id);
  }

  @Post('action/thresholds')
  updateThreshold(
    @Req() req: { user: AuthUser },
    @Body()
    body: { category: string; auto_approve_below: number; chairman_approval_above: number },
  ) {
    return this.executiveAction.updateThreshold(req.user.tenant_id, req.user.user_id, body);
  }

  @Get('action/tasks')
  listTasks(@Req() req: { user: AuthUser }) {
    return this.executiveAction.listTasks(req.user.tenant_id);
  }

  @Post('action/tasks')
  createTask(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      title: string;
      description?: string;
      assigned_to: string;
      due_at: string;
      priority?: string;
    },
  ) {
    return this.executiveAction.createTask(req.user.tenant_id, req.user.user_id, body);
  }

  @Patch('action/tasks/:taskId/status')
  updateTaskStatus(
    @Req() req: { user: AuthUser },
    @Param('taskId') taskId: string,
    @Body() body: { status: string },
  ) {
    return this.executiveAction.updateTaskStatus(req.user.tenant_id, taskId, body.status);
  }

  @Get('action/memos')
  listMemos(@Req() req: { user: AuthUser }) {
    return this.executiveAction.listMemos(req.user.tenant_id);
  }

  @Post('action/memos')
  sendMemo(
    @Req() req: { user: AuthUser },
    @Body()
    body: { subject: string; body: string; audience_roles: string[]; confidential?: boolean },
  ) {
    return this.executiveAction.sendMemo(req.user.tenant_id, req.user.user_id, body);
  }

  @Get('action/broadcasts')
  listBroadcasts(@Req() req: { user: AuthUser }) {
    return this.executiveAction.listBroadcasts(req.user.tenant_id);
  }

  @Post('action/broadcasts')
  sendBroadcast(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      subject: string;
      body: string;
      channels: string[];
      audience_filter: Record<string, unknown>;
    },
  ) {
    return this.executiveAction.sendBroadcast(req.user.tenant_id, req.user.user_id, body);
  }

  @Get('action/documents')
  listDocuments(@Req() req: { user: AuthUser }) {
    return this.executiveAction.listDocuments(req.user.tenant_id);
  }

  @Post('action/documents')
  registerDocument(
    @Req() req: { user: AuthUser & { ip?: string } },
    @Body()
    body: { title: string; category: string; storage_key: string; expires_at?: string },
  ) {
    return this.executiveAction.registerDocument(
      req.user.tenant_id,
      req.user.user_id,
      body,
      req.user.ip,
    );
  }

  @Get('action/documents/access-logs')
  documentAccessLogs(
    @Req() req: { user: AuthUser },
    @Query('document_id') documentId?: string,
  ) {
    return this.executiveAction.listDocumentAccessLogs(req.user.tenant_id, documentId);
  }

  @Get('action/mous')
  listMous(@Req() req: { user: AuthUser }) {
    return this.executiveAction.listMous(req.user.tenant_id);
  }

  @Get('action/vip-contacts')
  listVipContacts(@Req() req: { user: AuthUser }) {
    return this.executiveAction.listVipContacts(req.user.tenant_id);
  }

  @Post('action/vip-contacts')
  upsertVipContact(@Req() req: { user: AuthUser }, @Body() body: Record<string, unknown>) {
    return this.executiveAction.upsertVipContact(req.user.tenant_id, body);
  }

  @Get('action/compliance-calendar')
  complianceCalendar(@Req() req: { user: AuthUser }) {
    return this.executiveAction.listComplianceCalendar(req.user.tenant_id);
  }

  @Post('action/compliance-calendar')
  createComplianceEvent(
    @Req() req: { user: AuthUser },
    @Body() body: { title: string; event_type: string; due_date: string; notes?: string },
  ) {
    return this.executiveAction.createComplianceEvent(req.user.tenant_id, body);
  }

  @Get('action/forecast')
  predictiveForecast(@Req() req: { user: AuthUser }) {
    return this.executiveAction.getPredictiveForecast(req.user.tenant_id);
  }

  @Get('action/grievance-matrix')
  grievanceMatrix(@Req() req: { user: AuthUser }) {
    return this.executiveAction.getGrievanceEscalationMatrix(req.user.tenant_id);
  }

  @Get('financial/overview')
  financialOverview(@Req() req: { user: AuthUser }) {
    return this.financialOversight.getOverview(req.user.tenant_id);
  }

  @Get('financial/macro-budget')
  macroBudget(
    @Req() req: { user: AuthUser },
    @Query('financial_year') fy?: string,
  ) {
    return this.financialOversight.getMacroBudget(req.user.tenant_id, fy);
  }

  @Post('financial/reappropriate')
  reappropriateBudget(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      financial_year?: string;
      from_budget_id: string;
      to_budget_id: string;
      amount: number;
      reason?: string;
    },
  ) {
    return this.financialOversight.reappropriateBudget(
      req.user.tenant_id,
      req.user.user_id,
      body,
    );
  }

  @Get('financial/revenue')
  revenueOversight(@Req() req: { user: AuthUser }) {
    return this.financialOversight.getRevenueOversight(req.user.tenant_id);
  }

  @Get('financial/expenses')
  expenseOversight(@Req() req: { user: AuthUser }) {
    return this.financialOversight.getExpenseOversight(req.user.tenant_id);
  }

  @Get('financial/waivers')
  waiverOversight(@Req() req: { user: AuthUser }) {
    return this.financialOversight.getWaiverOversight(req.user.tenant_id);
  }

  @Get('financial/grants')
  grantOversight(@Req() req: { user: AuthUser }) {
    return this.financialOversight.getGrantOversight(req.user.tenant_id);
  }

  @Get('financial/wealth')
  wealthOversight(@Req() req: { user: AuthUser }) {
    return this.financialOversight.getWealthOversight(req.user.tenant_id);
  }

  @Get('financial/audit-shield')
  auditShield(@Req() req: { user: AuthUser }) {
    return this.financialOversight.getAuditShield(req.user.tenant_id);
  }
}
