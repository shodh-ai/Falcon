import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { OwnerAccessGuard } from '../../common/guards/owner-access.guard';
import { LeadershipService } from './leadership.service';
import { LeadershipIntelligenceService } from './leadership-intelligence.service';
import { BudgetFpaService } from './budget-fpa.service';

type AuthUser = { user_id: string; tenant_id?: string };

@Controller('api/leadership')
@UseGuards(JwtAuthGuard, RolesGuard, OwnerAccessGuard)
@Roles('Chairman', 'President', 'SuperAdmin')
export class LeadershipController {
  constructor(
    private readonly leadership: LeadershipService,
    private readonly intelligence: LeadershipIntelligenceService,
    private readonly budgetFpa: BudgetFpaService,
  ) {}

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  @Get('overview')
  overview(@Req() req: { user: AuthUser }) {
    return this.leadership.getOverview(req.user.tenant_id);
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
    const p = (['day', 'week', 'month', 'year'].includes(period ?? '') ? period : 'month') as
      | 'day'
      | 'week'
      | 'month'
      | 'year';
    return this.intelligence.getQuadrants(req.user.tenant_id, p);
  }

  @Get('intelligence/feed')
  feed(@Req() req: { user: AuthUser }, @Query('limit') limit?: string) {
    return this.intelligence.getFeedEvents(req.user.tenant_id, limit ? Number(limit) : 50);
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
    return this.intelligence.getCashFlowSankey(req.user.tenant_id, { from, to });
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
    const mode = (['MoM', 'YoY', 'BUDGET'].includes(compare ?? '') ? compare : 'MoM') as 'MoM' | 'YoY' | 'BUDGET';
    return this.intelligence.getVariance(req.user.tenant_id, { metric, compare: mode });
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
  allocationRules(@Req() req: { user: AuthUser }, @Query('fee_head') feeHead?: string) {
    return this.intelligence.listAllocationRules(req.user.tenant_id, { feeHead });
  }

  @Post('finance/allocation-rules')
  upsertAllocationRule(@Req() req: { user: AuthUser }, @Body() dto: Record<string, unknown>) {
    return this.intelligence.upsertAllocationRule(req.user.tenant_id, dto);
  }

  @Get('finance/bank-balance-snapshots')
  bankSnapshots(
    @Req() req: { user: AuthUser },
    @Query('bank_account_key') bankAccountKey?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.intelligence.listBankBalanceSnapshots(req.user.tenant_id, { bankAccountKey, from, to });
  }

  @Post('finance/bank-balance-snapshots')
  upsertBankSnapshot(@Req() req: { user: AuthUser }, @Body() dto: Record<string, unknown>) {
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
    return this.intelligence.getAuditLog(req.user.tenant_id, table, recordId, limit ? Number(limit) : 100);
  }

  @Get('academics')
  academics(@Req() req: { user: AuthUser }) {
    return this.leadership.getAcademics(req.user.tenant_id);
  }

  @Get('admissions-funnel')
  admissionsFunnel(@Req() req: { user: AuthUser }) {
    return this.leadership.getAdmissionsFunnel(req.user.tenant_id);
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
    return this.leadership.flagToHod(req.user.tenant_id, req.user.user_id, body);
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
  escalate(@Req() req: { user: AuthUser }, @Param('ticketId') ticketId: string) {
    return this.leadership.escalateIssue(req.user.tenant_id, ticketId, req.user.user_id);
  }

  @Get('budget/allocation')
  allocationBoard(@Req() req: { user: AuthUser }, @Query('financial_year') fy?: string) {
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
    return this.budgetFpa.saveDraftAllocation(this.tenant(req), req.user.user_id, body);
  }

  @Post('budget/allocation/lock')
  lockBudget(@Req() req: { user: AuthUser }, @Body() body: { financial_year: string }) {
    return this.budgetFpa.lockFinancialYear(this.tenant(req), req.user.user_id, body.financial_year);
  }

  @Get('budget/programs')
  listPrograms(@Req() req: { user: AuthUser }, @Query('budget_id') budgetId: string) {
    return this.budgetFpa.listProgramBudgets(this.tenant(req), budgetId);
  }

  @Post('budget/programs')
  createProgram(
    @Req() req: { user: AuthUser },
    @Body() body: { budget_id: string; program_name: string; allocated_amount: number; program_type?: string },
  ) {
    return this.budgetFpa.createProgramBudget(this.tenant(req), body);
  }

  @Get('budget/monitor/departments')
  monitorDepartments(@Req() req: { user: AuthUser }, @Query('financial_year') fy?: string) {
    return this.budgetFpa.getDeptMonitorList(this.tenant(req), fy);
  }

  @Get('budget/monitor/sankey')
  monitorSankey(@Req() req: { user: AuthUser }, @Query('financial_year') fy?: string) {
    return this.budgetFpa.getSankeyData(this.tenant(req), fy);
  }

  @Get('budget/monitor/programs/:programId')
  programLedger(@Req() req: { user: AuthUser }, @Param('programId') programId: string) {
    return this.budgetFpa.getProgramLedger(this.tenant(req), programId);
  }

  @Get('budget/monitor/expenses/:programId')
  expenseGroundTruth(
    @Req() req: { user: AuthUser },
    @Param('programId') programId: string,
    @Query('category') category?: string,
  ) {
    return this.budgetFpa.getExpenseGroundTruth(this.tenant(req), programId, category);
  }

  @Post('budget/expansion/:requestId/review')
  reviewExpansion(
    @Req() req: { user: AuthUser },
    @Param('requestId') requestId: string,
    @Body() body: { approve: boolean },
  ) {
    return this.budgetFpa.reviewBudgetExpansion(this.tenant(req), req.user.user_id, requestId, body.approve);
  }
}
