/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call -- TypeORM query() rows are untyped */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import type { EntityManager } from 'typeorm';
import { DataSource } from 'typeorm';
import type {
  CreateInvoiceInput,
  CreateOrderInput,
  CreateReceiptInput,
  CreateReturnInput,
  CreateServiceAcceptanceInput,
  DownstreamStatusInput,
  Module7ReturnCommand,
  ProcurementActor,
  ProcurementMatchPolicy,
} from './procurement.types';
import {
  hash,
  lineTotal,
  minorUnits,
  money,
  moveBuckets,
  quantityUnits,
  withinTolerance,
} from './procurement.util';

const DEFAULT_TENANT = 'a0000000-0000-4000-8000-000000000001';
const CASE_STATUSES_OPEN = ['ACTIVE', 'ON_HOLD', 'READY_TO_FINALIZE'];

type CaseRow = Record<string, any> & {
  proc_case_id: string;
  tenant_id: string;
  acquisition_id: string;
  acquisition_version_id: string;
  budget_reservation_id: string;
  requester_id: string;
  department_id?: number | null;
  currency: string;
  approved_allocation: string | number;
  available_amount: string | number;
  committed_amount: string | number;
  expended_amount: string | number;
  released_amount: string | number;
  aggregate_revision: string | number;
  next_event_sequence: string | number;
  status: string;
};

@Injectable()
export class ProcurementService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  private tenant(actor: ProcurementActor) {
    return actor.tenant_id ?? DEFAULT_TENANT;
  }

  private roles(actor: ProcurementActor) {
    return [
      ...new Set([...(actor.roles ?? []), ...(actor.role ? [actor.role] : [])]),
    ].map((role) => role.toLowerCase());
  }

  private async grants(actor: ProcurementActor, capability: string) {
    return this.db.query(
      `SELECT scope_type, scope_reference FROM acq_access_grants
       WHERE tenant_id=$1 AND capability=$2
         AND valid_from <= NOW() AND (valid_until IS NULL OR valid_until > NOW())
         AND (principal_user_id=$3::uuid OR lower(principal_role)=ANY($4::text[]))`,
      [this.tenant(actor), capability, actor.user_id, this.roles(actor)],
    );
  }

  private async requireCapability(
    actor: ProcurementActor,
    capability: string,
    departmentId?: number | null,
  ) {
    const grants = await this.grants(actor, capability);
    const allowed = grants.some(
      (grant: Record<string, any>) =>
        grant.scope_type === 'TENANT' ||
        (grant.scope_type === 'DEPARTMENT' &&
          departmentId != null &&
          String(departmentId) === String(grant.scope_reference)),
    );
    if (!allowed) {
      throw new ForbiddenException({
        message: `Missing scoped capability ${capability}`,
        code: 'PROCUREMENT_CAPABILITY_REQUIRED',
      });
    }
  }

  private async accessibleCase(
    actor: ProcurementActor,
    caseId: string,
    capability = 'PROCUREMENT_VIEW',
  ): Promise<CaseRow> {
    const grants = await this.grants(actor, capability);
    const tenantWide = grants.some(
      (grant: Record<string, any>) => grant.scope_type === 'TENANT',
    );
    const departments = grants
      .filter((grant: Record<string, any>) => grant.scope_type === 'DEPARTMENT')
      .map((grant: Record<string, any>) => Number(grant.scope_reference))
      .filter(Number.isInteger);
    const rows = await this.db.query(
      `SELECT * FROM proc_cases
       WHERE proc_case_id=$1 AND tenant_id=$2
         AND ($3::boolean OR department_id=ANY($4::int[]) OR requester_id=$5::uuid)`,
      [caseId, this.tenant(actor), tenantWide, departments, actor.user_id],
    );
    if (!rows[0]) throw new NotFoundException('Procurement case not found');
    if (capability !== 'PROCUREMENT_VIEW') {
      await this.requireCapability(actor, capability, rows[0].department_id);
    }
    return rows[0] as CaseRow;
  }

  authorizeImport(actor: ProcurementActor, caseId: string) {
    return this.accessibleCase(actor, caseId, 'PROCUREMENT_IMPORT_ADMIN');
  }

  authorizeInvoiceEntry(actor: ProcurementActor, caseId: string) {
    return this.accessibleCase(actor, caseId, 'PROCUREMENT_INVOICE_ENTRY');
  }

  authorizeReceiptEntry(actor: ProcurementActor, caseId: string) {
    return this.accessibleCase(actor, caseId, 'PROCUREMENT_RECEIPT_ENTRY');
  }

  async authorizeProductEvidence(actor: ProcurementActor, caseId: string) {
    const row = await this.accessibleCase(actor, caseId);
    if (String(row.requester_id) !== actor.user_id) {
      await this.requireCapability(
        actor,
        'PROCUREMENT_RECEIPT_ENTRY',
        row.department_id,
      );
    }
    return row;
  }

  authorizeView(actor: ProcurementActor, caseId: string) {
    return this.accessibleCase(actor, caseId);
  }

  private assertRevision(row: CaseRow, expected: number) {
    if (!Number.isInteger(expected) || expected <= 0) {
      throw new BadRequestException('If-Match aggregate revision is required');
    }
    if (Number(row.aggregate_revision) !== expected) {
      throw new ConflictException({
        message: 'Procurement case was changed by another user',
        code: 'STALE_AGGREGATE_REVISION',
        current_revision: Number(row.aggregate_revision),
      });
    }
  }

  private assertOpen(row: CaseRow) {
    if (!CASE_STATUSES_OPEN.includes(row.status)) {
      throw new ConflictException(`Procurement case is ${row.status}`);
    }
  }

  private async lockedCase(
    manager: EntityManager,
    caseId: string,
    tenantId: string,
  ) {
    const rows = await manager.query(
      `SELECT * FROM proc_cases WHERE proc_case_id=$1 AND tenant_id=$2 FOR UPDATE`,
      [caseId, tenantId],
    );
    if (!rows[0]) throw new NotFoundException('Procurement case not found');
    return rows[0] as CaseRow;
  }

  private bucketColumn(
    bucket: 'AVAILABLE' | 'COMMITTED' | 'EXPENDED' | 'RELEASED',
  ) {
    return {
      AVAILABLE: 'available_amount',
      COMMITTED: 'committed_amount',
      EXPENDED: 'expended_amount',
      RELEASED: 'released_amount',
    }[bucket];
  }

  private async moveFunds(
    manager: EntityManager,
    row: CaseRow,
    input: {
      entryType: string;
      from: 'AVAILABLE' | 'COMMITTED' | 'EXPENDED' | null;
      to: 'AVAILABLE' | 'COMMITTED' | 'EXPENDED' | 'RELEASED';
      amount: unknown;
      sourceType: string;
      sourceId: string;
      idempotencyKey: string;
      actorId: string | null;
    },
  ) {
    const amount = money(input.amount);
    if (amount <= 0)
      throw new BadRequestException('Financial movement must be positive');
    let moved: ReturnType<typeof moveBuckets> | null = null;
    if (input.from) {
      const available = money(row[this.bucketColumn(input.from)]);
      try {
        moved = moveBuckets(
          {
            AVAILABLE: row.available_amount,
            COMMITTED: row.committed_amount,
            EXPENDED: row.expended_amount,
            RELEASED: row.released_amount,
          },
          input.from,
          input.to,
          amount,
        );
      } catch {
        throw new ConflictException({
          message: `Insufficient ${input.from.toLowerCase()} balance`,
          code: 'PROCUREMENT_BUCKET_INSUFFICIENT',
          bucket: input.from,
          available,
          requested: amount,
        });
      }
    }
    const previous = await manager.query(
      `SELECT entry_hash FROM proc_financial_ledger
       WHERE proc_case_id=$1 ORDER BY created_at DESC, ledger_entry_id DESC LIMIT 1`,
      [row.proc_case_id],
    );
    const previousHash = previous[0]?.entry_hash ?? null;
    const revision = Number(row.aggregate_revision) + 1;
    const entryHash = hash({
      proc_case_id: row.proc_case_id,
      entry_type: input.entryType,
      from_bucket: input.from,
      to_bucket: input.to,
      amount,
      source_type: input.sourceType,
      source_id: input.sourceId,
      idempotency_key: input.idempotencyKey,
      previous_entry_hash: previousHash,
      revision,
    });
    const fromColumn = input.from ? this.bucketColumn(input.from) : null;
    const toColumn = this.bucketColumn(input.to);
    if (fromColumn) {
      await manager.query(
        `UPDATE proc_cases SET ${fromColumn}=${fromColumn}-$2, ${toColumn}=${toColumn}+$2,
           updated_at=NOW(), last_activity_at=NOW()
         WHERE proc_case_id=$1`,
        [row.proc_case_id, amount],
      );
      row.available_amount = moved?.AVAILABLE ?? row.available_amount;
      row.committed_amount = moved?.COMMITTED ?? row.committed_amount;
      row.expended_amount = moved?.EXPENDED ?? row.expended_amount;
      row.released_amount = moved?.RELEASED ?? row.released_amount;
    } else {
      await manager.query(
        `UPDATE proc_cases SET ${toColumn}=${toColumn}+$2, updated_at=NOW(), last_activity_at=NOW()
         WHERE proc_case_id=$1`,
        [row.proc_case_id, amount],
      );
    }
    if (!input.from) row[toColumn] = money(row[toColumn]) + amount;
    await manager.query(
      `INSERT INTO proc_financial_ledger
         (proc_case_id,tenant_id,entry_type,from_bucket,to_bucket,amount,currency,
          source_type,source_id,idempotency_key,actor_user_id,case_revision,
          previous_entry_hash,entry_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        row.proc_case_id,
        row.tenant_id,
        input.entryType,
        input.from,
        input.to,
        amount,
        row.currency,
        input.sourceType,
        input.sourceId,
        input.idempotencyKey,
        input.actorId,
        revision,
        previousHash,
        entryHash,
      ],
    );
  }

  private async audit(
    manager: EntityManager,
    row: CaseRow,
    entityType: string,
    entityId: string,
    eventType: string,
    actorId: string | null,
    previousValues: unknown,
    newValues: unknown,
    requestId?: string,
  ) {
    const previous = await manager.query(
      `SELECT event_hash FROM proc_audit_events
       WHERE proc_case_id=$1 ORDER BY created_at DESC, audit_event_id DESC LIMIT 1`,
      [row.proc_case_id],
    );
    const previousHash = previous[0]?.event_hash ?? null;
    const eventHash = hash({
      proc_case_id: row.proc_case_id,
      entityType,
      entityId,
      eventType,
      actorId,
      previousValues,
      newValues,
      revision: Number(row.aggregate_revision) + 1,
      previousHash,
    });
    await manager.query(
      `INSERT INTO proc_audit_events
         (proc_case_id,tenant_id,entity_type,entity_id,event_type,actor_user_id,
          previous_values,new_values,entity_revision,request_id,previous_event_hash,event_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12)`,
      [
        row.proc_case_id,
        row.tenant_id,
        entityType,
        entityId,
        eventType,
        actorId,
        previousValues == null ? null : JSON.stringify(previousValues),
        newValues == null ? null : JSON.stringify(newValues),
        Number(row.aggregate_revision) + 1,
        requestId ?? null,
        previousHash,
        eventHash,
      ],
    );
  }

  private async emit(
    manager: EntityManager,
    row: CaseRow,
    eventType: string,
    aggregateId: string,
    payload: Record<string, unknown>,
  ) {
    const eventId = randomUUID();
    const revision = Number(row.aggregate_revision) + 1;
    const sequence = Number(row.next_event_sequence);
    const occurredAt = new Date().toISOString();
    const envelope = {
      event_id: eventId,
      event_type: eventType,
      event_version: 1,
      aggregate_id: aggregateId,
      aggregate_revision: revision,
      aggregate_sequence: sequence,
      tenant_id: row.tenant_id,
      proc_case_id: row.proc_case_id,
      acquisition_id: row.acquisition_id,
      acquisition_version_id: row.acquisition_version_id,
      occurred_at: occurredAt,
      ...payload,
    };
    await manager.query(
      `INSERT INTO proc_outbox_events
         (event_id,tenant_id,proc_case_id,aggregate_id,aggregate_revision,
          aggregate_sequence,event_type,event_version,occurred_at,payload,payload_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,1,$8,$9::jsonb,$10)`,
      [
        eventId,
        row.tenant_id,
        row.proc_case_id,
        aggregateId,
        revision,
        sequence,
        eventType,
        occurredAt,
        JSON.stringify(envelope),
        hash(envelope),
      ],
    );
    await manager.query(
      `UPDATE proc_cases SET aggregate_revision=$2,next_event_sequence=$3,
         updated_at=NOW(),last_activity_at=NOW() WHERE proc_case_id=$1`,
      [row.proc_case_id, revision, sequence + 1],
    );
    row.aggregate_revision = revision;
    row.next_event_sequence = sequence + 1;
    return envelope;
  }

  private async fundingSource(manager: EntityManager, row: CaseRow) {
    const reservations = await manager.query(
      `SELECT funding_source_type,funding_source_id FROM acq_budget_reservations
       WHERE budget_reservation_id=$1 AND tenant_id=$2`,
      [row.budget_reservation_id, row.tenant_id],
    );
    if (!reservations[0])
      throw new ConflictException('Budget reservation not found');
    const mapping: Record<string, { table: string; id: string }> = {
      DEPARTMENT: { table: 'fin_dept_budgets', id: 'budget_id' },
      PROGRAM: { table: 'fin_program_budgets', id: 'program_id' },
      RESEARCH_GRANT: { table: 'research_grants', id: 'grant_id' },
      INSTITUTIONAL: {
        table: 'fin_university_budgets',
        id: 'university_budget_id',
      },
      PROJECT: { table: 'acq_funding_sources', id: 'funding_source_id' },
      OTHER: { table: 'acq_funding_sources', id: 'funding_source_id' },
    };
    const target = mapping[String(reservations[0].funding_source_type)];
    if (!target) throw new ConflictException('Unsupported funding source');
    return { ...target, sourceId: reservations[0].funding_source_id };
  }

  private async featureEnabled(
    manager: EntityManager,
    tenantId: string,
    featureKey: string,
  ) {
    const rows = await manager.query(
      `SELECT 1 FROM tenant_subscriptions
       WHERE tenant_id=$1 AND feature_key=$2
         AND is_enabled=true AND (expires_at IS NULL OR expires_at>=NOW())`,
      [tenantId, featureKey],
    );
    return Boolean(rows[0]);
  }

  async consumeApprovedEvent(eventId: string) {
    return this.db.transaction(async (manager) => {
      const existing = await manager.query(
        `SELECT * FROM proc_cases WHERE source_event_id=$1`,
        [eventId],
      );
      if (existing[0]) return existing[0];
      const events = await manager.query(
        `SELECT * FROM acq_outbox_events WHERE event_id=$1 AND event_type='AcquisitionApproved.v1' FOR UPDATE`,
        [eventId],
      );
      const event = events[0];
      if (!event)
        throw new NotFoundException('Approved acquisition event not found');
      const payload = event.payload as Record<string, any>;
      const canonicalHash = hash(payload);
      const legacyHash = createHash('sha256')
        .update(JSON.stringify(payload))
        .digest('hex');
      if (
        event.payload_hash !== canonicalHash &&
        event.payload_hash !== legacyHash
      ) {
        throw new BadRequestException({
          message: 'Acquisition event hash is invalid',
          code: 'EVENT_HASH_INVALID',
        });
      }
      if (
        !payload.snapshot_hash ||
        !payload.budget_reservation?.budget_reservation_id
      ) {
        throw new BadRequestException(
          'Approved acquisition contract is incomplete',
        );
      }
      const amount = money(payload.approved_amount);
      const cases = await manager.query(
        `INSERT INTO proc_cases
           (tenant_id,acquisition_id,acquisition_version_id,acquisition_snapshot_hash,
            budget_reservation_id,source_event_id,requester_id,department_id,currency,
            approved_allocation,available_amount,allocated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11) RETURNING *`,
        [
          event.tenant_id,
          payload.acquisition_id,
          payload.acquisition_version_id,
          payload.snapshot_hash,
          payload.budget_reservation.budget_reservation_id,
          eventId,
          payload.requester,
          payload.department,
          String(payload.currency).toUpperCase(),
          amount,
          payload.approved_at,
        ],
      );
      const row = cases[0] as CaseRow;
      for (const [index, line] of (
        payload.lines as Array<Record<string, any>>
      ).entries()) {
        const quantity = Number(line.quantity);
        const approvedAmount = money(line.estimated_cost);
        const classification = String(
          line.asset_classification ?? 'ASSET',
        ).toUpperCase();
        await manager.query(
          `INSERT INTO proc_case_lines
             (proc_case_id,tenant_id,acquisition_line_id,line_number,product_name,category,
              approved_quantity,unit,approved_vendor_id,approved_unit_price,approved_line_amount,
              currency,fulfillment_type,requires_physical_verification,
              requires_asset_identity,requires_inventory_ingestion)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [
            row.proc_case_id,
            row.tenant_id,
            line.line_id,
            index + 1,
            line.product,
            line.category,
            quantity,
            line.unit,
            line.selected_vendor,
            line.estimated_unit_price ?? approvedAmount / quantity,
            approvedAmount,
            row.currency,
            classification,
            classification === 'ASSET',
            classification === 'ASSET',
            classification !== 'SERVICE',
          ],
        );
      }
      const entryHash = hash({
        proc_case_id: row.proc_case_id,
        type: 'ALLOCATION_ESTABLISHED',
        amount,
        eventId,
      });
      await manager.query(
        `INSERT INTO proc_financial_ledger
           (proc_case_id,tenant_id,entry_type,from_bucket,to_bucket,amount,currency,
            source_type,source_id,idempotency_key,case_revision,entry_hash)
         VALUES ($1,$2,'ALLOCATION_ESTABLISHED',NULL,'AVAILABLE',$3,$4,
                 'ACQUISITION_EVENT',$5,$6,1,$7)`,
        [
          row.proc_case_id,
          row.tenant_id,
          amount,
          row.currency,
          eventId,
          `acquisition:${eventId}`,
          entryHash,
        ],
      );
      await this.audit(
        manager,
        row,
        'PROC_CASE',
        row.proc_case_id,
        'PROCUREMENT_CASE_CREATED',
        null,
        null,
        { source_event_id: eventId, approved_allocation: amount },
      );
      return row;
    });
  }

  async applyIntegrityDecision(eventId: string) {
    return this.db.transaction(async (manager) => {
      const prior = await manager.query(
        `SELECT * FROM proc_integrity_event_consumption WHERE event_id=$1`,
        [eventId],
      );
      if (prior[0]) return prior[0];
      const events = await manager.query(
        `SELECT * FROM inv_integrity_outbox_events
         WHERE event_id=$1 AND event_type IN ('InvoiceIntegrityCleared.v1','InvoiceIntegrityRejected.v1')
         FOR UPDATE`,
        [eventId],
      );
      const event = events[0];
      if (!event)
        throw new NotFoundException('Integrity decision event not found');
      if (hash(event.payload) !== event.payload_hash)
        throw new ConflictException({
          message: 'Integrity event hash mismatch',
          code: 'EVENT_HASH_MISMATCH',
        });
      const envelope = event.payload as Record<string, any>;
      const decision = envelope.payload as Record<string, any>;
      const invoices = await manager.query(
        `SELECT * FROM proc_invoices WHERE invoice_id=$1 AND tenant_id=$2 FOR UPDATE`,
        [event.invoice_id, event.tenant_id],
      );
      const invoice = invoices[0];
      if (!invoice) throw new NotFoundException('Invoice not found');
      const row = await this.lockedCase(
        manager,
        invoice.proc_case_id,
        event.tenant_id,
      );
      if (
        Number(event.invoice_revision) !== Number(invoice.revision) ||
        decision.document_hash !== invoice.document_hash
      )
        throw new ConflictException({
          message: 'Integrity decision is stale',
          code: 'STALE_INTEGRITY_DECISION',
        });
      const certifications = await manager.query(
        `SELECT * FROM inv_certifications
         WHERE integrity_decision_id=$1 AND integrity_case_id=$2 AND decision_hash=$3`,
        [
          decision.integrity_decision_id,
          event.integrity_case_id,
          decision.decision_hash,
        ],
      );
      if (!certifications[0])
        throw new ConflictException('Integrity certification is invalid');
      const cleared = ['CLEARED_AUTOMATED', 'CLEARED_HUMAN'].includes(
        decision.decision,
      );
      const matches = await manager.query(
        `SELECT * FROM proc_match_results WHERE invoice_id=$1 ORDER BY created_at DESC LIMIT 1`,
        [invoice.invoice_id],
      );
      const blockers = await manager.query(
        `SELECT b.blocker_id FROM inv_integrity_blockers b
         LEFT JOIN inv_integrity_blocker_resolutions r
           ON r.blocker_id=b.blocker_id AND r.integrity_decision_id=$2
         WHERE b.integrity_case_id=$1 AND r.blocker_resolution_id IS NULL LIMIT 1`,
        [event.integrity_case_id, decision.integrity_decision_id],
      );
      const paymentEligible =
        cleared && matches[0]?.status === 'MATCHED' && blockers.length === 0;
      await manager.query(
        `UPDATE proc_invoice_integrity_projections SET superseded_at=NOW(),payment_eligible=false
         WHERE invoice_id=$1 AND integrity_decision_id<>$2`,
        [invoice.invoice_id, decision.integrity_decision_id],
      );
      await manager.query(
        `INSERT INTO proc_invoice_integrity_projections
           (invoice_id,tenant_id,integrity_case_id,integrity_decision_id,invoice_revision,
            document_hash,final_decision,trust_level,policy_version,evidence_set_hash,
            decision_hash,cleared_at,superseded_at,payment_eligible,applied_source_event_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
                 CASE WHEN $12 THEN NOW() ELSE NULL END,NULL,$13,$14)
         ON CONFLICT (invoice_id) DO UPDATE SET
           integrity_case_id=EXCLUDED.integrity_case_id,
           integrity_decision_id=EXCLUDED.integrity_decision_id,
           invoice_revision=EXCLUDED.invoice_revision,
           document_hash=EXCLUDED.document_hash,
           final_decision=EXCLUDED.final_decision,
           trust_level=EXCLUDED.trust_level,
           policy_version=EXCLUDED.policy_version,
           evidence_set_hash=EXCLUDED.evidence_set_hash,
           decision_hash=EXCLUDED.decision_hash,
           cleared_at=EXCLUDED.cleared_at,
           superseded_at=NULL,
           payment_eligible=EXCLUDED.payment_eligible,
           applied_source_event_id=EXCLUDED.applied_source_event_id,
           updated_at=NOW()`,
        [
          invoice.invoice_id,
          event.tenant_id,
          event.integrity_case_id,
          decision.integrity_decision_id,
          invoice.revision,
          invoice.document_hash,
          decision.decision,
          decision.trust_level,
          decision.policy_version,
          decision.evidence_set_hash,
          decision.decision_hash,
          cleared,
          paymentEligible,
          eventId,
        ],
      );
      if (!cleared) {
        await manager.query(
          `UPDATE proc_invoices SET status='DISPUTED',integrity_status='REJECTED',updated_at=NOW()
           WHERE invoice_id=$1`,
          [invoice.invoice_id],
        );
        await this.audit(
          manager,
          row,
          'INVOICE',
          invoice.invoice_id,
          'INVOICE_INTEGRITY_REJECTED',
          null,
          {
            integrity_status: invoice.integrity_status,
          },
          {
            integrity_status: 'REJECTED',
            integrity_decision_id: decision.integrity_decision_id,
          },
        );
        await manager.query(
          `UPDATE proc_cases SET aggregate_revision=aggregate_revision+1,updated_at=NOW(),last_activity_at=NOW()
           WHERE proc_case_id=$1`,
          [row.proc_case_id],
        );
        await manager.query(
          `INSERT INTO proc_integrity_event_consumption (event_id,tenant_id,invoice_id,event_type)
           VALUES ($1,$2,$3,$4) ON CONFLICT (event_id) DO NOTHING`,
          [eventId, event.tenant_id, invoice.invoice_id, event.event_type],
        );
        return {
          invoice_id: invoice.invoice_id,
          payment_eligible: false,
          status: 'DISPUTED',
        };
      }
      if (!paymentEligible)
        throw new ConflictException(
          'Integrity cleared but current three-way match/blocker gate failed',
        );
      let legacyInvoiceId = invoice.legacy_invoice_id as string | null;
      if (!legacyInvoiceId) {
        const legacy = await manager.query(
          `INSERT INTO fin_vendor_invoices
             (tenant_id,vendor_id,invoice_number,invoice_date,taxable_amount,gst_amount,tds_amount,
              total_amount,net_payable,status,po_id,proc_invoice_id,source_system)
           VALUES ($1,$2,$3,$4,$5,$6,0,$7,$7,'APPROVED',$8,$9,'MODULE2') RETURNING invoice_id`,
          [
            row.tenant_id,
            invoice.vendor_id,
            invoice.invoice_number,
            invoice.invoice_date,
            invoice.taxable_amount,
            invoice.tax_amount,
            invoice.total_amount,
            (
              await manager.query(
                `SELECT legacy_po_id FROM proc_orders WHERE order_id=$1`,
                [invoice.order_id],
              )
            )[0]?.legacy_po_id ?? null,
            invoice.invoice_id,
          ],
        );
        legacyInvoiceId = legacy[0].invoice_id;
      }
      await manager.query(
        `UPDATE proc_invoices SET status='VERIFIED',integrity_status='CLEARED',legacy_invoice_id=$2,
         updated_at=NOW() WHERE invoice_id=$1`,
        [invoice.invoice_id, legacyInvoiceId],
      );
      await this.audit(
        manager,
        row,
        'INVOICE',
        invoice.invoice_id,
        'INVOICE_PAYMENT_ELIGIBLE',
        null,
        null,
        {
          integrity_decision_id: decision.integrity_decision_id,
          match_result_id: matches[0].match_result_id,
          invoice_revision: invoice.revision,
          document_hash: invoice.document_hash,
        },
      );
      const paymentEvent = await this.emit(
        manager,
        row,
        'ProcurementInvoicePaymentEligible.v1',
        invoice.invoice_id,
        {
          invoice_id: invoice.invoice_id,
          invoice_revision: Number(invoice.revision),
          document_hash: invoice.document_hash,
          three_way_match_status: matches[0].status,
          integrity_decision: decision.decision,
          trust_level: decision.trust_level,
          payment_eligibility: true,
          integrity_decision_id: decision.integrity_decision_id,
        },
      );
      await manager.query(
        `INSERT INTO proc_integrity_event_consumption (event_id,tenant_id,invoice_id,event_type)
         VALUES ($1,$2,$3,$4) ON CONFLICT (event_id) DO NOTHING`,
        [eventId, event.tenant_id, invoice.invoice_id, event.event_type],
      );
      return {
        invoice_id: invoice.invoice_id,
        status: 'VERIFIED',
        integrity_status: 'CLEARED',
        payment_eligible: true,
        event: paymentEvent,
      };
    });
  }

  async invalidateIntegrityClearance(eventId: string) {
    return this.db.transaction(async (manager) => {
      const prior = await manager.query(
        `SELECT * FROM proc_integrity_event_consumption WHERE event_id=$1`,
        [eventId],
      );
      if (prior[0]) return prior[0];
      const events = await manager.query(
        `SELECT * FROM inv_integrity_outbox_events
         WHERE event_id=$1 AND event_type='InvoiceIntegrityReconsiderationOpened.v1' FOR UPDATE`,
        [eventId],
      );
      const event = events[0];
      if (!event || hash(event.payload) !== event.payload_hash)
        throw new ConflictException(
          'Integrity reconsideration event is invalid',
        );
      const envelope = event.payload as Record<string, any>;
      const payload = envelope.payload as Record<string, any>;
      const invoices = await manager.query(
        `SELECT * FROM proc_invoices WHERE invoice_id=$1 AND tenant_id=$2 FOR UPDATE`,
        [event.invoice_id, event.tenant_id],
      );
      const invoice = invoices[0];
      if (
        !invoice ||
        Number(invoice.revision) !== Number(event.invoice_revision) ||
        invoice.document_hash !== payload.document_hash
      )
        throw new ConflictException('Integrity reconsideration is stale');
      await manager.query(
        `UPDATE proc_invoice_integrity_projections SET payment_eligible=false,superseded_at=NOW(),updated_at=NOW()
         WHERE invoice_id=$1`,
        [invoice.invoice_id],
      );
      await manager.query(
        `UPDATE proc_invoices SET integrity_status='PENDING',
         status=CASE WHEN status='VERIFIED' THEN 'INTEGRITY_REVIEW' ELSE status END,updated_at=NOW()
         WHERE invoice_id=$1`,
        [invoice.invoice_id],
      );
      await manager.query(
        `INSERT INTO proc_integrity_event_consumption (event_id,tenant_id,invoice_id,event_type)
         VALUES ($1,$2,$3,$4)`,
        [eventId, event.tenant_id, invoice.invoice_id, event.event_type],
      );
      return { invoice_id: invoice.invoice_id, payment_eligible: false };
    });
  }

  async list(actor: ProcurementActor, status?: string) {
    const grants = await this.grants(actor, 'PROCUREMENT_VIEW');
    const tenantWide = grants.some(
      (grant: Record<string, any>) => grant.scope_type === 'TENANT',
    );
    const departments = grants
      .filter((grant: Record<string, any>) => grant.scope_type === 'DEPARTMENT')
      .map((grant: Record<string, any>) => Number(grant.scope_reference))
      .filter(Number.isInteger);
    return this.db.query(
      `SELECT c.*,r.acquisition_number,
         ROUND(CASE WHEN c.approved_allocation=0 THEN 0 ELSE c.expended_amount*100/c.approved_allocation END,2) AS utilization_percent,
         EXTRACT(DAY FROM NOW()-c.allocated_at)::int AS allocation_age_days,
         EXTRACT(DAY FROM NOW()-c.last_activity_at)::int AS inactive_days
       FROM proc_cases c JOIN acq_requests r ON r.acquisition_id=c.acquisition_id
       WHERE c.tenant_id=$1 AND ($2::boolean OR c.department_id=ANY($3::int[]) OR c.requester_id=$4::uuid)
         AND ($5::text IS NULL OR c.status=$5) ORDER BY c.last_activity_at DESC`,
      [
        this.tenant(actor),
        tenantWide,
        departments,
        actor.user_id,
        status ?? null,
      ],
    );
  }

  async listVendors(actor: ProcurementActor) {
    await this.requireCapability(actor, 'PROCUREMENT_ORDER_ENTRY');
    return this.db.query(
      `SELECT vendor_id,business_name,gstin
       FROM fin_vendors WHERE tenant_id=$1 AND is_active=true
       ORDER BY business_name`,
      [this.tenant(actor)],
    );
  }

  async get(actor: ProcurementActor, caseId: string) {
    const row = await this.accessibleCase(actor, caseId);
    const [
      lines,
      orders,
      orderLines,
      receipts,
      receiptLines,
      services,
      invoices,
      invoiceLines,
      matchResults,
      payments,
      adjustments,
      returns,
      repairs,
      downstream,
      ledger,
      audit,
      integrityProjections,
    ] = await Promise.all([
      this.db.query(
        `SELECT * FROM proc_case_lines WHERE proc_case_id=$1 ORDER BY line_number`,
        [caseId],
      ),
      this.db.query(
        `SELECT * FROM proc_orders WHERE proc_case_id=$1 ORDER BY created_at`,
        [caseId],
      ),
      this.db.query(
        `SELECT * FROM proc_order_lines WHERE proc_case_id=$1 ORDER BY created_at`,
        [caseId],
      ),
      this.db.query(
        `SELECT * FROM proc_receipts WHERE proc_case_id=$1 ORDER BY created_at`,
        [caseId],
      ),
      this.db.query(
        `SELECT rl.*,r.receipt_number,COALESCE(ol.product_name,pcl.product_name) AS product_name
         FROM proc_receipt_lines rl
         JOIN proc_receipts r ON r.receipt_id=rl.receipt_id
         JOIN proc_order_lines ol ON ol.order_line_id=rl.order_line_id
         LEFT JOIN proc_case_lines pcl ON pcl.proc_case_line_id=rl.proc_case_line_id
         WHERE r.proc_case_id=$1`,
        [caseId],
      ),
      this.db.query(
        `SELECT * FROM proc_service_acceptances WHERE proc_case_id=$1 ORDER BY created_at`,
        [caseId],
      ),
      this.db.query(
        `SELECT * FROM proc_invoices WHERE proc_case_id=$1 ORDER BY invoice_date`,
        [caseId],
      ),
      this.db.query(
        `SELECT il.* FROM proc_invoice_lines il JOIN proc_invoices i ON i.invoice_id=il.invoice_id WHERE i.proc_case_id=$1`,
        [caseId],
      ),
      this.db.query(
        `SELECT * FROM proc_match_results WHERE proc_case_id=$1 ORDER BY created_at`,
        [caseId],
      ),
      this.db.query(
        `SELECT * FROM proc_payments WHERE proc_case_id=$1 ORDER BY created_at`,
        [caseId],
      ),
      this.db.query(
        `SELECT * FROM proc_adjustments WHERE proc_case_id=$1 ORDER BY created_at`,
        [caseId],
      ),
      this.db.query(
        `SELECT * FROM proc_returns WHERE proc_case_id=$1 ORDER BY created_at`,
        [caseId],
      ),
      this.db.query(
        `SELECT * FROM proc_repairs WHERE proc_case_id=$1 ORDER BY created_at`,
        [caseId],
      ),
      this.db.query(
        `SELECT * FROM proc_downstream_status WHERE proc_case_id=$1 ORDER BY occurred_at`,
        [caseId],
      ),
      this.db.query(
        `SELECT * FROM proc_financial_ledger WHERE proc_case_id=$1 ORDER BY created_at,ledger_entry_id`,
        [caseId],
      ),
      this.db.query(
        `SELECT * FROM proc_audit_events WHERE proc_case_id=$1 ORDER BY created_at,audit_event_id`,
        [caseId],
      ),
      this.db.query(
        `SELECT p.* FROM proc_invoice_integrity_projections p
         JOIN proc_invoices i ON i.invoice_id=p.invoice_id
         WHERE i.proc_case_id=$1 ORDER BY p.updated_at`,
        [caseId],
      ),
    ]);
    const verifiedUnpaid =
      invoices
        .filter((i: Record<string, any>) =>
          ['VERIFIED', 'PARTIALLY_PAID'].includes(i.status),
        )
        .reduce(
          (sum: number, i: Record<string, any>) => sum + money(i.total_amount),
          0,
        ) -
      payments
        .filter((p: Record<string, any>) => p.status === 'POSTED')
        .reduce(
          (sum: number, p: Record<string, any>) => sum + money(p.amount),
          0,
        );
    const safeInvoices = invoices.map((invoice: Record<string, any>) => {
      const { document_object_key: privateObjectKey, ...safe } = invoice;
      return { ...safe, document_available: Boolean(privateObjectKey) };
    });
    return {
      ...row,
      verified_unpaid_liability: Math.max(0, verifiedUnpaid),
      lines,
      orders,
      order_lines: orderLines,
      receipts,
      receipt_lines: receiptLines,
      service_acceptances: services,
      invoices: safeInvoices,
      invoice_lines: invoiceLines,
      match_results: matchResults,
      payments,
      adjustments,
      returns,
      repairs,
      downstream_status: downstream,
      ledger,
      audit_timeline: audit,
      integrity_projections: integrityProjections,
    };
  }

  async dashboard(actor: ProcurementActor) {
    const cases = await this.list(actor);
    const totals = cases.reduce(
      (sum: Record<string, number>, row: Record<string, any>) => {
        for (const key of [
          'approved_allocation',
          'available_amount',
          'committed_amount',
          'expended_amount',
          'released_amount',
        ])
          sum[key] += money(row[key]);
        return sum;
      },
      {
        approved_allocation: 0,
        available_amount: 0,
        committed_amount: 0,
        expended_amount: 0,
        released_amount: 0,
      },
    );
    return {
      ...totals,
      cases: cases.length,
      alerts: cases.flatMap((row: Record<string, any>) => {
        const alerts: Array<Record<string, unknown>> = [];
        const remainingPercent =
          money(row.approved_allocation) === 0
            ? 0
            : (money(row.available_amount) * 100) /
              money(row.approved_allocation);
        if (Number(row.inactive_days) >= 30)
          alerts.push({
            proc_case_id: row.proc_case_id,
            type: 'INACTIVE',
            value: row.inactive_days,
          });
        if (remainingPercent <= 10)
          alerts.push({
            proc_case_id: row.proc_case_id,
            type: 'NEAR_EXHAUSTION',
            value: remainingPercent,
          });
        if (
          Number(row.allocation_age_days) <= 7 &&
          Number(row.utilization_percent) >= 50
        )
          alerts.push({
            proc_case_id: row.proc_case_id,
            type: 'RAPID_EXPENDITURE',
            value: row.utilization_percent,
          });
        return alerts;
      }),
    };
  }

  async createOrder(
    actor: ProcurementActor,
    caseId: string,
    expectedRevision: number,
    input: CreateOrderInput,
    requestId?: string,
  ) {
    const access = await this.accessibleCase(
      actor,
      caseId,
      'PROCUREMENT_ORDER_ENTRY',
    );
    if (!input.lines?.length)
      throw new BadRequestException('At least one order line is required');
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertRevision(row, expectedRevision);
      this.assertOpen(row);
      const ids = input.lines
        .map((line) => line.proc_case_line_id)
        .filter((id): id is string => Boolean(id));
      if (new Set(ids).size !== ids.length)
        throw new BadRequestException('Duplicate order line allocation');
      const approved = ids.length
        ? await manager.query(
            `SELECT * FROM proc_case_lines WHERE proc_case_id=$1 AND proc_case_line_id=ANY($2::uuid[])`,
            [caseId, ids],
          )
        : [];
      if (approved.length !== ids.length)
        throw new BadRequestException('Order lines do not belong to this case');
      const discrepancies = new Set<string>();
      for (const line of input.lines) {
        const source = approved.find(
          (candidate: Record<string, any>) =>
            candidate.proc_case_line_id === line.proc_case_line_id,
        );
        if (!source) {
          if (!line.product_name?.trim() || !line.category?.trim() || !line.unit?.trim() || !line.fulfillment_type)
            throw new BadRequestException(
              'New products require product name, category, unit and classification',
            );
          discrepancies.add('UNPLANNED_PRODUCT');
          continue;
        }
        if (source.approved_vendor_id !== input.vendor_id)
          discrepancies.add('VENDOR_CHANGED');
        if (Number(line.quantity) > Number(source.approved_quantity))
          discrepancies.add('QUANTITY_CHANGED');
        if (money(line.unit_price) !== money(source.approved_unit_price))
          discrepancies.add('UNIT_PRICE_CHANGED');
      }
      const justification = input.discrepancy_justification?.trim();
      if (discrepancies.size && (!justification || justification.length < 20))
        throw new BadRequestException(
          'Order deviations require a justification of at least 20 characters',
        );
      const orderId = randomUUID();
      const orderNumber = `PO-${new Date().getUTCFullYear()}-${orderId.slice(0, 8).toUpperCase()}`;
      const calculated = input.lines.map((line) => ({
        input: line,
        totals: lineTotal(line),
      }));
      const subtotal = calculated.reduce(
        (sum, item) => sum + item.totals.product,
        0,
      );
      const tax = calculated.reduce((sum, item) => sum + item.totals.tax, 0);
      const freight = calculated.reduce(
        (sum, item) => sum + item.totals.freight,
        0,
      );
      const additional = calculated.reduce(
        (sum, item) => sum + item.totals.additional,
        0,
      );
      const total = calculated.reduce(
        (sum, item) => sum + item.totals.total,
        0,
      );
      const overrunPercent = Math.max(
        0,
        ((total - Number(row.available_amount)) / Number(row.approved_allocation)) * 100,
      );
      if (overrunPercent > 10.0001)
        throw new ConflictException({
          message: 'Order exceeds the maximum 10% controlled overrun window',
          code: 'MODULE1_AMENDMENT_REQUIRED',
        });
      if (overrunPercent > 0) discrepancies.add('BUDGET_OVERRUN');
      const exceptionStatus = overrunPercent > 0
        ? 'FINANCE_APPROVAL_REQUIRED'
        : discrepancies.size ? 'JUSTIFIED' : 'NOT_REQUIRED';
      await manager.query(
        `INSERT INTO proc_orders
           (order_id,proc_case_id,tenant_id,order_number,external_order_id,vendor_id,currency,
            order_date,expected_delivery_date,product_url,progress_status,subtotal,tax_amount,
            freight_amount,additional_charges,total_amount,created_by,has_discrepancy,
            discrepancy_justification,overrun_percent,exception_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ENTERED',$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        [
          orderId,
          caseId,
          row.tenant_id,
          orderNumber,
          input.external_order_id ?? null,
          input.vendor_id,
          row.currency,
          input.order_date ?? null,
          input.expected_delivery_date ?? null,
          input.product_url ?? null,
          subtotal,
          tax,
          freight,
          additional,
          total,
          actor.user_id,
          discrepancies.size > 0,
          justification ?? null,
          overrunPercent,
          exceptionStatus,
        ],
      );
      for (const item of calculated) {
        const source = approved.find(
          (line: Record<string, any>) =>
            line.proc_case_line_id === item.input.proc_case_line_id,
        );
        const lineDiscrepancies = [
          ...(!source ? ['UNPLANNED_PRODUCT'] : []),
          ...(source && source.approved_vendor_id !== input.vendor_id ? ['VENDOR_CHANGED'] : []),
          ...(source && Number(item.input.quantity) > Number(source.approved_quantity) ? ['QUANTITY_CHANGED'] : []),
          ...(source && money(item.input.unit_price) !== money(source.approved_unit_price) ? ['UNIT_PRICE_CHANGED'] : []),
        ];
        await manager.query(
          `INSERT INTO proc_order_lines
             (order_id,proc_case_id,proc_case_line_id,acquisition_line_id,tenant_id,
              quantity,unit_price,tax_amount,freight_amount,additional_charges,line_total,
              product_name,category,unit,fulfillment_type,is_unplanned,discrepancy_codes,
              discrepancy_justification)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
          [
            orderId,
            caseId,
            source?.proc_case_line_id ?? null,
            source?.acquisition_line_id ?? null,
            row.tenant_id,
            item.input.quantity,
            money(item.input.unit_price),
            item.totals.tax,
            item.totals.freight,
            item.totals.additional,
            item.totals.total,
            source?.product_name ?? item.input.product_name?.trim(),
            source?.category ?? item.input.category?.trim(),
            source?.unit ?? item.input.unit?.trim(),
            source?.fulfillment_type ?? item.input.fulfillment_type,
            !source,
            JSON.stringify(lineDiscrepancies),
            lineDiscrepancies.length
              ? item.input.discrepancy_justification?.trim() ?? justification
              : null,
          ],
        );
      }
      await this.audit(
        manager,
        row,
        'ORDER',
        orderId,
        'ORDER_DRAFTED',
        actor.user_id,
        null,
        {
          order_number: orderNumber,
          total_amount: total,
          discrepancy_codes: [...discrepancies],
          discrepancy_justification: justification,
          overrun_percent: overrunPercent,
          exception_status: exceptionStatus,
        },
        requestId,
      );
      await manager.query(
        `UPDATE proc_cases SET aggregate_revision=aggregate_revision+1,updated_at=NOW(),last_activity_at=NOW() WHERE proc_case_id=$1`,
        [caseId],
      );
      return {
        order_id: orderId,
        order_number: orderNumber,
        total_amount: total,
        discrepancy_codes: [...discrepancies],
        exception_status: exceptionStatus,
        revision: Number(row.aggregate_revision) + 1,
      };
    });
  }

  async issueOrder(
    actor: ProcurementActor,
    caseId: string,
    orderId: string,
    expectedRevision: number,
    idempotencyKey: string,
  ) {
    const access = await this.accessibleCase(
      actor,
      caseId,
      'PROCUREMENT_ORDER_ENTRY',
    );
    if (!idempotencyKey?.trim())
      throw new BadRequestException('Idempotency-Key is required');
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertRevision(row, expectedRevision);
      this.assertOpen(row);
      const orders = await manager.query(
        `SELECT * FROM proc_orders WHERE order_id=$1 AND proc_case_id=$2 FOR UPDATE`,
        [orderId, caseId],
      );
      const order = orders[0];
      if (!order) throw new NotFoundException('Order not found');
      if (order.status === 'ISSUED') return order;
      if (order.status !== 'DRAFT')
        throw new ConflictException(`Order is ${order.status}`);
      if (order.exception_status === 'FINANCE_APPROVAL_REQUIRED')
        throw new ConflictException({
          message:
            'This order is within the controlled overrun window but needs Finance approval before issue',
          code: 'ORDER_OVERRUN_APPROVAL_REQUIRED',
        });
      const allocations = await manager.query(
        `SELECT ol.proc_case_line_id,SUM(ol.quantity-ol.cancelled_quantity) AS proposed,
           pcl.approved_quantity,
           COALESCE((SELECT SUM(x.quantity-x.cancelled_quantity) FROM proc_order_lines x
             JOIN proc_orders o ON o.order_id=x.order_id
             WHERE x.proc_case_line_id=ol.proc_case_line_id AND o.status IN ('ISSUED','PARTIALLY_RECEIVED','RECEIVED','CLOSED')),0) AS active
         FROM proc_order_lines ol LEFT JOIN proc_case_lines pcl ON pcl.proc_case_line_id=ol.proc_case_line_id
         WHERE ol.order_id=$1 AND ol.proc_case_line_id IS NOT NULL
         GROUP BY ol.proc_case_line_id,pcl.approved_quantity`,
        [orderId],
      );
      if (
        allocations.some(
          (a: Record<string, any>) =>
            quantityUnits(a.active) + quantityUnits(a.proposed) >
            quantityUnits(a.approved_quantity),
        ) && !order.discrepancy_justification
      ) {
        throw new ConflictException({
          message: 'Quantity deviation requires justification',
          code: 'ORDER_DEVIATION_JUSTIFICATION_REQUIRED',
        });
      }
      const total = money(order.total_amount);
      if (minorUnits(total) > minorUnits(row.available_amount)) {
        throw new ConflictException({
          message: 'Order exceeds available allocation',
          code: 'ACQUISITION_AMENDMENT_REQUIRED',
        });
      }
      const legacy = await manager.query(
        `INSERT INTO fin_purchase_orders
           (tenant_id,vendor_id,description,amount,status,requested_by,approved_at,proc_order_id,source_system)
         VALUES ($1,$2,$3,$4,'APPROVED',$5,NOW(),$6,'MODULE2') RETURNING po_id`,
        [
          row.tenant_id,
          order.vendor_id,
          `Module 2 order ${order.order_number}`,
          total,
          actor.user_id,
          orderId,
        ],
      );
      const lines = await manager.query(
        `SELECT ol.*,COALESCE(ol.product_name,pcl.product_name) AS product_name
         FROM proc_order_lines ol LEFT JOIN proc_case_lines pcl ON pcl.proc_case_line_id=ol.proc_case_line_id
         WHERE ol.order_id=$1`,
        [orderId],
      );
      for (const line of lines) {
        await manager.query(
          `INSERT INTO fin_po_lines (po_id,description,qty,unit_price,proc_order_line_id) VALUES ($1,$2,$3,$4,$5)`,
          [
            legacy[0].po_id,
            line.product_name,
            line.quantity,
            line.unit_price,
            line.order_line_id,
          ],
        );
      }
      await manager.query(
        `UPDATE proc_orders SET status='ISSUED',progress_status='VERIFIED',issued_by=$2,issued_at=NOW(),legacy_po_id=$3,updated_at=NOW() WHERE order_id=$1`,
        [orderId, actor.user_id, legacy[0].po_id],
      );
      await this.moveFunds(manager, row, {
        entryType: 'ORDER_COMMITTED',
        from: 'AVAILABLE',
        to: 'COMMITTED',
        amount: total,
        sourceType: 'ORDER',
        sourceId: orderId,
        idempotencyKey,
        actorId: actor.user_id,
      });
      await manager.query(
        `INSERT INTO acq_budget_reservation_events (budget_reservation_id,tenant_id,event_type,amount,reason,actor_user_id,proc_case_id) VALUES ($1,$2,'PARTIALLY_COMMITTED',$3,$4,$5,$6)`,
        [
          row.budget_reservation_id,
          row.tenant_id,
          total,
          `Order ${order.order_number} issued`,
          actor.user_id,
          caseId,
        ],
      );
      await this.audit(
        manager,
        row,
        'ORDER',
        orderId,
        'ORDER_ISSUED',
        actor.user_id,
        { status: 'DRAFT' },
        { status: 'ISSUED', amount: total },
      );
      const event = await this.emit(
        manager,
        row,
        'ProcurementOrderIssued.v1',
        orderId,
        {
          order: { ...order, status: 'ISSUED', lines },
          amount: total,
          currency: row.currency,
        },
      );
      return {
        ...order,
        status: 'ISSUED',
        legacy_po_id: legacy[0].po_id,
        event,
        aggregate_revision: Number(row.aggregate_revision),
      };
    });
  }

  async cancelOrder(
    actor: ProcurementActor,
    caseId: string,
    orderId: string,
    expectedRevision: number,
    input: {
      lines: Array<{ order_line_id: string; quantity: number }>;
      reason: string;
    },
    idempotencyKey: string,
  ) {
    const access = await this.accessibleCase(
      actor,
      caseId,
      'PROCUREMENT_ORDER_ENTRY',
    );
    if (!input.reason?.trim() || !input.lines?.length)
      throw new BadRequestException(
        'Cancellation lines and reason are required',
      );
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertRevision(row, expectedRevision);
      this.assertOpen(row);
      const orders = await manager.query(
        `SELECT * FROM proc_orders WHERE order_id=$1 AND proc_case_id=$2 FOR UPDATE`,
        [orderId, caseId],
      );
      const order = orders[0];
      if (!order) throw new NotFoundException('Order not found');
      if (!['ISSUED', 'PARTIALLY_RECEIVED'].includes(order.status))
        throw new ConflictException(`Order is ${order.status}`);
      let releaseMinor = 0n;
      for (const cancellation of input.lines) {
        const lines = await manager.query(
          `SELECT ol.*,
             COALESCE((SELECT SUM(rl.accepted_quantity) FROM proc_receipt_lines rl WHERE rl.order_line_id=ol.order_line_id),0) AS accepted
           FROM proc_order_lines ol WHERE ol.order_line_id=$1 AND ol.order_id=$2 FOR UPDATE`,
          [cancellation.order_line_id, orderId],
        );
        const line = lines[0];
        if (!line)
          throw new BadRequestException(
            'Cancellation line does not belong to order',
          );
        const quantity = quantityUnits(cancellation.quantity);
        const cancellable =
          quantityUnits(line.quantity) -
          quantityUnits(line.cancelled_quantity || 0) -
          BigInt(Math.round(Number(line.accepted) * 1000));
        if (quantity > cancellable)
          throw new ConflictException({
            message: 'Cancellation exceeds unfulfilled quantity',
            code: 'CANCELLATION_QUANTITY_EXCEEDED',
          });
        const prorated =
          (minorUnits(line.line_total) * quantity +
            quantityUnits(line.quantity) / 2n) /
          quantityUnits(line.quantity);
        releaseMinor += prorated;
        await manager.query(
          `UPDATE proc_order_lines SET cancelled_quantity=cancelled_quantity+$2 WHERE order_line_id=$1`,
          [line.order_line_id, cancellation.quantity],
        );
      }
      const release = Number(releaseMinor) / 100;
      await this.moveFunds(manager, row, {
        entryType: 'ORDER_COMMITMENT_RELEASED',
        from: 'COMMITTED',
        to: 'AVAILABLE',
        amount: release,
        sourceType: 'ORDER',
        sourceId: orderId,
        idempotencyKey,
        actorId: actor.user_id,
      });
      const remaining = await manager.query(
        `SELECT COUNT(*)::int AS count FROM proc_order_lines WHERE order_id=$1 AND cancelled_quantity < quantity`,
        [orderId],
      );
      const nextStatus =
        Number(remaining[0].count) === 0 ? 'CANCELLED' : order.status;
      await manager.query(
        `UPDATE proc_orders SET status=$2,cancellation_reason=$3,cancelled_by=$4,cancelled_at=NOW(),updated_at=NOW() WHERE order_id=$1`,
        [orderId, nextStatus, input.reason.trim(), actor.user_id],
      );
      if (order.legacy_po_id) {
        await manager.query(
          `UPDATE fin_purchase_orders SET amount=GREATEST(0,amount-$2),status=CASE WHEN $3='CANCELLED' THEN 'CANCELLED' ELSE status END WHERE po_id=$1 AND source_system='MODULE2'`,
          [order.legacy_po_id, release, nextStatus],
        );
      }
      await this.audit(
        manager,
        row,
        'ORDER',
        orderId,
        'ORDER_CANCELLED',
        actor.user_id,
        { status: order.status },
        { status: nextStatus, released: release, reason: input.reason },
      );
      const event = await this.emit(
        manager,
        row,
        'ProcurementOrderCancelled.v1',
        orderId,
        {
          released_amount: release,
          currency: row.currency,
          reason: input.reason,
          lines: input.lines,
        },
      );
      return {
        order_id: orderId,
        status: nextStatus,
        released_amount: release,
        event,
        aggregate_revision: Number(row.aggregate_revision),
      };
    });
  }

  async cancelCaseLine(
    actor: ProcurementActor,
    caseId: string,
    lineId: string,
    expectedRevision: number,
    input: { quantity: number; reason: string },
  ) {
    const access = await this.accessibleCase(
      actor,
      caseId,
      'PROCUREMENT_ORDER_ENTRY',
    );
    if (!input.reason?.trim())
      throw new BadRequestException('Cancellation reason is required');
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertRevision(row, expectedRevision);
      this.assertOpen(row);
      const lines = await manager.query(
        `SELECT pcl.*,
           COALESCE((SELECT SUM(ol.quantity-ol.cancelled_quantity) FROM proc_order_lines ol JOIN proc_orders o ON o.order_id=ol.order_id WHERE ol.proc_case_line_id=pcl.proc_case_line_id AND o.status IN ('ISSUED','PARTIALLY_RECEIVED','RECEIVED','CLOSED')),0) AS active_ordered
         FROM proc_case_lines pcl WHERE pcl.proc_case_line_id=$1 AND pcl.proc_case_id=$2 FOR UPDATE`,
        [lineId, caseId],
      );
      const line = lines[0];
      if (!line) throw new NotFoundException('Procurement line not found');
      const requested = quantityUnits(input.quantity);
      const unallocated =
        quantityUnits(line.approved_quantity) -
        quantityUnits(line.cancelled_quantity || 0) -
        BigInt(Math.round(Number(line.active_ordered) * 1000));
      if (requested > unallocated)
        throw new ConflictException(
          'Only unallocated quantity can be cancelled at case level',
        );
      await manager.query(
        `UPDATE proc_case_lines SET cancelled_quantity=cancelled_quantity+$2,cancellation_reason=$3 WHERE proc_case_line_id=$1`,
        [lineId, input.quantity, input.reason.trim()],
      );
      await this.audit(
        manager,
        row,
        'CASE_LINE',
        lineId,
        'CASE_LINE_CANCELLED',
        actor.user_id,
        { cancelled_quantity: line.cancelled_quantity },
        {
          cancelled_quantity: Number(line.cancelled_quantity) + input.quantity,
          reason: input.reason,
        },
      );
      await manager.query(
        `UPDATE proc_cases SET aggregate_revision=aggregate_revision+1,updated_at=NOW(),last_activity_at=NOW() WHERE proc_case_id=$1`,
        [caseId],
      );
      return {
        proc_case_line_id: lineId,
        cancelled_quantity: Number(line.cancelled_quantity) + input.quantity,
        aggregate_revision: Number(row.aggregate_revision) + 1,
      };
    });
  }

  async recordReceipt(
    actor: ProcurementActor,
    caseId: string,
    orderId: string,
    expectedRevision: number,
    input: CreateReceiptInput,
  ) {
    const access = await this.accessibleCase(
      actor,
      caseId,
      'PROCUREMENT_RECEIPT_ENTRY',
    );
    if (!input.lines?.length)
      throw new BadRequestException('Receipt lines are required');
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertRevision(row, expectedRevision);
      this.assertOpen(row);
      const orders = await manager.query(
        `SELECT * FROM proc_orders WHERE order_id=$1 AND proc_case_id=$2 FOR UPDATE`,
        [orderId, caseId],
      );
      const order = orders[0];
      if (!order) throw new NotFoundException('Order not found');
      if (!['ISSUED', 'PARTIALLY_RECEIVED'].includes(order.status))
        throw new ConflictException(`Order is ${order.status}`);
      if (String(order.created_by) === actor.user_id)
        throw new ForbiddenException({
          message: 'Order creator cannot receive their order',
          code: 'SOD_RECEIVER_VIOLATION',
        });
      if (!input.package_evidence_upload_id)
        throw new BadRequestException(
          'A geo-tagged package and shipping-label image is required',
        );
      const evidenceRows = await manager.query(
        `SELECT * FROM proc_document_uploads
         WHERE document_upload_id=$1 AND proc_case_id=$2 AND tenant_id=$3
           AND uploaded_by=$4 AND purpose='PACKAGE_RECEIPT'
           AND malware_scan_status='CLEAN' AND consumed_at IS NULL
           AND expires_at>NOW() FOR UPDATE`,
        [
          input.package_evidence_upload_id,
          caseId,
          row.tenant_id,
          actor.user_id,
        ],
      );
      const packageEvidence = evidenceRows[0];
      if (!packageEvidence)
        throw new ConflictException(
          'A current clean geo-tagged package image owned by this receiver is required',
        );
      const receiptId = randomUUID();
      const receiptNumber = `GRN-${new Date().getUTCFullYear()}-${receiptId.slice(0, 8).toUpperCase()}`;
      if (input.replacement_for_return_id) {
        const replacement = await manager.query(
          `SELECT * FROM proc_returns WHERE return_id=$1 AND proc_case_id=$2 AND status IN ('VENDOR_RECEIVED','RESOLVED')`,
          [input.replacement_for_return_id, caseId],
        );
        if (!replacement[0])
          throw new ConflictException(
            'Replacement must reference an eligible return',
          );
      }
      const legacy = await manager.query(
        `INSERT INTO fin_goods_receipts (tenant_id,po_id,received_by,received_at,notes,proc_receipt_id,source_system)
         VALUES ($1,$2,$3,$4,$5,$6,'MODULE2') RETURNING grn_id`,
        [
          row.tenant_id,
          order.legacy_po_id,
          actor.user_id,
          input.actual_delivery_date,
          input.notes ?? null,
          receiptId,
        ],
      );
      await manager.query(
        `INSERT INTO proc_receipts (receipt_id,proc_case_id,order_id,tenant_id,receipt_number,actual_delivery_date,status,notes,recorded_by,replacement_for_return_id,legacy_grn_id,
          package_evidence_upload_id,capture_latitude,capture_longitude,capture_accuracy_metres,evidence_captured_at)
         VALUES ($1,$2,$3,$4,$5,$6,'ENTERED',$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          receiptId,
          caseId,
          orderId,
          row.tenant_id,
          receiptNumber,
          input.actual_delivery_date,
          input.notes ?? null,
          actor.user_id,
          input.replacement_for_return_id ?? null,
          legacy[0].grn_id,
          input.package_evidence_upload_id,
          packageEvidence.capture_latitude,
          packageEvidence.capture_longitude,
          packageEvidence.capture_accuracy_metres,
          packageEvidence.client_captured_at,
        ],
      );
      await manager.query(
        `UPDATE proc_document_uploads SET consumed_at=NOW() WHERE document_upload_id=$1`,
        [input.package_evidence_upload_id],
      );
      for (const incoming of input.lines) {
        if (incoming.received_quantity <= 0)
          throw new BadRequestException(
            'Received package quantity must be positive',
          );
        if (incoming.accepted_quantity !== 0 || (incoming.rejected_quantity ?? 0) !== 0)
          throw new BadRequestException(
            'Stores records sealed-package custody only; product acceptance is completed later by the requester',
          );
        const lines = await manager.query(
          `SELECT ol.*,
             COALESCE((SELECT SUM(rl.accepted_quantity) FROM proc_receipt_lines rl WHERE rl.order_line_id=ol.order_line_id),0) AS accepted,
             COALESCE((SELECT SUM(r.quantity) FROM proc_returns r WHERE r.order_line_id=ol.order_line_id AND r.status NOT IN ('REJECTED','CANCELLED')),0) AS returned
           FROM proc_order_lines ol
           WHERE ol.order_line_id=$1 AND ol.order_id=$2`,
          [incoming.order_line_id, orderId],
        );
        const line = lines[0];
        if (!line)
          throw new BadRequestException(
            'Receipt line does not belong to order',
          );
        const netAccepted =
          Number(line.accepted) -
          Number(line.returned) +
          incoming.accepted_quantity;
        const activeQuantity =
          Number(line.quantity) - Number(line.cancelled_quantity);
        if (netAccepted > activeQuantity + 0.0005)
          throw new ConflictException({
            message: 'Accepted quantity exceeds active ordered quantity',
            code: 'RECEIPT_QUANTITY_EXCEEDED',
          });
        const receiptLineId = randomUUID();
        await manager.query(
          `INSERT INTO proc_receipt_lines (receipt_line_id,receipt_id,order_line_id,proc_case_line_id,tenant_id,received_quantity,accepted_quantity,rejected_quantity,discrepancy_reason,acceptance_status)
           VALUES ($1,$2,$3,$4,$5,$6,0,0,$7,'PACKAGE_RECEIVED')`,
          [
            receiptLineId,
            receiptId,
            line.order_line_id,
            line.proc_case_line_id,
            row.tenant_id,
            incoming.received_quantity,
            incoming.discrepancy_reason ?? null,
          ],
        );
        const legacyLines = await manager.query(
          `SELECT line_id FROM fin_po_lines WHERE proc_order_line_id=$1`,
          [line.order_line_id],
        );
        await manager.query(
          `INSERT INTO fin_grn_lines (grn_id,po_line_id,description,qty_received,proc_receipt_line_id) VALUES ($1,$2,$3,$4,$5)`,
          [
            legacy[0].grn_id,
            legacyLines[0]?.line_id ?? null,
            `Module 2 receipt ${receiptNumber}`,
            incoming.received_quantity,
            receiptLineId,
          ],
        );
      }
      const outstanding = await manager.query(
        `SELECT COUNT(*)::int AS count FROM proc_order_lines ol
         WHERE ol.order_id=$1 AND
           COALESCE((SELECT SUM(rl.received_quantity) FROM proc_receipt_lines rl WHERE rl.order_line_id=ol.order_line_id),0)
             < ol.quantity-ol.cancelled_quantity`,
        [orderId],
      );
      const orderStatus =
        Number(outstanding[0].count) === 0 ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
      await manager.query(
        `UPDATE proc_orders SET status=$2,updated_at=NOW() WHERE order_id=$1`,
        [orderId, orderStatus],
      );
      await this.audit(
        manager,
        row,
        'RECEIPT',
        receiptId,
        'PACKAGE_RECEIPT_RECORDED',
        actor.user_id,
        null,
        { receipt_number: receiptNumber, lines: input.lines },
      );
      const event = await this.emit(
        manager,
        row,
        'PackageReceiptRecorded.v1',
        receiptId,
        {
          order_id: orderId,
          receipt_number: receiptNumber,
          actual_delivery_date: input.actual_delivery_date,
          lines: input.lines,
        },
      );
      return {
        receipt_id: receiptId,
        receipt_number: receiptNumber,
        order_status: orderStatus,
        event,
        aggregate_revision: Number(row.aggregate_revision),
      };
    });
  }

  async confirmReceivedProduct(
    actor: ProcurementActor,
    caseId: string,
    receiptLineId: string,
    expectedRevision: number,
    documentUploadId: string,
  ) {
    const access = await this.accessibleCase(actor, caseId);
    if (String(access.requester_id) !== actor.user_id)
      throw new ForbiddenException({
        message: 'Only the original requester can confirm the opened product',
        code: 'PRODUCT_ACCEPTANCE_REQUESTER_REQUIRED',
      });
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertRevision(row, expectedRevision);
      this.assertOpen(row);
      const lines = await manager.query(
        `SELECT rl.*,r.receipt_id,r.order_id,r.receipt_number,ol.quantity AS ordered_quantity,
                ol.cancelled_quantity
         FROM proc_receipt_lines rl
         JOIN proc_receipts r ON r.receipt_id=rl.receipt_id
         JOIN proc_order_lines ol ON ol.order_line_id=rl.order_line_id
         WHERE rl.receipt_line_id=$1 AND r.proc_case_id=$2 AND rl.tenant_id=$3
         FOR UPDATE OF rl`,
        [receiptLineId, caseId, row.tenant_id],
      );
      const line = lines[0];
      if (!line) throw new NotFoundException('Receipt line not found');
      if (line.acceptance_status === 'PRODUCT_CONFIRMED') return line;
      const evidence = await manager.query(
        `SELECT u.* FROM proc_document_uploads u
         JOIN proc_receipt_evidence e ON e.document_upload_id=u.document_upload_id
         WHERE u.document_upload_id=$1 AND e.receipt_line_id=$2
           AND u.proc_case_id=$3 AND u.tenant_id=$4 AND u.uploaded_by=$5
           AND u.purpose='RECEIVED_PRODUCT' AND u.malware_scan_status='CLEAN'
         FOR UPDATE OF u`,
        [documentUploadId, receiptLineId, caseId, row.tenant_id, actor.user_id],
      );
      if (!evidence[0])
        throw new ConflictException('A clean geo-tagged product image for this receipt line is required');
      const acceptedQuantity = Number(line.received_quantity);
      const priorAccepted = await manager.query(
        `SELECT COALESCE(SUM(accepted_quantity),0) AS accepted
         FROM proc_receipt_lines WHERE order_line_id=$1 AND receipt_line_id<>$2`,
        [line.order_line_id, receiptLineId],
      );
      const activeOrdered = Number(line.ordered_quantity) - Number(line.cancelled_quantity);
      if (Number(priorAccepted[0].accepted) + acceptedQuantity > activeOrdered + 0.0005)
        throw new ConflictException('Product acceptance exceeds active ordered quantity');
      await manager.query(
        `UPDATE proc_receipt_lines SET accepted_quantity=$2,acceptance_status='PRODUCT_CONFIRMED',
           product_evidence_upload_id=$3,accepted_by=$4,accepted_at=NOW()
         WHERE receipt_line_id=$1`,
        [receiptLineId, acceptedQuantity, documentUploadId, actor.user_id],
      );
      await manager.query(
        `UPDATE proc_receipts SET status='VERIFIED'
         WHERE receipt_id=$1 AND NOT EXISTS (
           SELECT 1 FROM proc_receipt_lines WHERE receipt_id=$1 AND acceptance_status<>'PRODUCT_CONFIRMED'
         )`,
        [line.receipt_id],
      );
      await this.audit(
        manager,
        row,
        'RECEIPT_LINE',
        receiptLineId,
        'RECEIVED_PRODUCT_CONFIRMED',
        actor.user_id,
        { accepted_quantity: 0, acceptance_status: 'PACKAGE_RECEIVED' },
        { accepted_quantity: acceptedQuantity, acceptance_status: 'PRODUCT_CONFIRMED', document_upload_id: documentUploadId },
      );
      const event = await this.emit(manager, row, 'GoodsReceiptRecorded.v1', line.receipt_id, {
        order_id: line.order_id,
        receipt_number: line.receipt_number,
        lines: [{
          receipt_line_id: receiptLineId,
          order_line_id: line.order_line_id,
          received_quantity: acceptedQuantity,
          accepted_quantity: acceptedQuantity,
          rejected_quantity: 0,
        }],
      });
      return {
        receipt_line_id: receiptLineId,
        acceptance_status: 'PRODUCT_CONFIRMED',
        accepted_quantity: acceptedQuantity,
        event,
        aggregate_revision: Number(row.aggregate_revision),
      };
    });
  }

  async recordServiceAcceptance(
    actor: ProcurementActor,
    caseId: string,
    expectedRevision: number,
    input: CreateServiceAcceptanceInput,
  ) {
    const access = await this.accessibleCase(
      actor,
      caseId,
      'PROCUREMENT_RECEIPT_ENTRY',
    );
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertRevision(row, expectedRevision);
      this.assertOpen(row);
      const lines = await manager.query(
        `SELECT ol.*,COALESCE(ol.fulfillment_type,pcl.fulfillment_type) AS fulfillment_type,
           COALESCE((SELECT SUM(sa.accepted_quantity) FROM proc_service_acceptances sa WHERE sa.order_line_id=ol.order_line_id AND sa.status IN ('VERIFIED','FINALIZED')),0) AS accepted
         FROM proc_order_lines ol LEFT JOIN proc_case_lines pcl ON pcl.proc_case_line_id=ol.proc_case_line_id
         JOIN proc_orders o ON o.order_id=ol.order_id
         WHERE ol.order_line_id=$1 AND ol.proc_case_id=$2 AND o.status NOT IN ('DRAFT','CANCELLED')`,
        [input.order_line_id, caseId],
      );
      const line = lines[0];
      if (!line) throw new NotFoundException('Order line not found');
      if (!['SERVICE', 'INSTALLATION'].includes(line.fulfillment_type))
        throw new BadRequestException(
          'Service acceptance applies only to service or installation lines',
        );
      if (
        Number(line.accepted) + input.accepted_quantity >
        Number(line.quantity) - Number(line.cancelled_quantity) + 0.0005
      )
        throw new ConflictException(
          'Service acceptance exceeds ordered quantity',
        );
      const acceptanceId = randomUUID();
      await manager.query(
        `INSERT INTO proc_service_acceptances (service_acceptance_id,proc_case_id,order_line_id,tenant_id,accepted_quantity,milestone,acceptance_date,status,entered_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'ENTERED',$8)`,
        [
          acceptanceId,
          caseId,
          input.order_line_id,
          row.tenant_id,
          input.accepted_quantity,
          input.milestone ?? null,
          input.acceptance_date,
          actor.user_id,
        ],
      );
      // Stores records objective acceptance; maker-checker is applied when Finance verifies the invoice.
      await this.audit(
        manager,
        row,
        'SERVICE_ACCEPTANCE',
        acceptanceId,
        'SERVICE_ACCEPTANCE_RECORDED',
        actor.user_id,
        null,
        input,
      );
      const event = await this.emit(
        manager,
        row,
        'ServiceAcceptanceRecorded.v1',
        acceptanceId,
        { ...input },
      );
      return {
        service_acceptance_id: acceptanceId,
        status: 'ENTERED',
        event,
        aggregate_revision: Number(row.aggregate_revision),
      };
    });
  }

  async verifyServiceAcceptance(
    actor: ProcurementActor,
    caseId: string,
    acceptanceId: string,
    expectedRevision: number,
  ) {
    const access = await this.accessibleCase(
      actor,
      caseId,
      'PROCUREMENT_INVOICE_VERIFY',
    );
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertRevision(row, expectedRevision);
      this.assertOpen(row);
      const records = await manager.query(
        `SELECT * FROM proc_service_acceptances WHERE service_acceptance_id=$1 AND proc_case_id=$2 FOR UPDATE`,
        [acceptanceId, caseId],
      );
      const record = records[0];
      if (!record) throw new NotFoundException('Service acceptance not found');
      if (record.status === 'VERIFIED') return record;
      if (record.entered_by === actor.user_id)
        throw new ForbiddenException({
          message: 'Service acceptance entrant cannot verify it',
          code: 'SOD_SERVICE_ACCEPTANCE_VIOLATION',
        });
      await manager.query(
        `UPDATE proc_service_acceptances SET status='VERIFIED',verified_by=$2,verified_at=NOW() WHERE service_acceptance_id=$1`,
        [acceptanceId, actor.user_id],
      );
      await this.audit(
        manager,
        row,
        'SERVICE_ACCEPTANCE',
        acceptanceId,
        'SERVICE_ACCEPTANCE_VERIFIED',
        actor.user_id,
        { status: record.status },
        { status: 'VERIFIED' },
      );
      await manager.query(
        `UPDATE proc_cases SET aggregate_revision=aggregate_revision+1,updated_at=NOW(),last_activity_at=NOW() WHERE proc_case_id=$1`,
        [caseId],
      );
      return {
        ...record,
        status: 'VERIFIED',
        verified_by: actor.user_id,
        aggregate_revision: Number(row.aggregate_revision) + 1,
      };
    });
  }

  async createInvoice(
    actor: ProcurementActor,
    caseId: string,
    orderId: string,
    expectedRevision: number,
    input: CreateInvoiceInput,
    requestId?: string,
  ) {
    const access = await this.accessibleCase(
      actor,
      caseId,
      'PROCUREMENT_INVOICE_ENTRY',
    );
    if (!input.lines?.length || !input.invoice_number?.trim())
      throw new BadRequestException('Invoice number and lines are required');
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertRevision(row, expectedRevision);
      this.assertOpen(row);
      const orders = await manager.query(
        `SELECT * FROM proc_orders WHERE order_id=$1 AND proc_case_id=$2`,
        [orderId, caseId],
      );
      const order = orders[0];
      if (!order) throw new NotFoundException('Order not found');
      if (
        !['ISSUED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED'].includes(
          order.status,
        )
      )
        throw new ConflictException(`Order is ${order.status}`);
      if (
        input.currency.toUpperCase() !== row.currency ||
        input.currency.toUpperCase() !== order.currency
      )
        throw new ConflictException({
          message: 'Invoice currency must match approved currency',
          code: 'INVOICE_CURRENCY_MISMATCH',
        });
      const uploads = await manager.query(
        `SELECT * FROM proc_document_uploads
         WHERE document_upload_id=$1 AND proc_case_id=$2 AND tenant_id=$3
           AND uploaded_by=$4 AND malware_scan_status='CLEAN'
           AND consumed_at IS NULL AND expires_at>NOW() FOR UPDATE`,
        [input.document_upload_id, caseId, row.tenant_id, actor.user_id],
      );
      const upload = uploads[0];
      if (!upload)
        throw new ConflictException({
          message: 'A current clean tenant-owned invoice upload is required',
          code: 'INVOICE_DOCUMENT_UPLOAD_REQUIRED',
        });
      const duplicates = await manager.query(
        `SELECT invoice_id FROM proc_invoices WHERE tenant_id=$1 AND document_hash=$2`,
        [row.tenant_id, upload.content_hash],
      );
      if (duplicates[0])
        throw new ConflictException({
          message: 'Duplicate invoice document detected',
          code: 'DUPLICATE_INVOICE_DOCUMENT',
          duplicate_invoice_id: duplicates[0].invoice_id,
        });
      const invoiceId = randomUUID();
      let taxableMinor = 0n,
        taxMinor = 0n,
        freightMinor = 0n,
        totalMinor = 0n;
      const calculated: Array<{
        input: CreateInvoiceInput['lines'][number];
        totals: ReturnType<typeof lineTotal>;
        source: Record<string, any>;
      }> = [];
      for (const line of input.lines) {
        const sourceRows = await manager.query(
          `SELECT * FROM proc_order_lines WHERE order_line_id=$1 AND order_id=$2`,
          [line.order_line_id, orderId],
        );
        const source = sourceRows[0];
        if (!source)
          throw new BadRequestException(
            'Invoice line does not belong to order',
          );
        const totals = lineTotal(line);
        calculated.push({ input: line, totals, source });
        taxableMinor += minorUnits(totals.product);
        taxMinor += minorUnits(totals.tax);
        freightMinor += minorUnits(totals.freight);
        totalMinor += minorUnits(totals.total);
      }
      const total = Number(totalMinor) / 100;
      const duplicateHash = hash({
        tenant_id: row.tenant_id,
        vendor_id: order.vendor_id,
        invoice_number: input.invoice_number.trim().toUpperCase(),
        total,
      });
      await manager.query(
        `INSERT INTO proc_invoices
           (invoice_id,proc_case_id,order_id,tenant_id,vendor_id,invoice_number,invoice_date,currency,
            taxable_amount,tax_amount,freight_amount,total_amount,status,document_object_key,
            document_hash,document_scan_status,duplicate_hash,entered_by,invoice_type)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'ENTERED',$13,$14,$15,$16,$17,$18)`,
        [
          invoiceId,
          caseId,
          orderId,
          row.tenant_id,
          order.vendor_id,
          input.invoice_number.trim(),
          input.invoice_date,
          row.currency,
          Number(taxableMinor) / 100,
          Number(taxMinor) / 100,
          Number(freightMinor) / 100,
          total,
          upload.object_key,
          upload.content_hash,
          upload.malware_scan_status,
          duplicateHash,
          actor.user_id,
          input.invoice_type ?? 'ONLINE_INSTITUTIONAL',
        ],
      );
      await manager.query(
        `UPDATE proc_document_uploads SET consumed_at=NOW()
         WHERE document_upload_id=$1`,
        [input.document_upload_id],
      );
      for (const item of calculated) {
        await manager.query(
          `INSERT INTO proc_invoice_lines (invoice_id,order_line_id,proc_case_line_id,tenant_id,quantity,unit_price,tax_amount,freight_amount,line_total)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            invoiceId,
            item.source.order_line_id,
            item.source.proc_case_line_id,
            row.tenant_id,
            item.input.quantity,
            money(item.input.unit_price),
            item.totals.tax,
            item.totals.freight,
            item.totals.total,
          ],
        );
      }
      await this.audit(
        manager,
        row,
        'INVOICE',
        invoiceId,
        'INVOICE_ENTERED',
        actor.user_id,
        null,
        { invoice_number: input.invoice_number, total_amount: total },
        requestId,
      );
      const event = await this.emit(
        manager,
        row,
        'ProcurementInvoiceSubmitted.v1',
        invoiceId,
        {
          invoice_id: invoiceId,
          invoice_revision: 1,
          document_hash: upload.content_hash,
          proc_case_id: caseId,
          order_id: orderId,
          vendor_id: order.vendor_id,
          amount: total,
          currency: row.currency,
          invoice_type: input.invoice_type ?? 'ONLINE_INSTITUTIONAL',
          invoice_lines: calculated.map((item) => ({
            order_line_id: item.source.order_line_id,
            quantity: item.input.quantity,
            unit_price: money(item.input.unit_price),
            tax_amount: item.totals.tax,
            freight_amount: item.totals.freight,
            line_total: item.totals.total,
          })),
          three_way_match_reference: null,
        },
      );
      return {
        invoice_id: invoiceId,
        status: 'ENTERED',
        total_amount: total,
        event,
        aggregate_revision: Number(row.aggregate_revision),
      };
    });
  }

  private async resolveMatchPolicy(
    manager: EntityManager,
    tenantId: string,
    category: string,
    fulfillmentType: string,
  ): Promise<ProcurementMatchPolicy> {
    const rows = await manager.query(
      `SELECT * FROM proc_match_policies
       WHERE tenant_id=$1 AND status='PUBLISHED' AND effective_from<=NOW()
         AND (effective_to IS NULL OR effective_to>NOW())
         AND category IN ($2,'*') AND fulfillment_type IN ($3,'*')
       ORDER BY (category=$2) DESC,(fulfillment_type=$3) DESC,policy_version DESC LIMIT 1`,
      [tenantId, category, fulfillmentType],
    );
    if (!rows[0])
      throw new ConflictException('No published procurement match policy');
    return rows[0] as ProcurementMatchPolicy;
  }

  async listMatchPolicies(actor: ProcurementActor, caseId: string) {
    const row = await this.accessibleCase(actor, caseId);
    return this.db.query(
      `SELECT match_policy_id,policy_version,category,fulfillment_type,status,
              quantity_tolerance,unit_price_tolerance,tax_tolerance,
              freight_tolerance,rounding_tolerance,require_receipt,
              require_service_acceptance,effective_from,effective_to,published_at
       FROM proc_match_policies
       WHERE tenant_id=$1 AND status='PUBLISHED'
         AND effective_from<=NOW() AND (effective_to IS NULL OR effective_to>NOW())
       ORDER BY category,fulfillment_type,policy_version DESC`,
      [row.tenant_id],
    );
  }

  private async evaluateInvoiceMatch(
    manager: EntityManager,
    row: CaseRow,
    invoice: Record<string, any>,
  ) {
    const invoiceLines = await manager.query(
      `SELECT il.*,ol.quantity AS ordered_quantity,ol.cancelled_quantity,ol.unit_price AS ordered_unit_price,
              ol.tax_amount AS ordered_tax,ol.freight_amount AS ordered_freight,
              COALESCE(ol.category,pcl.category,'UNPLANNED') AS category,
              COALESCE(ol.fulfillment_type,pcl.fulfillment_type,'ASSET') AS fulfillment_type,
              o.vendor_id AS order_vendor,o.currency AS order_currency,
              COALESCE((SELECT SUM(rl.accepted_quantity) FROM proc_receipt_lines rl WHERE rl.order_line_id=ol.order_line_id),0) AS received_accepted,
              COALESCE((SELECT SUM(sa.accepted_quantity) FROM proc_service_acceptances sa WHERE sa.order_line_id=ol.order_line_id AND sa.status IN ('VERIFIED','FINALIZED')),0) AS service_accepted,
              COALESCE((SELECT SUM(r.quantity) FROM proc_returns r WHERE r.order_line_id=ol.order_line_id AND r.status NOT IN ('REJECTED','CANCELLED')),0) AS returned,
              COALESCE((SELECT SUM(x.quantity) FROM proc_invoice_lines x JOIN proc_invoices pi ON pi.invoice_id=x.invoice_id WHERE x.order_line_id=ol.order_line_id AND pi.status NOT IN ('VOID','DISPUTED')),0) AS cumulative_invoiced
       FROM proc_invoice_lines il JOIN proc_order_lines ol ON ol.order_line_id=il.order_line_id
       LEFT JOIN proc_case_lines pcl ON pcl.proc_case_line_id=ol.proc_case_line_id
       JOIN proc_orders o ON o.order_id=ol.order_id WHERE il.invoice_id=$1`,
      [invoice.invoice_id],
    );
    const first = invoiceLines[0];
    if (!first) throw new BadRequestException('Invoice has no lines');
    const policy = await this.resolveMatchPolicy(
      manager,
      row.tenant_id,
      first.category,
      first.fulfillment_type,
    );
    const discrepancies: Array<Record<string, unknown>> = [];
    const dimensions: Array<Record<string, unknown>> = [];
    if (invoice.vendor_id !== first.order_vendor)
      discrepancies.push({
        dimension: 'VENDOR',
        expected: first.order_vendor,
        actual: invoice.vendor_id,
      });
    if (
      invoice.currency !== row.currency ||
      invoice.currency !== first.order_currency
    )
      discrepancies.push({
        dimension: 'CURRENCY',
        expected: row.currency,
        actual: invoice.currency,
      });
    for (const line of invoiceLines) {
      const eligible = ['SERVICE', 'INSTALLATION'].includes(
        line.fulfillment_type,
      )
        ? Number(line.service_accepted)
        : Number(line.received_accepted) - Number(line.returned);
      const quantityAllowed =
        eligible * (1 + Number(policy.quantity_tolerance) / 100);
      const priceAllowed =
        Number(line.ordered_unit_price) *
        (1 + Number(policy.unit_price_tolerance) / 100);
      const quantityPass =
        Number(line.cumulative_invoiced) <= quantityAllowed + 0.0005;
      const pricePass =
        Number(line.unit_price) <=
        priceAllowed + Number(policy.rounding_tolerance);
      const taxPass = withinTolerance(
        line.tax_amount,
        line.ordered_tax,
        policy.tax_tolerance,
        policy.rounding_tolerance,
      );
      const freightPass = withinTolerance(
        line.freight_amount,
        line.ordered_freight,
        policy.freight_tolerance,
        policy.rounding_tolerance,
      );
      dimensions.push({
        order_line_id: line.order_line_id,
        eligible_quantity: eligible,
        cumulative_invoiced: line.cumulative_invoiced,
        quantity_pass: quantityPass,
        ordered_unit_price: line.ordered_unit_price,
        invoice_unit_price: line.unit_price,
        price_pass: pricePass,
        tax_pass: taxPass,
        freight_pass: freightPass,
      });
      if (!quantityPass)
        discrepancies.push({
          dimension: 'QUANTITY',
          order_line_id: line.order_line_id,
          eligible,
          actual: line.cumulative_invoiced,
        });
      if (!pricePass)
        discrepancies.push({
          dimension: 'UNIT_PRICE',
          order_line_id: line.order_line_id,
          expected: line.ordered_unit_price,
          actual: line.unit_price,
        });
      if (!taxPass)
        discrepancies.push({
          dimension: 'TAX',
          order_line_id: line.order_line_id,
          expected: line.ordered_tax,
          actual: line.tax_amount,
        });
      if (!freightPass)
        discrepancies.push({
          dimension: 'FREIGHT',
          order_line_id: line.order_line_id,
          expected: line.ordered_freight,
          actual: line.freight_amount,
        });
    }
    const status = discrepancies.length ? 'BLOCKED' : 'MATCHED';
    const snapshot = {
      invoice_id: invoice.invoice_id,
      policy_version: policy.policy_version,
      dimensions,
      discrepancies,
      status,
    };
    const results = await manager.query(
      `INSERT INTO proc_match_results (proc_case_id,invoice_id,tenant_id,match_policy_id,policy_version,status,dimensions,discrepancies,snapshot_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9) RETURNING *`,
      [
        row.proc_case_id,
        invoice.invoice_id,
        row.tenant_id,
        policy.match_policy_id,
        policy.policy_version,
        status,
        JSON.stringify(dimensions),
        JSON.stringify(discrepancies),
        hash(snapshot),
      ],
    );
    return results[0];
  }

  async verifyInvoice(
    actor: ProcurementActor,
    caseId: string,
    invoiceId: string,
    expectedRevision: number,
  ) {
    const access = await this.accessibleCase(
      actor,
      caseId,
      'PROCUREMENT_INVOICE_VERIFY',
    );
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertRevision(row, expectedRevision);
      this.assertOpen(row);
      const invoices = await manager.query(
        `SELECT * FROM proc_invoices WHERE invoice_id=$1 AND proc_case_id=$2 FOR UPDATE`,
        [invoiceId, caseId],
      );
      const invoice = invoices[0];
      if (!invoice) throw new NotFoundException('Invoice not found');
      if (invoice.status === 'VERIFIED') return invoice;
      if (invoice.status !== 'ENTERED')
        throw new ConflictException(`Invoice is ${invoice.status}`);
      if (invoice.entered_by === actor.user_id)
        throw new ForbiddenException({
          message: 'Invoice entrant cannot verify their invoice',
          code: 'SOD_INVOICE_VERIFICATION_VIOLATION',
        });
      if (
        !invoice.document_object_key ||
        invoice.document_scan_status !== 'CLEAN'
      )
        throw new ConflictException({
          message: 'A clean invoice document is required',
          code: 'INVOICE_DOCUMENT_NOT_CLEAN',
        });
      const match = await this.evaluateInvoiceMatch(manager, row, invoice);
      if (match.status !== 'MATCHED') {
        await manager.query(
          `UPDATE proc_invoices SET status='DISPUTED',updated_at=NOW() WHERE invoice_id=$1`,
          [invoiceId],
        );
        await this.audit(
          manager,
          row,
          'INVOICE',
          invoiceId,
          'INVOICE_MATCH_BLOCKED',
          actor.user_id,
          { status: 'ENTERED' },
          { status: 'DISPUTED', match_result_id: match.match_result_id },
        );
        await manager.query(
          `UPDATE proc_cases SET aggregate_revision=aggregate_revision+1,updated_at=NOW(),last_activity_at=NOW() WHERE proc_case_id=$1`,
          [caseId],
        );
        return {
          invoice_id: invoiceId,
          status: 'DISPUTED',
          match,
          aggregate_revision: Number(row.aggregate_revision) + 1,
        };
      }
      if (
        await this.featureEnabled(
          manager,
          row.tenant_id,
          'dofa_module3_payment_gate',
        )
      ) {
        await manager.query(
          `UPDATE proc_invoices SET status='INTEGRITY_REVIEW',integrity_status='PENDING',
           verified_by=$2,verified_at=NOW(),updated_at=NOW() WHERE invoice_id=$1`,
          [invoiceId, actor.user_id],
        );
        await this.audit(
          manager,
          row,
          'INVOICE',
          invoiceId,
          'INVOICE_MATCHED',
          actor.user_id,
          { status: 'ENTERED' },
          {
            status: 'INTEGRITY_REVIEW',
            match_result_id: match.match_result_id,
          },
        );
        const event = await this.emit(
          manager,
          row,
          'ProcurementInvoiceMatched.v1',
          invoiceId,
          {
            invoice_id: invoiceId,
            invoice_revision: Number(invoice.revision),
            document_hash: invoice.document_hash,
            match_result: match,
          },
        );
        return {
          ...invoice,
          status: 'INTEGRITY_REVIEW',
          integrity_status: 'PENDING',
          match,
          event,
          aggregate_revision: Number(row.aggregate_revision),
        };
      }
      const legacy = await manager.query(
        `INSERT INTO fin_vendor_invoices
           (tenant_id,vendor_id,invoice_number,invoice_date,taxable_amount,gst_amount,tds_amount,total_amount,net_payable,status,po_id,proc_invoice_id,source_system)
         VALUES ($1,$2,$3,$4,$5,$6,0,$7,$7,'APPROVED',$8,$9,'MODULE2') RETURNING invoice_id`,
        [
          row.tenant_id,
          invoice.vendor_id,
          invoice.invoice_number,
          invoice.invoice_date,
          invoice.taxable_amount,
          invoice.tax_amount,
          invoice.total_amount,
          (
            await manager.query(
              `SELECT legacy_po_id FROM proc_orders WHERE order_id=$1`,
              [invoice.order_id],
            )
          )[0]?.legacy_po_id ?? null,
          invoiceId,
        ],
      );
      await manager.query(
        `UPDATE proc_invoices SET status='VERIFIED',verified_by=$2,verified_at=NOW(),legacy_invoice_id=$3,updated_at=NOW() WHERE invoice_id=$1`,
        [invoiceId, actor.user_id, legacy[0].invoice_id],
      );
      await this.audit(
        manager,
        row,
        'INVOICE',
        invoiceId,
        'INVOICE_VERIFIED',
        actor.user_id,
        { status: 'ENTERED' },
        { status: 'VERIFIED', match_result_id: match.match_result_id },
      );
      const event = await this.emit(
        manager,
        row,
        'ProcurementInvoiceVerified.v1',
        invoiceId,
        { invoice: { ...invoice, status: 'VERIFIED' }, match_result: match },
      );
      return {
        ...invoice,
        status: 'VERIFIED',
        match,
        event,
        aggregate_revision: Number(row.aggregate_revision),
      };
    });
  }

  async voidInvoice(
    actor: ProcurementActor,
    caseId: string,
    invoiceId: string,
    expectedRevision: number,
    reason: string,
  ) {
    if (!reason?.trim())
      throw new BadRequestException('Void reason is required');
    const access = await this.accessibleCase(
      actor,
      caseId,
      'PROCUREMENT_INVOICE_VERIFY',
    );
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertRevision(row, expectedRevision);
      this.assertOpen(row);
      const invoices = await manager.query(
        `SELECT * FROM proc_invoices WHERE invoice_id=$1 AND proc_case_id=$2 FOR UPDATE`,
        [invoiceId, caseId],
      );
      const invoice = invoices[0];
      if (!invoice) throw new NotFoundException('Invoice not found');
      if (invoice.status === 'VOID') return invoice;
      if (!['ENTERED', 'DISPUTED'].includes(invoice.status))
        throw new ConflictException(`Invoice is ${invoice.status}`);
      const payments = await manager.query(
        `SELECT payment_id FROM proc_payments WHERE invoice_id=$1 AND status='POSTED' LIMIT 1`,
        [invoiceId],
      );
      if (payments.length)
        throw new ConflictException(
          'A paid invoice must be reversed, not voided',
        );
      await manager.query(
        `UPDATE proc_invoices SET status='VOID',updated_at=NOW() WHERE invoice_id=$1`,
        [invoiceId],
      );
      await manager.query(
        `UPDATE proc_match_results
         SET status='RESOLVED',resolved_by=$2,resolved_at=NOW(),resolution_reason=$3
         WHERE invoice_id=$1 AND status='BLOCKED'`,
        [invoiceId, actor.user_id, reason.trim()],
      );
      await this.audit(
        manager,
        row,
        'INVOICE',
        invoiceId,
        'INVOICE_VOIDED',
        actor.user_id,
        { status: invoice.status },
        { status: 'VOID', reason: reason.trim() },
      );
      await manager.query(
        `UPDATE proc_cases SET aggregate_revision=aggregate_revision+1,updated_at=NOW(),last_activity_at=NOW() WHERE proc_case_id=$1`,
        [caseId],
      );
      return {
        invoice_id: invoiceId,
        status: 'VOID',
        aggregate_revision: Number(row.aggregate_revision) + 1,
      };
    });
  }

  async postPayment(
    actor: ProcurementActor,
    caseId: string,
    invoiceId: string,
    expectedRevision: number,
    input: {
      amount: number | string;
      payment_reference: string;
      payment_date: string;
    },
    idempotencyKey: string,
  ) {
    const access = await this.accessibleCase(
      actor,
      caseId,
      'PROCUREMENT_PAYMENT_POST',
    );
    if (!idempotencyKey?.trim() || !input.payment_reference?.trim())
      throw new BadRequestException(
        'Idempotency-Key and payment reference are required',
      );
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertRevision(row, expectedRevision);
      this.assertOpen(row);
      const requestHash = hash(input);
      const prior = await manager.query(
        `SELECT request_hash,response_payload FROM proc_idempotency WHERE tenant_id=$1 AND actor_id=$2 AND idempotency_key=$3`,
        [row.tenant_id, actor.user_id, idempotencyKey],
      );
      if (prior[0]) {
        if (prior[0].request_hash !== requestHash)
          throw new ConflictException({
            message: 'Idempotency key was reused with a changed payload',
            code: 'IDEMPOTENCY_PAYLOAD_CONFLICT',
          });
        if (prior[0].response_payload) return prior[0].response_payload;
      }
      const invoices = await manager.query(
        `SELECT * FROM proc_invoices WHERE invoice_id=$1 AND proc_case_id=$2 FOR UPDATE`,
        [invoiceId, caseId],
      );
      const invoice = invoices[0];
      if (!invoice) throw new NotFoundException('Invoice not found');
      if (!['VERIFIED', 'PARTIALLY_PAID'].includes(invoice.status))
        throw new ConflictException(`Invoice is ${invoice.status}`);
      const integrityEnabled = await this.featureEnabled(
        manager,
        row.tenant_id,
        'dofa_module3_payment_gate',
      );
      if (integrityEnabled) {
        const projections = await manager.query(
          `SELECT p.*,c.investigator_id,c.certifier_id,c.decision
           FROM proc_invoice_integrity_projections p
           JOIN inv_certifications c ON c.integrity_decision_id=p.integrity_decision_id
           WHERE p.invoice_id=$1 FOR UPDATE`,
          [invoiceId],
        );
        const projection = projections[0];
        const blockers = await manager.query(
          `SELECT b.blocker_id FROM inv_integrity_blockers b
           JOIN inv_integrity_cases c ON c.integrity_case_id=b.integrity_case_id
           LEFT JOIN inv_integrity_blocker_resolutions r
             ON r.blocker_id=b.blocker_id AND r.integrity_decision_id=$4
           WHERE c.invoice_id=$1 AND c.invoice_revision=$2
             AND c.document_hash=$3 AND c.workflow_state<>'SUPERSEDED'
             AND r.blocker_resolution_id IS NULL LIMIT 1`,
          [
            invoiceId,
            invoice.revision,
            invoice.document_hash,
            projection?.integrity_decision_id ?? null,
          ],
        );
        if (
          !projection ||
          !projection.payment_eligible ||
          projection.superseded_at ||
          Number(projection.invoice_revision) !== Number(invoice.revision) ||
          projection.document_hash !== invoice.document_hash ||
          !['CLEARED_AUTOMATED', 'CLEARED_HUMAN'].includes(
            projection.final_decision,
          ) ||
          blockers.length
        )
          throw new ConflictException({
            message:
              'Current invoice integrity clearance is required for payment',
            code: 'INVOICE_INTEGRITY_CLEARANCE_REQUIRED',
          });
        if (
          projection.investigator_id === actor.user_id ||
          projection.certifier_id === actor.user_id
        )
          throw new ForbiddenException({
            message:
              'Payment poster must be independent of integrity investigation and certification',
            code: 'SOD_INTEGRITY_PAYMENT_VIOLATION',
          });
      }
      if (
        invoice.entered_by === actor.user_id ||
        invoice.verified_by === actor.user_id
      )
        throw new ForbiddenException({
          message:
            'Payment poster must be independent of invoice entry and verification',
          code: 'SOD_PAYMENT_VIOLATION',
        });
      const matches = await manager.query(
        `SELECT * FROM proc_match_results WHERE invoice_id=$1 ORDER BY created_at DESC LIMIT 1`,
        [invoiceId],
      );
      if (!['MATCHED', 'RESOLVED'].includes(matches[0]?.status))
        throw new ConflictException(
          'Invoice does not have a successful three-way match',
        );
      const paid = await manager.query(
        `SELECT COALESCE(SUM(amount),0) AS amount FROM proc_payments WHERE invoice_id=$1 AND status='POSTED'`,
        [invoiceId],
      );
      const credits = await manager.query(
        `SELECT COALESCE(SUM(amount),0) AS amount FROM proc_adjustments WHERE invoice_id=$1 AND adjustment_type='CREDIT_NOTE' AND status='POSTED'`,
        [invoiceId],
      );
      const due =
        money(invoice.total_amount) -
        money(paid[0].amount) -
        money(credits[0].amount);
      const amount = money(input.amount);
      if (amount > due + 0.005)
        throw new ConflictException({
          message: 'Payment exceeds invoice balance',
          code: 'INVOICE_OVERPAYMENT',
          due,
        });
      const paymentId = randomUUID();
      await manager.query(
        `INSERT INTO proc_payments (payment_id,proc_case_id,invoice_id,tenant_id,payment_reference,amount,currency,payment_date,posted_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          paymentId,
          caseId,
          invoiceId,
          row.tenant_id,
          input.payment_reference.trim(),
          amount,
          row.currency,
          input.payment_date,
          actor.user_id,
        ],
      );
      await this.moveFunds(manager, row, {
        entryType: 'PAYMENT_POSTED',
        from: 'COMMITTED',
        to: 'EXPENDED',
        amount,
        sourceType: 'PAYMENT',
        sourceId: paymentId,
        idempotencyKey: `ledger:${idempotencyKey}`,
        actorId: actor.user_id,
      });
      const funding = await this.fundingSource(manager, row);
      await manager.query(
        `UPDATE ${funding.table} SET encumbered_amount=GREATEST(0,COALESCE(encumbered_amount,0)-$2),utilized_amount=COALESCE(utilized_amount,0)+$2 WHERE ${funding.id}=$1 AND tenant_id=$3`,
        [funding.sourceId, amount, row.tenant_id],
      );
      const status = amount >= due - 0.005 ? 'PAID' : 'PARTIALLY_PAID';
      await manager.query(
        `UPDATE proc_invoices SET status=$2,updated_at=NOW() WHERE invoice_id=$1`,
        [invoiceId, status],
      );
      if (invoice.legacy_invoice_id)
        await manager.query(
          `UPDATE fin_vendor_invoices SET status=$2,paid_at=CASE WHEN $2='PAID' THEN NOW() ELSE paid_at END WHERE invoice_id=$1 AND source_system='MODULE2'`,
          [invoice.legacy_invoice_id, status],
        );
      await this.audit(
        manager,
        row,
        'PAYMENT',
        paymentId,
        'PAYMENT_POSTED',
        actor.user_id,
        null,
        {
          invoice_id: invoiceId,
          amount,
          payment_reference: input.payment_reference,
        },
      );
      const event = await this.emit(
        manager,
        row,
        'PaymentPosted.v1',
        paymentId,
        {
          invoice_id: invoiceId,
          amount,
          currency: row.currency,
          payment_reference: input.payment_reference,
          payment_date: input.payment_date,
        },
      );
      const response = {
        payment_id: paymentId,
        status,
        amount,
        event,
        aggregate_revision: Number(row.aggregate_revision),
      };
      await manager.query(
        `INSERT INTO proc_idempotency (tenant_id,actor_id,idempotency_key,request_hash,response_status,response_payload) VALUES ($1,$2,$3,$4,201,$5::jsonb)`,
        [
          row.tenant_id,
          actor.user_id,
          idempotencyKey,
          requestHash,
          JSON.stringify(response),
        ],
      );
      return response;
    });
  }

  async enterAdjustment(
    actor: ProcurementActor,
    caseId: string,
    expectedRevision: number,
    input: {
      adjustment_type: 'ADDITIONAL_CHARGE' | 'CREDIT_NOTE' | 'REFUND';
      amount: number | string;
      order_id?: string;
      invoice_id?: string;
      return_id?: string;
      reference_number?: string;
    },
  ) {
    const access = await this.accessibleCase(
      actor,
      caseId,
      'PROCUREMENT_INVOICE_ENTRY',
    );
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertRevision(row, expectedRevision);
      this.assertOpen(row);
      const amount = money(input.amount);
      if (amount <= 0)
        throw new BadRequestException('Adjustment amount must be positive');
      if (
        input.adjustment_type === 'ADDITIONAL_CHARGE' &&
        minorUnits(amount) > minorUnits(row.available_amount)
      )
        throw new ConflictException({
          message: 'Additional charge exceeds approved allocation',
          code: 'ACQUISITION_AMENDMENT_REQUIRED',
        });
      const adjustmentId = randomUUID();
      await manager.query(
        `INSERT INTO proc_adjustments (adjustment_id,proc_case_id,order_id,invoice_id,return_id,tenant_id,adjustment_type,amount,currency,reference_number,entered_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          adjustmentId,
          caseId,
          input.order_id ?? null,
          input.invoice_id ?? null,
          input.return_id ?? null,
          row.tenant_id,
          input.adjustment_type,
          amount,
          row.currency,
          input.reference_number ?? null,
          actor.user_id,
        ],
      );
      await this.audit(
        manager,
        row,
        'ADJUSTMENT',
        adjustmentId,
        'ADJUSTMENT_ENTERED',
        actor.user_id,
        null,
        { ...input, amount },
      );
      await manager.query(
        `UPDATE proc_cases SET aggregate_revision=aggregate_revision+1,updated_at=NOW(),last_activity_at=NOW() WHERE proc_case_id=$1`,
        [caseId],
      );
      return {
        adjustment_id: adjustmentId,
        status: 'ENTERED',
        amount,
        aggregate_revision: Number(row.aggregate_revision) + 1,
      };
    });
  }

  async postAdjustment(
    actor: ProcurementActor,
    caseId: string,
    adjustmentId: string,
    expectedRevision: number,
    idempotencyKey: string,
  ) {
    const access = await this.accessibleCase(
      actor,
      caseId,
      'PROCUREMENT_PAYMENT_POST',
    );
    if (!idempotencyKey?.trim())
      throw new BadRequestException('Idempotency-Key is required');
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertRevision(row, expectedRevision);
      this.assertOpen(row);
      const adjustments = await manager.query(
        `SELECT * FROM proc_adjustments WHERE adjustment_id=$1 AND proc_case_id=$2 FOR UPDATE`,
        [adjustmentId, caseId],
      );
      const adjustment = adjustments[0];
      if (!adjustment) throw new NotFoundException('Adjustment not found');
      if (adjustment.status === 'POSTED') return adjustment;
      if (adjustment.entered_by === actor.user_id)
        throw new ForbiddenException({
          message: 'Adjustment entrant cannot verify and post it',
          code: 'SOD_ADJUSTMENT_VIOLATION',
        });
      const amount = money(adjustment.amount);
      let expendedRecovery = 0;
      let recoveryDestination: 'AVAILABLE' | 'RELEASED' = 'AVAILABLE';
      let recoveryPolicy: any = null;
      let managedReturn: any = null;
      if (
        adjustment.return_id &&
        adjustment.adjustment_type !== 'ADDITIONAL_CHARGE'
      ) {
        managedReturn = (
          await manager.query(
            `SELECT * FROM proc_returns WHERE return_id=$1 AND proc_case_id=$2 FOR UPDATE`,
            [adjustment.return_id, caseId],
          )
        )[0];
        if (managedReturn?.managed_by === 'MODULE7') {
          if (amount > money(managedReturn.attributable_value) + 0.005)
            throw new ConflictException({
              message: 'Recovery exceeds the return attributable value',
              code: 'RETURN_RECOVERY_VALUE_EXCEEDED',
            });
          recoveryPolicy = (
            await manager.query(
              `SELECT * FROM proc_financial_recovery_policies WHERE tenant_id=$1 AND status='PUBLISHED'
               AND effective_from<=NOW() AND(effective_to IS NULL OR effective_to>NOW())
               ORDER BY CASE WHEN funding_source_type='*' THEN 1 ELSE 0 END,policy_version DESC LIMIT 1`,
              [row.tenant_id],
            )
          )[0];
          if (!recoveryPolicy)
            throw new ConflictException(
              'Published financial recovery policy required',
            );
          recoveryDestination = recoveryPolicy.open_period_reusable
            ? 'AVAILABLE'
            : 'RELEASED';
        }
      }
      if (adjustment.adjustment_type === 'ADDITIONAL_CHARGE') {
        await this.moveFunds(manager, row, {
          entryType: 'ADDITIONAL_CHARGE_COMMITTED',
          from: 'AVAILABLE',
          to: 'COMMITTED',
          amount,
          sourceType: 'ADJUSTMENT',
          sourceId: adjustmentId,
          idempotencyKey,
          actorId: actor.user_id,
        });
      } else if (adjustment.adjustment_type === 'CREDIT_NOTE') {
        if (!adjustment.invoice_id)
          throw new ConflictException('Credit note must reference an invoice');
        const payments = adjustment.invoice_id
          ? await manager.query(
              `SELECT COALESCE(SUM(amount),0) AS amount FROM proc_payments WHERE invoice_id=$1 AND status='POSTED'`,
              [adjustment.invoice_id],
            )
          : [{ amount: 0 }];
        const invoiceRows = await manager.query(
          `SELECT total_amount FROM proc_invoices WHERE invoice_id=$1 AND proc_case_id=$2`,
          [adjustment.invoice_id, caseId],
        );
        const previousCredits = await manager.query(
          `SELECT COALESCE(SUM(amount),0) AS amount FROM proc_adjustments WHERE invoice_id=$1 AND adjustment_type='CREDIT_NOTE' AND status='POSTED'`,
          [adjustment.invoice_id],
        );
        const maximum =
          money(invoiceRows[0]?.total_amount) -
          money(previousCredits[0].amount);
        if (amount > maximum + 0.005)
          throw new ConflictException({
            message:
              'Credit note exceeds the remaining attributable invoice value',
            code: 'CREDIT_VALUE_EXCEEDED',
            maximum,
          });
        expendedRecovery = Math.min(
          amount,
          Math.max(
            0,
            money(payments[0].amount) - money(previousCredits[0].amount),
          ),
        );
        const committedRecovery = amount - expendedRecovery;
        if (expendedRecovery > 0)
          await this.moveFunds(manager, row, {
            entryType: 'PAID_CREDIT_POSTED',
            from: 'EXPENDED',
            to: recoveryDestination,
            amount: expendedRecovery,
            sourceType: 'ADJUSTMENT',
            sourceId: adjustmentId,
            idempotencyKey: `${idempotencyKey}:expended`,
            actorId: actor.user_id,
          });
        if (committedRecovery > 0)
          await this.moveFunds(manager, row, {
            entryType: 'UNPAID_CREDIT_POSTED',
            from: 'COMMITTED',
            to: recoveryDestination,
            amount: committedRecovery,
            sourceType: 'ADJUSTMENT',
            sourceId: adjustmentId,
            idempotencyKey: `${idempotencyKey}:committed`,
            actorId: actor.user_id,
          });
      } else {
        expendedRecovery = amount;
        await this.moveFunds(manager, row, {
          entryType: 'REFUND_POSTED',
          from: 'EXPENDED',
          to: recoveryDestination,
          amount,
          sourceType: 'ADJUSTMENT',
          sourceId: adjustmentId,
          idempotencyKey,
          actorId: actor.user_id,
        });
      }
      if (expendedRecovery > 0) {
        const funding = await this.fundingSource(manager, row);
        await manager.query(
          `UPDATE ${funding.table} SET utilized_amount=GREATEST(0,COALESCE(utilized_amount,0)-$2),encumbered_amount=COALESCE(encumbered_amount,0)+CASE WHEN $4='AVAILABLE' THEN $2 ELSE 0 END WHERE ${funding.id}=$1 AND tenant_id=$3`,
          [
            funding.sourceId,
            expendedRecovery,
            row.tenant_id,
            recoveryDestination,
          ],
        );
      }
      await manager.query(
        `UPDATE proc_adjustments SET status='POSTED',verified_by=$2,posted_by=$2 WHERE adjustment_id=$1`,
        [adjustmentId, actor.user_id],
      );
      if (
        adjustment.return_id &&
        adjustment.adjustment_type !== 'ADDITIONAL_CHARGE'
      ) {
        const financialStatus =
          adjustment.adjustment_type === 'REFUND'
            ? 'REFUND_POSTED'
            : 'CREDIT_RECEIVED';
        await manager.query(
          `UPDATE proc_returns SET financial_status=$2,updated_at=NOW()
           WHERE return_id=$1 AND proc_case_id=$3`,
          [adjustment.return_id, financialStatus, caseId],
        );
        if (managedReturn?.managed_by === 'MODULE7' && recoveryPolicy) {
          const original = money(managedReturn.attributable_value);
          await manager.query(
            `INSERT INTO proc_financial_recoveries(tenant_id,proc_case_id,return_id,adjustment_id,policy_id,original_expenditure,posted_recovery,retained_charges,net_effective_expenditure,destination_bucket,recovery_account_reference,posted_by,idempotency_key)
             VALUES($1,$2,$3,$4,$5,$6,$7,0,$8,$9,$10,$11,$12)`,
            [
              row.tenant_id,
              caseId,
              adjustment.return_id,
              adjustmentId,
              recoveryPolicy.financial_recovery_policy_id,
              original,
              amount,
              original - amount,
              recoveryDestination,
              recoveryDestination === 'RELEASED'
                ? recoveryPolicy.recovery_account_reference
                : null,
              actor.user_id,
              idempotencyKey,
            ],
          );
        }
      }
      await this.audit(
        manager,
        row,
        'ADJUSTMENT',
        adjustmentId,
        'ADJUSTMENT_POSTED',
        actor.user_id,
        { status: adjustment.status },
        { status: 'POSTED', amount },
      );
      const eventType =
        adjustment.adjustment_type === 'REFUND'
          ? 'RefundPosted.v1'
          : adjustment.adjustment_type === 'CREDIT_NOTE'
            ? 'CreditNotePosted.v1'
            : 'AdditionalChargeCommitted.v1';
      const event = await this.emit(manager, row, eventType, adjustmentId, {
        adjustment_type: adjustment.adjustment_type,
        invoice_id: adjustment.invoice_id,
        order_id: adjustment.order_id,
        amount,
        currency: row.currency,
        return_id: adjustment.return_id,
        module7_case_id: managedReturn?.module7_case_id ?? null,
        recovery_destination: recoveryDestination,
        financial_recovery_policy_version:
          recoveryPolicy?.policy_version ?? null,
      });
      return {
        ...adjustment,
        status: 'POSTED',
        event,
        aggregate_revision: Number(row.aggregate_revision),
      };
    });
  }

  async createModule7Return(
    manager: EntityManager,
    actor: ProcurementActor,
    command: Module7ReturnCommand,
  ) {
    const cases = await manager.query(
      `SELECT * FROM proc_cases WHERE proc_case_id=$1 AND tenant_id=$2 FOR UPDATE`,
      [command.proc_case_id, this.tenant(actor)],
    );
    const row = cases[0] as CaseRow | undefined;
    if (!row) throw new NotFoundException('Procurement case not found');
    this.assertOpen(row);
    const decisions = await manager.query(
      `SELECT c.workflow_status,c.active_decision_id,c.initiator_id,c.approver_id,d.decision_hash,d.decision
       FROM ret_cases c JOIN ret_decisions d ON d.decision_id=c.active_decision_id
       WHERE c.return_case_id=$1 AND c.tenant_id=$2 FOR UPDATE OF c`,
      [command.module7_case_id, row.tenant_id],
    );
    const current = decisions[0];
    if (
      !current ||
      current.active_decision_id !== command.active_decision_id ||
      current.decision_hash !== command.decision_hash ||
      current.decision !== 'APPROVED' ||
      current.workflow_status !== 'APPROVED' ||
      current.initiator_id !== command.initiator_id ||
      current.approver_id !== actor.user_id ||
      current.initiator_id === actor.user_id
    )
      throw new ConflictException({
        message: 'Module 7 decision is stale or not approved',
        code: 'RETURN_DECISION_SUPERSEDED',
      });
    const prior = await manager.query(
      `SELECT * FROM proc_returns WHERE module7_case_id=$1 FOR UPDATE`,
      [command.module7_case_id],
    );
    if (prior[0]) return prior[0];
    const lines = await manager.query(
      `SELECT rl.*,ol.line_total,ol.quantity,ol.order_line_id FROM proc_receipt_lines rl
       JOIN proc_order_lines ol ON ol.order_line_id=rl.order_line_id JOIN proc_receipts pr ON pr.receipt_id=rl.receipt_id
       WHERE rl.receipt_line_id=$1 AND pr.proc_case_id=$2 FOR UPDATE`,
      [command.receipt_line_id, row.proc_case_id],
    );
    const line = lines[0];
    if (!line) throw new NotFoundException('Receipt line not found');
    const allocationQuantity = command.allocations.reduce(
      (sum, allocation) => sum + Number(allocation.quantity),
      0,
    );
    if (Math.abs(allocationQuantity - command.quantity) > 0.0005)
      throw new ConflictException(
        'Exact subject allocations do not conserve return quantity',
      );
    const maxValue =
      (money(line.line_total) * command.quantity) / Number(line.quantity);
    if (money(command.attributable_value) > maxValue + 0.005)
      throw new ConflictException('Return value exceeds attributable value');
    const returnId = randomUUID();
    await manager.query(
      `INSERT INTO proc_returns(return_id,proc_case_id,receipt_line_id,order_line_id,tenant_id,quantity,attributable_value,reason,requested_by,approved_by,status,managed_by,module7_case_id,module7_decision_id,decision_hash,policy_snapshot_hash)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'APPROVED','MODULE7',$11,$12,$13,$14)`,
      [
        returnId,
        row.proc_case_id,
        line.receipt_line_id,
        line.order_line_id,
        row.tenant_id,
        command.quantity,
        money(command.attributable_value),
        command.reason.trim(),
        command.initiator_id,
        actor.user_id,
        command.module7_case_id,
        command.active_decision_id,
        command.decision_hash,
        command.policy_snapshot_hash,
      ],
    );
    for (const allocation of command.allocations)
      await manager.query(
        `INSERT INTO proc_return_subject_allocations(return_id,tenant_id,module7_allocation_id,subject_id,inventory_record_id,quantity) VALUES($1,$2,$3,$4,$5,$6)`,
        [
          returnId,
          row.tenant_id,
          allocation.module7_allocation_id,
          allocation.subject_id,
          allocation.inventory_record_id,
          allocation.quantity,
        ],
      );
    await this.audit(
      manager,
      row,
      'RETURN',
      returnId,
      'MODULE7_RETURN_AUTHORIZED',
      actor.user_id,
      null,
      {
        module7_case_id: command.module7_case_id,
        disposition: command.disposition,
        allocations: command.allocations,
      },
    );
    const event = await this.emit(manager, row, 'ReturnRecorded.v1', returnId, {
      status: 'APPROVED',
      managed_by: 'MODULE7',
      module7_case_id: command.module7_case_id,
      decision_id: command.active_decision_id,
      decision_hash: command.decision_hash,
      disposition: command.disposition,
      quantity: command.quantity,
      subject_allocations: command.allocations,
    });
    return { return_id: returnId, status: 'APPROVED', event };
  }

  async transitionModule7Return(
    manager: EntityManager,
    actor: ProcurementActor,
    module7CaseId: string,
    decisionId: string,
    nextStatus: 'SHIPPED' | 'VENDOR_RECEIVED' | 'RESOLVED',
  ) {
    const records = await manager.query(
      `SELECT r.*,c.aggregate_revision,c.next_event_sequence,c.status case_status,c.currency,c.acquisition_id,c.acquisition_version_id,c.budget_reservation_id,c.requester_id,c.department_id,c.approved_allocation,c.available_amount,c.committed_amount,c.expended_amount,c.released_amount
       FROM proc_returns r JOIN proc_cases c ON c.proc_case_id=r.proc_case_id
       JOIN ret_cases x ON x.return_case_id=r.module7_case_id
       WHERE r.module7_case_id=$1 AND r.tenant_id=$2 AND x.active_decision_id=$3 FOR UPDATE OF r,c,x`,
      [module7CaseId, this.tenant(actor), decisionId],
    );
    const record = records[0];
    if (!record)
      throw new ConflictException('Current Module 7 managed return not found');
    const allowed: Record<string, string> = {
      APPROVED: 'SHIPPED',
      SHIPPED: 'VENDOR_RECEIVED',
      VENDOR_RECEIVED: 'RESOLVED',
    };
    if (allowed[record.status] !== nextStatus)
      throw new ConflictException(
        `Cannot move return from ${record.status} to ${nextStatus}`,
      );
    const financialStatus =
      nextStatus === 'VENDOR_RECEIVED'
        ? 'CREDIT_EXPECTED'
        : record.financial_status;
    await manager.query(
      `UPDATE proc_returns SET status=$2,financial_status=$3,updated_at=NOW() WHERE return_id=$1`,
      [record.return_id, nextStatus, financialStatus],
    );
    const event = await this.emit(
      manager,
      record as CaseRow,
      'ReturnRecorded.v1',
      record.return_id,
      {
        previous_status: record.status,
        status: nextStatus,
        financial_status: financialStatus,
        managed_by: 'MODULE7',
        module7_case_id: module7CaseId,
        subject_allocations: await manager.query(
          `SELECT module7_allocation_id,subject_id,inventory_record_id,quantity FROM proc_return_subject_allocations WHERE return_id=$1 ORDER BY subject_id`,
          [record.return_id],
        ),
      },
    );
    return {
      ...record,
      status: nextStatus,
      financial_status: financialStatus,
      event,
    };
  }

  async createReturn(
    actor: ProcurementActor,
    caseId: string,
    expectedRevision: number,
    input: CreateReturnInput,
  ) {
    const access = await this.accessibleCase(
      actor,
      caseId,
      'PROCUREMENT_RECEIPT_ENTRY',
    );
    if (!input.reason?.trim())
      throw new BadRequestException('Return reason is required');
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertRevision(row, expectedRevision);
      this.assertOpen(row);
      const lines = await manager.query(
        `SELECT rl.*,ol.line_total,ol.quantity,
           COALESCE((SELECT SUM(r.quantity) FROM proc_returns r WHERE r.receipt_line_id=rl.receipt_line_id AND r.status NOT IN ('REJECTED','CANCELLED')),0) AS returned
         FROM proc_receipt_lines rl JOIN proc_order_lines ol ON ol.order_line_id=rl.order_line_id
         JOIN proc_receipts pr ON pr.receipt_id=rl.receipt_id
         WHERE rl.receipt_line_id=$1 AND pr.proc_case_id=$2 FOR UPDATE`,
        [input.receipt_line_id, caseId],
      );
      const line = lines[0];
      if (!line) throw new NotFoundException('Receipt line not found');
      if (
        Number(line.returned) + input.quantity >
        Number(line.accepted_quantity) + 0.0005
      )
        throw new ConflictException({
          message:
            'Return quantity exceeds accepted quantity available for return',
          code: 'RETURN_QUANTITY_EXCEEDED',
        });
      const maxValue =
        (money(line.line_total) * input.quantity) / Number(line.quantity);
      if (money(input.attributable_value) > maxValue + 0.005)
        throw new ConflictException({
          message: 'Return value exceeds attributable accepted value',
          code: 'RETURN_VALUE_EXCEEDED',
          max_value: maxValue,
        });
      const returnId = randomUUID();
      await manager.query(
        `INSERT INTO proc_returns (return_id,proc_case_id,receipt_line_id,order_line_id,tenant_id,quantity,attributable_value,reason,requested_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          returnId,
          caseId,
          input.receipt_line_id,
          line.order_line_id,
          row.tenant_id,
          input.quantity,
          money(input.attributable_value),
          input.reason.trim(),
          actor.user_id,
        ],
      );
      await this.audit(
        manager,
        row,
        'RETURN',
        returnId,
        'RETURN_REQUESTED',
        actor.user_id,
        null,
        input,
      );
      const event = await this.emit(
        manager,
        row,
        'ReturnRecorded.v1',
        returnId,
        { status: 'REQUESTED', ...input, order_line_id: line.order_line_id },
      );
      return {
        return_id: returnId,
        status: 'REQUESTED',
        financial_status: 'NONE',
        event,
        aggregate_revision: Number(row.aggregate_revision),
      };
    });
  }

  async transitionReturn(
    actor: ProcurementActor,
    caseId: string,
    returnId: string,
    expectedRevision: number,
    nextStatus:
      | 'APPROVED'
      | 'SHIPPED'
      | 'VENDOR_RECEIVED'
      | 'RESOLVED'
      | 'REJECTED'
      | 'CANCELLED',
  ) {
    const access = await this.accessibleCase(
      actor,
      caseId,
      'PROCUREMENT_RECEIPT_ENTRY',
    );
    const transitions: Record<string, string[]> = {
      REQUESTED: ['APPROVED', 'REJECTED', 'CANCELLED'],
      APPROVED: ['SHIPPED', 'CANCELLED'],
      SHIPPED: ['VENDOR_RECEIVED'],
      VENDOR_RECEIVED: ['RESOLVED'],
    };
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertRevision(row, expectedRevision);
      this.assertOpen(row);
      const records = await manager.query(
        `SELECT * FROM proc_returns WHERE return_id=$1 AND proc_case_id=$2 FOR UPDATE`,
        [returnId, caseId],
      );
      const record = records[0];
      if (!record) throw new NotFoundException('Return not found');
      if (record.managed_by === 'MODULE7')
        throw new ForbiddenException({
          message:
            'Module 7 managed returns can only be advanced by the Return/DOA workflow',
          code: 'MODULE7_RETURN_BYPASS_REJECTED',
        });
      if (!transitions[record.status]?.includes(nextStatus))
        throw new ConflictException(
          `Cannot move return from ${record.status} to ${nextStatus}`,
        );
      if (nextStatus === 'APPROVED' && record.requested_by === actor.user_id)
        throw new ForbiddenException({
          message: 'Return requester cannot approve their return',
          code: 'SOD_RETURN_APPROVAL_VIOLATION',
        });
      const financialStatus =
        nextStatus === 'VENDOR_RECEIVED'
          ? 'CREDIT_EXPECTED'
          : record.financial_status;
      await manager.query(
        `UPDATE proc_returns SET status=$2,financial_status=$3,approved_by=CASE WHEN $2='APPROVED' THEN $4 ELSE approved_by END,updated_at=NOW() WHERE return_id=$1`,
        [returnId, nextStatus, financialStatus, actor.user_id],
      );
      await this.audit(
        manager,
        row,
        'RETURN',
        returnId,
        'RETURN_STATUS_CHANGED',
        actor.user_id,
        { status: record.status },
        { status: nextStatus, financial_status: financialStatus },
      );
      const event = await this.emit(
        manager,
        row,
        'ReturnRecorded.v1',
        returnId,
        {
          previous_status: record.status,
          status: nextStatus,
          financial_status: financialStatus,
          quantity: record.quantity,
        },
      );
      return {
        ...record,
        status: nextStatus,
        financial_status: financialStatus,
        event,
        aggregate_revision: Number(row.aggregate_revision),
      };
    });
  }

  async recordRepair(
    actor: ProcurementActor,
    caseId: string,
    expectedRevision: number,
    input: { receipt_line_id: string; quantity: number; notes?: string },
  ) {
    const access = await this.accessibleCase(
      actor,
      caseId,
      'PROCUREMENT_RECEIPT_ENTRY',
    );
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertRevision(row, expectedRevision);
      this.assertOpen(row);
      const lines = await manager.query(
        `SELECT rl.* FROM proc_receipt_lines rl JOIN proc_receipts r ON r.receipt_id=rl.receipt_id WHERE rl.receipt_line_id=$1 AND r.proc_case_id=$2`,
        [input.receipt_line_id, caseId],
      );
      if (!lines[0] || input.quantity > Number(lines[0].accepted_quantity))
        throw new ConflictException(
          'Repair quantity exceeds accepted receipt quantity',
        );
      const repairId = randomUUID();
      await manager.query(
        `INSERT INTO proc_repairs (repair_id,proc_case_id,receipt_line_id,tenant_id,quantity,notes,requested_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          repairId,
          caseId,
          input.receipt_line_id,
          row.tenant_id,
          input.quantity,
          input.notes ?? null,
          actor.user_id,
        ],
      );
      await this.audit(
        manager,
        row,
        'REPAIR',
        repairId,
        'REPAIR_REQUESTED',
        actor.user_id,
        null,
        input,
      );
      await manager.query(
        `UPDATE proc_cases SET aggregate_revision=aggregate_revision+1,updated_at=NOW(),last_activity_at=NOW() WHERE proc_case_id=$1`,
        [caseId],
      );
      return {
        repair_id: repairId,
        status: 'REQUESTED',
        aggregate_revision: Number(row.aggregate_revision) + 1,
      };
    });
  }

  async recordDownstreamStatus(
    actor: ProcurementActor,
    caseId: string,
    input: DownstreamStatusInput,
  ) {
    const access = await this.accessibleCase(
      actor,
      caseId,
      'PROCUREMENT_AUDIT_VIEW',
    );
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      const duplicate = await manager.query(
        `SELECT * FROM proc_downstream_status WHERE source_event_id=$1`,
        [input.source_event_id],
      );
      if (duplicate[0]) return duplicate[0];
      const latest = await manager.query(
        `SELECT aggregate_sequence FROM proc_downstream_status WHERE proc_case_line_id=$1 AND status_type=$2 ORDER BY aggregate_sequence DESC LIMIT 1`,
        [input.proc_case_line_id, input.status_type],
      );
      if (
        latest[0] &&
        Number(input.aggregate_sequence) <= Number(latest[0].aggregate_sequence)
      )
        throw new ConflictException({
          message: 'Older downstream status cannot overwrite newer state',
          code: 'STALE_DOWNSTREAM_EVENT',
        });
      const inserted = await manager.query(
        `INSERT INTO proc_downstream_status (proc_case_id,proc_case_line_id,tenant_id,source_event_id,source_module,status_type,status,aggregate_sequence,payload,occurred_at)
         SELECT $1,pcl.proc_case_line_id,$2,$3,$4,$5,$6,$7,$8::jsonb,$9 FROM proc_case_lines pcl
         WHERE pcl.proc_case_line_id=$10 AND pcl.proc_case_id=$1 RETURNING *`,
        [
          caseId,
          row.tenant_id,
          input.source_event_id,
          input.source_module,
          input.status_type,
          input.status,
          input.aggregate_sequence,
          JSON.stringify(input.payload ?? {}),
          input.occurred_at,
          input.proc_case_line_id,
        ],
      );
      if (!inserted[0])
        throw new NotFoundException('Procurement case line not found');
      await this.audit(
        manager,
        row,
        'DOWNSTREAM_STATUS',
        inserted[0].downstream_status_id,
        'DOWNSTREAM_STATUS_RECORDED',
        actor.user_id,
        null,
        input,
      );
      await manager.query(
        `UPDATE proc_cases SET aggregate_revision=aggregate_revision+1,updated_at=NOW(),last_activity_at=NOW() WHERE proc_case_id=$1`,
        [caseId],
      );
      return {
        ...inserted[0],
        aggregate_revision: Number(row.aggregate_revision) + 1,
      };
    });
  }

  async finalizationReadiness(actor: ProcurementActor, caseId: string) {
    const row = await this.accessibleCase(actor, caseId);
    const lines = await this.db.query(
      `SELECT pcl.*,
         COALESCE((SELECT SUM(rl.accepted_quantity) FROM proc_receipt_lines rl WHERE rl.proc_case_line_id=pcl.proc_case_line_id),0) AS received,
         COALESCE((SELECT SUM(sa.accepted_quantity) FROM proc_service_acceptances sa JOIN proc_order_lines ol ON ol.order_line_id=sa.order_line_id WHERE ol.proc_case_line_id=pcl.proc_case_line_id AND sa.status IN ('VERIFIED','FINALIZED')),0) AS service_accepted,
         COALESCE((SELECT SUM(r.quantity) FROM proc_returns r JOIN proc_order_lines ol ON ol.order_line_id=r.order_line_id WHERE ol.proc_case_line_id=pcl.proc_case_line_id AND r.status NOT IN ('REJECTED','CANCELLED')),0) AS returned
       FROM proc_case_lines pcl WHERE pcl.proc_case_id=$1 ORDER BY pcl.line_number`,
      [caseId],
    );
    const module4GateEnabled = lines.some((line: Record<string, any>) =>
      ['ASSET', 'CONSUMABLE'].includes(line.fulfillment_type),
    )
      ? await this.featureEnabled(
          this.db.manager ?? (this.db as unknown as EntityManager),
          row.tenant_id,
          'dofa_module4_inventory_gate',
        )
      : false;
    const downstream = await this.db.query(
      `SELECT DISTINCT ON (proc_case_line_id,status_type) proc_case_line_id,status_type,status
       FROM proc_downstream_status WHERE proc_case_id=$1 ORDER BY proc_case_line_id,status_type,aggregate_sequence DESC`,
      [caseId],
    );
    const lineChecks = lines.map((line: Record<string, any>) => {
      const fulfilled = ['SERVICE', 'INSTALLATION'].includes(
        line.fulfillment_type,
      )
        ? Number(line.service_accepted)
        : Number(line.received) - Number(line.returned);
      const quantityResolved =
        fulfilled + Number(line.cancelled_quantity) >=
        Number(line.approved_quantity) - 0.0005;
      const status = (type: string) =>
        downstream.find(
          (d: Record<string, any>) =>
            d.proc_case_line_id === line.proc_case_line_id &&
            d.status_type === type,
        )?.status;
      const finalized = (type: string) =>
        ['FINALIZED', 'NOT_REQUIRED'].includes(status(type));
      let downstreamReady = true;
      if (line.fulfillment_type === 'ASSET')
        downstreamReady =
          (!module4GateEnabled || finalized('PHYSICAL_VERIFICATION')) &&
          finalized('ASSET_ID_ALLOCATION') &&
          finalized('INVENTORY_INGESTION');
      if (line.fulfillment_type === 'CONSUMABLE')
        downstreamReady =
          (!module4GateEnabled || finalized('PHYSICAL_VERIFICATION')) &&
          (finalized('CONSUMABLE_LEDGER') || finalized('INVENTORY_INGESTION'));
      return {
        proc_case_line_id: line.proc_case_line_id,
        fulfillment_type: line.fulfillment_type,
        approved_quantity: Number(line.approved_quantity),
        fulfilled_quantity: fulfilled,
        cancelled_quantity: Number(line.cancelled_quantity),
        quantity_resolved: quantityResolved,
        downstream_ready: downstreamReady,
        ready: quantityResolved && downstreamReady,
      };
    });
    const blockers: Array<Record<string, unknown>> = [];
    if (lineChecks.some((line) => !line.ready))
      blockers.push({
        type: 'LINES_INCOMPLETE',
        lines: lineChecks.filter((line) => !line.ready),
      });
    const invoices = await this.db.query(
      `SELECT invoice_id,status FROM proc_invoices WHERE proc_case_id=$1 AND status NOT IN ('PAID','VOID','FINALIZED')`,
      [caseId],
    );
    if (invoices.length)
      blockers.push({ type: 'INVOICES_UNRESOLVED', invoices });
    const returns = await this.db.query(
      `SELECT return_id,status,financial_status FROM proc_returns WHERE proc_case_id=$1 AND (status NOT IN ('RESOLVED','REJECTED','CANCELLED') OR financial_status IN ('CREDIT_EXPECTED','REFUND_EXPECTED'))`,
      [caseId],
    );
    if (returns.length) blockers.push({ type: 'RETURNS_UNRESOLVED', returns });
    const discrepancies = await this.db.query(
      `SELECT match_result_id,status FROM proc_match_results WHERE proc_case_id=$1 AND status='BLOCKED'`,
      [caseId],
    );
    if (discrepancies.length)
      blockers.push({ type: 'MATCH_DISCREPANCIES', discrepancies });
    if (money(row.committed_amount) > 0)
      blockers.push({
        type: 'OPEN_COMMITMENT',
        amount: money(row.committed_amount),
      });
    return {
      ready: blockers.length === 0,
      line_checks: lineChecks,
      blockers,
      buckets: {
        approved: money(row.approved_allocation),
        available: money(row.available_amount),
        committed: money(row.committed_amount),
        expended: money(row.expended_amount),
        released: money(row.released_amount),
      },
    };
  }

  async applyPhysicalVerificationCompletion(eventId: string) {
    return this.db.transaction(async (manager) => {
      const existing = await manager.query(
        `SELECT * FROM proc_physical_verification_event_consumption WHERE event_id=$1`,
        [eventId],
      );
      if (existing[0]) return { duplicate: true };
      const events = await manager.query(
        `SELECT * FROM pv_outbox_events WHERE event_id=$1
           AND event_type='PhysicalVerificationLineCompleted.v1' FOR UPDATE`,
        [eventId],
      );
      const event = events[0];
      if (!event)
        throw new NotFoundException('Physical verification event not found');
      if (hash(event.payload) !== event.payload_hash)
        throw new ConflictException({
          message: 'Physical verification event hash mismatch',
          code: 'EVENT_HASH_MISMATCH',
        });
      const payload = event.payload as Record<string, any>;
      const caseLines = await manager.query(
        `SELECT pcl.*,pc.aggregate_revision FROM proc_case_lines pcl
         JOIN proc_cases pc ON pc.proc_case_id=pcl.proc_case_id
         WHERE pcl.proc_case_line_id=$1 AND pcl.proc_case_id=$2 AND pcl.tenant_id=$3 FOR UPDATE OF pcl`,
        [
          payload.proc_case_line_id,
          event.payload.proc_case_id,
          event.tenant_id,
        ],
      );
      const line = caseLines[0];
      if (!line) throw new NotFoundException('Procurement case line not found');
      const verification = await manager.query(
        `WITH case_totals AS (
           SELECT c.verification_case_id,c.workflow_state,
                  c.eligible_quantity-COALESCE((SELECT SUM(r.quantity) FROM proc_returns r
                    WHERE r.receipt_line_id=c.receipt_line_id AND r.status='RESOLVED'),0) AS eligible_quantity
           FROM pv_cases c WHERE c.proc_case_line_id=$1
         )
         SELECT COUNT(*) FILTER (WHERE ct.workflow_state<>'CLOSED')::int AS open_cases,
                COALESCE(SUM(ct.eligible_quantity),0) AS eligible_quantity,
                COALESCE((SELECT SUM(s.subject_quantity) FROM pv_subjects s
                  JOIN pv_verification_identities i ON i.subject_id=s.subject_id AND i.status='ACTIVE'
                  JOIN pv_cases c ON c.verification_case_id=s.verification_case_id
                  WHERE c.proc_case_line_id=$1 AND s.status='ACTIVE'),0) AS verified_quantity
         FROM case_totals ct`,
        [line.proc_case_line_id],
      );
      const aggregate = verification[0];
      const finalized =
        payload.status === 'FINALIZED' &&
        Number(aggregate.open_cases) === 0 &&
        Math.abs(
          Number(aggregate.eligible_quantity) -
            Number(aggregate.verified_quantity),
        ) <= 0.0005;
      const sequences = await manager.query(
        `SELECT COALESCE(MAX(aggregate_sequence),0)+1 AS next FROM proc_downstream_status
         WHERE proc_case_line_id=$1 AND status_type='PHYSICAL_VERIFICATION'`,
        [line.proc_case_line_id],
      );
      const statusId = randomUUID();
      await manager.query(
        `INSERT INTO proc_downstream_status
         (downstream_status_id,proc_case_id,proc_case_line_id,tenant_id,source_event_id,
          source_module,status_type,status,aggregate_sequence,payload,occurred_at)
         VALUES ($1,$2,$3,$4,$5,'MODULE_4','PHYSICAL_VERIFICATION',$6,$7,$8::jsonb,$9)`,
        [
          statusId,
          line.proc_case_id,
          line.proc_case_line_id,
          line.tenant_id,
          eventId,
          finalized ? 'FINALIZED' : 'PENDING',
          sequences[0].next,
          JSON.stringify({
            source_aggregate_sequence: Number(event.aggregate_sequence),
            source_verification_case_id: event.verification_case_id,
            eligible_quantity: Number(aggregate.eligible_quantity),
            verified_quantity: Number(aggregate.verified_quantity),
            reason: payload.reason ?? null,
          }),
          event.occurred_at,
        ],
      );
      await manager.query(
        `INSERT INTO proc_physical_verification_event_consumption
         (event_id,tenant_id,proc_case_id,proc_case_line_id) VALUES ($1,$2,$3,$4)`,
        [eventId, line.tenant_id, line.proc_case_id, line.proc_case_line_id],
      );
      await manager.query(
        `UPDATE proc_cases SET aggregate_revision=aggregate_revision+1,updated_at=NOW(),last_activity_at=NOW() WHERE proc_case_id=$1`,
        [line.proc_case_id],
      );
      return {
        proc_case_line_id: line.proc_case_line_id,
        status: finalized ? 'FINALIZED' : 'PENDING',
        verified_quantity: Number(aggregate.verified_quantity),
      };
    });
  }

  async applyInventoryLineCompletion(eventId: string) {
    return this.db.transaction(async (manager) => {
      if (
        (
          await manager.query(
            `SELECT 1 FROM proc_inventory_event_consumption WHERE event_id=$1`,
            [eventId],
          )
        )[0]
      )
        return { duplicate: true };
      const events = await manager.query(
        `SELECT * FROM inv_outbox_events WHERE event_id=$1 AND event_type='InventoryLineCompleted.v1' FOR UPDATE`,
        [eventId],
      );
      const event = events[0];
      if (!event)
        throw new NotFoundException('Inventory completion event not found');
      if (hash(event.payload) !== event.payload_hash)
        throw new ConflictException({
          message: 'Inventory event hash mismatch',
          code: 'EVENT_HASH_MISMATCH',
        });
      const payload = event.payload as Record<string, any>;
      const lines = await manager.query(
        `SELECT pcl.* FROM proc_case_lines pcl WHERE pcl.proc_case_line_id=$1 AND pcl.proc_case_id=$2 AND pcl.tenant_id=$3 FOR UPDATE`,
        [payload.proc_case_line_id, payload.proc_case_id, event.tenant_id],
      );
      const line = lines[0];
      if (!line) throw new NotFoundException('Procurement case line not found');
      const statuses = [
        ['ASSET_ID_ALLOCATION', payload.asset_id_allocation],
        ['RFID_ALLOCATION', payload.rfid_allocation],
        ['INVENTORY_INGESTION', payload.inventory_ingestion],
        ['CONSUMABLE_LEDGER', payload.consumable_ledger],
      ];
      for (const [statusType, status] of statuses) {
        if (!['PENDING', 'FINALIZED', 'NOT_REQUIRED'].includes(String(status)))
          throw new ConflictException('Invalid inventory completion status');
        const sequences = await manager.query(
          `SELECT COALESCE(MAX(aggregate_sequence),0)+1 next FROM proc_downstream_status WHERE proc_case_line_id=$1 AND status_type=$2`,
          [line.proc_case_line_id, statusType],
        );
        await manager.query(
          `INSERT INTO proc_downstream_status(downstream_status_id,proc_case_id,proc_case_line_id,tenant_id,source_event_id,source_module,status_type,status,aggregate_sequence,payload,occurred_at)
           VALUES($1,$2,$3,$4,$5,'MODULE_5',$6,$7,$8,$9::jsonb,$10)`,
          [
            randomUUID(),
            line.proc_case_id,
            line.proc_case_line_id,
            line.tenant_id,
            randomUUID(),
            statusType,
            status,
            sequences[0].next,
            JSON.stringify({
              source_event_id: eventId,
              source_aggregate_sequence: event.aggregate_sequence,
            }),
            event.occurred_at,
          ],
        );
      }
      await manager.query(
        `INSERT INTO proc_inventory_event_consumption(event_id,tenant_id,proc_case_id,proc_case_line_id) VALUES($1,$2,$3,$4)`,
        [eventId, line.tenant_id, line.proc_case_id, line.proc_case_line_id],
      );
      await manager.query(
        `UPDATE proc_cases SET aggregate_revision=aggregate_revision+1,updated_at=NOW(),last_activity_at=NOW() WHERE proc_case_id=$1`,
        [line.proc_case_id],
      );
      return {
        proc_case_line_id: line.proc_case_line_id,
        statuses: Object.fromEntries(statuses),
      };
    });
  }

  async finalize(
    actor: ProcurementActor,
    caseId: string,
    expectedRevision: number,
    idempotencyKey: string,
  ) {
    const access = await this.accessibleCase(
      actor,
      caseId,
      'PROCUREMENT_AUDIT_VIEW',
    );
    if (!idempotencyKey?.trim())
      throw new BadRequestException('Idempotency-Key is required');
    const prior = await this.db.query(
      `SELECT response_payload FROM proc_idempotency
       WHERE tenant_id=$1 AND actor_id=$2 AND idempotency_key=$3`,
      [access.tenant_id, actor.user_id, idempotencyKey],
    );
    if (prior[0]?.response_payload) return prior[0].response_payload;
    const readiness = await this.finalizationReadiness(actor, caseId);
    if (!readiness.ready)
      throw new ConflictException({
        message: 'Procurement case is not ready to finalize',
        code: 'FINALIZATION_BLOCKED',
        blockers: readiness.blockers,
      });
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertRevision(row, expectedRevision);
      this.assertOpen(row);
      const release = money(row.available_amount);
      if (release > 0) {
        await this.moveFunds(manager, row, {
          entryType: 'UNUSED_ALLOCATION_RELEASED',
          from: 'AVAILABLE',
          to: 'RELEASED',
          amount: release,
          sourceType: 'PROC_CASE',
          sourceId: caseId,
          idempotencyKey,
          actorId: actor.user_id,
        });
        const funding = await this.fundingSource(manager, row);
        await manager.query(
          `UPDATE ${funding.table} SET encumbered_amount=GREATEST(0,COALESCE(encumbered_amount,0)-$2) WHERE ${funding.id}=$1 AND tenant_id=$3`,
          [funding.sourceId, release, row.tenant_id],
        );
      }
      await manager.query(
        `INSERT INTO acq_budget_reservation_events (budget_reservation_id,tenant_id,event_type,amount,reason,actor_user_id,proc_case_id) VALUES ($1,$2,'COMMITTED',$3,'Procurement case finalized',$4,$5)`,
        [
          row.budget_reservation_id,
          row.tenant_id,
          money(row.expended_amount),
          actor.user_id,
          caseId,
        ],
      );
      await manager.query(
        `UPDATE proc_cases SET status='FINALIZED',finalized_at=NOW(),finalized_by=$2,updated_at=NOW() WHERE proc_case_id=$1`,
        [caseId, actor.user_id],
      );
      await manager.query(
        `UPDATE proc_orders SET progress_status='FINALIZED',status=CASE WHEN status='CANCELLED' THEN status ELSE 'CLOSED' END WHERE proc_case_id=$1`,
        [caseId],
      );
      await manager.query(
        `UPDATE proc_invoices SET status=CASE WHEN status='PAID' THEN 'FINALIZED' ELSE status END WHERE proc_case_id=$1`,
        [caseId],
      );
      await this.audit(
        manager,
        row,
        'PROC_CASE',
        caseId,
        'PROCUREMENT_FINALIZED',
        actor.user_id,
        { status: row.status },
        { status: 'FINALIZED', released_amount: release },
      );
      const event = await this.emit(
        manager,
        row,
        'ProcurementFinalized.v1',
        caseId,
        {
          financial_summary: {
            approved_allocation: money(row.approved_allocation),
            expended_amount: money(row.expended_amount),
            released_amount: money(row.released_amount),
          },
          line_checks: readiness.line_checks,
        },
      );
      const response = {
        proc_case_id: caseId,
        status: 'FINALIZED',
        released_amount: release,
        event,
        aggregate_revision: Number(row.aggregate_revision),
      };
      await manager.query(
        `INSERT INTO proc_idempotency
           (tenant_id,actor_id,idempotency_key,request_hash,response_status,response_payload)
         VALUES ($1,$2,$3,$4,200,$5::jsonb)`,
        [
          row.tenant_id,
          actor.user_id,
          idempotencyKey,
          hash({ caseId, action: 'FINALIZE' }),
          JSON.stringify(response),
        ],
      );
      return response;
    });
  }
}
