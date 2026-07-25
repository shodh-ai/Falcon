import { Module } from '@nestjs/common';
import { LeadershipModule } from '../leadership/leadership.module';
import { CooOpsController } from './coo-ops.controller';
import { CooOpsService } from './coo-ops.service';
import { GstVerificationService } from './gst-verification.service';
import { ProcurementService } from './procurement.service';

@Module({
  imports: [LeadershipModule],
  controllers: [CooOpsController],
  providers: [CooOpsService, ProcurementService, GstVerificationService],
  exports: [CooOpsService, ProcurementService, GstVerificationService],
})
export class CooOpsModule {}
