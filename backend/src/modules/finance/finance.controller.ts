import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, Public } from '../../common/decorators/roles.decorator';
import { FINANCE_BULK_DEMAND_QUEUE } from '../../common/constants/finance-queue.constants';
import { FinanceService } from './finance.service';
import { FinanceWebhookService } from './finance-webhook.service';
import { FinanceAccountsService } from './finance-accounts.service';
import { FinanceLedgerService } from './finance-ledger.service';
import { BudgetFpaService } from '../leadership/budget-fpa.service';
import { FinanceApprovalsService } from './finance-approvals.service';
import { FinanceChequeService } from './finance-cheque.service';
import { CreateFeeDemandDto } from './dto/create-fee-demand.dto';
import { GatewayWebhookDto } from './dto/gateway-webhook.dto';

type AuthUser = { user_id: string; tenant_id?: string };

/** Accounts payable desk — log bills and run 3-way match settlement */
const ACCOUNTS_PAYABLE = [
  'SuperAdmin',
  'CampusAdmin',
  'Accountant',
  'APManager',
  'APClerk',
  'CFO',
  'FinanceController',
] as const;

@Controller(['finance', 'api/finance'])
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly webhookService: FinanceWebhookService,
    private readonly accounts: FinanceAccountsService,
    private readonly ledger: FinanceLedgerService,
    private readonly budgetFpa: BudgetFpaService,
    private readonly approvals: FinanceApprovalsService,
    private readonly cheques: FinanceChequeService,
    @InjectQueue(FINANCE_BULK_DEMAND_QUEUE) private readonly bulkQueue: Queue,
  ) {}

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  @Get('dashboard')
  @Roles('SuperAdmin', 'Accountant', 'President')
  dashboard(@Req() req: { user: AuthUser }) {
    return this.finance.getDashboard(this.tenant(req));
  }

  @Get('fee-templates')
  @Roles('SuperAdmin', 'Accountant')
  feeTemplates(@Req() req: { user: AuthUser }) {
    return this.accounts.listTemplates(this.tenant(req));
  }

  @Post('fee-templates')
  @Roles('SuperAdmin', 'Accountant')
  createFeeTemplate(
    @Req() req: { user: AuthUser },
    @Body() dto: Record<string, unknown>,
  ) {
    return this.accounts.createTemplate(
      this.tenant(req),
      dto as Parameters<FinanceAccountsService['createTemplate']>[1],
    );
  }

  @Get('demands')
  @Roles('SuperAdmin', 'Accountant')
  listDemands(@Query('studentUserId') studentUserId?: string) {
    return this.finance.listDemands(studentUserId);
  }

  @Post('demands')
  @Roles('SuperAdmin', 'Accountant')
  createDemand(
    @Req() req: { user: AuthUser },
    @Body() dto: CreateFeeDemandDto,
  ) {
    return this.finance.createDemand(dto, this.tenant(req));
  }

  @Post('demands/bulk-generate')
  @Roles('SuperAdmin', 'Accountant')
  async bulkGenerateDemands(
    @Req() req: { user: AuthUser },
    @Body() dto: Record<string, unknown>,
  ) {
    const { job_id } = await this.accounts.createBulkJob(this.tenant(req), dto);
    await this.bulkQueue.add('generate', {
      jobId: job_id,
      tenantId: this.tenant(req),
      ...dto,
    });
    return {
      queued: true,
      job_id,
      message:
        'Demand generation queued. Poll GET /finance/demands/jobs/:jobId',
    };
  }

  @Get('demands/jobs/:jobId')
  @Roles('SuperAdmin', 'Accountant')
  bulkJobStatus(@Param('jobId') jobId: string) {
    return this.accounts.getBulkJob(jobId);
  }

  @Get('collections')
  @Roles('SuperAdmin', 'Accountant')
  collections(@Req() req: { user: AuthUser }, @Query('q') q?: string) {
    return this.accounts.listCollections(this.tenant(req), q);
  }

  @Get('transactions')
  @Roles('SuperAdmin', 'Accountant')
  listTransactions(@Query('studentUserId') studentUserId?: string) {
    return this.finance.listTransactions(studentUserId);
  }

  @Patch('transactions/:id/receipt')
  @Roles('SuperAdmin', 'Accountant')
  uploadReceipt(@Param('id') id: string, @Body() dto: { receipt_url: string }) {
    return this.finance.uploadReceipt(id, dto.receipt_url);
  }

  @Get('defaulters')
  @Roles('SuperAdmin', 'Accountant', 'President')
  listDefaulters() {
    return this.finance.listDefaulters();
  }

  @Post('defaulters/lock-admit-cards')
  @Roles('SuperAdmin', 'Accountant')
  lockAdmitCards(@Req() req: { user: AuthUser }) {
    return this.finance.lockAdmitCards(this.tenant(req));
  }

  @Post('scholarships')
  @Roles('SuperAdmin', 'Accountant')
  applyScholarship(
    @Body() dto: { student_user_id?: string; discount_percent?: number },
  ) {
    return this.finance.applyScholarship(dto);
  }

  @Get('fine-policies')
  listFinePolicies() {
    return this.finance.listFinePolicies();
  }

  @Get('vendors')
  @Roles(...ACCOUNTS_PAYABLE)
  vendors(@Req() req: { user: AuthUser }) {
    return this.accounts.listVendors(this.tenant(req));
  }

  @Post('vendors')
  @Roles('SuperAdmin', 'Accountant', 'CampusAdmin')
  createVendor(
    @Req() req: { user: AuthUser },
    @Body() dto: Record<string, unknown>,
  ) {
    return this.accounts.createVendor(this.tenant(req), dto);
  }

  @Get('expense-heads')
  @Roles(...ACCOUNTS_PAYABLE)
  expenseHeads(@Req() req: { user: AuthUser }) {
    return this.accounts.listExpenseHeads(this.tenant(req));
  }

  @Get('expenses')
  @Roles(...ACCOUNTS_PAYABLE)
  expenses(@Req() req: { user: AuthUser }) {
    return this.accounts.listExpenses(this.tenant(req));
  }

  @Post('expenses')
  @Roles(...ACCOUNTS_PAYABLE)
  createExpense(
    @Req() req: { user: AuthUser },
    @Body() dto: Record<string, unknown>,
  ) {
    return this.accounts.createExpense(
      this.tenant(req),
      dto as Parameters<FinanceAccountsService['createExpense']>[1],
    );
  }

  @Post('approvals/:approvalId/request-otp')
  @Roles('SuperAdmin', 'Accountant', 'President', 'Chairman')
  requestApprovalOtp(
    @Req() req: { user: AuthUser },
    @Param('approvalId') approvalId: string,
  ) {
    return this.approvals.requestOtp(req.user, approvalId);
  }

  @Post('approvals/:approvalId/verify-otp')
  @Roles('SuperAdmin', 'President', 'Chairman')
  verifyApprovalOtp(
    @Req() req: { user: AuthUser },
    @Param('approvalId') approvalId: string,
    @Body() body: { otp?: string },
  ) {
    return this.approvals.verifyOtp(
      req.user,
      approvalId,
      String(body?.otp ?? ''),
    );
  }

  @Get('salary-processing')
  @Roles('SuperAdmin', 'Accountant')
  salarySummary(
    @Req() req: { user: AuthUser },
    @Query('month') month?: string,
  ) {
    return this.accounts.salaryProcessingSummary(this.tenant(req), month);
  }

  @Get('salary-processing/bank-export')
  @Roles('SuperAdmin', 'Accountant')
  @Header('Content-Type', 'text/csv')
  bankExport(
    @Req() req: { user: AuthUser },
    @Query('month') month: string | undefined,
    @Res() res: Response,
  ) {
    return this.accounts
      .generateBankExport(this.tenant(req), month)
      .then((payload) => {
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="salary-neft-${payload.month}.csv"`,
        );
        res.send(payload.csv);
      });
  }

  @Get('budgets')
  @Roles(...ACCOUNTS_PAYABLE, 'President')
  budgets(@Req() req: { user: AuthUser }) {
    return this.accounts.listBudgets(this.tenant(req));
  }

  @Post('budgets')
  @Roles('SuperAdmin', 'Accountant')
  upsertBudget(
    @Req() req: { user: AuthUser },
    @Body() dto: Record<string, unknown>,
  ) {
    return this.accounts.upsertBudget(
      this.tenant(req),
      dto as Parameters<FinanceAccountsService['upsertBudget']>[1],
    );
  }

  @Post('purchase-orders')
  @Roles('SuperAdmin', 'Accountant', 'HOD', 'Faculty')
  createPurchaseOrder(
    @Req() req: { user: AuthUser },
    @Body() dto: Record<string, unknown>,
  ) {
    return this.budgetFpa.createPurchaseOrder(
      this.tenant(req),
      req.user.user_id,
      dto as {
        program_id?: string;
        budget_id?: string;
        vendor_id?: string;
        description: string;
        amount: number;
      },
    );
  }

  @Post('budget-expansion')
  @Roles('SuperAdmin', 'Accountant', 'HOD', 'Faculty')
  requestBudgetExpansion(
    @Req() req: { user: AuthUser },
    @Body() dto: Record<string, unknown>,
  ) {
    return this.budgetFpa.requestBudgetExpansion(
      this.tenant(req),
      req.user.user_id,
      dto as {
        budget_id?: string;
        program_id?: string;
        requested_amount: number;
        reason?: string;
      },
    );
  }

  @Get('funding-requests')
  @Roles('SuperAdmin', 'Accountant')
  listFundingRequests(@Req() req: { user: AuthUser }) {
    return this.finance.listFundingRequests(this.tenant(req));
  }

  @Patch('funding-requests/:requestId/transfer')
  @Roles('SuperAdmin', 'Accountant')
  transferFunding(
    @Req() req: { user: AuthUser },
    @Param('requestId') requestId: string,
  ) {
    return this.finance.transferFunding(
      requestId,
      req.user.user_id,
      this.tenant(req),
    );
  }

  @Get('ledger-accounts')
  @Roles('SuperAdmin', 'Accountant')
  ledgerAccounts(@Req() req: { user: AuthUser }) {
    return this.ledger.listAccounts(this.tenant(req));
  }

  @Get('audit-reports/day-book')
  @Roles('SuperAdmin', 'Accountant')
  @Header('Content-Type', 'text/csv')
  async dayBook(
    @Req() req: { user: AuthUser },
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Res() res: Response,
  ) {
    const rows = await this.ledger.dayBook(this.tenant(req), from, to);
    const { csv } = this.accounts.exportCsv(
      rows as Record<string, unknown>[],
      'day-book.csv',
    );
    res.setHeader('Content-Disposition', 'attachment; filename="day-book.csv"');
    res.send(csv);
  }

  @Get('audit-reports/trial-balance')
  @Roles('SuperAdmin', 'Accountant')
  @Header('Content-Type', 'text/csv')
  async trialBalance(@Req() req: { user: AuthUser }, @Res() res: Response) {
    const rows = await this.ledger.trialBalance(this.tenant(req));
    const { csv } = this.accounts.exportCsv(
      rows as Record<string, unknown>[],
      'trial-balance.csv',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="trial-balance.csv"',
    );
    res.send(csv);
  }

  @Get('audit-reports/gst')
  @Roles('SuperAdmin', 'Accountant')
  @Header('Content-Type', 'text/csv')
  async gstExport(
    @Req() req: { user: AuthUser },
    @Query('period') period: string,
    @Res() res: Response,
  ) {
    const rows = await this.ledger.gstReport(
      this.tenant(req),
      period ?? new Date().toISOString().slice(0, 7),
    );
    const { csv } = this.accounts.exportCsv(
      rows as Record<string, unknown>[],
      'gstr.csv',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="gst-report.csv"',
    );
    res.send(csv);
  }

  @Get('audit-reports/tds')
  @Roles('SuperAdmin', 'Accountant')
  @Header('Content-Type', 'text/csv')
  async tdsExport(
    @Req() req: { user: AuthUser },
    @Query('period') period: string,
    @Res() res: Response,
  ) {
    const rows = await this.ledger.tdsReport(
      this.tenant(req),
      period ?? new Date().toISOString().slice(0, 7),
    );
    const { csv } = this.accounts.exportCsv(
      rows as Record<string, unknown>[],
      'tds.csv',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="tds-report.csv"',
    );
    res.send(csv);
  }

  @Public()
  @Post('webhook/:provider')
  webhook(
    @Param('provider') provider: 'razorpay' | 'payu',
    @Body() dto: GatewayWebhookDto,
  ) {
    return this.webhookService.handleGatewayWebhook(provider, dto);
  }

  @Get('cheques/pending')
  @Roles('SuperAdmin', 'Accountant')
  pendingCheques(@Req() req: { user: AuthUser }) {
    return this.cheques.listPendingCheques(this.tenant(req));
  }

  @Post('cheques/log')
  @Roles('SuperAdmin', 'Accountant')
  logCheque(
    @Req() req: { user: AuthUser },
    @Body() body: Record<string, unknown>,
  ) {
    return this.cheques.logCheque(
      this.tenant(req),
      body as Parameters<FinanceChequeService['logCheque']>[1],
    );
  }

  @Patch('cheques/:transactionId/clear')
  @Roles('SuperAdmin', 'Accountant')
  clearCheque(
    @Req() req: { user: AuthUser },
    @Param('transactionId') transactionId: string,
    @Body() body: { clearance_date?: string },
  ) {
    return this.cheques.markChequeCleared(
      this.tenant(req),
      transactionId,
      body.clearance_date,
    );
  }

  @Patch('cheques/:transactionId/return')
  @Roles('SuperAdmin', 'Accountant')
  returnCheque(
    @Req() req: { user: AuthUser },
    @Param('transactionId') transactionId: string,
    @Body() body: { bounce_reason: string },
  ) {
    return this.cheques.markChequeReturned(
      this.tenant(req),
      transactionId,
      body.bounce_reason,
    );
  }

  @Public()
  @Post('webhooks/razorpay')
  razorpayWebhook(@Body() dto: GatewayWebhookDto) {
    return this.webhookService.handleGatewayWebhook('razorpay', dto);
  }

  @Public()
  @Post('webhooks/payu')
  payuWebhook(@Body() dto: GatewayWebhookDto) {
    return this.webhookService.handleGatewayWebhook('payu', dto);
  }
}
