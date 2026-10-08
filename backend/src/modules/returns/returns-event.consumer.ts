/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { hash } from '../procurements/procurement.util';

@Injectable()
export class ReturnsEventConsumer {
  constructor(@InjectDataSource() private readonly db: DataSource) {}
  @Interval(15000) async consume() {
    const events = await this.db.query(
      `SELECT e.* FROM proc_outbox_events e WHERE e.event_type IN('ReturnRecorded.v1','RefundPosted.v1','CreditNotePosted.v1') AND NOT EXISTS(SELECT 1 FROM ret_consumed_events c WHERE c.event_id=e.event_id) ORDER BY e.created_at LIMIT 100`,
    );
    for (const event of events)
      await this.db.transaction(async (m) => {
        if (
          (
            await m.query(
              `SELECT 1 FROM ret_consumed_events WHERE event_id=$1 FOR UPDATE`,
              [event.event_id],
            )
          )[0]
        )
          return;
        if (hash(event.payload) !== event.payload_hash)
          throw new Error(`Module 2 event hash mismatch: ${event.event_id}`);
        const payload = event.payload as Record<string, any>;
        const caseId =
          payload.module7_case_id ??
          (
            await m.query(
              `SELECT module7_case_id FROM proc_returns WHERE return_id=COALESCE($1::uuid,$2::uuid)`,
              [payload.return_id ?? null, event.aggregate_id],
            )
          )[0]?.module7_case_id;
        if (caseId) {
          if (event.event_type === 'ReturnRecorded.v1')
            await m.query(
              `INSERT INTO ret_execution_projections(return_case_id,tenant_id,proc_return_id,source_event_id,execution_status,source_revision,payload) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT(return_case_id) DO UPDATE SET source_event_id=EXCLUDED.source_event_id,execution_status=EXCLUDED.execution_status,source_revision=EXCLUDED.source_revision,payload=EXCLUDED.payload,updated_at=NOW()`,
              [
                caseId,
                event.tenant_id,
                event.aggregate_id,
                event.event_id,
                payload.status ?? 'UNKNOWN',
                event.aggregate_sequence,
                JSON.stringify(payload),
              ],
            );
          else
            await m.query(
              `INSERT INTO ret_financial_projections(return_case_id,tenant_id,source_event_id,recovery_type,posted_amount,currency,destination_bucket,payload,posted_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) ON CONFLICT(source_event_id) DO NOTHING`,
              [
                caseId,
                event.tenant_id,
                event.event_id,
                event.event_type,
                Number(payload.amount),
                payload.currency,
                payload.recovery_destination ?? 'AVAILABLE',
                JSON.stringify(payload),
                event.occurred_at,
              ],
            );
        }
        await m.query(
          `INSERT INTO ret_consumed_events(event_id,tenant_id,event_type) VALUES($1,$2,$3)`,
          [event.event_id, event.tenant_id, event.event_type],
        );
      });
    await this.consumeAssetServiceOutcomes();
  }

  private async consumeAssetServiceOutcomes() {
    const events = await this.db.query(
      `SELECT e.* FROM svc_outbox_events e WHERE e.event_type IN('AssetReturnedToService.v1','AssetServiceIrreparable.v1','AssetServiceCompleted.v1')
       AND NOT EXISTS(SELECT 1 FROM ret_consumed_events c WHERE c.event_id=e.event_id) ORDER BY e.created_at LIMIT 100`,
    );
    for (const event of events)
      await this.db.transaction(async (m) => {
        if (
          (
            await m.query(
              `SELECT 1 FROM ret_consumed_events WHERE event_id=$1 FOR UPDATE`,
              [event.event_id],
            )
          )[0]
        )
          return;
        if (hash(event.payload) !== event.payload_hash)
          throw new Error(`Module 8 event hash mismatch: ${event.event_id}`);
        const envelope = event.payload as Record<string, any>,
          payload = (envelope.payload ?? envelope) as Record<string, any>,
          caseId = payload.module7_case_id;
        if (caseId) {
          const status =
            event.event_type === 'AssetReturnedToService.v1'
              ? 'CLOSED'
              : event.event_type === 'AssetServiceIrreparable.v1'
                ? 'DISPUTED'
                : 'RESOLUTION_PENDING';
          await m.query(
            `UPDATE ret_cases SET workflow_status=$2,updated_at=NOW() WHERE return_case_id=$1 AND disposition='REPAIR_REFERRAL' AND workflow_status NOT IN('CANCELLED','REJECTED','SUPERSEDED')`,
            [caseId, status],
          );
          await m.query(
            `UPDATE ret_execution_projections SET execution_status=$2,payload=payload||$3::jsonb,updated_at=NOW() WHERE return_case_id=$1`,
            [caseId, `MODULE8_${status}`, JSON.stringify(payload)],
          );
        }
        await m.query(
          `INSERT INTO ret_consumed_events(event_id,tenant_id,event_type) VALUES($1,$2,$3)`,
          [event.event_id, event.tenant_id, event.event_type],
        );
      });
  }
}
