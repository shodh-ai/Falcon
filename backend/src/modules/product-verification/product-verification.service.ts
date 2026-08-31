/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call -- TypeORM query rows are untyped */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { createPublicKey, randomBytes, randomUUID } from 'crypto';
import type { EntityManager } from 'typeorm';
import { DataSource } from 'typeorm';
import type {
  AnalyzeSubjectInput,
  CreateLotInput,
  InvoiceAllocationInput,
  ObservedAttribute,
  PolicyAttribute,
  ProductVerificationActor,
} from './product-verification.types';
import {
  calculateCoverageConfidence,
  compareAttribute,
  evaluateGeofence,
  signVerificationPayload,
  verifyVerificationPayload,
  verificationHash,
} from './product-verification.util';

const DEFAULT_TENANT = 'a0000000-0000-4000-8000-000000000001';

type VerificationCase = Record<string, any> & {
  verification_case_id: string;
  tenant_id: string;
  proc_case_id: string;
  proc_case_line_id: string;
  acquisition_line_id: string;
  order_line_id: string;
  receipt_line_id: string;
  department_id?: number | null;
  subject_type: 'ITEM' | 'LOT';
  aggregate_revision: number | string;
  next_event_sequence: number | string;
  workflow_state: string;
};

@Injectable()
export class ProductVerificationService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly config: ConfigService,
  ) {}

  private tenant(actor: ProductVerificationActor) {
    return actor.tenant_id ?? DEFAULT_TENANT;
  }

  private roles(actor: ProductVerificationActor) {
    return [
      ...new Set([...(actor.roles ?? []), ...(actor.role ? [actor.role] : [])]),
    ].map((role) => role.toLowerCase());
  }

  private grants(actor: ProductVerificationActor, capability: string) {
    return this.db.query(
      `SELECT scope_type,scope_reference FROM acq_access_grants
       WHERE tenant_id=$1 AND capability=$2 AND valid_from<=NOW()
         AND (valid_until IS NULL OR valid_until>NOW())
         AND (principal_user_id=$3::uuid OR lower(principal_role)=ANY($4::text[]))`,
      [this.tenant(actor), capability, actor.user_id, this.roles(actor)],
    );
  }

  private async accessibleCase(
    actor: ProductVerificationActor,
    caseId: string,
    capability = 'PRODUCT_VERIFICATION_VIEW',
  ) {
    const grants = await this.grants(actor, capability);
    const tenantWide = grants.some(
      (grant: Record<string, any>) => grant.scope_type === 'TENANT',
    );
    const departments = grants
      .filter((grant: Record<string, any>) => grant.scope_type === 'DEPARTMENT')
      .map((grant: Record<string, any>) => Number(grant.scope_reference))
      .filter(Number.isInteger);
    const rows = await this.db.query(
      `SELECT c.* FROM pv_cases c WHERE c.verification_case_id=$1 AND c.tenant_id=$2
         AND ($3::boolean OR c.department_id=ANY($4::int[]))`,
      [caseId, this.tenant(actor), tenantWide, departments],
    );
    if (!rows[0])
      throw new NotFoundException('Product verification case not found');
    if (!grants.length)
      throw new ForbiddenException({
        message: `Missing scoped capability ${capability}`,
        code: 'PRODUCT_VERIFICATION_CAPABILITY_REQUIRED',
      });
    return rows[0] as VerificationCase;
  }

  authorizeView(actor: ProductVerificationActor, caseId: string) {
    return this.accessibleCase(actor, caseId);
  }

  private async lockedCase(
    manager: EntityManager,
    caseId: string,
    tenantId: string,
  ) {
    const rows = await manager.query(
      `SELECT * FROM pv_cases WHERE verification_case_id=$1 AND tenant_id=$2 FOR UPDATE`,
      [caseId, tenantId],
    );
    if (!rows[0])
      throw new NotFoundException('Product verification case not found');
    return rows[0] as VerificationCase;
  }

  private assertRevision(row: VerificationCase, expected: number) {
    if (!Number.isInteger(expected) || expected <= 0)
      throw new BadRequestException('If-Match revision is required');
    if (Number(row.aggregate_revision) !== expected)
      throw new ConflictException({
        message: 'Product verification case changed concurrently',
        code: 'STALE_PRODUCT_VERIFICATION_REVISION',
        current_revision: Number(row.aggregate_revision),
      });
  }

  private assertOpen(row: VerificationCase) {
    if (['CLOSED', 'CANCELLED', 'SUPERSEDED'].includes(row.workflow_state))
      throw new ConflictException(`Verification case is ${row.workflow_state}`);
  }

  private async audit(
    manager: EntityManager,
    row: VerificationCase,
    subjectId: string | null,
    entityType: string,
    entityId: string,
    eventType: string,
    actorId: string | null,
    previousValues: unknown,
    newValues: unknown,
  ) {
    const previous = await manager.query(
      `SELECT event_hash FROM pv_audit_events WHERE verification_case_id=$1
       ORDER BY created_at DESC,audit_event_id DESC LIMIT 1`,
      [row.verification_case_id],
    );
    const previousHash = previous[0]?.event_hash ?? null;
    const eventHash = verificationHash({
      verification_case_id: row.verification_case_id,
      subjectId,
      entityType,
      entityId,
      eventType,
      actorId,
      previousValues,
      newValues,
      case_revision: Number(row.aggregate_revision) + 1,
      previousHash,
    });
    await manager.query(
      `INSERT INTO pv_audit_events
       (tenant_id,verification_case_id,subject_id,entity_type,entity_id,event_type,
        actor_user_id,previous_values,new_values,case_revision,previous_event_hash,event_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12)`,
      [
        row.tenant_id,
        row.verification_case_id,
        subjectId,
        entityType,
        entityId,
        eventType,
        actorId,
        previousValues == null ? null : JSON.stringify(previousValues),
        newValues == null ? null : JSON.stringify(newValues),
        Number(row.aggregate_revision) + 1,
        previousHash,
        eventHash,
      ],
    );
  }

  private async emit(
    manager: EntityManager,
    row: VerificationCase,
    subjectId: string | null,
    eventType: string,
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
      aggregate_id: row.verification_case_id,
      aggregate_revision: revision,
      aggregate_sequence: sequence,
      tenant_id: row.tenant_id,
      verification_case_id: row.verification_case_id,
      subject_id: subjectId,
      proc_case_id: row.proc_case_id,
      occurred_at: occurredAt,
      ...payload,
    };
    await manager.query(
      `INSERT INTO pv_outbox_events
       (event_id,tenant_id,verification_case_id,subject_id,aggregate_id,aggregate_revision,
        aggregate_sequence,event_type,event_version,occurred_at,payload,payload_hash)
       VALUES ($1,$2,$3,$4,$3,$5,$6,$7,1,$8,$9::jsonb,$10)`,
      [
        eventId,
        row.tenant_id,
        row.verification_case_id,
        subjectId,
        revision,
        sequence,
        eventType,
        occurredAt,
        JSON.stringify(envelope),
        verificationHash(envelope),
      ],
    );
    await manager.query(
      `UPDATE pv_cases SET aggregate_revision=$2,next_event_sequence=$3,updated_at=NOW()
       WHERE verification_case_id=$1`,
      [row.verification_case_id, revision, sequence + 1],
    );
    row.aggregate_revision = revision;
    row.next_event_sequence = sequence + 1;
    return envelope;
  }

  private async withIdempotency<T>(
    manager: EntityManager,
    row: VerificationCase,
    actorId: string,
    key: string,
    request: unknown,
    work: () => Promise<T>,
  ): Promise<T> {
    if (!key?.trim())
      throw new BadRequestException('Idempotency-Key is required');
    const requestHash = verificationHash(request);
    const prior = await manager.query(
      `SELECT request_hash,response_payload FROM pv_idempotency
       WHERE tenant_id=$1 AND actor_id=$2 AND idempotency_key=$3 FOR UPDATE`,
      [row.tenant_id, actorId, key],
    );
    if (prior[0]) {
      if (prior[0].request_hash !== requestHash)
        throw new ConflictException({
          message: 'Idempotency key reused with changed payload',
          code: 'IDEMPOTENCY_PAYLOAD_CONFLICT',
        });
      if (prior[0].response_payload) return prior[0].response_payload as T;
    } else {
      await manager.query(
        `INSERT INTO pv_idempotency(tenant_id,actor_id,idempotency_key,request_hash)
         VALUES ($1,$2,$3,$4)`,
        [row.tenant_id, actorId, key, requestHash],
      );
    }
    const response = await work();
    await manager.query(
      `UPDATE pv_idempotency SET response_payload=$4::jsonb
       WHERE tenant_id=$1 AND actor_id=$2 AND idempotency_key=$3`,
      [row.tenant_id, actorId, key, JSON.stringify(response)],
    );
    return response;
  }

  async consumeGoodsReceipt(eventId: string) {
    return this.db.transaction(async (manager) => {
      const consumed = await manager.query(
        `SELECT 1 FROM pv_consumed_events WHERE event_id=$1`,
        [eventId],
      );
      if (consumed[0]) return { duplicate: true };
      const events = await manager.query(
        `SELECT * FROM proc_outbox_events WHERE event_id=$1 AND event_type='GoodsReceiptRecorded.v1' FOR UPDATE`,
        [eventId],
      );
      const event = events[0];
      if (!event) throw new NotFoundException('Goods receipt event not found');
      if (verificationHash(event.payload) !== event.payload_hash)
        throw new ConflictException({
          message: 'Event hash mismatch',
          code: 'EVENT_HASH_MISMATCH',
        });
      const receiptId = event.aggregate_id;
      const lines = await manager.query(
        `SELECT rl.*,r.order_id,ol.acquisition_line_id,o.vendor_id,pcl.proc_case_id,
                pcl.fulfillment_type,pcl.unit,pcl.category,pc.department_id
         FROM proc_receipt_lines rl
         JOIN proc_receipts r ON r.receipt_id=rl.receipt_id
         JOIN proc_order_lines ol ON ol.order_line_id=rl.order_line_id
         JOIN proc_orders o ON o.order_id=r.order_id
         JOIN proc_case_lines pcl ON pcl.proc_case_line_id=rl.proc_case_line_id
         JOIN proc_cases pc ON pc.proc_case_id=pcl.proc_case_id
         WHERE rl.receipt_id=$1 AND rl.tenant_id=$2 AND rl.accepted_quantity>0
           AND pcl.fulfillment_type IN ('ASSET','CONSUMABLE')`,
        [receiptId, event.tenant_id],
      );
      const created: string[] = [];
      for (const line of lines) {
        const caseId = randomUUID();
        const subjectType = line.fulfillment_type === 'ASSET' ? 'ITEM' : 'LOT';
        const cases = await manager.query(
          `INSERT INTO pv_cases
           (verification_case_id,tenant_id,proc_case_id,proc_case_line_id,acquisition_line_id,
            order_id,order_line_id,receipt_id,receipt_line_id,vendor_id,department_id,source_event_id,
            subject_type,eligible_quantity,unit_of_measure)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           ON CONFLICT (receipt_line_id) DO NOTHING RETURNING *`,
          [
            caseId,
            event.tenant_id,
            line.proc_case_id,
            line.proc_case_line_id,
            line.acquisition_line_id,
            line.order_id,
            line.order_line_id,
            receiptId,
            line.receipt_line_id,
            line.vendor_id,
            line.department_id,
            eventId,
            subjectType,
            line.accepted_quantity,
            line.unit,
          ],
        );
        if (!cases[0]) continue;
        const row = cases[0] as VerificationCase;
        if (subjectType === 'ITEM') {
          const quantity = Number(line.accepted_quantity);
          if (!Number.isInteger(quantity))
            throw new ConflictException(
              'Asset receipt quantity must be integral',
            );
          for (let sequence = 1; sequence <= quantity; sequence += 1) {
            await manager.query(
              `INSERT INTO pv_subjects
               (verification_case_id,tenant_id,subject_type,subject_sequence,subject_quantity,
                unit_of_measure,status)
               VALUES ($1,$2,'ITEM',$3,1,$4,'ACTIVE')`,
              [caseId, row.tenant_id, sequence, line.unit],
            );
          }
        }
        await this.audit(
          manager,
          row,
          null,
          'VERIFICATION_CASE',
          caseId,
          'CASE_OPENED',
          null,
          null,
          {
            receipt_line_id: line.receipt_line_id,
            subject_type: subjectType,
            eligible_quantity: Number(line.accepted_quantity),
          },
        );
        await this.emit(manager, row, null, 'PhysicalVerificationStarted.v1', {
          receipt_line_id: line.receipt_line_id,
          subject_type: subjectType,
          eligible_quantity: Number(line.accepted_quantity),
        });
        created.push(caseId);
      }
      await manager.query(
        `INSERT INTO pv_consumed_events(event_id,tenant_id,event_type)
         VALUES ($1,$2,'GoodsReceiptRecorded.v1')`,
        [eventId, event.tenant_id],
      );
      return { created_case_ids: created };
    });
  }

  async list(actor: ProductVerificationActor, state?: string) {
    const grants = await this.grants(actor, 'PRODUCT_VERIFICATION_VIEW');
    const tenantWide = grants.some(
      (grant: Record<string, any>) => grant.scope_type === 'TENANT',
    );
    const departments = grants
      .filter((grant: Record<string, any>) => grant.scope_type === 'DEPARTMENT')
      .map((grant: Record<string, any>) => Number(grant.scope_reference))
      .filter(Number.isInteger);
    if (!grants.length)
      throw new ForbiddenException(
        'Product verification view capability is required',
      );
    return this.db.query(
      `SELECT c.*,pcl.product_name,pcl.category,r.receipt_number,o.order_number,
              COUNT(s.subject_id)::int AS subject_count,
              COUNT(s.subject_id) FILTER (WHERE i.status='ACTIVE')::int AS verified_count
       FROM pv_cases c
       JOIN proc_case_lines pcl ON pcl.proc_case_line_id=c.proc_case_line_id
       JOIN proc_receipts r ON r.receipt_id=c.receipt_id
       JOIN proc_orders o ON o.order_id=c.order_id
       LEFT JOIN pv_subjects s ON s.verification_case_id=c.verification_case_id
       LEFT JOIN pv_verification_identities i ON i.subject_id=s.subject_id
       WHERE c.tenant_id=$1 AND ($2::boolean OR c.department_id=ANY($3::int[]))
         AND ($4::text IS NULL OR c.workflow_state=$4)
       GROUP BY c.verification_case_id,pcl.product_name,pcl.category,r.receipt_number,o.order_number
       ORDER BY c.updated_at DESC`,
      [this.tenant(actor), tenantWide, departments, state ?? null],
    );
  }

  async dashboard(actor: ProductVerificationActor) {
    const rows = await this.list(actor);
    return {
      total_cases: rows.length,
      awaiting_capture: rows.filter((row: any) =>
        ['QUEUED', 'CAPTURING', 'AWAITING_EVIDENCE'].includes(
          row.workflow_state,
        ),
      ).length,
      manual_review: rows.filter(
        (row: any) => row.workflow_state === 'MANUAL_REVIEW',
      ).length,
      closed: rows.filter((row: any) => row.workflow_state === 'CLOSED').length,
      subjects: rows.reduce(
        (sum: number, row: any) => sum + Number(row.subject_count),
        0,
      ),
      verified_subjects: rows.reduce(
        (sum: number, row: any) => sum + Number(row.verified_count),
        0,
      ),
    };
  }

  async get(actor: ProductVerificationActor, caseId: string) {
    const row = await this.accessibleCase(actor, caseId);
    const [
      context,
      subjects,
      invoiceLines,
      sessions,
      evidence,
      analyses,
      comparisons,
      blockers,
      reviews,
      decisions,
      identities,
      inventory,
      audit,
    ] = await Promise.all([
      this.db.query(
        `SELECT pcl.*,al.brand,al.model_number,al.part_number,al.technical_specifications,
                al.product_description,al.product_url,r.receipt_number,o.order_number,v.business_name AS vendor_name
         FROM proc_case_lines pcl JOIN acq_lines al ON al.line_id=pcl.acquisition_line_id
         JOIN proc_receipts r ON r.receipt_id=$1 JOIN proc_orders o ON o.order_id=$2
         JOIN fin_vendors v ON v.vendor_id=$3 WHERE pcl.proc_case_line_id=$4`,
        [row.receipt_id, row.order_id, row.vendor_id, row.proc_case_line_id],
      ),
      this.db.query(
        `SELECT * FROM pv_subjects WHERE verification_case_id=$1 ORDER BY subject_sequence`,
        [caseId],
      ),
      this.db.query(
        `SELECT il.invoice_line_id,il.invoice_id,il.quantity,il.unit_price,il.line_total,
                i.invoice_number,i.revision AS invoice_revision,i.document_hash,
                p.final_decision AS integrity_decision,p.trust_level,p.superseded_at
         FROM proc_invoice_lines il JOIN proc_invoices i ON i.invoice_id=il.invoice_id
         LEFT JOIN proc_invoice_integrity_projections p ON p.invoice_id=i.invoice_id
         WHERE il.order_line_id=$1 ORDER BY i.invoice_date,i.invoice_number`,
        [row.order_line_id],
      ),
      this.db.query(
        `SELECT capture_session_id,subject_id,required_views,capture_mode,status,created_by,expires_at,completed_at,created_at FROM pv_capture_sessions WHERE verification_case_id=$1 ORDER BY created_at`,
        [caseId],
      ),
      this.db.query(
        `SELECT evidence_id,subject_id,capture_session_id,view_type,media_type,content_hash,byte_size,mime_type,server_captured_at,client_captured_at,latitude,longitude,accuracy_metres,geofence_result,captured_by,metadata FROM pv_evidence WHERE verification_case_id=$1 ORDER BY created_at`,
        [caseId],
      ),
      this.db.query(
        `SELECT * FROM pv_analyses WHERE verification_case_id=$1 ORDER BY created_at`,
        [caseId],
      ),
      this.db.query(
        `SELECT ac.* FROM pv_attribute_comparisons ac JOIN pv_analyses a ON a.analysis_id=ac.analysis_id WHERE a.verification_case_id=$1 ORDER BY ac.created_at`,
        [caseId],
      ),
      this.db.query(
        `SELECT * FROM pv_blockers WHERE verification_case_id=$1 ORDER BY created_at`,
        [caseId],
      ),
      this.db.query(
        `SELECT * FROM pv_review_recommendations WHERE verification_case_id=$1 ORDER BY created_at`,
        [caseId],
      ),
      this.db.query(
        `SELECT * FROM pv_decisions WHERE verification_case_id=$1 ORDER BY decided_at`,
        [caseId],
      ),
      this.db.query(
        `SELECT verification_identity_id,verification_id,subject_id,verification_revision,verification_code,verification_record_hash,evidence_manifest_hash,signature_algorithm,signing_key_version,status,issued_at,revoked_at,superseded_by FROM pv_verification_identities WHERE subject_id IN (SELECT subject_id FROM pv_subjects WHERE verification_case_id=$1) ORDER BY issued_at`,
        [caseId],
      ),
      this.db.query(
        `SELECT * FROM pv_inventory_identity_projections WHERE subject_id IN (SELECT subject_id FROM pv_subjects WHERE verification_case_id=$1) ORDER BY source_aggregate_sequence`,
        [caseId],
      ),
      this.db.query(
        `SELECT * FROM pv_audit_events WHERE verification_case_id=$1 ORDER BY created_at`,
        [caseId],
      ),
    ]);
    return {
      ...row,
      context: context[0],
      subjects,
      eligible_invoice_lines: invoiceLines,
      capture_sessions: sessions,
      evidence,
      analyses,
      comparisons,
      blockers,
      review_recommendations: reviews,
      decisions,
      identities,
      inventory_projections: inventory,
      audit_timeline: audit,
    };
  }

  async createLot(
    actor: ProductVerificationActor,
    caseId: string,
    expectedRevision: number,
    input: CreateLotInput,
  ) {
    const access = await this.accessibleCase(
      actor,
      caseId,
      'PRODUCT_VERIFICATION_CAPTURE',
    );
    if (
      !Number.isFinite(input.observed_quantity) ||
      input.observed_quantity <= 0
    )
      throw new BadRequestException('Observed lot quantity must be positive');
    if (!input.unit_of_measure?.trim())
      throw new BadRequestException('Unit of measure is required');
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertRevision(row, expectedRevision);
      this.assertOpen(row);
      if (row.subject_type !== 'LOT')
        throw new ConflictException('Only consumable cases use lot subjects');
      const totals = await manager.query(
        `SELECT COALESCE(SUM(subject_quantity),0) AS allocated FROM pv_subjects
         WHERE verification_case_id=$1 AND status='ACTIVE' FOR UPDATE`,
        [caseId],
      );
      const returned = await manager.query(
        `SELECT COALESCE(SUM(quantity),0) AS returned FROM proc_returns
         WHERE receipt_line_id=$1 AND status='RESOLVED'`,
        [row.receipt_line_id],
      );
      const eligible =
        Number(row.eligible_quantity) - Number(returned[0]?.returned ?? 0);
      if (
        Number(totals[0].allocated) + input.observed_quantity >
        eligible + 0.0005
      )
        throw new ConflictException({
          message:
            'Lot quantities exceed accepted quantity available for verification',
          code: 'LOT_QUANTITY_EXCEEDED',
          available_quantity: eligible - Number(totals[0].allocated),
        });
      const sequences = await manager.query(
        `SELECT COALESCE(MAX(subject_sequence),0)+1 AS next FROM pv_subjects WHERE verification_case_id=$1`,
        [caseId],
      );
      const subjectId = randomUUID();
      await manager.query(
        `INSERT INTO pv_subjects
         (subject_id,verification_case_id,tenant_id,subject_type,subject_sequence,subject_quantity,
          unit_of_measure,batch_number,expiry_date,manufacture_date,manufacturer,created_by)
         VALUES ($1,$2,$3,'LOT',$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          subjectId,
          caseId,
          row.tenant_id,
          sequences[0].next,
          input.observed_quantity,
          input.unit_of_measure.trim(),
          input.batch_number?.trim() ?? null,
          input.expiry_date ?? null,
          input.manufacture_date ?? null,
          input.manufacturer?.trim() ?? null,
          actor.user_id,
        ],
      );
      await this.audit(
        manager,
        row,
        subjectId,
        'SUBJECT',
        subjectId,
        'LOT_CREATED',
        actor.user_id,
        null,
        input,
      );
      await manager.query(
        `UPDATE pv_cases SET workflow_state='CAPTURING' WHERE verification_case_id=$1`,
        [caseId],
      );
      await this.emit(
        manager,
        row,
        subjectId,
        'PhysicalVerificationSubjectCreated.v1',
        {
          subject_type: 'LOT',
          subject_quantity: input.observed_quantity,
          unit_of_measure: input.unit_of_measure,
        },
      );
      return {
        subject_id: subjectId,
        aggregate_revision: Number(row.aggregate_revision),
      };
    });
  }

  async allocateInvoice(
    actor: ProductVerificationActor,
    caseId: string,
    subjectId: string,
    expectedRevision: number,
    input: InvoiceAllocationInput,
  ) {
    const access = await this.accessibleCase(
      actor,
      caseId,
      'PRODUCT_VERIFICATION_CAPTURE',
    );
    if (
      !Number.isFinite(input.allocated_quantity) ||
      input.allocated_quantity <= 0
    )
      throw new BadRequestException('Allocated quantity must be positive');
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertRevision(row, expectedRevision);
      this.assertOpen(row);
      const subjects = await manager.query(
        `SELECT * FROM pv_subjects WHERE subject_id=$1 AND verification_case_id=$2 FOR UPDATE`,
        [subjectId, caseId],
      );
      const subject = subjects[0];
      if (!subject) throw new NotFoundException('Physical subject not found');
      const invoices = await manager.query(
        `SELECT il.*,i.revision,i.document_hash,p.final_decision,p.integrity_case_id,
                p.integrity_decision_id,p.superseded_at,i.status AS invoice_status
         FROM proc_invoice_lines il JOIN proc_invoices i ON i.invoice_id=il.invoice_id
         JOIN proc_invoice_integrity_projections p ON p.invoice_id=i.invoice_id
         WHERE il.invoice_line_id=$1 AND il.order_line_id=$2 AND i.tenant_id=$3 FOR UPDATE`,
        [input.invoice_line_id, row.order_line_id, row.tenant_id],
      );
      const invoice = invoices[0];
      if (
        !invoice ||
        invoice.superseded_at ||
        !['CLEARED_AUTOMATED', 'CLEARED_HUMAN'].includes(invoice.final_decision)
      )
        throw new ConflictException({
          message: 'A current Module 3-cleared invoice line is required',
          code: 'INVOICE_CLEARANCE_REQUIRED',
        });
      const existing = await manager.query(
        `SELECT COALESCE(SUM(allocated_quantity),0) AS allocated FROM pv_invoice_allocations WHERE subject_id=$1 FOR UPDATE`,
        [subjectId],
      );
      if (
        Number(existing[0].allocated) + input.allocated_quantity >
        Number(subject.subject_quantity) + 0.0005
      )
        throw new ConflictException(
          'Invoice allocations exceed subject quantity',
        );
      const invoiceAllocated = await manager.query(
        `SELECT COALESCE(SUM(allocated_quantity),0) AS allocated FROM pv_invoice_allocations WHERE invoice_line_id=$1 AND invoice_revision=$2 FOR UPDATE`,
        [input.invoice_line_id, invoice.revision],
      );
      if (
        Number(invoiceAllocated[0].allocated) + input.allocated_quantity >
        Number(invoice.quantity) + 0.0005
      )
        throw new ConflictException(
          'Allocation exceeds eligible cleared invoice quantity',
        );
      const id = randomUUID();
      await manager.query(
        `INSERT INTO pv_invoice_allocations
         (invoice_allocation_id,tenant_id,subject_id,invoice_id,invoice_line_id,integrity_case_id,
          integrity_decision_id,invoice_revision,document_hash,integrity_decision,allocated_quantity)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          id,
          row.tenant_id,
          subjectId,
          invoice.invoice_id,
          input.invoice_line_id,
          invoice.integrity_case_id,
          invoice.integrity_decision_id,
          invoice.revision,
          invoice.document_hash,
          invoice.final_decision,
          input.allocated_quantity,
        ],
      );
      await this.audit(
        manager,
        row,
        subjectId,
        'INVOICE_ALLOCATION',
        id,
        'INVOICE_ALLOCATED',
        actor.user_id,
        null,
        input,
      );
      await manager.query(
        `UPDATE pv_cases SET aggregate_revision=aggregate_revision+1,updated_at=NOW() WHERE verification_case_id=$1`,
        [caseId],
      );
      return {
        invoice_allocation_id: id,
        aggregate_revision: Number(row.aggregate_revision) + 1,
      };
    });
  }

  async publishGeofence(
    actor: ProductVerificationActor,
    input: {
      campus_reference?: string;
      geometry_type: 'CIRCLE' | 'POLYGON';
      geometry: Record<string, unknown>;
      maximum_accuracy_metres?: number;
    },
  ) {
    const grants = await this.grants(
      actor,
      'PRODUCT_VERIFICATION_POLICY_ADMIN',
    );
    if (!grants.length)
      throw new ForbiddenException(
        'Policy administration capability is required',
      );
    if (!['CIRCLE', 'POLYGON'].includes(input.geometry_type))
      throw new BadRequestException('Geometry type must be CIRCLE or POLYGON');
    if (input.geometry_type === 'CIRCLE') {
      const geometry = input.geometry as Record<string, number>;
      if (
        ![geometry.latitude, geometry.longitude, geometry.radius_metres].every(
          Number.isFinite,
        ) ||
        geometry.radius_metres <= 0
      )
        throw new BadRequestException(
          'Circle latitude, longitude, and positive radius are required',
        );
    } else {
      const points = (input.geometry as Record<string, any>).points;
      if (!Array.isArray(points) || points.length < 3)
        throw new BadRequestException('Polygon requires at least three points');
    }
    const accuracy = Number(input.maximum_accuracy_metres ?? 50);
    if (!Number.isFinite(accuracy) || accuracy <= 0 || accuracy > 500)
      throw new BadRequestException(
        'Maximum GPS accuracy must be between 0 and 500 metres',
      );
    return this.db.transaction(async (manager) => {
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `pv-geofence:${this.tenant(actor)}:${input.campus_reference ?? '*'}`,
      ]);
      const versions = await manager.query(
        `SELECT COALESCE(MAX(policy_version),0)+1 AS next FROM pv_geofence_policies
         WHERE tenant_id=$1 AND campus_reference=$2`,
        [this.tenant(actor), input.campus_reference ?? '*'],
      );
      await manager.query(
        `UPDATE pv_geofence_policies SET status='SUPERSEDED',effective_to=NOW()
         WHERE tenant_id=$1 AND campus_reference=$2 AND status='PUBLISHED'`,
        [this.tenant(actor), input.campus_reference ?? '*'],
      );
      const rows = await manager.query(
        `INSERT INTO pv_geofence_policies
         (tenant_id,campus_reference,policy_version,status,geometry_type,geometry,
          maximum_accuracy_metres,published_by,published_at)
         VALUES ($1,$2,$3,'PUBLISHED',$4,$5::jsonb,$6,$7,NOW()) RETURNING *`,
        [
          this.tenant(actor),
          input.campus_reference ?? '*',
          versions[0].next,
          input.geometry_type,
          JSON.stringify(input.geometry),
          accuracy,
          actor.user_id,
        ],
      );
      return rows[0];
    });
  }

  async publishVerificationPolicy(
    actor: ProductVerificationActor,
    input: {
      category?: string;
      subject_type: 'ITEM' | 'LOT';
      attributes: PolicyAttribute[];
      required_views: string[];
      automated_min_coverage?: number;
      automated_min_confidence?: number;
      maximum_media_count?: number;
      session_validity_seconds?: number;
      exception_types?: string[];
    },
  ) {
    const grants = await this.grants(
      actor,
      'PRODUCT_VERIFICATION_POLICY_ADMIN',
    );
    if (!grants.length)
      throw new ForbiddenException(
        'Policy administration capability is required',
      );
    if (!['ITEM', 'LOT'].includes(input.subject_type))
      throw new BadRequestException('Subject type must be ITEM or LOT');
    if (!Array.isArray(input.attributes) || !input.attributes.length)
      throw new BadRequestException(
        'At least one policy attribute is required',
      );
    if (
      input.attributes.some(
        (attribute) =>
          !attribute.attribute_name?.trim() ||
          !Number.isFinite(Number(attribute.weight)) ||
          Number(attribute.weight) <= 0 ||
          !['DISABLED', 'OPTIONAL', 'REQUIRED_FOR_AUTOMATION'].includes(
            attribute.ai_mode,
          ),
      )
    )
      throw new BadRequestException('Policy attributes are invalid');
    if (
      new Set(input.attributes.map((attribute) => attribute.attribute_name))
        .size !== input.attributes.length
    )
      throw new BadRequestException('Policy attribute names must be unique');
    if (!Array.isArray(input.required_views) || !input.required_views.length)
      throw new BadRequestException(
        'At least one required capture view is required',
      );
    const category = input.category?.trim() || '*';
    const coverage = Number(input.automated_min_coverage ?? 90);
    const confidence = Number(input.automated_min_confidence ?? 85);
    if (
      ![coverage, confidence].every(
        (score) => Number.isFinite(score) && score >= 0 && score <= 100,
      )
    )
      throw new BadRequestException(
        'Coverage and confidence thresholds must be between 0 and 100',
      );
    return this.db.transaction(async (manager) => {
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `pv-policy:${this.tenant(actor)}:${category}:${input.subject_type}`,
      ]);
      const versions = await manager.query(
        `SELECT COALESCE(MAX(policy_version),0)+1 AS next FROM pv_verification_policies
         WHERE tenant_id=$1 AND category=$2 AND subject_type=$3`,
        [this.tenant(actor), category, input.subject_type],
      );
      await manager.query(
        `UPDATE pv_verification_policies SET status='SUPERSEDED',effective_to=NOW()
         WHERE tenant_id=$1 AND category=$2 AND subject_type=$3 AND status='PUBLISHED'`,
        [this.tenant(actor), category, input.subject_type],
      );
      const rows = await manager.query(
        `INSERT INTO pv_verification_policies
         (tenant_id,category,subject_type,policy_version,status,attributes,required_views,
          automated_min_coverage,automated_min_confidence,maximum_media_count,
          session_validity_seconds,exception_types,published_by,published_at)
         VALUES ($1,$2,$3,$4,'PUBLISHED',$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11::jsonb,$12,NOW())
         RETURNING *`,
        [
          this.tenant(actor),
          category,
          input.subject_type,
          versions[0].next,
          JSON.stringify(input.attributes),
          JSON.stringify(input.required_views),
          coverage,
          confidence,
          Math.min(50, Math.max(1, Number(input.maximum_media_count ?? 12))),
          Math.min(
            3600,
            Math.max(60, Number(input.session_validity_seconds ?? 900)),
          ),
          JSON.stringify(
            input.exception_types ?? [
              'NON_MATERIAL',
              'COSMETIC',
              'GEOFENCE',
              'SUPERVISED_CAPTURE',
            ],
          ),
          actor.user_id,
        ],
      );
      return rows[0];
    });
  }

  async createCaptureException(
    actor: ProductVerificationActor,
    caseId: string,
    subjectId: string,
    expectedRevision: number,
    input: {
      exception_type: string;
      reason: string;
      validity_minutes?: number;
    },
  ) {
    const access = await this.accessibleCase(
      actor,
      caseId,
      'PRODUCT_VERIFICATION_REVIEW',
    );
    if (
      ![
        'CAMERA_UNAVAILABLE',
        'LOCATION_UNAVAILABLE',
        'GEOFENCE',
        'SUPERVISED_CAPTURE',
      ].includes(input.exception_type)
    )
      throw new BadRequestException('Unsupported capture exception type');
    if (!input.reason?.trim() || input.reason.trim().length < 10)
      throw new BadRequestException(
        'A meaningful exception reason is required',
      );
    const minutes = Math.min(
      60,
      Math.max(1, Number(input.validity_minutes ?? 15)),
    );
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertRevision(row, expectedRevision);
      this.assertOpen(row);
      const subject = await manager.query(
        `SELECT 1 FROM pv_subjects WHERE subject_id=$1 AND verification_case_id=$2 AND status='ACTIVE'`,
        [subjectId, caseId],
      );
      if (!subject[0])
        throw new NotFoundException('Physical subject not found');
      const id = randomUUID();
      await manager.query(
        `INSERT INTO pv_capture_exceptions
         (capture_exception_id,tenant_id,verification_case_id,subject_id,exception_type,reason,issued_by,expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()+($8||' minutes')::interval)`,
        [
          id,
          row.tenant_id,
          caseId,
          subjectId,
          input.exception_type,
          input.reason.trim(),
          actor.user_id,
          minutes,
        ],
      );
      await this.audit(
        manager,
        row,
        subjectId,
        'CAPTURE_EXCEPTION',
        id,
        'CAPTURE_EXCEPTION_ISSUED',
        actor.user_id,
        null,
        input,
      );
      await manager.query(
        `UPDATE pv_cases SET aggregate_revision=aggregate_revision+1,workflow_state='CAPTURING',updated_at=NOW() WHERE verification_case_id=$1`,
        [caseId],
      );
      return {
        capture_exception_id: id,
        expires_in_minutes: minutes,
        aggregate_revision: Number(row.aggregate_revision) + 1,
      };
    });
  }

  async createCaptureSession(
    actor: ProductVerificationActor,
    caseId: string,
    subjectId: string,
    expectedRevision: number,
    idempotencyKey: string,
    input: { capture_exception_id?: string; campus_reference?: string },
  ) {
    const access = await this.accessibleCase(
      actor,
      caseId,
      'PRODUCT_VERIFICATION_CAPTURE',
    );
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertRevision(row, expectedRevision);
      this.assertOpen(row);
      return this.withIdempotency(
        manager,
        row,
        actor.user_id,
        idempotencyKey,
        input,
        async () => {
          const subjects = await manager.query(
            `SELECT * FROM pv_subjects WHERE subject_id=$1 AND verification_case_id=$2 AND status='ACTIVE' FOR UPDATE`,
            [subjectId, caseId],
          );
          const subject = subjects[0];
          if (!subject)
            throw new NotFoundException('Physical subject not found');
          const context = await manager.query(
            `SELECT pcl.category FROM proc_case_lines pcl WHERE pcl.proc_case_line_id=$1`,
            [row.proc_case_line_id],
          );
          const policies = await manager.query(
            `SELECT * FROM pv_verification_policies WHERE tenant_id=$1 AND subject_type=$2
             AND category IN ($3,'*') AND status='PUBLISHED' AND effective_from<=NOW()
             AND (effective_to IS NULL OR effective_to>NOW())
           ORDER BY CASE WHEN category=$3 THEN 0 ELSE 1 END,policy_version DESC LIMIT 1`,
            [row.tenant_id, subject.subject_type, context[0]?.category ?? '*'],
          );
          const policy = policies[0];
          if (!policy)
            throw new ConflictException(
              'No published physical verification policy applies',
            );
          const geofences = await manager.query(
            `SELECT * FROM pv_geofence_policies WHERE tenant_id=$1 AND campus_reference IN ($2,'*')
             AND status='PUBLISHED' AND effective_from<=NOW() AND (effective_to IS NULL OR effective_to>NOW())
           ORDER BY CASE WHEN campus_reference=$2 THEN 0 ELSE 1 END,policy_version DESC LIMIT 1`,
            [row.tenant_id, input.campus_reference ?? '*'],
          );
          const geofence = geofences[0];
          if (!geofence)
            throw new ConflictException({
              message: 'A published geofence policy is required before capture',
              code: 'GEOFENCE_POLICY_REQUIRED',
            });
          let captureException: any = null;
          if (input.capture_exception_id) {
            const exceptions = await manager.query(
              `SELECT * FROM pv_capture_exceptions WHERE capture_exception_id=$1 AND subject_id=$2
               AND issued_by<>$3 AND expires_at>NOW() AND consumed_at IS NULL FOR UPDATE`,
              [input.capture_exception_id, subjectId, actor.user_id],
            );
            captureException = exceptions[0];
            if (!captureException)
              throw new ConflictException(
                'Capture exception is invalid, expired, or not independent',
              );
          }
          const nonce = randomBytes(32).toString('base64url');
          const sessionId = randomUUID();
          const sessions = await manager.query(
            `INSERT INTO pv_capture_sessions
           (capture_session_id,tenant_id,verification_case_id,subject_id,verification_policy_id,
            geofence_policy_id,policy_version,single_use_nonce_hash,required_views,maximum_media_count,
            capture_mode,capture_exception_id,created_by,expires_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,
                   NOW()+($14||' seconds')::interval)
           RETURNING capture_session_id,subject_id,required_views,maximum_media_count,maximum_media_size,
                     capture_mode,policy_version,status,expires_at`,
            [
              sessionId,
              row.tenant_id,
              caseId,
              subjectId,
              policy.verification_policy_id,
              geofence.geofence_policy_id,
              policy.policy_version,
              verificationHash(nonce),
              JSON.stringify(policy.required_views),
              policy.maximum_media_count,
              captureException ? 'SUPERVISED_EXCEPTION' : 'LIVE',
              captureException?.capture_exception_id ?? null,
              actor.user_id,
              policy.session_validity_seconds,
            ],
          );
          if (captureException)
            await manager.query(
              `UPDATE pv_capture_exceptions SET consumed_at=NOW() WHERE capture_exception_id=$1`,
              [captureException.capture_exception_id],
            );
          await this.audit(
            manager,
            row,
            subjectId,
            'CAPTURE_SESSION',
            sessionId,
            'CAPTURE_SESSION_CREATED',
            actor.user_id,
            null,
            {
              capture_mode: captureException ? 'SUPERVISED_EXCEPTION' : 'LIVE',
              required_views: policy.required_views,
            },
          );
          await manager.query(
            `UPDATE pv_cases SET workflow_state='CAPTURING' WHERE verification_case_id=$1`,
            [caseId],
          );
          await this.emit(
            manager,
            row,
            subjectId,
            'PhysicalCaptureSessionCreated.v1',
            {
              capture_session_id: sessionId,
              capture_mode: captureException ? 'SUPERVISED_EXCEPTION' : 'LIVE',
            },
          );
          return {
            ...sessions[0],
            nonce,
            aggregate_revision: Number(row.aggregate_revision),
          };
        },
      );
    });
  }

  async registerEvidence(
    actor: ProductVerificationActor,
    caseId: string,
    sessionId: string,
    idempotencyKey: string,
    input: {
      view_type: string;
      media_type: 'IMAGE' | 'VIDEO';
      object_key: string;
      derivative_object_key?: string;
      content_hash: string;
      byte_size: number;
      mime_type: string;
      nonce: string;
      client_captured_at?: string;
      latitude?: number;
      longitude?: number;
      accuracy_metres?: number;
      session_fingerprint_hash: string;
      sanitized_device_metadata?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    },
  ) {
    const access = await this.accessibleCase(
      actor,
      caseId,
      'PRODUCT_VERIFICATION_CAPTURE',
    );
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertOpen(row);
      if (!idempotencyKey?.trim())
        throw new BadRequestException('Idempotency-Key is required');
      const requestHash = verificationHash({ sessionId, input });
      const prior = await manager.query(
        `SELECT request_hash,response_payload FROM pv_idempotency
         WHERE tenant_id=$1 AND actor_id=$2 AND idempotency_key=$3 FOR UPDATE`,
        [row.tenant_id, actor.user_id, idempotencyKey],
      );
      if (prior[0]) {
        if (prior[0].request_hash !== requestHash)
          throw new ConflictException({
            message: 'Idempotency key reused with changed payload',
            code: 'IDEMPOTENCY_PAYLOAD_CONFLICT',
          });
        if (prior[0].response_payload) return prior[0].response_payload;
      } else {
        await manager.query(
          `INSERT INTO pv_idempotency(tenant_id,actor_id,idempotency_key,request_hash)
           VALUES ($1,$2,$3,$4)`,
          [row.tenant_id, actor.user_id, idempotencyKey, requestHash],
        );
      }
      const sessions = await manager.query(
        `SELECT s.*,g.geometry_type,g.geometry,g.maximum_accuracy_metres
         FROM pv_capture_sessions s JOIN pv_geofence_policies g ON g.geofence_policy_id=s.geofence_policy_id
         WHERE s.capture_session_id=$1 AND s.verification_case_id=$2 AND s.tenant_id=$3 FOR UPDATE`,
        [sessionId, caseId, row.tenant_id],
      );
      const session = sessions[0];
      if (
        !session ||
        session.status !== 'ACTIVE' ||
        new Date(session.expires_at).getTime() <= Date.now()
      )
        throw new ConflictException({
          message: 'Capture session is invalid or expired',
          code: 'CAPTURE_SESSION_INVALID',
        });
      if (session.created_by !== actor.user_id)
        throw new ForbiddenException(
          'Capture session belongs to another operator',
        );
      if (verificationHash(input.nonce) !== session.single_use_nonce_hash)
        throw new ConflictException({
          message: 'Capture nonce is invalid',
          code: 'CAPTURE_NONCE_INVALID',
        });
      if (!(session.required_views as string[]).includes(input.view_type))
        throw new BadRequestException(
          'Evidence view is not required by the pinned policy',
        );
      const counts = await manager.query(
        `SELECT COUNT(*)::int AS count FROM pv_evidence WHERE capture_session_id=$1`,
        [sessionId],
      );
      if (Number(counts[0].count) >= Number(session.maximum_media_count))
        throw new ConflictException('Capture media count limit reached');
      const geofenceResult =
        session.capture_mode === 'SUPERVISED_EXCEPTION'
          ? 'EXCEPTION'
          : evaluateGeofence(
              session.geometry_type,
              session.geometry,
              input,
              Number(session.maximum_accuracy_metres),
            );
      const id = randomUUID();
      try {
        await manager.query(
          `INSERT INTO pv_evidence
           (evidence_id,tenant_id,verification_case_id,subject_id,capture_session_id,view_type,
            media_type,object_key,derivative_object_key,content_hash,byte_size,mime_type,
            client_captured_at,latitude,longitude,accuracy_metres,geofence_result,captured_by,
            session_fingerprint_hash,sanitized_device_metadata,metadata)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb,$21::jsonb)`,
          [
            id,
            row.tenant_id,
            caseId,
            session.subject_id,
            sessionId,
            input.view_type,
            input.media_type,
            input.object_key,
            input.derivative_object_key ?? null,
            input.content_hash,
            input.byte_size,
            input.mime_type,
            input.client_captured_at ?? null,
            input.latitude ?? null,
            input.longitude ?? null,
            input.accuracy_metres ?? null,
            geofenceResult,
            actor.user_id,
            input.session_fingerprint_hash,
            JSON.stringify(input.sanitized_device_metadata ?? {}),
            JSON.stringify(input.metadata ?? {}),
          ],
        );
      } catch (error) {
        if (error instanceof Error && /unique|duplicate/i.test(error.message))
          throw new ConflictException({
            message: 'Evidence has already been used',
            code: 'EVIDENCE_REPLAY',
          });
        throw error;
      }
      if (geofenceResult !== 'SATISFIED' && geofenceResult !== 'EXCEPTION')
        await manager.query(
          `INSERT INTO pv_blockers(tenant_id,verification_case_id,subject_id,blocker_type,severity,details)
           VALUES ($1,$2,$3,$4,'REVIEWABLE',$5::jsonb)`,
          [
            row.tenant_id,
            caseId,
            session.subject_id,
            `GEOFENCE_${geofenceResult}`,
            JSON.stringify({
              evidence_id: id,
              accuracy_metres: input.accuracy_metres,
            }),
          ],
        );
      await this.audit(
        manager,
        row,
        session.subject_id,
        'EVIDENCE',
        id,
        'EVIDENCE_CAPTURED',
        actor.user_id,
        null,
        {
          view_type: input.view_type,
          content_hash: input.content_hash,
          geofence_result: geofenceResult,
        },
      );
      await manager.query(
        `UPDATE pv_cases SET aggregate_revision=aggregate_revision+1,updated_at=NOW() WHERE verification_case_id=$1`,
        [caseId],
      );
      const response = {
        evidence_id: id,
        content_hash: input.content_hash,
        geofence_result: geofenceResult,
        aggregate_revision: Number(row.aggregate_revision) + 1,
      };
      await manager.query(
        `UPDATE pv_idempotency SET response_payload=$4::jsonb
         WHERE tenant_id=$1 AND actor_id=$2 AND idempotency_key=$3`,
        [
          row.tenant_id,
          actor.user_id,
          idempotencyKey,
          JSON.stringify(response),
        ],
      );
      return response;
    });
  }

  async completeCaptureSession(
    actor: ProductVerificationActor,
    caseId: string,
    sessionId: string,
    expectedRevision: number,
    nonce: string,
  ) {
    const access = await this.accessibleCase(
      actor,
      caseId,
      'PRODUCT_VERIFICATION_CAPTURE',
    );
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertRevision(row, expectedRevision);
      this.assertOpen(row);
      const sessions = await manager.query(
        `SELECT * FROM pv_capture_sessions WHERE capture_session_id=$1 AND verification_case_id=$2 FOR UPDATE`,
        [sessionId, caseId],
      );
      const session = sessions[0];
      if (
        !session ||
        session.status !== 'ACTIVE' ||
        verificationHash(nonce) !== session.single_use_nonce_hash
      )
        throw new ConflictException({
          message: 'Capture session or nonce is invalid',
          code: 'CAPTURE_SESSION_INVALID',
        });
      if (session.created_by !== actor.user_id)
        throw new ForbiddenException(
          'Capture session belongs to another operator',
        );
      const views = await manager.query(
        `SELECT DISTINCT view_type FROM pv_evidence WHERE capture_session_id=$1`,
        [sessionId],
      );
      const present = new Set(views.map((view: any) => view.view_type));
      const missing = (session.required_views as string[]).filter(
        (view) => !present.has(view),
      );
      if (missing.length)
        throw new ConflictException({
          message: 'Required capture views are missing',
          code: 'CAPTURE_VIEWS_MISSING',
          missing_views: missing,
        });
      await manager.query(
        `UPDATE pv_capture_sessions SET status='COMPLETED',completed_at=NOW() WHERE capture_session_id=$1`,
        [sessionId],
      );
      await this.audit(
        manager,
        row,
        session.subject_id,
        'CAPTURE_SESSION',
        sessionId,
        'CAPTURE_SESSION_COMPLETED',
        actor.user_id,
        null,
        { views: [...present] },
      );
      await manager.query(
        `UPDATE pv_cases SET workflow_state='ANALYZING',aggregate_revision=aggregate_revision+1,updated_at=NOW() WHERE verification_case_id=$1`,
        [caseId],
      );
      return {
        capture_session_id: sessionId,
        status: 'COMPLETED',
        aggregate_revision: Number(row.aggregate_revision) + 1,
      };
    });
  }

  private expectedAttribute(
    name: string,
    context: Record<string, any>,
    subject: Record<string, any>,
  ) {
    const values: Record<string, unknown> = {
      product: context.product_name,
      product_name: context.product_name,
      brand: context.brand,
      make: context.brand,
      model: context.model_number,
      model_number: context.model_number,
      part_number: context.part_number,
      technical_specifications: context.technical_specifications,
      specifications: context.technical_specifications,
      quantity: Number(subject.subject_quantity),
      batch_number: subject.batch_number,
      expiry_date: subject.expiry_date,
      manufacture_date: subject.manufacture_date,
      manufacturer: subject.manufacturer,
      serial: null,
    };
    return values[name];
  }

  private async currentInvoiceAllocations(
    manager: EntityManager,
    subjectId: string,
  ) {
    return manager.query(
      `SELECT a.*,i.invoice_number,p.final_decision AS current_decision,p.invoice_revision AS current_revision,
              p.document_hash AS current_document_hash,p.superseded_at
       FROM pv_invoice_allocations a JOIN proc_invoices i ON i.invoice_id=a.invoice_id
       LEFT JOIN proc_invoice_integrity_projections p ON p.invoice_id=a.invoice_id
       WHERE a.subject_id=$1 ORDER BY a.created_at`,
      [subjectId],
    );
  }

  private allocationsAreCurrent(
    allocations: Array<Record<string, any>>,
    subjectQuantity: number,
  ) {
    const quantity = allocations.reduce(
      (sum, item) => sum + Number(item.allocated_quantity),
      0,
    );
    return (
      allocations.length > 0 &&
      Math.abs(quantity - subjectQuantity) <= 0.0005 &&
      allocations.every(
        (item) =>
          !item.superseded_at &&
          Number(item.current_revision) === Number(item.invoice_revision) &&
          item.current_document_hash === item.document_hash &&
          ['CLEARED_AUTOMATED', 'CLEARED_HUMAN'].includes(
            item.current_decision,
          ),
      )
    );
  }

  private async buildReferenceSnapshot(
    manager: EntityManager,
    row: VerificationCase,
    subject: Record<string, any>,
    policy: Record<string, any>,
    allocations: Array<Record<string, any>>,
  ) {
    const contexts = await manager.query(
      `SELECT al.*,pcl.approved_quantity,pcl.approved_unit_price,pcl.approved_line_amount,
              ol.quantity AS ordered_quantity,ol.unit_price AS ordered_unit_price,ol.line_total AS ordered_total,
              o.order_number,o.vendor_id,o.currency,o.product_url,
              rl.received_quantity,rl.accepted_quantity,rl.rejected_quantity,r.receipt_number,r.actual_delivery_date
       FROM acq_lines al JOIN proc_case_lines pcl ON pcl.acquisition_line_id=al.line_id
       JOIN proc_order_lines ol ON ol.order_line_id=$1
       JOIN proc_orders o ON o.order_id=ol.order_id JOIN proc_receipt_lines rl ON rl.receipt_line_id=$2
       JOIN proc_receipts r ON r.receipt_id=rl.receipt_id WHERE al.line_id=$3`,
      [row.order_line_id, row.receipt_line_id, row.acquisition_line_id],
    );
    const context = contexts[0];
    if (!context)
      throw new ConflictException(
        'Pinned procurement reference is unavailable',
      );
    const acquisition = {
      acquisition_line_id: row.acquisition_line_id,
      product_name: context.product_name,
      category: context.category,
      brand: context.brand,
      model_number: context.model_number,
      part_number: context.part_number,
      technical_specifications: context.technical_specifications,
      product_description: context.product_description,
      product_url: context.product_url,
    };
    const order = {
      order_line_id: row.order_line_id,
      order_number: context.order_number,
      vendor_id: context.vendor_id,
      currency: context.currency,
      quantity: Number(context.ordered_quantity),
      unit_price: Number(context.ordered_unit_price),
      total: Number(context.ordered_total),
    };
    const receipt = {
      receipt_line_id: row.receipt_line_id,
      receipt_number: context.receipt_number,
      received_quantity: Number(context.received_quantity),
      accepted_quantity: Number(context.accepted_quantity),
      rejected_quantity: Number(context.rejected_quantity),
      actual_delivery_date: context.actual_delivery_date,
    };
    const invoices = allocations.map((allocation) => ({
      invoice_id: allocation.invoice_id,
      invoice_line_id: allocation.invoice_line_id,
      invoice_revision: Number(allocation.invoice_revision),
      document_hash: allocation.document_hash,
      integrity_case_id: allocation.integrity_case_id,
      integrity_decision_id: allocation.integrity_decision_id,
      integrity_decision: allocation.integrity_decision,
      allocated_quantity: Number(allocation.allocated_quantity),
    }));
    const snapshotHash = verificationHash({
      acquisition,
      order,
      receipt,
      invoices,
      policy_version: policy.policy_version,
    });
    const id = randomUUID();
    await manager.query(
      `INSERT INTO pv_reference_snapshots
       (reference_snapshot_id,tenant_id,subject_id,verification_policy_id,policy_version,
        acquisition_snapshot,order_snapshot,receipt_snapshot,invoice_snapshot,vendor_references,snapshot_hash)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11)`,
      [
        id,
        row.tenant_id,
        subject.subject_id,
        policy.verification_policy_id,
        policy.policy_version,
        JSON.stringify(acquisition),
        JSON.stringify(order),
        JSON.stringify(receipt),
        JSON.stringify(invoices),
        JSON.stringify(
          context.product_url
            ? [
                {
                  url: context.product_url,
                  captured_at: new Date().toISOString(),
                },
              ]
            : [],
        ),
        snapshotHash,
      ],
    );
    return { reference_snapshot_id: id, snapshot_hash: snapshotHash, context };
  }

  async analyze(
    actor: ProductVerificationActor,
    caseId: string,
    subjectId: string,
    expectedRevision: number,
    input: AnalyzeSubjectInput,
    idempotencyKey: string,
  ) {
    const access = await this.accessibleCase(
      actor,
      caseId,
      'PRODUCT_VERIFICATION_ANALYZE',
    );
    if (
      !Array.isArray(input.observed_attributes) ||
      !input.observed_attributes.length
    )
      throw new BadRequestException('Observed attributes are required');
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertRevision(row, expectedRevision);
      this.assertOpen(row);
      return this.withIdempotency(
        manager,
        row,
        actor.user_id,
        idempotencyKey,
        input,
        async () => {
          const subjects = await manager.query(
            `SELECT * FROM pv_subjects WHERE subject_id=$1 AND verification_case_id=$2 AND status='ACTIVE' FOR UPDATE`,
            [subjectId, caseId],
          );
          const subject = subjects[0];
          if (!subject)
            throw new NotFoundException('Physical subject not found');
          const sessions = await manager.query(
            `SELECT s.*,p.attributes,p.automated_min_coverage,p.automated_min_confidence
           FROM pv_capture_sessions s JOIN pv_verification_policies p ON p.verification_policy_id=s.verification_policy_id
           WHERE s.subject_id=$1 AND s.status='COMPLETED' ORDER BY s.completed_at DESC LIMIT 1`,
            [subjectId],
          );
          const session = sessions[0];
          if (!session)
            throw new ConflictException(
              'A completed trusted capture session is required',
            );
          const allocations = await this.currentInvoiceAllocations(
            manager,
            subjectId,
          );
          const currentInvoices = this.allocationsAreCurrent(
            allocations,
            Number(subject.subject_quantity),
          );
          if (!currentInvoices)
            throw new ConflictException({
              message: 'Exact current Module 3 invoice clearance is required',
              code: 'STALE_OR_MISSING_INVOICE_CLEARANCE',
            });
          const policyAttributes = session.attributes as PolicyAttribute[];
          const observedByName = new Map<string, ObservedAttribute>();
          for (const observed of input.observed_attributes) {
            if (observedByName.has(observed.attribute_name))
              throw new BadRequestException(
                `Duplicate observed attribute ${observed.attribute_name}`,
              );
            observedByName.set(observed.attribute_name, observed);
          }
          const reference = await this.buildReferenceSnapshot(
            manager,
            row,
            subject,
            session,
            allocations,
          );
          const comparisons = policyAttributes.map((attribute) => {
            const observed = observedByName.get(attribute.attribute_name);
            const expected = this.expectedAttribute(
              attribute.attribute_name,
              reference.context,
              subject,
            );
            const outcome = compareAttribute(attribute, expected, observed);
            return { attribute, observed, expected, outcome };
          });
          const scores = calculateCoverageConfidence(
            policyAttributes,
            comparisons.map((item) => ({
              attribute_name: item.attribute.attribute_name,
              value: item.observed?.value,
              outcome: item.outcome,
              extraction_method: item.observed?.extraction_method,
              extraction_confidence: item.observed?.extraction_confidence,
            })),
          );
          const mismatches = comparisons.filter(
            (item) => item.outcome === 'MISMATCHED',
          );
          const unknown = comparisons.filter(
            (item) => item.attribute.required && item.outcome === 'UNKNOWN',
          );
          const hardMismatch = mismatches.some(
            (item) => item.attribute.hard_identifier,
          );
          const aiRequired = policyAttributes.some(
            (item) => item.ai_mode === 'REQUIRED_FOR_AUTOMATION',
          );
          const aiSucceeded = !aiRequired || input.ai?.status === 'SUCCEEDED';
          let duplicateSerial = false;
          const serial = comparisons.find(
            (item) => item.attribute.attribute_name === 'serial',
          );
          if (serial?.observed?.value) {
            const duplicate = await manager.query(
              `SELECT 1 FROM pv_attribute_comparisons WHERE attribute_name='serial'
               AND observed_value=$1::jsonb AND subject_id<>$2 LIMIT 1`,
              [JSON.stringify(serial.observed.value), subjectId],
            );
            duplicateSerial = Boolean(duplicate[0]);
          }
          const evidence = await manager.query(
            `SELECT evidence_id,content_hash,geofence_result,derivative_object_key,metadata
             FROM pv_evidence WHERE capture_session_id=$1 ORDER BY evidence_id`,
            [session.capture_session_id],
          );
          const geofenceSatisfied =
            evidence.length > 0 &&
            evidence.every((item: any) => item.geofence_result === 'SATISFIED');
          const supervised = session.capture_mode === 'SUPERVISED_EXCEPTION';
          if (
            input.ai?.status === 'SUCCEEDED' &&
            !evidence.every(
              (item: Record<string, any>) =>
                item.derivative_object_key &&
                item.metadata?.metadata_stripping_status === 'CLEAN' &&
                item.metadata?.privacy_redaction_status === 'CLEAN',
            )
          )
            throw new ConflictException({
              message:
                'AI analysis requires sanitized and privacy-redacted derivatives',
              code: 'AI_DERIVATIVE_NOT_SANITIZED',
            });
          const analysisResult =
            hardMismatch || duplicateSerial
              ? 'DISCREPANCY'
              : mismatches.length
                ? 'MINOR_DIFFERENCE'
                : unknown.length
                  ? 'INCONCLUSIVE'
                  : 'MATCHED';
          const calculation = {
            subject_id: subjectId,
            reference_snapshot_hash: reference.snapshot_hash,
            policy_version: Number(session.policy_version),
            scores,
            analysis_result: analysisResult,
            comparisons: comparisons.map((item) => ({
              name: item.attribute.attribute_name,
              weight: item.attribute.weight,
              expected: item.expected,
              observed: item.observed?.value,
              outcome: item.outcome,
            })),
            deterministic_signals: input.deterministic_signals ?? {},
            ai: input.ai ?? { status: 'NOT_USED' },
          };
          const analysisId = randomUUID();
          await manager.query(
            `INSERT INTO pv_analyses
           (analysis_id,tenant_id,verification_case_id,subject_id,reference_snapshot_id,
            verification_policy_id,policy_version,analysis_result,coverage_score,confidence_score,
            deterministic_result,ai_model_version,ai_prompt_policy_version,ai_sanitized_input_hash,
            ai_output_hash,ai_confidence,ai_status,calculation_hash)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16,$17,$18)`,
            [
              analysisId,
              row.tenant_id,
              caseId,
              subjectId,
              reference.reference_snapshot_id,
              session.verification_policy_id,
              session.policy_version,
              analysisResult,
              scores.coverage_score,
              scores.confidence_score,
              JSON.stringify(calculation),
              input.ai?.model_version ?? null,
              input.ai?.prompt_policy_version ?? null,
              input.ai?.sanitized_input_hash ?? null,
              input.ai?.output_hash ?? null,
              input.ai?.confidence ?? null,
              input.ai?.status ?? 'NOT_USED',
              verificationHash(calculation),
            ],
          );
          for (const item of comparisons) {
            const comparisonHash = verificationHash({
              analysis_id: analysisId,
              attribute: item.attribute,
              expected: item.expected,
              observed: item.observed,
              outcome: item.outcome,
            });
            await manager.query(
              `INSERT INTO pv_attribute_comparisons
             (tenant_id,analysis_id,subject_id,attribute_name,weight,required,hard_identifier,
              expected_value,observed_value,extraction_method,extraction_confidence,outcome,tolerance,comparison_hash)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,$13::jsonb,$14)`,
              [
                row.tenant_id,
                analysisId,
                subjectId,
                item.attribute.attribute_name,
                item.attribute.weight,
                item.attribute.required,
                item.attribute.hard_identifier,
                item.expected === undefined
                  ? null
                  : JSON.stringify(item.expected),
                item.observed?.value === undefined
                  ? null
                  : JSON.stringify(item.observed.value),
                item.observed?.extraction_method ?? null,
                item.observed?.extraction_confidence ?? null,
                item.outcome,
                item.attribute.tolerance === undefined
                  ? null
                  : JSON.stringify(item.attribute.tolerance),
                comparisonHash,
              ],
            );
            if (item.outcome === 'MISMATCHED')
              await manager.query(
                `INSERT INTO pv_blockers(tenant_id,verification_case_id,subject_id,blocker_type,severity,details) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
                [
                  row.tenant_id,
                  caseId,
                  subjectId,
                  `ATTRIBUTE_${item.attribute.attribute_name.toUpperCase()}_MISMATCH`,
                  item.attribute.hard_identifier ? 'MATERIAL' : 'REVIEWABLE',
                  JSON.stringify({
                    analysis_id: analysisId,
                    expected: item.expected,
                    observed: item.observed?.value,
                  }),
                ],
              );
          }
          if (duplicateSerial)
            await manager.query(
              `INSERT INTO pv_blockers(tenant_id,verification_case_id,subject_id,blocker_type,severity,details) VALUES ($1,$2,$3,'DUPLICATE_SERIAL','NON_OVERRIDABLE',$4::jsonb)`,
              [
                row.tenant_id,
                caseId,
                subjectId,
                JSON.stringify({ analysis_id: analysisId }),
              ],
            );
          const autoEligible =
            analysisResult === 'MATCHED' &&
            scores.coverage_score >= Number(session.automated_min_coverage) &&
            scores.confidence_score >=
              Number(session.automated_min_confidence) &&
            geofenceSatisfied &&
            !supervised &&
            aiSucceeded &&
            !duplicateSerial &&
            comparisons
              .filter((item) => item.attribute.hard_identifier)
              .every((item) => item.outcome === 'MATCHED');
          await this.audit(
            manager,
            row,
            subjectId,
            'ANALYSIS',
            analysisId,
            'SUBJECT_ANALYZED',
            actor.user_id,
            null,
            {
              analysis_result: analysisResult,
              ...scores,
              automated_clearance_eligible: autoEligible,
            },
          );
          const signingReady = Boolean(
            this.config
              .get<string>('PRODUCT_VERIFICATION_ED25519_PRIVATE_KEY')
              ?.trim() &&
            this.config
              .get<string>('PRODUCT_VERIFICATION_SIGNING_KEY_VERSION')
              ?.trim(),
          );
          if (autoEligible && signingReady) {
            const decision = await this.finalizeDecision(
              manager,
              row,
              subject,
              analysisId,
              'CLEARED_AUTOMATED',
              'Automated policy gates satisfied',
              null,
              null,
            );
            return {
              analysis_id: analysisId,
              analysis_result: analysisResult,
              ...scores,
              automated_clearance_eligible: true,
              decision,
              aggregate_revision: Number(row.aggregate_revision),
            };
          }
          await manager.query(
            `UPDATE pv_cases SET workflow_state='MANUAL_REVIEW',aggregate_revision=aggregate_revision+1,updated_at=NOW() WHERE verification_case_id=$1`,
            [caseId],
          );
          return {
            analysis_id: analysisId,
            analysis_result: analysisResult,
            ...scores,
            automated_clearance_eligible: autoEligible,
            manual_review_reasons: {
              unknown: unknown.map((item) => item.attribute.attribute_name),
              mismatches: mismatches.map(
                (item) => item.attribute.attribute_name,
              ),
              geofence_satisfied: geofenceSatisfied,
              supervised_capture: supervised,
              ai_required_succeeded: aiSucceeded,
              signing_key_available: signingReady,
            },
            aggregate_revision: Number(row.aggregate_revision) + 1,
          };
        },
      );
    });
  }

  private signingConfiguration() {
    const privateKey = this.config
      .get<string>('PRODUCT_VERIFICATION_ED25519_PRIVATE_KEY')
      ?.replace(/\\n/g, '\n');
    const keyVersion = this.config
      .get<string>('PRODUCT_VERIFICATION_SIGNING_KEY_VERSION')
      ?.trim();
    if (!privateKey || !keyVersion)
      throw new ServiceUnavailableException({
        message: 'Product verification signing key is unavailable',
        code: 'SIGNING_KEY_UNAVAILABLE',
      });
    return { privateKey, keyVersion };
  }

  private async finalizeDecision(
    manager: EntityManager,
    row: VerificationCase,
    subject: Record<string, any>,
    analysisId: string,
    decision:
      | 'CLEARED_AUTOMATED'
      | 'CLEARED_HUMAN'
      | 'ACCEPTED_EXCEPTION'
      | 'REJECTED',
    reason: string,
    reviewerId: string | null,
    exceptionApproverId: string | null,
  ) {
    const analyses = await manager.query(
      `SELECT a.*,r.snapshot_hash AS reference_snapshot_hash FROM pv_analyses a JOIN pv_reference_snapshots r ON r.reference_snapshot_id=a.reference_snapshot_id WHERE a.analysis_id=$1 AND a.subject_id=$2`,
      [analysisId, subject.subject_id],
    );
    const analysis = analyses[0];
    if (!analysis)
      throw new ConflictException('Current subject analysis is required');
    const evidence = await manager.query(
      `SELECT evidence_id,content_hash,captured_by FROM pv_evidence WHERE subject_id=$1 ORDER BY evidence_id`,
      [subject.subject_id],
    );
    if (!evidence.length)
      throw new ConflictException('Capture evidence is required');
    const capturerIds = [
      ...new Set(evidence.map((item: any) => item.captured_by)),
    ];
    if (reviewerId && capturerIds.includes(reviewerId))
      throw new ForbiddenException({
        message: 'Capturer cannot review the same subject',
        code: 'SOD_CAPTURE_REVIEW_VIOLATION',
      });
    const captureExceptions = await manager.query(
      `SELECT e.issued_by FROM pv_capture_sessions s JOIN pv_capture_exceptions e ON e.capture_exception_id=s.capture_exception_id
       WHERE s.subject_id=$1 AND s.status='COMPLETED' ORDER BY s.completed_at DESC LIMIT 1`,
      [subject.subject_id],
    );
    if (reviewerId && captureExceptions[0]?.issued_by === reviewerId)
      throw new ForbiddenException({
        message: 'Capture-exception issuer cannot review the same subject',
        code: 'SOD_CAPTURE_EXCEPTION_REVIEW_VIOLATION',
      });
    const allocations = await this.currentInvoiceAllocations(
      manager,
      subject.subject_id,
    );
    if (
      !this.allocationsAreCurrent(allocations, Number(subject.subject_quantity))
    )
      throw new ConflictException({
        message: 'Invoice integrity clearance is stale',
        code: 'STALE_INVOICE_CLEARANCE',
      });
    const blockers = await manager.query(
      `SELECT b.* FROM pv_blockers b
       WHERE b.subject_id=$1 AND NOT EXISTS (
         SELECT 1 FROM pv_blocker_resolutions r WHERE r.blocker_id=b.blocker_id
       ) ORDER BY b.created_at`,
      [subject.subject_id],
    );
    if (
      decision !== 'REJECTED' &&
      blockers.some((blocker: Record<string, any>) =>
        ['MATERIAL', 'NON_OVERRIDABLE'].includes(blocker.severity),
      )
    )
      throw new ConflictException({
        message:
          'Material or non-overridable discrepancies require recapture, return, or an upstream amendment',
        code: 'UNRESOLVED_PROHIBITED_BLOCKER',
      });
    const previous = await manager.query(
      `SELECT verification_id,decision_hash FROM pv_decisions WHERE subject_id=$1 ORDER BY decided_at DESC LIMIT 1`,
      [subject.subject_id],
    );
    const evidenceManifestHash = verificationHash(
      evidence.map((item: any) => ({
        evidence_id: item.evidence_id,
        content_hash: item.content_hash,
      })),
    );
    const verificationId = randomUUID();
    const trustLevel =
      decision === 'CLEARED_AUTOMATED'
        ? 'AUTOMATED_VERIFIED'
        : decision === 'CLEARED_HUMAN'
          ? 'HUMAN_VERIFIED'
          : decision === 'ACCEPTED_EXCEPTION'
            ? 'EXCEPTION_ACCEPTED'
            : 'UNVERIFIED';
    const record = {
      verification_id: verificationId,
      verification_case_id: row.verification_case_id,
      subject_id: subject.subject_id,
      verification_revision: Number(subject.verification_revision),
      analysis_id: analysisId,
      final_decision: decision,
      trust_level: trustLevel,
      capturer_ids: capturerIds,
      reviewer_id: reviewerId,
      exception_approver_id: exceptionApproverId,
      decision_reason: reason,
      evidence_manifest_hash: evidenceManifestHash,
      reference_snapshot_hash: analysis.reference_snapshot_hash,
      previous_decision_hash: previous[0]?.decision_hash ?? null,
    };
    const recordHash = verificationHash(record);
    const decisionHash = verificationHash({
      ...record,
      verification_record_hash: recordHash,
    });
    await manager.query(
      `INSERT INTO pv_decisions
       (verification_id,tenant_id,verification_case_id,subject_id,verification_revision,analysis_id,
        final_decision,trust_level,capturer_id,reviewer_id,exception_approver_id,decision_reason,
        verification_record_hash,evidence_manifest_hash,reference_snapshot_hash,previous_decision_hash,
        decision_hash,supersedes_verification_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        verificationId,
        row.tenant_id,
        row.verification_case_id,
        subject.subject_id,
        subject.verification_revision,
        analysisId,
        decision,
        trustLevel,
        capturerIds[0] ?? null,
        reviewerId,
        exceptionApproverId,
        reason,
        recordHash,
        evidenceManifestHash,
        analysis.reference_snapshot_hash,
        previous[0]?.decision_hash ?? null,
        decisionHash,
        previous[0]?.verification_id ?? null,
      ],
    );
    if (decision !== 'REJECTED')
      for (const blocker of blockers as Array<Record<string, any>>)
        await manager.query(
          `INSERT INTO pv_blocker_resolutions
           (tenant_id,verification_case_id,subject_id,blocker_id,verification_id,resolved_by,resolution_reason)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            row.tenant_id,
            row.verification_case_id,
            subject.subject_id,
            blocker.blocker_id,
            verificationId,
            reviewerId ?? exceptionApproverId,
            reason,
          ],
        );
    await this.audit(
      manager,
      row,
      subject.subject_id,
      'DECISION',
      verificationId,
      'VERIFICATION_DECIDED',
      reviewerId ?? exceptionApproverId,
      null,
      { final_decision: decision, decision_hash: decisionHash },
    );
    if (decision === 'REJECTED') {
      await manager.query(
        `UPDATE pv_subjects SET status='REJECTED',updated_at=NOW() WHERE subject_id=$1`,
        [subject.subject_id],
      );
      const event = await this.emit(
        manager,
        row,
        subject.subject_id,
        'PhysicalProductRejected.v1',
        {
          verification_id: verificationId,
          verification_revision: Number(subject.verification_revision),
          verification_record_hash: recordHash,
          evidence_manifest_hash: evidenceManifestHash,
          reference_snapshot_hash: analysis.reference_snapshot_hash,
          final_decision: decision,
          trust_level: trustLevel,
          decision_hash: decisionHash,
        },
      );
      return {
        verification_id: verificationId,
        final_decision: decision,
        event,
      };
    }
    const { privateKey, keyVersion } = this.signingConfiguration();
    const identityId = randomUUID();
    const code = `PV-${randomBytes(12).toString('base64url').toUpperCase()}`;
    const signedPayload = {
      verification_identity_id: identityId,
      verification_code: code,
      subject_id: subject.subject_id,
      subject_type: subject.subject_type,
      verification_revision: Number(subject.verification_revision),
      verification_record_hash: recordHash,
      evidence_manifest_hash: evidenceManifestHash,
      reference_snapshot_hash: analysis.reference_snapshot_hash,
      invoice_allocations: allocations.map((item: any) => ({
        invoice_id: item.invoice_id,
        invoice_line_id: item.invoice_line_id,
        invoice_revision: Number(item.invoice_revision),
        document_hash: item.document_hash,
        integrity_decision_id: item.integrity_decision_id,
        allocated_quantity: Number(item.allocated_quantity),
      })),
      policy_version: Number(analysis.policy_version),
      final_decision: decision,
      trust_level: trustLevel,
      issued_at: new Date().toISOString(),
      signing_key_version: keyVersion,
    };
    const signature = signVerificationPayload(signedPayload, privateKey);
    const supersededIdentities = await manager.query(
      `UPDATE pv_verification_identities SET status='SUPERSEDED',revoked_at=NOW()
       WHERE subject_id=$1 AND status='ACTIVE' RETURNING verification_identity_id`,
      [subject.subject_id],
    );
    await manager.query(
      `INSERT INTO pv_verification_identities
       (verification_identity_id,tenant_id,verification_id,subject_id,verification_revision,
        verification_code,verification_record_hash,evidence_manifest_hash,signing_key_version,
        signature,signed_payload,status,issued_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,'ACTIVE',$12)`,
      [
        identityId,
        row.tenant_id,
        verificationId,
        subject.subject_id,
        subject.verification_revision,
        code,
        recordHash,
        evidenceManifestHash,
        keyVersion,
        signature,
        JSON.stringify(signedPayload),
        signedPayload.issued_at,
      ],
    );
    if (supersededIdentities.length)
      await manager.query(
        `UPDATE pv_verification_identities SET superseded_by=$2
         WHERE verification_identity_id=ANY($1::uuid[])`,
        [
          supersededIdentities.map(
            (item: Record<string, any>) => item.verification_identity_id,
          ),
          identityId,
        ],
      );
    const event = await this.emit(
      manager,
      row,
      subject.subject_id,
      'PhysicalProductVerified.v1',
      {
        verification_id: verificationId,
        subject_id: subject.subject_id,
        subject_type: subject.subject_type,
        verification_revision: Number(subject.verification_revision),
        receipt_line_id: row.receipt_line_id,
        order_line_id: row.order_line_id,
        acquisition_line_id: row.acquisition_line_id,
        verified_quantity: Number(subject.subject_quantity),
        unit_of_measure: subject.unit_of_measure,
        invoice_allocations: signedPayload.invoice_allocations,
        verification_identity_id: identityId,
        verification_code: code,
        identity_status: 'ACTIVE',
        verification_record_hash: recordHash,
        evidence_manifest_hash: evidenceManifestHash,
        reference_snapshot_hash: analysis.reference_snapshot_hash,
        policy_version: Number(analysis.policy_version),
        final_decision: decision,
        trust_level: trustLevel,
        signature,
        signing_key_version: keyVersion,
        verified_at: signedPayload.issued_at,
      },
    );
    await this.updateLineCompletion(manager, row);
    return {
      verification_id: verificationId,
      verification_identity_id: identityId,
      verification_code: code,
      identity_status: 'ACTIVE',
      final_decision: decision,
      trust_level: trustLevel,
      signature,
      event,
    };
  }

  private async updateLineCompletion(
    manager: EntityManager,
    row: VerificationCase,
  ) {
    const totals = await manager.query(
      `SELECT COALESCE(SUM(s.subject_quantity) FILTER (WHERE s.status='ACTIVE'),0) AS active_quantity,
              COALESCE(SUM(s.subject_quantity) FILTER (WHERE s.status='ACTIVE' AND i.status='ACTIVE'),0) AS verified_quantity
       FROM pv_subjects s LEFT JOIN pv_verification_identities i ON i.subject_id=s.subject_id
       WHERE s.verification_case_id=$1`,
      [row.verification_case_id],
    );
    const returned = await manager.query(
      `SELECT COALESCE(SUM(quantity),0) AS returned FROM proc_returns WHERE receipt_line_id=$1 AND status='RESOLVED'`,
      [row.receipt_line_id],
    );
    const eligible =
      Number(row.eligible_quantity) - Number(returned[0]?.returned ?? 0);
    const complete =
      Math.abs(Number(totals[0].active_quantity) - eligible) <= 0.0005 &&
      Math.abs(Number(totals[0].verified_quantity) - eligible) <= 0.0005;
    if (complete) {
      await manager.query(
        `UPDATE pv_cases SET workflow_state='CLOSED',closed_at=NOW(),updated_at=NOW() WHERE verification_case_id=$1`,
        [row.verification_case_id],
      );
      await this.emit(
        manager,
        row,
        null,
        'PhysicalVerificationLineCompleted.v1',
        {
          proc_case_line_id: row.proc_case_line_id,
          receipt_line_id: row.receipt_line_id,
          verified_quantity: eligible,
          status: 'FINALIZED',
        },
      );
    }
  }

  async review(
    actor: ProductVerificationActor,
    caseId: string,
    subjectId: string,
    expectedRevision: number,
    input: {
      recommendation:
        | 'CLEAR'
        | 'REJECT'
        | 'REQUEST_EVIDENCE'
        | 'REQUEST_EXCEPTION';
      reason: string;
      exception_type?: string;
    },
    idempotencyKey: string,
  ) {
    const access = await this.accessibleCase(
      actor,
      caseId,
      'PRODUCT_VERIFICATION_REVIEW',
    );
    if (!input.reason?.trim())
      throw new BadRequestException('Review reason is required');
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertRevision(row, expectedRevision);
      this.assertOpen(row);
      return this.withIdempotency(
        manager,
        row,
        actor.user_id,
        idempotencyKey,
        input,
        async () => {
          const subjects = await manager.query(
            `SELECT * FROM pv_subjects WHERE subject_id=$1 AND verification_case_id=$2 AND status='ACTIVE' FOR UPDATE`,
            [subjectId, caseId],
          );
          const subject = subjects[0];
          if (!subject)
            throw new NotFoundException('Physical subject not found');
          const analyses = await manager.query(
            `SELECT * FROM pv_analyses WHERE subject_id=$1 ORDER BY created_at DESC LIMIT 1`,
            [subjectId],
          );
          const analysis = analyses[0];
          if (!analysis)
            throw new ConflictException('Analysis is required before review');
          const capturers = await manager.query(
            `SELECT DISTINCT captured_by FROM pv_evidence WHERE subject_id=$1`,
            [subjectId],
          );
          if (capturers.some((item: any) => item.captured_by === actor.user_id))
            throw new ForbiddenException({
              message: 'Capturer cannot review the same subject',
              code: 'SOD_CAPTURE_REVIEW_VIOLATION',
            });
          const id = randomUUID();
          await manager.query(
            `INSERT INTO pv_review_recommendations
           (review_recommendation_id,tenant_id,verification_case_id,subject_id,analysis_id,
            reviewer_id,recommendation,reason,exception_type)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              id,
              row.tenant_id,
              caseId,
              subjectId,
              analysis.analysis_id,
              actor.user_id,
              input.recommendation,
              input.reason.trim(),
              input.exception_type ?? null,
            ],
          );
          await this.audit(
            manager,
            row,
            subjectId,
            'REVIEW',
            id,
            'REVIEW_RECOMMENDED',
            actor.user_id,
            null,
            input,
          );
          if (input.recommendation === 'REQUEST_EVIDENCE') {
            await manager.query(
              `UPDATE pv_cases SET workflow_state='AWAITING_EVIDENCE',aggregate_revision=aggregate_revision+1,updated_at=NOW() WHERE verification_case_id=$1`,
              [caseId],
            );
            return {
              review_recommendation_id: id,
              status: 'PENDING',
              aggregate_revision: Number(row.aggregate_revision) + 1,
            };
          }
          if (input.recommendation === 'REQUEST_EXCEPTION') {
            const blockers = await manager.query(
              `SELECT * FROM pv_blockers WHERE subject_id=$1`,
              [subjectId],
            );
            if (
              blockers.some((blocker: any) =>
                ['NON_OVERRIDABLE', 'MATERIAL'].includes(blocker.severity),
              )
            )
              throw new ConflictException({
                message:
                  'Material or non-overridable blockers cannot receive an exception',
                code: 'EXCEPTION_PROHIBITED',
              });
            await manager.query(
              `UPDATE pv_cases SET workflow_state='DECISION_PENDING',aggregate_revision=aggregate_revision+1,updated_at=NOW() WHERE verification_case_id=$1`,
              [caseId],
            );
            return {
              review_recommendation_id: id,
              status: 'PENDING_EXCEPTION_APPROVAL',
              aggregate_revision: Number(row.aggregate_revision) + 1,
            };
          }
          const finalDecision =
            input.recommendation === 'CLEAR' ? 'CLEARED_HUMAN' : 'REJECTED';
          const decision = await this.finalizeDecision(
            manager,
            row,
            subject,
            analysis.analysis_id,
            finalDecision,
            input.reason.trim(),
            actor.user_id,
            null,
          );
          await manager.query(
            `UPDATE pv_review_recommendations SET status='ACCEPTED' WHERE review_recommendation_id=$1`,
            [id],
          );
          return {
            review_recommendation_id: id,
            decision,
            aggregate_revision: Number(row.aggregate_revision),
          };
        },
      );
    });
  }

  async approveException(
    actor: ProductVerificationActor,
    caseId: string,
    recommendationId: string,
    expectedRevision: number,
    reason: string,
    idempotencyKey: string,
  ) {
    const access = await this.accessibleCase(
      actor,
      caseId,
      'PRODUCT_VERIFICATION_EXCEPTION_APPROVE',
    );
    if (!reason?.trim())
      throw new BadRequestException('Exception approval reason is required');
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertRevision(row, expectedRevision);
      this.assertOpen(row);
      return this.withIdempotency(
        manager,
        row,
        actor.user_id,
        idempotencyKey,
        { recommendationId, reason },
        async () => {
          const recommendations = await manager.query(
            `SELECT * FROM pv_review_recommendations WHERE review_recommendation_id=$1 AND verification_case_id=$2 AND recommendation='REQUEST_EXCEPTION' AND status='PENDING' FOR UPDATE`,
            [recommendationId, caseId],
          );
          const recommendation = recommendations[0];
          if (!recommendation)
            throw new NotFoundException(
              'Pending exception recommendation not found',
            );
          if (recommendation.reviewer_id === actor.user_id)
            throw new ForbiddenException({
              message: 'Reviewer cannot approve their own exception',
              code: 'SOD_EXCEPTION_APPROVER_VIOLATION',
            });
          const subjects = await manager.query(
            `SELECT * FROM pv_subjects WHERE subject_id=$1 AND status='ACTIVE' FOR UPDATE`,
            [recommendation.subject_id],
          );
          const subject = subjects[0];
          const blockers = await manager.query(
            `SELECT * FROM pv_blockers WHERE subject_id=$1`,
            [subject.subject_id],
          );
          if (
            blockers.some((blocker: any) =>
              ['NON_OVERRIDABLE', 'MATERIAL'].includes(blocker.severity),
            )
          )
            throw new ConflictException({
              message:
                'Material or non-overridable blockers cannot receive an exception',
              code: 'EXCEPTION_PROHIBITED',
            });
          const decision = await this.finalizeDecision(
            manager,
            row,
            subject,
            recommendation.analysis_id,
            'ACCEPTED_EXCEPTION',
            `${recommendation.reason}; approval: ${reason.trim()}`,
            recommendation.reviewer_id,
            actor.user_id,
          );
          await manager.query(
            `UPDATE pv_review_recommendations SET status='ACCEPTED' WHERE review_recommendation_id=$1`,
            [recommendationId],
          );
          return {
            review_recommendation_id: recommendationId,
            decision,
            aggregate_revision: Number(row.aggregate_revision),
          };
        },
      );
    });
  }

  async reconsider(
    actor: ProductVerificationActor,
    caseId: string,
    subjectId: string,
    expectedRevision: number,
    reason: string,
    idempotencyKey: string,
  ) {
    const access = await this.accessibleCase(
      actor,
      caseId,
      'PRODUCT_VERIFICATION_REVIEW',
    );
    if (!reason?.trim())
      throw new BadRequestException('Reconsideration reason is required');
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertRevision(row, expectedRevision);
      return this.withIdempotency(
        manager,
        row,
        actor.user_id,
        idempotencyKey,
        { subjectId, reason },
        async () => {
          const identities = await manager.query(
            `SELECT * FROM pv_verification_identities WHERE subject_id=$1 AND status='ACTIVE' FOR UPDATE`,
            [subjectId],
          );
          const identity = identities[0];
          if (!identity)
            throw new ConflictException(
              'Subject has no active verification identity',
            );
          await manager.query(
            `UPDATE pv_verification_identities SET status='REVOKED',revoked_at=NOW() WHERE verification_identity_id=$1`,
            [identity.verification_identity_id],
          );
          await manager.query(
            `UPDATE pv_subjects SET verification_revision=verification_revision+1,updated_at=NOW() WHERE subject_id=$1`,
            [subjectId],
          );
          await manager.query(
            `UPDATE pv_cases SET workflow_state='MANUAL_REVIEW',closed_at=NULL,updated_at=NOW() WHERE verification_case_id=$1`,
            [caseId],
          );
          await this.audit(
            manager,
            row,
            subjectId,
            'IDENTITY',
            identity.verification_identity_id,
            'IDENTITY_REVOKED_FOR_RECONSIDERATION',
            actor.user_id,
            { status: 'ACTIVE' },
            { status: 'REVOKED', reason },
          );
          const revoked = await this.emit(
            manager,
            row,
            subjectId,
            'PhysicalVerificationIdentityRevoked.v1',
            {
              verification_identity_id: identity.verification_identity_id,
              verification_code: identity.verification_code,
              reason: reason.trim(),
              status: 'REVOKED',
            },
          );
          const reconsidered = await this.emit(
            manager,
            row,
            subjectId,
            'PhysicalVerificationReconsidered.v1',
            {
              verification_identity_id: identity.verification_identity_id,
              reason: reason.trim(),
            },
          );
          await this.emit(
            manager,
            row,
            null,
            'PhysicalVerificationLineCompleted.v1',
            {
              proc_case_line_id: row.proc_case_line_id,
              receipt_line_id: row.receipt_line_id,
              status: 'PENDING',
              reason: 'IDENTITY_REVOKED',
            },
          );
          return {
            verification_identity_id: identity.verification_identity_id,
            status: 'REVOKED',
            events: [revoked, reconsidered],
            aggregate_revision: Number(row.aggregate_revision),
          };
        },
      );
    });
  }

  async consumeInvoiceInvalidation(eventId: string) {
    return this.db.transaction(async (manager) => {
      const consumed = await manager.query(
        `SELECT 1 FROM pv_consumed_events WHERE event_id=$1`,
        [eventId],
      );
      if (consumed[0]) return { duplicate: true };
      const events = await manager.query(
        `SELECT * FROM inv_integrity_outbox_events WHERE event_id=$1
           AND event_type IN ('InvoiceIntegrityRejected.v1','InvoiceIntegrityReconsiderationOpened.v1') FOR UPDATE`,
        [eventId],
      );
      const event = events[0];
      if (!event)
        throw new NotFoundException(
          'Invoice integrity invalidation event not found',
        );
      if (verificationHash(event.payload) !== event.payload_hash)
        throw new ConflictException({
          message: 'Event hash mismatch',
          code: 'EVENT_HASH_MISMATCH',
        });
      const cases = await manager.query(
        `SELECT DISTINCT c.* FROM pv_invoice_allocations a JOIN pv_subjects s ON s.subject_id=a.subject_id
         JOIN pv_cases c ON c.verification_case_id=s.verification_case_id
         WHERE a.invoice_id=$1 AND c.tenant_id=$2 FOR UPDATE OF c`,
        [event.invoice_id, event.tenant_id],
      );
      const revoked: string[] = [];
      for (const row of cases as VerificationCase[]) {
        const identities = await manager.query(
          `SELECT i.* FROM pv_verification_identities i JOIN pv_invoice_allocations a ON a.subject_id=i.subject_id
           JOIN pv_subjects s ON s.subject_id=i.subject_id
           WHERE a.invoice_id=$1 AND s.verification_case_id=$2 AND i.status='ACTIVE' FOR UPDATE OF i`,
          [event.invoice_id, row.verification_case_id],
        );
        for (const identity of identities) {
          await manager.query(
            `UPDATE pv_verification_identities SET status='REVOKED',revoked_at=NOW() WHERE verification_identity_id=$1`,
            [identity.verification_identity_id],
          );
          await manager.query(
            `UPDATE pv_subjects SET verification_revision=verification_revision+1,updated_at=NOW() WHERE subject_id=$1`,
            [identity.subject_id],
          );
          await this.audit(
            manager,
            row,
            identity.subject_id,
            'IDENTITY',
            identity.verification_identity_id,
            'IDENTITY_REVOKED_FOR_INVOICE_INVALIDATION',
            null,
            { status: 'ACTIVE' },
            { status: 'REVOKED', source_event_id: eventId },
          );
          await this.emit(
            manager,
            row,
            identity.subject_id,
            'PhysicalVerificationIdentityRevoked.v1',
            {
              verification_identity_id: identity.verification_identity_id,
              verification_code: identity.verification_code,
              status: 'REVOKED',
              reason: event.event_type,
            },
          );
          revoked.push(identity.verification_identity_id);
        }
        await manager.query(
          `UPDATE pv_cases SET workflow_state='MANUAL_REVIEW',closed_at=NULL,updated_at=NOW() WHERE verification_case_id=$1`,
          [row.verification_case_id],
        );
        await this.emit(
          manager,
          row,
          null,
          'PhysicalVerificationLineCompleted.v1',
          {
            proc_case_line_id: row.proc_case_line_id,
            receipt_line_id: row.receipt_line_id,
            status: 'PENDING',
            reason: event.event_type,
          },
        );
      }
      await manager.query(
        `INSERT INTO pv_consumed_events(event_id,tenant_id,event_type) VALUES ($1,$2,$3)`,
        [eventId, event.tenant_id, event.event_type],
      );
      return { revoked_identity_ids: revoked };
    });
  }

  async consumeReturn(eventId: string) {
    return this.db.transaction(async (manager) => {
      const consumed = await manager.query(
        `SELECT 1 FROM pv_consumed_events WHERE event_id=$1`,
        [eventId],
      );
      if (consumed[0]) return { duplicate: true };
      const events = await manager.query(
        `SELECT * FROM proc_outbox_events WHERE event_id=$1 AND event_type='ReturnRecorded.v1' FOR UPDATE`,
        [eventId],
      );
      const event = events[0];
      if (!event) throw new NotFoundException('Return event not found');
      if (verificationHash(event.payload) !== event.payload_hash)
        throw new ConflictException({
          message: 'Event hash mismatch',
          code: 'EVENT_HASH_MISMATCH',
        });
      const payload = event.payload as Record<string, any>;
      await manager.query(
        `INSERT INTO pv_consumed_events(event_id,tenant_id,event_type) VALUES ($1,$2,'ReturnRecorded.v1')`,
        [eventId, event.tenant_id],
      );
      if (payload.status !== 'RESOLVED')
        return { ignored_until_resolved: true };
      const returns = await manager.query(
        `SELECT * FROM proc_returns WHERE return_id=$1 AND tenant_id=$2`,
        [event.aggregate_id, event.tenant_id],
      );
      const returned = returns[0];
      if (!returned) throw new NotFoundException('Return record not found');
      const exactAllocations = await manager.query(
        `SELECT a.subject_id,a.quantity,s.verification_case_id
         FROM proc_return_subject_allocations a JOIN pv_subjects s ON s.subject_id=a.subject_id
         WHERE a.return_id=$1 ORDER BY a.subject_id FOR UPDATE OF s`,
        [returned.return_id],
      );
      if (returned.managed_by === 'MODULE7' && !exactAllocations.length)
        throw new ConflictException({
          message: 'Module 7 return is missing exact subject allocations',
          code: 'RETURN_SUBJECT_ALLOCATION_REQUIRED',
        });
      const cases = await manager.query(
        `SELECT * FROM pv_cases WHERE receipt_line_id=$1 AND tenant_id=$2 FOR UPDATE`,
        [returned.receipt_line_id, event.tenant_id],
      );
      for (const row of cases as VerificationCase[]) {
        const exactForCase = exactAllocations.filter(
          (allocation: any) =>
            allocation.verification_case_id === row.verification_case_id,
        );
        if (returned.managed_by === 'MODULE7' && !exactForCase.length) continue;
        let remaining =
          returned.managed_by === 'MODULE7'
            ? exactForCase.reduce(
                (sum: number, allocation: any) =>
                  sum + Number(allocation.quantity),
                0,
              )
            : Number(returned.quantity);
        const subjects =
          returned.managed_by === 'MODULE7'
            ? await manager.query(
                `SELECT s.*,a.quantity AS exact_return_quantity FROM pv_subjects s
                 JOIN proc_return_subject_allocations a ON a.subject_id=s.subject_id
                 WHERE a.return_id=$1 AND s.verification_case_id=$2 AND s.status='ACTIVE'
                 ORDER BY s.subject_sequence FOR UPDATE OF s`,
                [returned.return_id, row.verification_case_id],
              )
            : await manager.query(
                `SELECT * FROM pv_subjects WHERE verification_case_id=$1 AND status='ACTIVE' ORDER BY subject_sequence FOR UPDATE`,
                [row.verification_case_id],
              );
        for (const subject of subjects) {
          if (remaining <= 0.0005) break;
          const quantity = Number(subject.subject_quantity);
          const returnedQuantity = subject.exact_return_quantity
            ? Number(subject.exact_return_quantity)
            : Math.min(quantity, remaining);
          if (returnedQuantity < quantity - 0.0005) {
            // A partial LOT return is represented by Module 5's immutable quantity
            // movement. The physical LOT identity remains active and is not guessed,
            // split, or revoked by receipt order.
            remaining -= returnedQuantity;
            continue;
          }
          const identities = await manager.query(
            `SELECT * FROM pv_verification_identities WHERE subject_id=$1 AND status='ACTIVE' FOR UPDATE`,
            [subject.subject_id],
          );
          for (const identity of identities) {
            await manager.query(
              `UPDATE pv_verification_identities SET status='REVOKED',revoked_at=NOW() WHERE verification_identity_id=$1`,
              [identity.verification_identity_id],
            );
            await this.emit(
              manager,
              row,
              subject.subject_id,
              'PhysicalVerificationIdentityRevoked.v1',
              {
                verification_identity_id: identity.verification_identity_id,
                verification_code: identity.verification_code,
                status: 'REVOKED',
                reason: 'RETURN_RESOLVED',
              },
            );
          }
          await manager.query(
            `UPDATE pv_subjects SET status='RETURNED',updated_at=NOW() WHERE subject_id=$1`,
            [subject.subject_id],
          );
          remaining -= returnedQuantity;
        }
        await manager.query(
          `UPDATE pv_cases SET workflow_state='MANUAL_REVIEW',closed_at=NULL,updated_at=NOW() WHERE verification_case_id=$1`,
          [row.verification_case_id],
        );
        await this.emit(
          manager,
          row,
          null,
          'PhysicalVerificationLineCompleted.v1',
          {
            proc_case_line_id: row.proc_case_line_id,
            receipt_line_id: row.receipt_line_id,
            status: 'PENDING',
            reason: 'RETURN_RESOLVED',
          },
        );
      }
      return {
        return_id: returned.return_id,
        returned_quantity: Number(returned.quantity),
      };
    });
  }

  async recordInventoryProjection(
    actor: ProductVerificationActor,
    caseId: string,
    subjectId: string,
    input: {
      source_event_id: string;
      aggregate_sequence: number;
      occurred_at: string;
      verification_identity_id: string;
      rfid?: string;
      university_serial?: string;
      asset_id?: string;
      inventory_record_id?: string;
      payload?: Record<string, unknown>;
    },
  ) {
    const access = await this.accessibleCase(
      actor,
      caseId,
      'PRODUCT_VERIFICATION_AUDIT',
    );
    if (
      !Number.isInteger(input.aggregate_sequence) ||
      input.aggregate_sequence <= 0
    )
      throw new BadRequestException('Positive aggregate sequence is required');
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      const identities = await manager.query(
        `SELECT * FROM pv_verification_identities WHERE verification_identity_id=$1 AND subject_id=$2 AND tenant_id=$3 FOR UPDATE`,
        [input.verification_identity_id, subjectId, row.tenant_id],
      );
      if (!identities[0] || identities[0].status !== 'ACTIVE')
        throw new ConflictException(
          'Inventory allocation requires an active signed verification identity',
        );
      const latest = await manager.query(
        `SELECT source_aggregate_sequence FROM pv_inventory_identity_projections WHERE subject_id=$1 ORDER BY source_aggregate_sequence DESC LIMIT 1`,
        [subjectId],
      );
      if (
        latest[0] &&
        Number(latest[0].source_aggregate_sequence) >= input.aggregate_sequence
      )
        return {
          ignored_older_sequence: true,
          highest_sequence: Number(latest[0].source_aggregate_sequence),
        };
      const rows = await manager.query(
        `INSERT INTO pv_inventory_identity_projections
         (tenant_id,subject_id,verification_identity_id,source_event_id,rfid,university_serial,
          asset_id,inventory_record_id,source_aggregate_sequence,occurred_at,payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
         ON CONFLICT (source_event_id) DO NOTHING RETURNING *`,
        [
          row.tenant_id,
          subjectId,
          input.verification_identity_id,
          input.source_event_id,
          input.rfid ?? null,
          input.university_serial ?? null,
          input.asset_id ?? null,
          input.inventory_record_id ?? null,
          input.aggregate_sequence,
          input.occurred_at,
          JSON.stringify(input.payload ?? {}),
        ],
      );
      return rows[0] ?? { duplicate: true };
    });
  }

  async applyInventoryIdentityEvent(eventId: string) {
    return this.db.transaction(async (manager) => {
      if (
        (
          await manager.query(
            `SELECT 1 FROM pv_inventory_event_consumption WHERE event_id=$1`,
            [eventId],
          )
        )[0]
      )
        return { duplicate: true };
      const events = await manager.query(
        `SELECT * FROM inv_outbox_events WHERE event_id=$1 AND event_type='InventoryIdentityAllocated.v1' FOR UPDATE`,
        [eventId],
      );
      const event = events[0];
      if (!event)
        throw new NotFoundException('Inventory identity event not found');
      if (verificationHash(event.payload) !== event.payload_hash)
        throw new ConflictException({
          message: 'Inventory identity event hash mismatch',
          code: 'EVENT_HASH_MISMATCH',
        });
      const payload = event.payload as Record<string, any>;
      const subjects = await manager.query(
        `SELECT subject_id,tenant_id FROM pv_subjects WHERE subject_id=$1 AND tenant_id=$2 FOR UPDATE`,
        [event.subject_id, event.tenant_id],
      );
      if (!subjects[0])
        throw new NotFoundException('Physical subject not found');
      const latest = await manager.query(
        `SELECT source_aggregate_sequence FROM pv_inventory_identity_projections WHERE subject_id=$1 ORDER BY source_aggregate_sequence DESC LIMIT 1`,
        [event.subject_id],
      );
      if (
        !latest[0] ||
        Number(latest[0].source_aggregate_sequence) <
          Number(event.aggregate_sequence)
      )
        await manager.query(
          `INSERT INTO pv_inventory_identity_projections(tenant_id,subject_id,verification_identity_id,source_event_id,rfid,university_serial,asset_id,inventory_record_id,source_aggregate_sequence,occurred_at,payload)
           VALUES($1,$2,$3,$4,$5,NULL,$6,$7,$8,$9,$10::jsonb) ON CONFLICT(source_event_id) DO NOTHING`,
          [
            event.tenant_id,
            event.subject_id,
            payload.verification_identity_id,
            eventId,
            payload.logical_rfid_code ?? null,
            payload.university_asset_id ?? payload.lot_id ?? null,
            payload.inventory_record_id,
            event.aggregate_sequence,
            event.occurred_at,
            JSON.stringify(payload),
          ],
        );
      await manager.query(
        `INSERT INTO pv_inventory_event_consumption(event_id,tenant_id,subject_id) VALUES($1,$2,$3)`,
        [eventId, event.tenant_id, event.subject_id],
      );
      return {
        subject_id: event.subject_id,
        inventory_record_id: payload.inventory_record_id,
      };
    });
  }

  async verifyCode(code: string) {
    if (!/^PV-[A-Z0-9_-]{12,40}$/.test(code))
      throw new NotFoundException('Verification identity not found');
    const rows = await this.db.query(
      `SELECT i.verification_identity_id,i.verification_code,i.subject_id,i.verification_revision,
              i.verification_record_hash,i.evidence_manifest_hash,i.signature_algorithm,
              i.signing_key_version,i.signature,i.signed_payload,i.status,i.issued_at,i.revoked_at,i.superseded_by,
              s.subject_type,s.subject_quantity,s.unit_of_measure,d.final_decision,d.trust_level,
              pcl.product_name,pcl.category
       FROM pv_verification_identities i JOIN pv_subjects s ON s.subject_id=i.subject_id
       JOIN pv_decisions d ON d.verification_id=i.verification_id
       JOIN pv_cases c ON c.verification_case_id=d.verification_case_id
       JOIN proc_case_lines pcl ON pcl.proc_case_line_id=c.proc_case_line_id
       WHERE i.verification_code=$1`,
      [code],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Verification identity not found');
    const configuredPublicKey = this.config
      .get<string>('PRODUCT_VERIFICATION_ED25519_PUBLIC_KEY')
      ?.replace(/\\n/g, '\n');
    const configuredPrivateKey = this.config
      .get<string>('PRODUCT_VERIFICATION_ED25519_PRIVATE_KEY')
      ?.replace(/\\n/g, '\n');
    let publicKey = configuredPublicKey;
    if (!publicKey && configuredPrivateKey)
      publicKey = createPublicKey(configuredPrivateKey)
        .export({ type: 'spki', format: 'pem' })
        .toString();
    const signatureValid = publicKey
      ? verifyVerificationPayload(row.signed_payload, row.signature, publicKey)
      : null;
    return {
      verification_code: row.verification_code,
      status: row.status,
      subject_type: row.subject_type,
      verified_quantity: Number(row.subject_quantity),
      unit_of_measure: row.unit_of_measure,
      product_name: row.product_name,
      category: row.category,
      final_decision: row.final_decision,
      trust_level: row.trust_level,
      verification_revision: Number(row.verification_revision),
      verification_record_hash: row.verification_record_hash,
      signature_algorithm: row.signature_algorithm,
      signing_key_version: row.signing_key_version,
      signature: row.signature,
      signature_valid: signatureValid,
      issued_at: row.issued_at,
      revoked_at: row.revoked_at,
      superseded_by: row.superseded_by,
      current_validity: row.status === 'ACTIVE' ? 'VALID' : 'NOT_VALID',
    };
  }
}
