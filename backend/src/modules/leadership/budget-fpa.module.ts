import { Module } from '@nestjs/common';
import { BudgetFpaService } from './budget-fpa.service';

@Module({
  providers: [BudgetFpaService],
  exports: [BudgetFpaService],
})
export class BudgetFpaModule {}
