/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument -- database rows are checked at service boundaries */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { InventoryService } from '../inventory/inventory.service';
import { AcquisitionService } from '../acquisitions/acquisition.service';
import type { CreateAcquisitionInput } from '../acquisitions/acquisition.types';
import type {
  AcceptServiceInput,
  AssetServiceActor,
  CoverageInput,
  CreateServiceCaseInput,
  DiagnosisInput,
  EstimateInput,
} from './asset-service.types';
import { serviceHash } from './asset-service.util';

@Injectable()
export class AssetServiceService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly inventory: InventoryService,
    private readonly acquisitions: AcquisitionService,
  ) {}

  private tenant(actor: AssetServiceActor) {
    if (!actor.tenant_id)
      throw new ForbiddenException('Tenant context required');
    return actor.tenant_id;
  }
  private roles(actor: AssetServiceActor) {
    return [
      ...new Set([...(actor.roles ?? []), ...(actor.role ? [actor.role] : [])]),
    ].map((role) => role.toLowerCase());
  }
  private grants(actor: AssetServiceActor, capability: string) {
    return this.db.query(
      `SELECT scope_type,scope_reference FROM acq_access_grants WHERE tenant_id=$1 AND capability=$2
       AND valid_from<=NOW() AND(valid_until IS NULL OR valid_until>NOW())
       AND(principal_user_id=$3 OR lower(principal_role)=ANY($4::text[]))`,
      [this.tenant(actor), capability, actor.user_id, this.roles(actor)],
    );
  }
  private async require(actor: AssetServiceActor, capability: string) {
    if (!(await this.grants(actor, capability)).length)
      throw new ForbiddenException(`Missing ${capability}`);
  }
  private async scopedCase(
    actor: AssetServiceActor,
    id: string,
    capability = 'ASSET_SERVICE_VIEW',
  ) {
    const rows = await this.db.query(
      `SELECT c.*,r.owner_department_id,r.university_asset_id,r.manufacturer_serial,r.record_status,r.lifecycle_status,
              pm.product_name,pm.category,pm.model_number
       FROM svc_cases c JOIN inv_records r ON r.inventory_record_id=c.inventory_record_id
       JOIN inv_product_models pm ON pm.product_model_id=r.product_model_id
       WHERE c.service_case_id=$1 AND c.tenant_id=$2 AND EXISTS(
         SELECT 1 FROM acq_access_grants g WHERE g.tenant_id=c.tenant_id AND g.capability=$3
         AND g.valid_from<=NOW() AND(g.valid_until IS NULL OR g.valid_until>NOW())
         AND(g.principal_user_id=$4 OR lower(g.principal_role)=ANY($5::text[]))
         AND(g.scope_type='TENANT' OR(g.scope_type='DEPARTMENT' AND g.scope_reference=r.owner_department_id::text)))`,
      [id, this.tenant(actor), capability, actor.user_id, this.roles(actor)],
    );
    if (!rows[0]) throw new NotFoundException('Asset service case not found');
    return rows[0];
  }
  private async locked(m: EntityManager, id: string, tenantId: string) {
    const rows = await m.query(
      `SELECT * FROM svc_cases WHERE service_case_id=$1 AND tenant_id=$2 FOR UPDATE`,
      [id, tenantId],
    );
    if (!rows[0]) throw new NotFoundException('Asset service case not found');
    return rows[0];
  }
  private assertRevision(row: any, expected: number) {
    if (Number(row.aggregate_revision) !== expected)
      throw new ConflictException({
        message: 'Asset service case changed',
        code: 'STALE_REVISION',
        current_revision: Number(row.aggregate_revision),
      });
    if (row.workflow_status === 'CLOSED')
      throw new ConflictException(
        'Closed cases are immutable; create a superseding case',
      );
  }
  private async idempotent<T>(
    m: EntityManager,
    actor: AssetServiceActor,
    key: string,
    input: unknown,
    work: () => Promise<T>,
  ): Promise<T> {
    if (!key?.trim()) throw new BadRequestException('Idempotency-Key required');
    const tenantId = this.tenant(actor),
      requestHash = serviceHash(input);
    await m.query(`SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))`, [
      tenantId,
      `${actor.user_id}:${key}`,
    ]);
    const prior = await m.query(
      `SELECT request_hash,response_payload FROM svc_idempotency WHERE tenant_id=$1 AND actor_id=$2 AND idempotency_key=$3 FOR UPDATE`,
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
        `INSERT INTO svc_idempotency(tenant_id,actor_id,idempotency_key,request_hash) VALUES($1,$2,$3,$4)`,
        [tenantId, actor.user_id, key, requestHash],
      );
    const result = await work();
    await m.query(
      `UPDATE svc_idempotency SET response_payload=$4::jsonb WHERE tenant_id=$1 AND actor_id=$2 AND idempotency_key=$3`,
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
      `SELECT event_hash FROM svc_audit_events WHERE service_case_id=$1 ORDER BY created_at DESC,audit_event_id DESC LIMIT 1`,
      [row.service_case_id],
    );
    const previousHash = last[0]?.event_hash ?? null,
      eventHash = serviceHash({
        service_case_id: row.service_case_id,
        entityType,
        entityId,
        eventType,
        actorId,
        previous,
        next,
        previousHash,
      });
    await m.query(
      `INSERT INTO svc_audit_events(tenant_id,service_case_id,entity_type,entity_id,event_type,actor_id,previous_value,new_value,previous_hash,event_hash)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10)`,
      [
        row.tenant_id,
        row.service_case_id,
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
    type: string,
    payload: unknown,
  ) {
    const eventId = randomUUID(),
      occurredAt = new Date().toISOString(),
      revision = Number(row.aggregate_revision) + 1,
      sequence = Number(row.next_event_sequence),
      envelope = {
        event_id: eventId,
        event_type: type,
        event_version: 1,
        aggregate_id: row.service_case_id,
        aggregate_revision: revision,
        aggregate_sequence: sequence,
        tenant_id: row.tenant_id,
        service_case_id: row.service_case_id,
        inventory_record_id: row.inventory_record_id,
        occurred_at: occurredAt,
        payload,
      };
    await m.query(
      `INSERT INTO svc_outbox_events(event_id,tenant_id,aggregate_id,aggregate_revision,aggregate_sequence,event_type,occurred_at,payload,payload_hash)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
      [
        eventId,
        row.tenant_id,
        row.service_case_id,
        revision,
        sequence,
        type,
        occurredAt,
        JSON.stringify(envelope),
        serviceHash(envelope),
      ],
    );
    row.aggregate_revision = revision;
    row.next_event_sequence = sequence + 1;
    await m.query(
      `UPDATE svc_cases SET aggregate_revision=$2,next_event_sequence=$3,updated_at=NOW() WHERE service_case_id=$1`,
      [row.service_case_id, revision, sequence + 1],
    );
    return envelope;
  }

  async dashboard(actor: AssetServiceActor) {
    await this.require(actor, 'ASSET_SERVICE_VIEW');
    return (
      await this.db.query(
        `SELECT COUNT(*)::int total,
          COUNT(*) FILTER(WHERE workflow_status IN('SUBMITTED','TRIAGE'))::int awaiting_triage,
          COUNT(*) FILTER(WHERE workflow_status IN('SCHEDULED','IN_PROGRESS','AWAITING_PARTS','AWAITING_VENDOR','AWAITING_REVERIFICATION'))::int active,
          COUNT(*) FILTER(WHERE coverage_status IN('IN_WARRANTY','AMC_COVERED'))::int covered,
          COUNT(*) FILTER(WHERE final_outcome IN('IRREPARABLE','UNSAFE'))::int retirement_referrals
         FROM svc_cases WHERE tenant_id=$1`,
        [this.tenant(actor)],
      )
    )[0];
  }
  async queue(actor: AssetServiceActor) {
    await this.require(actor, 'ASSET_SERVICE_VIEW');
    return this.db.query(
      `SELECT c.*,r.university_asset_id,r.manufacturer_serial,pm.product_name,pm.category,pm.model_number
       FROM svc_cases c JOIN inv_records r ON r.inventory_record_id=c.inventory_record_id
       JOIN inv_product_models pm ON pm.product_model_id=r.product_model_id
       WHERE c.tenant_id=$1 AND EXISTS(SELECT 1 FROM acq_access_grants g WHERE g.tenant_id=c.tenant_id AND g.capability='ASSET_SERVICE_VIEW'
       AND(g.principal_user_id=$2 OR lower(g.principal_role)=ANY($3::text[])) AND(g.scope_type='TENANT' OR(g.scope_type='DEPARTMENT' AND g.scope_reference=r.owner_department_id::text)))
       ORDER BY c.updated_at DESC LIMIT 250`,
      [this.tenant(actor), actor.user_id, this.roles(actor)],
    );
  }
  async providers(actor: AssetServiceActor) {
    await this.require(actor, 'ASSET_SERVICE_VIEW');
    return this.db.query(
      `SELECT * FROM svc_providers WHERE tenant_id=$1 ORDER BY display_name`,
      [this.tenant(actor)],
    );
  }
  async createProvider(
    actor: AssetServiceActor,
    key: string,
    input: {
      provider_type: 'INTERNAL' | 'OEM' | 'WARRANTY' | 'EMPANELLED_EXTERNAL';
      display_name: string;
      vendor_id?: string;
      internal_team_reference?: string;
      authorization_reference?: string;
      qualification_requirements?: string[];
      effective_to?: string;
    },
  ) {
    await this.require(actor, 'ASSET_SERVICE_PROVIDER_ADMIN');
    if (!input.display_name?.trim())
      throw new BadRequestException('Provider name required');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const id = randomUUID();
        await m.query(
          `INSERT INTO svc_providers(service_provider_id,tenant_id,provider_type,display_name,vendor_id,internal_team_reference,authorization_reference,qualification_requirements,effective_to,created_by)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`,
          [
            id,
            this.tenant(actor),
            input.provider_type,
            input.display_name.trim(),
            input.vendor_id ?? null,
            input.internal_team_reference ?? null,
            input.authorization_reference ?? null,
            JSON.stringify(input.qualification_requirements ?? []),
            input.effective_to ?? null,
            actor.user_id,
          ],
        );
        return { service_provider_id: id, status: 'ACTIVE' };
      }),
    );
  }
  async createWarrantyEntitlement(
    actor: AssetServiceActor,
    key: string,
    input: {
      inventory_record_id: string;
      source_type: string;
      source_reference: Record<string, unknown>;
      coverage_start?: string;
      coverage_end?: string;
      covered_failures?: string[];
      exclusions?: string[];
      permitted_work?: string[];
      deductible?: number;
      currency?: string;
      evidence_hash: string;
    },
  ) {
    await this.require(actor, 'ASSET_SERVICE_WARRANTY_REVIEW');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const record = (
          await m.query(
            `SELECT 1 FROM inv_records WHERE inventory_record_id=$1 AND tenant_id=$2 AND record_type='ITEM'`,
            [input.inventory_record_id, this.tenant(actor)],
          )
        )[0];
        if (!record) throw new NotFoundException('Inventory ITEM not found');
        await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
          `svc-warranty:${this.tenant(actor)}:${input.inventory_record_id}:${input.source_type}`,
        ]);
        const prior = (
            await m.query(
              `SELECT COALESCE(MAX(revision),0)::int revision FROM svc_warranty_entitlements WHERE inventory_record_id=$1 AND source_type=$2`,
              [input.inventory_record_id, input.source_type],
            )
          )[0],
          id = randomUUID(),
          revision = Number(prior.revision) + 1;
        await m.query(
          `UPDATE svc_warranty_entitlements SET status='SUPERSEDED' WHERE inventory_record_id=$1 AND source_type=$2 AND status='ACTIVE'`,
          [input.inventory_record_id, input.source_type],
        );
        await m.query(
          `INSERT INTO svc_warranty_entitlements(warranty_entitlement_id,tenant_id,inventory_record_id,source_type,source_reference,coverage_start,coverage_end,covered_failures,exclusions,permitted_work,deductible,currency,evidence_hash,revision,created_by) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12,$13,$14,$15)`,
          [
            id,
            this.tenant(actor),
            input.inventory_record_id,
            input.source_type,
            JSON.stringify(input.source_reference),
            input.coverage_start ?? null,
            input.coverage_end ?? null,
            JSON.stringify(input.covered_failures ?? []),
            JSON.stringify(input.exclusions ?? []),
            JSON.stringify(input.permitted_work ?? []),
            Number(input.deductible ?? 0),
            input.currency ?? null,
            input.evidence_hash,
            revision,
            actor.user_id,
          ],
        );
        return { warranty_entitlement_id: id, revision };
      }),
    );
  }
  async createServiceContract(
    actor: AssetServiceActor,
    key: string,
    input: {
      service_provider_id: string;
      contract_type:
        | 'AMC'
        | 'CMC'
        | 'WARRANTY_EXTENSION'
        | 'CALIBRATION'
        | 'INSPECTION';
      contract_reference: string;
      effective_from: string;
      effective_to: string;
      covered_product_models?: string[];
      covered_assets?: string[];
      coverage_terms: Record<string, unknown>;
      evidence_hash: string;
    },
  ) {
    await this.require(actor, 'ASSET_SERVICE_PROVIDER_ADMIN');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const provider = (
          await m.query(
            `SELECT 1 FROM svc_providers WHERE service_provider_id=$1 AND tenant_id=$2 AND status='ACTIVE'`,
            [input.service_provider_id, this.tenant(actor)],
          )
        )[0];
        if (!provider)
          throw new NotFoundException('Approved provider not found');
        const id = randomUUID();
        await m.query(
          `INSERT INTO svc_contracts(service_contract_id,tenant_id,service_provider_id,contract_type,contract_reference,effective_from,effective_to,covered_product_models,covered_assets,coverage_terms,evidence_hash,status,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11,'ACTIVE',$12)`,
          [
            id,
            this.tenant(actor),
            input.service_provider_id,
            input.contract_type,
            input.contract_reference,
            input.effective_from,
            input.effective_to,
            JSON.stringify(input.covered_product_models ?? []),
            JSON.stringify(input.covered_assets ?? []),
            JSON.stringify(input.coverage_terms),
            input.evidence_hash,
            actor.user_id,
          ],
        );
        return { service_contract_id: id, status: 'ACTIVE' };
      }),
    );
  }
  async publishPreventivePolicy(
    actor: AssetServiceActor,
    key: string,
    input: {
      category?: string;
      product_model_id?: string;
      interval_type: 'CALENDAR' | 'METER' | 'BOTH';
      interval_days?: number;
      meter_type?: string;
      meter_interval?: number;
      warning_days?: number;
      overdue_hold_required?: boolean;
      required_tasks?: unknown[];
      required_qualifications?: unknown[];
      approved_provider_types?: string[];
      required_evidence?: unknown[];
      acceptance_tests?: unknown[];
      reverification_mode?: 'NOT_REQUIRED' | 'RISK_BASED' | 'ALWAYS';
    },
  ) {
    await this.require(actor, 'ASSET_SERVICE_POLICY_ADMIN');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const category = input.category ?? '*',
          policyLock = `svc-preventive:${this.tenant(actor)}:${category}:${input.product_model_id ?? '*'}`;
        await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
          policyLock,
        ]);
        const prior = (
            await m.query(
              `SELECT COALESCE(MAX(policy_version),0)::int version FROM svc_preventive_policies WHERE tenant_id=$1 AND category=$2 AND product_model_id IS NOT DISTINCT FROM $3::uuid`,
              [this.tenant(actor), category, input.product_model_id ?? null],
            )
          )[0],
          version = Number(prior.version) + 1,
          id = randomUUID();
        await m.query(
          `UPDATE svc_preventive_policies SET status='SUPERSEDED',effective_to=NOW() WHERE tenant_id=$1 AND category=$2 AND product_model_id IS NOT DISTINCT FROM $3::uuid AND status='PUBLISHED'`,
          [this.tenant(actor), category, input.product_model_id ?? null],
        );
        await m.query(
          `INSERT INTO svc_preventive_policies(preventive_policy_id,tenant_id,category,product_model_id,policy_version,status,interval_type,interval_days,meter_type,meter_interval,warning_days,overdue_hold_required,required_tasks,required_qualifications,approved_provider_types,required_evidence,acceptance_tests,reverification_mode,published_by,published_at) VALUES($1,$2,$3,$4,$5,'PUBLISHED',$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14::jsonb,$15::jsonb,$16::jsonb,$17,$18,NOW())`,
          [
            id,
            this.tenant(actor),
            category,
            input.product_model_id ?? null,
            version,
            input.interval_type,
            input.interval_days ?? null,
            input.meter_type ?? null,
            input.meter_interval ?? null,
            input.warning_days ?? 14,
            input.overdue_hold_required ?? false,
            JSON.stringify(input.required_tasks ?? []),
            JSON.stringify(input.required_qualifications ?? []),
            JSON.stringify(
              input.approved_provider_types ?? [
                'INTERNAL',
                'OEM',
                'WARRANTY',
                'EMPANELLED_EXTERNAL',
              ],
            ),
            JSON.stringify(input.required_evidence ?? []),
            JSON.stringify(input.acceptance_tests ?? []),
            input.reverification_mode ?? 'RISK_BASED',
            actor.user_id,
          ],
        );
        return {
          preventive_policy_id: id,
          policy_version: version,
          status: 'PUBLISHED',
        };
      }),
    );
  }
  async schedulePreventive(
    actor: AssetServiceActor,
    key: string,
    input: {
      inventory_record_id: string;
      preventive_policy_id: string;
      due_at: string;
      meter_due?: number;
    },
  ) {
    await this.require(actor, 'ASSET_SERVICE_POLICY_ADMIN');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const valid = (
          await m.query(
            `SELECT 1 FROM inv_records r JOIN svc_preventive_policies p ON p.preventive_policy_id=$2 AND p.tenant_id=r.tenant_id AND p.status='PUBLISHED' WHERE r.inventory_record_id=$1 AND r.tenant_id=$3 AND r.record_type='ITEM'`,
            [
              input.inventory_record_id,
              input.preventive_policy_id,
              this.tenant(actor),
            ],
          )
        )[0];
        if (!valid)
          throw new ConflictException('Published policy and ITEM are required');
        const id = randomUUID();
        await m.query(
          `INSERT INTO svc_preventive_schedules(preventive_schedule_id,tenant_id,inventory_record_id,preventive_policy_id,due_at,original_due_at,meter_due) VALUES($1,$2,$3,$4,$5,$5,$6)`,
          [
            id,
            this.tenant(actor),
            input.inventory_record_id,
            input.preventive_policy_id,
            input.due_at,
            input.meter_due ?? null,
          ],
        );
        return { preventive_schedule_id: id, status: 'PLANNED' };
      }),
    );
  }
  async detail(actor: AssetServiceActor, id: string) {
    const row = await this.scopedCase(actor, id);
    const [
      coverage,
      custody,
      diagnoses,
      estimates,
      tasks,
      parts,
      evidence,
      reverification,
      decisions,
      finances,
      audit,
    ] = await Promise.all([
      this.db.query(
        `SELECT * FROM svc_coverage_snapshots WHERE service_case_id=$1 ORDER BY decided_at`,
        [id],
      ),
      this.db.query(
        `SELECT * FROM svc_custody_history WHERE service_case_id=$1 ORDER BY occurred_at`,
        [id],
      ),
      this.db.query(
        `SELECT * FROM svc_diagnoses WHERE service_case_id=$1 ORDER BY revision`,
        [id],
      ),
      this.db.query(
        `SELECT * FROM svc_estimate_revisions WHERE service_case_id=$1 ORDER BY revision`,
        [id],
      ),
      this.db.query(
        `SELECT * FROM svc_tasks WHERE service_case_id=$1 ORDER BY created_at`,
        [id],
      ),
      this.db.query(
        `SELECT * FROM svc_parts_usage WHERE service_case_id=$1 ORDER BY created_at`,
        [id],
      ),
      this.db.query(
        `SELECT evidence_id,evidence_type,content_hash,mime_type,byte_size,metadata,captured_by,captured_at FROM svc_evidence WHERE service_case_id=$1 ORDER BY captured_at`,
        [id],
      ),
      this.db.query(
        `SELECT * FROM svc_reverification_projections WHERE service_case_id=$1 ORDER BY updated_at`,
        [id],
      ),
      this.db.query(
        `SELECT * FROM svc_acceptance_decisions WHERE service_case_id=$1 ORDER BY decided_at`,
        [id],
      ),
      this.db.query(
        `SELECT * FROM svc_financial_projections WHERE service_case_id=$1 ORDER BY occurred_at`,
        [id],
      ),
      this.db.query(
        `SELECT * FROM svc_audit_events WHERE service_case_id=$1 ORDER BY created_at`,
        [id],
      ),
    ]);
    return {
      ...row,
      coverage,
      custody,
      diagnoses,
      estimates,
      tasks,
      parts,
      evidence,
      reverification,
      acceptance_decisions: decisions,
      financial_projections: finances,
      audit,
    };
  }

  async create(
    actor: AssetServiceActor,
    key: string,
    input: CreateServiceCaseInput,
  ) {
    await this.require(actor, 'ASSET_SERVICE_REQUEST');
    if (!input.title?.trim() || !input.problem_description?.trim())
      throw new BadRequestException(
        'Title and problem description are required',
      );
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const records = await m.query(
          `SELECT r.*,pm.product_name FROM inv_records r JOIN inv_product_models pm ON pm.product_model_id=r.product_model_id
           WHERE r.inventory_record_id=$1 AND r.tenant_id=$2 AND r.record_type='ITEM' AND r.record_status='ACTIVE' FOR UPDATE`,
          [input.inventory_record_id, this.tenant(actor)],
        );
        const record = records[0];
        if (!record)
          throw new NotFoundException('Active ITEM inventory record not found');
        if (input.module7_case_id) {
          const referral = await m.query(
            `SELECT c.*,a.inventory_record_id FROM ret_cases c JOIN ret_case_allocations a ON a.return_case_id=c.return_case_id
             WHERE c.return_case_id=$1 AND c.tenant_id=$2 AND c.disposition='REPAIR_REFERRAL' AND a.inventory_record_id=$3`,
            [
              input.module7_case_id,
              record.tenant_id,
              record.inventory_record_id,
            ],
          );
          if (!referral[0])
            throw new ConflictException(
              'Module 7 repair referral does not match this asset',
            );
        }
        const id = randomUUID(),
          rootId = id,
          number = `SVC-${new Date().getUTCFullYear()}-${id.slice(0, 8).toUpperCase()}`;
        await m.query(
          `INSERT INTO svc_cases(service_case_id,tenant_id,case_number,inventory_record_id,subject_id,case_type,title,problem_description,severity,reported_by,module7_case_id,root_service_case_id)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            id,
            record.tenant_id,
            number,
            record.inventory_record_id,
            record.subject_id,
            input.case_type,
            input.title.trim(),
            input.problem_description.trim(),
            input.severity ?? 'NORMAL',
            actor.user_id,
            input.module7_case_id ?? null,
            rootId,
          ],
        );
        if (input.component)
          await m.query(
            `INSERT INTO svc_component_targets(tenant_id,service_case_id,parent_inventory_record_id,component_inventory_record_id,component_name,manufacturer_serial,component_reference)
             VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,
            [
              record.tenant_id,
              id,
              record.inventory_record_id,
              input.component.component_inventory_record_id ?? null,
              input.component.component_name,
              input.component.manufacturer_serial ?? null,
              JSON.stringify(input.component.component_reference ?? {}),
            ],
          );
        const row = await this.locked(m, id, record.tenant_id);
        await this.audit(
          m,
          row,
          'SERVICE_CASE',
          id,
          'ASSET_SERVICE_CASE_CREATED',
          actor.user_id,
          null,
          input,
        );
        return {
          service_case_id: id,
          case_number: number,
          workflow_status: 'DRAFT',
          aggregate_revision: 1,
        };
      }),
    );
  }

  async submit(
    actor: AssetServiceActor,
    id: string,
    expected: number,
    key: string,
  ) {
    await this.scopedCase(actor, id, 'ASSET_SERVICE_REQUEST');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, { id, expected }, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.assertRevision(row, expected);
        if (row.workflow_status !== 'DRAFT')
          throw new ConflictException('Only draft cases can be submitted');
        await this.inventory.placeServiceHold(
          m,
          actor,
          id,
          row.inventory_record_id,
          row.problem_description,
        );
        await m.query(
          `UPDATE svc_cases SET workflow_status='SUBMITTED',asset_availability='OUT_OF_SERVICE',previous_lifecycle_status=(SELECT previous_lifecycle_status FROM svc_asset_holds WHERE service_case_id=$1 AND status='ACTIVE') WHERE service_case_id=$1`,
          [id],
        );
        await m.query(
          `INSERT INTO proc_repairs(repair_id,proc_case_id,receipt_line_id,tenant_id,quantity,status,notes,requested_by,managed_by,module8_service_case_id)
           SELECT gen_random_uuid(),b.proc_case_id,b.receipt_line_id,r.tenant_id,1,'REQUESTED',$2,$3,'MODULE8',$1
           FROM inv_records r JOIN inv_procurement_batches b ON b.procurement_batch_id=r.procurement_batch_id
           WHERE r.inventory_record_id=$4 ON CONFLICT DO NOTHING`,
          [id, row.problem_description, actor.user_id, row.inventory_record_id],
        );
        await m.query(
          `INSERT INTO asset_maintenance_records(tenant_id,asset_id,issue_description,status,module8_service_case_id,managed_by)
           SELECT a.tenant_id,a.asset_id,$2,'OPEN',$1,'MODULE8' FROM university_assets a WHERE a.module5_source_id=$3
           ON CONFLICT DO NOTHING`,
          [id, row.problem_description, row.inventory_record_id],
        );
        await this.audit(
          m,
          row,
          'SERVICE_CASE',
          id,
          'ASSET_SERVICE_CASE_SUBMITTED',
          actor.user_id,
          { workflow_status: 'DRAFT' },
          { workflow_status: 'SUBMITTED' },
        );
        const event = await this.emit(m, row, 'AssetServiceCaseSubmitted.v1', {
          case_type: row.case_type,
          module7_case_id: row.module7_case_id,
        });
        await this.emit(m, row, 'AssetServiceHoldPlaced.v1', {
          inventory_record_id: row.inventory_record_id,
        });
        return {
          workflow_status: 'SUBMITTED',
          event,
          aggregate_revision: row.aggregate_revision,
        };
      }),
    );
  }

  async triage(
    actor: AssetServiceActor,
    id: string,
    expected: number,
    key: string,
    input: { approved: boolean; reason: string },
  ) {
    await this.scopedCase(actor, id, 'ASSET_SERVICE_TRIAGE');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.assertRevision(row, expected);
        if (!['SUBMITTED', 'TRIAGE'].includes(row.workflow_status))
          throw new ConflictException('Case is not awaiting triage');
        if (row.reported_by === actor.user_id)
          throw new ForbiddenException('Reporter cannot approve triage');
        const next = input.approved ? 'APPROVED' : 'REJECTED';
        await m.query(
          `UPDATE svc_cases SET workflow_status=$2,triage_approved_by=$3 WHERE service_case_id=$1`,
          [id, next, actor.user_id],
        );
        if (!input.approved) {
          await this.inventory.releaseServiceHold(
            m,
            actor,
            id,
            row.inventory_record_id,
            input.reason,
          );
          await m.query(
            `UPDATE svc_cases SET asset_availability='RETURNED_TO_CUSTODIAN' WHERE service_case_id=$1`,
            [id],
          );
          await this.emit(m, row, 'AssetServiceHoldReleased.v1', {
            reason: input.reason,
          });
        }
        await this.audit(
          m,
          row,
          'TRIAGE',
          id,
          'ASSET_SERVICE_TRIAGE_DECIDED',
          actor.user_id,
          null,
          { approved: input.approved, reason: input.reason },
        );
        await this.emit(
          m,
          row,
          input.approved
            ? 'AssetServiceTriageApproved.v1'
            : 'AssetServiceTriageRejected.v1',
          { reason: input.reason },
        );
        return {
          workflow_status: next,
          aggregate_revision: row.aggregate_revision,
        };
      }),
    );
  }

  async decideCoverage(
    actor: AssetServiceActor,
    id: string,
    expected: number,
    key: string,
    input: CoverageInput,
  ) {
    await this.scopedCase(actor, id, 'ASSET_SERVICE_WARRANTY_REVIEW');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.assertRevision(row, expected);
        if (
          input.coverage_status === 'EXCEPTION_REQUIRED' &&
          !input.exception_approved
        )
          throw new ConflictException(
            'Independent warranty exception approval is required',
          );
        if (input.exception_approved) {
          if (!input.exception_approver_id)
            throw new ConflictException(
              'Independent warranty exception approver is required',
            );
          if (input.exception_approver_id === actor.user_id)
            throw new ForbiddenException(
              'Warranty reviewer cannot approve their own exception',
            );
          const approver = await m.query(
            `SELECT 1 FROM users u WHERE u.user_id=$1 AND u.tenant_id=$2 AND EXISTS(
             SELECT 1 FROM acq_access_grants g WHERE g.tenant_id=$2 AND g.capability='ASSET_SERVICE_WARRANTY_EXCEPTION'
             AND(g.principal_user_id=u.user_id OR lower(g.principal_role)=ANY(SELECT lower(r.role_name) FROM user_roles ur JOIN roles r ON r.role_id=ur.role_id WHERE ur.user_id=u.user_id)))`,
            [input.exception_approver_id, row.tenant_id],
          );
          if (!approver[0])
            throw new ForbiddenException(
              'Warranty exception approver lacks authority',
            );
        }
        const snapshot = {
          source_precedence: input.source_precedence,
          coverage_payload: input.coverage_payload,
          policy_version: input.policy_version,
        };
        const snapshotHash = serviceHash(snapshot),
          snapshotId = randomUUID();
        await m.query(
          `INSERT INTO svc_coverage_snapshots(coverage_snapshot_id,tenant_id,service_case_id,coverage_status,source_precedence,coverage_payload,policy_version,reviewer_id,exception_approver_id,snapshot_hash)
         VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10)`,
          [
            snapshotId,
            row.tenant_id,
            id,
            input.coverage_status,
            JSON.stringify(input.source_precedence),
            JSON.stringify(input.coverage_payload),
            input.policy_version,
            actor.user_id,
            input.exception_approved ? input.exception_approver_id : null,
            snapshotHash,
          ],
        );
        await m.query(
          `UPDATE svc_cases SET coverage_status=$2 WHERE service_case_id=$1`,
          [id, input.coverage_status],
        );
        await this.audit(
          m,
          row,
          'COVERAGE',
          snapshotId,
          'WARRANTY_ELIGIBILITY_DECIDED',
          actor.user_id,
          null,
          {
            coverage_status: input.coverage_status,
            snapshot_hash: snapshotHash,
          },
        );
        const event = await this.emit(m, row, 'WarrantyEligibilityDecided.v1', {
          coverage_status: input.coverage_status,
          snapshot_hash: snapshotHash,
        });
        return {
          coverage_status: input.coverage_status,
          snapshot_hash: snapshotHash,
          event,
          aggregate_revision: row.aggregate_revision,
        };
      }),
    );
  }

  async assign(
    actor: AssetServiceActor,
    id: string,
    expected: number,
    key: string,
    input: {
      technician_id?: string;
      service_provider_id?: string;
      scheduled_for?: string;
    },
  ) {
    await this.scopedCase(actor, id, 'ASSET_SERVICE_ASSIGN');
    if (!input.technician_id && !input.service_provider_id)
      throw new BadRequestException('Technician or provider is required');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.assertRevision(row, expected);
        if (!['APPROVED', 'SCHEDULED', 'ON_HOLD'].includes(row.workflow_status))
          throw new ConflictException('Case cannot be assigned now');
        if (input.service_provider_id) {
          const provider = await m.query(
            `SELECT 1 FROM svc_providers WHERE service_provider_id=$1 AND tenant_id=$2 AND status='ACTIVE'`,
            [input.service_provider_id, row.tenant_id],
          );
          if (!provider[0])
            throw new NotFoundException('Approved active provider not found');
        }
        await m.query(
          `UPDATE svc_cases SET assigned_technician_id=$2,service_provider_id=$3,scheduled_for=$4,workflow_status='SCHEDULED' WHERE service_case_id=$1`,
          [
            id,
            input.technician_id ?? null,
            input.service_provider_id ?? null,
            input.scheduled_for ?? new Date().toISOString(),
          ],
        );
        await this.audit(
          m,
          row,
          'ASSIGNMENT',
          id,
          'ASSET_SERVICE_ASSIGNED',
          actor.user_id,
          null,
          input,
        );
        await this.emit(m, row, 'AssetServiceScheduled.v1', input);
        return {
          workflow_status: 'SCHEDULED',
          aggregate_revision: row.aggregate_revision,
        };
      }),
    );
  }

  async start(
    actor: AssetServiceActor,
    id: string,
    expected: number,
    key: string,
    input: {
      custody: 'INTERNAL_SERVICE_CUSTODY' | 'VENDOR_SERVICE_CUSTODY';
      service_location?: string;
      shipment_reference?: string;
    },
  ) {
    await this.scopedCase(actor, id, 'ASSET_SERVICE_EXECUTE');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.assertRevision(row, expected);
        if (row.workflow_status !== 'SCHEDULED')
          throw new ConflictException('Only scheduled service can start');
        if (row.coverage_status === 'CHARGEABLE')
          await this.assertPaidWorkAuthorized(m, row);
        await this.inventory.transferServiceCustody(
          m,
          actor,
          id,
          row.inventory_record_id,
          input.custody,
          row.service_provider_id,
          input.service_location,
          input.shipment_reference,
        );
        await m.query(
          `UPDATE svc_cases SET workflow_status='IN_PROGRESS',asset_availability=$2,started_at=NOW() WHERE service_case_id=$1`,
          [id, input.custody],
        );
        await m.query(
          `UPDATE proc_repairs SET status='IN_REPAIR',updated_at=NOW() WHERE module8_service_case_id=$1`,
          [id],
        );
        await m.query(
          `UPDATE asset_maintenance_records SET status='IN_PROGRESS' WHERE module8_service_case_id=$1`,
          [id],
        );
        await this.audit(
          m,
          row,
          'EXECUTION',
          id,
          'ASSET_SERVICE_WORK_STARTED',
          actor.user_id,
          null,
          input,
        );
        await this.emit(m, row, 'AssetServiceCustodyTransferred.v1', input);
        const event = await this.emit(
          m,
          row,
          'AssetServiceWorkStarted.v1',
          input,
        );
        return {
          workflow_status: 'IN_PROGRESS',
          asset_availability: input.custody,
          event,
          aggregate_revision: row.aggregate_revision,
        };
      }),
    );
  }

  private async assertPaidWorkAuthorized(m: EntityManager, row: any) {
    if (!row.procurement_case_id)
      throw new ConflictException(
        'Chargeable work requires a linked Module 2 procurement case',
      );
    const issued = await m.query(
      `SELECT 1 FROM proc_orders WHERE proc_case_id=$1 AND status IN('ISSUED','PARTIALLY_RECEIVED','RECEIVED','CLOSED') LIMIT 1`,
      [row.procurement_case_id],
    );
    if (!issued[0])
      throw new ConflictException(
        'External paid work cannot start before Module 2 issues an order',
      );
  }

  async createAcquisitionDraft(
    actor: AssetServiceActor,
    id: string,
    expected: number,
    key: string,
    input: {
      funding_source_type: CreateAcquisitionInput['funding_source_type'];
      funding_source_id: string;
      required_by_date: string;
      priority?: CreateAcquisitionInput['priority'];
      estimated_amount: number;
      currency?: string;
    },
  ) {
    await this.scopedCase(actor, id, 'ASSET_SERVICE_ESTIMATE_APPROVE');
    if (!(Number(input.estimated_amount) >= 0))
      throw new BadRequestException('Estimated amount is required');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.assertRevision(row, expected);
        if (row.acquisition_id)
          return { acquisition_id: row.acquisition_id, status: 'EXISTING' };
        const asset = (
          await m.query(
            `SELECT r.owner_department_id,r.university_asset_id,pm.product_name,pm.category,pm.model_number FROM inv_records r JOIN inv_product_models pm ON pm.product_model_id=r.product_model_id WHERE r.inventory_record_id=$1`,
            [row.inventory_record_id],
          )
        )[0];
        const draft = await this.acquisitions.createDraft(
          actor,
          {
            requesting_department_id:
              asset.owner_department_id ?? actor.department_id ?? undefined,
            intended_department_id:
              asset.owner_department_id ?? actor.department_id ?? undefined,
            intended_use_case: `Service for ${asset.university_asset_id}: ${row.title}`,
            required_by_date: input.required_by_date,
            priority: input.priority ?? 'NORMAL',
            funding_source_type: input.funding_source_type,
            funding_source_id: input.funding_source_id,
            default_item_classification: 'SERVICE',
            installation_or_service_required: true,
            special_procurement_requirements: `Module 8 service case ${row.case_number}. No work may start until Module 2 issues the order.`,
            currency: input.currency ?? 'INR',
            source: 'ASSET_SERVICE',
            external_reference: id,
            lines: [
              {
                acquisition_layout: 'GENERAL',
                product_name: `Asset service: ${asset.product_name}`,
                category: 'Asset Service',
                quantity: 1,
                unit: 'service',
                model_number: asset.model_number,
                technical_specifications: {
                  inventory_record_id: row.inventory_record_id,
                  university_asset_id: asset.university_asset_id,
                  service_case_id: id,
                },
                intended_use: `Repair/service for ${asset.university_asset_id}`,
                estimated_unit_price: Number(input.estimated_amount),
                item_classification: 'SERVICE',
                special_procurement_requirements: `Linked Module 8 case ${row.case_number}`,
              },
            ],
          },
          `asset-service:${id}`,
          m,
        );
        await m.query(
          `UPDATE svc_cases SET acquisition_id=$2 WHERE service_case_id=$1`,
          [id, draft.acquisition_id],
        );
        await this.audit(
          m,
          row,
          'ACQUISITION_LINK',
          draft.acquisition_id,
          'ASSET_SERVICE_ACQUISITION_DRAFT_CREATED',
          actor.user_id,
          null,
          { source: 'ASSET_SERVICE', external_reference: id },
        );
        await this.emit(m, row, 'AssetServiceAcquisitionDraftCreated.v1', {
          acquisition_id: draft.acquisition_id,
        });
        return {
          acquisition_id: draft.acquisition_id,
          status: 'DRAFT',
          aggregate_revision: row.aggregate_revision,
        };
      }),
    );
  }

  async linkProcurement(
    actor: AssetServiceActor,
    id: string,
    expected: number,
    key: string,
    procurementCaseId: string,
  ) {
    await this.scopedCase(actor, id, 'ASSET_SERVICE_ESTIMATE_APPROVE');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, { procurementCaseId }, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.assertRevision(row, expected);
        const proc = await m.query(
          `SELECT 1 FROM proc_cases WHERE proc_case_id=$1 AND tenant_id=$2`,
          [procurementCaseId, row.tenant_id],
        );
        if (!proc[0]) throw new NotFoundException('Procurement case not found');
        await m.query(
          `UPDATE svc_cases SET procurement_case_id=$2 WHERE service_case_id=$1`,
          [id, procurementCaseId],
        );
        await this.audit(
          m,
          row,
          'PROCUREMENT_LINK',
          procurementCaseId,
          'ASSET_SERVICE_PROCUREMENT_LINKED',
          actor.user_id,
          null,
          { source: 'ASSET_SERVICE', external_reference: id },
        );
        await this.emit(m, row, 'AssetServiceProcurementLinked.v1', {
          procurement_case_id: procurementCaseId,
        });
        return {
          procurement_case_id: procurementCaseId,
          aggregate_revision: row.aggregate_revision,
        };
      }),
    );
  }

  async diagnose(
    actor: AssetServiceActor,
    id: string,
    expected: number,
    key: string,
    input: DiagnosisInput,
  ) {
    await this.scopedCase(actor, id, 'ASSET_SERVICE_EXECUTE');
    if (!input.proposed_work?.trim())
      throw new BadRequestException('Proposed work is required');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.assertRevision(row, expected);
        if (
          !['IN_PROGRESS', 'AWAITING_PARTS', 'AWAITING_VENDOR'].includes(
            row.workflow_status,
          )
        )
          throw new ConflictException('Diagnosis requires active service');
        const prior = await m.query(
          `SELECT diagnosis_id,revision FROM svc_diagnoses WHERE service_case_id=$1 ORDER BY revision DESC LIMIT 1`,
          [id],
        );
        const revision = Number(prior[0]?.revision ?? 0) + 1,
          diagnosisId = randomUUID(),
          scopeHash = serviceHash(input);
        await m.query(
          `INSERT INTO svc_diagnoses(diagnosis_id,tenant_id,service_case_id,revision,fault_codes,root_cause,safety_impact,proposed_work,scope_hash,diagnosed_by,supersedes_diagnosis_id)
         VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11)`,
          [
            diagnosisId,
            row.tenant_id,
            id,
            revision,
            JSON.stringify(input.fault_codes ?? []),
            input.root_cause ?? null,
            input.safety_impact ?? null,
            input.proposed_work,
            scopeHash,
            actor.user_id,
            prior[0]?.diagnosis_id ?? null,
          ],
        );
        if (input.requires_reverification)
          await this.createReverification(
            m,
            row,
            actor.user_id,
            input.reverification_reasons ?? ['POLICY_REQUIRED'],
          );
        await this.audit(
          m,
          row,
          'DIAGNOSIS',
          diagnosisId,
          'ASSET_SERVICE_DIAGNOSIS_RECORDED',
          actor.user_id,
          null,
          { revision, scope_hash: scopeHash },
        );
        await this.emit(m, row, 'AssetServiceDiagnosisRecorded.v1', {
          diagnosis_id: diagnosisId,
          revision,
          scope_hash: scopeHash,
        });
        return {
          diagnosis_id: diagnosisId,
          revision,
          scope_hash: scopeHash,
          aggregate_revision: row.aggregate_revision,
        };
      }),
    );
  }

  private async createReverification(
    m: EntityManager,
    row: any,
    actorId: string,
    reasons: string[],
  ) {
    const existing = await m.query(
      `SELECT 1 FROM svc_reverification_projections WHERE service_case_id=$1 AND status IN('REQUESTED','IN_PROGRESS')`,
      [row.service_case_id],
    );
    if (existing[0]) return;
    const requestEvent = await this.emit(
      m,
      row,
      'AssetReverificationRequested.v1',
      {
        reasons,
        subject_id: row.subject_id,
        inventory_record_id: row.inventory_record_id,
      },
    );
    await m.query(
      `INSERT INTO svc_reverification_projections(tenant_id,service_case_id,request_event_id,required_reason,status) VALUES($1,$2,$3,$4::jsonb,'REQUESTED')`,
      [
        row.tenant_id,
        row.service_case_id,
        requestEvent.event_id,
        JSON.stringify(reasons),
      ],
    );
    await m.query(
      `UPDATE svc_cases SET workflow_status='AWAITING_REVERIFICATION' WHERE service_case_id=$1`,
      [row.service_case_id],
    );
    await this.audit(
      m,
      row,
      'REVERIFICATION',
      row.service_case_id,
      'ASSET_REVERIFICATION_REQUESTED',
      actorId,
      null,
      reasons,
    );
  }

  async estimate(
    actor: AssetServiceActor,
    id: string,
    expected: number,
    key: string,
    input: EstimateInput,
  ) {
    await this.scopedCase(actor, id, 'ASSET_SERVICE_EXECUTE');
    const amounts = [
      input.labor_amount,
      input.parts_amount,
      input.travel_amount,
      input.other_amount,
    ].map((v) => Number(v ?? 0));
    if (
      amounts.some((v) => !Number.isFinite(v) || v < 0) ||
      !/^[A-Z]{3}$/.test(input.currency)
    )
      throw new BadRequestException('Invalid estimate');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.assertRevision(row, expected);
        const prior = await m.query(
          `SELECT estimate_revision_id,revision FROM svc_estimate_revisions WHERE service_case_id=$1 ORDER BY revision DESC LIMIT 1`,
          [id],
        );
        const revision = Number(prior[0]?.revision ?? 0) + 1,
          estimateId = randomUUID(),
          scopeHash = serviceHash(input);
        await m.query(
          `INSERT INTO svc_estimate_revisions(estimate_revision_id,tenant_id,service_case_id,revision,labor_amount,parts_amount,travel_amount,other_amount,currency,estimated_duration_hours,scope_hash,created_by,approval_reference)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
          [
            estimateId,
            row.tenant_id,
            id,
            revision,
            ...amounts,
            input.currency,
            input.estimated_duration_hours ?? null,
            scopeHash,
            actor.user_id,
            JSON.stringify(input.approval_reference ?? {}),
          ],
        );
        await this.audit(
          m,
          row,
          'ESTIMATE',
          estimateId,
          'ASSET_SERVICE_ESTIMATE_REVISED',
          actor.user_id,
          prior[0] ?? null,
          { revision, scope_hash: scopeHash },
        );
        const event = await this.emit(
          m,
          row,
          'AssetServiceEstimateRevised.v1',
          {
            estimate_revision_id: estimateId,
            revision,
            total_amount: amounts.reduce((a, b) => a + b, 0),
            currency: input.currency,
          },
        );
        return {
          estimate_revision_id: estimateId,
          revision,
          event,
          aggregate_revision: row.aggregate_revision,
        };
      }),
    );
  }

  async approveEstimate(
    actor: AssetServiceActor,
    id: string,
    estimateId: string,
    expected: number,
    key: string,
    approvalReference: Record<string, unknown>,
  ) {
    await this.scopedCase(actor, id, 'ASSET_SERVICE_ESTIMATE_APPROVE');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, approvalReference, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.assertRevision(row, expected);
        const estimates = await m.query(
          `SELECT * FROM svc_estimate_revisions WHERE estimate_revision_id=$1 AND service_case_id=$2`,
          [estimateId, id],
        );
        const estimate = estimates[0];
        if (!estimate) throw new NotFoundException('Estimate not found');
        if (estimate.created_by === actor.user_id)
          throw new ForbiddenException(
            'Estimate creator cannot approve the estimate',
          );
        await m.query(
          `UPDATE svc_estimate_revisions SET approved_by=$2,approval_reference=$3::jsonb,approved_at=NOW() WHERE estimate_revision_id=$1`,
          [estimateId, actor.user_id, JSON.stringify(approvalReference)],
        );
        await this.audit(
          m,
          row,
          'ESTIMATE',
          estimateId,
          'ASSET_SERVICE_ESTIMATE_APPROVED',
          actor.user_id,
          null,
          approvalReference,
        );
        await this.emit(m, row, 'AssetServiceEstimateApproved.v1', {
          estimate_revision_id: estimateId,
          approval_reference: approvalReference,
        });
        return {
          estimate_revision_id: estimateId,
          approved: true,
          aggregate_revision: row.aggregate_revision,
        };
      }),
    );
  }

  async addTask(
    actor: AssetServiceActor,
    id: string,
    expected: number,
    key: string,
    input: {
      task_code: string;
      description: string;
      assigned_user_id?: string;
      assigned_provider_id?: string;
      required_evidence?: string[];
    },
  ) {
    await this.scopedCase(actor, id, 'ASSET_SERVICE_EXECUTE');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.assertRevision(row, expected);
        const taskId = randomUUID();
        await m.query(
          `INSERT INTO svc_tasks(service_task_id,tenant_id,service_case_id,task_code,description,assigned_user_id,assigned_provider_id,required_evidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
          [
            taskId,
            row.tenant_id,
            id,
            input.task_code,
            input.description,
            input.assigned_user_id ?? null,
            input.assigned_provider_id ?? null,
            JSON.stringify(input.required_evidence ?? []),
          ],
        );
        await this.audit(
          m,
          row,
          'TASK',
          taskId,
          'ASSET_SERVICE_TASK_CREATED',
          actor.user_id,
          null,
          input,
        );
        await this.emit(m, row, 'AssetServiceTaskCreated.v1', {
          service_task_id: taskId,
        });
        return {
          service_task_id: taskId,
          aggregate_revision: row.aggregate_revision,
        };
      }),
    );
  }

  async completeTask(
    actor: AssetServiceActor,
    id: string,
    taskId: string,
    expected: number,
    key: string,
    result: Record<string, unknown>,
  ) {
    await this.scopedCase(actor, id, 'ASSET_SERVICE_EXECUTE');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, result, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.assertRevision(row, expected);
        const changed = await m.query(
          `UPDATE svc_tasks SET status='COMPLETED',result=$3::jsonb,completed_at=NOW() WHERE service_task_id=$1 AND service_case_id=$2 AND status<>'COMPLETED' RETURNING service_task_id`,
          [taskId, id, JSON.stringify(result)],
        );
        if (!changed[0]) throw new ConflictException('Task is not completable');
        await this.audit(
          m,
          row,
          'TASK',
          taskId,
          'ASSET_SERVICE_TASK_COMPLETED',
          actor.user_id,
          null,
          result,
        );
        await this.emit(m, row, 'AssetServiceTaskCompleted.v1', {
          service_task_id: taskId,
        });
        return {
          service_task_id: taskId,
          status: 'COMPLETED',
          aggregate_revision: row.aggregate_revision,
        };
      }),
    );
  }

  async addPart(
    actor: AssetServiceActor,
    id: string,
    expected: number,
    key: string,
    input: {
      part_type:
        | 'STOCKED_CONSUMABLE'
        | 'TRACKED_COMPONENT'
        | 'NON_STOCK_PURCHASE';
      description: string;
      quantity: number;
      unit: string;
      product_model_id?: string;
      inventory_record_id?: string;
      module6_request_id?: string;
      procurement_case_id?: string;
    },
  ) {
    await this.scopedCase(actor, id, 'ASSET_SERVICE_PARTS_MANAGE');
    if (!(Number(input.quantity) > 0))
      throw new BadRequestException('Part quantity must be positive');
    if (input.part_type === 'STOCKED_CONSUMABLE' && !input.module6_request_id)
      throw new ConflictException('Stocked parts require a Module 6 request');
    if (input.part_type === 'TRACKED_COMPONENT' && !input.inventory_record_id)
      throw new ConflictException(
        'Tracked components require a Module 5 identity',
      );
    if (input.part_type === 'NON_STOCK_PURCHASE' && !input.procurement_case_id)
      throw new ConflictException(
        'Purchased parts require a Module 2 procurement case',
      );
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.assertRevision(row, expected);
        const partId = randomUUID();
        await m.query(
          `INSERT INTO svc_parts_usage(part_usage_id,tenant_id,service_case_id,part_type,product_model_id,inventory_record_id,module6_request_id,procurement_case_id,description,quantity,unit,requested_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            partId,
            row.tenant_id,
            id,
            input.part_type,
            input.product_model_id ?? null,
            input.inventory_record_id ?? null,
            input.module6_request_id ?? null,
            input.procurement_case_id ?? null,
            input.description,
            input.quantity,
            input.unit,
            actor.user_id,
          ],
        );
        await this.audit(
          m,
          row,
          'PART',
          partId,
          'ASSET_SERVICE_PART_REQUESTED',
          actor.user_id,
          null,
          input,
        );
        const event = await this.emit(m, row, 'AssetServicePartsRequested.v1', {
          part_usage_id: partId,
          ...input,
        });
        return {
          part_usage_id: partId,
          status: 'REQUESTED',
          event,
          aggregate_revision: row.aggregate_revision,
        };
      }),
    );
  }

  async reconcilePart(
    actor: AssetServiceActor,
    id: string,
    partId: string,
    expected: number,
    key: string,
    input: {
      status: 'INSTALLED' | 'CONSUMED' | 'RETURNED' | 'FAILED' | 'RECONCILED';
      removed_component_reference?: Record<string, unknown>;
      installed_component_reference?: Record<string, unknown>;
      part_warranty?: Record<string, unknown>;
    },
  ) {
    await this.scopedCase(actor, id, 'ASSET_SERVICE_PARTS_MANAGE');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.assertRevision(row, expected);
        const part = (
          await m.query(
            `SELECT * FROM svc_parts_usage WHERE part_usage_id=$1 AND service_case_id=$2 FOR UPDATE`,
            [partId, id],
          )
        )[0];
        if (!part) throw new NotFoundException('Part usage not found');
        if (
          part.requested_by === actor.user_id &&
          input.status === 'RECONCILED'
        )
          throw new ForbiddenException(
            'Parts issuer cannot be the sole reconciliation approver',
          );
        await m.query(
          `UPDATE svc_parts_usage SET status=$3,removed_component_reference=$4::jsonb,installed_component_reference=$5::jsonb,part_warranty=$6::jsonb,reconciled_by=CASE WHEN $3='RECONCILED' THEN $7 ELSE reconciled_by END,reconciled_at=CASE WHEN $3='RECONCILED' THEN NOW() ELSE reconciled_at END WHERE part_usage_id=$1 AND service_case_id=$2`,
          [
            partId,
            id,
            input.status,
            JSON.stringify(input.removed_component_reference ?? {}),
            JSON.stringify(input.installed_component_reference ?? {}),
            JSON.stringify(input.part_warranty ?? {}),
            actor.user_id,
          ],
        );
        await this.audit(
          m,
          row,
          'PART',
          partId,
          'ASSET_SERVICE_PART_RECONCILED',
          actor.user_id,
          { status: part.status },
          input,
        );
        const event = await this.emit(
          m,
          row,
          'AssetServicePartsReconciled.v1',
          { part_usage_id: partId, ...input },
        );
        return {
          part_usage_id: partId,
          status: input.status,
          event,
          aggregate_revision: row.aggregate_revision,
        };
      }),
    );
  }

  async completeWork(
    actor: AssetServiceActor,
    id: string,
    expected: number,
    key: string,
    input: {
      completion_summary: string;
      requires_reverification?: boolean;
      reverification_reasons?: string[];
    },
  ) {
    await this.scopedCase(actor, id, 'ASSET_SERVICE_EXECUTE');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.assertRevision(row, expected);
        if (
          !['IN_PROGRESS', 'AWAITING_PARTS', 'AWAITING_VENDOR'].includes(
            row.workflow_status,
          )
        )
          throw new ConflictException('Service work is not active');
        if (
          (
            await m.query(
              `SELECT 1 FROM svc_tasks WHERE service_case_id=$1 AND status NOT IN('COMPLETED','CANCELLED') LIMIT 1`,
              [id],
            )
          )[0]
        )
          throw new ConflictException('All service tasks must be resolved');
        if (
          (
            await m.query(
              `SELECT 1 FROM svc_parts_usage WHERE service_case_id=$1 AND status NOT IN('RETURNED','FAILED','RECONCILED') LIMIT 1`,
              [id],
            )
          )[0]
        )
          throw new ConflictException('Parts must be reconciled');
        if (input.requires_reverification)
          await this.createReverification(
            m,
            row,
            actor.user_id,
            input.reverification_reasons ?? ['RISK_BASED_POLICY'],
          );
        else
          await m.query(
            `UPDATE svc_cases SET workflow_status='ACCEPTANCE_PENDING',completed_at=NOW() WHERE service_case_id=$1`,
            [id],
          );
        await this.audit(
          m,
          row,
          'EXECUTION',
          id,
          'ASSET_SERVICE_TECHNICAL_WORK_COMPLETED',
          actor.user_id,
          null,
          input,
        );
        await this.emit(m, row, 'AssetServiceTechnicalWorkCompleted.v1', input);
        return {
          workflow_status: input.requires_reverification
            ? 'AWAITING_REVERIFICATION'
            : 'ACCEPTANCE_PENDING',
          aggregate_revision: row.aggregate_revision,
        };
      }),
    );
  }

  async cancel(
    actor: AssetServiceActor,
    id: string,
    expected: number,
    key: string,
    reason: string,
  ) {
    await this.scopedCase(actor, id, 'ASSET_SERVICE_TRIAGE');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, { reason }, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.assertRevision(row, expected);
        if (
          !['DRAFT', 'SUBMITTED', 'TRIAGE', 'APPROVED', 'SCHEDULED'].includes(
            row.workflow_status,
          )
        )
          throw new ConflictException(
            'Started or completed service cannot be cancelled',
          );
        if (row.workflow_status !== 'DRAFT')
          await this.inventory.releaseServiceHold(
            m,
            actor,
            id,
            row.inventory_record_id,
            reason,
          );
        await m.query(
          `UPDATE svc_cases SET workflow_status='CANCELLED',asset_availability='RETURNED_TO_CUSTODIAN' WHERE service_case_id=$1`,
          [id],
        );
        await m.query(
          `UPDATE proc_repairs SET status='CANCELLED',updated_at=NOW() WHERE module8_service_case_id=$1`,
          [id],
        );
        await m.query(
          `UPDATE asset_maintenance_records SET status='CANCELLED' WHERE module8_service_case_id=$1`,
          [id],
        );
        await this.audit(
          m,
          row,
          'SERVICE_CASE',
          id,
          'ASSET_SERVICE_CASE_CANCELLED',
          actor.user_id,
          null,
          { reason },
        );
        await this.emit(m, row, 'AssetServiceHoldReleased.v1', { reason });
        return {
          workflow_status: 'CANCELLED',
          aggregate_revision: row.aggregate_revision,
        };
      }),
    );
  }

  async vendorReturn(
    actor: AssetServiceActor,
    id: string,
    expected: number,
    key: string,
    input: {
      condition: string;
      evidence_manifest_hash: string;
      service_location?: string;
    },
  ) {
    await this.scopedCase(actor, id, 'ASSET_SERVICE_ACCEPT');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.assertRevision(row, expected);
        if (row.asset_availability !== 'VENDOR_SERVICE_CUSTODY')
          throw new ConflictException('Asset is not in vendor service custody');
        if (row.assigned_technician_id === actor.user_id)
          throw new ForbiddenException(
            'Technician cannot accept their own vendor return',
          );
        await this.inventory.transferServiceCustody(
          m,
          actor,
          id,
          row.inventory_record_id,
          'RETURNED_TO_CUSTODIAN',
          row.service_provider_id,
          input.service_location,
          undefined,
          input.condition,
          input.evidence_manifest_hash,
        );
        await m.query(
          `UPDATE svc_cases SET asset_availability='RETURNED_TO_CUSTODIAN',workflow_status=CASE WHEN workflow_status='AWAITING_REVERIFICATION' THEN workflow_status ELSE 'ACCEPTANCE_PENDING' END WHERE service_case_id=$1`,
          [id],
        );
        await this.audit(
          m,
          row,
          'CUSTODY',
          id,
          'ASSET_VENDOR_RETURN_ACCEPTED',
          actor.user_id,
          { asset_availability: row.asset_availability },
          input,
        );
        await this.emit(m, row, 'AssetServiceCustodyTransferred.v1', {
          availability: 'RETURNED_TO_CUSTODIAN',
          ...input,
        });
        return {
          asset_availability: 'RETURNED_TO_CUSTODIAN',
          aggregate_revision: row.aggregate_revision,
        };
      }),
    );
  }

  async recordReverification(
    actor: AssetServiceActor,
    id: string,
    expected: number,
    key: string,
    input: {
      module4_case_id: string;
      verification_identity_id: string;
      source_event_id: string;
    },
  ) {
    await this.scopedCase(actor, id, 'ASSET_SERVICE_ACCEPT');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.assertRevision(row, expected);
        const identity = await m.query(
          `SELECT i.verification_identity_id,i.verification_case_id FROM pv_verification_identities i
           WHERE i.verification_identity_id=$1 AND i.subject_id=$2 AND i.tenant_id=$3 AND i.status='ACTIVE'`,
          [input.verification_identity_id, row.subject_id, row.tenant_id],
        );
        if (
          !identity[0] ||
          identity[0].verification_case_id !== input.module4_case_id
        )
          throw new ConflictException(
            'Current Module 4 verification identity does not match this asset',
          );
        const updated = await m.query(
          `UPDATE svc_reverification_projections SET status='CLEARED',module4_case_id=$2,verification_identity_id=$3,source_event_id=$4,source_payload=$5::jsonb,updated_at=NOW()
           WHERE service_case_id=$1 AND status IN('REQUESTED','IN_PROGRESS') RETURNING reverification_projection_id`,
          [
            id,
            input.module4_case_id,
            input.verification_identity_id,
            input.source_event_id,
            JSON.stringify(input),
          ],
        );
        if (!updated[0])
          throw new ConflictException('No pending re-verification request');
        await m.query(
          `UPDATE svc_cases SET workflow_status='ACCEPTANCE_PENDING' WHERE service_case_id=$1`,
          [id],
        );
        await this.audit(
          m,
          row,
          'REVERIFICATION',
          updated[0].reverification_projection_id,
          'ASSET_REVERIFICATION_CLEARED',
          actor.user_id,
          null,
          input,
        );
        await this.emit(m, row, 'AssetReverificationCleared.v1', input);
        return {
          status: 'CLEARED',
          aggregate_revision: row.aggregate_revision,
        };
      }),
    );
  }

  async accept(
    actor: AssetServiceActor,
    id: string,
    expected: number,
    key: string,
    input: AcceptServiceInput,
  ) {
    await this.scopedCase(actor, id, 'ASSET_SERVICE_ACCEPT');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        this.assertRevision(row, expected);
        if (row.assigned_technician_id === actor.user_id)
          throw new ForbiddenException(
            'Technician cannot accept their own completed work',
          );
        if (row.asset_availability === 'VENDOR_SERVICE_CUSTODY')
          throw new ConflictException(
            'Vendor return requires independent university acceptance first',
          );
        const openTasks = await m.query(
          `SELECT 1 FROM svc_tasks WHERE service_case_id=$1 AND status NOT IN('COMPLETED','CANCELLED') LIMIT 1`,
          [id],
        );
        if (openTasks[0])
          throw new ConflictException('All service tasks must be resolved');
        const openParts = await m.query(
          `SELECT 1 FROM svc_parts_usage WHERE service_case_id=$1 AND status NOT IN('RETURNED','FAILED','RECONCILED') LIMIT 1`,
          [id],
        );
        if (openParts[0])
          throw new ConflictException('Parts must be reconciled');
        const reverification = await m.query(
          `SELECT status FROM svc_reverification_projections WHERE service_case_id=$1 ORDER BY updated_at DESC LIMIT 1`,
          [id],
        );
        if (reverification[0] && reverification[0].status !== 'CLEARED')
          throw new ConflictException(
            'Required Module 4 re-verification is not cleared',
          );
        if (
          input.decision === 'ACCEPTED_WITH_LIMITATIONS' &&
          !Object.keys(input.limitations ?? {}).length
        )
          throw new BadRequestException(
            'Limitations and review date are required',
          );
        const evidence = await m.query(
          `SELECT evidence_id,content_hash FROM svc_evidence WHERE service_case_id=$1 ORDER BY evidence_id`,
          [id],
        );
        const evidenceHash = serviceHash(evidence);
        const previous =
          (
            await m.query(
              `SELECT decision_hash FROM svc_acceptance_decisions WHERE service_case_id=$1 ORDER BY decided_at DESC LIMIT 1`,
              [id],
            )
          )[0]?.decision_hash ?? null;
        const decisionHash = serviceHash({
            id,
            input,
            evidenceHash,
            previous,
            accepted_by: actor.user_id,
          }),
          decisionId = randomUUID();
        await m.query(
          `INSERT INTO svc_acceptance_decisions(acceptance_decision_id,tenant_id,service_case_id,decision,reason,limitations,evidence_manifest_hash,technician_or_provider_id,accepted_by,previous_decision_hash,decision_hash) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11)`,
          [
            decisionId,
            row.tenant_id,
            id,
            input.decision,
            input.reason,
            JSON.stringify(input.limitations ?? {}),
            evidenceHash,
            row.assigned_technician_id ?? null,
            actor.user_id,
            previous,
            decisionHash,
          ],
        );
        const terminal = ['IRREPARABLE', 'UNSAFE'].includes(input.decision),
          outcome =
            input.decision === 'ACCEPTED'
              ? 'RESTORED'
              : input.decision === 'ACCEPTED_WITH_LIMITATIONS'
                ? 'RESTORED_WITH_LIMITATIONS'
                : input.decision === 'REJECTED'
                  ? 'REPAIR_UNSUCCESSFUL'
                  : input.decision;
        if (terminal)
          await this.inventory.quarantineForService(
            m,
            actor,
            id,
            row.inventory_record_id,
            input.reason,
          );
        else if (input.decision !== 'REJECTED')
          await this.inventory.releaseServiceHold(
            m,
            actor,
            id,
            row.inventory_record_id,
            input.reason,
          );
        const workflow =
          terminal || input.decision !== 'REJECTED' ? 'CLOSED' : 'DISPUTED';
        await m.query(
          `UPDATE svc_cases SET workflow_status=$2,final_outcome=$3,asset_availability=$4,completed_at=NOW(),closed_at=CASE WHEN $2='CLOSED' THEN NOW() ELSE NULL END WHERE service_case_id=$1`,
          [
            id,
            workflow,
            outcome,
            terminal
              ? 'QUARANTINED'
              : input.decision === 'REJECTED'
                ? row.asset_availability
                : 'RETURNED_TO_CUSTODIAN',
          ],
        );
        await m.query(
          `UPDATE proc_repairs SET status=CASE WHEN $2='CLOSED' THEN 'CLOSED' ELSE 'IN_REPAIR' END,updated_at=NOW() WHERE module8_service_case_id=$1`,
          [id, workflow],
        );
        await m.query(
          `UPDATE asset_maintenance_records SET status=CASE WHEN $2='CLOSED' THEN 'COMPLETED' ELSE 'IN_PROGRESS' END WHERE module8_service_case_id=$1`,
          [id, workflow],
        );
        await this.audit(
          m,
          row,
          'ACCEPTANCE',
          decisionId,
          'ASSET_SERVICE_ACCEPTANCE_DECIDED',
          actor.user_id,
          null,
          { ...input, outcome, decision_hash: decisionHash },
        );
        await this.emit(m, row, 'AssetServiceCompleted.v1', {
          outcome,
          decision_hash: decisionHash,
          module7_case_id: row.module7_case_id,
        });
        if (terminal) {
          await this.emit(m, row, 'AssetServiceIrreparable.v1', {
            outcome,
            reason: input.reason,
          });
          await this.emit(m, row, 'AssetRetirementReferralRequested.v1', {
            inventory_record_id: row.inventory_record_id,
            outcome,
            reason: input.reason,
          });
        } else if (workflow === 'CLOSED') {
          await this.emit(m, row, 'AssetServiceHoldReleased.v1', {
            reason: input.reason,
          });
          await this.emit(m, row, 'AssetReturnedToService.v1', {
            outcome,
            module7_case_id: row.module7_case_id,
          });
        }
        return {
          workflow_status: workflow,
          final_outcome: outcome,
          decision_hash: decisionHash,
          aggregate_revision: row.aggregate_revision,
        };
      }),
    );
  }

  async supersede(
    actor: AssetServiceActor,
    id: string,
    key: string,
    reason: string,
  ) {
    await this.scopedCase(actor, id, 'ASSET_SERVICE_REQUEST');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, { reason }, async () => {
        const original = await this.locked(m, id, this.tenant(actor));
        if (original.workflow_status !== 'CLOSED')
          throw new ConflictException(
            'Only a closed case can be reopened by supersession',
          );
        const newId = randomUUID(),
          number = `SVC-${new Date().getUTCFullYear()}-${newId.slice(0, 8).toUpperCase()}`;
        await m.query(
          `INSERT INTO svc_cases(service_case_id,tenant_id,case_number,inventory_record_id,subject_id,case_type,title,problem_description,severity,reported_by,module7_case_id,procurement_case_id,supersedes_service_case_id,root_service_case_id,previous_outcome,reopen_reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULL,$11,$12,$13,$14,$15)`,
          [
            newId,
            original.tenant_id,
            number,
            original.inventory_record_id,
            original.subject_id,
            original.case_type,
            `Reopened: ${original.title}`,
            original.problem_description,
            original.severity,
            actor.user_id,
            original.procurement_case_id,
            id,
            original.root_service_case_id ?? id,
            original.final_outcome,
            reason,
          ],
        );
        const newRow = await this.locked(m, newId, original.tenant_id);
        await this.audit(
          m,
          newRow,
          'SERVICE_CASE',
          newId,
          'ASSET_SERVICE_CASE_SUPERSEDED',
          actor.user_id,
          { supersedes: id },
          { reason },
        );
        const event = await this.emit(
          m,
          newRow,
          'AssetServiceCaseSuperseded.v1',
          { supersedes_service_case_id: id, reason },
        );
        return {
          service_case_id: newId,
          case_number: number,
          workflow_status: 'DRAFT',
          event,
          aggregate_revision: newRow.aggregate_revision,
        };
      }),
    );
  }

  async registerEvidence(
    actor: AssetServiceActor,
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
    await this.scopedCase(actor, id, 'ASSET_SERVICE_REQUEST');
    return this.db.transaction((m) =>
      this.idempotent(m, actor, key, input, async () => {
        const row = await this.locked(m, id, this.tenant(actor));
        const evidenceId = randomUUID();
        await m.query(
          `INSERT INTO svc_evidence(evidence_id,tenant_id,service_case_id,evidence_type,object_key,content_hash,mime_type,byte_size,retention_class,metadata,captured_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,
          [
            evidenceId,
            row.tenant_id,
            id,
            input.evidence_type,
            input.object_key,
            input.content_hash,
            input.mime_type,
            input.byte_size,
            input.retention_class ?? 'ASSET_SERVICE',
            JSON.stringify(input.metadata ?? {}),
            actor.user_id,
          ],
        );
        await this.audit(
          m,
          row,
          'EVIDENCE',
          evidenceId,
          'ASSET_SERVICE_EVIDENCE_ADDED',
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

  @Interval(3600000)
  async generateDuePreventiveWork() {
    const schedules = await this.db.query(
      `SELECT s.*,r.subject_id,pm.product_name FROM svc_preventive_schedules s JOIN inv_records r ON r.inventory_record_id=s.inventory_record_id JOIN inv_product_models pm ON pm.product_model_id=r.product_model_id WHERE s.status IN('PLANNED','DUE','OVERDUE') AND s.due_at<=NOW() ORDER BY s.due_at LIMIT 100`,
    );
    for (const schedule of schedules)
      await this.db.transaction(async (m) => {
        const locked = (
          await m.query(
            `SELECT * FROM svc_preventive_schedules WHERE preventive_schedule_id=$1 FOR UPDATE`,
            [schedule.preventive_schedule_id],
          )
        )[0];
        if (!locked || locked.status === 'GENERATED') return;
        const active = await m.query(
          `SELECT 1 FROM svc_cases WHERE inventory_record_id=$1 AND workflow_status IN('SUBMITTED','TRIAGE','APPROVED','SCHEDULED','IN_PROGRESS','AWAITING_PARTS','AWAITING_VENDOR','AWAITING_REVERIFICATION','ACCEPTANCE_PENDING','ON_HOLD','DISPUTED')`,
          [schedule.inventory_record_id],
        );
        if (active[0]) {
          await m.query(
            `UPDATE svc_preventive_schedules SET status='OVERDUE' WHERE preventive_schedule_id=$1`,
            [schedule.preventive_schedule_id],
          );
          return;
        }
        const id = randomUUID(),
          number = `SVC-PM-${new Date().getUTCFullYear()}-${id.slice(0, 8).toUpperCase()}`;
        const systemUser = (
          await m.query(
            `SELECT user_id FROM users WHERE tenant_id=$1 ORDER BY created_at LIMIT 1`,
            [schedule.tenant_id],
          )
        )[0]?.user_id;
        if (!systemUser) return;
        await m.query(
          `INSERT INTO svc_cases(service_case_id,tenant_id,case_number,inventory_record_id,subject_id,case_type,title,problem_description,severity,reported_by,root_service_case_id,preventive_policy_id,scheduled_for) VALUES($1,$2,$3,$4,$5,'PREVENTIVE_MAINTENANCE',$6,$7,'NORMAL',$8,$1,$9,$10)`,
          [
            id,
            schedule.tenant_id,
            number,
            schedule.inventory_record_id,
            schedule.subject_id,
            `Preventive maintenance: ${schedule.product_name}`,
            'Generated from published preventive policy',
            systemUser,
            schedule.preventive_policy_id,
            schedule.due_at,
          ],
        );
        await m.query(
          `UPDATE svc_preventive_schedules SET status='GENERATED',generated_service_case_id=$2 WHERE preventive_schedule_id=$1`,
          [schedule.preventive_schedule_id, id],
        );
        const row = await this.locked(m, id, schedule.tenant_id);
        await this.emit(m, row, 'PreventiveMaintenanceScheduled.v1', {
          preventive_schedule_id: schedule.preventive_schedule_id,
          original_due_at: schedule.original_due_at,
        });
      });
  }
}
