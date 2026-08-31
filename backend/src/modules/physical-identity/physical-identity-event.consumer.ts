/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- TypeORM raw-query rows */
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PhysicalIdentityService } from './physical-identity.service';

@Injectable()
export class PhysicalIdentityEventConsumer {
  private readonly logger = new Logger(PhysicalIdentityEventConsumer.name);
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly service: PhysicalIdentityService,
  ) {}
  @Interval(15_000)
  async consumeMovementAuthority() {
    const sources = [
      {
        table: 'inv_outbox_events' as const,
        events: [
          'InventoryOwnershipTransferred.v1',
          'InventoryCustodianChanged.v1',
          'InventoryLocationChanged.v1',
        ],
      },
      {
        table: 'ret_outbox_events' as const,
        events: ['ReturnShipmentRecorded.v1'],
      },
      {
        table: 'svc_outbox_events' as const,
        events: ['AssetServiceCustodyTransferred.v1'],
      },
      {
        table: 'retirement_outbox_events' as const,
        events: ['AssetDispositionHandoverRecorded.v1'],
      },
    ];
    for (const source of sources) {
      const rows = await this.db.query(
        `SELECT e.event_id FROM ${source.table} e JOIN tenant_subscriptions ts ON ts.tenant_id=e.tenant_id AND ts.feature_key='dofa_module_x_gate_observation' AND ts.is_enabled=true AND(ts.expires_at IS NULL OR ts.expires_at>=NOW()) WHERE e.event_type=ANY($1::text[]) AND NOT EXISTS(SELECT 1 FROM pix_consumed_events c WHERE c.event_id=e.event_id) ORDER BY e.created_at LIMIT 20`,
        [source.events],
      );
      for (const row of rows)
        try {
          await this.service.consumeMovementEvent(
            source.table,
            String(row.event_id),
          );
        } catch (error) {
          this.logger.error(
            `Module X movement projection failed for ${source.table}/${row.event_id}`,
            error instanceof Error ? error.stack : String(error),
          );
        }
    }
  }
}
