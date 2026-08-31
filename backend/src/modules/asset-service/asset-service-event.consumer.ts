/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { serviceHash } from './asset-service.util';

@Injectable()
export class AssetServiceEventConsumer {
  constructor(@InjectDataSource() private readonly db: DataSource) {}
  @Interval(15000) async consume() {
    const events = await this.db.query(`
      SELECT event_id,tenant_id,event_type,payload,payload_hash,occurred_at,aggregate_sequence,'RETURNS' source FROM ret_outbox_events WHERE event_type='ServiceReferralRequested.v1'
      UNION ALL SELECT event_id,tenant_id,event_type,payload,payload_hash,occurred_at,aggregate_sequence,'PV' source FROM pv_outbox_events WHERE event_type IN('PhysicalProductVerified.v1','PhysicalProductRejected.v1')
      UNION ALL SELECT event_id,tenant_id,event_type,payload,payload_hash,occurred_at,aggregate_sequence,'PROC' source FROM proc_outbox_events WHERE event_type IN('ProcurementOrderIssued.v1','PaymentPosted.v1')
      UNION ALL SELECT event_id,tenant_id,event_type,payload,payload_hash,occurred_at,aggregate_sequence,'CON' source FROM con_outbox_events WHERE event_type IN('ConsumableIssued.v1','ConsumableConsumptionRecorded.v1')
      ORDER BY occurred_at LIMIT 200`);
    for (const event of events)
      await this.db.transaction(async (m) => {
        if (
          (
            await m.query(
              `SELECT 1 FROM svc_consumed_events WHERE event_id=$1 FOR UPDATE`,
              [event.event_id],
            )
          )[0]
        )
          return;
        if (serviceHash(event.payload) !== event.payload_hash)
          throw new Error(
            `Module 8 source event hash mismatch: ${event.event_id}`,
          );
        const envelope = event.payload as Record<string, any>,
          payload = (envelope.payload ?? envelope) as Record<string, any>;
        if (event.event_type === 'ServiceReferralRequested.v1')
          await this.consumeReferral(m, event, payload, envelope);
        else if (event.source === 'PV')
          await this.consumeReverification(m, event, payload);
        else if (event.source === 'PROC')
          await this.consumeFinancial(m, event, payload);
        else if (event.source === 'CON')
          await this.consumePart(m, event, payload);
        await m.query(
          `INSERT INTO svc_consumed_events(event_id,tenant_id,event_type) VALUES($1,$2,$3)`,
          [event.event_id, event.tenant_id, event.event_type],
        );
      });
  }
  private async consumeReferral(
    m: EntityManager,
    event: any,
    payload: Record<string, any>,
    envelope: Record<string, any>,
  ) {
    const module7CaseId =
      envelope.aggregate_id ??
      envelope.service_case_id ??
      payload.module7_case_id;
    const ret = (
      await m.query(
        `SELECT c.*,a.inventory_record_id,a.subject_id FROM ret_cases c JOIN ret_case_allocations a ON a.return_case_id=c.return_case_id JOIN inv_records r ON r.inventory_record_id=a.inventory_record_id WHERE c.return_case_id=$1 AND c.tenant_id=$2 AND c.disposition='REPAIR_REFERRAL' AND r.record_type='ITEM' LIMIT 1`,
        [module7CaseId, event.tenant_id],
      )
    )[0];
    if (!ret) return;
    const existing = await m.query(
      `SELECT 1 FROM svc_cases WHERE module7_case_id=$1`,
      [module7CaseId],
    );
    if (existing[0]) return;
    const id = randomUUID(),
      number = `SVC-R7-${new Date().getUTCFullYear()}-${id.slice(0, 8).toUpperCase()}`;
    await m.query(
      `INSERT INTO svc_cases(service_case_id,tenant_id,case_number,inventory_record_id,subject_id,case_type,title,problem_description,severity,reported_by,module7_case_id,root_service_case_id) VALUES($1,$2,$3,$4,$5,'MODULE7_REPAIR_REFERRAL',$6,$7,'HIGH',$8,$9,$1)`,
      [
        id,
        event.tenant_id,
        number,
        ret.inventory_record_id,
        ret.subject_id,
        `Module 7 repair referral ${ret.case_number}`,
        ret.reason,
        ret.initiator_id,
        module7CaseId,
      ],
    );
  }
  private async consumeReverification(
    m: EntityManager,
    event: any,
    payload: Record<string, any>,
  ) {
    const serviceCaseId = payload.service_case_id;
    if (!serviceCaseId) return;
    await m.query(
      `UPDATE svc_reverification_projections SET status=$2,module4_case_id=COALESCE($3::uuid,module4_case_id),verification_identity_id=COALESCE($4::uuid,verification_identity_id),source_event_id=$5,source_payload=$6::jsonb,updated_at=NOW() WHERE service_case_id=$1 AND status IN('REQUESTED','IN_PROGRESS')`,
      [
        serviceCaseId,
        event.event_type === 'PhysicalProductVerified.v1'
          ? 'CLEARED'
          : 'REJECTED',
        payload.verification_case_id ?? null,
        payload.verification_identity_id ?? null,
        event.event_id,
        JSON.stringify(payload),
      ],
    );
    await m.query(
      `UPDATE svc_cases SET workflow_status=CASE WHEN $2='CLEARED' THEN 'ACCEPTANCE_PENDING' ELSE 'DISPUTED' END,updated_at=NOW() WHERE service_case_id=$1 AND workflow_status='AWAITING_REVERIFICATION'`,
      [
        serviceCaseId,
        event.event_type === 'PhysicalProductVerified.v1'
          ? 'CLEARED'
          : 'REJECTED',
      ],
    );
  }
  private async consumeFinancial(
    m: EntityManager,
    event: any,
    payload: Record<string, any>,
  ) {
    const serviceCaseId =
      payload.module8_service_case_id ?? payload.external_reference;
    if (!serviceCaseId) return;
    await m.query(
      `INSERT INTO svc_financial_projections(tenant_id,service_case_id,source_event_id,source_module,projection_type,amount,currency,source_reference,source_revision,occurred_at) VALUES($1,$2,$3,'MODULE2',$4,$5,$6,$7::jsonb,$8,$9) ON CONFLICT(source_event_id) DO NOTHING`,
      [
        event.tenant_id,
        serviceCaseId,
        event.event_id,
        event.event_type,
        Number(payload.amount ?? payload.total_amount ?? 0),
        payload.currency ?? 'INR',
        JSON.stringify(payload),
        event.aggregate_sequence,
        event.occurred_at,
      ],
    );
  }
  private async consumePart(
    m: EntityManager,
    event: any,
    payload: Record<string, any>,
  ) {
    const serviceCaseId = payload.service_case_id;
    if (!serviceCaseId) return;
    await m.query(
      `UPDATE svc_parts_usage SET status=CASE WHEN $2='ConsumableIssued.v1' THEN 'ISSUED' ELSE 'CONSUMED' END WHERE service_case_id=$1 AND module6_request_id=$3`,
      [serviceCaseId, event.event_type, payload.stock_request_id],
    );
  }
}
