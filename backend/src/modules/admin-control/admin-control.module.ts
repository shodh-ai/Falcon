import { Module } from '@nestjs/common';
import { AdminControlController } from './admin-control.controller';
import { AdminControlService } from './admin-control.service';

@Module({
  controllers: [AdminControlController],
  providers: [AdminControlService],
  exports: [AdminControlService],
})
export class AdminControlModule {}
