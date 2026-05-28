import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeeDemand } from '../../entities/fee-demand.entity';
import { Transaction } from '../../entities/transaction.entity';
import { LateFinePolicy } from '../../entities/late-fine-policy.entity';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';

@Module({
  imports: [TypeOrmModule.forFeature([FeeDemand, Transaction, LateFinePolicy])],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
