import { Global, Module } from '@nestjs/common';
import {
  ModuleControlController,
  ModuleRuntimeController,
} from './module-control.controller';
import { ModuleAvailabilityInterceptor } from './module-availability.interceptor';
import { ModuleControlService } from './module-control.service';
import {
  AdmissionsPort,
  CrossModulePortService,
  ExaminationsPort,
  FinancePort,
  HrmsPort,
  InventoryPort,
} from './cross-module-port.service';

@Global()
@Module({
  controllers: [ModuleRuntimeController, ModuleControlController],
  providers: [
    ModuleControlService,
    ModuleAvailabilityInterceptor,
    CrossModulePortService,
    { provide: FinancePort, useExisting: CrossModulePortService },
    { provide: HrmsPort, useExisting: CrossModulePortService },
    { provide: AdmissionsPort, useExisting: CrossModulePortService },
    { provide: InventoryPort, useExisting: CrossModulePortService },
    { provide: ExaminationsPort, useExisting: CrossModulePortService },
  ],
  exports: [
    ModuleControlService,
    ModuleAvailabilityInterceptor,
    CrossModulePortService,
    FinancePort,
    HrmsPort,
    AdmissionsPort,
    InventoryPort,
    ExaminationsPort,
  ],
})
export class ModuleControlModule {}
