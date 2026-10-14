import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  Req,
  StreamableFile,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BelongsToModule } from '../../module-control/module-control.decorators';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  FinanceBankReconciliationService,
  type BankStatementImport,
} from './finance-bank-reconciliation.service';

type ActorRequest = { user: { tenant_id?: string; user_id?: string } };
const READ = [
  'Accountant',
  'TreasuryOperator',
  'FinanceController',
  'CFO',
  'InternalAuditor',
  'TenantAdmin',
  'SuperAdmin',
] as const;
const PREPARE = [
  'Accountant',
  'TreasuryOperator',
  'FinanceController',
  'CFO',
] as const;
const REVIEW = ['FinanceController', 'CFO'] as const;

@BelongsToModule('finance_procurement')
@Controller('api/finance/accounting/v1')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinanceBankReconciliationController {
  constructor(private readonly bank: FinanceBankReconciliationService) {}

  private actor(req: ActorRequest) {
    if (!req.user.tenant_id || !req.user.user_id)
      throw new ForbiddenException('Tenant and actor context are required');
    return { tenantId: req.user.tenant_id, actorId: req.user.user_id };
  }

  private key(value?: string) {
    if (!value?.trim() || value.length > 200)
      throw new BadRequestException('Idempotency-Key is required');
    return value.trim();
  }

  private revision(value?: string) {
    const match = /^"?(\d+)"?$/.exec(value ?? '');
    if (!match) throw new BadRequestException('If-Match revision is required');
    return Number(match[1]);
  }

  @Get('banks')
  @Roles(...READ)
  banks(@Req() req: ActorRequest) {
    return this.bank.bankAccounts(this.actor(req).tenantId);
  }

  @Post('banks')
  @Roles(...REVIEW)
  registerBank(
    @Req() req: ActorRequest,
    @Headers('idempotency-key') key: string,
    @Body()
    body: {
      account_code: string;
      display_name: string;
      masked_account_number: string;
    },
  ) {
    this.key(key);
    const actor = this.actor(req);
    return this.bank.registerBankAccount(actor.tenantId, actor.actorId, body);
  }

  @Get('banks/:bankAccountId/statements')
  @Roles(...READ)
  statements(
    @Req() req: ActorRequest,
    @Param('bankAccountId') bankAccountId: string,
  ) {
    return this.bank.statements(this.actor(req).tenantId, bankAccountId);
  }

  @Post('banks/:bankAccountId/statement-uploads')
  @Roles(...PREPARE)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  uploadStatementFile(
    @Req() req: ActorRequest,
    @Param('bankAccountId') bankAccountId: string,
    @Headers('idempotency-key') key: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const actor = this.actor(req);
    return this.bank.uploadStatementFile(
      actor.tenantId,
      actor.actorId,
      bankAccountId,
      this.key(key),
      file,
    );
  }

  @Post('banks/:bankAccountId/statements')
  @Roles(...PREPARE)
  importStatement(
    @Req() req: ActorRequest,
    @Param('bankAccountId') bankAccountId: string,
    @Headers('idempotency-key') key: string,
    @Body() body: BankStatementImport,
  ) {
    const actor = this.actor(req);
    return this.bank.importStatement(
      actor.tenantId,
      actor.actorId,
      this.key(key),
      { ...body, bank_account_id: bankAccountId },
    );
  }

  @Get('bank-statements/:statementId')
  @Roles(...READ)
  statement(
    @Req() req: ActorRequest,
    @Param('statementId') statementId: string,
  ) {
    return this.bank.statement(this.actor(req).tenantId, statementId);
  }

  @Get('bank-statements/:statementId/source')
  @Roles(...READ)
  async sourceEvidence(
    @Req() req: ActorRequest,
    @Param('statementId') statementId: string,
  ) {
    const source = await this.bank.sourceEvidence(
      this.actor(req).tenantId,
      statementId,
    );
    return new StreamableFile(source.stream, {
      type: 'text/csv',
      disposition: `attachment; filename="${source.filename}"`,
    });
  }

  @Get('bank-statements/:statementId/candidates')
  @Roles(...READ)
  candidates(
    @Req() req: ActorRequest,
    @Param('statementId') statementId: string,
  ) {
    return this.bank.candidates(this.actor(req).tenantId, statementId);
  }

  @Get('bank-statements/:statementId/reconciliation')
  @Roles(...READ)
  preview(@Req() req: ActorRequest, @Param('statementId') statementId: string) {
    return this.bank.preview(this.actor(req).tenantId, statementId);
  }

  @Post('bank-statements/:statementId/matches')
  @Roles(...PREPARE)
  proposeMatch(
    @Req() req: ActorRequest,
    @Param('statementId') statementId: string,
    @Headers('idempotency-key') key: string,
    @Headers('if-match') ifMatch: string,
    @Body()
    body: {
      statement_line_id: string;
      journal_line_id: string;
      reason: string;
    },
  ) {
    const actor = this.actor(req);
    return this.bank.proposeMatch(
      actor.tenantId,
      actor.actorId,
      this.key(key),
      statementId,
      body.statement_line_id,
      body.journal_line_id,
      body.reason,
      this.revision(ifMatch),
    );
  }

  @Post('bank-matches/:matchId/review')
  @Roles(...REVIEW)
  reviewMatch(
    @Req() req: ActorRequest,
    @Param('matchId') matchId: string,
    @Headers('idempotency-key') key: string,
    @Headers('if-match') ifMatch: string,
    @Body() body: { approve: boolean },
  ) {
    if (typeof body.approve !== 'boolean')
      throw new BadRequestException('approve must be boolean');
    const actor = this.actor(req);
    return this.bank.reviewMatch(
      actor.tenantId,
      actor.actorId,
      this.key(key),
      matchId,
      this.revision(ifMatch),
      body.approve,
    );
  }

  @Post('bank-statements/:statementId/outstanding')
  @Roles(...PREPARE)
  proposeOutstanding(
    @Req() req: ActorRequest,
    @Param('statementId') statementId: string,
    @Headers('idempotency-key') key: string,
    @Headers('if-match') ifMatch: string,
    @Body() body: { journal_line_id: string; kind: string; reason: string },
  ) {
    const actor = this.actor(req);
    return this.bank.proposeOutstanding(
      actor.tenantId,
      actor.actorId,
      this.key(key),
      statementId,
      body.journal_line_id,
      body.kind,
      body.reason,
      this.revision(ifMatch),
    );
  }

  @Post('bank-outstanding/:outstandingId/review')
  @Roles(...REVIEW)
  reviewOutstanding(
    @Req() req: ActorRequest,
    @Param('outstandingId') outstandingId: string,
    @Headers('idempotency-key') key: string,
    @Headers('if-match') ifMatch: string,
    @Body() body: { approve: boolean },
  ) {
    if (typeof body.approve !== 'boolean')
      throw new BadRequestException('approve must be boolean');
    const actor = this.actor(req);
    return this.bank.reviewOutstanding(
      actor.tenantId,
      actor.actorId,
      this.key(key),
      outstandingId,
      this.revision(ifMatch),
      body.approve,
    );
  }

  @Post('bank-statements/:statementId/reconcile')
  @Roles(...REVIEW)
  reconcile(
    @Req() req: ActorRequest,
    @Param('statementId') statementId: string,
    @Headers('idempotency-key') key: string,
    @Headers('if-match') ifMatch: string,
  ) {
    const actor = this.actor(req);
    return this.bank.finalize(
      actor.tenantId,
      actor.actorId,
      this.key(key),
      statementId,
      this.revision(ifMatch),
    );
  }
}
