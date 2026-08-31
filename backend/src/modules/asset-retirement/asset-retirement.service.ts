/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call -- TypeORM raw-query rows are validated at domain boundaries */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { DofaEngineService } from '../dofa-engine/dofa-engine.service';
import type {
  AssetRetirementActor,
  CompleteSanitizationInput,
  CreateRetirementCaseInput,
  FinancialSnapshotInput,
  FinanceProjectionInput,
  RetirementAssessmentInput,
  SanitizationInput,
} from './asset-retirement.types';
import { retirementHash, signRetirementPayload } from './asset-retirement.util';

@Injectable()
export class AssetRetirementService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly dofa: DofaEngineService,
    private readonly config: ConfigService,
  ) {}

  private tenant(actor: AssetRetirementActor) {
    if (!actor.tenant_id)
      throw new ForbiddenException('Tenant context required');
    return actor.tenant_id;
  }
  private roles(actor: AssetRetirementActor) {
    return [
      ...new Set([...(actor.roles ?? []), ...(actor.role ? [actor.role] : [])]),
    ].map((role) => role.toLowerCase());
  }
  private async grants(actor: AssetRetirementActor, capability: string) {
    return this.db.query(
      `SELECT scope_type,scope_reference FROM acq_access_grants WHERE tenant_id=$1 AND capability=$2
       AND valid_from<=NOW() AND(valid_until IS NULL OR valid_until>NOW())
       AND(principal_user_id=$3 OR lower(principal_role)=ANY($4::text[]))`,
      [this.tenant(actor), capability, actor.user_id, this.roles(actor)],
    );
  }
  private async require(actor: AssetRetirementActor, capability: string) {
    if (!(await this.grants(actor, capability)).length)
      throw new ForbiddenException(`Missing ${capability}`);
  }
  private async scopedCase(
    actor: AssetRetirementActor,
    id: string,
    capability = 'ASSET_RETIREMENT_VIEW',
  ) {
    const rows = await this.db.query(
      `SELECT c.* FROM retirement_cases c WHERE c.retirement_case_id=$1 AND c.tenant_id=$2
       AND EXISTS(SELECT 1 FROM acq_access_grants g WHERE g.tenant_id=c.tenant_id AND g.capability=$3
       AND g.valid_from<=NOW() AND(g.valid_until IS NULL OR g.valid_until>NOW())
       AND(g.principal_user_id=$4 OR lower(g.principal_role)=ANY($5::text[]))
       AND(g.scope_type='TENANT' OR(g.scope_type='DEPARTMENT' AND g.scope_reference=c.owner_department_id::text)))`,
      [id, this.tenant(actor), capability, actor.user_id, this.roles(actor)],
    );
    if (!rows[0]) throw new NotFoundException('Retirement case not found');
    return rows[0];
  }
  private async locked(m: EntityManager, id: string, tenantId: string) {
    const rows = await m.query(
      `SELECT * FROM retirement_cases WHERE retirement_case_id=$1 AND tenant_id=$2 FOR UPDATE`,
      [id, tenantId],
    );
    if (!rows[0]) throw new NotFoundException('Retirement case not found');
    return rows[0];
  }
  private assertRevision(row: any, expected: number) {
    if (Number(row.aggregate_revision) !== expected)
      throw new ConflictException({
        message: 'Retirement case changed',
        code: 'STALE_REVISION',
        current_revision: Number(row.aggregate_revision),
      });
    if (row.workflow_status === 'CLOSED')
      throw new ConflictException(
        'Closed cases are immutable; create a superseding case',
      );
  }
  private async context(m: EntityManager, caseId: string, action: string) {
    await m.query(
      `SELECT set_config('falcon.module9_case_id',$1,true),set_config('falcon.module9_action',$2,true)`,
      [caseId, action],
    );
  }
  private async idempotent<T>(
    m: EntityManager,
    actor: AssetRetirementActor,
    key: string,
    input: unknown,
    work: () => Promise<T>,
  ): Promise<T> {
    if (!key?.trim()) throw new BadRequestException('Idempotency-Key required');
    const tenantId = this.tenant(actor),
      requestHash = retirementHash(input);
    await m.query(`SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))`, [
      tenantId,
      `${actor.user_id}:${key}`,
    ]);
    const prior = await m.query(
      `SELECT request_hash,response_payload FROM retirement_idempotency WHERE tenant_id=$1 AND actor_id=$2 AND idempotency_key=$3 FOR UPDATE`,
      [tenantId, actor.user_id, key],
    );
    if (prior[0]) {
      if (prior[0].request_hash !== requestHash)
        throw new ConflictException(
          'Idempotency key reused with changed payload',
        );
      if (prior[0].response_payload) return prior[0].response_payload as T;
    } else
      await m.query(
        `INSERT INTO retirement_idempotency(tenant_id,actor_id,idempotency_key,request_hash) VALUES($1,$2,$3,$4)`,
        [tenantId, actor.user_id, key, requestHash],
      );
    const result = await work();
    await m.query(
      `UPDATE retirement_idempotency SET response_payload=$4::jsonb WHERE tenant_id=$1 AND actor_id=$2 AND idempotency_key=$3`,
      [tenantId, actor.user_id, key, JSON.stringify(result)],
    );
    return result;
  }
  private async audit(
    m: EntityManager,
    row: any,
    entityType: string,
    entityId: string,
    eventType: string,
    actorId: string | null,
    previous: unknown,
    next: unknown,
  ) {
    const last = await m.query(
      `SELECT event_hash FROM retirement_audit_events WHERE retirement_case_id=$1 ORDER BY created_at DESC,audit_event_id DESC LIMIT 1`,
      [row.retirement_case_id],
    );
    const previousHash = last[0]?.event_hash ?? null,
      eventHash = retirementHash({
        retirement_case_id: row.retirement_case_id,
        entityType,
        entityId,
        eventType,
        actorId,
        previous,
        next,
        previousHash,
      });
    await m.query(
      `INSERT INTO retirement_audit_events(tenant_id,retirement_case_id,entity_type,entity_id,event_type,actor_id,previous_value,new_value,previous_hash,event_hash)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10)`,
      [
        row.tenant_id,
        row.retirement_case_id,
        entityType,
        entityId,
        eventType,
        actorId,
        JSON.stringify(previous),
        JSON.stringify(next),
        previousHash,
        eventHash,
      ],
    );
  }
  private async emit(
    m: EntityManager,
    row: any,
    eventType: string,
    payload: unknown,
  ) {
    const eventId = randomUUID(),
      occurredAt = new Date().toISOString(),
      revision = Number(row.aggregate_revision) + 1,
      sequence = Number(row.next_event_sequence),
      envelope = {
        event_id: eventId,
        event_type: eventType,
        event_version: 1,
        aggregate_id: row.retirement_case_id,
        aggregate_revision: revision,
        aggregate_sequence: sequence,
        tenant_id: row.tenant_id,
        retirement_case_id: row.retirement_case_id,
        occurred_at: occurredAt,
        payload,
      };
    await m.query(
      `INSERT INTO retirement_outbox_events(event_id,tenant_id,aggregate_id,aggregate_revision,aggregate_sequence,event_type,occurred_at,payload,payload_hash)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
      [
        eventId,
        row.tenant_id,
        row.retirement_case_id,
        revision,
        sequence,
        eventType,
        occurredAt,
        JSON.stringify(envelope),
        retirementHash(envelope),
      ],
    );
    row.aggregate_revision = revision;
    row.next_event_sequence = sequence + 1;
    await m.query(
      `UPDATE retirement_cases SET aggregate_revision=$2,next_event_sequence=$3,updated_at=NOW() WHERE retirement_case_id=$1`,
      [row.retirement_case_id, revision, sequence + 1],
    );
    return envelope;
  }

  async dashboard(actor: AssetRetirementActor) {
    await this.require(actor, 'ASSET_RETIREMENT_VIEW');
    return (
      await this.db.query(
        `SELECT COUNT(*)::int total,
          COUNT(*) FILTER(WHERE workflow_status IN('SUBMITTED','ASSESSMENT','PENDING_DOFA'))::int awaiting_approval,
          COUNT(*) FILTER(WHERE workflow_status IN('APPROVED','PREPARATION','IN_EXECUTION','COMPLETION_PENDING'))::int active,
          COUNT(*) FILTER(WHERE physical_status='PHYSICAL_COMPLETED' AND finance_status IN('FINANCE_PENDING','FINANCE_POSTING_FAILED'))::int finance_reconciliation,
          COUNT(*) FILTER(WHERE sanitization_status IN('REQUIRED','IN_PROGRESS','FAILED','PHYSICAL_DESTRUCTION_REQUIRED'))::int sanitization_queue,
          COUNT(*) FILTER(WHERE workflow_status='CLOSED')::int completed
         FROM retirement_cases WHERE tenant_id=$1`,
        [this.tenant(actor)],
      )
    )[0];
  }
  async queue(actor: AssetRetirementActor) {
    await this.require(actor, 'ASSET_RETIREMENT_VIEW');
    return this.db.query(
      `SELECT c.*,COUNT(a.retirement_allocation_id)::int asset_count,
        string_agg(DISTINCT r.university_asset_id,', ' ORDER BY r.university_asset_id) asset_ids
       FROM retirement_cases c JOIN retirement_allocations a ON a.retirement_case_id=c.retirement_case_id
       JOIN inv_records r ON r.inventory_record_id=a.inventory_record_id
       WHERE c.tenant_id=$1 AND EXISTS(SELECT 1 FROM acq_access_grants g WHERE g.tenant_id=c.tenant_id AND g.capability='ASSET_RETIREMENT_VIEW'
       AND(g.principal_user_id=$2 OR lower(g.principal_role)=ANY($3::text[])) AND(g.scope_type='TENANT' OR(g.scope_type='DEPARTMENT' AND g.scope_reference=c.owner_department_id::text)))
       GROUP BY c.retirement_case_id ORDER BY c.updated_at DESC LIMIT 250`,
      [this.tenant(actor), actor.user_id, this.roles(actor)],
    );
  }
  async eligibleAssets(actor: AssetRetirementActor) {
    await this.require(actor, 'ASSET_RETIREMENT_REQUEST');
    return this.db.query(
      `SELECT r.inventory_record_id,r.university_asset_id,r.manufacturer_serial,r.record_status,r.lifecycle_status,r.aggregate_revision,
        r.owner_department_id,pm.product_name,pm.category,pm.model_number
       FROM inv_records r JOIN inv_product_models pm ON pm.product_model_id=r.product_model_id
       WHERE r.tenant_id=$1 AND r.record_type='ITEM' AND r.record_status IN('ACTIVE','QUARANTINED')
       AND r.lifecycle_status NOT IN('RETURNED','RETIRED','WRITTEN_OFF','DISPOSED')
       AND NOT EXISTS(SELECT 1 FROM retirement_holds h WHERE h.inventory_record_id=r.inventory_record_id AND h.status='ACTIVE')
       AND EXISTS(SELECT 1 FROM acq_access_grants g WHERE g.tenant_id=r.tenant_id AND g.capability='ASSET_RETIREMENT_REQUEST'
       AND(g.principal_user_id=$2 OR lower(g.principal_role)=ANY($3::text[])) AND(g.scope_type='TENANT' OR(g.scope_type='DEPARTMENT' AND g.scope_reference=r.owner_department_id::text)))
       ORDER BY r.updated_at DESC LIMIT 250`,
      [this.tenant(actor), actor.user_id, this.roles(actor)],
    );
  }
  async providers(actor: AssetRetirementActor) {
    await this.require(actor, 'ASSET_RETIREMENT_VIEW');
    return this.db.query(
      `SELECT * FROM retirement_providers WHERE tenant_id=$1 ORDER BY display_name`,
      [this.tenant(actor)],
    );
  }
  async createProvider(
    actor: AssetRetirementActor,
    key: string,
    input: {
      provider_type:
        | 'E_WASTE'
        | 'RECYCLER'
        | 'SCRAP'
        | 'DESTRUCTION'
        | 'TRANSPORT'
        | 'TAKEBACK';
      display_name: string;
      vendor_id?: string;
      approved_categories?: string[];
      license_manifest: Record<string, unknown>;
      environmental_authorizations?: unknown[];
      valid_from: string;
      valid_to: string;
    },
  ) {
    await this.require(actor, 'ASSET_RETIREMENT_PROVIDER_ADMIN');
    if (!input.display_name?.trim())
      throw new BadRequestException('Provider name required');
    if (new Date(input.valid_to) <= new Date(input.valid_from))
      throw new BadRequestException('Provider validity period is invalid');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const providerId = randomUUID();
        await m.query(
          `INSERT INTO retirement_providers(retirement_provider_id,tenant_id,provider_type,display_name,vendor_id,approved_categories,license_manifest,environmental_authorizations,valid_from,valid_to,created_by)
           VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,$11)`,
          [
            providerId,
            this.tenant(actor),
            input.provider_type,
            input.display_name.trim(),
            input.vendor_id ?? null,
            JSON.stringify(input.approved_categories ?? []),
            JSON.stringify(input.license_manifest),
            JSON.stringify(input.environmental_authorizations ?? []),
            input.valid_from,
            input.valid_to,
            actor.user_id,
          ],
        );
        return { retirement_provider_id: providerId, status: 'ACTIVE' };
      }),
    );
  }
  async createParty(
    actor: AssetRetirementActor,
    key: string,
    input: {
      party_type: 'BIDDER' | 'BUYER' | 'INSTITUTION' | 'DONATION_RECIPIENT';
      display_name: string;
      registration_reference?: string;
      contact_reference?: Record<string, unknown>;
      compliance_evidence?: Record<string, unknown>;
    },
  ) {
    await this.require(actor, 'ASSET_DISPOSAL_BID_MANAGE');
    if (!input.display_name?.trim())
      throw new BadRequestException('Party name required');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const partyId = randomUUID();
        await m.query(
          `INSERT INTO retirement_parties(retirement_party_id,tenant_id,party_type,display_name,registration_reference,contact_reference,compliance_evidence,created_by)
           VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)`,
          [
            partyId,
            this.tenant(actor),
            input.party_type,
            input.display_name.trim(),
            input.registration_reference ?? null,
            JSON.stringify(input.contact_reference ?? {}),
            JSON.stringify(input.compliance_evidence ?? {}),
            actor.user_id,
          ],
        );
        return { retirement_party_id: partyId, status: 'ACTIVE' };
      }),
    );
  }
  async publishPolicy(
    actor: AssetRetirementActor,
    key: string,
    input: {
      category?: string;
      product_model_id?: string;
      disposition_method?: string;
      assessment_requirements?: unknown[];
      appraisal_required?: boolean;
      data_bearing?: boolean;
      sanitization_method?: string;
      environmental_requirements?: unknown[];
      provider_license_requirements?: unknown[];
      witness_count?: number;
      reserve_tolerance_pct?: number;
      finance_receipt_before_handover?: boolean;
      certificate_retention_years?: number;
    },
  ) {
    await this.require(actor, 'ASSET_RETIREMENT_POLICY_ADMIN');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const category = input.category ?? '*',
          lock = `retirement-policy:${this.tenant(actor)}:${category}:${input.product_model_id ?? '*'}:${input.disposition_method ?? '*'}`;
        await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [lock]);
        const prior = (
            await m.query(
              `SELECT COALESCE(MAX(policy_version),0)::int version FROM retirement_policies WHERE tenant_id=$1 AND category=$2 AND product_model_id IS NOT DISTINCT FROM $3::uuid AND disposition_method IS NOT DISTINCT FROM $4`,
              [
                this.tenant(actor),
                category,
                input.product_model_id ?? null,
                input.disposition_method ?? null,
              ],
            )
          )[0],
          version = Number(prior.version) + 1,
          policyId = randomUUID();
        await m.query(
          `UPDATE retirement_policies SET status='SUPERSEDED',effective_to=NOW() WHERE tenant_id=$1 AND category=$2 AND product_model_id IS NOT DISTINCT FROM $3::uuid AND disposition_method IS NOT DISTINCT FROM $4 AND status='PUBLISHED'`,
          [
            this.tenant(actor),
            category,
            input.product_model_id ?? null,
            input.disposition_method ?? null,
          ],
        );
        await m.query(
          `INSERT INTO retirement_policies(retirement_policy_id,tenant_id,category,product_model_id,disposition_method,policy_version,status,assessment_requirements,appraisal_required,data_bearing,sanitization_method,environmental_requirements,provider_license_requirements,witness_count,reserve_tolerance_pct,finance_receipt_before_handover,certificate_retention_years,published_by,published_at)
           VALUES($1,$2,$3,$4,$5,$6,'PUBLISHED',$7::jsonb,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14,$15,$16,$17,NOW())`,
          [
            policyId,
            this.tenant(actor),
            category,
            input.product_model_id ?? null,
            input.disposition_method ?? null,
            version,
            JSON.stringify(input.assessment_requirements ?? []),
            input.appraisal_required ?? true,
            input.data_bearing ?? false,
            input.sanitization_method ?? null,
            JSON.stringify(input.environmental_requirements ?? []),
            JSON.stringify(input.provider_license_requirements ?? []),
            input.witness_count ?? 1,
            input.reserve_tolerance_pct ?? 0,
            input.finance_receipt_before_handover ?? true,
            input.certificate_retention_years ?? 10,
            actor.user_id,
          ],
        );
        return { retirement_policy_id: policyId, policy_version: version };
      }),
    );
  }
  async detail(actor: AssetRetirementActor, id: string) {
    const row = await this.scopedCase(actor, id);
    const [
      allocations,
      assessments,
      financial,
      approvals,
      sanitization,
      lots,
      offers,
      awards,
      custody,
      finance,
      certificates,
      audit,
    ] = await Promise.all([
      this.db.query(
        `SELECT a.*,r.university_asset_id,r.manufacturer_serial,r.record_status,r.lifecycle_status,pm.product_name,pm.category,pm.model_number
           FROM retirement_allocations a JOIN inv_records r ON r.inventory_record_id=a.inventory_record_id JOIN inv_product_models pm ON pm.product_model_id=r.product_model_id WHERE a.retirement_case_id=$1 ORDER BY a.created_at`,
        [id],
      ),
      this.db.query(
        `SELECT * FROM retirement_assessments WHERE retirement_case_id=$1 ORDER BY revision`,
        [id],
      ),
      this.db.query(
        `SELECT * FROM retirement_financial_snapshots WHERE retirement_case_id=$1 ORDER BY captured_at`,
        [id],
      ),
      this.db.query(
        `SELECT * FROM retirement_approval_snapshots WHERE retirement_case_id=$1 ORDER BY submitted_at`,
        [id],
      ),
      this.db.query(
        `SELECT * FROM retirement_sanitization_jobs WHERE retirement_case_id=$1 ORDER BY started_at NULLS FIRST`,
        [id],
      ),
      this.db.query(
        `SELECT * FROM retirement_disposal_lots WHERE retirement_case_id=$1 ORDER BY created_at`,
        [id],
      ),
      this.db.query(
        `SELECT o.* FROM retirement_offers o JOIN retirement_disposal_lots l ON l.disposal_lot_id=o.disposal_lot_id WHERE l.retirement_case_id=$1 ORDER BY o.submitted_at`,
        [id],
      ),
      this.db.query(
        `SELECT a.* FROM retirement_awards a JOIN retirement_disposal_lots l ON l.disposal_lot_id=a.disposal_lot_id WHERE l.retirement_case_id=$1`,
        [id],
      ),
      this.db.query(
        `SELECT * FROM retirement_custody_events WHERE retirement_case_id=$1 ORDER BY occurred_at`,
        [id],
      ),
      this.db.query(
        `SELECT * FROM retirement_finance_projections WHERE retirement_case_id=$1 ORDER BY occurred_at`,
        [id],
      ),
      this.db.query(
        `SELECT * FROM retirement_certificates WHERE retirement_case_id=$1 ORDER BY certificate_revision`,
        [id],
      ),
      this.db.query(
        `SELECT * FROM retirement_audit_events WHERE retirement_case_id=$1 ORDER BY created_at`,
        [id],
      ),
    ]);
    return {
      ...row,
      allocations,
      assessments,
      financial_snapshots: financial,
      approval_snapshots: approvals,
      sanitization,
      disposal_lots: lots,
      offers,
      awards,
      custody,
      finance_projections: finance,
      certificates,
      audit,
    };
  }

  async create(
    actor: AssetRetirementActor,
    key: string,
    input: CreateRetirementCaseInput,
  ) {
    await this.require(actor, 'ASSET_RETIREMENT_REQUEST');
    if (!input.title?.trim() || !input.retirement_reason?.trim())
      throw new BadRequestException('Title and retirement reason are required');
    const ids = [...new Set(input.inventory_record_ids ?? [])].sort();
    if (!ids.length)
      throw new BadRequestException('At least one ITEM is required');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const assets = await m.query(
          `SELECT r.*,COALESCE((SELECT MAX(identity_revision) FROM inv_identity_revisions i WHERE i.inventory_record_id=r.inventory_record_id),0)::int identity_revision
           FROM inv_records r WHERE r.inventory_record_id=ANY($1::uuid[]) AND r.tenant_id=$2 AND r.record_type='ITEM' ORDER BY r.inventory_record_id FOR UPDATE`,
          [ids, this.tenant(actor)],
        );
        if (assets.length !== ids.length)
          throw new NotFoundException(
            'One or more inventory ITEMs were not found',
          );
        const departments = new Set(
          assets.map((asset) => asset.owner_department_id),
        );
        if (departments.size > 1)
          throw new ConflictException(
            'A retirement case must remain within one owner department',
          );
        for (const asset of assets) {
          if (
            !['ACTIVE', 'QUARANTINED'].includes(asset.record_status) ||
            ['RETURNED', 'RETIRED', 'WRITTEN_OFF', 'DISPOSED'].includes(
              asset.lifecycle_status,
            )
          )
            throw new ConflictException('Asset is not retirement eligible');
          if (
            (
              await m.query(
                `SELECT 1 FROM retirement_holds WHERE inventory_record_id=$1 AND status='ACTIVE'`,
                [asset.inventory_record_id],
              )
            )[0]
          )
            throw new ConflictException(
              'Asset already has an active retirement case',
            );
        }
        if (input.source_service_case_id) {
          const referral = (
            await m.query(
              `SELECT 1 FROM svc_cases WHERE service_case_id=$1 AND tenant_id=$2 AND workflow_status='CLOSED' AND final_outcome IN('IRREPARABLE','UNSAFE')`,
              [input.source_service_case_id, this.tenant(actor)],
            )
          )[0];
          if (!referral)
            throw new ConflictException('Module 8 referral is not terminal');
        }
        const id = randomUUID(),
          number = `RET-${new Date().getUTCFullYear()}-${id.slice(0, 8).toUpperCase()}`;
        await m.query(
          `INSERT INTO retirement_cases(retirement_case_id,tenant_id,case_number,title,retirement_reason,requested_by,owner_department_id,source_service_case_id,root_retirement_case_id)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$1)`,
          [
            id,
            this.tenant(actor),
            number,
            input.title.trim(),
            input.retirement_reason.trim(),
            actor.user_id,
            assets[0].owner_department_id,
            input.source_service_case_id ?? null,
          ],
        );
        for (const asset of assets) {
          const parentId =
            input.component_parent_by_inventory_id?.[asset.inventory_record_id];
          if (parentId && !ids.includes(parentId))
            throw new BadRequestException(
              'Tracked component parent must be allocated in the same case',
            );
          await m.query(
            `INSERT INTO retirement_allocations(retirement_allocation_id,tenant_id,retirement_case_id,inventory_record_id,parent_inventory_record_id,allocation_type,inventory_revision,identity_revision)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              randomUUID(),
              this.tenant(actor),
              id,
              asset.inventory_record_id,
              parentId ?? null,
              parentId ? 'COMPONENT' : 'ASSET',
              asset.aggregate_revision,
              asset.identity_revision || null,
            ],
          );
        }
        const row = await this.locked(m, id, this.tenant(actor));
        await this.audit(
          m,
          row,
          'RETIREMENT_CASE',
          id,
          'RETIREMENT_CASE_CREATED',
          actor.user_id,
          null,
          input,
        );
        return {
          retirement_case_id: id,
          case_number: number,
          aggregate_revision: 1,
        };
      }),
    );
  }

  async submit(
    actor: AssetRetirementActor,
    id: string,
    expected: number,
    key: string,
  ) {
    await this.scopedCase(actor, id, 'ASSET_RETIREMENT_REQUEST');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, { id, expected }, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.assertRevision(row, expected);
        if (row.workflow_status !== 'DRAFT')
          throw new ConflictException('Only a draft case can be submitted');
        const allocations = await m.query(
          `SELECT a.*,r.record_status,r.lifecycle_status FROM retirement_allocations a JOIN inv_records r ON r.inventory_record_id=a.inventory_record_id WHERE a.retirement_case_id=$1 ORDER BY a.inventory_record_id FOR UPDATE OF a,r`,
          [id],
        );
        for (const allocation of allocations) {
          const returns = await m.query(
            `SELECT 1 FROM ret_case_allocations WHERE inventory_record_id=$1 AND status='HELD'`,
            [allocation.inventory_record_id],
          );
          if (returns[0])
            throw new ConflictException(
              'Active Module 7 return blocks retirement',
            );
          const services = await m.query(
            `SELECT service_case_id FROM svc_asset_holds WHERE inventory_record_id=$1 AND status='ACTIVE'`,
            [allocation.inventory_record_id],
          );
          if (
            services[0] &&
            services[0].service_case_id !== row.source_service_case_id
          )
            throw new ConflictException(
              'Active Module 8 service blocks retirement',
            );
          if (
            (
              await m.query(
                `SELECT 1 FROM inv_discrepancies WHERE inventory_record_id=$1 AND status IN('OPEN','INVESTIGATING','RESOLUTION_PENDING')`,
                [allocation.inventory_record_id],
              )
            )[0]
          )
            throw new ConflictException(
              'Unresolved inventory discrepancy blocks retirement',
            );
          await m.query(
            `INSERT INTO retirement_holds(retirement_hold_id,tenant_id,retirement_case_id,inventory_record_id,previous_record_status,previous_lifecycle_status,hold_reason,placed_by)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              randomUUID(),
              row.tenant_id,
              id,
              allocation.inventory_record_id,
              allocation.record_status,
              allocation.lifecycle_status,
              row.retirement_reason,
              actor.user_id,
            ],
          );
          await this.context(m, id, 'PLACE_RETIREMENT_HOLD');
          if (services[0])
            await m.query(
              `UPDATE svc_asset_holds SET status='SUPERSEDED',released_by=$2,released_at=NOW(),release_reason='Transferred to Module 9 retirement custody' WHERE service_case_id=$1 AND status='ACTIVE'`,
              [services[0].service_case_id, actor.user_id],
            );
        }
        await m.query(
          `UPDATE retirement_allocations SET status='HELD' WHERE retirement_case_id=$1`,
          [id],
        );
        await m.query(
          `INSERT INTO asset_writeoff_requests(tenant_id,asset_id,requested_by,reason,status,module9_retirement_case_id,module9_managed)
           SELECT r.tenant_id,u.asset_id,$2,$3,'PENDING_DOFA',$1,true FROM retirement_allocations a
           JOIN inv_records r ON r.inventory_record_id=a.inventory_record_id
           JOIN university_assets u ON u.module5_source_id=r.inventory_record_id
           WHERE a.retirement_case_id=$1 ON CONFLICT DO NOTHING`,
          [id, actor.user_id, row.retirement_reason],
        );
        await m.query(
          `UPDATE retirement_cases SET workflow_status='ASSESSMENT' WHERE retirement_case_id=$1`,
          [id],
        );
        await this.audit(
          m,
          row,
          'RETIREMENT_CASE',
          id,
          'RETIREMENT_CASE_SUBMITTED',
          actor.user_id,
          { workflow_status: 'DRAFT' },
          { workflow_status: 'ASSESSMENT' },
        );
        await this.emit(m, row, 'AssetRetirementCaseSubmitted.v1', {
          inventory_record_ids: allocations.map((a) => a.inventory_record_id),
        });
        await this.emit(m, row, 'AssetRetirementHoldPlaced.v1', {
          inventory_record_ids: allocations.map((a) => a.inventory_record_id),
        });
        return {
          workflow_status: 'ASSESSMENT',
          aggregate_revision: row.aggregate_revision,
        };
      }),
    );
  }

  async assess(
    actor: AssetRetirementActor,
    id: string,
    expected: number,
    key: string,
    input: RetirementAssessmentInput,
  ) {
    await this.scopedCase(actor, id, 'ASSET_RETIREMENT_ASSESS');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.assertRevision(row, expected);
        if (!['ASSESSMENT', 'ON_HOLD'].includes(row.workflow_status))
          throw new ConflictException('Case is not awaiting assessment');
        if (row.requested_by === actor.user_id)
          throw new ForbiddenException('Requester cannot assess the same case');
        const prior = (
            await m.query(
              `SELECT COALESCE(MAX(revision),0)::int revision FROM retirement_assessments WHERE retirement_case_id=$1`,
              [id],
            )
          )[0],
          revision = Number(prior.revision) + 1,
          assessmentId = randomUUID(),
          snapshotHash = retirementHash({ id, revision, input });
        await m.query(
          `INSERT INTO retirement_assessments(retirement_assessment_id,tenant_id,retirement_case_id,revision,technical_condition,service_history,age_and_useful_life,redeployment_assessment,component_recovery,legal_holds,environmental_classification,data_classification,recommended_disposition,estimated_disposal_cost,expected_proceeds,reserve_price,currency,assessed_by,snapshot_hash)
           VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14,$15,$16,$17,$18,$19)`,
          [
            assessmentId,
            row.tenant_id,
            id,
            revision,
            JSON.stringify(input.technical_condition),
            JSON.stringify(input.service_history ?? {}),
            JSON.stringify(input.age_and_useful_life),
            JSON.stringify(input.redeployment_assessment),
            JSON.stringify(input.component_recovery ?? []),
            JSON.stringify(input.legal_holds ?? []),
            JSON.stringify(input.environmental_classification),
            JSON.stringify(input.data_classification),
            input.recommended_disposition,
            Number(input.estimated_disposal_cost ?? 0),
            Number(input.expected_proceeds ?? 0),
            input.reserve_price ?? null,
            input.currency,
            actor.user_id,
            snapshotHash,
          ],
        );
        const dataBearing = input.data_classification.data_bearing === true,
          sanitization = dataBearing ? 'REQUIRED' : 'NOT_REQUIRED';
        await m.query(
          `UPDATE retirement_cases SET disposition_method=$2,sanitization_status=$3,currency=$4,workflow_status='ASSESSMENT' WHERE retirement_case_id=$1`,
          [id, input.recommended_disposition, sanitization, input.currency],
        );
        await this.audit(
          m,
          row,
          'ASSESSMENT',
          assessmentId,
          'RETIREMENT_ASSESSMENT_COMPLETED',
          actor.user_id,
          null,
          { revision, snapshot_hash: snapshotHash },
        );
        await this.emit(m, row, 'AssetRetirementAssessmentCompleted.v1', {
          revision,
          snapshot_hash: snapshotHash,
          disposition_method: input.recommended_disposition,
        });
        if (dataBearing)
          await this.emit(m, row, 'AssetSanitizationRequired.v1', {
            data_classification: input.data_classification,
          });
        return {
          retirement_assessment_id: assessmentId,
          revision,
          sanitization_status: sanitization,
          aggregate_revision: row.aggregate_revision,
        };
      }),
    );
  }

  async captureFinancialSnapshot(
    actor: AssetRetirementActor,
    id: string,
    expected: number,
    key: string,
    input: FinancialSnapshotInput,
  ) {
    await this.scopedCase(actor, id, 'ASSET_RETIREMENT_VALUATION_VIEW');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.assertRevision(row, expected);
        if (Number(input.net_book_value) < 0)
          throw new BadRequestException('Net book value cannot be negative');
        const snapshotId = randomUUID(),
          snapshotHash = retirementHash({ id, input });
        await m.query(
          `INSERT INTO retirement_financial_snapshots(financial_snapshot_id,tenant_id,retirement_case_id,capitalized_cost,accumulated_depreciation,impairment,net_book_value,salvage_value,currency,fiscal_period,funding_restrictions,source_reference,source_revision,snapshot_hash,captured_by)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14,$15)`,
          [
            snapshotId,
            row.tenant_id,
            id,
            input.capitalized_cost,
            input.accumulated_depreciation ?? 0,
            input.impairment ?? 0,
            input.net_book_value,
            input.salvage_value ?? 0,
            input.currency,
            input.fiscal_period ?? null,
            JSON.stringify(input.funding_restrictions ?? {}),
            JSON.stringify(input.source_reference),
            input.source_revision,
            snapshotHash,
            actor.user_id,
          ],
        );
        await m.query(
          `UPDATE retirement_cases SET finance_status='READY_FOR_POSTING',currency=$2 WHERE retirement_case_id=$1`,
          [id, input.currency],
        );
        await this.audit(
          m,
          row,
          'FINANCIAL_SNAPSHOT',
          snapshotId,
          'RETIREMENT_FINANCIAL_SNAPSHOT_CAPTURED',
          actor.user_id,
          null,
          { snapshot_hash: snapshotHash },
        );
        return {
          financial_snapshot_id: snapshotId,
          snapshot_hash: snapshotHash,
        };
      }),
    );
  }

  async submitDofa(
    actor: AssetRetirementActor,
    id: string,
    expected: number,
    key: string,
  ) {
    await this.scopedCase(actor, id, 'ASSET_RETIREMENT_DOFA_SUBMIT');
    const prep = await this.db.transaction((m) =>
      this.idempotent(m, actor, key, { id, expected }, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.assertRevision(row, expected);
        if (row.workflow_status !== 'ASSESSMENT')
          throw new ConflictException('Assessment must be complete');
        const assessment = (
            await m.query(
              `SELECT * FROM retirement_assessments WHERE retirement_case_id=$1 ORDER BY revision DESC LIMIT 1`,
              [id],
            )
          )[0],
          financial = (
            await m.query(
              `SELECT * FROM retirement_financial_snapshots WHERE retirement_case_id=$1 ORDER BY captured_at DESC LIMIT 1`,
              [id],
            )
          )[0],
          allocations = await m.query(
            `SELECT a.*,r.university_asset_id,r.record_status,r.lifecycle_status FROM retirement_allocations a JOIN inv_records r ON r.inventory_record_id=a.inventory_record_id WHERE a.retirement_case_id=$1 ORDER BY a.inventory_record_id`,
            [id],
          );
        if (!assessment || !financial)
          throw new ConflictException(
            'Assessment and Finance/GL snapshot are required',
          );
        if (
          Array.isArray(assessment.legal_holds) &&
          assessment.legal_holds.length
        )
          throw new ConflictException(
            'Active legal, audit, insurance or grant hold blocks DoFA',
          );
        const amount = Math.max(
          Math.abs(Number(financial.net_book_value)),
          Number(assessment.expected_proceeds),
          Number(assessment.estimated_disposal_cost),
        );
        return { row: { ...row }, assessment, financial, allocations, amount };
      }),
    );
    let dofaCase = (
      await this.db.query(
        `SELECT case_id FROM dofa_cases WHERE tenant_id=$1 AND domain='ASSET_WRITEOFF' AND source_table='retirement_cases' AND source_id=$2 ORDER BY created_at DESC LIMIT 1`,
        [prep.row.tenant_id, id],
      )
    )[0];
    if (!dofaCase) {
      const opened = await this.dofa.openCase(prep.row.tenant_id, {
        domain: 'ASSET_WRITEOFF',
        title: `${prep.row.case_number} asset retirement`,
        requester_id: prep.row.requested_by,
        amount: prep.amount,
        source_table: 'retirement_cases',
        source_id: id,
        payload: {
          retirement_case_id: id,
          assessment_hash: prep.assessment.snapshot_hash,
          financial_snapshot_hash: prep.financial.snapshot_hash,
        },
        rule_key: 'HEAVY',
      });
      dofaCase = opened;
    }
    const fullDofa = await this.dofa.getCase(
      prep.row.tenant_id,
      dofaCase.case_id,
    );
    return this.db.transaction(async (m) => {
      const row = await this.locked(m, id, prep.row.tenant_id);
      if (row.dofa_case_id && row.dofa_case_id !== dofaCase.case_id)
        throw new ConflictException('A different DoFA case is already pinned');
      const route = (fullDofa.steps as Array<Record<string, unknown>>).map(
        (step) => ({
          level: Number(step.step_no) + 1,
          required_role: step.required_role,
          required: true,
        }),
      );
      const allocationManifest = prep.allocations.map((allocation: any) => ({
        inventory_record_id: allocation.inventory_record_id,
        inventory_revision: allocation.inventory_revision,
        identity_revision: allocation.identity_revision,
        university_asset_id: allocation.university_asset_id,
      }));
      const snapshot = {
        allocation_manifest: allocationManifest,
        technical_snapshot: prep.assessment,
        financial_snapshot: prep.financial,
        disposition_snapshot: {
          method: prep.assessment.recommended_disposition,
          expected_proceeds: prep.assessment.expected_proceeds,
          estimated_disposal_cost: prep.assessment.estimated_disposal_cost,
          reserve_price: prep.assessment.reserve_price,
        },
        sanitization_snapshot: {
          status: row.sanitization_status,
          data_classification: prep.assessment.data_classification,
        },
        environmental_snapshot: prep.assessment.environmental_classification,
        policy_versions: { retirement_policy_id: row.retirement_policy_id },
        resolved_route: route,
        approval_basis_amount: prep.amount,
      };
      const snapshotHash = retirementHash(snapshot);
      await m.query(
        `INSERT INTO retirement_approval_snapshots(approval_snapshot_id,tenant_id,retirement_case_id,dofa_case_id,allocation_manifest,technical_snapshot,financial_snapshot,disposition_snapshot,sanitization_snapshot,environmental_snapshot,policy_versions,resolved_route,approval_basis_amount,snapshot_hash,submitted_by)
         VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14,$15) ON CONFLICT(retirement_case_id,dofa_case_id) DO NOTHING`,
        [
          randomUUID(),
          row.tenant_id,
          id,
          dofaCase.case_id,
          JSON.stringify(snapshot.allocation_manifest),
          JSON.stringify(snapshot.technical_snapshot),
          JSON.stringify(snapshot.financial_snapshot),
          JSON.stringify(snapshot.disposition_snapshot),
          JSON.stringify(snapshot.sanitization_snapshot),
          JSON.stringify(snapshot.environmental_snapshot),
          JSON.stringify(snapshot.policy_versions),
          JSON.stringify(route),
          prep.amount,
          snapshotHash,
          actor.user_id,
        ],
      );
      await m.query(
        `UPDATE retirement_cases SET dofa_case_id=$2,dofa_decision_status='PENDING',approval_basis_amount=$3,workflow_status='PENDING_DOFA' WHERE retirement_case_id=$1`,
        [id, dofaCase.case_id, prep.amount],
      );
      await this.audit(
        m,
        row,
        'DOFA',
        dofaCase.case_id,
        'RETIREMENT_DOFA_SUBMITTED',
        actor.user_id,
        null,
        { snapshot_hash: snapshotHash, approval_basis_amount: prep.amount },
      );
      return {
        dofa_case_id: dofaCase.case_id,
        approval_snapshot_hash: snapshotHash,
        approval_basis_amount: prep.amount,
        route,
      };
    });
  }

  @Interval(15000)
  async reconcileDofaDecisions() {
    const rows = await this.db.query(
      `SELECT c.retirement_case_id,c.tenant_id,d.status FROM retirement_cases c JOIN dofa_cases d ON d.case_id=c.dofa_case_id
       WHERE c.workflow_status='PENDING_DOFA' AND d.status IN('APPROVED','REJECTED') LIMIT 100`,
    );
    for (const item of rows)
      await this.applyDofaOutcome(item.retirement_case_id, item.status);
  }
  private async applyDofaOutcome(id: string, outcome: 'APPROVED' | 'REJECTED') {
    return this.db.transaction(async (m) => {
      const rows = await m.query(
          `SELECT * FROM retirement_cases WHERE retirement_case_id=$1 FOR UPDATE`,
          [id],
        ),
        row = rows[0];
      if (!row || row.workflow_status !== 'PENDING_DOFA') return;
      await this.context(m, id, `DOFA_${outcome}`);
      const allocations = await m.query(
        `SELECT * FROM retirement_allocations WHERE retirement_case_id=$1 ORDER BY inventory_record_id FOR UPDATE`,
        [id],
      );
      if (outcome === 'APPROVED') {
        for (const allocation of allocations) {
          const inventory = (
            await m.query(
              `SELECT lifecycle_status FROM inv_records WHERE inventory_record_id=$1 FOR UPDATE`,
              [allocation.inventory_record_id],
            )
          )[0];
          await m.query(
            `UPDATE inv_records SET lifecycle_status='RETIRED',updated_at=NOW() WHERE inventory_record_id=$1`,
            [allocation.inventory_record_id],
          );
          await m.query(
            `INSERT INTO inv_state_history(tenant_id,inventory_record_id,dimension,previous_value,new_value,reason,initiated_by,acknowledged_by,status,applied_at) VALUES($1,$2,'LIFECYCLE',$3::jsonb,$4::jsonb,'Module 9 retirement approved',$5,$5,'APPLIED',NOW())`,
            [
              row.tenant_id,
              allocation.inventory_record_id,
              JSON.stringify({ lifecycle_status: inventory.lifecycle_status }),
              JSON.stringify({
                lifecycle_status: 'RETIRED',
                retirement_case_id: id,
              }),
              row.requested_by,
            ],
          );
        }
        await m.query(
          `UPDATE retirement_allocations SET status='APPROVED' WHERE retirement_case_id=$1`,
          [id],
        );
        await m.query(
          `UPDATE retirement_cases SET workflow_status='APPROVED',physical_status='RETIRED_IN_CUSTODY',dofa_decision_status='APPROVED',approved_at=NOW() WHERE retirement_case_id=$1`,
          [id],
        );
        await m.query(
          `UPDATE asset_writeoff_requests SET status='APPROVED',updated_at=NOW() WHERE module9_retirement_case_id=$1 AND module9_managed=true`,
          [id],
        );
        await this.emit(m, row, 'AssetRetirementApproved.v1', {
          inventory_record_ids: allocations.map((a) => a.inventory_record_id),
          approval_basis_amount: row.approval_basis_amount,
        });
        await this.emit(m, row, 'AssetRetired.v1', {
          inventory_record_ids: allocations.map((a) => a.inventory_record_id),
        });
      } else {
        await m.query(
          `UPDATE retirement_holds SET status='RELEASED',released_at=NOW(),release_reason='DoFA rejected' WHERE retirement_case_id=$1 AND status='ACTIVE'`,
          [id],
        );
        await m.query(
          `UPDATE retirement_allocations SET status='RELEASED' WHERE retirement_case_id=$1`,
          [id],
        );
        await m.query(
          `UPDATE retirement_cases SET workflow_status='REJECTED',dofa_decision_status='REJECTED' WHERE retirement_case_id=$1`,
          [id],
        );
        await m.query(
          `UPDATE asset_writeoff_requests SET status='REJECTED',updated_at=NOW() WHERE module9_retirement_case_id=$1 AND module9_managed=true`,
          [id],
        );
        await this.emit(m, row, 'AssetRetirementHoldReleased.v1', {
          reason: 'DOFA_REJECTED',
        });
      }
      await this.audit(
        m,
        row,
        'DOFA',
        row.dofa_case_id,
        'RETIREMENT_DOFA_DECIDED',
        null,
        { status: 'PENDING' },
        { status: outcome },
      );
    });
  }

  async createSanitizationJob(
    actor: AssetRetirementActor,
    id: string,
    expected: number,
    key: string,
    input: SanitizationInput,
  ) {
    await this.scopedCase(actor, id, 'ASSET_SANITIZATION_EXECUTE');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.assertRevision(row, expected);
        if (
          !['APPROVED', 'PREPARATION'].includes(row.workflow_status) ||
          row.sanitization_status === 'NOT_REQUIRED'
        )
          throw new ConflictException(
            'Sanitization is not required or case is not approved',
          );
        if (
          !(
            await m.query(
              `SELECT 1 FROM retirement_allocations WHERE retirement_case_id=$1 AND inventory_record_id=$2 AND status='APPROVED'`,
              [id, input.inventory_record_id],
            )
          )[0]
        )
          throw new NotFoundException('Asset is not allocated to this case');
        const jobId = randomUUID();
        await m.query(
          `INSERT INTO retirement_sanitization_jobs(sanitization_job_id,tenant_id,retirement_case_id,inventory_record_id,method,media_manifest,tool_and_standard,status,operated_by,started_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'IN_PROGRESS',$8,NOW())`,
          [
            jobId,
            row.tenant_id,
            id,
            input.inventory_record_id,
            input.method,
            JSON.stringify(input.media_manifest),
            JSON.stringify(input.tool_and_standard),
            actor.user_id,
          ],
        );
        await m.query(
          `UPDATE retirement_cases SET workflow_status='PREPARATION',sanitization_status='IN_PROGRESS' WHERE retirement_case_id=$1`,
          [id],
        );
        await this.audit(
          m,
          row,
          'SANITIZATION',
          jobId,
          'ASSET_SANITIZATION_STARTED',
          actor.user_id,
          null,
          input,
        );
        return { sanitization_job_id: jobId, status: 'IN_PROGRESS' };
      }),
    );
  }
  async verifySanitization(
    actor: AssetRetirementActor,
    id: string,
    jobId: string,
    expected: number,
    key: string,
    input: CompleteSanitizationInput,
  ) {
    await this.scopedCase(actor, id, 'ASSET_SANITIZATION_VERIFY');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.assertRevision(row, expected);
        const job = (
          await m.query(
            `SELECT * FROM retirement_sanitization_jobs WHERE sanitization_job_id=$1 AND retirement_case_id=$2 FOR UPDATE`,
            [jobId, id],
          )
        )[0];
        if (!job) throw new NotFoundException('Sanitization job not found');
        if (job.operated_by === actor.user_id)
          throw new ForbiddenException(
            'Sanitization operator cannot verify the same work',
          );
        if (job.status !== 'IN_PROGRESS')
          throw new ConflictException(
            'Sanitization job is not awaiting verification',
          );
        const status = input.status ?? 'VERIFIED';
        await m.query(
          `UPDATE retirement_sanitization_jobs SET status=$2,result=$3::jsonb,evidence_manifest_hash=$4,verified_by=$5,completed_at=NOW(),verified_at=NOW() WHERE sanitization_job_id=$1`,
          [
            jobId,
            status,
            JSON.stringify(input.result),
            input.evidence_manifest_hash,
            actor.user_id,
          ],
        );
        const pending = (
          await m.query(
            `SELECT COUNT(*)::int count FROM retirement_sanitization_jobs WHERE retirement_case_id=$1 AND status<>'VERIFIED'`,
            [id],
          )
        )[0];
        const overall =
          status === 'VERIFIED' && Number(pending.count) === 0
            ? 'VERIFIED'
            : status;
        await m.query(
          `UPDATE retirement_cases SET sanitization_status=$2 WHERE retirement_case_id=$1`,
          [id, overall],
        );
        await this.audit(
          m,
          row,
          'SANITIZATION',
          jobId,
          'ASSET_SANITIZATION_VERIFIED',
          actor.user_id,
          { status: job.status },
          {
            status,
            result: input.result,
            evidence_manifest_hash: input.evidence_manifest_hash,
          },
        );
        if (overall === 'VERIFIED')
          await this.emit(m, row, 'AssetSanitizationVerified.v1', {
            evidence_manifest_hash: input.evidence_manifest_hash,
          });
        return { status, case_sanitization_status: overall };
      }),
    );
  }

  async createDisposalLot(
    actor: AssetRetirementActor,
    id: string,
    expected: number,
    key: string,
    input: {
      allocation_ids: string[];
      bidding_opens_at?: string;
      bidding_closes_at?: string;
    },
  ) {
    await this.scopedCase(actor, id, 'ASSET_DISPOSAL_PREPARE');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.assertRevision(row, expected);
        if (!['APPROVED', 'PREPARATION'].includes(row.workflow_status))
          throw new ConflictException('Approved case required');
        const ids = [...new Set(input.allocation_ids)].sort(),
          allocations = await m.query(
            `SELECT * FROM retirement_allocations WHERE retirement_case_id=$1 AND retirement_allocation_id=ANY($2::uuid[]) AND status='APPROVED' ORDER BY retirement_allocation_id FOR UPDATE`,
            [id, ids],
          );
        if (!ids.length || allocations.length !== ids.length)
          throw new ConflictException(
            'Invalid or unavailable allocation manifest',
          );
        const lotId = randomUUID(),
          code = `DSP-${new Date().getUTCFullYear()}-${lotId.slice(0, 8).toUpperCase()}`;
        await m.query(
          `INSERT INTO retirement_disposal_lots(disposal_lot_id,tenant_id,retirement_case_id,lot_code,disposition_method,reserve_price,currency,bidding_opens_at,bidding_closes_at) SELECT $1,tenant_id,retirement_case_id,$2,disposition_method,(SELECT reserve_price FROM retirement_assessments WHERE retirement_case_id=$3 ORDER BY revision DESC LIMIT 1),currency,$4,$5 FROM retirement_cases WHERE retirement_case_id=$3`,
          [
            lotId,
            code,
            id,
            input.bidding_opens_at ?? null,
            input.bidding_closes_at ?? null,
          ],
        );
        for (const allocation of allocations)
          await m.query(
            `INSERT INTO retirement_disposal_lot_assets(disposal_lot_id,retirement_allocation_id,inventory_record_id) VALUES($1,$2,$3)`,
            [
              lotId,
              allocation.retirement_allocation_id,
              allocation.inventory_record_id,
            ],
          );
        return { disposal_lot_id: lotId, lot_code: code, status: 'DRAFT' };
      }),
    );
  }
  async lockDisposalLot(
    actor: AssetRetirementActor,
    id: string,
    lotId: string,
    expected: number,
    key: string,
  ) {
    await this.scopedCase(actor, id, 'ASSET_DISPOSAL_PREPARE');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, { lotId }, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.assertRevision(row, expected);
        const lot = (
          await m.query(
            `SELECT * FROM retirement_disposal_lots WHERE disposal_lot_id=$1 AND retirement_case_id=$2 FOR UPDATE`,
            [lotId, id],
          )
        )[0];
        if (!lot || lot.status !== 'DRAFT')
          throw new ConflictException('Draft disposal lot required');
        const manifest = await m.query(
            `SELECT inventory_record_id FROM retirement_disposal_lot_assets WHERE disposal_lot_id=$1 ORDER BY inventory_record_id`,
            [lotId],
          ),
          manifestHash = retirementHash(manifest);
        await m.query(
          `UPDATE retirement_disposal_lots SET status=CASE WHEN disposition_method='AUCTION_SALE' THEN 'BIDDING' ELSE 'LOCKED' END,manifest_hash=$2,locked_by=$3,locked_at=NOW() WHERE disposal_lot_id=$1`,
          [lotId, manifestHash, actor.user_id],
        );
        await this.emit(m, row, 'AssetDisposalLotLocked.v1', {
          disposal_lot_id: lotId,
          manifest_hash: manifestHash,
        });
        return {
          status:
            lot.disposition_method === 'AUCTION_SALE' ? 'BIDDING' : 'LOCKED',
          manifest_hash: manifestHash,
        };
      }),
    );
  }

  async submitOffer(
    actor: AssetRetirementActor,
    id: string,
    lotId: string,
    key: string,
    input: {
      retirement_party_id: string;
      encrypted_offer: string;
      amount: number;
      currency: string;
      taxes_fees?: Record<string, unknown>;
      conflict_declaration: Record<string, unknown>;
    },
  ) {
    await this.scopedCase(actor, id, 'ASSET_DISPOSAL_BID_MANAGE');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const lot = (
          await m.query(
            `SELECT * FROM retirement_disposal_lots WHERE disposal_lot_id=$1 AND retirement_case_id=$2 FOR UPDATE`,
            [lotId, id],
          )
        )[0];
        if (
          !lot ||
          lot.status !== 'BIDDING' ||
          (lot.bidding_closes_at &&
            new Date(lot.bidding_closes_at) <= new Date())
        )
          throw new ConflictException('Bidding is not open');
        const party = (
          await m.query(
            `SELECT 1 FROM retirement_parties WHERE retirement_party_id=$1 AND tenant_id=$2 AND status='ACTIVE'`,
            [input.retirement_party_id, this.tenant(actor)],
          )
        )[0];
        if (!party) throw new NotFoundException('Approved bidder not found');
        const offerId = randomUUID(),
          offerHash = retirementHash({ lotId, input });
        await m.query(
          `INSERT INTO retirement_offers(retirement_offer_id,tenant_id,disposal_lot_id,retirement_party_id,encrypted_offer,offer_hash,amount,currency,taxes_fees,conflict_declaration,submitted_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11)`,
          [
            offerId,
            this.tenant(actor),
            lotId,
            input.retirement_party_id,
            input.encrypted_offer,
            offerHash,
            input.amount,
            input.currency,
            JSON.stringify(input.taxes_fees ?? {}),
            JSON.stringify(input.conflict_declaration),
            actor.user_id,
          ],
        );
        return {
          retirement_offer_id: offerId,
          status: 'SEALED',
          offer_hash: offerHash,
        };
      }),
    );
  }
  async openOffers(
    actor: AssetRetirementActor,
    id: string,
    lotId: string,
    expected: number,
    key: string,
    input: { committee_member_ids: string[] },
  ) {
    await this.scopedCase(actor, id, 'ASSET_DISPOSAL_BID_MANAGE');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.assertRevision(row, expected);
        const committee = [
          ...new Set([actor.user_id, ...input.committee_member_ids]),
        ];
        if (committee.length < 2)
          throw new BadRequestException(
            'At least two distinct opening committee members are required',
          );
        const lot = (
          await m.query(
            `SELECT * FROM retirement_disposal_lots WHERE disposal_lot_id=$1 AND retirement_case_id=$2 FOR UPDATE`,
            [lotId, id],
          )
        )[0];
        if (!lot || lot.status !== 'BIDDING')
          throw new ConflictException('Bidding lot required');
        if (
          lot.bidding_closes_at &&
          new Date(lot.bidding_closes_at) > new Date()
        )
          throw new ConflictException(
            'Offers cannot be opened before closing time',
          );
        await m.query(
          `UPDATE retirement_offers SET status='OPENED',opened_by=$2::jsonb,opened_at=NOW() WHERE disposal_lot_id=$1 AND status='SEALED'`,
          [lotId, JSON.stringify(committee)],
        );
        await m.query(
          `UPDATE retirement_disposal_lots SET status='LOCKED' WHERE disposal_lot_id=$1`,
          [lotId],
        );
        return { status: 'OPENED', committee_member_ids: committee };
      }),
    );
  }
  async award(
    actor: AssetRetirementActor,
    id: string,
    lotId: string,
    expected: number,
    key: string,
    input: {
      retirement_offer_id?: string;
      retirement_party_id?: string;
      retirement_provider_id?: string;
      award_amount?: number;
      currency?: string;
      evaluation: Record<string, unknown>;
      amendment_dofa_case_id?: string;
    },
  ) {
    await this.scopedCase(actor, id, 'ASSET_DISPOSAL_AWARD');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.assertRevision(row, expected);
        const lot = (
          await m.query(
            `SELECT * FROM retirement_disposal_lots WHERE disposal_lot_id=$1 AND retirement_case_id=$2 FOR UPDATE`,
            [lotId, id],
          )
        )[0];
        if (!lot || !['LOCKED', 'BIDDING'].includes(lot.status))
          throw new ConflictException('Disposal lot is not awardable');
        const amount = Number(input.award_amount ?? 0),
          within =
            lot.reserve_price == null || amount >= Number(lot.reserve_price);
        if (!within && !input.amendment_dofa_case_id)
          throw new ConflictException(
            'Below-reserve award requires approved DoFA amendment',
          );
        if (input.amendment_dofa_case_id) {
          const approved = (
            await m.query(
              `SELECT 1 FROM dofa_cases WHERE case_id=$1 AND tenant_id=$2 AND status='APPROVED'`,
              [input.amendment_dofa_case_id, row.tenant_id],
            )
          )[0];
          if (!approved)
            throw new ConflictException('DoFA amendment is not approved');
        }
        if (input.retirement_offer_id) {
          const offer = (
            await m.query(
              `SELECT * FROM retirement_offers WHERE retirement_offer_id=$1 AND disposal_lot_id=$2 AND status='OPENED' FOR UPDATE`,
              [input.retirement_offer_id, lotId],
            )
          )[0];
          if (!offer) throw new ConflictException('Opened offer required');
        }
        const awardId = randomUUID(),
          decisionHash = retirementHash({
            id,
            lotId,
            input,
            approved_by: actor.user_id,
          });
        await m.query(
          `INSERT INTO retirement_awards(retirement_award_id,tenant_id,disposal_lot_id,retirement_offer_id,retirement_party_id,retirement_provider_id,award_amount,currency,evaluation,within_approval_envelope,amendment_dofa_case_id,approved_by,decision_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13)`,
          [
            awardId,
            row.tenant_id,
            lotId,
            input.retirement_offer_id ?? null,
            input.retirement_party_id ?? null,
            input.retirement_provider_id ?? null,
            input.award_amount ?? null,
            input.currency ?? row.currency,
            JSON.stringify(input.evaluation),
            within,
            input.amendment_dofa_case_id ?? null,
            actor.user_id,
            decisionHash,
          ],
        );
        if (input.retirement_offer_id)
          await m.query(
            `UPDATE retirement_offers SET status=CASE WHEN retirement_offer_id=$2 THEN 'AWARDED' ELSE 'REJECTED' END WHERE disposal_lot_id=$1 AND status='OPENED'`,
            [lotId, input.retirement_offer_id],
          );
        await m.query(
          `UPDATE retirement_disposal_lots SET status='AWARDED' WHERE disposal_lot_id=$1`,
          [lotId],
        );
        await this.emit(m, row, 'AssetDisposalAwarded.v1', {
          disposal_lot_id: lotId,
          retirement_award_id: awardId,
          award_amount: input.award_amount,
          decision_hash: decisionHash,
        });
        return {
          retirement_award_id: awardId,
          within_approval_envelope: within,
          decision_hash: decisionHash,
        };
      }),
    );
  }

  async recordPhysicalCompletion(
    actor: AssetRetirementActor,
    id: string,
    expected: number,
    key: string,
    input: {
      disposal_lot_id: string;
      event_type: 'HANDED_OVER' | 'RECYCLED' | 'DESTROYED' | 'TAKEN_BACK';
      inventory_record_ids: string[];
      source_custody: Record<string, unknown>;
      destination_custody: Record<string, unknown>;
      transport_reference?: Record<string, unknown>;
      recipient_reference: Record<string, unknown>;
      evidence_manifest_hash: string;
      witnessed_by: string;
    },
  ) {
    await this.scopedCase(actor, id, 'ASSET_DISPOSAL_EXECUTE');
    if (input.witnessed_by === actor.user_id)
      throw new ForbiddenException(
        'Handover executor cannot be the independent witness',
      );
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.assertRevision(row, expected);
        if (
          !['APPROVED', 'PREPARATION', 'IN_EXECUTION'].includes(
            row.workflow_status,
          )
        )
          throw new ConflictException('Case is not ready for disposition');
        if (!['VERIFIED', 'NOT_REQUIRED'].includes(row.sanitization_status))
          throw new ConflictException('Sanitization gate is incomplete');
        const lot = (
          await m.query(
            `SELECT * FROM retirement_disposal_lots WHERE disposal_lot_id=$1 AND retirement_case_id=$2 AND status IN('LOCKED','AWARDED','IN_HANDOVER') FOR UPDATE`,
            [input.disposal_lot_id, id],
          )
        )[0];
        if (!lot)
          throw new ConflictException(
            'Locked or awarded disposal lot required',
          );
        if (['AUCTION_SALE', 'DIRECT_SALE'].includes(row.disposition_method)) {
          const proceeds = (
            await m.query(
              `SELECT 1 FROM retirement_finance_projections WHERE retirement_case_id=$1 AND projection_type='PROCEEDS' AND posting_status='POSTED'`,
              [id],
            )
          )[0];
          if (!proceeds)
            throw new ConflictException(
              'Confirmed Finance receipt is required before sale handover',
            );
        }
        const ids = [...new Set(input.inventory_record_ids)].sort(),
          eligible = await m.query(
            `SELECT la.inventory_record_id,a.retirement_allocation_id FROM retirement_disposal_lot_assets la JOIN retirement_allocations a ON a.retirement_allocation_id=la.retirement_allocation_id WHERE la.disposal_lot_id=$1 AND la.inventory_record_id=ANY($2::uuid[]) AND a.status='APPROVED' ORDER BY la.inventory_record_id FOR UPDATE OF a`,
            [input.disposal_lot_id, ids],
          );
        if (!ids.length || eligible.length !== ids.length)
          throw new ConflictException(
            'Physical manifest contains unavailable assets',
          );
        await this.context(m, id, 'PHYSICAL_DISPOSITION');
        const custodyId = randomUUID();
        await m.query(
          `INSERT INTO retirement_custody_events(custody_event_id,tenant_id,retirement_case_id,disposal_lot_id,event_type,inventory_manifest,source_custody,destination_custody,transport_reference,evidence_manifest_hash,executed_by,witnessed_by,recipient_reference) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11,$12,$13::jsonb)`,
          [
            custodyId,
            row.tenant_id,
            id,
            input.disposal_lot_id,
            input.event_type,
            JSON.stringify(ids),
            JSON.stringify(input.source_custody),
            JSON.stringify(input.destination_custody),
            JSON.stringify(input.transport_reference ?? {}),
            input.evidence_manifest_hash,
            actor.user_id,
            input.witnessed_by,
            JSON.stringify(input.recipient_reference),
          ],
        );
        for (const item of eligible) {
          await m.query(
            `UPDATE inv_rfid_bindings b SET status='REVOKED',active_to=NOW() FROM inv_logical_rfids l WHERE b.logical_rfid_id=l.logical_rfid_id AND l.inventory_record_id=$1 AND b.status='ACTIVE'`,
            [item.inventory_record_id],
          );
          await m.query(
            `UPDATE inv_logical_rfids SET status='REVOKED' WHERE inventory_record_id=$1 AND status<>'REVOKED'`,
            [item.inventory_record_id],
          );
          await m.query(
            `UPDATE inv_records SET lifecycle_status='DISPOSED',updated_at=NOW() WHERE inventory_record_id=$1`,
            [item.inventory_record_id],
          );
          await m.query(
            `UPDATE retirement_allocations SET status='DISPOSED' WHERE retirement_allocation_id=$1`,
            [item.retirement_allocation_id],
          );
        }
        const remaining = (
            await m.query(
              `SELECT COUNT(*)::int count FROM retirement_allocations WHERE retirement_case_id=$1 AND status<>'DISPOSED'`,
              [id],
            )
          )[0],
          allDone = Number(remaining.count) === 0;
        await m.query(
          `UPDATE retirement_disposal_lots SET status=$2 WHERE disposal_lot_id=$1`,
          [
            input.disposal_lot_id,
            allDone ? 'PHYSICAL_COMPLETED' : 'IN_HANDOVER',
          ],
        );
        await m.query(
          `UPDATE retirement_cases SET workflow_status='COMPLETION_PENDING',physical_status=$2,physical_completed_at=CASE WHEN $2='PHYSICAL_COMPLETED' THEN NOW() ELSE physical_completed_at END,finance_status=CASE WHEN $2='PHYSICAL_COMPLETED' AND finance_status NOT IN('SETTLED','NOT_APPLICABLE','WRITE_OFF_POSTED') THEN 'FINANCE_PENDING' ELSE finance_status END WHERE retirement_case_id=$1`,
          [id, allDone ? 'PHYSICAL_COMPLETED' : 'HANDED_OVER'],
        );
        await this.emit(m, row, 'AssetDispositionHandoverRecorded.v1', {
          custody_event_id: custodyId,
          inventory_record_ids: ids,
          evidence_manifest_hash: input.evidence_manifest_hash,
        });
        if (allDone) {
          await this.emit(m, row, 'AssetPhysicalDispositionCompleted.v1', {
            inventory_record_ids: ids,
          });
          await this.emit(m, row, 'AssetDisposed.v1', {
            inventory_record_ids: ids,
          });
        }
        return {
          physical_status: allDone ? 'PHYSICAL_COMPLETED' : 'HANDED_OVER',
          finance_status: allDone ? 'FINANCE_PENDING' : row.finance_status,
        };
      }),
    );
  }

  async requestFinancePosting(
    actor: AssetRetirementActor,
    id: string,
    expected: number,
    key: string,
  ) {
    await this.scopedCase(actor, id, 'ASSET_RETIREMENT_RECONCILE');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, { id, expected }, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.assertRevision(row, expected);
        if (row.physical_status !== 'PHYSICAL_COMPLETED')
          throw new ConflictException(
            'Physical disposition must be complete before Finance posting request',
          );
        await m.query(
          `UPDATE retirement_cases SET finance_status='FINANCE_PENDING' WHERE retirement_case_id=$1`,
          [id],
        );
        const event = await this.emit(
          m,
          row,
          'AssetWriteoffPostingRequested.v1',
          {
            approval_basis_amount: row.approval_basis_amount,
            currency: row.currency,
            idempotency_reference: `retirement:${id}:writeoff`,
          },
        );
        return { finance_status: 'FINANCE_PENDING', event_id: event.event_id };
      }),
    );
  }
  async recordFinanceProjection(
    actor: AssetRetirementActor,
    id: string,
    expected: number,
    key: string,
    input: FinanceProjectionInput,
  ) {
    await this.scopedCase(actor, id, 'ASSET_RETIREMENT_RECONCILE');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.assertRevision(row, expected);
        const projectionId = randomUUID(),
          sourceEventId = input.source_event_id ?? randomUUID();
        await m.query(
          `INSERT INTO retirement_finance_projections(finance_projection_id,tenant_id,retirement_case_id,source_event_id,projection_type,posting_status,amount,currency,source_reference,failure_reason,source_revision,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12) ON CONFLICT(source_event_id) DO NOTHING`,
          [
            projectionId,
            row.tenant_id,
            id,
            sourceEventId,
            input.projection_type,
            input.posting_status,
            input.amount ?? 0,
            input.currency,
            JSON.stringify(input.source_reference),
            input.failure_reason ?? null,
            input.source_revision,
            input.occurred_at ?? new Date().toISOString(),
          ],
        );
        const latest = await m.query(
            `SELECT projection_type,posting_status FROM retirement_finance_projections WHERE retirement_case_id=$1`,
            [id],
          ),
          failed = latest.some((p: any) => p.posting_status === 'FAILED'),
          writeoff = latest.some(
            (p: any) =>
              p.projection_type === 'WRITE_OFF' &&
              p.posting_status === 'POSTED',
          ),
          assessment = (
            await m.query(
              `SELECT expected_proceeds FROM retirement_assessments WHERE retirement_case_id=$1 ORDER BY revision DESC LIMIT 1`,
              [id],
            )
          )[0],
          proceedsRequired = Number(assessment?.expected_proceeds ?? 0) > 0,
          proceeds = latest.some(
            (p: any) =>
              p.projection_type === 'PROCEEDS' && p.posting_status === 'POSTED',
          );
        const status = failed
          ? 'FINANCE_POSTING_FAILED'
          : writeoff && (!proceedsRequired || proceeds)
            ? 'SETTLED'
            : writeoff && proceedsRequired
              ? 'PROCEEDS_PENDING'
              : 'FINANCE_PENDING';
        await m.query(
          `UPDATE retirement_cases SET finance_status=$2,finance_completed_at=CASE WHEN $2='SETTLED' THEN NOW() ELSE finance_completed_at END WHERE retirement_case_id=$1`,
          [id, status],
        );
        if (failed)
          await this.emit(m, row, 'AssetFinanceReconciliationFailed.v1', {
            projection_type: input.projection_type,
            failure_reason: input.failure_reason,
          });
        if (
          input.projection_type === 'WRITE_OFF' &&
          input.posting_status === 'POSTED'
        )
          await this.emit(m, row, 'AssetWriteoffPosted.v1', {
            source_reference: input.source_reference,
          });
        return { finance_projection_id: projectionId, finance_status: status };
      }),
    );
  }

  private signingConfiguration() {
    const privateKey = this.config
        .get<string>('ASSET_RETIREMENT_ED25519_PRIVATE_KEY')
        ?.replace(/\\n/g, '\n'),
      keyVersion = this.config.get<string>(
        'ASSET_RETIREMENT_SIGNING_KEY_VERSION',
      );
    if (!privateKey || !keyVersion)
      throw new ConflictException({
        message: 'Asset retirement signing key is unavailable',
        code: 'ASSET_RETIREMENT_SIGNING_UNAVAILABLE',
      });
    return { privateKey, keyVersion };
  }
  async issueCertificate(
    actor: AssetRetirementActor,
    id: string,
    expected: number,
    key: string,
  ) {
    await this.scopedCase(actor, id, 'ASSET_DISPOSAL_ACCEPT');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, { id, expected }, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.assertRevision(row, expected);
        if (
          row.physical_status !== 'PHYSICAL_COMPLETED' ||
          !['SETTLED', 'NOT_APPLICABLE'].includes(row.finance_status) ||
          !['VERIFIED', 'NOT_REQUIRED'].includes(row.sanitization_status) ||
          row.workflow_status === 'DISPUTED'
        )
          throw new ConflictException(
            'All physical, sanitization and Finance gates must complete before certification',
          );
        const allocations = await m.query(
          `SELECT a.*,r.university_asset_id,r.lifecycle_status,COALESCE((SELECT MAX(identity_revision) FROM inv_identity_revisions i WHERE i.inventory_record_id=r.inventory_record_id),0)::int current_identity_revision FROM retirement_allocations a JOIN inv_records r ON r.inventory_record_id=a.inventory_record_id WHERE a.retirement_case_id=$1 ORDER BY a.inventory_record_id`,
          [id],
        );
        if (
          allocations.some(
            (a: any) =>
              a.status !== 'DISPOSED' || a.lifecycle_status !== 'DISPOSED',
          )
        )
          throw new ConflictException('Asset manifest is not fully disposed');
        const activeDisputes = (
          await m.query(
            `SELECT 1 FROM retirement_cases WHERE retirement_case_id=$1 AND workflow_status='DISPUTED'`,
            [id],
          )
        )[0];
        if (activeDisputes)
          throw new ConflictException('Active dispute blocks certification');
        const evidence = await m.query(
            `SELECT evidence_id,content_hash FROM retirement_evidence WHERE retirement_case_id=$1 ORDER BY evidence_id`,
            [id],
          ),
          custody = await m.query(
            `SELECT custody_event_id,evidence_manifest_hash FROM retirement_custody_events WHERE retirement_case_id=$1 ORDER BY occurred_at`,
            [id],
          ),
          finance = await m.query(
            `SELECT projection_type,posting_status,source_reference FROM retirement_finance_projections WHERE retirement_case_id=$1 ORDER BY occurred_at`,
            [id],
          ),
          sanitization = await m.query(
            `SELECT inventory_record_id,method,status,evidence_manifest_hash FROM retirement_sanitization_jobs WHERE retirement_case_id=$1 ORDER BY inventory_record_id`,
            [id],
          );
        const prior = (
            await m.query(
              `SELECT certificate_revision,payload_hash FROM retirement_certificates WHERE retirement_case_id=$1 ORDER BY certificate_revision DESC LIMIT 1`,
              [id],
            )
          )[0],
          revision = Number(prior?.certificate_revision ?? 0) + 1,
          evidenceManifestHash = retirementHash({
            evidence,
            custody,
            sanitization,
          }),
          payload = {
            retirement_case_id: id,
            case_number: row.case_number,
            certificate_revision: revision,
            allocations: allocations.map((a: any) => ({
              inventory_record_id: a.inventory_record_id,
              university_asset_id: a.university_asset_id,
              identity_revision: a.current_identity_revision,
              lifecycle_status: a.lifecycle_status,
            })),
            disposition_method: row.disposition_method,
            sanitization,
            custody,
            finance,
            evidence_manifest_hash: evidenceManifestHash,
            physical_status: row.physical_status,
            finance_status: row.finance_status,
            issued_at: new Date().toISOString(),
          },
          payloadHash = retirementHash(payload),
          { privateKey, keyVersion } = this.signingConfiguration(),
          signature = signRetirementPayload(payload, privateKey),
          certificateId = randomUUID(),
          code = `LCC-${new Date().getUTCFullYear()}-${certificateId.slice(0, 10).toUpperCase()}`;
        await m.query(
          `UPDATE retirement_certificates SET status='SUPERSEDED' WHERE retirement_case_id=$1 AND status='ACTIVE'`,
          [id],
        );
        await m.query(
          `INSERT INTO retirement_certificates(retirement_certificate_id,tenant_id,retirement_case_id,certificate_revision,certificate_code,signed_payload,payload_hash,evidence_manifest_hash,previous_certificate_hash,signing_key_version,signature,issued_by) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12)`,
          [
            certificateId,
            row.tenant_id,
            id,
            revision,
            code,
            JSON.stringify(payload),
            payloadHash,
            evidenceManifestHash,
            prior?.payload_hash ?? null,
            keyVersion,
            signature,
            actor.user_id,
          ],
        );
        await this.context(m, id, 'CLOSE_RETIREMENT_CASE');
        await m.query(
          `UPDATE retirement_holds SET status='RELEASED',released_by=$2,released_at=NOW(),release_reason='Lifecycle certificate issued' WHERE retirement_case_id=$1 AND status='ACTIVE'`,
          [id, actor.user_id],
        );
        await m.query(
          `UPDATE retirement_cases SET workflow_status='CLOSED',physical_status='DISPOSED',closed_at=NOW() WHERE retirement_case_id=$1`,
          [id],
        );
        await m.query(
          `UPDATE asset_writeoff_requests SET status='WRITTEN_OFF',finance_at=NOW(),updated_at=NOW() WHERE module9_retirement_case_id=$1 AND module9_managed=true`,
          [id],
        );
        await this.emit(m, row, 'AssetLifecycleCertificateIssued.v1', {
          retirement_certificate_id: certificateId,
          certificate_code: code,
          payload_hash: payloadHash,
        });
        await this.emit(m, row, 'AssetLifecycleCompleted.v1', {
          retirement_certificate_id: certificateId,
          certificate_code: code,
          inventory_record_ids: allocations.map(
            (a: any) => a.inventory_record_id,
          ),
          evidence_manifest_hash: evidenceManifestHash,
        });
        return {
          retirement_certificate_id: certificateId,
          certificate_code: code,
          certificate_revision: revision,
          payload_hash: payloadHash,
          signature,
          signing_key_version: keyVersion,
          status: 'ACTIVE',
        };
      }),
    );
  }

  async cancel(
    actor: AssetRetirementActor,
    id: string,
    expected: number,
    key: string,
    reason: string,
  ) {
    await this.scopedCase(actor, id, 'ASSET_RETIREMENT_REQUEST');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, { reason }, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.assertRevision(row, expected);
        if (
          !['DRAFT', 'SUBMITTED', 'ASSESSMENT', 'PENDING_DOFA'].includes(
            row.workflow_status,
          )
        )
          throw new ConflictException('Case can no longer be cancelled');
        await this.context(m, id, 'CANCEL_RETIREMENT');
        await m.query(
          `UPDATE retirement_holds SET status='RELEASED',released_by=$2,released_at=NOW(),release_reason=$3 WHERE retirement_case_id=$1 AND status='ACTIVE'`,
          [id, actor.user_id, reason],
        );
        await m.query(
          `UPDATE retirement_allocations SET status='RELEASED' WHERE retirement_case_id=$1 AND status IN('DRAFT','HELD')`,
          [id],
        );
        await m.query(
          `UPDATE retirement_cases SET workflow_status='CANCELLED' WHERE retirement_case_id=$1`,
          [id],
        );
        await this.emit(m, row, 'AssetRetirementHoldReleased.v1', { reason });
        return { workflow_status: 'CANCELLED' };
      }),
    );
  }
  async supersede(
    actor: AssetRetirementActor,
    id: string,
    key: string,
    reason: string,
  ) {
    await this.scopedCase(actor, id, 'ASSET_RETIREMENT_REQUEST');
    if (!reason?.trim())
      throw new BadRequestException('Supersede reason required');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, { reason }, async () => {
        const original = await this.locked(m, id, this.tenant(actor));
        if (original.workflow_status !== 'CLOSED')
          throw new ConflictException(
            'Only closed cases use the superseding workflow',
          );
        const newId = randomUUID(),
          number = `RET-${new Date().getUTCFullYear()}-${newId.slice(0, 8).toUpperCase()}`;
        await m.query(
          `INSERT INTO retirement_cases(retirement_case_id,tenant_id,case_number,title,retirement_reason,requested_by,owner_department_id,root_retirement_case_id,supersedes_retirement_case_id,supersede_reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            newId,
            original.tenant_id,
            number,
            original.title,
            original.retirement_reason,
            actor.user_id,
            original.owner_department_id,
            original.root_retirement_case_id ?? id,
            id,
            reason,
          ],
        );
        const allocations = await m.query(
          `SELECT * FROM retirement_allocations WHERE retirement_case_id=$1`,
          [id],
        );
        for (const allocation of allocations)
          await m.query(
            `INSERT INTO retirement_allocations(retirement_allocation_id,tenant_id,retirement_case_id,inventory_record_id,parent_inventory_record_id,allocation_type,inventory_revision,identity_revision) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              randomUUID(),
              original.tenant_id,
              newId,
              allocation.inventory_record_id,
              allocation.parent_inventory_record_id,
              allocation.allocation_type,
              allocation.inventory_revision,
              allocation.identity_revision,
            ],
          );
        const row = await this.locked(m, newId, original.tenant_id);
        await this.emit(m, row, 'AssetRetirementCaseSuperseded.v1', {
          supersedes_retirement_case_id: id,
          reason,
        });
        return {
          retirement_case_id: newId,
          case_number: number,
          workflow_status: 'DRAFT',
        };
      }),
    );
  }

  async registerEvidence(
    actor: AssetRetirementActor,
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
    await this.scopedCase(actor, id, 'ASSET_RETIREMENT_VIEW');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const row = await this.locked(m, id, this.tenant(actor)),
          evidenceId = randomUUID();
        await m.query(
          `INSERT INTO retirement_evidence(evidence_id,tenant_id,retirement_case_id,evidence_type,object_key,content_hash,mime_type,byte_size,retention_class,metadata,captured_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,
          [
            evidenceId,
            row.tenant_id,
            id,
            input.evidence_type,
            input.object_key,
            input.content_hash,
            input.mime_type,
            input.byte_size,
            input.retention_class ?? 'ASSET_RETIREMENT',
            JSON.stringify(input.metadata ?? {}),
            actor.user_id,
          ],
        );
        await this.audit(
          m,
          row,
          'EVIDENCE',
          evidenceId,
          'RETIREMENT_EVIDENCE_CAPTURED',
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
  async publicCertificate(code: string) {
    const row = (
      await this.db.query(
        `SELECT c.certificate_code,c.status,c.issued_at,c.signed_payload->>'disposition_method' disposition_method,r.case_number FROM retirement_certificates c JOIN retirement_cases r ON r.retirement_case_id=c.retirement_case_id WHERE c.certificate_code=$1`,
        [code],
      )
    )[0];
    if (!row) throw new NotFoundException('Lifecycle certificate not found');
    return row;
  }
}
