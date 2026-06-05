import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { HostelAdminController } from './hostel-admin.controller';
import { HostelAdminService } from './hostel-admin.service';
import { HostelAdminGateway } from './hostel-admin.gateway';

@Module({
  imports: [FinanceModule],
  controllers: [HostelAdminController],
  providers: [HostelAdminService, HostelAdminGateway],
  exports: [HostelAdminService, HostelAdminGateway],
})
export class HostelAdminModule {}
