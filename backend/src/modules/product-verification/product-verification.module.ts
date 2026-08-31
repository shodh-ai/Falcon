import { Module } from '@nestjs/common';
import { ProductVerificationController } from './product-verification.controller';
import { ProductVerificationEvidenceService } from './product-verification-evidence.service';
import { ProductVerificationEventConsumer } from './product-verification-event.consumer';
import { ProductVerificationOutboxPublisher } from './product-verification-outbox.publisher';
import { ProductVerificationService } from './product-verification.service';

@Module({
  controllers: [ProductVerificationController],
  providers: [
    ProductVerificationService,
    ProductVerificationEvidenceService,
    ProductVerificationEventConsumer,
    ProductVerificationOutboxPublisher,
  ],
  exports: [ProductVerificationService],
})
export class ProductVerificationModule {}
