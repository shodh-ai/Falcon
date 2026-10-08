import { Module } from '@nestjs/common';
import { UosGovernanceController } from './uos-governance.controller';
import { UosGovernanceService } from './uos-governance.service';
import { DofaEngineModule } from '../dofa-engine/dofa-engine.module';
import { NotificationsModule } from '../../core/notifications/notifications.module';

@Module({
  imports: [DofaEngineModule, NotificationsModule],
  controllers: [UosGovernanceController],
  providers: [UosGovernanceService],
  exports: [UosGovernanceService],
})
export class UosGovernanceModule {}
