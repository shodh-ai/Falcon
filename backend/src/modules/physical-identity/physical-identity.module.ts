import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import {
  PhysicalIdentityController,
  PhysicalIdentityMachineController,
} from './physical-identity.controller';
import { PhysicalIdentityEventConsumer } from './physical-identity-event.consumer';
import { PhysicalIdentityOutboxPublisher } from './physical-identity-outbox.publisher';
import { PhysicalIdentityService } from './physical-identity.service';

@Module({
  imports: [InventoryModule],
  controllers: [PhysicalIdentityController, PhysicalIdentityMachineController],
  providers: [
    PhysicalIdentityService,
    PhysicalIdentityEventConsumer,
    PhysicalIdentityOutboxPublisher,
  ],
  exports: [PhysicalIdentityService],
})
export class PhysicalIdentityModule {}
