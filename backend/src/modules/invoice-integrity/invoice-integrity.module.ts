import { Module } from '@nestjs/common';
import { InvoiceIntegrityController } from './invoice-integrity.controller';
import { InvoiceIntegrityEventConsumer } from './invoice-integrity-event.consumer';
import { InvoiceIntegrityOutboxPublisher } from './invoice-integrity-outbox.publisher';
import { InvoiceIntegrityService } from './invoice-integrity.service';
import { InvoiceIntegrityEvidenceService } from './invoice-integrity-evidence.service';

@Module({
  controllers: [InvoiceIntegrityController],
  providers: [
    InvoiceIntegrityService,
    InvoiceIntegrityEvidenceService,
    InvoiceIntegrityEventConsumer,
    InvoiceIntegrityOutboxPublisher,
  ],
  exports: [InvoiceIntegrityService],
})
export class InvoiceIntegrityModule {}
