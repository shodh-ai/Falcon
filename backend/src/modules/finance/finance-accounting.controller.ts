import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { BelongsToModule } from '../../module-control/module-control.decorators';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { FinanceAccountingService } from './finance-accounting.service';

type FinanceUser = { user: { tenant_id?: string } };
const ACCOUNTING_READ_ROLES = [
  'SuperAdmin',
  'TenantAdmin',
  'CampusAdmin',
  'Accountant',
  'APManager',
  'FinanceController',
  'CFO',
  'InternalAuditor',
] as const;

@BelongsToModule('finance_procurement')
@Controller('api/finance/accounting/v1')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinanceAccountingController {
  constructor(private readonly accounting: FinanceAccountingService) {}

  private tenant(req: FinanceUser): string {
    if (!req.user.tenant_id)
      throw new ForbiddenException('Tenant context is required');
    return req.user.tenant_id;
  }

  @Get('book')
  @Roles(...ACCOUNTING_READ_ROLES)
  book(@Req() req: FinanceUser) {
    return this.accounting.book(this.tenant(req));
  }

  @Get('periods')
  @Roles(...ACCOUNTING_READ_ROLES)
  periods(@Req() req: FinanceUser) {
    return this.accounting.periods(this.tenant(req));
  }

  @Get('reports/journal-integrity')
  @Roles(...ACCOUNTING_READ_ROLES)
  journalIntegrity(@Req() req: FinanceUser) {
    return this.accounting.journalIntegrity(this.tenant(req));
  }

  @Get('reports/trial-balance')
  @Roles(...ACCOUNTING_READ_ROLES)
  trialBalance(
    @Req() req: FinanceUser,
    @Query('as_of') asOf?: string,
    @Query('ledger_revision') revision?: string,
  ) {
    return this.accounting.trialBalance(this.tenant(req), asOf, revision);
  }

  @Get('reports/income-expenditure')
  @Roles(...ACCOUNTING_READ_ROLES)
  incomeExpenditure(
    @Req() req: FinanceUser,
    @Query('as_of') asOf?: string,
    @Query('ledger_revision') revision?: string,
  ) {
    return this.accounting.incomeExpenditure(this.tenant(req), asOf, revision);
  }

  @Get('reports/balance-sheet')
  @Roles(...ACCOUNTING_READ_ROLES)
  balanceSheet(
    @Req() req: FinanceUser,
    @Query('as_of') asOf?: string,
    @Query('ledger_revision') revision?: string,
  ) {
    return this.accounting.balanceSheet(this.tenant(req), asOf, revision);
  }

  @Get('accounts/:accountCode/ledger')
  @Roles(...ACCOUNTING_READ_ROLES)
  generalLedger(
    @Req() req: FinanceUser,
    @Param('accountCode') accountCode: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('ledger_revision') revision?: string,
  ) {
    return this.accounting.generalLedger(
      this.tenant(req),
      accountCode,
      from,
      to,
      revision,
    );
  }
}
