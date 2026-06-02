import { Module } from '@nestjs/common';
import { SystemAlertsController } from './system-alerts.controller';
import { SystemAlertsService } from './system-alerts.service';

@Module({
  controllers: [SystemAlertsController],
  providers: [SystemAlertsService],
})
export class SystemModule {}
