import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { HostelTatkalController } from './hostel-tatkal.controller';
import { HostelTatkalService } from './hostel-tatkal.service';
import { HostelTatkalGateway } from './hostel-tatkal.gateway';
import { HostelTatkalPaymentListener } from './hostel-tatkal-payment.listener';
import { ScopedSocketModule } from '../../common/websockets/scoped-socket.module';

@Module({
  imports: [FinanceModule, ScopedSocketModule],
  controllers: [HostelTatkalController],
  providers: [
    HostelTatkalService,
    HostelTatkalGateway,
    HostelTatkalPaymentListener,
  ],
  exports: [HostelTatkalService, HostelTatkalGateway],
})
export class HostelTatkalModule {}
