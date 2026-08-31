/* eslint-disable @typescript-eslint/no-unsafe-assignment -- TypeORM query rows are untyped */
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ProductVerificationService } from './product-verification.service';

@Injectable()
export class ProductVerificationEventConsumer {
  private readonly logger = new Logger(ProductVerificationEventConsumer.name);
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly verification: ProductVerificationService,
  ) {}

  @Interval(12_000)
  async consumeReceipts() {
    const rows = await this.db.query(
      `SELECT e.event_id FROM proc_outbox_events e
       JOIN tenant_subscriptions ts ON ts.tenant_id=e.tenant_id
         AND ts.feature_key='dofa_module4_product_verification' AND ts.is_enabled=true
         AND (ts.expires_at IS NULL OR ts.expires_at>=NOW())
       WHERE e.event_type='GoodsReceiptRecorded.v1'
         AND NOT EXISTS (SELECT 1 FROM pv_consumed_events c WHERE c.event_id=e.event_id)
       ORDER BY e.created_at LIMIT 20`,
    );
    for (const row of rows as Array<{ event_id: string }>) {
      try {
        await this.verification.consumeGoodsReceipt(row.event_id);
      } catch (error) {
        this.logger.error(
          `Failed to create product verification case from ${row.event_id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  @Interval(12_000)
  async consumeReturns() {
    const rows = await this.db.query(
      `SELECT e.event_id FROM proc_outbox_events e
       JOIN tenant_subscriptions ts ON ts.tenant_id=e.tenant_id
         AND ts.feature_key='dofa_module4_product_verification' AND ts.is_enabled=true
       WHERE e.event_type='ReturnRecorded.v1'
         AND NOT EXISTS (SELECT 1 FROM pv_consumed_events c WHERE c.event_id=e.event_id)
       ORDER BY e.created_at LIMIT 20`,
    );
    for (const row of rows as Array<{ event_id: string }>) {
      try {
        await this.verification.consumeReturn(row.event_id);
      } catch (error) {
        this.logger.error(
          `Failed to apply return ${row.event_id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  @Interval(12_000)
  async consumeIntegrityInvalidations() {
    const rows = await this.db.query(
      `SELECT e.event_id FROM inv_integrity_outbox_events e
       JOIN tenant_subscriptions ts ON ts.tenant_id=e.tenant_id
         AND ts.feature_key='dofa_module4_product_verification' AND ts.is_enabled=true
       WHERE e.event_type IN ('InvoiceIntegrityRejected.v1','InvoiceIntegrityReconsiderationOpened.v1')
         AND NOT EXISTS (SELECT 1 FROM pv_consumed_events c WHERE c.event_id=e.event_id)
       ORDER BY e.created_at LIMIT 20`,
    );
    for (const row of rows as Array<{ event_id: string }>) {
      try {
        await this.verification.consumeInvoiceInvalidation(row.event_id);
      } catch (error) {
        this.logger.error(
          `Failed to invalidate physical identity from ${row.event_id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }
}
