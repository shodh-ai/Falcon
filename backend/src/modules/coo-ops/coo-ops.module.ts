import { Module } from '@nestjs/common';
import { CooOpsController } from './coo-ops.controller';
import { CooOpsService } from './coo-ops.service';

@Module({
  controllers: [CooOpsController],
  providers: [CooOpsService],
  exports: [CooOpsService],
})
export class CooOpsModule {}
