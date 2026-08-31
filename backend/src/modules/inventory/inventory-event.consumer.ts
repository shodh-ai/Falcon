/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument -- TypeORM query rows are untyped */
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InventoryService } from './inventory.service';

@Injectable()
export class InventoryEventConsumer {
  private readonly logger = new Logger(InventoryEventConsumer.name);
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly inventory: InventoryService,
  ) {}
  @Interval(12_000) async consumeVerified() {
    const rows = await this.db.query(
      `SELECT e.event_id FROM pv_outbox_events e JOIN tenant_subscriptions ts ON ts.tenant_id=e.tenant_id AND ts.feature_key='dofa_module5_inventory' AND ts.is_enabled=true AND(ts.expires_at IS NULL OR ts.expires_at>=NOW()) WHERE e.event_type='PhysicalProductVerified.v1' AND NOT EXISTS(SELECT 1 FROM inv_consumed_events c WHERE c.event_id=e.event_id) ORDER BY e.created_at LIMIT 20`,
    );
    for (const row of rows)
      try {
        await this.inventory.consumeVerifiedProduct(row.event_id);
      } catch (error) {
        this.logger.error(
          `Module 5 ingestion failed for ${row.event_id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
  }
  @Interval(12_000) async consumeInvalidations() {
    const rows = await this.db.query(
      `SELECT e.event_id FROM pv_outbox_events e JOIN tenant_subscriptions ts ON ts.tenant_id=e.tenant_id AND ts.feature_key='dofa_module5_inventory' AND ts.is_enabled=true WHERE e.event_type IN('PhysicalVerificationIdentityRevoked.v1','PhysicalVerificationReconsidered.v1') AND NOT EXISTS(SELECT 1 FROM inv_consumed_events c WHERE c.event_id=e.event_id) ORDER BY e.created_at LIMIT 20`,
    );
    for (const row of rows)
      try {
        await this.inventory.consumeInvalidation(row.event_id);
      } catch (error) {
        this.logger.error(
          `Module 5 invalidation failed for ${row.event_id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
  }
}
