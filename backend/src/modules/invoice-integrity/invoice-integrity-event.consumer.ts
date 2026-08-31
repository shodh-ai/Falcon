/* eslint-disable @typescript-eslint/no-unsafe-assignment -- TypeORM query rows are untyped */
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InvoiceIntegrityService } from './invoice-integrity.service';

@Injectable()
export class InvoiceIntegrityEventConsumer {
  private readonly logger = new Logger(InvoiceIntegrityEventConsumer.name);
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly integrity: InvoiceIntegrityService,
  ) {}

  @Interval(15_000)
  async consumeSubmittedInvoices() {
    const rows = await this.db.query(
      `SELECT o.event_id FROM proc_outbox_events o
       JOIN tenant_subscriptions ts ON ts.tenant_id=o.tenant_id
         AND ts.feature_key='dofa_module3_invoice_integrity' AND ts.is_enabled=true
         AND (ts.expires_at IS NULL OR ts.expires_at>=NOW())
       WHERE o.event_type='ProcurementInvoiceSubmitted.v1'
         AND NOT EXISTS (SELECT 1 FROM inv_integrity_cases c WHERE c.source_event_id=o.event_id)
       ORDER BY o.created_at LIMIT 20`,
    );
    for (const row of rows as Array<{ event_id: string }>) {
      try {
        await this.integrity.consumeInvoiceSubmitted(row.event_id);
      } catch (error) {
        this.logger.error(
          `Failed to open invoice integrity case from ${row.event_id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }
}
