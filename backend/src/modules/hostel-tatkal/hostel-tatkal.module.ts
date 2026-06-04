import { Module } from '@nestjs/common';
import { HostelTatkalController } from './hostel-tatkal.controller';
import { HostelTatkalService } from './hostel-tatkal.service';
import { HostelTatkalGateway } from './hostel-tatkal.gateway';

@Module({
  controllers: [HostelTatkalController],
  providers: [HostelTatkalService, HostelTatkalGateway],
  exports: [HostelTatkalService, HostelTatkalGateway],
})
export class HostelTatkalModule {}
