import { Module } from '@nestjs/common';
import { UosGovernanceController } from './uos-governance.controller';
import { UosGovernanceService } from './uos-governance.service';
import { DofaEngineModule } from '../dofa-engine/dofa-engine.module';

@Module({
  imports: [DofaEngineModule],
  controllers: [UosGovernanceController],
  providers: [UosGovernanceService],
  exports: [UosGovernanceService],
})
export class UosGovernanceModule {}
