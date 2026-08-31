import { Module } from '@nestjs/common';
import { StorageModule } from '../../storage/storage.module';
import { DofaEngineModule } from '../dofa-engine/dofa-engine.module';
import {
  AssetRetirementController,
  AssetRetirementPublicController,
} from './asset-retirement.controller';
import { AssetRetirementEvidenceService } from './asset-retirement-evidence.service';
import { AssetRetirementEventConsumer } from './asset-retirement-event.consumer';
import { AssetRetirementOutboxPublisher } from './asset-retirement-outbox.publisher';
import { AssetRetirementService } from './asset-retirement.service';

@Module({
  imports: [DofaEngineModule, StorageModule],
  controllers: [AssetRetirementController, AssetRetirementPublicController],
  providers: [
    AssetRetirementService,
    AssetRetirementEvidenceService,
    AssetRetirementEventConsumer,
    AssetRetirementOutboxPublisher,
  ],
  exports: [AssetRetirementService],
})
export class AssetRetirementModule {}
