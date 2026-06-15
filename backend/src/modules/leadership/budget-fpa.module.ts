import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FalconNotification } from '../../entities/falcon-notification.entity';
import { BudgetFpaService } from './budget-fpa.service';

@Module({
  imports: [TypeOrmModule.forFeature([FalconNotification])],
  providers: [BudgetFpaService],
  exports: [BudgetFpaService],
})
export class BudgetFpaModule {}
