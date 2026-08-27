/* eslint-disable @typescript-eslint/no-unsafe-assignment -- TypeORM query rows are untyped */
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ProcurementService } from './procurement.service';

@Injectable()
export class ProcurementEventConsumer {
  private readonly logger = new Logger(ProcurementEventConsumer.name);
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly procurements: ProcurementService,
  ) {}

  @Interval(15_000)
  async consumeApprovedAcquisitions() {
    const rows = await this.db.query(
      `SELECT o.event_id FROM acq_outbox_events o
       JOIN tenant_subscriptions ts ON ts.tenant_id=o.tenant_id
         AND ts.feature_key='dofa_module2_progressive_procurement'
         AND ts.is_enabled=true AND (ts.expires_at IS NULL OR ts.expires_at>=NOW())
       WHERE o.event_type='AcquisitionApproved.v1'
         AND NOT EXISTS (SELECT 1 FROM proc_cases c WHERE c.source_event_id=o.event_id)
       ORDER BY o.created_at LIMIT 20`,
    );
    for (const row of rows as Array<{ event_id: string }>) {
      try {
        await this.procurements.consumeApprovedEvent(row.event_id);
      } catch (error) {
        this.logger.error(
          `Failed to create procurement case from ${row.event_id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  @Interval(10_000)
  async consumeIntegrityDecisions() {
    const rows = await this.db.query(
      `SELECT e.event_id FROM inv_integrity_outbox_events e
       JOIN tenant_subscriptions ts ON ts.tenant_id=e.tenant_id
         AND ts.feature_key='dofa_module3_invoice_integrity' AND ts.is_enabled=true
         AND (ts.expires_at IS NULL OR ts.expires_at>=NOW())
       WHERE e.event_type IN ('InvoiceIntegrityCleared.v1','InvoiceIntegrityRejected.v1')
         AND NOT EXISTS (
           SELECT 1 FROM proc_integrity_event_consumption c
           WHERE c.event_id=e.event_id
         )
       ORDER BY e.created_at LIMIT 20`,
    );
    for (const row of rows as Array<{ event_id: string }>) {
      try {
        await this.procurements.applyIntegrityDecision(row.event_id);
      } catch (error) {
        this.logger.error(
          `Failed to apply integrity decision ${row.event_id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  @Interval(10_000)
  async consumeIntegrityReconsiderations() {
    const rows = await this.db.query(
      `SELECT e.event_id FROM inv_integrity_outbox_events e
       JOIN tenant_subscriptions ts ON ts.tenant_id=e.tenant_id
         AND ts.feature_key='dofa_module3_invoice_integrity' AND ts.is_enabled=true
       WHERE e.event_type='InvoiceIntegrityReconsiderationOpened.v1'
         AND NOT EXISTS (SELECT 1 FROM proc_integrity_event_consumption c WHERE c.event_id=e.event_id)
       ORDER BY e.created_at LIMIT 20`,
    );
    for (const row of rows as Array<{ event_id: string }>) {
      try {
        await this.procurements.invalidateIntegrityClearance(row.event_id);
      } catch (error) {
        this.logger.error(
          `Failed to invalidate reconsidered integrity clearance ${row.event_id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }
}
