import { Module } from '@nestjs/common';
import { StorageModule } from '../../storage/storage.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ProcurementModule } from '../procurements/procurement.module';
import { ReturnsController } from './returns.controller';
import { ReturnsEvidenceService } from './returns-evidence.service';
import { ReturnsService } from './returns.service';
import { ReturnsOutboxPublisher } from './returns-outbox.publisher';
import { ReturnsEventConsumer } from './returns-event.consumer';

@Module({
  imports: [InventoryModule, ProcurementModule, StorageModule],
  controllers: [ReturnsController],
  providers: [
    ReturnsService,
    ReturnsEvidenceService,
    ReturnsOutboxPublisher,
    ReturnsEventConsumer,
  ],
  exports: [ReturnsService],
})
export class ReturnsModule {}
