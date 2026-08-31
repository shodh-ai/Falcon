import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryEventConsumer } from './inventory-event.consumer';
import { InventoryOutboxPublisher } from './inventory-outbox.publisher';
import { InventoryService } from './inventory.service';

@Module({
  controllers: [InventoryController],
  providers: [
    InventoryService,
    InventoryEventConsumer,
    InventoryOutboxPublisher,
  ],
  exports: [InventoryService],
})
export class InventoryModule {}
