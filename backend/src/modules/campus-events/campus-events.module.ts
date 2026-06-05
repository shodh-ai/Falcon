import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { CampusEventsController } from './campus-events.controller';
import { CampusEventsService } from './campus-events.service';
import { CampusEventsPaymentListener } from './campus-events-payment.listener';

@Module({
  imports: [FinanceModule],
  controllers: [CampusEventsController],
  providers: [CampusEventsService, CampusEventsPaymentListener],
  exports: [CampusEventsService],
})
export class CampusEventsModule {}
