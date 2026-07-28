import { Module } from '@nestjs/common';
import { CooOpsModule } from '../coo-ops/coo-ops.module';
import { LabsController } from './labs.controller';
import { LabsService } from './labs.service';

@Module({
  imports: [CooOpsModule],
  controllers: [LabsController],
  providers: [LabsService],
  exports: [LabsService],
})
export class LabsModule {}
