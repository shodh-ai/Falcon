import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FINANCE_BULK_DEMAND_QUEUE } from '../../common/constants/finance-queue.constants';
import { LEADERSHIP_ANOMALY_QUEUE } from '../../common/constants/leadership-queue.constants';
import { FeeDemand } from '../../entities/fee-demand.entity';
import { Transaction } from '../../entities/transaction.entity';
import { LateFinePolicy } from '../../entities/late-fine-policy.entity';
import { CampusWalletModule } from '../campus-wallet/campus-wallet.module';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { FinanceWebhookService } from './finance-webhook.service';
import { FinanceReceiptService } from './finance-receipt.service';
import { FinanceLedgerService } from './finance-ledger.service';
import { FinanceAccountsService } from './finance-accounts.service';
import { FinanceApprovalsService } from './finance-approvals.service';
import { FinanceChequeService } from './finance-cheque.service';
import { FinanceBulkDemandProcessor } from './finance-bulk-demand.processor';
import { BudgetFpaModule } from '../leadership/budget-fpa.module';
import { GatewayPaymentService } from './gateway-payment.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: FINANCE_BULK_DEMAND_QUEUE }),
    BullModule.registerQueue({ name: LEADERSHIP_ANOMALY_QUEUE }),
    TypeOrmModule.forFeature([FeeDemand, Transaction, LateFinePolicy]),
    CampusWalletModule,
    BudgetFpaModule,
  ],
  controllers: [FinanceController],
  providers: [
    FinanceService,
    FinanceWebhookService,
    FinanceReceiptService,
    FinanceLedgerService,
    FinanceAccountsService,
    FinanceApprovalsService,
    FinanceChequeService,
    FinanceBulkDemandProcessor,
    GatewayPaymentService,
  ],
  exports: [
    FinanceService,
    FinanceLedgerService,
    FinanceReceiptService,
    GatewayPaymentService,
  ],
})
export class FinanceModule {}
