/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call -- TypeORM query rows are untyped */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomInt, randomUUID } from 'crypto';
import type { EntityManager } from 'typeorm';
import { DataSource } from 'typeorm';
import type {
  HumanDecisionInput,
  IntegrityActor,
  IntegrityBlocker,
  InvoiceType,
  MarketObservationInput,
  RiskFactor,
  SourceSnapshotInput,
} from './invoice-integrity.types';
import {
  amountWithinTolerance,
  automatedClearanceEligible,
  calculateRisk,
  evidenceSetHash,
  integrityHash,
} from './invoice-integrity.util';

const DEFAULT_TENANT = 'a0000000-0000-4000-8000-000000000001';

type IntegrityCase = Record<string, any> & {
  integrity_case_id: string;
  tenant_id: string;
  proc_case_id: string;
  invoice_id: string;
  invoice_revision: number | string;
  document_hash: string;
  invoice_type: InvoiceType;
  invoice_submitter_id: string;
  workflow_state: string;
  aggregate_revision: number | string;
  next_event_sequence: number | string;
};

@Injectable()
export class InvoiceIntegrityService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  private tenant(actor: IntegrityActor) {
    return actor.tenant_id ?? DEFAULT_TENANT;
  }

  private roles(actor: IntegrityActor) {
    return [
      ...new Set([...(actor.roles ?? []), ...(actor.role ? [actor.role] : [])]),
    ].map((role) => role.toLowerCase());
  }

  private async grants(actor: IntegrityActor, capability: string) {
    return this.db.query(
      `SELECT scope_type,scope_reference FROM acq_access_grants
       WHERE tenant_id=$1 AND capability=$2 AND valid_from<=NOW()
         AND (valid_until IS NULL OR valid_until>NOW())
         AND (principal_user_id=$3::uuid OR lower(principal_role)=ANY($4::text[]))`,
      [this.tenant(actor), capability, actor.user_id, this.roles(actor)],
    );
  }

  private async accessibleCase(
    actor: IntegrityActor,
    caseId: string,
    capability = 'INVOICE_INTEGRITY_VIEW',
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
      `SELECT c.* FROM inv_integrity_cases c
       WHERE c.integrity_case_id=$1 AND c.tenant_id=$2
         AND ($3::boolean OR c.department_id=ANY($4::int[]) OR c.invoice_submitter_id=$5::uuid)`,
      [caseId, this.tenant(actor), tenantWide, departments, actor.user_id],
    );
    if (!rows?.[0])
      throw new NotFoundException('Invoice integrity case not found');
    if (capability !== 'INVOICE_INTEGRITY_VIEW' && !grants.length)
      throw new ForbiddenException('Invoice integrity capability is required');
    return rows[0] as IntegrityCase;
  }

  authorizeView(actor: IntegrityActor, caseId: string) {
    return this.accessibleCase(actor, caseId);
  }

  async registerEvidence(
    actor: IntegrityActor,
    caseId: string,
    input: {
      evidence_type: string;
      source_method: string;
      object_key: string;
      content_hash: string;
      metadata: Record<string, unknown>;
    },
  ) {
    const access = await this.accessibleCase(actor, caseId);
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      if (['CLOSED', 'CANCELLED', 'SUPERSEDED'].includes(row.workflow_state))
        throw new ConflictException(`Integrity case is ${row.workflow_state}`);
      const id = randomUUID();
      await manager.query(
        `INSERT INTO inv_evidence
           (evidence_id,integrity_case_id,tenant_id,evidence_type,source_method,object_key,
            content_hash,captured_at,captured_by,metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),$8,$9::jsonb)`,
        [
          id,
          caseId,
          row.tenant_id,
          input.evidence_type,
          input.source_method,
          input.object_key,
          input.content_hash,
          actor.user_id,
          JSON.stringify(input.metadata),
        ],
      );
      await this.audit(
        manager,
        row,
        'EVIDENCE',
        id,
        'EVIDENCE_ADDED',
        actor.user_id,
        null,
        {
          evidence_type: input.evidence_type,
          content_hash: input.content_hash,
        },
      );
      await manager.query(
        `UPDATE inv_integrity_cases SET workflow_state='MANUAL_REVIEW',aggregate_revision=aggregate_revision+1,
         updated_at=NOW() WHERE integrity_case_id=$1`,
        [caseId],
      );
      return {
        evidence_id: id,
        content_hash: input.content_hash,
        aggregate_revision: Number(row.aggregate_revision) + 1,
      };
    });
  }

  private assertRevision(row: IntegrityCase, expected: number) {
    if (!Number.isInteger(expected) || expected <= 0)
      throw new BadRequestException('If-Match revision is required');
    if (Number(row.aggregate_revision) !== expected)
      throw new ConflictException({
        message: 'Integrity case changed concurrently',
        code: 'STALE_INTEGRITY_REVISION',
        current_revision: Number(row.aggregate_revision),
      });
  }

  private async assertStepUp(
    actor: IntegrityActor,
    caseId: string,
    purpose: 'ATTENDED_RETRIEVAL' | 'CERTIFICATION',
  ) {
    const rows = await this.db.query(
      `SELECT challenge_id FROM inv_integrity_step_up_challenges
       WHERE tenant_id=$1 AND user_id=$2 AND integrity_case_id=$3 AND purpose=$4
         AND verified_at>=NOW()-INTERVAL '10 minutes' AND expires_at>NOW() AND locked_at IS NULL
       ORDER BY verified_at DESC LIMIT 1`,
      [this.tenant(actor), actor.user_id, caseId, purpose],
    );
    if (!rows?.[0])
      throw new ForbiddenException({
        message: 'Recent MFA step-up verification is required',
        code: 'STEP_UP_REQUIRED',
      });
  }

  async requestStepUp(
    actor: IntegrityActor,
    caseId: string,
    purpose: 'ATTENDED_RETRIEVAL' | 'CERTIFICATION',
  ) {
    await this.accessibleCase(
      actor,
      caseId,
      purpose === 'ATTENDED_RETRIEVAL'
        ? 'INVOICE_SOURCE_RETRIEVE'
        : 'INVOICE_INTEGRITY_CERTIFY',
    );
    const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const otpHash = createHash('sha256').update(otp).digest('hex');
    const rows = await this.db.query(
      `INSERT INTO inv_integrity_step_up_challenges
         (tenant_id,user_id,integrity_case_id,purpose,otp_hash,expires_at)
       VALUES ($1,$2,$3,$4,$5,NOW()+INTERVAL '10 minutes')
       RETURNING challenge_id,expires_at`,
      [this.tenant(actor), actor.user_id, caseId, purpose, otpHash],
    );
    return {
      ...rows[0],
      purpose,
      delivery_status: 'QUEUED',
      ...(process.env.NODE_ENV === 'production' ? {} : { dev_otp: otp }),
    };
  }

  async verifyStepUp(
    actor: IntegrityActor,
    caseId: string,
    challengeId: string,
    otp: string,
  ) {
    if (!/^\d{6}$/.test(otp))
      throw new BadRequestException(
        'A six-digit verification code is required',
      );
    const result = await this.db.transaction(async (manager) => {
      const rows = await manager.query(
        `SELECT * FROM inv_integrity_step_up_challenges
         WHERE challenge_id=$1 AND tenant_id=$2 AND user_id=$3 AND integrity_case_id=$4 FOR UPDATE`,
        [challengeId, this.tenant(actor), actor.user_id, caseId],
      );
      const challenge = rows[0];
      if (
        !challenge ||
        challenge.locked_at ||
        challenge.verified_at ||
        new Date(challenge.expires_at).getTime() <= Date.now()
      )
        throw new ForbiddenException('Step-up challenge is invalid or expired');
      const supplied = createHash('sha256').update(otp).digest('hex');
      if (supplied !== challenge.otp_hash) {
        await manager.query(
          `UPDATE inv_integrity_step_up_challenges SET failed_attempts=failed_attempts+1,
           locked_at=CASE WHEN failed_attempts+1>=5 THEN NOW() ELSE NULL END WHERE challenge_id=$1`,
          [challengeId],
        );
        return { invalid: true as const };
      }
      await manager.query(
        `UPDATE inv_integrity_step_up_challenges SET verified_at=NOW() WHERE challenge_id=$1`,
        [challengeId],
      );
      return {
        invalid: false as const,
        challenge_id: challengeId,
        verified: true,
        expires_at: challenge.expires_at,
      };
    });
    if (result.invalid)
      throw new ForbiddenException('Verification code is invalid');
    return result;
  }

  private async lockedCase(
    manager: EntityManager,
    caseId: string,
    tenantId: string,
  ) {
    const rows = await manager.query(
      `SELECT * FROM inv_integrity_cases WHERE integrity_case_id=$1 AND tenant_id=$2 FOR UPDATE`,
      [caseId, tenantId],
    );
    if (!rows[0])
      throw new NotFoundException('Invoice integrity case not found');
    return rows[0] as IntegrityCase;
  }

  private async audit(
    manager: EntityManager,
    row: IntegrityCase,
    entityType: string,
    entityId: string,
    eventType: string,
    actorId: string | null,
    previousValues: unknown,
    newValues: unknown,
  ) {
    const previous = await manager.query(
      `SELECT event_hash FROM inv_integrity_audit_events
       WHERE integrity_case_id=$1 ORDER BY created_at DESC,audit_event_id DESC LIMIT 1`,
      [row.integrity_case_id],
    );
    const previousHash = previous[0]?.event_hash ?? null;
    const eventHash = integrityHash({
      case_id: row.integrity_case_id,
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
      `INSERT INTO inv_integrity_audit_events
         (integrity_case_id,tenant_id,entity_type,entity_id,event_type,actor_user_id,
          previous_values,new_values,case_revision,previous_event_hash,event_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11)`,
      [
        row.integrity_case_id,
        row.tenant_id,
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
    row: IntegrityCase,
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
      aggregate_id: row.integrity_case_id,
      aggregate_revision: revision,
      aggregate_sequence: sequence,
      tenant_id: row.tenant_id,
      integrity_case_id: row.integrity_case_id,
      invoice_id: row.invoice_id,
      invoice_revision: Number(row.invoice_revision),
      occurred_at: occurredAt,
      payload,
    };
    await manager.query(
      `INSERT INTO inv_integrity_outbox_events
         (event_id,tenant_id,integrity_case_id,invoice_id,invoice_revision,aggregate_id,
          aggregate_revision,aggregate_sequence,event_type,event_version,occurred_at,payload,payload_hash)
       VALUES ($1,$2,$3,$4,$5,$3,$6,$7,$8,1,$9,$10::jsonb,$11)`,
      [
        eventId,
        row.tenant_id,
        row.integrity_case_id,
        row.invoice_id,
        Number(row.invoice_revision),
        revision,
        sequence,
        eventType,
        occurredAt,
        JSON.stringify(envelope),
        integrityHash(envelope),
      ],
    );
    await manager.query(
      `UPDATE inv_integrity_cases SET aggregate_revision=$2,next_event_sequence=$3,
       updated_at=NOW() WHERE integrity_case_id=$1`,
      [row.integrity_case_id, revision, sequence + 1],
    );
    row.aggregate_revision = revision;
    row.next_event_sequence = sequence + 1;
    return envelope;
  }

  private async withIdempotency<T>(
    manager: EntityManager,
    row: IntegrityCase,
    actor: IntegrityActor,
    key: string,
    request: unknown,
    work: () => Promise<T>,
  ): Promise<T> {
    if (!key?.trim())
      throw new BadRequestException('Idempotency-Key is required');
    const requestHash = integrityHash(request);
    const prior = await manager.query(
      `SELECT request_hash,response_payload FROM inv_integrity_idempotency
       WHERE tenant_id=$1 AND actor_id=$2 AND idempotency_key=$3 FOR UPDATE`,
      [row.tenant_id, actor.user_id, key],
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
        `INSERT INTO inv_integrity_idempotency
           (tenant_id,actor_id,idempotency_key,request_hash)
         VALUES ($1,$2,$3,$4)`,
        [row.tenant_id, actor.user_id, key, requestHash],
      );
    }
    const result = await work();
    await manager.query(
      `UPDATE inv_integrity_idempotency SET response_payload=$4::jsonb
       WHERE tenant_id=$1 AND actor_id=$2 AND idempotency_key=$3`,
      [row.tenant_id, actor.user_id, key, JSON.stringify(result)],
    );
    return result;
  }

  async consumeInvoiceSubmitted(eventId: string) {
    return this.db.transaction(async (manager) => {
      const existing = await manager.query(
        `SELECT * FROM inv_integrity_cases WHERE source_event_id=$1`,
        [eventId],
      );
      if (existing[0]) return existing[0];
      const events = await manager.query(
        `SELECT * FROM proc_outbox_events
         WHERE event_id=$1 AND event_type='ProcurementInvoiceSubmitted.v1' FOR UPDATE`,
        [eventId],
      );
      const event = events[0];
      if (!event)
        throw new NotFoundException('Invoice submitted event not found');
      if (integrityHash(event.payload) !== event.payload_hash)
        throw new ConflictException({
          message: 'Event hash mismatch',
          code: 'EVENT_HASH_MISMATCH',
        });
      const payload = event.payload as Record<string, any>;
      const invoiceRows = await manager.query(
        `SELECT i.*,c.department_id FROM proc_invoices i
         JOIN proc_cases c ON c.proc_case_id=i.proc_case_id
         WHERE i.invoice_id=$1 AND i.tenant_id=$2 FOR UPDATE`,
        [payload.invoice_id, event.tenant_id],
      );
      const invoice = invoiceRows[0];
      if (!invoice || invoice.document_hash !== payload.document_hash)
        throw new ConflictException(
          'Invoice event does not match current document',
        );
      await manager.query(
        `UPDATE inv_integrity_cases SET workflow_state='SUPERSEDED',updated_at=NOW()
         WHERE invoice_id=$1 AND workflow_state NOT IN ('SUPERSEDED','CANCELLED')`,
        [invoice.invoice_id],
      );
      const caseId = randomUUID();
      const rows = await manager.query(
        `INSERT INTO inv_integrity_cases
           (integrity_case_id,tenant_id,proc_case_id,invoice_id,invoice_revision,document_hash,
            invoice_type,source_event_id,invoice_submitter_id,department_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [
          caseId,
          event.tenant_id,
          invoice.proc_case_id,
          invoice.invoice_id,
          invoice.revision,
          invoice.document_hash,
          invoice.invoice_type,
          eventId,
          invoice.entered_by,
          invoice.department_id,
        ],
      );
      const row = rows[0] as IntegrityCase;
      await manager.query(
        `INSERT INTO inv_evidence
           (integrity_case_id,tenant_id,evidence_type,source_method,object_key,content_hash,
            captured_at,captured_by,metadata)
         VALUES ($1,$2,'ORIGINAL_INVOICE','MANUAL_ORIGINAL_UPLOAD',$3,$4,NOW(),$5,$6::jsonb)`,
        [
          caseId,
          row.tenant_id,
          invoice.document_object_key,
          invoice.document_hash,
          invoice.entered_by,
          JSON.stringify({
            invoice_id: invoice.invoice_id,
            invoice_revision: invoice.revision,
          }),
        ],
      );
      await manager.query(
        `UPDATE proc_invoices SET integrity_status='PENDING' WHERE invoice_id=$1`,
        [invoice.invoice_id],
      );
      await this.audit(
        manager,
        row,
        'INTEGRITY_CASE',
        caseId,
        'CASE_OPENED',
        null,
        null,
        {
          invoice_id: invoice.invoice_id,
          invoice_revision: invoice.revision,
          document_hash: invoice.document_hash,
        },
      );
      await this.emit(manager, row, 'InvoiceIntegrityCaseOpened.v1', {
        proc_case_id: invoice.proc_case_id,
        invoice_type: invoice.invoice_type,
        document_hash: invoice.document_hash,
      });
      return row;
    });
  }

  async list(actor: IntegrityActor, state?: string) {
    const grants = await this.grants(actor, 'INVOICE_INTEGRITY_VIEW');
    const tenantWide = grants.some(
      (grant: Record<string, any>) => grant.scope_type === 'TENANT',
    );
    const departments = grants
      .filter((grant: Record<string, any>) => grant.scope_type === 'DEPARTMENT')
      .map((grant: Record<string, any>) => Number(grant.scope_reference))
      .filter(Number.isInteger);
    return this.db.query(
      `SELECT c.*,i.invoice_number,i.total_amount,i.currency,i.invoice_date,
              o.order_number,v.business_name AS vendor_name
       FROM inv_integrity_cases c
       JOIN proc_invoices i ON i.invoice_id=c.invoice_id
       JOIN proc_orders o ON o.order_id=i.order_id
       JOIN fin_vendors v ON v.vendor_id=i.vendor_id
       WHERE c.tenant_id=$1
         AND ($2::boolean OR c.department_id=ANY($3::int[]) OR c.invoice_submitter_id=$4::uuid)
         AND ($5::text IS NULL OR c.workflow_state=$5)
       ORDER BY c.updated_at DESC`,
      [
        this.tenant(actor),
        tenantWide,
        departments,
        actor.user_id,
        state ?? null,
      ],
    );
  }

  async get(actor: IntegrityActor, caseId: string) {
    const row = await this.accessibleCase(actor, caseId);
    const [
      invoice,
      evidence,
      snapshots,
      analyses,
      comparisons,
      market,
      risks,
      blockers,
      requests,
      investigations,
      decisions,
      audit,
    ] = await Promise.all([
      this.db.query(
        `SELECT i.*,o.order_number,o.external_order_id,o.vendor_id AS order_vendor_id,
                  o.currency AS order_currency,v.business_name AS vendor_name
           FROM proc_invoices i JOIN proc_orders o ON o.order_id=i.order_id
           JOIN fin_vendors v ON v.vendor_id=i.vendor_id WHERE i.invoice_id=$1`,
        [row.invoice_id],
      ),
      this.db.query(
        `SELECT evidence_id,evidence_type,source_method,content_hash,captured_at,captured_by,
                  retention_class,legal_hold,supersedes_evidence_id,metadata
           FROM inv_evidence WHERE integrity_case_id=$1 ORDER BY created_at`,
        [caseId],
      ),
      this.db.query(
        `SELECT * FROM inv_source_snapshots WHERE integrity_case_id=$1 ORDER BY created_at`,
        [caseId],
      ),
      this.db.query(
        `SELECT * FROM inv_document_analyses WHERE integrity_case_id=$1 ORDER BY created_at`,
        [caseId],
      ),
      this.db.query(
        `SELECT * FROM inv_field_comparisons WHERE integrity_case_id=$1 ORDER BY created_at`,
        [caseId],
      ),
      this.db.query(
        `SELECT * FROM inv_market_observations WHERE integrity_case_id=$1 ORDER BY created_at`,
        [caseId],
      ),
      this.db.query(
        `SELECT * FROM inv_risk_assessments WHERE integrity_case_id=$1 ORDER BY created_at`,
        [caseId],
      ),
      this.db.query(
        `SELECT * FROM inv_integrity_blockers WHERE integrity_case_id=$1 ORDER BY created_at`,
        [caseId],
      ),
      this.db.query(
        `SELECT evidence_request_id,requested_from,requested_by,public_reason,requested_evidence_types,
                  status,response_text,responded_by,responded_at,due_at,created_at
           FROM inv_evidence_requests WHERE integrity_case_id=$1 ORDER BY created_at`,
        [caseId],
      ),
      this.db.query(
        `SELECT investigation_id,investigator_id,status,recommendation,recommendation_reason,
                  recommended_at,created_at,updated_at
           FROM inv_investigations WHERE integrity_case_id=$1 ORDER BY created_at`,
        [caseId],
      ),
      this.db.query(
        `SELECT * FROM inv_certifications WHERE integrity_case_id=$1 ORDER BY certified_at`,
        [caseId],
      ),
      this.db.query(
        `SELECT * FROM inv_integrity_audit_events WHERE integrity_case_id=$1 ORDER BY created_at`,
        [caseId],
      ),
    ]);
    return {
      ...row,
      invoice: invoice[0],
      evidence,
      source_snapshots: snapshots,
      document_analyses: analyses,
      comparisons,
      market_observations: market,
      risk_assessments: risks,
      blockers,
      evidence_requests: requests,
      investigations,
      certifications: decisions,
      audit_timeline: audit,
    };
  }

  async dashboard(actor: IntegrityActor) {
    const cases = await this.list(actor);
    const byState = cases.reduce(
      (acc: Record<string, number>, row: Record<string, any>) => {
        acc[row.workflow_state] = (acc[row.workflow_state] ?? 0) + 1;
        return acc;
      },
      {},
    );
    return {
      total_cases: cases.length,
      by_state: byState,
      source_unavailable: cases.filter(
        (row: Record<string, any>) =>
          row.analysis_result === 'SOURCE_UNAVAILABLE',
      ).length,
      high_risk: cases.filter(
        (row: Record<string, any>) => row.risk_band === 'HIGH',
      ).length,
      pending_certification: cases.filter(
        (row: Record<string, any>) => row.workflow_state === 'DECISION_PENDING',
      ).length,
    };
  }

  async createSourceAccount(
    actor: IntegrityActor,
    input: {
      department_id?: number;
      platform: string;
      account_label: string;
      external_account_reference: string;
      secret_reference?: string;
      allowed_domains: string[];
      allowed_methods?: string[];
    },
  ) {
    const grants = await this.grants(actor, 'INVOICE_SOURCE_MANAGE');
    if (!grants.length)
      throw new ForbiddenException('Source management capability is required');
    if (!input.platform?.trim() || !input.external_account_reference?.trim())
      throw new BadRequestException(
        'Platform and external account reference are required',
      );
    if (
      input.secret_reference &&
      !/^(vault|kms|secret):\/\//i.test(input.secret_reference)
    )
      throw new BadRequestException(
        'Only an encrypted secret reference may be stored',
      );
    const domains = input.allowed_domains.map((domain) =>
      domain.trim().toLowerCase(),
    );
    if (
      !domains.length ||
      domains.some((domain) => !/^[a-z0-9.-]+$/.test(domain))
    )
      throw new BadRequestException(
        'An explicit hostname allowlist is required',
      );
    const rows = await this.db.query(
      `INSERT INTO inv_source_accounts
         (tenant_id,department_id,platform,account_label,external_account_reference,
          secret_reference,allowed_domains,allowed_methods,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9)
       RETURNING source_account_id,department_id,platform,account_label,
                 external_account_reference,allowed_domains,allowed_methods,status,created_at`,
      [
        this.tenant(actor),
        input.department_id ?? null,
        input.platform.trim(),
        input.account_label.trim(),
        input.external_account_reference.trim(),
        input.secret_reference ?? null,
        JSON.stringify(domains),
        JSON.stringify(
          input.allowed_methods ?? [
            'API_OAUTH',
            'PLATFORM_EXPORT',
            'ATTENDED_BROWSER',
          ],
        ),
        actor.user_id,
      ],
    );
    return rows[0];
  }

  async initiateRetrieval(
    actor: IntegrityActor,
    caseId: string,
    expectedRevision: number,
    input: {
      source_account_id: string;
      retrieval_method: string;
      target_order_id: string;
    },
    idempotencyKey: string,
  ) {
    const access = await this.accessibleCase(
      actor,
      caseId,
      'INVOICE_SOURCE_RETRIEVE',
    );
    if (input.retrieval_method === 'ATTENDED_BROWSER')
      await this.assertStepUp(actor, caseId, 'ATTENDED_RETRIEVAL');
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertRevision(row, expectedRevision);
      return this.withIdempotency(
        manager,
        row,
        actor,
        idempotencyKey,
        input,
        async () => {
          const accounts = await manager.query(
            `SELECT source_account_id,platform,allowed_methods,status FROM inv_source_accounts
           WHERE source_account_id=$1 AND tenant_id=$2
             AND (department_id IS NULL OR department_id=$3)`,
            [input.source_account_id, row.tenant_id, row.department_id],
          );
          const account = accounts[0];
          if (!account || account.status !== 'ACTIVE')
            throw new ConflictException(
              'Source account is unavailable for this case',
            );
          if (
            !(account.allowed_methods as string[]).includes(
              input.retrieval_method,
            )
          )
            throw new ForbiddenException(
              'Retrieval method is not permitted for this account',
            );
          const attemptId = randomUUID();
          await manager.query(
            `INSERT INTO inv_retrieval_attempts
             (retrieval_attempt_id,integrity_case_id,tenant_id,source_account_id,retrieval_method,
              target_order_id,status,requested_by,started_at,idempotency_key)
           VALUES ($1,$2,$3,$4,$5,$6,'RUNNING',$7,NOW(),$8)`,
            [
              attemptId,
              caseId,
              row.tenant_id,
              input.source_account_id,
              input.retrieval_method,
              input.target_order_id,
              actor.user_id,
              idempotencyKey,
            ],
          );
          let session: Record<string, unknown> | null = null;
          if (input.retrieval_method === 'ATTENDED_BROWSER') {
            const sessionId = randomUUID();
            const browserProfileId = randomUUID();
            const sessions = await manager.query(
              `INSERT INTO inv_attended_sessions
               (session_id,tenant_id,integrity_case_id,retrieval_attempt_id,operator_id,
                source_account_id,platform,target_order_id,browser_profile_id,step_up_verified_at,
                operator_present_at,status,started_at,expires_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW(),'ACTIVE',NOW(),NOW()+INTERVAL '20 minutes')
             RETURNING session_id,status,platform,target_order_id,expires_at`,
              [
                sessionId,
                row.tenant_id,
                caseId,
                attemptId,
                actor.user_id,
                input.source_account_id,
                account.platform,
                input.target_order_id,
                browserProfileId,
              ],
            );
            session = sessions[0];
          }
          await this.audit(
            manager,
            row,
            'RETRIEVAL',
            attemptId,
            'RETRIEVAL_STARTED',
            actor.user_id,
            null,
            {
              method: input.retrieval_method,
              target_order_id: input.target_order_id,
            },
          );
          await manager.query(
            `UPDATE inv_integrity_cases SET workflow_state='ANALYZING',aggregate_revision=aggregate_revision+1,
           updated_at=NOW() WHERE integrity_case_id=$1`,
            [caseId],
          );
          return {
            retrieval_attempt_id: attemptId,
            session,
            aggregate_revision: Number(row.aggregate_revision) + 1,
          };
        },
      );
    });
  }

  async completeAttendedSession(
    actor: IntegrityActor,
    caseId: string,
    sessionId: string,
    expectedRevision: number,
    input: {
      status: 'COMPLETED' | 'FAILED' | 'CANCELLED';
      result?: Record<string, unknown>;
      evidence_ids?: string[];
    },
  ) {
    const access = await this.accessibleCase(
      actor,
      caseId,
      'INVOICE_SOURCE_RETRIEVE',
    );
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertRevision(row, expectedRevision);
      const sessions = await manager.query(
        `SELECT * FROM inv_attended_sessions
         WHERE session_id=$1 AND integrity_case_id=$2 AND tenant_id=$3 AND operator_id=$4 FOR UPDATE`,
        [sessionId, caseId, row.tenant_id, actor.user_id],
      );
      const session = sessions[0];
      if (!session || session.status !== 'ACTIVE')
        throw new ConflictException('Attended retrieval session is not active');
      const expired = new Date(session.expires_at).getTime() <= Date.now();
      const status = expired ? 'EXPIRED' : input.status;
      const evidenceIds = input.evidence_ids ?? [];
      if (evidenceIds.length) {
        const evidence = await manager.query(
          `SELECT evidence_id FROM inv_evidence
           WHERE integrity_case_id=$1 AND tenant_id=$2 AND evidence_id=ANY($3::uuid[])`,
          [caseId, row.tenant_id, evidenceIds],
        );
        if (evidence.length !== new Set(evidenceIds).size)
          throw new BadRequestException(
            'Session evidence does not belong to this case',
          );
      }
      await manager.query(
        `UPDATE inv_attended_sessions SET status=$2,result=$3::jsonb,evidence_ids=$4::jsonb,
         ended_at=NOW(),profile_destroyed_at=NOW(),updated_at=NOW() WHERE session_id=$1`,
        [
          sessionId,
          status,
          JSON.stringify(input.result ?? {}),
          JSON.stringify(evidenceIds),
        ],
      );
      await manager.query(
        `UPDATE inv_retrieval_attempts SET status=$2,result_summary=$3::jsonb,ended_at=NOW()
         WHERE retrieval_attempt_id=$1`,
        [
          session.retrieval_attempt_id,
          status === 'COMPLETED' ? 'SUCCEEDED' : status,
          JSON.stringify(input.result ?? {}),
        ],
      );
      await this.audit(
        manager,
        row,
        'ATTENDED_SESSION',
        sessionId,
        'ATTENDED_SESSION_ENDED',
        actor.user_id,
        null,
        { status, profile_destroyed: true, evidence_ids: evidenceIds },
      );
      await manager.query(
        `UPDATE inv_integrity_cases SET aggregate_revision=aggregate_revision+1,updated_at=NOW()
         WHERE integrity_case_id=$1`,
        [caseId],
      );
      return {
        session_id: sessionId,
        status,
        profile_destroyed: true,
        aggregate_revision: Number(row.aggregate_revision) + 1,
      };
    });
  }

  async recordSourceSnapshot(
    actor: IntegrityActor,
    caseId: string,
    expectedRevision: number,
    input: SourceSnapshotInput,
    idempotencyKey: string,
  ) {
    const access = await this.accessibleCase(
      actor,
      caseId,
      'INVOICE_SOURCE_RETRIEVE',
    );
    if (
      !input.external_transaction_id?.trim() ||
      !Object.keys(input.payload ?? {}).length
    )
      throw new BadRequestException(
        'External transaction identity and payload are required',
      );
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertRevision(row, expectedRevision);
      return this.withIdempotency(
        manager,
        row,
        actor,
        idempotencyKey,
        input,
        async () => {
          const accounts = await manager.query(
            `SELECT * FROM inv_source_accounts WHERE source_account_id=$1 AND tenant_id=$2`,
            [input.source_account_id, row.tenant_id],
          );
          const account = accounts[0];
          if (!account || account.status !== 'ACTIVE')
            throw new ConflictException('Source account is unavailable');
          if (
            account.platform.toLowerCase() !==
            input.source_platform.toLowerCase()
          )
            throw new ConflictException({
              message: 'Source account platform mismatch',
              code: 'SOURCE_ACCOUNT_MISMATCH',
            });
          if (input.retrieval_attempt_id) {
            const attempts = await manager.query(
              `SELECT * FROM inv_retrieval_attempts
             WHERE retrieval_attempt_id=$1 AND integrity_case_id=$2 AND source_account_id=$3 FOR UPDATE`,
              [input.retrieval_attempt_id, caseId, input.source_account_id],
            );
            if (!attempts[0])
              throw new ConflictException(
                'Retrieval attempt does not match case/account',
              );
          }
          const contentHash = integrityHash(input.payload);
          const reuse = await manager.query(
            `SELECT s.source_snapshot_id,s.integrity_case_id FROM inv_source_snapshots s
           WHERE s.tenant_id=$1 AND lower(s.source_platform)=lower($2)
             AND s.source_account_id=$3 AND s.external_transaction_id=$4
             AND s.integrity_case_id<>$5 LIMIT 1`,
            [
              row.tenant_id,
              input.source_platform,
              input.source_account_id,
              input.external_transaction_id,
              caseId,
            ],
          );
          const snapshotId = randomUUID();
          await manager.query(
            `INSERT INTO inv_source_snapshots
             (source_snapshot_id,integrity_case_id,tenant_id,source_platform,source_account_id,
              external_transaction_id,source_revision,retrieval_method,retrieval_attempt_id,
              retrieved_at,retrieved_by,payload,content_hash)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),$10,$11::jsonb,$12)`,
            [
              snapshotId,
              caseId,
              row.tenant_id,
              input.source_platform.trim(),
              input.source_account_id,
              input.external_transaction_id.trim(),
              input.source_revision ?? null,
              input.retrieval_method,
              input.retrieval_attempt_id ?? null,
              actor.user_id,
              JSON.stringify(input.payload),
              contentHash,
            ],
          );
          await manager.query(
            `INSERT INTO inv_evidence
             (integrity_case_id,tenant_id,evidence_type,source_method,source_reference,
              content_hash,captured_at,captured_by,retrieval_attempt_id,metadata)
           VALUES ($1,$2,'AUTHORITATIVE_SOURCE_SNAPSHOT',$3,$4,$5,NOW(),$6,$7,$8::jsonb)`,
            [
              caseId,
              row.tenant_id,
              input.retrieval_method,
              `${input.source_platform}:${input.external_transaction_id}`,
              contentHash,
              actor.user_id,
              input.retrieval_attempt_id ?? null,
              JSON.stringify({ source_snapshot_id: snapshotId }),
            ],
          );
          if (reuse[0])
            await this.insertBlocker(
              manager,
              row,
              'DUPLICATE_TRANSACTION',
              snapshotId,
              {
                prior_integrity_case_id: reuse[0].integrity_case_id,
                external_transaction_id: input.external_transaction_id,
              },
            );
          if (input.retrieval_attempt_id) {
            await manager.query(
              `UPDATE inv_retrieval_attempts SET status='SUCCEEDED',ended_at=NOW(),
             result_summary=$2::jsonb WHERE retrieval_attempt_id=$1`,
              [
                input.retrieval_attempt_id,
                JSON.stringify({
                  source_snapshot_id: snapshotId,
                  content_hash: contentHash,
                }),
              ],
            );
            await manager.query(
              `UPDATE inv_attended_sessions SET status='COMPLETED',ended_at=NOW(),profile_destroyed_at=NOW(),
             result=$2::jsonb WHERE retrieval_attempt_id=$1`,
              [
                input.retrieval_attempt_id,
                JSON.stringify({ source_snapshot_id: snapshotId }),
              ],
            );
          }
          await this.audit(
            manager,
            row,
            'SOURCE_SNAPSHOT',
            snapshotId,
            'SOURCE_RETRIEVED',
            actor.user_id,
            null,
            {
              source_platform: input.source_platform,
              external_transaction_id: input.external_transaction_id,
              content_hash: contentHash,
            },
          );
          const event = await this.emit(
            manager,
            row,
            'InvoiceSourceRetrieved.v1',
            {
              source_snapshot_id: snapshotId,
              source_platform: input.source_platform,
              external_transaction_id: input.external_transaction_id,
              content_hash: contentHash,
            },
          );
          return {
            source_snapshot_id: snapshotId,
            content_hash: contentHash,
            event,
            aggregate_revision: Number(row.aggregate_revision),
          };
        },
      );
    });
  }

  async addMarketObservation(
    actor: IntegrityActor,
    caseId: string,
    expectedRevision: number,
    input: MarketObservationInput,
  ) {
    const access = await this.accessibleCase(
      actor,
      caseId,
      'INVOICE_INTEGRITY_ANALYZE',
    );
    if (
      !/^https:\/\//i.test(input.source_url_or_reference) &&
      !input.source_url_or_reference.startsWith('internal:')
    )
      throw new BadRequestException(
        'Market evidence must use HTTPS or an internal reference',
      );
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertRevision(row, expectedRevision);
      const id = randomUUID();
      const contentHash = integrityHash(input);
      await manager.query(
        `INSERT INTO inv_market_observations
           (market_observation_id,integrity_case_id,tenant_id,source,source_url_or_reference,
            captured_at,applicable_purchase_date,observed_price,currency,product_identifier,
            variant,condition,availability,shipping_amount,tax_included,content_hash,captured_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          id,
          caseId,
          row.tenant_id,
          input.source,
          input.source_url_or_reference,
          input.captured_at,
          input.applicable_purchase_date ?? null,
          input.observed_price,
          input.currency.toUpperCase(),
          input.product_identifier,
          input.variant ?? null,
          input.condition ?? null,
          input.availability ?? null,
          input.shipping_amount ?? 0,
          input.tax_included ?? null,
          contentHash,
          actor.user_id,
        ],
      );
      await this.audit(
        manager,
        row,
        'MARKET_OBSERVATION',
        id,
        'MARKET_OBSERVATION_ADDED',
        actor.user_id,
        null,
        {
          content_hash: contentHash,
        },
      );
      await manager.query(
        `UPDATE inv_integrity_cases SET aggregate_revision=aggregate_revision+1,updated_at=NOW() WHERE integrity_case_id=$1`,
        [caseId],
      );
      return {
        market_observation_id: id,
        content_hash: contentHash,
        aggregate_revision: Number(row.aggregate_revision) + 1,
      };
    });
  }

  private async insertBlocker(
    manager: EntityManager,
    row: IntegrityCase,
    blockerType: IntegrityBlocker,
    sourceId: string | null,
    details: Record<string, unknown>,
  ) {
    const id = randomUUID();
    await manager.query(
      `INSERT INTO inv_integrity_blockers
         (blocker_id,integrity_case_id,tenant_id,blocker_type,details,source_id)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6)
       ON CONFLICT (integrity_case_id,blocker_type,source_id) DO NOTHING`,
      [
        id,
        row.integrity_case_id,
        row.tenant_id,
        blockerType,
        JSON.stringify(details),
        sourceId,
      ],
    );
    return id;
  }

  private async policy(
    manager: EntityManager,
    row: IntegrityCase,
    category: string,
  ) {
    const policies = await manager.query(
      `SELECT * FROM inv_integrity_policies
       WHERE tenant_id=$1 AND status='PUBLISHED' AND effective_from<=NOW()
         AND (effective_to IS NULL OR effective_to>NOW())
         AND category IN ($2,'*') AND invoice_type IN ($3,'*')
       ORDER BY (category=$2) DESC,(invoice_type=$3) DESC,policy_version DESC LIMIT 1`,
      [row.tenant_id, category, row.invoice_type],
    );
    if (!policies[0])
      throw new ConflictException('No published invoice integrity policy');
    return policies[0] as Record<string, any>;
  }

  async analyze(
    actor: IntegrityActor,
    caseId: string,
    expectedRevision: number,
    input: {
      parser_version?: string;
      extracted_fields?: Record<string, unknown>;
      field_confidence?: Record<string, number>;
      forensic_signals?: Array<Record<string, unknown>>;
    },
    idempotencyKey: string,
  ) {
    const access = await this.accessibleCase(
      actor,
      caseId,
      'INVOICE_INTEGRITY_ANALYZE',
    );
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertRevision(row, expectedRevision);
      if (['CLOSED', 'CANCELLED', 'SUPERSEDED'].includes(row.workflow_state))
        throw new ConflictException(`Integrity case is ${row.workflow_state}`);
      return this.withIdempotency(
        manager,
        row,
        actor,
        idempotencyKey,
        input,
        async () => {
          await manager.query(
            `UPDATE inv_integrity_cases SET workflow_state='ANALYZING',updated_at=NOW() WHERE integrity_case_id=$1`,
            [caseId],
          );
          const invoiceRows = await manager.query(
            `SELECT i.*,o.external_order_id,o.order_number,o.vendor_id AS order_vendor_id,
                  o.currency AS order_currency,v.risk_score AS vendor_risk,pcl.category
           FROM proc_invoices i JOIN proc_orders o ON o.order_id=i.order_id
           JOIN fin_vendors v ON v.vendor_id=i.vendor_id
           JOIN proc_invoice_lines il ON il.invoice_id=i.invoice_id
           JOIN proc_case_lines pcl ON pcl.proc_case_line_id=il.proc_case_line_id
           WHERE i.invoice_id=$1 LIMIT 1`,
            [row.invoice_id],
          );
          const invoice = invoiceRows[0];
          if (
            !invoice ||
            Number(invoice.revision) !== Number(row.invoice_revision) ||
            invoice.document_hash !== row.document_hash
          ) {
            await this.insertBlocker(
              manager,
              row,
              'DOCUMENT_REPLACEMENT',
              null,
              {
                expected_revision: row.invoice_revision,
                current_revision: invoice?.revision,
              },
            );
            throw new ConflictException({
              message: 'Invoice evidence changed',
              code: 'INTEGRITY_CASE_STALE',
            });
          }
          const policy = await this.policy(manager, row, invoice.category);
          const snapshots = await manager.query(
            `SELECT * FROM inv_source_snapshots WHERE integrity_case_id=$1 ORDER BY created_at DESC LIMIT 1`,
            [caseId],
          );
          const snapshot = snapshots[0] as Record<string, any> | undefined;
          const blockers: IntegrityBlocker[] = [];
          const dimensions: Array<Record<string, unknown>> = [];
          let analysisResult = 'SOURCE_UNAVAILABLE';
          let sourceRiskStatus: RiskFactor['status'] = 'UNAVAILABLE';
          let sourceRisk = 100;
          let sourceConfidence = 0;
          if (snapshot) {
            const source = snapshot.payload as Record<string, any>;
            sourceRiskStatus = 'AVAILABLE';
            sourceConfidence = 100;
            const checks = [
              [
                'ORDER',
                invoice.external_order_id ?? invoice.order_number,
                source.order_id,
                'ORDER_IDENTITY_MISMATCH',
              ],
              [
                'VENDOR',
                invoice.vendor_id,
                source.vendor_id,
                'VENDOR_IDENTITY_MISMATCH',
              ],
              [
                'CURRENCY',
                invoice.currency,
                source.currency,
                'CURRENCY_MISMATCH',
              ],
            ] as const;
            for (const [dimension, expected, actual, blocker] of checks) {
              const pass =
                String(expected ?? '').toLowerCase() ===
                String(actual ?? '').toLowerCase();
              dimensions.push({ dimension, expected, actual, pass });
              if (!pass) {
                blockers.push(blocker);
                await this.insertBlocker(
                  manager,
                  row,
                  blocker,
                  snapshot.source_snapshot_id,
                  { expected, actual },
                );
              }
            }
            const amountPass = amountWithinTolerance(
              Number(invoice.total_amount),
              Number(source.total_amount),
              Number(policy.rounding_tolerance_amount),
              Number(policy.rounding_tolerance_percent),
            );
            dimensions.push({
              dimension: 'TOTAL_AMOUNT',
              expected: invoice.total_amount,
              actual: source.total_amount,
              pass: amountPass,
            });
            if (!amountPass) {
              blockers.push('MATERIAL_AMOUNT_DIFFERENCE');
              await this.insertBlocker(
                manager,
                row,
                'MATERIAL_AMOUNT_DIFFERENCE',
                snapshot.source_snapshot_id,
                {
                  expected: invoice.total_amount,
                  actual: source.total_amount,
                },
              );
            }
            sourceRisk = blockers.length ? 100 : 0;
            analysisResult = blockers.length
              ? 'POTENTIAL_DISCREPANCY'
              : 'SOURCE_MATCHED';
          } else if (!['ONLINE_INSTITUTIONAL'].includes(row.invoice_type)) {
            sourceRiskStatus = 'NOT_APPLICABLE';
            analysisResult = 'OFFLINE_ANALYZED';
          }
          const market = await manager.query(
            `SELECT observed_price,shipping_amount,currency FROM inv_market_observations
           WHERE integrity_case_id=$1`,
            [caseId],
          );
          const comparable = market.filter(
            (item: Record<string, any>) => item.currency === invoice.currency,
          );
          const median = comparable.length
            ? comparable
                .map(
                  (item: Record<string, any>) =>
                    Number(item.observed_price) + Number(item.shipping_amount),
                )
                .sort((a: number, b: number) => a - b)[
                Math.floor(comparable.length / 2)
              ]
            : null;
          const priceDeviation = median
            ? Math.min(
                100,
                (Math.abs(Number(invoice.total_amount) - median) * 100) /
                  Math.max(median, 0.01),
              )
            : 0;
          const forensicSignals = input.forensic_signals ?? [];
          const documentConfidenceValues = Object.values(
            input.field_confidence ?? {},
          );
          const documentConfidence = documentConfidenceValues.length
            ? documentConfidenceValues.reduce(
                (sum, value) => sum + Number(value),
                0,
              ) / documentConfidenceValues.length
            : 60;
          const factors: RiskFactor[] = [
            {
              name: 'SOURCE_DISCREPANCY',
              weight: Number(policy.factor_weights.SOURCE_DISCREPANCY),
              status: sourceRiskStatus,
              normalized_score: sourceRisk,
              confidence: sourceConfidence,
              raw_inputs: {
                source_snapshot_id: snapshot?.source_snapshot_id ?? null,
                dimensions,
              },
            },
            {
              name: 'PRICE_DEVIATION',
              weight: Number(policy.factor_weights.PRICE_DEVIATION),
              status: comparable.length ? 'AVAILABLE' : 'UNAVAILABLE',
              normalized_score: priceDeviation,
              confidence: Math.min(100, comparable.length * 35),
              raw_inputs: { observation_count: comparable.length, median },
            },
            {
              name: 'DOCUMENT_ANOMALY',
              weight: Number(policy.factor_weights.DOCUMENT_ANOMALY),
              status: 'AVAILABLE',
              normalized_score: Math.min(100, forensicSignals.length * 20),
              confidence: documentConfidence,
              raw_inputs: { signals: forensicSignals },
            },
            {
              name: 'PRODUCT_ORDER_MISMATCH',
              weight: Number(policy.factor_weights.PRODUCT_ORDER_MISMATCH),
              status: snapshot ? 'AVAILABLE' : 'INSUFFICIENT',
              normalized_score: blockers.includes('ORDER_IDENTITY_MISMATCH')
                ? 100
                : 0,
              confidence: snapshot ? 100 : 0,
            },
            {
              name: 'VENDOR_HISTORY',
              weight: Number(policy.factor_weights.VENDOR_HISTORY),
              status: invoice.vendor_risk == null ? 'UNAVAILABLE' : 'AVAILABLE',
              normalized_score: Number(invoice.vendor_risk ?? 0),
              confidence: invoice.vendor_risk == null ? 0 : 80,
            },
            {
              name: 'MISSING_EVIDENCE',
              weight: Number(policy.factor_weights.MISSING_EVIDENCE),
              status: 'AVAILABLE',
              normalized_score:
                snapshot || row.invoice_type !== 'ONLINE_INSTITUTIONAL'
                  ? 0
                  : 100,
              confidence: 100,
            },
            {
              name: 'PURCHASING_PATTERN',
              weight: Number(policy.factor_weights.PURCHASING_PATTERN),
              status: 'INSUFFICIENT',
            },
            {
              name: 'REPEATED_DISCREPANCIES',
              weight: Number(policy.factor_weights.REPEATED_DISCREPANCIES),
              status: 'INSUFFICIENT',
            },
          ];
          const result = calculateRisk(factors);
          const evidenceRows = await manager.query(
            `SELECT evidence_type FROM inv_evidence WHERE integrity_case_id=$1`,
            [caseId],
          );
          const presentTypes = new Set(
            evidenceRows.map((item: Record<string, any>) => item.evidence_type),
          );
          const requiredEvidenceComplete = (
            policy.required_evidence as string[]
          ).every((type) => presentTypes.has(type));
          const eligible = automatedClearanceEligible({
            invoiceType: row.invoice_type,
            analysisResult,
            riskScore: result.risk_score,
            coverageScore: result.coverage_score,
            confidenceScore: result.confidence_score,
            minCoverage: Number(policy.automated_min_coverage),
            minConfidence: Number(policy.automated_min_confidence),
            blockers,
            requiredEvidenceComplete,
          });
          const analysisId = randomUUID();
          const deterministic = {
            parser_version: input.parser_version ?? 'falcon-deterministic-v1',
            document_hash: row.document_hash,
            extracted_fields: input.extracted_fields ?? {},
            field_confidence: input.field_confidence ?? {},
            forensic_signals: forensicSignals,
          };
          await manager.query(
            `INSERT INTO inv_document_analyses
             (document_analysis_id,integrity_case_id,tenant_id,document_hash,parser_version,
              extracted_fields,field_confidence,forensic_signals,deterministic_result,ai_status,result_hash)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,'NOT_USED',$10)`,
            [
              analysisId,
              caseId,
              row.tenant_id,
              row.document_hash,
              deterministic.parser_version,
              JSON.stringify(deterministic.extracted_fields),
              JSON.stringify(deterministic.field_confidence),
              JSON.stringify(forensicSignals),
              JSON.stringify(deterministic),
              integrityHash(deterministic),
            ],
          );
          const comparisonId = randomUUID();
          await manager.query(
            `INSERT INTO inv_field_comparisons
             (comparison_id,integrity_case_id,tenant_id,source_snapshot_id,integrity_policy_id,
              policy_version,dimensions,analysis_result,comparison_hash)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
            [
              comparisonId,
              caseId,
              row.tenant_id,
              snapshot?.source_snapshot_id ?? null,
              policy.integrity_policy_id,
              policy.policy_version,
              JSON.stringify(dimensions),
              analysisResult,
              integrityHash({
                dimensions,
                analysisResult,
                policy_version: policy.policy_version,
              }),
            ],
          );
          const riskId = randomUUID();
          const assessment = {
            ...result,
            automated_clearance_eligible: eligible,
            policy_version: policy.policy_version,
          };
          await manager.query(
            `INSERT INTO inv_risk_assessments
             (risk_assessment_id,integrity_case_id,tenant_id,integrity_policy_id,policy_version,
              factors,risk_score,coverage_score,confidence_score,risk_band,
              automated_clearance_eligible,assessment_hash)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12)`,
            [
              riskId,
              caseId,
              row.tenant_id,
              policy.integrity_policy_id,
              policy.policy_version,
              JSON.stringify(result.factors),
              result.risk_score,
              result.coverage_score,
              result.confidence_score,
              result.risk_band,
              eligible,
              integrityHash(assessment),
            ],
          );
          const nextState = eligible ? 'DECISION_PENDING' : 'MANUAL_REVIEW';
          await manager.query(
            `UPDATE inv_integrity_cases SET workflow_state=$2,analysis_result=$3,
           trust_level=$4,updated_at=NOW() WHERE integrity_case_id=$1`,
            [
              caseId,
              nextState,
              analysisResult,
              analysisResult === 'SOURCE_MATCHED'
                ? 'ANALYZED_ONLY'
                : 'UNVERIFIED',
            ],
          );
          await this.audit(
            manager,
            row,
            'RISK_ASSESSMENT',
            riskId,
            'INTEGRITY_ANALYZED',
            actor.user_id,
            null,
            assessment,
          );
          const event = await this.emit(
            manager,
            row,
            'InvoiceIntegrityAnalyzed.v1',
            {
              analysis_result: analysisResult,
              risk_assessment_id: riskId,
              risk_score: result.risk_score,
              coverage_score: result.coverage_score,
              confidence_score: result.confidence_score,
              blockers,
              automated_clearance_eligible: eligible,
            },
          );
          if (eligible) {
            return this.certifyAutomated(
              manager,
              row,
              policy,
              riskId,
              analysisId,
              event,
            );
          }
          return {
            analysis_result: analysisResult,
            risk_assessment_id: riskId,
            ...result,
            blockers,
            automated_clearance_eligible: false,
            event,
            aggregate_revision: Number(row.aggregate_revision),
          };
        },
      );
    });
  }

  private async buildEvidenceSetHash(
    manager: EntityManager,
    row: IntegrityCase,
    riskAssessmentId: string,
  ) {
    const [evidence, snapshots, analyses] = await Promise.all([
      manager.query(
        `SELECT evidence_id,content_hash FROM inv_evidence WHERE integrity_case_id=$1`,
        [row.integrity_case_id],
      ),
      manager.query(
        `SELECT source_snapshot_id,content_hash FROM inv_source_snapshots WHERE integrity_case_id=$1`,
        [row.integrity_case_id],
      ),
      manager.query(
        `SELECT document_analysis_id FROM inv_document_analyses WHERE integrity_case_id=$1`,
        [row.integrity_case_id],
      ),
    ]);
    return evidenceSetHash({
      evidence,
      snapshots,
      analysisIds: analyses.map(
        (item: Record<string, any>) => item.document_analysis_id,
      ),
      riskAssessmentId,
    });
  }

  private async certifyAutomated(
    manager: EntityManager,
    row: IntegrityCase,
    policy: Record<string, any>,
    riskAssessmentId: string,
    analysisId: string,
    analysisEvent: unknown,
  ) {
    const evidenceHash = await this.buildEvidenceSetHash(
      manager,
      row,
      riskAssessmentId,
    );
    const decisionId = randomUUID();
    const previous = await manager.query(
      `SELECT integrity_decision_id,decision_hash FROM inv_certifications
       WHERE integrity_case_id=$1 ORDER BY certified_at DESC LIMIT 1`,
      [row.integrity_case_id],
    );
    const decisionPayload = {
      integrity_case_id: row.integrity_case_id,
      invoice_id: row.invoice_id,
      invoice_revision: Number(row.invoice_revision),
      document_hash: row.document_hash,
      evidence_set_hash: evidenceHash,
      risk_assessment_id: riskAssessmentId,
      policy_version: policy.policy_version,
      decision: 'CLEARED_AUTOMATED',
      trust_level: 'SOURCE_VERIFIED',
      previous_decision_hash: previous[0]?.decision_hash ?? null,
    };
    const decisionHash = integrityHash(decisionPayload);
    await manager.query(
      `INSERT INTO inv_certifications
         (integrity_decision_id,integrity_case_id,tenant_id,invoice_id,invoice_revision,
          document_hash,evidence_set_hash,risk_assessment_id,integrity_policy_id,policy_version,
          decision,trust_level,decision_reason,supersedes_decision_id,previous_decision_hash,decision_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'CLEARED_AUTOMATED','SOURCE_VERIFIED',
               'Authoritative source matched under the published policy',$11,$12,$13)`,
      [
        decisionId,
        row.integrity_case_id,
        row.tenant_id,
        row.invoice_id,
        Number(row.invoice_revision),
        row.document_hash,
        evidenceHash,
        riskAssessmentId,
        policy.integrity_policy_id,
        policy.policy_version,
        previous[0]?.integrity_decision_id ?? null,
        previous[0]?.decision_hash ?? null,
        decisionHash,
      ],
    );
    await manager.query(
      `UPDATE inv_integrity_cases SET workflow_state='CLOSED',final_decision='CLEARED_AUTOMATED',
       trust_level='SOURCE_VERIFIED',closed_at=NOW(),updated_at=NOW() WHERE integrity_case_id=$1`,
      [row.integrity_case_id],
    );
    await this.audit(
      manager,
      row,
      'CERTIFICATION',
      decisionId,
      'INTEGRITY_CLEARED_AUTOMATED',
      null,
      null,
      decisionPayload,
    );
    const event = await this.emit(manager, row, 'InvoiceIntegrityCleared.v1', {
      integrity_decision_id: decisionId,
      decision: 'CLEARED_AUTOMATED',
      trust_level: 'SOURCE_VERIFIED',
      document_hash: row.document_hash,
      evidence_set_hash: evidenceHash,
      risk_assessment_id: riskAssessmentId,
      decision_hash: decisionHash,
      policy_version: policy.policy_version,
    });
    return {
      analysis_event: analysisEvent,
      document_analysis_id: analysisId,
      integrity_decision_id: decisionId,
      final_decision: 'CLEARED_AUTOMATED',
      trust_level: 'SOURCE_VERIFIED',
      evidence_set_hash: evidenceHash,
      decision_hash: decisionHash,
      event,
      aggregate_revision: Number(row.aggregate_revision),
    };
  }

  async requestEvidence(
    actor: IntegrityActor,
    caseId: string,
    expectedRevision: number,
    input: {
      requested_from: string;
      public_reason: string;
      requested_evidence_types: string[];
      due_at?: string;
    },
  ) {
    const access = await this.accessibleCase(
      actor,
      caseId,
      'INVOICE_INTEGRITY_INVESTIGATE',
    );
    if (!input.public_reason?.trim())
      throw new BadRequestException('Public evidence reason is required');
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertRevision(row, expectedRevision);
      const id = randomUUID();
      await manager.query(
        `INSERT INTO inv_evidence_requests
           (evidence_request_id,integrity_case_id,tenant_id,requested_from,requested_by,
            public_reason,requested_evidence_types,due_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
        [
          id,
          caseId,
          row.tenant_id,
          input.requested_from,
          actor.user_id,
          input.public_reason.trim(),
          JSON.stringify(input.requested_evidence_types ?? []),
          input.due_at ?? null,
        ],
      );
      await manager.query(
        `UPDATE inv_integrity_cases SET workflow_state='AWAITING_EVIDENCE',updated_at=NOW() WHERE integrity_case_id=$1`,
        [caseId],
      );
      await this.audit(
        manager,
        row,
        'EVIDENCE_REQUEST',
        id,
        'EVIDENCE_REQUESTED',
        actor.user_id,
        null,
        {
          requested_from: input.requested_from,
          public_reason: input.public_reason,
        },
      );
      const event = await this.emit(
        manager,
        row,
        'InvoiceEvidenceRequested.v1',
        {
          evidence_request_id: id,
          requested_from: input.requested_from,
          public_reason: input.public_reason,
          due_at: input.due_at ?? null,
        },
      );
      return {
        evidence_request_id: id,
        status: 'OPEN',
        event,
        aggregate_revision: Number(row.aggregate_revision),
      };
    });
  }

  async respondEvidence(
    actor: IntegrityActor,
    caseId: string,
    requestId: string,
    expectedRevision: number,
    responseText: string,
  ) {
    const access = await this.accessibleCase(actor, caseId);
    if (!responseText?.trim())
      throw new BadRequestException('Evidence response is required');
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertRevision(row, expectedRevision);
      const requests = await manager.query(
        `SELECT * FROM inv_evidence_requests
         WHERE evidence_request_id=$1 AND integrity_case_id=$2 FOR UPDATE`,
        [requestId, caseId],
      );
      const request = requests[0];
      if (!request || request.requested_from !== actor.user_id)
        throw new NotFoundException('Evidence request not found');
      if (request.status !== 'OPEN')
        throw new ConflictException(`Evidence request is ${request.status}`);
      await manager.query(
        `UPDATE inv_evidence_requests SET status='RESPONDED',response_text=$2,
         responded_by=$3,responded_at=NOW() WHERE evidence_request_id=$1`,
        [requestId, responseText.trim(), actor.user_id],
      );
      await manager.query(
        `UPDATE inv_integrity_cases SET workflow_state='MANUAL_REVIEW',aggregate_revision=aggregate_revision+1,
         updated_at=NOW() WHERE integrity_case_id=$1`,
        [caseId],
      );
      await this.audit(
        manager,
        row,
        'EVIDENCE_REQUEST',
        requestId,
        'EVIDENCE_RESPONDED',
        actor.user_id,
        null,
        {
          response_present: true,
        },
      );
      return {
        evidence_request_id: requestId,
        status: 'RESPONDED',
        aggregate_revision: Number(row.aggregate_revision) + 1,
      };
    });
  }

  async openInvestigation(
    actor: IntegrityActor,
    caseId: string,
    expectedRevision: number,
    restrictedNotes?: string,
  ) {
    const access = await this.accessibleCase(
      actor,
      caseId,
      'INVOICE_INTEGRITY_INVESTIGATE',
    );
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertRevision(row, expectedRevision);
      const reconsideration = row.workflow_state === 'CLOSED';
      if (actor.user_id === row.invoice_submitter_id)
        throw new ForbiddenException({
          message: 'Invoice submitter cannot investigate',
          code: 'SOD_INVESTIGATOR_VIOLATION',
        });
      const existing = await manager.query(
        `SELECT * FROM inv_investigations WHERE integrity_case_id=$1 AND status NOT IN ('CLOSED','CANCELLED')`,
        [caseId],
      );
      if (existing[0]) return existing[0];
      const id = randomUUID();
      await manager.query(
        `INSERT INTO inv_investigations
           (investigation_id,integrity_case_id,tenant_id,investigator_id,restricted_notes)
         VALUES ($1,$2,$3,$4,$5)`,
        [
          id,
          caseId,
          row.tenant_id,
          actor.user_id,
          restrictedNotes?.trim() ?? null,
        ],
      );
      await manager.query(
        `UPDATE inv_integrity_cases SET workflow_state='MANUAL_REVIEW',aggregate_revision=aggregate_revision+1,
         updated_at=NOW() WHERE integrity_case_id=$1`,
        [caseId],
      );
      await this.audit(
        manager,
        row,
        'INVESTIGATION',
        id,
        'INVESTIGATION_OPENED',
        actor.user_id,
        null,
        null,
      );
      const event = reconsideration
        ? await this.emit(
            manager,
            row,
            'InvoiceIntegrityReconsiderationOpened.v1',
            {
              invoice_revision: Number(row.invoice_revision),
              document_hash: row.document_hash,
              investigation_id: id,
            },
          )
        : null;
      return {
        investigation_id: id,
        status: 'OPEN',
        reconsideration,
        event,
        aggregate_revision: event
          ? Number(row.aggregate_revision)
          : Number(row.aggregate_revision) + 1,
      };
    });
  }

  async recommend(
    actor: IntegrityActor,
    caseId: string,
    investigationId: string,
    expectedRevision: number,
    input: {
      recommendation: 'CLEAR' | 'REJECT' | 'REQUEST_MORE_EVIDENCE';
      reason: string;
    },
  ) {
    const access = await this.accessibleCase(
      actor,
      caseId,
      'INVOICE_INTEGRITY_INVESTIGATE',
    );
    if (!input.reason?.trim())
      throw new BadRequestException('Recommendation reason is required');
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertRevision(row, expectedRevision);
      const investigations = await manager.query(
        `SELECT * FROM inv_investigations
         WHERE investigation_id=$1 AND integrity_case_id=$2 FOR UPDATE`,
        [investigationId, caseId],
      );
      const investigation = investigations[0];
      if (!investigation || investigation.investigator_id !== actor.user_id)
        throw new NotFoundException('Investigation not found');
      if (investigation.status === 'CLOSED')
        throw new ConflictException('Investigation is closed');
      const status =
        input.recommendation === 'REQUEST_MORE_EVIDENCE'
          ? 'EVIDENCE_PENDING'
          : 'RECOMMENDED';
      await manager.query(
        `UPDATE inv_investigations SET status=$2,recommendation=$3,recommendation_reason=$4,
         recommended_at=NOW(),updated_at=NOW() WHERE investigation_id=$1`,
        [investigationId, status, input.recommendation, input.reason.trim()],
      );
      await manager.query(
        `UPDATE inv_integrity_cases SET workflow_state=$2,aggregate_revision=aggregate_revision+1,
         updated_at=NOW() WHERE integrity_case_id=$1`,
        [
          caseId,
          status === 'RECOMMENDED' ? 'DECISION_PENDING' : 'AWAITING_EVIDENCE',
        ],
      );
      await this.audit(
        manager,
        row,
        'INVESTIGATION',
        investigationId,
        'INVESTIGATION_RECOMMENDED',
        actor.user_id,
        null,
        input,
      );
      return {
        investigation_id: investigationId,
        status,
        aggregate_revision: Number(row.aggregate_revision) + 1,
      };
    });
  }

  async certifyHuman(
    actor: IntegrityActor,
    caseId: string,
    expectedRevision: number,
    input: HumanDecisionInput,
    idempotencyKey: string,
  ) {
    await this.assertStepUp(actor, caseId, 'CERTIFICATION');
    const access = await this.accessibleCase(
      actor,
      caseId,
      'INVOICE_INTEGRITY_CERTIFY',
    );
    if (!input.decision_reason?.trim())
      throw new BadRequestException('Decision reason is required');
    return this.db.transaction(async (manager) => {
      const row = await this.lockedCase(manager, caseId, access.tenant_id);
      this.assertRevision(row, expectedRevision);
      return this.withIdempotency(
        manager,
        row,
        actor,
        idempotencyKey,
        input,
        async () => {
          if (row.workflow_state !== 'DECISION_PENDING')
            throw new ConflictException(
              `Integrity case is ${row.workflow_state}`,
            );
          const investigations = await manager.query(
            `SELECT * FROM inv_investigations
           WHERE investigation_id=$1 AND integrity_case_id=$2 AND status='RECOMMENDED' FOR UPDATE`,
            [input.investigation_id, caseId],
          );
          const investigation = investigations[0];
          if (!investigation)
            throw new ConflictException(
              'A completed investigation recommendation is required',
            );
          if (
            actor.user_id === row.invoice_submitter_id ||
            actor.user_id === investigation.investigator_id
          )
            throw new ForbiddenException({
              message:
                'Certifier must be independent of submission and investigation',
              code: 'SOD_CERTIFIER_VIOLATION',
            });
          const invoiceRows = await manager.query(
            `SELECT * FROM proc_invoices WHERE invoice_id=$1 FOR UPDATE`,
            [row.invoice_id],
          );
          const invoice = invoiceRows[0];
          if (
            !invoice ||
            Number(invoice.revision) !== Number(row.invoice_revision) ||
            invoice.document_hash !== row.document_hash
          )
            throw new ConflictException({
              message: 'Invoice evidence changed',
              code: 'INTEGRITY_CASE_STALE',
            });
          const risks = await manager.query(
            `SELECT * FROM inv_risk_assessments WHERE integrity_case_id=$1 ORDER BY created_at DESC LIMIT 1`,
            [caseId],
          );
          const risk = risks[0];
          if (!risk) throw new ConflictException('Risk assessment is required');
          if (
            input.decision === 'CLEARED_HUMAN' &&
            investigation.recommendation !== 'CLEAR'
          )
            throw new ConflictException(
              'Investigator did not recommend clearance',
            );
          if (
            input.decision === 'REJECTED_UNRESOLVED' &&
            investigation.recommendation !== 'REJECT'
          )
            throw new ConflictException(
              'Investigator did not recommend rejection',
            );
          const evidenceHash = await this.buildEvidenceSetHash(
            manager,
            row,
            risk.risk_assessment_id,
          );
          const previous = await manager.query(
            `SELECT integrity_decision_id,decision_hash FROM inv_certifications
           WHERE integrity_case_id=$1 ORDER BY certified_at DESC LIMIT 1`,
            [caseId],
          );
          const decisionId = randomUUID();
          const trustLevel =
            input.decision === 'CLEARED_HUMAN'
              ? 'HUMAN_VERIFIED'
              : 'UNVERIFIED';
          const decisionPayload = {
            integrity_case_id: caseId,
            invoice_id: row.invoice_id,
            invoice_revision: Number(row.invoice_revision),
            document_hash: row.document_hash,
            evidence_set_hash: evidenceHash,
            risk_assessment_id: risk.risk_assessment_id,
            policy_version: risk.policy_version,
            investigation_id: input.investigation_id,
            investigator_id: investigation.investigator_id,
            certifier_id: actor.user_id,
            decision: input.decision,
            trust_level: trustLevel,
            decision_reason: input.decision_reason.trim(),
            previous_decision_hash: previous[0]?.decision_hash ?? null,
          };
          const decisionHash = integrityHash(decisionPayload);
          await manager.query(
            `INSERT INTO inv_certifications
             (integrity_decision_id,integrity_case_id,tenant_id,invoice_id,invoice_revision,
              document_hash,evidence_set_hash,risk_assessment_id,integrity_policy_id,policy_version,
              investigation_id,investigator_id,certifier_id,decision,trust_level,decision_reason,
              supersedes_decision_id,previous_decision_hash,decision_hash)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
            [
              decisionId,
              caseId,
              row.tenant_id,
              row.invoice_id,
              Number(row.invoice_revision),
              row.document_hash,
              evidenceHash,
              risk.risk_assessment_id,
              risk.integrity_policy_id,
              risk.policy_version,
              input.investigation_id,
              investigation.investigator_id,
              actor.user_id,
              input.decision,
              trustLevel,
              input.decision_reason.trim(),
              previous[0]?.integrity_decision_id ?? null,
              previous[0]?.decision_hash ?? null,
              decisionHash,
            ],
          );
          if (input.decision === 'CLEARED_HUMAN') {
            await manager.query(
              `INSERT INTO inv_integrity_blocker_resolutions
                 (blocker_id,integrity_case_id,tenant_id,integrity_decision_id,resolved_by,resolution_reason)
               SELECT blocker_id,integrity_case_id,tenant_id,$2,$3,$4
               FROM inv_integrity_blockers WHERE integrity_case_id=$1
               ON CONFLICT (blocker_id,integrity_decision_id) DO NOTHING`,
              [caseId, decisionId, actor.user_id, input.decision_reason.trim()],
            );
          }
          await manager.query(
            `UPDATE inv_investigations SET status='CLOSED',updated_at=NOW() WHERE investigation_id=$1`,
            [input.investigation_id],
          );
          await manager.query(
            `UPDATE inv_integrity_cases SET workflow_state='CLOSED',final_decision=$2,trust_level=$3,
           closed_at=NOW(),updated_at=NOW() WHERE integrity_case_id=$1`,
            [caseId, input.decision, trustLevel],
          );
          await this.audit(
            manager,
            row,
            'CERTIFICATION',
            decisionId,
            'INTEGRITY_CERTIFIED',
            actor.user_id,
            null,
            decisionPayload,
          );
          const eventType =
            input.decision === 'CLEARED_HUMAN'
              ? 'InvoiceIntegrityCleared.v1'
              : 'InvoiceIntegrityRejected.v1';
          const event = await this.emit(manager, row, eventType, {
            integrity_decision_id: decisionId,
            decision: input.decision,
            trust_level: trustLevel,
            document_hash: row.document_hash,
            evidence_set_hash: evidenceHash,
            risk_assessment_id: risk.risk_assessment_id,
            decision_hash: decisionHash,
            ai_status: 'NOT_USED',
            policy_version: risk.policy_version,
            investigator_id: investigation.investigator_id,
            certifier_id: actor.user_id,
          });
          return {
            integrity_decision_id: decisionId,
            final_decision: input.decision,
            trust_level: trustLevel,
            evidence_set_hash: evidenceHash,
            decision_hash: decisionHash,
            event,
            aggregate_revision: Number(row.aggregate_revision),
          };
        },
      );
    });
  }

  async listPolicies(actor: IntegrityActor, caseId: string) {
    const row = await this.accessibleCase(
      actor,
      caseId,
      'INVOICE_INTEGRITY_POLICY_ADMIN',
    );
    return this.db.query(
      `SELECT integrity_policy_id,policy_version,category,invoice_type,status,
              factor_weights,low_risk_max,medium_risk_max,automated_min_coverage,
              automated_min_confidence,rounding_tolerance_amount,
              rounding_tolerance_percent,required_evidence,effective_from,effective_to,published_at
       FROM inv_integrity_policies WHERE tenant_id=$1 ORDER BY policy_version DESC`,
      [row.tenant_id],
    );
  }

  async listSourceAccounts(actor: IntegrityActor) {
    const grants = await this.grants(actor, 'INVOICE_SOURCE_RETRIEVE');
    if (!grants.length)
      throw new ForbiddenException('Source retrieval capability is required');
    return this.db.query(
      `SELECT source_account_id,department_id,platform,account_label,external_account_reference,
              allowed_domains,allowed_methods,status,created_at,updated_at
       FROM inv_source_accounts WHERE tenant_id=$1 ORDER BY platform,account_label`,
      [this.tenant(actor)],
    );
  }
}
