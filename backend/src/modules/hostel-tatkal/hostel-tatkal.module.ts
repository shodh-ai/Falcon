import { Module } from '@nestjs/common';
import { HostelTatkalController } from './hostel-tatkal.controller';
import { HostelTatkalService } from './hostel-tatkal.service';
import { HostelTatkalGateway } from './hostel-tatkal.gateway';
import { HostelTatkalPaymentListener } from './hostel-tatkal-payment.listener';

@Module({
  controllers: [HostelTatkalController],
  providers: [
    HostelTatkalService,
    HostelTatkalGateway,
    HostelTatkalPaymentListener,
  ],
  exports: [HostelTatkalService, HostelTatkalGateway],
})
export class HostelTatkalModule {}
