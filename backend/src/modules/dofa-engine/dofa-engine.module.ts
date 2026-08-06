import { Module } from '@nestjs/common';
import { DofaEngineController } from './dofa-engine.controller';
import { DofaEngineService } from './dofa-engine.service';
import { DofaPolicyController } from './dofa-policy.controller';
import { DofaPolicyService } from './dofa-policy.service';
import { HrHeadcountAliasController } from './hr-headcount-alias.controller';

@Module({
  controllers: [
    DofaEngineController,
    HrHeadcountAliasController,
    DofaPolicyController,
  ],
  providers: [DofaEngineService, DofaPolicyService],
  exports: [DofaEngineService, DofaPolicyService],
})
export class DofaEngineModule {}
