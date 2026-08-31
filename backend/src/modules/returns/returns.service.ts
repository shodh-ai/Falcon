/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument -- database rows are validated at domain boundaries */
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
import type { InventoryActor } from '../inventory/inventory.types';
import { InventoryService } from '../inventory/inventory.service';
import { ProcurementService } from '../procurements/procurement.service';
import { returnHash } from './returns.util';

type ReturnActor = InventoryActor;

@Injectable()
export class ReturnsService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly inventory: InventoryService,
    private readonly procurements: ProcurementService,
  ) {}

  private tenant(actor: ReturnActor) {
    if (!actor.tenant_id)
      throw new ForbiddenException('Tenant context required');
    return actor.tenant_id;
  }
  private roles(actor: ReturnActor) {
    return [
      ...new Set([...(actor.roles ?? []), ...(actor.role ? [actor.role] : [])]),
    ].map((role) => role.toLowerCase());
  }
  private grants(actor: ReturnActor, capability: string) {
    return this.db.query(
      `SELECT scope_type,scope_reference FROM acq_access_grants WHERE tenant_id=$1 AND capability=$2
       AND valid_from<=NOW() AND(valid_until IS NULL OR valid_until>NOW())
       AND(principal_user_id=$3::uuid OR lower(principal_role)=ANY($4::text[]))`,
      [this.tenant(actor), capability, actor.user_id, this.roles(actor)],
    );
  }
  private async require(actor: ReturnActor, capability: string) {
    if (!(await this.grants(actor, capability)).length)
      throw new ForbiddenException(`Missing ${capability}`);
  }
  private async scopedCase(
    actor: ReturnActor,
    id: string,
    capability = 'RETURNS_VIEW',
  ) {
    const grants = await this.grants(actor, capability);
    if (!grants.length) throw new ForbiddenException(`Missing ${capability}`);
    const rows = await this.db.query(
      `SELECT c.*,pc.department_id FROM ret_cases c JOIN proc_cases pc ON pc.proc_case_id=c.proc_case_id
       WHERE c.return_case_id=$1 AND c.tenant_id=$2 AND EXISTS(
         SELECT 1 FROM acq_access_grants g WHERE g.tenant_id=c.tenant_id AND g.capability=$3
         AND g.valid_from<=NOW() AND(g.valid_until IS NULL OR g.valid_until>NOW())
         AND(g.principal_user_id=$4 OR lower(g.principal_role)=ANY($5::text[]))
         AND(g.scope_type='TENANT' OR(g.scope_type='DEPARTMENT' AND g.scope_reference=pc.department_id::text)))`,
      [id, this.tenant(actor), capability, actor.user_id, this.roles(actor)],
    );
    if (!rows[0]) throw new NotFoundException('Return case not found');
    return rows[0];
  }
  private revision(row: any, expected: number) {
    if (Number(row.aggregate_revision) !== expected)
      throw new ConflictException({
        message: 'Return case changed',
        code: 'STALE_REVISION',
        current_revision: Number(row.aggregate_revision),
      });
  }
  private async idempotent<T>(
    m: EntityManager,
    actor: ReturnActor,
    key: string,
    input: unknown,
    work: () => Promise<T>,
  ): Promise<T> {
    if (!key?.trim()) throw new BadRequestException('Idempotency-Key required');
    const tenant = this.tenant(actor),
      requestHash = returnHash(input);
    await m.query(`SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))`, [
      tenant,
      `${actor.user_id}:${key}`,
    ]);
    const prior = await m.query(
      `SELECT request_hash,response_payload FROM ret_idempotency WHERE tenant_id=$1 AND actor_id=$2 AND idempotency_key=$3 FOR UPDATE`,
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
        `INSERT INTO ret_idempotency(tenant_id,actor_id,idempotency_key,request_hash) VALUES($1,$2,$3,$4)`,
        [tenant, actor.user_id, key, requestHash],
      );
    const result = await work();
    await m.query(
      `UPDATE ret_idempotency SET response_payload=$4::jsonb WHERE tenant_id=$1 AND actor_id=$2 AND idempotency_key=$3`,
      [tenant, actor.user_id, key, JSON.stringify(result)],
    );
    return result;
  }
  private async locked(m: EntityManager, id: string, tenant: string) {
    const rows = await m.query(
      `SELECT * FROM ret_cases WHERE return_case_id=$1 AND tenant_id=$2 FOR UPDATE`,
      [id, tenant],
    );
    if (!rows[0]) throw new NotFoundException('Return case not found');
    return rows[0];
  }
  private async audit(
    m: EntityManager,
    row: any,
    entityType: string,
    entityId: string,
    eventType: string,
    actorId: string,
    previous: unknown,
    next: unknown,
  ) {
    const last = await m.query(
      `SELECT event_hash FROM ret_audit_events WHERE return_case_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [row.return_case_id],
    );
    const previousHash = last[0]?.event_hash ?? null;
    const eventHash = returnHash({
      case_id: row.return_case_id,
      entityType,
      entityId,
      eventType,
      actorId,
      previous,
      next,
      previousHash,
    });
    await m.query(
      `INSERT INTO ret_audit_events(tenant_id,return_case_id,entity_type,entity_id,event_type,actor_id,previous_value,new_value,previous_hash,event_hash) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10)`,
      [
        row.tenant_id,
        row.return_case_id,
        entityType,
        entityId,
        eventType,
        actorId,
        previous ? JSON.stringify(previous) : null,
        next ? JSON.stringify(next) : null,
        previousHash,
        eventHash,
      ],
    );
  }
  private async emit(
    m: EntityManager,
    row: any,
    eventType: string,
    payload: Record<string, unknown>,
  ) {
    const eventId = randomUUID(),
      revision = Number(row.aggregate_revision) + 1,
      sequence = Number(row.next_event_sequence),
      occurredAt = new Date().toISOString();
    const envelope = {
      event_id: eventId,
      event_type: eventType,
      event_version: 1,
      aggregate_id: row.return_case_id,
      aggregate_revision: revision,
      aggregate_sequence: sequence,
      tenant_id: row.tenant_id,
      return_case_id: row.return_case_id,
      occurred_at: occurredAt,
      ...payload,
    };
    await m.query(
      `INSERT INTO ret_outbox_events(event_id,tenant_id,aggregate_id,aggregate_revision,aggregate_sequence,event_type,occurred_at,payload,payload_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
      [
        eventId,
        row.tenant_id,
        row.return_case_id,
        revision,
        sequence,
        eventType,
        occurredAt,
        JSON.stringify(envelope),
        returnHash(envelope),
      ],
    );
    await m.query(
      `UPDATE ret_cases SET aggregate_revision=$2,next_event_sequence=$3,updated_at=NOW() WHERE return_case_id=$1`,
      [row.return_case_id, revision, sequence + 1],
    );
    row.aggregate_revision = revision;
    row.next_event_sequence = sequence + 1;
    return envelope;
  }
  private async decision(
    m: EntityManager,
    row: any,
    type: string,
    decision: string,
    reason: string,
    actorId: string,
    policyHash?: string | null,
    supersedes?: string | null,
  ) {
    const last = await m.query(
      `SELECT decision_hash FROM ret_decisions WHERE return_case_id=$1 ORDER BY decided_at DESC LIMIT 1`,
      [row.return_case_id],
    );
    const evidence = await m.query(
      `SELECT evidence_id,content_hash FROM ret_evidence WHERE return_case_id=$1 ORDER BY evidence_id`,
      [row.return_case_id],
    );
    const evidenceHash = returnHash(evidence),
      previousHash = last[0]?.decision_hash ?? null,
      id = randomUUID();
    const hash = returnHash({
      id,
      case_id: row.return_case_id,
      type,
      decision,
      reason,
      actorId,
      policyHash,
      evidenceHash,
      previousHash,
      supersedes,
    });
    await m.query(
      `INSERT INTO ret_decisions(decision_id,return_case_id,tenant_id,decision_type,decision,decision_reason,actor_id,policy_snapshot_hash,evidence_manifest_hash,previous_decision_hash,decision_hash,supersedes_decision_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        id,
        row.return_case_id,
        row.tenant_id,
        type,
        decision,
        reason,
        actorId,
        policyHash ?? null,
        evidenceHash,
        previousHash,
        hash,
        supersedes ?? null,
      ],
    );
    return {
      decision_id: id,
      decision_hash: hash,
      evidence_manifest_hash: evidenceHash,
    };
  }

  async dashboard(actor: ReturnActor) {
    await this.require(actor, 'RETURNS_VIEW');
    const rows = await this.db.query(
      `SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE workflow_status IN('SUBMITTED','TRIAGE','AWAITING_EVIDENCE','DECISION_PENDING'))::int awaiting_decision,COUNT(*) FILTER(WHERE workflow_status IN('APPROVED','IN_EXECUTION','RESOLUTION_PENDING'))::int in_execution,COUNT(*) FILTER(WHERE case_type='DOA')::int doa FROM ret_cases WHERE tenant_id=$1`,
      [this.tenant(actor)],
    );
    return rows[0];
  }
  async queue(actor: ReturnActor) {
    await this.require(actor, 'RETURNS_VIEW');
    return this.db.query(
      `SELECT c.*,pc.proc_case_id::text procurement_case_number,l.product_name,l.category FROM ret_cases c JOIN proc_cases pc ON pc.proc_case_id=c.proc_case_id JOIN acq_lines l ON l.line_id=c.acquisition_line_id WHERE c.tenant_id=$1 AND EXISTS(SELECT 1 FROM acq_access_grants g WHERE g.tenant_id=c.tenant_id AND g.capability='RETURNS_VIEW' AND(g.principal_user_id=$2 OR lower(g.principal_role)=ANY($3::text[])) AND(g.scope_type='TENANT' OR(g.scope_type='DEPARTMENT' AND g.scope_reference=pc.department_id::text))) ORDER BY c.updated_at DESC LIMIT 250`,
      [this.tenant(actor), actor.user_id, this.roles(actor)],
    );
  }
  async detail(actor: ReturnActor, id: string) {
    const row = await this.scopedCase(actor, id);
    const [
      allocations,
      evidence,
      decisions,
      communications,
      rma,
      shipments,
      lineage,
      financial,
    ] = await Promise.all([
      this.db.query(
        `SELECT a.*,r.university_asset_id,r.lot_id,r.lifecycle_status FROM ret_case_allocations a JOIN inv_records r ON r.inventory_record_id=a.inventory_record_id WHERE a.return_case_id=$1 ORDER BY a.created_at`,
        [id],
      ),
      this.db.query(
        `SELECT evidence_id,evidence_type,content_hash,mime_type,byte_size,retention_class,metadata,captured_by,captured_at,revision_of FROM ret_evidence WHERE return_case_id=$1 ORDER BY captured_at`,
        [id],
      ),
      this.db.query(
        `SELECT * FROM ret_decisions WHERE return_case_id=$1 ORDER BY decided_at`,
        [id],
      ),
      this.db.query(
        `SELECT * FROM ret_vendor_communications WHERE return_case_id=$1 ORDER BY sent_at`,
        [id],
      ),
      this.db.query(
        `SELECT * FROM ret_rma_history WHERE return_case_id=$1 ORDER BY occurred_at`,
        [id],
      ),
      this.db.query(
        `SELECT * FROM ret_shipment_history WHERE return_case_id=$1 ORDER BY occurred_at`,
        [id],
      ),
      this.db.query(`SELECT * FROM ret_lineage WHERE return_case_id=$1`, [id]),
      this.db.query(
        `SELECT * FROM ret_financial_projections WHERE return_case_id=$1 ORDER BY posted_at`,
        [id],
      ),
    ]);
    return {
      ...row,
      allocations,
      evidence,
      decisions,
      communications,
      rma_history: rma,
      shipment_history: shipments,
      lineage,
      financial_projections: financial,
    };
  }

  async create(
    actor: ReturnActor,
    key: string,
    input: {
      case_type: 'DOA' | 'STANDARD_RETURN';
      reason: string;
      fault_discovered_at?: string;
      allocations: Array<{ inventory_record_id: string; quantity: number }>;
    },
  ) {
    await this.require(actor, 'RETURNS_INITIATE');
    if (!input.reason?.trim() || !input.allocations?.length)
      throw new BadRequestException(
        'Reason and exact allocations are required',
      );
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const ids = [
          ...new Set(input.allocations.map((a) => a.inventory_record_id)),
        ].sort();
        if (ids.length !== input.allocations.length)
          throw new BadRequestException(
            'Duplicate inventory allocations are not allowed',
          );
        const records = await m.query(
          `SELECT r.*,b.proc_case_id,b.acquisition_line_id,b.order_line_id,b.receipt_line_id,b.vendor_id,pc.acquisition_id,pc.acquisition_version_id,pc.department_id,s.subject_quantity,s.status subject_status FROM inv_records r JOIN inv_procurement_batches b ON b.procurement_batch_id=r.procurement_batch_id JOIN proc_cases pc ON pc.proc_case_id=b.proc_case_id JOIN pv_subjects s ON s.subject_id=r.subject_id WHERE r.inventory_record_id=ANY($1::uuid[]) AND r.tenant_id=$2 ORDER BY r.inventory_record_id FOR UPDATE OF r`,
          [ids, this.tenant(actor)],
        );
        if (records.length !== ids.length)
          throw new NotFoundException(
            'One or more inventory subjects were not found',
          );
        const first = records[0];
        if (
          records.some(
            (r: any) =>
              r.receipt_line_id !== first.receipt_line_id ||
              r.order_line_id !== first.order_line_id ||
              r.acquisition_line_id !== first.acquisition_line_id,
          )
        )
          throw new ConflictException(
            'One return case must use subjects from one receipt and acquisition line',
          );
        const grants = await this.grants(actor, 'RETURNS_INITIATE');
        if (
          !grants.some(
            (g: any) =>
              g.scope_type === 'TENANT' ||
              (g.scope_type === 'DEPARTMENT' &&
                String(g.scope_reference) === String(first.department_id)),
          )
        )
          throw new ForbiddenException('Inventory is outside return scope');
        const id = randomUUID(),
          caseNumber = `RET-${new Date().getUTCFullYear()}-${id.slice(0, 8).toUpperCase()}`;
        await m.query(
          `INSERT INTO ret_cases(return_case_id,tenant_id,case_number,case_type,proc_case_id,acquisition_id,acquisition_version_id,acquisition_line_id,order_line_id,receipt_line_id,vendor_id,reason,fault_discovered_at,initiator_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            id,
            first.tenant_id,
            caseNumber,
            input.case_type,
            first.proc_case_id,
            first.acquisition_id,
            first.acquisition_version_id,
            first.acquisition_line_id,
            first.order_line_id,
            first.receipt_line_id,
            first.vendor_id,
            input.reason.trim(),
            input.fault_discovered_at ?? null,
            actor.user_id,
          ],
        );
        for (const allocation of input.allocations) {
          const record = records.find(
            (r: any) =>
              r.inventory_record_id === allocation.inventory_record_id,
          );
          if (
            !record ||
            record.record_status !== 'ACTIVE' ||
            record.subject_status !== 'ACTIVE'
          )
            throw new ConflictException(
              'Only active verified inventory may be returned',
            );
          if (
            !(allocation.quantity > 0) ||
            (record.record_type === 'ITEM' && allocation.quantity !== 1) ||
            (record.record_type === 'LOT' &&
              allocation.quantity > Number(record.subject_quantity) + 0.0005)
          )
            throw new BadRequestException('Invalid exact subject quantity');
          await m.query(
            `INSERT INTO ret_case_allocations(return_case_id,tenant_id,subject_id,inventory_record_id,subject_type,quantity,previous_lifecycle_status) VALUES($1,$2,$3,$4,$5,$6,$7)`,
            [
              id,
              first.tenant_id,
              record.subject_id,
              record.inventory_record_id,
              record.record_type,
              allocation.quantity,
              record.lifecycle_status,
            ],
          );
        }
        const row = {
          return_case_id: id,
          tenant_id: first.tenant_id,
          aggregate_revision: 1,
          next_event_sequence: 1,
        };
        await this.audit(
          m,
          row,
          'RETURN_CASE',
          id,
          'RETURN_DRAFT_CREATED',
          actor.user_id,
          null,
          input,
        );
        return {
          return_case_id: id,
          case_number: caseNumber,
          workflow_status: 'DRAFT',
          aggregate_revision: 1,
        };
      }),
    );
  }

  async submit(actor: ReturnActor, id: string, expected: number, key: string) {
    await this.scopedCase(actor, id, 'RETURNS_INITIATE');
    return this.db.transaction((m) =>
      this.idempotent(
        m,
        actor,
        key,
        { id, expected, action: 'SUBMIT' },
        async () => {
          const row = await this.locked(m, id, this.tenant(actor));
          this.revision(row, expected);
          if (row.workflow_status !== 'DRAFT')
            throw new ConflictException('Only drafts may be submitted');
          const allocations = await m.query(
            `SELECT * FROM ret_case_allocations WHERE return_case_id=$1 ORDER BY inventory_record_id FOR UPDATE`,
            [id],
          );
          if (!allocations.length)
            throw new ConflictException('Exact allocations required');
          for (const allocation of allocations) {
            const hold = await this.inventory.placeReturnHold(m, {
              tenant_id: row.tenant_id,
              inventory_record_id: allocation.inventory_record_id,
              return_case_id: id,
              actor_id: actor.user_id,
            });
            await m.query(
              `UPDATE ret_case_allocations SET status='HELD',previous_lifecycle_status=$2,held_at=NOW() WHERE return_allocation_id=$1`,
              [allocation.return_allocation_id, hold.previous_lifecycle_status],
            );
          }
          const sources = await m.query(
            `SELECT l.return_window_days,l.doa_window_days,l.return_conditions,l.replacement_conditions,l.refund_conditions,l.restocking_fee_policy,l.return_shipping_responsibility,l.policy_source_reference,l.return_policy,l.replacement_policy,pr.actual_delivery_date,pr.created_at receipt_created_at FROM acq_lines l JOIN proc_receipt_lines rl ON rl.receipt_line_id=$2 JOIN proc_receipts pr ON pr.receipt_id=rl.receipt_id WHERE l.line_id=$1`,
            [row.acquisition_line_id, row.receipt_line_id],
          );
          const source = sources[0] ?? {},
            days =
              Number(
                row.case_type === 'DOA'
                  ? source.doa_window_days
                  : source.return_window_days,
              ) || 0,
            base = new Date(
              source.actual_delivery_date ??
                source.receipt_created_at ??
                new Date(),
            ),
            deadline = days ? new Date(base.getTime() + days * 86400000) : null;
          const policy = {
            precedence: [
              'PINNED_ACQUISITION_SNAPSHOT',
              'ATTACHED_VENDOR_POLICY',
              'VERIFIED_HISTORICAL_EVIDENCE',
              'REVIEWED_MANUAL_EVIDENCE',
              'EXCEPTION_REVIEW',
            ],
            case_type: row.case_type,
            return_window_days: source.return_window_days,
            doa_window_days: source.doa_window_days,
            return_conditions: source.return_conditions,
            replacement_conditions: source.replacement_conditions,
            refund_conditions: source.refund_conditions,
            restocking_fee_policy: source.restocking_fee_policy,
            shipping: source.return_shipping_responsibility,
            source_reference: source.policy_source_reference,
            legacy_return_policy: source.return_policy,
            legacy_replacement_policy: source.replacement_policy,
          };
          const snapshotHash = returnHash(policy);
          await m.query(
            `INSERT INTO ret_policy_snapshots(return_case_id,tenant_id,precedence_sources,policy_payload,policy_version,snapshot_hash) VALUES($1,$2,$3::jsonb,$4::jsonb,1,$5)`,
            [
              id,
              row.tenant_id,
              JSON.stringify(policy.precedence),
              JSON.stringify(policy),
              snapshotHash,
            ],
          );
          await m.query(
            `UPDATE ret_cases SET workflow_status='TRIAGE',submitted_at=NOW(),eligibility_deadline=$2,eligibility_policy_version=1,eligibility_snapshot_hash=$3,updated_at=NOW() WHERE return_case_id=$1`,
            [id, deadline?.toISOString() ?? null, snapshotHash],
          );
          await this.audit(
            m,
            row,
            'RETURN_CASE',
            id,
            'RETURN_SUBMITTED',
            actor.user_id,
            { workflow_status: 'DRAFT' },
            {
              workflow_status: 'TRIAGE',
              eligibility_deadline: deadline?.toISOString() ?? null,
            },
          );
          const event = await this.emit(m, row, 'ReturnCaseSubmitted.v1', {
            case_type: row.case_type,
            allocations: allocations.map((a: any) => ({
              allocation_id: a.return_allocation_id,
              subject_id: a.subject_id,
              inventory_record_id: a.inventory_record_id,
              quantity: Number(a.quantity),
            })),
            policy_snapshot_hash: snapshotHash,
            eligibility_deadline: deadline?.toISOString() ?? null,
          });
          await this.emit(m, row, 'ReturnHoldPlaced.v1', {
            allocations: allocations.map((a: any) => a.return_allocation_id),
          });
          return {
            return_case_id: id,
            workflow_status: 'TRIAGE',
            eligibility_status: 'PENDING',
            eligibility_deadline: deadline?.toISOString() ?? null,
            policy_snapshot_hash: snapshotHash,
            event,
            aggregate_revision: Number(row.aggregate_revision),
          };
        },
      ),
    );
  }

  async evaluate(
    actor: ReturnActor,
    id: string,
    expected: number,
    key: string,
    input: { reason: string; allow_window_exception?: boolean },
  ) {
    await this.scopedCase(actor, id, 'RETURNS_ELIGIBILITY_REVIEW');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.revision(row, expected);
        if (row.initiator_id === actor.user_id)
          throw new ForbiddenException('Initiator cannot review eligibility');
        if (
          !['TRIAGE', 'AWAITING_EVIDENCE', 'DECISION_PENDING'].includes(
            row.workflow_status,
          )
        )
          throw new ConflictException('Case is not eligible for review');
        const evidence = await m.query(
          `SELECT evidence_type FROM ret_evidence WHERE return_case_id=$1`,
          [id],
        );
        const types = new Set(evidence.map((e: any) => e.evidence_type));
        const required =
          row.case_type === 'DOA'
            ? [
                'RECEIPT',
                'FAULT_EVIDENCE',
                'PRODUCT_EVIDENCE',
                'IMMEDIATE_FAILURE_DESCRIPTION',
              ]
            : [
                'RECEIPT',
                'CONDITION_EVIDENCE',
                'RETURN_REASON',
                'INVENTORY_IDENTITY',
              ];
        const missing = required.filter((type) => !types.has(type));
        const outside =
          row.eligibility_deadline &&
          Date.now() > new Date(row.eligibility_deadline).getTime();
        let status = 'ELIGIBLE';
        if (missing.length) status = 'INSUFFICIENT_EVIDENCE';
        else if (outside && !input.allow_window_exception)
          status = 'WINDOW_EXPIRED';
        else if (outside) status = 'EXCEPTION_REQUIRED';
        const d = await this.decision(
          m,
          row,
          'ELIGIBILITY',
          status,
          input.reason,
          actor.user_id,
          row.eligibility_snapshot_hash,
        );
        const workflow =
          status === 'ELIGIBLE'
            ? 'DECISION_PENDING'
            : status === 'INSUFFICIENT_EVIDENCE'
              ? 'AWAITING_EVIDENCE'
              : 'DECISION_PENDING';
        await m.query(
          `UPDATE ret_cases SET eligibility_status=$2,workflow_status=$3,eligibility_reviewer_id=$4,updated_at=NOW() WHERE return_case_id=$1`,
          [id, status, workflow, actor.user_id],
        );
        await this.audit(
          m,
          row,
          'ELIGIBILITY',
          d.decision_id,
          'ELIGIBILITY_DECIDED',
          actor.user_id,
          { eligibility_status: row.eligibility_status },
          { eligibility_status: status, missing },
        );
        const event = await this.emit(m, row, 'ReturnEligibilityDecided.v1', {
          decision_id: d.decision_id,
          eligibility_status: status,
          missing_evidence: missing,
          policy_snapshot_hash: row.eligibility_snapshot_hash,
        });
        return {
          eligibility_status: status,
          missing_evidence: missing,
          workflow_status: workflow,
          decision: d,
          event,
          aggregate_revision: Number(row.aggregate_revision),
        };
      }),
    );
  }

  async approve(
    actor: ReturnActor,
    id: string,
    expected: number,
    key: string,
    input: {
      disposition:
        | 'REFUND'
        | 'CREDIT_NOTE'
        | 'REPLACEMENT_UNIT'
        | 'REPAIR_RETURN'
        | 'RETURN_ONLY'
        | 'REPAIR_REFERRAL'
        | 'NO_ACTION';
      reason: string;
      attributable_value: number;
      exception_approved?: boolean;
    },
  ) {
    await this.scopedCase(actor, id, 'RETURNS_APPROVE');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.revision(row, expected);
        if (row.initiator_id === actor.user_id)
          throw new ForbiddenException('Initiator cannot approve return');
        if (row.eligibility_reviewer_id === actor.user_id)
          throw new ForbiddenException(
            'Eligibility reviewer cannot be the disposition approver',
          );
        if (
          row.workflow_status !== 'DECISION_PENDING' ||
          !['ELIGIBLE', 'EXCEPTION_REQUIRED'].includes(row.eligibility_status)
        )
          throw new ConflictException(
            'Current eligibility does not permit approval',
          );
        if (
          row.eligibility_status === 'EXCEPTION_REQUIRED' &&
          !input.exception_approved
        )
          throw new ConflictException(
            'Explicit authorized exception approval required',
          );
        const d = await this.decision(
          m,
          row,
          'DISPOSITION',
          'APPROVED',
          input.reason,
          actor.user_id,
          row.eligibility_snapshot_hash,
        );
        await m.query(
          `UPDATE ret_cases SET workflow_status='APPROVED',disposition=$2,approver_id=$3,active_decision_id=$4,updated_at=NOW() WHERE return_case_id=$1`,
          [id, input.disposition, actor.user_id, d.decision_id],
        );
        row.workflow_status = 'APPROVED';
        row.active_decision_id = d.decision_id;
        const allocations = await m.query(
          `SELECT return_allocation_id module7_allocation_id,subject_id,inventory_record_id,quantity FROM ret_case_allocations WHERE return_case_id=$1 AND status='HELD' ORDER BY subject_id`,
          [id],
        );
        const quantity = allocations.reduce(
          (sum: number, a: any) => sum + Number(a.quantity),
          0,
        );
        const managed = await this.procurements.createModule7Return(m, actor, {
          initiator_id: row.initiator_id,
          module7_case_id: id,
          active_decision_id: d.decision_id,
          decision_hash: d.decision_hash,
          policy_snapshot_hash: row.eligibility_snapshot_hash,
          proc_case_id: row.proc_case_id,
          receipt_line_id: row.receipt_line_id,
          quantity,
          attributable_value: input.attributable_value,
          reason: row.reason,
          disposition: input.disposition,
          allocations,
        });
        await m.query(
          `UPDATE ret_cases SET proc_return_id=$2 WHERE return_case_id=$1`,
          [id, managed.return_id],
        );
        await m.query(
          `INSERT INTO ret_execution_projections(return_case_id,tenant_id,proc_return_id,execution_status,payload) VALUES($1,$2,$3,'APPROVED',$4::jsonb) ON CONFLICT(return_case_id) DO UPDATE SET proc_return_id=EXCLUDED.proc_return_id,execution_status='APPROVED',payload=EXCLUDED.payload,updated_at=NOW()`,
          [id, row.tenant_id, managed.return_id, JSON.stringify(managed)],
        );
        await this.audit(
          m,
          row,
          'DECISION',
          d.decision_id,
          'RETURN_DISPOSITION_APPROVED',
          actor.user_id,
          null,
          { disposition: input.disposition, proc_return_id: managed.return_id },
        );
        const event = await this.emit(m, row, 'ReturnDispositionApproved.v1', {
          decision_id: d.decision_id,
          decision_hash: d.decision_hash,
          disposition: input.disposition,
          proc_return_id: managed.return_id,
          subject_allocations: allocations,
        });
        await this.emit(m, row, 'ProductReturnAuthorized.v1', {
          decision_id: d.decision_id,
          proc_return_id: managed.return_id,
        });
        if (input.disposition === 'REPAIR_REFERRAL')
          await this.emit(m, row, 'ServiceReferralRequested.v1', {
            decision_id: d.decision_id,
            subject_allocations: allocations,
          });
        if (input.disposition === 'REPLACEMENT_UNIT')
          await this.emit(m, row, 'ReplacementExpected.v1', {
            original_subject_ids: allocations.map((a: any) => a.subject_id),
          });
        return {
          workflow_status: 'APPROVED',
          disposition: input.disposition,
          decision: d,
          proc_return: managed,
          event,
          aggregate_revision: Number(row.aggregate_revision),
        };
      }),
    );
  }

  async rejectOrCancel(
    actor: ReturnActor,
    id: string,
    expected: number,
    key: string,
    input: { action: 'REJECT' | 'CANCEL'; reason: string },
  ) {
    const capability =
      input.action === 'REJECT' ? 'RETURNS_APPROVE' : 'RETURNS_INITIATE';
    await this.scopedCase(actor, id, capability);
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.revision(row, expected);
        if (row.active_decision_id)
          throw new ConflictException(
            'Approved cases must use reconsideration, not cancellation or rejection',
          );
        if (
          ['SHIPPED', 'DELIVERED', 'VENDOR_RECEIVED'].includes(
            row.shipment_status,
          )
        )
          throw new ConflictException(
            'Shipped cases require reconsideration and compensating transactions',
          );
        const allocations = await m.query(
          `SELECT * FROM ret_case_allocations WHERE return_case_id=$1 AND status='HELD' ORDER BY inventory_record_id FOR UPDATE`,
          [id],
        );
        for (const a of allocations) {
          await this.inventory.releaseReturnHold(m, {
            tenant_id: row.tenant_id,
            inventory_record_id: a.inventory_record_id,
            return_case_id: id,
            previous_lifecycle_status: a.previous_lifecycle_status,
            actor_id: actor.user_id,
            reason: input.reason,
          });
        }
        await m.query(
          `UPDATE ret_case_allocations SET status=$2,released_at=NOW() WHERE return_case_id=$1 AND status='HELD'`,
          [id, input.action === 'REJECT' ? 'RELEASED' : 'CANCELLED'],
        );
        const status = input.action === 'REJECT' ? 'REJECTED' : 'CANCELLED';
        await m.query(
          `UPDATE ret_cases SET workflow_status=$2,updated_at=NOW() WHERE return_case_id=$1`,
          [id, status],
        );
        await this.audit(
          m,
          row,
          'RETURN_CASE',
          id,
          `RETURN_${status}`,
          actor.user_id,
          { workflow_status: row.workflow_status },
          { workflow_status: status, reason: input.reason },
        );
        const event = await this.emit(m, row, 'ReturnHoldReleased.v1', {
          reason: input.reason,
          status,
        });
        return {
          workflow_status: status,
          event,
          aggregate_revision: Number(row.aggregate_revision),
        };
      }),
    );
  }

  async addCommunication(
    actor: ReturnActor,
    id: string,
    key: string,
    input: {
      vendor_id?: string;
      channel: string;
      direction: 'INBOUND' | 'OUTBOUND';
      sent_at: string;
      subject: string;
      content: string;
      vendor_reference?: string;
      response_status?: string;
    },
  ) {
    await this.scopedCase(actor, id, 'RETURNS_VENDOR_COORDINATE');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        const communicationId = randomUUID(),
          contentHash = returnHash(input.content);
        await m.query(
          `INSERT INTO ret_vendor_communications(communication_id,return_case_id,tenant_id,vendor_id,channel,direction,sent_at,sent_by,subject,content_hash,vendor_reference,response_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            communicationId,
            id,
            row.tenant_id,
            input.vendor_id ?? row.vendor_id,
            input.channel,
            input.direction,
            input.sent_at,
            actor.user_id,
            input.subject,
            contentHash,
            input.vendor_reference ?? null,
            input.response_status ?? null,
          ],
        );
        await this.audit(
          m,
          row,
          'VENDOR_COMMUNICATION',
          communicationId,
          'VENDOR_COMMUNICATION_RECORDED',
          actor.user_id,
          null,
          { ...input, content: undefined, content_hash: contentHash },
        );
        return { communication_id: communicationId, content_hash: contentHash };
      }),
    );
  }

  async transitionRma(
    actor: ReturnActor,
    id: string,
    expected: number,
    key: string,
    input: {
      status: 'REQUESTED' | 'ISSUED' | 'ACKNOWLEDGED' | 'CLOSED';
      vendor_reference?: string;
    },
  ) {
    await this.scopedCase(actor, id, 'RETURNS_VENDOR_COORDINATE');
    const allowed: any = {
      NOT_REQUIRED: ['REQUESTED'],
      REQUESTED: ['ISSUED'],
      ISSUED: ['ACKNOWLEDGED'],
      ACKNOWLEDGED: ['CLOSED'],
    };
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.revision(row, expected);
        if (!allowed[row.rma_status]?.includes(input.status))
          throw new ConflictException(
            `Cannot move RMA from ${row.rma_status} to ${input.status}`,
          );
        await m.query(
          `INSERT INTO ret_rma_history(return_case_id,tenant_id,previous_status,new_status,vendor_reference,actor_id) VALUES($1,$2,$3,$4,$5,$6)`,
          [
            id,
            row.tenant_id,
            row.rma_status,
            input.status,
            input.vendor_reference ?? null,
            actor.user_id,
          ],
        );
        await m.query(
          `UPDATE ret_cases SET rma_status=$2,updated_at=NOW() WHERE return_case_id=$1`,
          [id, input.status],
        );
        await this.audit(
          m,
          row,
          'RMA',
          id,
          'RMA_STATUS_CHANGED',
          actor.user_id,
          { status: row.rma_status },
          { status: input.status },
        );
        const event = await this.emit(m, row, 'ReturnRmaUpdated.v1', {
          previous_status: row.rma_status,
          status: input.status,
          vendor_reference: input.vendor_reference,
        });
        return {
          rma_status: input.status,
          event,
          aggregate_revision: Number(row.aggregate_revision),
        };
      }),
    );
  }

  async transitionShipment(
    actor: ReturnActor,
    id: string,
    expected: number,
    key: string,
    input: {
      status: 'READY' | 'SHIPPED' | 'DELIVERED' | 'VENDOR_RECEIVED';
      carrier?: string;
      tracking_reference?: string;
    },
  ) {
    await this.scopedCase(actor, id, 'RETURNS_SHIP');
    const allowed: any = {
      NOT_SHIPPED: ['READY', 'SHIPPED'],
      READY: ['SHIPPED'],
      SHIPPED: ['DELIVERED'],
      DELIVERED: ['VENDOR_RECEIVED'],
    };
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.revision(row, expected);
        if (
          !row.active_decision_id ||
          !['APPROVED', 'IN_EXECUTION', 'RESOLUTION_PENDING'].includes(
            row.workflow_status,
          )
        )
          throw new ConflictException('Current approved decision required');
        if (!allowed[row.shipment_status]?.includes(input.status))
          throw new ConflictException(
            `Cannot move shipment from ${row.shipment_status} to ${input.status}`,
          );
        const allocations = await m.query(
          `SELECT * FROM ret_case_allocations WHERE return_case_id=$1 AND status=CASE WHEN $2='SHIPPED' THEN 'HELD' ELSE status END ORDER BY inventory_record_id FOR UPDATE`,
          [id, input.status],
        );
        if (input.status === 'SHIPPED') {
          for (const a of allocations)
            await this.inventory.shipReturnAllocation(m, {
              tenant_id: row.tenant_id,
              inventory_record_id: a.inventory_record_id,
              return_case_id: id,
              quantity: Number(a.quantity),
              actor_id: actor.user_id,
              idempotency_key: `${key}:${a.return_allocation_id}`,
            });
          await m.query(
            `UPDATE ret_case_allocations SET status='SHIPPED',shipped_at=NOW() WHERE return_case_id=$1 AND status='HELD'`,
            [id],
          );
          await this.procurements.transitionModule7Return(
            m,
            actor,
            id,
            row.active_decision_id,
            'SHIPPED',
          );
        }
        if (input.status === 'VENDOR_RECEIVED')
          await this.procurements.transitionModule7Return(
            m,
            actor,
            id,
            row.active_decision_id,
            'VENDOR_RECEIVED',
          );
        await m.query(
          `INSERT INTO ret_shipment_history(return_case_id,tenant_id,previous_status,new_status,carrier,tracking_reference,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [
            id,
            row.tenant_id,
            row.shipment_status,
            input.status,
            input.carrier ?? null,
            input.tracking_reference ?? null,
            actor.user_id,
          ],
        );
        const workflow =
          input.status === 'VENDOR_RECEIVED'
            ? 'RESOLUTION_PENDING'
            : 'IN_EXECUTION';
        await m.query(
          `UPDATE ret_cases SET shipment_status=$2,workflow_status=$3,updated_at=NOW() WHERE return_case_id=$1`,
          [id, input.status, workflow],
        );
        await this.audit(
          m,
          row,
          'SHIPMENT',
          id,
          'RETURN_SHIPMENT_CHANGED',
          actor.user_id,
          { status: row.shipment_status },
          { status: input.status },
        );
        const event = await this.emit(m, row, 'ReturnShipmentRecorded.v1', {
          previous_status: row.shipment_status,
          status: input.status,
          carrier: input.carrier,
          tracking_reference: input.tracking_reference,
          subject_allocations: allocations.map((a: any) => ({
            subject_id: a.subject_id,
            inventory_record_id: a.inventory_record_id,
            quantity: Number(a.quantity),
          })),
        });
        return {
          shipment_status: input.status,
          workflow_status: workflow,
          event,
          aggregate_revision: Number(row.aggregate_revision),
        };
      }),
    );
  }

  async reconsider(
    actor: ReturnActor,
    id: string,
    expected: number,
    key: string,
    input: { reason: string },
  ) {
    await this.scopedCase(actor, id, 'RETURNS_RECONSIDER');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.revision(row, expected);
        if (!row.active_decision_id)
          throw new ConflictException('No active decision to reconsider');
        const prior = (
          await m.query(`SELECT * FROM ret_decisions WHERE decision_id=$1`, [
            row.active_decision_id,
          ])
        )[0];
        const d = await this.decision(
          m,
          row,
          'RECONSIDERATION',
          'SUPERSEDED',
          input.reason,
          actor.user_id,
          row.eligibility_snapshot_hash,
          row.active_decision_id,
        );
        const executed =
          ['SHIPPED', 'DELIVERED', 'VENDOR_RECEIVED'].includes(
            row.shipment_status,
          ) ||
          (
            await m.query(
              `SELECT 1 FROM ret_financial_projections WHERE return_case_id=$1 LIMIT 1`,
              [id],
            )
          )[0];
        const status = executed ? 'DISPUTED' : 'SUPERSEDED';
        await m.query(
          `UPDATE ret_cases SET workflow_status=$2,active_decision_id=$3,updated_at=NOW() WHERE return_case_id=$1`,
          [id, status, d.decision_id],
        );
        await this.audit(
          m,
          row,
          'DECISION',
          d.decision_id,
          'RETURN_CASE_SUPERSEDED',
          actor.user_id,
          { decision_id: prior.decision_id },
          { decision_id: d.decision_id, status },
        );
        const event = await this.emit(m, row, 'ReturnCaseSuperseded.v1', {
          superseded_decision_id: prior.decision_id,
          superseding_decision_id: d.decision_id,
          decision_hash: d.decision_hash,
          workflow_status: status,
          requires_compensation: Boolean(executed),
        });
        return {
          workflow_status: status,
          decision: d,
          event,
          aggregate_revision: Number(row.aggregate_revision),
        };
      }),
    );
  }

  async resolve(
    actor: ReturnActor,
    id: string,
    expected: number,
    key: string,
    input: {
      reason: string;
      resulting_subject_id?: string;
      resulting_inventory_record_id?: string;
    },
  ) {
    await this.scopedCase(actor, id, 'RETURNS_APPROVE');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.revision(row, expected);
        if (
          row.shipment_status !== 'VENDOR_RECEIVED' &&
          row.disposition !== 'NO_ACTION'
        )
          throw new ConflictException(
            'Vendor receipt required before resolution',
          );
        if (
          row.disposition === 'REPAIR_REFERRAL' &&
          !(
            await m.query(
              `SELECT 1 FROM ret_lineage WHERE return_case_id=$1 LIMIT 1`,
              [id],
            )
          )[0]
        )
          throw new ConflictException('Module 8 outcome is required');
        await this.procurements.transitionModule7Return(
          m,
          actor,
          id,
          row.active_decision_id,
          'RESOLVED',
        );
        const allocations = await m.query(
          `SELECT * FROM ret_case_allocations WHERE return_case_id=$1`,
          [id],
        );
        if (['REPAIR_RETURN', 'REPLACEMENT_UNIT'].includes(row.disposition)) {
          for (const a of allocations)
            await m.query(
              `INSERT INTO ret_lineage(return_case_id,tenant_id,lineage_type,original_subject_id,resulting_subject_id,original_inventory_record_id,resulting_inventory_record_id) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(return_case_id,original_subject_id) DO NOTHING`,
              [
                id,
                row.tenant_id,
                row.disposition,
                a.subject_id,
                input.resulting_subject_id ?? null,
                a.inventory_record_id,
                input.resulting_inventory_record_id ?? null,
              ],
            );
        }
        await m.query(
          `UPDATE ret_case_allocations SET status='RESOLVED' WHERE return_case_id=$1 AND status='SHIPPED'`,
          [id],
        );
        await m.query(
          `UPDATE ret_cases SET workflow_status='CLOSED',rma_status=CASE WHEN rma_status='NOT_REQUIRED' THEN rma_status ELSE 'CLOSED' END,updated_at=NOW() WHERE return_case_id=$1`,
          [id],
        );
        await this.audit(
          m,
          row,
          'RETURN_CASE',
          id,
          'RETURN_CASE_RESOLVED',
          actor.user_id,
          { workflow_status: row.workflow_status },
          { workflow_status: 'CLOSED', reason: input.reason },
        );
        const event = await this.emit(m, row, 'ReturnCaseResolved.v1', {
          disposition: row.disposition,
          proc_return_id: row.proc_return_id,
          lineage: {
            resulting_subject_id: input.resulting_subject_id,
            resulting_inventory_record_id: input.resulting_inventory_record_id,
          },
        });
        return {
          workflow_status: 'CLOSED',
          event,
          aggregate_revision: Number(row.aggregate_revision),
        };
      }),
    );
  }

  async registerEvidence(
    actor: ReturnActor,
    id: string,
    key: string,
    input: {
      evidence_type: string;
      object_key: string;
      content_hash: string;
      mime_type: string;
      byte_size: number;
      retention_class?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    await this.scopedCase(actor, id, 'RETURNS_INITIATE');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        const evidenceId = randomUUID();
        await m.query(
          `INSERT INTO ret_evidence(evidence_id,return_case_id,tenant_id,evidence_type,object_key,content_hash,mime_type,byte_size,retention_class,metadata,captured_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,
          [
            evidenceId,
            id,
            row.tenant_id,
            input.evidence_type,
            input.object_key,
            input.content_hash,
            input.mime_type,
            input.byte_size,
            input.retention_class ?? 'PROCUREMENT',
            JSON.stringify(input.metadata ?? {}),
            actor.user_id,
          ],
        );
        await this.audit(
          m,
          row,
          'EVIDENCE',
          evidenceId,
          'RETURN_EVIDENCE_ADDED',
          actor.user_id,
          null,
          {
            evidence_type: input.evidence_type,
            content_hash: input.content_hash,
          },
        );
        return { evidence_id: evidenceId, content_hash: input.content_hash };
      }),
    );
  }
}
