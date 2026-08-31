/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { retirementHash } from './asset-retirement.util';

@Injectable()
export class AssetRetirementEventConsumer {
  constructor(@InjectDataSource() private readonly db: DataSource) {}
  @Interval(15000) async consume() {
    const events = await this.db.query(
      `SELECT event_id,tenant_id,event_type,payload,payload_hash,occurred_at,aggregate_sequence
       FROM svc_outbox_events WHERE event_type IN('AssetRetirementReferralRequested.v1','AssetServiceIrreparable.v1') ORDER BY occurred_at LIMIT 100`,
    );
    for (const event of events)
      await this.db.transaction(async (manager) => {
        if (
          (
            await manager.query(
              `SELECT 1 FROM retirement_consumed_events WHERE event_id=$1 FOR UPDATE`,
              [event.event_id],
            )
          )[0]
        )
          return;
        if (retirementHash(event.payload) !== event.payload_hash)
          throw new Error(
            `Module 9 source event hash mismatch: ${event.event_id}`,
          );
        const envelope = event.payload as Record<string, any>,
          payload = (envelope.payload ?? envelope) as Record<string, any>;
        await this.consumeReferral(manager, event, payload, envelope);
        await manager.query(
          `INSERT INTO retirement_consumed_events(event_id,tenant_id,event_type) VALUES($1,$2,$3)`,
          [event.event_id, event.tenant_id, event.event_type],
        );
      });
  }
  private async consumeReferral(
    manager: EntityManager,
    event: any,
    payload: Record<string, any>,
    envelope: Record<string, any>,
  ) {
    const serviceCaseId = envelope.aggregate_id ?? envelope.service_case_id,
      inventoryRecordId = payload.inventory_record_id;
    if (!serviceCaseId || !inventoryRecordId) return;
    const service = (
      await manager.query(
        `SELECT c.*,r.owner_department_id,r.subject_id FROM svc_cases c JOIN inv_records r ON r.inventory_record_id=c.inventory_record_id
         WHERE c.service_case_id=$1 AND c.tenant_id=$2 AND c.inventory_record_id=$3 AND c.workflow_status='CLOSED' AND c.final_outcome IN('IRREPARABLE','UNSAFE')`,
        [serviceCaseId, event.tenant_id, inventoryRecordId],
      )
    )[0];
    if (!service) return;
    if (
      (
        await manager.query(
          `SELECT 1 FROM retirement_cases WHERE source_service_case_id=$1`,
          [serviceCaseId],
        )
      )[0]
    )
      return;
    const caseId = randomUUID(),
      number = `RET-M8-${new Date().getUTCFullYear()}-${caseId.slice(0, 8).toUpperCase()}`;
    await manager.query(
      `INSERT INTO retirement_cases(retirement_case_id,tenant_id,case_number,title,retirement_reason,requested_by,owner_department_id,source_service_case_id,root_retirement_case_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$1)`,
      [
        caseId,
        event.tenant_id,
        number,
        `Retirement referral ${service.case_number}`,
        payload.reason ?? `Module 8 outcome ${service.final_outcome}`,
        service.reported_by,
        service.owner_department_id,
        serviceCaseId,
      ],
    );
    const identity = (
      await manager.query(
        `SELECT COALESCE(MAX(identity_revision),0)::int revision FROM inv_identity_revisions WHERE inventory_record_id=$1`,
        [inventoryRecordId],
      )
    )[0];
    const record = (
      await manager.query(
        `SELECT aggregate_revision FROM inv_records WHERE inventory_record_id=$1`,
        [inventoryRecordId],
      )
    )[0];
    await manager.query(
      `INSERT INTO retirement_allocations(retirement_allocation_id,tenant_id,retirement_case_id,inventory_record_id,allocation_type,inventory_revision,identity_revision)
       VALUES($1,$2,$3,$4,'ASSET',$5,$6)`,
      [
        randomUUID(),
        event.tenant_id,
        caseId,
        inventoryRecordId,
        record.aggregate_revision,
        identity.revision || null,
      ],
    );
  }
}
