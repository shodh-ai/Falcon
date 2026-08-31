/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument -- SQL rows are intentionally dynamic */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { AcquisitionService } from '../acquisitions/acquisition.service';
import type { CreateAcquisitionInput } from '../acquisitions/acquisition.types';
import { InventoryService } from '../inventory/inventory.service';
import { inventoryHash } from '../inventory/inventory.util';
import type { InventoryActor } from '../inventory/inventory.types';

@Injectable()
export class ConsumablesService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly inventory: InventoryService,
    private readonly acquisitions: AcquisitionService,
  ) {}
  private tenant(actor: InventoryActor) {
    if (!actor.tenant_id)
      throw new ForbiddenException('Tenant context required');
    return actor.tenant_id;
  }
  private roles(actor: InventoryActor) {
    return [
      ...new Set([...(actor.roles ?? []), ...(actor.role ? [actor.role] : [])]),
    ].map((v) => v.toLowerCase());
  }
  private async grants(actor: InventoryActor, capability: string) {
    return this.db.query(
      `SELECT scope_type,scope_reference FROM acq_access_grants WHERE tenant_id=$1 AND capability=$2 AND valid_from<=NOW() AND(valid_until IS NULL OR valid_until>NOW()) AND(principal_user_id=$3::uuid OR lower(principal_role)=ANY($4::text[]))`,
      [this.tenant(actor), capability, actor.user_id, this.roles(actor)],
    );
  }
  private async require(actor: InventoryActor, capability: string) {
    if (!(await this.grants(actor, capability)).length)
      throw new ForbiddenException(`Missing ${capability}`);
  }
  private async requireScope(
    actor: InventoryActor,
    capability: string,
    scope: {
      department_id?: number | null;
      project_reference?: string | null;
      location_space_id?: string | null;
    },
  ) {
    const grants = await this.grants(actor, capability);
    const allowed = grants.some(
      (grant: any) =>
        grant.scope_type === 'TENANT' ||
        (grant.scope_type === 'DEPARTMENT' &&
          String(grant.scope_reference) === String(scope.department_id)) ||
        (grant.scope_type === 'PROJECT' &&
          grant.scope_reference === scope.project_reference) ||
        (grant.scope_type === 'LOCATION' &&
          grant.scope_reference === scope.location_space_id),
    );
    if (!allowed)
      throw new ForbiddenException(
        'Object is outside granted consumables scope',
      );
  }
  private revision(row: any, expected: number) {
    if (Number(row.aggregate_revision) !== expected)
      throw new ConflictException({
        message: 'Consumables record changed',
        code: 'STALE_REVISION',
        current_revision: Number(row.aggregate_revision),
      });
  }
  private async idempotent<T>(
    m: EntityManager,
    actor: InventoryActor,
    key: string,
    input: unknown,
    work: () => Promise<T>,
  ): Promise<T> {
    if (!key?.trim()) throw new BadRequestException('Idempotency-Key required');
    const tenant = this.tenant(actor),
      requestHash = inventoryHash(input);
    await m.query(`SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))`, [
      tenant,
      `${actor.user_id}:${key}`,
    ]);
    const prior = await m.query(
      `SELECT request_hash,response_payload FROM con_idempotency WHERE tenant_id=$1 AND actor_id=$2 AND idempotency_key=$3 FOR UPDATE`,
      [tenant, actor.user_id, key],
    );
    if (prior[0]) {
      if (prior[0].request_hash !== requestHash)
        throw new ConflictException(
          'Idempotency key reused with changed payload',
        );
      if (prior[0].response_payload) return prior[0].response_payload as T;
    } else
      await m.query(
        `INSERT INTO con_idempotency(tenant_id,actor_id,idempotency_key,request_hash) VALUES($1,$2,$3,$4)`,
        [tenant, actor.user_id, key, requestHash],
      );
    const result = await work();
    await m.query(
      `UPDATE con_idempotency SET response_payload=$4::jsonb WHERE tenant_id=$1 AND actor_id=$2 AND idempotency_key=$3`,
      [tenant, actor.user_id, key, JSON.stringify(result)],
    );
    return result;
  }
  private async emit(
    m: EntityManager,
    row: any,
    type: string,
    payload: Record<string, unknown>,
  ) {
    const id = randomUUID(),
      revision = Number(row.aggregate_revision) + 1,
      sequence = Number(row.next_event_sequence ?? 1),
      occurred = new Date().toISOString();
    const envelope = {
      event_id: id,
      event_type: type,
      event_version: 1,
      aggregate_id:
        row.issue_id ??
        row.stock_request_id ??
        row.count_session_id ??
        row.alert_id ??
        row.suggestion_id,
      aggregate_revision: revision,
      aggregate_sequence: sequence,
      tenant_id: row.tenant_id,
      occurred_at: occurred,
      ...payload,
    };
    await m.query(
      `INSERT INTO con_outbox_events(event_id,tenant_id,aggregate_id,aggregate_revision,aggregate_sequence,event_type,occurred_at,payload,payload_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
      [
        id,
        row.tenant_id,
        envelope.aggregate_id,
        revision,
        sequence,
        type,
        occurred,
        JSON.stringify(envelope),
        inventoryHash(envelope),
      ],
    );
    if (row.issue_id)
      await m.query(
        `UPDATE con_issues SET aggregate_revision=$2,next_event_sequence=$3 WHERE issue_id=$1`,
        [row.issue_id, revision, sequence + 1],
      );
    else if (row.stock_request_id)
      await m.query(
        `UPDATE con_stock_requests SET aggregate_revision=$2,next_event_sequence=$3,updated_at=NOW() WHERE stock_request_id=$1`,
        [row.stock_request_id, revision, sequence + 1],
      );
    else if (row.count_session_id)
      await m.query(
        `UPDATE con_count_sessions SET aggregate_revision=$2,next_event_sequence=$3 WHERE count_session_id=$1`,
        [row.count_session_id, revision, sequence + 1],
      );
    else if (row.alert_id)
      await m.query(
        `UPDATE con_alerts SET aggregate_revision=$2,next_event_sequence=$3 WHERE alert_id=$1`,
        [row.alert_id, revision, sequence + 1],
      );
    else if (row.suggestion_id)
      await m.query(
        `UPDATE con_replenishment_suggestions SET aggregate_revision=$2,next_event_sequence=$3 WHERE suggestion_id=$1`,
        [row.suggestion_id, revision, sequence + 1],
      );
    row.aggregate_revision = revision;
    row.next_event_sequence = sequence + 1;
    return envelope;
  }
  private async audit(
    m: EntityManager,
    row: any,
    entityType: string,
    entityId: string,
    eventType: string,
    actorId: string | null,
    oldValue: unknown,
    newValue: unknown,
  ) {
    const aggregate =
      row.issue_id ?? row.stock_request_id ?? row.count_session_id ?? entityId;
    const last = await m.query(
      `SELECT event_hash FROM con_audit_events WHERE aggregate_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [aggregate],
    );
    const hash = inventoryHash({
      aggregate,
      entityType,
      entityId,
      eventType,
      actorId,
      oldValue,
      newValue,
      previous: last[0]?.event_hash ?? null,
    });
    await m.query(
      `INSERT INTO con_audit_events(tenant_id,aggregate_id,entity_type,entity_id,event_type,actor_id,previous_value,new_value,previous_hash,event_hash) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10)`,
      [
        row.tenant_id,
        aggregate,
        entityType,
        entityId,
        eventType,
        actorId,
        oldValue ? JSON.stringify(oldValue) : null,
        newValue ? JSON.stringify(newValue) : null,
        last[0]?.event_hash ?? null,
        hash,
      ],
    );
  }
  private async policy(
    m: EntityManager,
    tenant: string,
    product: string,
    department?: number,
    location?: string,
  ) {
    const rows = await m.query(
      `SELECT p.* FROM con_stock_policies p JOIN inv_product_models pm ON pm.product_model_id=$2 WHERE p.tenant_id=$1 AND p.status='PUBLISHED' AND p.effective_from<=NOW() AND(p.effective_to IS NULL OR p.effective_to>NOW()) AND(p.product_model_id IS NULL OR p.product_model_id=$2) AND(p.category IS NULL OR p.category=pm.category) AND(p.department_id IS NULL OR p.department_id=$3) AND(p.location_space_id IS NULL OR p.location_space_id=$4) ORDER BY (p.product_model_id IS NOT NULL)::int+(p.category IS NOT NULL)::int+(p.department_id IS NOT NULL)::int+(p.location_space_id IS NOT NULL)::int DESC,p.policy_version DESC LIMIT 1`,
      [tenant, product, department ?? null, location ?? null],
    );
    if (!rows[0])
      throw new ConflictException('Published stock policy required');
    return rows[0];
  }

  async dashboard(actor: InventoryActor) {
    await this.require(actor, 'CONSUMABLES_VIEW');
    const t = this.tenant(actor);
    const principals = [t, actor.user_id, this.roles(actor)];
    const [stock, requests, alerts, custody] = await Promise.all([
      this.db.query(
        `SELECT COUNT(*)::int lots,COALESCE(SUM(balance),0) store_on_hand FROM(SELECT r.inventory_record_id,COALESCE(SUM(m.signed_quantity),0) balance FROM inv_records r LEFT JOIN inv_lot_movements m ON m.inventory_record_id=r.inventory_record_id WHERE r.tenant_id=$1 AND r.record_type='LOT' AND EXISTS(SELECT 1 FROM acq_access_grants g WHERE g.tenant_id=r.tenant_id AND g.capability='CONSUMABLES_VIEW' AND(g.principal_user_id=$2 OR lower(g.principal_role)=ANY($3::text[])) AND(g.scope_type='TENANT' OR(g.scope_type='DEPARTMENT' AND g.scope_reference=r.owner_department_id::text) OR(g.scope_type='LOCATION' AND g.scope_reference=r.location_space_id::text))) GROUP BY r.inventory_record_id)x`,
        principals,
      ),
      this.db.query(
        `SELECT COUNT(*) FILTER(WHERE q.status='SUBMITTED')::int submitted,COUNT(*) FILTER(WHERE q.status IN('APPROVED','PARTIALLY_ISSUED'))::int active FROM con_stock_requests q WHERE q.tenant_id=$1 AND EXISTS(SELECT 1 FROM acq_access_grants g WHERE g.tenant_id=q.tenant_id AND g.capability='CONSUMABLES_VIEW' AND(g.principal_user_id=$2 OR lower(g.principal_role)=ANY($3::text[])) AND(g.scope_type='TENANT' OR(g.scope_type='DEPARTMENT' AND g.scope_reference=q.department_id::text) OR(g.scope_type='PROJECT' AND g.scope_reference=q.project_reference) OR(g.scope_type='LOCATION' AND g.scope_reference=q.delivery_location_id::text)))`,
        principals,
      ),
      this.db.query(
        `SELECT COUNT(*)::int open FROM con_alerts a WHERE a.tenant_id=$1 AND a.status IN('OPEN','ACKNOWLEDGED') AND EXISTS(SELECT 1 FROM acq_access_grants g WHERE g.tenant_id=a.tenant_id AND g.capability='CONSUMABLES_VIEW' AND(g.principal_user_id=$2 OR lower(g.principal_role)=ANY($3::text[])) AND(g.scope_type='TENANT' OR(g.scope_type='LOCATION' AND g.scope_reference=a.location_space_id::text)))`,
        principals,
      ),
      this.db.query(
        `SELECT COALESCE(SUM(ia.issued_quantity-ia.consumed_quantity-ia.returned_quantity),0) outstanding FROM con_issue_allocations ia JOIN con_issues i ON i.issue_id=ia.issue_id WHERE ia.tenant_id=$1 AND EXISTS(SELECT 1 FROM acq_access_grants g WHERE g.tenant_id=i.tenant_id AND g.capability='CONSUMABLES_VIEW' AND(g.principal_user_id=$2 OR lower(g.principal_role)=ANY($3::text[])) AND(g.scope_type='TENANT' OR(g.scope_type='DEPARTMENT' AND g.scope_reference=i.department_id::text)))`,
        principals,
      ),
    ]);
    return {
      ...stock[0],
      ...requests[0],
      open_alerts: alerts[0].open,
      issued_custody_outstanding: custody[0].outstanding,
    };
  }
  async balances(actor: InventoryActor) {
    await this.require(actor, 'CONSUMABLES_VIEW');
    return this.db.query(
      `SELECT r.inventory_record_id,r.lot_id,r.record_status,pm.product_model_id,pm.product_name,pm.category,b.unit_of_measure,s.batch_number,s.expiry_date,r.location_text,COALESCE(SUM(m.signed_quantity),0) store_on_hand,COALESCE((SELECT SUM(a.allocated_quantity-a.issued_quantity) FROM con_reservation_allocations a JOIN con_reservations z ON z.reservation_id=a.reservation_id WHERE a.inventory_record_id=r.inventory_record_id AND a.status IN('ACTIVE','PARTIALLY_CONSUMED') AND z.expires_at>NOW()),0) reserved,COALESCE(e.status,CASE WHEN s.expiry_date<CURRENT_DATE THEN 'EXPIRED' ELSE 'AVAILABLE' END) eligibility FROM inv_records r JOIN inv_product_models pm ON pm.product_model_id=r.product_model_id JOIN inv_procurement_batches b ON b.procurement_batch_id=r.procurement_batch_id JOIN pv_subjects s ON s.subject_id=r.subject_id LEFT JOIN inv_lot_movements m ON m.inventory_record_id=r.inventory_record_id LEFT JOIN con_lot_eligibility e ON e.inventory_record_id=r.inventory_record_id WHERE r.tenant_id=$1 AND r.record_type='LOT' AND EXISTS(SELECT 1 FROM acq_access_grants g WHERE g.tenant_id=r.tenant_id AND g.capability='CONSUMABLES_VIEW' AND g.valid_from<=NOW() AND(g.valid_until IS NULL OR g.valid_until>NOW()) AND(g.principal_user_id=$2 OR lower(g.principal_role)=ANY($3::text[])) AND(g.scope_type='TENANT' OR(g.scope_type='DEPARTMENT' AND g.scope_reference=r.owner_department_id::text) OR(g.scope_type='LOCATION' AND g.scope_reference=r.location_space_id::text))) GROUP BY r.inventory_record_id,pm.product_model_id,pm.product_name,pm.category,b.unit_of_measure,s.batch_number,s.expiry_date,e.status ORDER BY s.expiry_date NULLS LAST,r.created_at`,
      [this.tenant(actor), actor.user_id, this.roles(actor)],
    );
  }
  async queue(actor: InventoryActor) {
    await this.require(actor, 'CONSUMABLES_VIEW');
    return this.db.query(
      `SELECT q.*,COALESCE(json_agg(l ORDER BY l.created_at) FILTER(WHERE l.request_line_id IS NOT NULL),'[]') lines FROM con_stock_requests q LEFT JOIN con_stock_request_lines l ON l.stock_request_id=q.stock_request_id WHERE q.tenant_id=$1 AND EXISTS(SELECT 1 FROM acq_access_grants g WHERE g.tenant_id=q.tenant_id AND g.capability='CONSUMABLES_VIEW' AND g.valid_from<=NOW() AND(g.valid_until IS NULL OR g.valid_until>NOW()) AND(g.principal_user_id=$2 OR lower(g.principal_role)=ANY($3::text[])) AND(g.scope_type='TENANT' OR(g.scope_type='DEPARTMENT' AND g.scope_reference=q.department_id::text) OR(g.scope_type='PROJECT' AND g.scope_reference=q.project_reference) OR(g.scope_type='LOCATION' AND g.scope_reference=q.delivery_location_id::text))) GROUP BY q.stock_request_id ORDER BY q.created_at DESC LIMIT 200`,
      [this.tenant(actor), actor.user_id, this.roles(actor)],
    );
  }
  async create(
    actor: InventoryActor,
    key: string,
    input: {
      department_id: number;
      project_reference?: string;
      delivery_location_id?: string;
      intended_use: string;
      required_by_date?: string;
      priority?: string;
      justification?: string;
      lines: Array<{
        product_model_id: string;
        quantity: number;
        unit_of_measure: string;
      }>;
    },
  ) {
    await this.require(actor, 'CONSUMABLES_REQUEST');
    await this.requireScope(actor, 'CONSUMABLES_REQUEST', {
      department_id: input.department_id,
      project_reference: input.project_reference,
      location_space_id: input.delivery_location_id,
    });
    if (!input.intended_use?.trim() || !input.lines?.length)
      throw new BadRequestException('Intended use and lines required');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const id = randomUUID(),
          number = `CSR-${new Date().getUTCFullYear()}-${id.slice(0, 8).toUpperCase()}`;
        const rows = await m.query(
          `INSERT INTO con_stock_requests(stock_request_id,tenant_id,request_number,requester_id,department_id,project_reference,delivery_location_id,intended_use,required_by_date,priority,justification) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [
            id,
            this.tenant(actor),
            number,
            actor.user_id,
            input.department_id,
            input.project_reference ?? null,
            input.delivery_location_id ?? null,
            input.intended_use.trim(),
            input.required_by_date ?? null,
            input.priority ?? 'NORMAL',
            input.justification ?? null,
          ],
        );
        for (const line of input.lines) {
          if (!(line.quantity > 0))
            throw new BadRequestException(
              'Positive exact-unit quantity required',
            );
          const model = await m.query(
            `SELECT 1 FROM inv_product_models WHERE product_model_id=$1 AND tenant_id=$2`,
            [line.product_model_id, this.tenant(actor)],
          );
          if (!model[0]) throw new NotFoundException('Product model not found');
          await m.query(
            `INSERT INTO con_stock_request_lines(stock_request_id,tenant_id,product_model_id,requested_quantity,unit_of_measure) VALUES($1,$2,$3,$4,$5)`,
            [
              id,
              this.tenant(actor),
              line.product_model_id,
              line.quantity,
              line.unit_of_measure,
            ],
          );
        }
        await this.audit(
          m,
          rows[0],
          'REQUEST',
          id,
          'DRAFT_CREATED',
          actor.user_id,
          null,
          input,
        );
        return rows[0];
      }),
    );
  }
  async submit(
    actor: InventoryActor,
    id: string,
    revision: number,
    key: string,
  ) {
    await this.require(actor, 'CONSUMABLES_REQUEST');
    return this.db.transaction(async (m) => {
      const rows = await m.query(
          `SELECT * FROM con_stock_requests WHERE stock_request_id=$1 AND tenant_id=$2 FOR UPDATE`,
          [id, this.tenant(actor)],
        ),
        row = rows[0];
      if (!row) throw new NotFoundException('Request not found');
      await this.requireScope(actor, 'CONSUMABLES_REQUEST', {
        department_id: row.department_id,
        project_reference: row.project_reference,
        location_space_id: row.delivery_location_id,
      });
      this.revision(row, revision);
      if (row.requester_id !== actor.user_id || row.status !== 'DRAFT')
        throw new ForbiddenException('Only requester can submit draft');
      return this.idempotent(m, actor, key, { id, revision }, async () => {
        await m.query(
          `UPDATE con_stock_requests SET status='SUBMITTED',submitted_at=NOW() WHERE stock_request_id=$1`,
          [id],
        );
        await this.audit(
          m,
          row,
          'REQUEST',
          id,
          'REQUEST_SUBMITTED',
          actor.user_id,
          { status: 'DRAFT' },
          { status: 'SUBMITTED' },
        );
        const event = await this.emit(
          m,
          row,
          'ConsumableStockRequestSubmitted.v1',
          { stock_request_id: id },
        );
        return {
          status: 'SUBMITTED',
          aggregate_revision: row.aggregate_revision,
          event,
        };
      });
    });
  }
  async approve(
    actor: InventoryActor,
    id: string,
    revision: number,
    key: string,
    input: {
      approved_quantities?: Record<string, number>;
      override_lots?: Record<string, string>;
      override_reason?: string;
    },
  ) {
    await this.require(actor, 'CONSUMABLES_APPROVE');
    return this.db.transaction(async (m) => {
      const rows = await m.query(
          `SELECT * FROM con_stock_requests WHERE stock_request_id=$1 AND tenant_id=$2 FOR UPDATE`,
          [id, this.tenant(actor)],
        ),
        row = rows[0];
      if (!row) throw new NotFoundException('Request not found');
      await this.requireScope(actor, 'CONSUMABLES_APPROVE', {
        department_id: row.department_id,
        project_reference: row.project_reference,
        location_space_id: row.delivery_location_id,
      });
      this.revision(row, revision);
      if (row.status !== 'SUBMITTED')
        throw new ConflictException('Submitted request required');
      if (row.requester_id === actor.user_id)
        throw new ForbiddenException('Requester cannot approve');
      return this.idempotent(m, actor, key, input, async () => {
        const lines = await m.query(
          `SELECT * FROM con_stock_request_lines WHERE stock_request_id=$1 ORDER BY created_at FOR UPDATE`,
          [id],
        );
        for (const line of lines) {
          const qty =
            input.approved_quantities?.[line.request_line_id] ??
            Number(line.requested_quantity);
          if (!(qty > 0) || qty > Number(line.requested_quantity))
            throw new BadRequestException('Invalid approved quantity');
          const p = await this.policy(
            m,
            row.tenant_id,
            line.product_model_id,
            row.department_id,
            row.delivery_location_id,
          );
          const lots = await m.query(
            `SELECT r.inventory_record_id,s.expiry_date,r.created_at,
                    COALESCE((SELECT SUM(lm.signed_quantity) FROM inv_lot_movements lm WHERE lm.inventory_record_id=r.inventory_record_id),0) balance,
                    COALESCE((SELECT SUM(a.allocated_quantity-a.issued_quantity) FROM con_reservation_allocations a JOIN con_reservations z ON z.reservation_id=a.reservation_id WHERE a.inventory_record_id=r.inventory_record_id AND a.status IN('ACTIVE','PARTIALLY_CONSUMED') AND z.expires_at>NOW()),0) reserved
                    ,COALESCE((SELECT SUM(h.quantity) FROM ret_case_allocations h WHERE h.inventory_record_id=r.inventory_record_id AND h.status='HELD'),0) return_held
               FROM inv_records r JOIN pv_subjects s ON s.subject_id=r.subject_id
              WHERE r.tenant_id=$1 AND r.product_model_id=$2 AND r.record_type='LOT' AND r.record_status='ACTIVE'
                AND(s.expiry_date IS NULL OR s.expiry_date>=CURRENT_DATE)
                AND NOT EXISTS(SELECT 1 FROM con_lot_eligibility e WHERE e.inventory_record_id=r.inventory_record_id AND e.status IN('EXPIRED','QUARANTINED','DEPLETED'))
              ORDER BY s.expiry_date NULLS LAST,r.created_at,r.inventory_record_id FOR UPDATE OF r`,
            [row.tenant_id, line.product_model_id],
          );
          let remaining = qty;
          const selected = input.override_lots?.[line.request_line_id];
          if (selected) {
            if (!input.override_reason?.trim())
              throw new BadRequestException('LOT override reason required');
            lots.sort((a: any, b: any) =>
              a.inventory_record_id === selected
                ? -1
                : b.inventory_record_id === selected
                  ? 1
                  : 0,
            );
          }
          const rid = randomUUID();
          await m.query(
            `INSERT INTO con_reservations(reservation_id,stock_request_id,request_line_id,tenant_id,reserved_quantity,policy_id,expires_at,created_by) VALUES($1,$2,$3,$4,$5,$6,NOW()+($7||' hours')::interval,$8)`,
            [
              rid,
              id,
              line.request_line_id,
              row.tenant_id,
              qty,
              p.stock_policy_id,
              p.reservation_hours,
              actor.user_id,
            ],
          );
          let order = 0;
          for (const lot of lots) {
            const available =
              Number(lot.balance) -
              Number(lot.reserved) -
              Number(lot.return_held);
            if (available <= 0) continue;
            const allocate = Math.min(available, remaining);
            await m.query(
              `INSERT INTO con_reservation_allocations(reservation_id,tenant_id,inventory_record_id,allocated_quantity,allocation_order,override_reason) VALUES($1,$2,$3,$4,$5,$6)`,
              [
                rid,
                row.tenant_id,
                lot.inventory_record_id,
                allocate,
                ++order,
                selected ? input.override_reason : null,
              ],
            );
            remaining -= allocate;
            if (remaining <= 0.0005) break;
          }
          if (remaining > 0.0005)
            throw new ConflictException({
              message: 'Insufficient eligible unreserved stock',
              code: 'INSUFFICIENT_CONSUMABLE_STOCK',
              shortfall: remaining,
            });
          await m.query(
            `UPDATE con_stock_request_lines SET approved_quantity=$2,policy_id=$3,status='APPROVED' WHERE request_line_id=$1`,
            [line.request_line_id, qty, p.stock_policy_id],
          );
        }
        await m.query(
          `UPDATE con_stock_requests SET status='APPROVED',approved_by=$2,approved_at=NOW() WHERE stock_request_id=$1`,
          [id, actor.user_id],
        );
        const event = await this.emit(m, row, 'ConsumableStockReserved.v1', {
          stock_request_id: id,
        });
        return {
          status: 'APPROVED',
          aggregate_revision: row.aggregate_revision,
          event,
        };
      });
    });
  }

  async issue(
    actor: InventoryActor,
    id: string,
    revision: number,
    key: string,
    input: {
      reservation_id: string;
      quantity: number;
      recipient_id: string;
      reason_code: string;
      reason: string;
    },
  ) {
    await this.require(actor, 'CONSUMABLES_ISSUE');
    if (!(input.quantity > 0) || !input.reason?.trim())
      throw new BadRequestException('Positive quantity and reason required');
    return this.db.transaction(async (m) => {
      const rows = await m.query(
          `SELECT * FROM con_stock_requests WHERE stock_request_id=$1 AND tenant_id=$2 FOR UPDATE`,
          [id, this.tenant(actor)],
        ),
        row = rows[0];
      if (!row) throw new NotFoundException('Request not found');
      await this.requireScope(actor, 'CONSUMABLES_ISSUE', {
        department_id: row.department_id,
        project_reference: row.project_reference,
        location_space_id: row.delivery_location_id,
      });
      this.revision(row, revision);
      return this.idempotent(m, actor, key, input, async () => {
        const reservations = await m.query(
            `SELECT z.*,l.unit_of_measure FROM con_reservations z JOIN con_stock_request_lines l ON l.request_line_id=z.request_line_id WHERE z.reservation_id=$1 AND z.stock_request_id=$2 AND z.status IN('ACTIVE','PARTIALLY_CONSUMED') AND z.expires_at>NOW() FOR UPDATE OF z`,
            [input.reservation_id, id],
          ),
          res = reservations[0];
        if (!res) throw new ConflictException('Active reservation required');
        const remaining =
          Number(res.reserved_quantity) - Number(res.issued_quantity);
        if (input.quantity > remaining + 0.0005)
          throw new ConflictException('Issue exceeds reservation');
        const issueId = randomUUID();
        await m.query(
          `INSERT INTO con_issues(issue_id,tenant_id,stock_request_id,reservation_id,recipient_id,department_id,reason_code,reason,issued_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            issueId,
            row.tenant_id,
            id,
            res.reservation_id,
            input.recipient_id,
            row.department_id,
            input.reason_code,
            input.reason,
            actor.user_id,
          ],
        );
        let needed = input.quantity;
        const allocations = await m.query(
          `SELECT * FROM con_reservation_allocations WHERE reservation_id=$1 AND status IN('ACTIVE','PARTIALLY_CONSUMED') ORDER BY allocation_order FOR UPDATE`,
          [res.reservation_id],
        );
        for (const a of allocations) {
          const available =
            Number(a.allocated_quantity) - Number(a.issued_quantity);
          if (available <= 0) continue;
          const qty = Math.min(available, needed);
          const movement = await this.inventory.postConsumableMovement(m, {
            tenant_id: row.tenant_id,
            inventory_record_id: a.inventory_record_id,
            movement_type: 'ISSUE',
            quantity: qty,
            source_type: 'STOCK_REQUEST',
            source_id: id,
            reason_code: input.reason_code,
            reason: input.reason,
            actor_id: actor.user_id,
            department_id: row.department_id,
            project_reference: row.project_reference,
            location_space_id: row.delivery_location_id,
            idempotency_key: `${key}:${a.allocation_id}`,
          });
          const ia = randomUUID();
          await m.query(
            `INSERT INTO con_issue_allocations(issue_allocation_id,issue_id,allocation_id,inventory_record_id,tenant_id,issued_quantity,unit_of_measure) VALUES($1,$2,$3,$4,$5,$6,$7)`,
            [
              ia,
              issueId,
              a.allocation_id,
              a.inventory_record_id,
              row.tenant_id,
              qty,
              res.unit_of_measure,
            ],
          );
          await m.query(
            `INSERT INTO con_custody_events(tenant_id,issue_id,issue_allocation_id,event_type,quantity,actor_id,reason,source_movement_id,idempotency_key) VALUES($1,$2,$3,'ISSUED',$4,$5,$6,$7,$8)`,
            [
              row.tenant_id,
              issueId,
              ia,
              qty,
              actor.user_id,
              input.reason,
              movement.lot_movement_id,
              `${key}:custody:${a.allocation_id}`,
            ],
          );
          const next = Number(a.issued_quantity) + qty;
          await m.query(
            `UPDATE con_reservation_allocations SET issued_quantity=$2,status=CASE WHEN $2>=allocated_quantity THEN 'FULFILLED' ELSE 'PARTIALLY_CONSUMED' END WHERE allocation_id=$1`,
            [a.allocation_id, next],
          );
          needed -= qty;
          if (needed <= 0.0005) break;
        }
        const total = Number(res.issued_quantity) + input.quantity,
          status =
            total >= Number(res.reserved_quantity) - 0.0005
              ? 'FULFILLED'
              : 'PARTIALLY_CONSUMED';
        await m.query(
          `UPDATE con_reservations SET issued_quantity=$2,status=$3,updated_at=NOW() WHERE reservation_id=$1`,
          [res.reservation_id, total, status],
        );
        const all = await m.query(
          `SELECT BOOL_AND(status='FULFILLED') done,BOOL_OR(issued_quantity>0) partial FROM con_reservations WHERE stock_request_id=$1`,
          [id],
        );
        const requestStatus = all[0].done
          ? 'ISSUED'
          : all[0].partial
            ? 'PARTIALLY_ISSUED'
            : 'APPROVED';
        await m.query(
          `UPDATE con_stock_requests SET status=$2 WHERE stock_request_id=$1`,
          [id, requestStatus],
        );
        const event = await this.emit(m, row, 'ConsumableIssued.v1', {
          stock_request_id: id,
          issue_id: issueId,
          quantity: input.quantity,
          recipient_id: input.recipient_id,
        });
        return {
          issue_id: issueId,
          status: 'ISSUED',
          request_status: requestStatus,
          aggregate_revision: row.aggregate_revision,
          event,
        };
      });
    });
  }
  async custody(
    actor: InventoryActor,
    issueId: string,
    key: string,
    input: {
      issue_allocation_id: string;
      action: 'CONSUME' | 'RETURN';
      quantity: number;
      reason: string;
    },
  ) {
    await this.require(actor, 'CONSUMABLES_CONSUMPTION_RECORD');
    if (!(input.quantity > 0) || !input.reason?.trim())
      throw new BadRequestException('Positive quantity and reason required');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const rows = await m.query(
            `SELECT i.*,a.* FROM con_issues i JOIN con_issue_allocations a ON a.issue_id=i.issue_id WHERE i.issue_id=$1 AND a.issue_allocation_id=$2 AND i.tenant_id=$3 FOR UPDATE OF i,a`,
            [issueId, input.issue_allocation_id, this.tenant(actor)],
          ),
          row = rows[0];
        if (!row) throw new NotFoundException('Issue allocation not found');
        await this.requireScope(actor, 'CONSUMABLES_CONSUMPTION_RECORD', {
          department_id: row.department_id,
        });
        const outstanding =
          Number(row.issued_quantity) -
          Number(row.consumed_quantity) -
          Number(row.returned_quantity);
        if (input.quantity > outstanding + 0.0005)
          throw new ConflictException(
            'Action exceeds issued custody outstanding',
          );
        let movementId: null | string = null;
        if (input.action === 'RETURN') {
          const movement = await this.inventory.postConsumableMovement(m, {
            tenant_id: row.tenant_id,
            inventory_record_id: row.inventory_record_id,
            movement_type: 'ISSUE_RETURN',
            quantity: input.quantity,
            source_type: 'ISSUE_RETURN',
            source_id: issueId,
            reason_code: 'UNUSED_STOCK_RETURN',
            reason: input.reason,
            actor_id: actor.user_id,
            department_id: row.department_id,
            idempotency_key: `${key}:movement`,
          });
          movementId = movement.lot_movement_id;
        }
        await m.query(
          `INSERT INTO con_custody_events(tenant_id,issue_id,issue_allocation_id,event_type,quantity,actor_id,reason,source_movement_id,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            row.tenant_id,
            issueId,
            input.issue_allocation_id,
            input.action === 'RETURN' ? 'ISSUE_RETURNED' : 'CONSUMED',
            input.quantity,
            actor.user_id,
            input.reason,
            movementId,
            key,
          ],
        );
        await m.query(
          `UPDATE con_issue_allocations SET consumed_quantity=consumed_quantity+$2,returned_quantity=returned_quantity+$3 WHERE issue_allocation_id=$1`,
          [
            input.issue_allocation_id,
            input.action === 'CONSUME' ? input.quantity : 0,
            input.action === 'RETURN' ? input.quantity : 0,
          ],
        );
        const totals = await m.query(
          `SELECT SUM(issued_quantity-consumed_quantity-returned_quantity) outstanding FROM con_issue_allocations WHERE issue_id=$1`,
          [issueId],
        );
        const resolved = Number(totals[0].outstanding) <= 0.0005;
        await m.query(`UPDATE con_issues SET status=$2 WHERE issue_id=$1`, [
          issueId,
          resolved ? 'RESOLVED' : 'PARTIALLY_RESOLVED',
        ]);
        const eventType =
          input.action === 'RETURN'
            ? 'ConsumableIssueReturned.v1'
            : 'ConsumableConsumptionRecorded.v1';
        const envelope = await this.emit(m, row, eventType, {
          issue_id: issueId,
          quantity: input.quantity,
        });
        return {
          issue_id: issueId,
          status: resolved ? 'RESOLVED' : 'PARTIALLY_RESOLVED',
          outstanding: Number(totals[0].outstanding),
          event: envelope,
        };
      }),
    );
  }

  async acknowledge(actor: InventoryActor, issueId: string, key: string) {
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, { issueId }, async () => {
        const rows = await m.query(
            `SELECT * FROM con_issues WHERE issue_id=$1 AND tenant_id=$2 FOR UPDATE`,
            [issueId, this.tenant(actor)],
          ),
          row = rows[0];
        if (!row) throw new NotFoundException('Issue not found');
        if (row.recipient_id !== actor.user_id)
          throw new ForbiddenException('Only recipient may acknowledge');
        await m.query(
          `UPDATE con_issues SET acknowledged_at=NOW(),acknowledged_by=$2 WHERE issue_id=$1`,
          [issueId, actor.user_id],
        );
        return { issue_id: issueId, acknowledged: true };
      }),
    );
  }
  async expireReservations() {
    return this.db.transaction(async (m) => {
      const rows = await m.query(
        `SELECT * FROM con_reservations WHERE status IN('ACTIVE','PARTIALLY_CONSUMED') AND expires_at<=NOW() ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED`,
      );
      for (const r of rows) {
        await m.query(
          `UPDATE con_reservations SET status='EXPIRED',released_at=NOW(),release_reason='Automatic 48-hour expiry',updated_at=NOW() WHERE reservation_id=$1`,
          [r.reservation_id],
        );
        await m.query(
          `UPDATE con_reservation_allocations SET status='EXPIRED' WHERE reservation_id=$1 AND status IN('ACTIVE','PARTIALLY_CONSUMED')`,
          [r.reservation_id],
        );
        await m.query(
          `UPDATE con_stock_requests SET status=CASE WHEN status='APPROVED' THEN 'EXPIRED' ELSE status END,updated_at=NOW() WHERE stock_request_id=$1`,
          [r.stock_request_id],
        );
        const requestRows = await m.query(
          `SELECT * FROM con_stock_requests WHERE stock_request_id=$1 FOR UPDATE`,
          [r.stock_request_id],
        );
        if (requestRows[0])
          await this.emit(
            m,
            requestRows[0],
            'ConsumableReservationReleased.v1',
            {
              stock_request_id: r.stock_request_id,
              reservation_id: r.reservation_id,
              reason: 'EXPIRED',
            },
          );
      }
      return { expired: rows.length };
    });
  }

  async emergencyIssue(
    actor: InventoryActor,
    key: string,
    input: {
      inventory_record_id: string;
      quantity: number;
      recipient_id: string;
      department_id: number;
      reason_code: string;
      reason: string;
    },
  ) {
    await this.require(actor, 'CONSUMABLES_EMERGENCY_ISSUE');
    if (
      !(input.quantity > 0) ||
      !input.reason?.trim() ||
      !input.reason_code?.trim()
    )
      throw new BadRequestException(
        'Positive quantity and structured reason required',
      );
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const eligible = await m.query(
          `SELECT r.product_model_id,COALESCE((SELECT SUM(l.signed_quantity) FROM inv_lot_movements l WHERE l.inventory_record_id=r.inventory_record_id),0) balance,COALESCE(e.status,CASE WHEN s.expiry_date<CURRENT_DATE THEN 'EXPIRED' ELSE 'AVAILABLE' END) eligibility FROM inv_records r JOIN pv_subjects s ON s.subject_id=r.subject_id LEFT JOIN con_lot_eligibility e ON e.inventory_record_id=r.inventory_record_id WHERE r.inventory_record_id=$1 AND r.tenant_id=$2 AND r.record_type='LOT' AND r.record_status='ACTIVE' FOR UPDATE OF r`,
          [input.inventory_record_id, this.tenant(actor)],
        );
        if (
          !eligible[0] ||
          !['AVAILABLE', 'EXPIRING_SOON'].includes(eligible[0].eligibility) ||
          Number(eligible[0].balance) < input.quantity
        )
          throw new ConflictException('Eligible store stock is insufficient');
        const p = await this.policy(
          m,
          this.tenant(actor),
          (
            await m.query(
              `SELECT product_model_id FROM inv_records WHERE inventory_record_id=$1 AND tenant_id=$2`,
              [input.inventory_record_id, this.tenant(actor)],
            )
          )[0]?.product_model_id,
          input.department_id,
        );
        if (!p.emergency_issue_allowed)
          throw new ForbiddenException('Emergency issue prohibited by policy');
        const issueId = randomUUID();
        await m.query(
          `INSERT INTO con_issues(issue_id,tenant_id,recipient_id,department_id,emergency,reason_code,reason,issued_by,review_due_at) VALUES($1,$2,$3,$4,true,$5,$6,$7,NOW()+INTERVAL '24 hours')`,
          [
            issueId,
            this.tenant(actor),
            input.recipient_id,
            input.department_id,
            input.reason_code,
            input.reason,
            actor.user_id,
          ],
        );
        const movement = await this.inventory.postConsumableMovement(m, {
          tenant_id: this.tenant(actor),
          inventory_record_id: input.inventory_record_id,
          movement_type: 'ISSUE',
          quantity: input.quantity,
          source_type: 'EMERGENCY_REQUEST',
          source_id: issueId,
          reason_code: input.reason_code,
          reason: input.reason,
          actor_id: actor.user_id,
          department_id: input.department_id,
          idempotency_key: `${key}:movement`,
        });
        const unit = (
            await m.query(
              `SELECT b.unit_of_measure FROM inv_records r JOIN inv_procurement_batches b ON b.procurement_batch_id=r.procurement_batch_id WHERE r.inventory_record_id=$1`,
              [input.inventory_record_id],
            )
          )[0].unit_of_measure,
          allocationId = randomUUID();
        await m.query(
          `INSERT INTO con_issue_allocations(issue_allocation_id,issue_id,inventory_record_id,tenant_id,issued_quantity,unit_of_measure) VALUES($1,$2,$3,$4,$5,$6)`,
          [
            allocationId,
            issueId,
            input.inventory_record_id,
            this.tenant(actor),
            input.quantity,
            unit,
          ],
        );
        await m.query(
          `INSERT INTO con_custody_events(tenant_id,issue_id,issue_allocation_id,event_type,quantity,actor_id,reason,source_movement_id,idempotency_key) VALUES($1,$2,$3,'ISSUED',$4,$5,$6,$7,$8)`,
          [
            this.tenant(actor),
            issueId,
            allocationId,
            input.quantity,
            actor.user_id,
            input.reason,
            movement.lot_movement_id,
            key,
          ],
        );
        const issueRows = await m.query(
          `SELECT * FROM con_issues WHERE issue_id=$1`,
          [issueId],
        );
        const event = await this.emit(m, issueRows[0], 'ConsumableIssued.v1', {
          issue_id: issueId,
          emergency: true,
          quantity: input.quantity,
          recipient_id: input.recipient_id,
        });
        return {
          issue_id: issueId,
          status: 'ISSUED',
          review_due_at: new Date(Date.now() + 86400000).toISOString(),
          event,
        };
      }),
    );
  }
  async reviewEmergency(
    actor: InventoryActor,
    issueId: string,
    key: string,
    input: { decision: 'REVIEWED' | 'POLICY_BREACH_RECORDED'; notes: string },
  ) {
    await this.require(actor, 'CONSUMABLES_EMERGENCY_REVIEW');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const rows = await m.query(
            `SELECT * FROM con_issues WHERE issue_id=$1 AND tenant_id=$2 AND emergency=true FOR UPDATE`,
            [issueId, this.tenant(actor)],
          ),
          row = rows[0];
        if (!row) throw new NotFoundException('Emergency issue not found');
        if (row.issued_by === actor.user_id)
          throw new ForbiddenException(
            'Issuer cannot review own emergency issue',
          );
        await m.query(
          `INSERT INTO con_emergency_reviews(issue_id,tenant_id,decision,reviewer_id,review_notes) VALUES($1,$2,$3,$4,$5)`,
          [issueId, row.tenant_id, input.decision, actor.user_id, input.notes],
        );
        const event = await this.emit(
          m,
          row,
          'ConsumableEmergencyReviewCompleted.v1',
          { issue_id: issueId, decision: input.decision },
        );
        return { issue_id: issueId, decision: input.decision, event };
      }),
    );
  }
  async createCount(
    actor: InventoryActor,
    key: string,
    input: {
      counter_id: string;
      department_id?: number;
      location_space_id?: string;
      product_model_id: string;
    },
  ) {
    await this.require(actor, 'CONSUMABLES_COUNT');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const p = await this.policy(
          m,
          this.tenant(actor),
          input.product_model_id,
          input.department_id,
          input.location_space_id,
        );
        const lots = await m.query(
          `SELECT r.inventory_record_id,COALESCE(SUM(l.signed_quantity),0) expected,MAX(l.occurred_at) last_movement FROM inv_records r LEFT JOIN inv_lot_movements l ON l.inventory_record_id=r.inventory_record_id WHERE r.tenant_id=$1 AND r.record_type='LOT' AND r.product_model_id=$2 AND($3::uuid IS NULL OR r.location_space_id=$3) GROUP BY r.inventory_record_id ORDER BY r.inventory_record_id`,
          [
            this.tenant(actor),
            input.product_model_id,
            input.location_space_id ?? null,
          ],
        );
        if (!lots.length) throw new NotFoundException('No LOTs in count scope');
        const id = randomUUID(),
          snapshot = inventoryHash(lots);
        await m.query(
          `INSERT INTO con_count_sessions(count_session_id,tenant_id,location_space_id,department_id,product_model_id,policy_id,counter_id,snapshot_revision_hash,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            id,
            this.tenant(actor),
            input.location_space_id ?? null,
            input.department_id ?? null,
            input.product_model_id,
            p.stock_policy_id,
            input.counter_id,
            snapshot,
            actor.user_id,
          ],
        );
        for (const lot of lots)
          await m.query(
            `INSERT INTO con_count_lines(count_session_id,tenant_id,inventory_record_id,expected_quantity,last_movement_at_snapshot) VALUES($1,$2,$3,$4,$5)`,
            [
              id,
              this.tenant(actor),
              lot.inventory_record_id,
              lot.expected,
              lot.last_movement,
            ],
          );
        return {
          count_session_id: id,
          status: 'PLANNED',
          lot_count: lots.length,
        };
      }),
    );
  }
  async submitCount(
    actor: InventoryActor,
    id: string,
    revision: number,
    key: string,
    input: { counts: Record<string, number>; evidence?: unknown[] },
  ) {
    await this.require(actor, 'CONSUMABLES_COUNT');
    return this.db.transaction(async (m) => {
      const rows = await m.query(
          `SELECT * FROM con_count_sessions WHERE count_session_id=$1 AND tenant_id=$2 FOR UPDATE`,
          [id, this.tenant(actor)],
        ),
        row = rows[0];
      if (!row) throw new NotFoundException('Count not found');
      this.revision(row, revision);
      if (row.counter_id !== actor.user_id)
        throw new ForbiddenException('Assigned blind counter required');
      return this.idempotent(m, actor, key, input, async () => {
        const lines = await m.query(
          `SELECT * FROM con_count_lines WHERE count_session_id=$1`,
          [id],
        );
        for (const line of lines) {
          const count = input.counts[line.inventory_record_id];
          if (count === undefined || count < 0)
            throw new BadRequestException(
              'Every LOT needs a non-negative count',
            );
          await m.query(
            `UPDATE con_count_lines SET counted_quantity=$2,variance=$2-expected_quantity,evidence=$3::jsonb WHERE count_line_id=$1`,
            [line.count_line_id, count, JSON.stringify(input.evidence ?? [])],
          );
        }
        await m.query(
          `UPDATE con_count_sessions SET status='REVIEW_PENDING',submitted_at=NOW(),aggregate_revision=aggregate_revision+1 WHERE count_session_id=$1`,
          [id],
        );
        return {
          count_session_id: id,
          status: 'REVIEW_PENDING',
          aggregate_revision: Number(row.aggregate_revision) + 1,
        };
      });
    });
  }
  async reviewCount(
    actor: InventoryActor,
    id: string,
    revision: number,
    key: string,
    input: { decision: 'APPROVE' | 'RECOUNT' | 'REJECT'; reason: string },
  ) {
    await this.require(actor, 'CONSUMABLES_COUNT_APPROVE');
    return this.db.transaction(async (m) => {
      const rows = await m.query(
          `SELECT * FROM con_count_sessions WHERE count_session_id=$1 AND tenant_id=$2 FOR UPDATE`,
          [id, this.tenant(actor)],
        ),
        row = rows[0];
      if (!row) throw new NotFoundException('Count not found');
      this.revision(row, revision);
      if (row.counter_id === actor.user_id)
        throw new ForbiddenException('Counter cannot review own count');
      return this.idempotent(m, actor, key, input, async () => {
        if (input.decision !== 'APPROVE') {
          const status =
            input.decision === 'RECOUNT' ? 'RECOUNT_REQUIRED' : 'REJECTED';
          await m.query(
            `UPDATE con_count_sessions SET status=$2,reviewer_id=$3,aggregate_revision=aggregate_revision+1 WHERE count_session_id=$1`,
            [id, status, actor.user_id],
          );
          return { count_session_id: id, status };
        }
        const lines = await m.query(
          `SELECT l.*,COALESCE((SELECT MAX(occurred_at) FROM inv_lot_movements m2 WHERE m2.inventory_record_id=l.inventory_record_id),'-infinity') current_last FROM con_count_lines l WHERE l.count_session_id=$1 FOR UPDATE`,
          [id],
        );
        for (const line of lines) {
          if (
            (!line.last_movement_at_snapshot &&
              line.current_last !== '-infinity') ||
            (line.last_movement_at_snapshot &&
              new Date(line.current_last) >
                new Date(line.last_movement_at_snapshot))
          )
            throw new ConflictException({
              message: 'Movement after count snapshot requires recount',
              code: 'STALE_PHYSICAL_COUNT',
            });
          const variance = Number(line.variance);
          const policyRows = await m.query(
            `SELECT count_variance_tolerance FROM con_stock_policies WHERE stock_policy_id=$1`,
            [row.policy_id],
          );
          if (
            Math.abs(variance) >
              Number(policyRows[0]?.count_variance_tolerance ?? 0) &&
            (!Array.isArray(line.evidence) || line.evidence.length === 0)
          )
            throw new ConflictException({
              message: 'Material variance requires evidence or recount',
              code: 'COUNT_EVIDENCE_REQUIRED',
            });
          if (Math.abs(variance) > 0.0005)
            await this.inventory.postConsumableMovement(m, {
              tenant_id: row.tenant_id,
              inventory_record_id: line.inventory_record_id,
              movement_type: variance > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
              quantity: Math.abs(variance),
              source_type: 'PHYSICAL_COUNT',
              source_id: id,
              reason_code: 'APPROVED_COUNT_VARIANCE',
              reason: input.reason,
              actor_id: actor.user_id,
              department_id: row.department_id,
              location_space_id: row.location_space_id,
              idempotency_key: `${key}:${line.count_line_id}`,
            });
        }
        await m.query(
          `UPDATE con_count_sessions SET status='POSTED',reviewer_id=$2,posted_at=NOW() WHERE count_session_id=$1`,
          [id, actor.user_id],
        );
        const event = await this.emit(
          m,
          row,
          'ConsumableStockAdjustmentPosted.v1',
          { count_session_id: id },
        );
        return {
          count_session_id: id,
          status: 'POSTED',
          aggregate_revision: row.aggregate_revision,
          event,
        };
      });
    });
  }

  async counts(actor: InventoryActor) {
    await this.require(actor, 'CONSUMABLES_VIEW');
    const canReview =
      (await this.grants(actor, 'CONSUMABLES_COUNT_APPROVE')).length > 0;
    const rows = await this.db.query(
      `SELECT c.*,COALESCE(json_agg(json_build_object(
        'count_line_id',l.count_line_id,'inventory_record_id',l.inventory_record_id,
        'counted_quantity',l.counted_quantity,'variance',CASE WHEN $3 OR c.counter_id<>$2 THEN l.variance ELSE NULL END,
        'expected_quantity',CASE WHEN $3 OR c.counter_id<>$2 THEN l.expected_quantity ELSE NULL END
      ) ORDER BY l.created_at) FILTER(WHERE l.count_line_id IS NOT NULL),'[]') lines
       FROM con_count_sessions c LEFT JOIN con_count_lines l ON l.count_session_id=c.count_session_id
       WHERE c.tenant_id=$1 AND EXISTS(SELECT 1 FROM acq_access_grants g WHERE g.tenant_id=c.tenant_id AND g.capability='CONSUMABLES_VIEW' AND(g.principal_user_id=$2 OR lower(g.principal_role)=ANY($4::text[])) AND(g.scope_type='TENANT' OR(g.scope_type='DEPARTMENT' AND g.scope_reference=c.department_id::text) OR(g.scope_type='LOCATION' AND g.scope_reference=c.location_space_id::text))) GROUP BY c.count_session_id ORDER BY c.created_at DESC`,
      [this.tenant(actor), actor.user_id, canReview, this.roles(actor)],
    );
    return rows;
  }

  async issues(actor: InventoryActor) {
    await this.require(actor, 'CONSUMABLES_VIEW');
    return this.db.query(
      `SELECT i.*,COALESCE(SUM(a.issued_quantity),0) issued_quantity,
              COALESCE(SUM(a.consumed_quantity),0) consumed_quantity,
              COALESCE(SUM(a.returned_quantity),0) returned_quantity,
              COALESCE(SUM(a.issued_quantity-a.consumed_quantity-a.returned_quantity),0) outstanding_quantity
         FROM con_issues i LEFT JOIN con_issue_allocations a ON a.issue_id=i.issue_id
        WHERE i.tenant_id=$1 AND EXISTS(SELECT 1 FROM acq_access_grants g WHERE g.tenant_id=i.tenant_id AND g.capability='CONSUMABLES_VIEW' AND(g.principal_user_id=$2 OR lower(g.principal_role)=ANY($3::text[])) AND(g.scope_type='TENANT' OR(g.scope_type='DEPARTMENT' AND g.scope_reference=i.department_id::text))) GROUP BY i.issue_id ORDER BY i.issued_at DESC LIMIT 200`,
      [this.tenant(actor), actor.user_id, this.roles(actor)],
    );
  }

  async alerts(actor: InventoryActor) {
    await this.require(actor, 'CONSUMABLES_VIEW');
    return this.db.query(
      `SELECT a.*,pm.product_name FROM con_alerts a LEFT JOIN inv_product_models pm ON pm.product_model_id=a.product_model_id
        WHERE a.tenant_id=$1 AND EXISTS(SELECT 1 FROM acq_access_grants g WHERE g.tenant_id=a.tenant_id AND g.capability='CONSUMABLES_VIEW' AND(g.principal_user_id=$2 OR lower(g.principal_role)=ANY($3::text[])) AND(g.scope_type='TENANT' OR(g.scope_type='LOCATION' AND g.scope_reference=a.location_space_id::text))) ORDER BY CASE a.status WHEN 'OPEN' THEN 0 WHEN 'ACKNOWLEDGED' THEN 1 ELSE 2 END,a.last_seen_at DESC LIMIT 300`,
      [this.tenant(actor), actor.user_id, this.roles(actor)],
    );
  }

  async acknowledgeAlert(actor: InventoryActor, id: string, key: string) {
    await this.require(actor, 'CONSUMABLES_VIEW');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, { id }, async () => {
        const rows = await m.query(
          `UPDATE con_alerts SET status='ACKNOWLEDGED',acknowledged_by=$3,last_seen_at=NOW()
            WHERE alert_id=$1 AND tenant_id=$2 AND status='OPEN' RETURNING *`,
          [id, this.tenant(actor), actor.user_id],
        );
        if (!rows[0]) throw new NotFoundException('Open alert not found');
        await this.requireScope(actor, 'CONSUMABLES_VIEW', {
          location_space_id: rows[0].location_space_id,
        });
        return rows[0];
      }),
    );
  }

  async releaseRequest(
    actor: InventoryActor,
    id: string,
    revision: number,
    key: string,
    input: { action: 'CANCEL' | 'REJECT' | 'CLOSE'; reason: string },
  ) {
    const capability =
      input.action === 'CANCEL' ? 'CONSUMABLES_REQUEST' : 'CONSUMABLES_APPROVE';
    await this.require(actor, capability);
    return this.db.transaction(async (m) => {
      const rows = await m.query(
        `SELECT * FROM con_stock_requests WHERE stock_request_id=$1 AND tenant_id=$2 FOR UPDATE`,
        [id, this.tenant(actor)],
      );
      const row = rows[0];
      if (!row) throw new NotFoundException('Request not found');
      this.revision(row, revision);
      if (input.action === 'CANCEL' && row.requester_id !== actor.user_id)
        throw new ForbiddenException('Only requester can cancel');
      return this.idempotent(m, actor, key, input, async () => {
        const status =
          input.action === 'CANCEL'
            ? 'CANCELLED'
            : input.action === 'REJECT'
              ? 'REJECTED'
              : 'CLOSED';
        await m.query(
          `UPDATE con_stock_requests SET status=$2,updated_at=NOW() WHERE stock_request_id=$1`,
          [id, status],
        );
        if (status !== 'CLOSED') {
          await m.query(
            `UPDATE con_reservations SET status=CASE WHEN $2='CANCELLED' THEN 'CANCELLED' ELSE 'RELEASED' END,released_at=NOW(),release_reason=$3 WHERE stock_request_id=$1 AND status IN('ACTIVE','PARTIALLY_CONSUMED')`,
            [id, status, input.reason],
          );
          await m.query(
            `UPDATE con_reservation_allocations a SET status=CASE WHEN $2='CANCELLED' THEN 'CANCELLED' ELSE 'RELEASED' END FROM con_reservations r WHERE a.reservation_id=r.reservation_id AND r.stock_request_id=$1 AND a.status IN('ACTIVE','PARTIALLY_CONSUMED')`,
            [id, status],
          );
          await this.emit(m, row, 'ConsumableReservationReleased.v1', {
            stock_request_id: id,
            reason: input.reason,
          });
        }
        await this.audit(
          m,
          row,
          'REQUEST',
          id,
          `REQUEST_${status}`,
          actor.user_id,
          null,
          { status, reason: input.reason },
        );
        return {
          stock_request_id: id,
          status,
          aggregate_revision: row.aggregate_revision,
        };
      });
    });
  }

  async policies(actor: InventoryActor) {
    await this.require(actor, 'CONSUMABLES_VIEW');
    return this.db.query(
      `SELECT * FROM con_stock_policies WHERE tenant_id=$1 ORDER BY status='PUBLISHED' DESC,policy_version DESC`,
      [this.tenant(actor)],
    );
  }

  async publishPolicy(
    actor: InventoryActor,
    key: string,
    input: Record<string, unknown>,
  ) {
    await this.require(actor, 'CONSUMABLES_POLICY_ADMIN');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const versionRows = await m.query(
          `SELECT COALESCE(MAX(policy_version),0)+1 version FROM con_stock_policies WHERE tenant_id=$1`,
          [this.tenant(actor)],
        );
        const rows = await m.query(
          `INSERT INTO con_stock_policies(tenant_id,category,product_model_id,department_id,location_space_id,policy_version,status,minimum_level,reorder_level,safety_level,target_level,reservation_hours,allocation_method,controlled_item,hazardous_item,emergency_issue_allowed,count_frequency_days,count_variance_tolerance,expiry_warning_days,inactivity_days,anomaly_window_days,anomaly_multiplier,replenishment_lead_days,published_by,published_at)
         VALUES($1,$2,$3,$4,$5,$6,'PUBLISHED',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19,$20,$21,$22,$23,NOW()) RETURNING *`,
          [
            this.tenant(actor),
            input.category ?? null,
            input.product_model_id ?? null,
            input.department_id ?? null,
            input.location_space_id ?? null,
            versionRows[0].version,
            input.minimum_level ?? 0,
            input.reorder_level ?? 0,
            input.safety_level ?? 0,
            input.target_level ?? 0,
            input.reservation_hours ?? 48,
            input.allocation_method ?? 'FEFO',
            input.controlled_item ?? false,
            input.hazardous_item ?? false,
            input.emergency_issue_allowed ?? true,
            input.count_frequency_days ?? 90,
            input.count_variance_tolerance ?? 0,
            JSON.stringify(input.expiry_warning_days ?? [90, 60, 30]),
            input.inactivity_days ?? 90,
            input.anomaly_window_days ?? 7,
            input.anomaly_multiplier ?? 2,
            input.replenishment_lead_days ?? 30,
            actor.user_id,
          ],
        );
        return rows[0];
      }),
    );
  }

  async suggestions(actor: InventoryActor) {
    await this.require(actor, 'CONSUMABLES_VIEW');
    return this.db.query(
      `SELECT s.*,pm.product_name,pm.category FROM con_replenishment_suggestions s JOIN inv_product_models pm ON pm.product_model_id=s.product_model_id WHERE s.tenant_id=$1 AND EXISTS(SELECT 1 FROM acq_access_grants g WHERE g.tenant_id=s.tenant_id AND g.capability='CONSUMABLES_VIEW' AND(g.principal_user_id=$2 OR lower(g.principal_role)=ANY($3::text[])) AND(g.scope_type='TENANT' OR(g.scope_type='DEPARTMENT' AND g.scope_reference=s.department_id::text) OR(g.scope_type='LOCATION' AND g.scope_reference=s.location_space_id::text))) ORDER BY s.created_at DESC`,
      [this.tenant(actor), actor.user_id, this.roles(actor)],
    );
  }

  async convertSuggestion(
    actor: InventoryActor,
    id: string,
    key: string,
    input: {
      funding_source_type: CreateAcquisitionInput['funding_source_type'];
      funding_source_id: string;
      required_by_date: string;
      priority?: CreateAcquisitionInput['priority'];
      estimated_unit_price: number;
      intended_use_case?: string;
    },
  ) {
    await this.require(actor, 'CONSUMABLES_REPLENISHMENT_CONVERT');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const rows = await m.query(
          `SELECT s.*,pm.product_name,pm.category,pm.brand,pm.model_number,pm.part_number,pm.technical_specifications FROM con_replenishment_suggestions s JOIN inv_product_models pm ON pm.product_model_id=s.product_model_id WHERE s.suggestion_id=$1 AND s.tenant_id=$2 FOR UPDATE OF s`,
          [id, this.tenant(actor)],
        );
        const suggestion = rows[0];
        if (!suggestion) throw new NotFoundException('Suggestion not found');
        await this.requireScope(actor, 'CONSUMABLES_REPLENISHMENT_CONVERT', {
          department_id: suggestion.department_id,
          location_space_id: suggestion.location_space_id,
        });
        if (suggestion.acquisition_id)
          return {
            suggestion_id: id,
            acquisition_id: suggestion.acquisition_id,
            status: 'CONVERTED',
          };
        if (!(input.estimated_unit_price >= 0))
          throw new BadRequestException('Estimated unit price required');
        const draft = await this.acquisitions.createDraft(
          actor,
          {
            requesting_department_id:
              suggestion.department_id ?? actor.department_id ?? undefined,
            intended_department_id:
              suggestion.department_id ?? actor.department_id ?? undefined,
            intended_use_case:
              input.intended_use_case ?? 'Consumable stock replenishment',
            required_by_date: input.required_by_date,
            priority: input.priority ?? 'NORMAL',
            funding_source_type: input.funding_source_type,
            funding_source_id: input.funding_source_id,
            default_item_classification: 'CONSUMABLE',
            source: 'INVENTORY_REPLENISHMENT',
            external_reference: id,
            lines: [
              {
                acquisition_layout: 'GENERAL',
                product_name: suggestion.product_name,
                category: suggestion.category,
                quantity: Number(suggestion.suggested_quantity),
                unit: 'unit',
                brand: suggestion.brand,
                model_number: suggestion.model_number,
                part_number: suggestion.part_number,
                technical_specifications: suggestion.technical_specifications,
                intended_use:
                  input.intended_use_case ?? 'Consumable stock replenishment',
                estimated_unit_price: input.estimated_unit_price,
                item_classification: 'CONSUMABLE',
              },
            ],
          },
          `replenishment:${id}`,
          m,
        );
        await m.query(
          `UPDATE con_replenishment_suggestions SET status='CONVERTED',acquisition_id=$2,converted_at=NOW() WHERE suggestion_id=$1`,
          [id, draft.acquisition_id],
        );
        const event = await this.emit(
          m,
          suggestion,
          'ConsumableReplenishmentConverted.v1',
          { suggestion_id: id, acquisition_id: draft.acquisition_id },
        );
        return {
          suggestion_id: id,
          acquisition_id: draft.acquisition_id,
          status: 'CONVERTED',
          event,
        };
      }),
    );
  }

  async recalculateEligibilityAndAlerts() {
    return this.db.transaction(async (m) => {
      const lots = await m.query(
        `SELECT r.tenant_id,r.inventory_record_id,r.product_model_id,r.location_space_id,r.record_status,s.expiry_date,COALESCE(SUM(l.signed_quantity),0) balance FROM inv_records r JOIN pv_subjects s ON s.subject_id=r.subject_id LEFT JOIN inv_lot_movements l ON l.inventory_record_id=r.inventory_record_id WHERE r.record_type='LOT' GROUP BY r.inventory_record_id,s.expiry_date`,
      );
      let suggestions = 0;
      for (const lot of lots) {
        let status = 'AVAILABLE';
        let reason: string | null = null;
        if (lot.record_status === 'QUARANTINED') {
          status = 'QUARANTINED';
          reason = 'Inventory record quarantined';
        } else if (Number(lot.balance) <= 0) {
          status = 'DEPLETED';
          reason = 'No stock on hand';
        } else if (
          lot.expiry_date &&
          new Date(lot.expiry_date) <
            new Date(new Date().toISOString().slice(0, 10))
        ) {
          status = 'EXPIRED';
          reason = 'Expiry date passed';
        } else if (
          lot.expiry_date &&
          new Date(lot.expiry_date).getTime() - Date.now() <= 90 * 86400000
        ) {
          status = 'EXPIRING_SOON';
          reason = 'Within expiry warning window';
        }
        await m.query(
          `INSERT INTO con_lot_eligibility(inventory_record_id,tenant_id,status,reason,calculated_at) VALUES($1,$2,$3,$4,NOW()) ON CONFLICT(inventory_record_id) DO UPDATE SET status=EXCLUDED.status,reason=EXCLUDED.reason,calculated_at=NOW()`,
          [lot.inventory_record_id, lot.tenant_id, status, reason],
        );
        const alertType =
          status === 'EXPIRED'
            ? 'EXPIRED_STOCK'
            : status === 'EXPIRING_SOON'
              ? 'EXPIRING_STOCK'
              : null;
        if (alertType)
          await this.upsertAlert(
            m,
            lot.tenant_id,
            alertType,
            lot.product_model_id,
            lot.inventory_record_id,
            lot.location_space_id,
            { status, expiry_date: lot.expiry_date },
          );
        else
          await this.resolveAlert(
            m,
            lot.tenant_id,
            `lot:${lot.inventory_record_id}:expiry`,
          );
      }
      const models = await m.query(
        `SELECT r.tenant_id,r.product_model_id,r.location_space_id,COALESCE(SUM(CASE WHEN COALESCE(e.status,'AVAILABLE') IN('AVAILABLE','EXPIRING_SOON') THEN lm.signed_quantity ELSE 0 END),0)-COALESCE((SELECT SUM(a.allocated_quantity-a.issued_quantity) FROM con_reservation_allocations a JOIN con_reservations z ON z.reservation_id=a.reservation_id WHERE a.tenant_id=r.tenant_id AND a.inventory_record_id IN(SELECT inventory_record_id FROM inv_records x WHERE x.product_model_id=r.product_model_id AND x.location_space_id IS NOT DISTINCT FROM r.location_space_id) AND a.status IN('ACTIVE','PARTIALLY_CONSUMED') AND z.expires_at>NOW()),0) available FROM inv_records r LEFT JOIN inv_lot_movements lm ON lm.inventory_record_id=r.inventory_record_id LEFT JOIN con_lot_eligibility e ON e.inventory_record_id=r.inventory_record_id WHERE r.record_type='LOT' GROUP BY r.tenant_id,r.product_model_id,r.location_space_id`,
      );
      for (const model of models) {
        const p = await this.policy(
          m,
          model.tenant_id,
          model.product_model_id,
          undefined,
          model.location_space_id,
        );
        const available = Math.max(0, Number(model.available));
        if (available <= Number(p.reorder_level)) {
          await this.upsertAlert(
            m,
            model.tenant_id,
            'REORDER_LEVEL',
            model.product_model_id,
            null,
            model.location_space_id,
            { available, reorder_level: Number(p.reorder_level) },
          );
          const inboundRows = await m.query(
            `SELECT COALESCE(SUM(ol.quantity-ol.cancelled_quantity)-SUM(COALESCE((SELECT SUM(rl.accepted_quantity) FROM proc_receipt_lines rl WHERE rl.order_line_id=ol.order_line_id),0)),0) inbound FROM proc_order_lines ol JOIN proc_orders o ON o.order_id=ol.order_id JOIN inv_procurement_batches b ON b.order_line_id=ol.order_line_id WHERE ol.tenant_id=$1 AND b.product_model_id=$2 AND o.status IN('ISSUED','PARTIALLY_RECEIVED')`,
            [model.tenant_id, model.product_model_id],
          );
          const inbound = Math.max(0, Number(inboundRows[0]?.inbound ?? 0)),
            suggested = Math.max(
              0,
              Number(p.target_level) - available - inbound,
            );
          if (suggested > 0) {
            const created = await m.query(
              `INSERT INTO con_replenishment_suggestions(tenant_id,product_model_id,location_space_id,policy_id,available_quantity,confirmed_inbound,target_quantity,suggested_quantity) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING *`,
              [
                model.tenant_id,
                model.product_model_id,
                model.location_space_id,
                p.stock_policy_id,
                available,
                inbound,
                p.target_level,
                suggested,
              ],
            );
            if (created[0]) {
              suggestions++;
              await this.emit(
                m,
                created[0],
                'ConsumableReplenishmentSuggested.v1',
                {
                  suggestion_id: created[0].suggestion_id,
                  product_model_id: model.product_model_id,
                  suggested_quantity: suggested,
                },
              );
            }
          }
        } else
          await this.resolveAlert(
            m,
            model.tenant_id,
            `model:${model.product_model_id}:${model.location_space_id ?? 'all'}:REORDER_LEVEL`,
          );
      }
      return { lots: lots.length, suggestions };
    });
  }

  private async upsertAlert(
    m: EntityManager,
    tenant: string,
    type: string,
    product: string | null,
    lot: string | null,
    location: string | null,
    details: unknown,
  ) {
    const key = lot
      ? `lot:${lot}:expiry`
      : `model:${product}:${location ?? 'all'}:${type}`;
    const rows = await m.query(
      `INSERT INTO con_alerts(tenant_id,alert_type,product_model_id,inventory_record_id,location_space_id,dedupe_key,details) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT(tenant_id,dedupe_key) WHERE status IN('OPEN','ACKNOWLEDGED') DO UPDATE SET details=EXCLUDED.details,last_seen_at=NOW(),occurrence_count=con_alerts.occurrence_count+1 RETURNING *,(xmax=0) created`,
      [tenant, type, product, lot, location, key, JSON.stringify(details)],
    );
    if (rows[0]?.created)
      await this.emit(m, rows[0], 'ConsumableStockAlertRaised.v1', {
        alert_id: rows[0].alert_id,
        alert_type: type,
        details,
      });
  }
  private async resolveAlert(m: EntityManager, tenant: string, key: string) {
    const rows = await m.query(
      `UPDATE con_alerts SET status='RESOLVED',resolved_at=NOW() WHERE tenant_id=$1 AND dedupe_key=$2 AND status IN('OPEN','ACKNOWLEDGED') RETURNING *`,
      [tenant, key],
    );
    for (const row of rows)
      await this.emit(m, row, 'ConsumableStockAlertResolved.v1', {
        alert_id: row.alert_id,
        alert_type: row.alert_type,
      });
  }
}
