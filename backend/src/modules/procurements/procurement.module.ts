import { Module } from '@nestjs/common';
import { ProcurementController } from './procurement.controller';
import { ProcurementEventConsumer } from './procurement-event.consumer';
import { ProcurementOutboxPublisher } from './procurement-outbox.publisher';
import { ProcurementService } from './procurement.service';
import { ProcurementImportService } from './procurement-import.service';
import { ProcurementDocumentService } from './procurement-document.service';

@Module({
  controllers: [ProcurementController],
  providers: [
    ProcurementService,
    ProcurementDocumentService,
    ProcurementImportService,
    ProcurementEventConsumer,
    ProcurementOutboxPublisher,
  ],
  exports: [ProcurementService],
})
export class ProcurementModule {}
