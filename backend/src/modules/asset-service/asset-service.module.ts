import { Module } from '@nestjs/common';
import { StorageModule } from '../../storage/storage.module';
import { InventoryModule } from '../inventory/inventory.module';
import { AcquisitionModule } from '../acquisitions/acquisition.module';
import { AssetServiceController } from './asset-service.controller';
import { AssetServiceEvidenceService } from './asset-service-evidence.service';
import { AssetServiceEventConsumer } from './asset-service-event.consumer';
import { AssetServiceOutboxPublisher } from './asset-service-outbox.publisher';
import { AssetServiceService } from './asset-service.service';

@Module({
  imports: [InventoryModule, AcquisitionModule, StorageModule],
  controllers: [AssetServiceController],
  providers: [
    AssetServiceService,
    AssetServiceEvidenceService,
    AssetServiceEventConsumer,
    AssetServiceOutboxPublisher,
  ],
  exports: [AssetServiceService],
})
export class AssetServiceModule {}
