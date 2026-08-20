import { Module } from '@nestjs/common';
import { AdminOpsModule } from '../admin-ops/admin-ops.module';
import { AdminControlController } from './admin-control.controller';
import { AdminControlService } from './admin-control.service';

@Module({
  imports: [AdminOpsModule],
  controllers: [AdminControlController],
  providers: [AdminControlService],
  exports: [AdminControlService],
})
export class AdminControlModule {}
