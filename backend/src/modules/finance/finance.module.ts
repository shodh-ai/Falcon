import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FINANCE_BULK_DEMAND_QUEUE } from '../../common/constants/finance-queue.constants';
import { FeeDemand } from '../../entities/fee-demand.entity';
import { Transaction } from '../../entities/transaction.entity';
import { LateFinePolicy } from '../../entities/late-fine-policy.entity';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { FinanceWebhookService } from './finance-webhook.service';
import { FinanceReceiptService } from './finance-receipt.service';
import { FinanceLedgerService } from './finance-ledger.service';
import { FinanceAccountsService } from './finance-accounts.service';
import { FinanceBulkDemandProcessor } from './finance-bulk-demand.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: FINANCE_BULK_DEMAND_QUEUE }),
    TypeOrmModule.forFeature([FeeDemand, Transaction, LateFinePolicy]),
  ],
  controllers: [FinanceController],
  providers: [
    FinanceService,
    FinanceWebhookService,
    FinanceReceiptService,
    FinanceLedgerService,
    FinanceAccountsService,
    FinanceBulkDemandProcessor,
  ],
  exports: [FinanceService],
})
export class FinanceModule {}
