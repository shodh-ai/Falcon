import { Module } from '@nestjs/common';
import { AcquisitionModule } from '../acquisitions/acquisition.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ConsumablesController } from './consumables.controller';
import { ConsumablesService } from './consumables.service';
import { ConsumablesWorker } from './consumables.worker';
import { ConsumablesOutboxPublisher } from './consumables-outbox.publisher';

@Module({
  imports: [InventoryModule, AcquisitionModule],
  controllers: [ConsumablesController],
  providers: [
    ConsumablesService,
    ConsumablesWorker,
    ConsumablesOutboxPublisher,
  ],
  exports: [ConsumablesService],
})
export class ConsumablesModule {}
