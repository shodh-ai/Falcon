/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call -- TypeORM query() rows are untyped */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { DataSource } from 'typeorm';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { DofaEngineService } from '../dofa-engine/dofa-engine.service';
import type {
  AcquisitionActor,
  AcquisitionLineInput,
  CreateAcquisitionInput,
  VendorScoreWeights,
} from './acquisition.types';
import {
  calculateAcquisition,
  calculateLine,
  assertSafeAcquisitionInput,
  scoreVendor,
  sha256,
  stableJson,
  validateAcquisition,
} from './acquisition.util';

const DEFAULT_TENANT = 'a0000000-0000-4000-8000-000000000001';
const VENDOR_EXCEPTION_MIN_LENGTH = 20;

type VersionRow = Record<string, any> & {
  acquisition_id: string;
  acquisition_version_id: string;
  acquisition_number: string;
  requester_id: string;
  requesting_department_id?: number | null;
  intended_department_id?: number | null;
  version_number: number;
  status: string;
  estimated_total: string | number;
  funding_source_type: string;
  funding_source_id: string;
};

@Injectable()
export class AcquisitionService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly dofa: DofaEngineService,
  ) {}

  private tenant(actor: AcquisitionActor) {
    return actor.tenant_id ?? DEFAULT_TENANT;
  }

  private roles(actor: AcquisitionActor) {
    return Array.from(
      new Set([...(actor.roles ?? []), ...(actor.role ? [actor.role] : [])]),
    );
  }

  private async hasCapability(
    actor: AcquisitionActor,
    capability: string,
    departmentId?: number | null,
  ) {
    const rows = await this.db.query(
      `SELECT scope_type, scope_reference
       FROM acq_access_grants
       WHERE tenant_id = $1 AND capability = $2
         AND valid_from <= NOW() AND (valid_until IS NULL OR valid_until > NOW())
         AND (
           principal_user_id = $3::uuid OR
           lower(principal_role) = ANY($4::text[])
         )`,
      [
        this.tenant(actor),
        capability,
        actor.user_id,
        this.roles(actor).map((role) => role.toLowerCase()),
      ],
    );
    return rows.some(
      (grant: { scope_type: string; scope_reference?: string | null }) =>
        grant.scope_type === 'TENANT' ||
        (grant.scope_type === 'DEPARTMENT' &&
          departmentId != null &&
          String(departmentId) === String(grant.scope_reference)),
    );
  }

  private async requireCapability(
    actor: AcquisitionActor,
    capability: string,
    departmentId?: number | null,
  ) {
    if (!(await this.hasCapability(actor, capability, departmentId))) {
      throw new ForbiddenException({
        message: `Missing scoped capability ${capability}`,
        code: 'ACQUISITION_CAPABILITY_REQUIRED',
      });
    }
  }

  private async writeAudit(
    manager: EntityManager,
    tenantId: string,
    acquisitionId: string,
    versionId: string | null,
    eventType: string,
    actorId: string | null,
    payload: unknown,
    actorType = 'USER',
    requestId?: string,
  ) {
    const previous = await manager.query(
      `SELECT event_hash FROM acq_audit_events
       WHERE tenant_id = $1 AND acquisition_id = $2
       ORDER BY created_at DESC, audit_event_id DESC LIMIT 1`,
      [tenantId, acquisitionId],
    );
    const previousHash = previous[0]?.event_hash ?? null;
    const eventHash = sha256({
      tenantId,
      acquisitionId,
      versionId,
      eventType,
      actorId,
      actorType,
      payload,
      previousHash,
    });
    await manager.query(
      `INSERT INTO acq_audit_events (
         tenant_id, acquisition_id, acquisition_version_id, event_type,
         actor_user_id, actor_type, request_id, event_payload, event_hash, previous_event_hash
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`,
      [
        tenantId,
        acquisitionId,
        versionId,
        eventType,
        actorId,
        actorType,
        requestId ?? null,
        JSON.stringify(payload ?? {}),
        eventHash,
        previousHash,
      ],
    );
  }

  private async nextNumber(manager: EntityManager, tenantId: string) {
    const year = new Date().getUTCFullYear();
    await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `acquisition-number:${tenantId}:${year}`,
    ]);
    const rows = await manager.query(
      `SELECT COALESCE(MAX(NULLIF(regexp_replace(acquisition_number, '^ACQ-[0-9]{4}-', ''), '')::int), 0) + 1 AS next_number
       FROM acq_requests
       WHERE tenant_id = $1 AND acquisition_number LIKE $2`,
      [tenantId, `ACQ-${year}-%`],
    );
    return `ACQ-${year}-${String(rows[0]?.next_number ?? 1).padStart(6, '0')}`;
  }

  private normalizeSpecs(
    value: AcquisitionLineInput['technical_specifications'],
  ) {
    if (!value) return {};
    return typeof value === 'string' ? { description: value.trim() } : value;
  }

  private encryptSensitive(value?: string) {
    const text = value?.trim();
    if (!text) return null;
    const encodedKey = process.env.ACQUISITION_DATA_ENCRYPTION_KEY;
    if (!encodedKey) {
      throw new BadRequestException({
        message:
          'Sensitive vendor data requires ACQUISITION_DATA_ENCRYPTION_KEY',
        code: 'DATA_ENCRYPTION_KEY_REQUIRED',
      });
    }
    const key = Buffer.from(encodedKey, 'base64');
    if (key.length !== 32)
      throw new Error(
        'ACQUISITION_DATA_ENCRYPTION_KEY must be a base64-encoded 32-byte key',
      );
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(text, 'utf8'),
      cipher.final(),
    ]);
    return `enc:v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ciphertext.toString('base64')}`;
  }

  private decryptSensitive(value?: string | null) {
    if (!value?.startsWith('enc:v1:')) return null;
    const key = Buffer.from(
      process.env.ACQUISITION_DATA_ENCRYPTION_KEY ?? '',
      'base64',
    );
    if (key.length !== 32) return null;
    const [, , iv, tag, ciphertext] = value.split(':');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  private async insertLines(
    manager: EntityManager,
    tenantId: string,
    versionId: string,
    lines: AcquisitionLineInput[],
  ) {
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const total = calculateLine(line);
      await manager.query(
        `INSERT INTO acq_lines (
           acquisition_version_id, tenant_id, line_number, acquisition_layout,
           product_name, category, quantity, unit, brand, model_number, part_number,
           technical_specifications, product_description, intended_use,
           estimated_unit_price, estimated_line_total, delivery_cost, tax_cost,
           installation_cost, service_cost, miscellaneous_cost, preferred_vendor_id,
           preferred_vendor_name, product_url, vendor_contact, vendor_address,
           vendor_business_reference, return_policy, replacement_policy,
           warranty_requirements, expected_delivery_days, item_classification,
           expected_service_life_months, special_procurement_requirements, remarks
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,$17,$18,
           $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35
         )`,
        [
          versionId,
          tenantId,
          index + 1,
          line.acquisition_layout,
          line.product_name.trim(),
          line.category.trim(),
          line.quantity,
          line.unit?.trim() || 'unit',
          line.brand?.trim() || null,
          line.model_number?.trim() || null,
          line.part_number?.trim() || null,
          JSON.stringify(this.normalizeSpecs(line.technical_specifications)),
          line.product_description?.trim() || null,
          line.intended_use.trim(),
          calculateLine(line).product / Number(line.quantity),
          total.product,
          total.delivery,
          total.tax,
          total.installation,
          total.service,
          total.miscellaneous,
          line.preferred_vendor_id ?? null,
          line.preferred_vendor_name?.trim() || null,
          line.product_url?.trim() || null,
          this.encryptSensitive(line.vendor_contact),
          this.encryptSensitive(line.vendor_address),
          line.vendor_business_reference?.trim() || null,
          line.return_policy?.trim() || null,
          line.replacement_policy?.trim() || null,
          line.warranty_requirements?.trim() || null,
          line.expected_delivery_days ?? null,
          line.item_classification,
          line.expected_service_life_months ?? null,
          line.special_procurement_requirements?.trim() || null,
          line.remarks?.trim() || null,
        ],
      );
    }
  }

  async createDraft(
    actor: AcquisitionActor,
    input: CreateAcquisitionInput,
    requestId?: string,
    transactionManager?: EntityManager,
  ) {
    const tenantId = this.tenant(actor);
    try {
      assertSafeAcquisitionInput(input);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid acquisition input',
      );
    }
    await this.requireCapability(
      actor,
      'ACQUISITION_REQUESTER',
      input.requesting_department_id ?? input.intended_department_id,
    );
    if (
      !Array.isArray(input.lines) ||
      !input.lines.length ||
      input.lines.length > 500
    ) {
      throw new BadRequestException(
        'Acquisition needs between 1 and 500 lines',
      );
    }
    const totals = calculateAcquisition(input.lines);
    const create = async (manager: EntityManager) => {
      const number = await this.nextNumber(manager, tenantId);
      const requestRows = await manager.query(
        `INSERT INTO acq_requests (
           tenant_id, acquisition_number, requester_id, requesting_department_id,
           source, external_reference, integration_client_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [
          tenantId,
          number,
          actor.user_id,
          input.requesting_department_id ?? null,
          input.source ?? 'FALCON',
          input.external_reference ?? null,
          input.integration_client_id ?? null,
        ],
      );
      const request = requestRows[0];
      const versionRows = await manager.query(
        `INSERT INTO acq_request_versions (
           acquisition_id, tenant_id, version_number, intended_department_id,
           intended_lab_or_project, intended_use_case, required_by_date, priority,
           funding_source_type, funding_source_id, expected_service_life_months,
           default_item_classification, installation_or_service_required,
           special_procurement_requirements, remarks, currency, product_cost,
           delivery_cost, tax_cost, installation_cost, service_cost,
           miscellaneous_cost, estimated_total, created_by
         ) VALUES (
           $1,$2,1,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
         ) RETURNING *`,
        [
          request.acquisition_id,
          tenantId,
          input.intended_department_id ?? null,
          input.intended_lab_or_project?.trim() || null,
          input.intended_use_case?.trim() ?? '',
          input.required_by_date || null,
          input.priority ?? 'NORMAL',
          input.funding_source_type,
          input.funding_source_id,
          input.expected_service_life_months ?? null,
          input.default_item_classification ?? null,
          Boolean(input.installation_or_service_required),
          input.special_procurement_requirements?.trim() || null,
          input.remarks?.trim() || null,
          (input.currency ?? 'INR').toUpperCase(),
          totals.product,
          totals.delivery,
          totals.tax,
          totals.installation,
          totals.service,
          totals.miscellaneous,
          totals.total,
          actor.user_id,
        ],
      );
      const version = versionRows[0];
      await this.insertLines(
        manager,
        tenantId,
        version.acquisition_version_id,
        input.lines,
      );
      await manager.query(
        `UPDATE acq_requests SET current_version_id = $2 WHERE acquisition_id = $1`,
        [request.acquisition_id, version.acquisition_version_id],
      );
      await this.writeAudit(
        manager,
        tenantId,
        request.acquisition_id,
        version.acquisition_version_id,
        'DRAFT_CREATED',
        actor.user_id,
        {
          source: input.source ?? 'FALCON',
          line_count: input.lines.length,
          totals,
        },
        input.source === 'IRMS' ? 'INTEGRATION' : 'USER',
        requestId,
      );
      return {
        acquisition_id: request.acquisition_id,
        acquisition_number: number,
        acquisition_version_id: version.acquisition_version_id,
        version_number: 1,
        status: 'DRAFT',
        totals,
      };
    };
    return transactionManager
      ? create(transactionManager)
      : this.db.transaction(create);
  }

  private async getRawVersion(
    tenantId: string,
    versionId: string,
  ): Promise<VersionRow> {
    const rows = await this.db.query(
      `SELECT v.*, r.acquisition_number, r.requester_id, r.requesting_department_id,
              r.source, r.external_reference
       FROM acq_request_versions v
       JOIN acq_requests r ON r.acquisition_id = v.acquisition_id
       WHERE v.acquisition_version_id = $1 AND v.tenant_id = $2`,
      [versionId, tenantId],
    );
    if (!rows[0]) throw new NotFoundException('Acquisition version not found');
    return rows[0] as VersionRow;
  }

  private async assertCanView(actor: AcquisitionActor, row: VersionRow) {
    if (String(row.requester_id) === actor.user_id) return;
    if (
      await this.hasCapability(
        actor,
        'ACQUISITION_VIEW_SCOPE',
        row.requesting_department_id ?? row.intended_department_id,
      )
    )
      return;
    if (await this.hasCapability(actor, 'ACQUISITION_VENDOR_REVIEW')) return;
    if (await this.hasCapability(actor, 'ACQUISITION_BUDGET_OVERSIGHT')) return;
    if (await this.hasCapability(actor, 'ACQUISITION_AUDIT_OVERSIGHT')) return;
    throw new ForbiddenException({
      message: 'Acquisition is outside your scope',
      code: 'ACQUISITION_SCOPE_DENIED',
    });
  }

  async getVersion(actor: AcquisitionActor, versionId: string) {
    const row = await this.getRawVersion(this.tenant(actor), versionId);
    await this.assertCanView(actor, row);
    const [lines, recommendations, reservation, route, decisions, audit] =
      await Promise.all([
        this.db.query(
          `SELECT * FROM acq_lines WHERE acquisition_version_id = $1 ORDER BY line_number`,
          [versionId],
        ),
        this.db.query(
          `SELECT ar.*, v.business_name AS vendor_name
           FROM acq_vendor_recommendations ar
           JOIN fin_vendors v ON v.vendor_id = ar.vendor_id
           WHERE ar.acquisition_version_id = $1 ORDER BY ar.line_id, ar.rank`,
          [versionId],
        ),
        this.db.query(
          `SELECT r.*,
             (SELECT event_type FROM acq_budget_reservation_events e
              WHERE e.budget_reservation_id = r.budget_reservation_id
              ORDER BY e.created_at DESC LIMIT 1) AS status
           FROM acq_budget_reservations r WHERE r.acquisition_version_id = $1`,
          [versionId],
        ),
        this.db.query(
          `SELECT * FROM acq_dofa_route_snapshots WHERE acquisition_version_id = $1`,
          [versionId],
        ),
        this.db.query(
          `SELECT * FROM acq_approval_decisions WHERE acquisition_version_id = $1 ORDER BY approval_level`,
          [versionId],
        ),
        this.db.query(
          `SELECT * FROM acq_audit_events WHERE acquisition_version_id = $1 ORDER BY created_at`,
          [versionId],
        ),
      ]);
    const canSeeVendorPrivate = await this.hasCapability(
      actor,
      'ACQUISITION_VENDOR_REVIEW',
    );
    const scopedLines = lines.map((line: Record<string, any>) => ({
      ...line,
      vendor_contact: canSeeVendorPrivate
        ? this.decryptSensitive(line.vendor_contact)
        : undefined,
      vendor_address: canSeeVendorPrivate
        ? this.decryptSensitive(line.vendor_address)
        : undefined,
    }));
    return {
      ...row,
      lines: scopedLines,
      recommendations,
      budget_reservation: reservation[0] ?? null,
      dofa_route: route[0] ?? null,
      approval_decisions: decisions,
      audit_timeline: audit,
      allowed_actions: await this.allowedActions(actor, row),
    };
  }

  async auditHistory(actor: AcquisitionActor, versionId: string) {
    const row = await this.getRawVersion(this.tenant(actor), versionId);
    await this.assertCanView(actor, row);
    return this.db.query(
      `SELECT audit_event_id,event_type,actor_user_id,actor_type,request_id,
              event_payload,event_hash,previous_event_hash,created_at
       FROM acq_audit_events
       WHERE acquisition_id=$1 AND tenant_id=$2
       ORDER BY created_at,audit_event_id`,
      [row.acquisition_id, this.tenant(actor)],
    );
  }

  async compareVersions(
    actor: AcquisitionActor,
    versionId: string,
    otherId: string,
  ) {
    const [left, right] = await Promise.all([
      this.getRawVersion(this.tenant(actor), versionId),
      this.getRawVersion(this.tenant(actor), otherId),
    ]);
    if (left.acquisition_id !== right.acquisition_id) {
      throw new BadRequestException(
        'Only versions of the same acquisition can be compared',
      );
    }
    await this.assertCanView(actor, left);
    if (!left.snapshot_json || !right.snapshot_json) {
      throw new ConflictException(
        'Both versions must have validated snapshots',
      );
    }
    const before = left.snapshot_json as Record<string, unknown>;
    const after = right.snapshot_json as Record<string, unknown>;
    const keys = Array.from(
      new Set([...Object.keys(before), ...Object.keys(after)]),
    );
    return {
      acquisition_id: left.acquisition_id,
      from: {
        acquisition_version_id: versionId,
        version_number: left.version_number,
        snapshot_hash: left.snapshot_hash,
      },
      to: {
        acquisition_version_id: otherId,
        version_number: right.version_number,
        snapshot_hash: right.snapshot_hash,
      },
      changes: keys
        .filter((key) => stableJson(before[key]) !== stableJson(after[key]))
        .map((key) => ({
          key,
          before: before[key] ?? null,
          after: after[key] ?? null,
        })),
    };
  }

  private async allowedActions(actor: AcquisitionActor, row: VersionRow) {
    const owner = String(row.requester_id) === actor.user_id;
    return {
      edit: owner && row.status === 'DRAFT',
      validate: owner && row.status === 'DRAFT',
      submit: owner && row.status === 'VALIDATED',
      withdraw:
        owner &&
        [
          'VALIDATED',
          'VENDOR_REVIEW',
          'BUDGET_RESERVED',
          'PENDING_DOFA',
        ].includes(row.status),
      amend:
        owner &&
        ['REJECTED', 'APPROVED', 'BUDGET_BLOCKED', 'EXPIRED'].includes(
          row.status,
        ),
      vendor_review:
        row.status === 'VENDOR_REVIEW' &&
        String(row.requester_id) !== actor.user_id &&
        (await this.hasCapability(actor, 'ACQUISITION_VENDOR_REVIEW')),
    };
  }

  async list(actor: AcquisitionActor, status?: string) {
    const tenantId = this.tenant(actor);
    const oversight =
      (await this.hasCapability(actor, 'ACQUISITION_VIEW_SCOPE')) ||
      (await this.hasCapability(actor, 'ACQUISITION_VENDOR_REVIEW')) ||
      (await this.hasCapability(actor, 'ACQUISITION_BUDGET_OVERSIGHT')) ||
      (await this.hasCapability(actor, 'ACQUISITION_AUDIT_OVERSIGHT'));
    let statusSql = '';
    if (status) {
      statusSql = 'AND v.status = $4';
    }
    const current = await this.db.query(
      `SELECT r.acquisition_id, r.acquisition_number, r.requester_id, r.source,
              v.acquisition_version_id, v.version_number, v.status, v.priority,
              v.required_by_date, v.estimated_total, v.currency, v.created_at
       FROM acq_requests r
       JOIN acq_request_versions v ON v.acquisition_version_id = r.current_version_id
       WHERE r.tenant_id = $1 AND ($3::boolean OR r.requester_id = $2)
       ${statusSql}
       ORDER BY v.created_at DESC LIMIT 200`,
      [tenantId, actor.user_id, oversight, ...(status ? [status] : [])],
    );
    const legacy = await this.db.query(
      `SELECT pr_id AS acquisition_id, 'LEGACY-' || left(pr_id::text, 8) AS acquisition_number,
              requested_by AS requester_id, 'LEGACY_P2P' AS source,
              NULL::uuid AS acquisition_version_id, 1 AS version_number, status,
              NULL::text AS priority, NULL::date AS required_by_date,
              amount_estimate AS estimated_total, 'INR' AS currency, created_at
       FROM fin_purchase_requisitions
       WHERE tenant_id = $1 AND ($2::boolean OR requested_by = $3)
       ORDER BY created_at DESC LIMIT 100`,
      [tenantId, oversight, actor.user_id],
    );
    return [...current, ...legacy].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }

  private rowToInput(
    row: VersionRow,
    lines: Record<string, any>[],
  ): CreateAcquisitionInput {
    return {
      requesting_department_id: row.requesting_department_id ?? undefined,
      intended_department_id: row.intended_department_id ?? undefined,
      intended_lab_or_project: row.intended_lab_or_project ?? undefined,
      intended_use_case: row.intended_use_case,
      required_by_date: row.required_by_date,
      priority: row.priority,
      funding_source_type:
        row.funding_source_type as CreateAcquisitionInput['funding_source_type'],
      funding_source_id: row.funding_source_id,
      expected_service_life_months:
        row.expected_service_life_months ?? undefined,
      default_item_classification: row.default_item_classification ?? undefined,
      installation_or_service_required: row.installation_or_service_required,
      special_procurement_requirements:
        row.special_procurement_requirements ?? undefined,
      remarks: row.remarks ?? undefined,
      currency: row.currency,
      lines: lines.map((line) => ({
        acquisition_layout: line.acquisition_layout,
        product_name: line.product_name,
        category: line.category,
        quantity: Number(line.quantity),
        unit: line.unit,
        brand: line.brand ?? undefined,
        model_number: line.model_number ?? undefined,
        part_number: line.part_number ?? undefined,
        technical_specifications: line.technical_specifications,
        product_description: line.product_description ?? undefined,
        intended_use: line.intended_use,
        estimated_unit_price: Number(line.estimated_unit_price),
        delivery_cost: Number(line.delivery_cost),
        tax_cost: Number(line.tax_cost),
        installation_cost: Number(line.installation_cost),
        service_cost: Number(line.service_cost),
        miscellaneous_cost: Number(line.miscellaneous_cost),
        preferred_vendor_id: line.preferred_vendor_id ?? undefined,
        preferred_vendor_name: line.preferred_vendor_name ?? undefined,
        product_url: line.product_url ?? undefined,
        vendor_contact: line.vendor_contact ?? undefined,
        vendor_address: line.vendor_address ?? undefined,
        vendor_business_reference: line.vendor_business_reference ?? undefined,
        return_policy: line.return_policy ?? undefined,
        replacement_policy: line.replacement_policy ?? undefined,
        warranty_requirements: line.warranty_requirements ?? undefined,
        expected_delivery_days: line.expected_delivery_days ?? undefined,
        item_classification: line.item_classification,
        expected_service_life_months:
          line.expected_service_life_months ?? undefined,
        special_procurement_requirements:
          line.special_procurement_requirements ?? undefined,
        remarks: line.remarks ?? undefined,
      })),
    };
  }

  async replaceDraft(
    actor: AcquisitionActor,
    versionId: string,
    input: CreateAcquisitionInput,
  ) {
    try {
      assertSafeAcquisitionInput(input);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid acquisition input',
      );
    }
    const tenantId = this.tenant(actor);
    const row = await this.getRawVersion(tenantId, versionId);
    if (row.requester_id !== actor.user_id)
      throw new ForbiddenException('Only the requester may edit this draft');
    if (row.status !== 'DRAFT')
      throw new ConflictException(
        'Submitted acquisition versions are immutable',
      );
    const totals = calculateAcquisition(input.lines);
    await this.db.transaction(async (manager) => {
      const locked = await manager.query(
        `SELECT status FROM acq_request_versions WHERE acquisition_version_id = $1 AND tenant_id = $2 FOR UPDATE`,
        [versionId, tenantId],
      );
      if (locked[0]?.status !== 'DRAFT')
        throw new ConflictException('Draft changed concurrently');
      await manager.query(
        `UPDATE acq_request_versions SET
           intended_department_id=$2, intended_lab_or_project=$3, intended_use_case=$4,
           required_by_date=$5, priority=$6, funding_source_type=$7, funding_source_id=$8,
           expected_service_life_months=$9, default_item_classification=$10,
           installation_or_service_required=$11, special_procurement_requirements=$12,
           remarks=$13, currency=$14, product_cost=$15, delivery_cost=$16, tax_cost=$17,
           installation_cost=$18, service_cost=$19, miscellaneous_cost=$20,
           estimated_total=$21, updated_at=NOW()
         WHERE acquisition_version_id=$1`,
        [
          versionId,
          input.intended_department_id ?? null,
          input.intended_lab_or_project?.trim() || null,
          input.intended_use_case.trim(),
          input.required_by_date,
          input.priority ?? 'NORMAL',
          input.funding_source_type,
          input.funding_source_id,
          input.expected_service_life_months ?? null,
          input.default_item_classification ?? null,
          Boolean(input.installation_or_service_required),
          input.special_procurement_requirements?.trim() || null,
          input.remarks?.trim() || null,
          (input.currency ?? 'INR').toUpperCase(),
          totals.product,
          totals.delivery,
          totals.tax,
          totals.installation,
          totals.service,
          totals.miscellaneous,
          totals.total,
        ],
      );
      await manager.query(
        `DELETE FROM acq_lines WHERE acquisition_version_id = $1`,
        [versionId],
      );
      await this.insertLines(manager, tenantId, versionId, input.lines);
      await this.writeAudit(
        manager,
        tenantId,
        row.acquisition_id,
        versionId,
        'DRAFT_UPDATED',
        actor.user_id,
        { line_count: input.lines.length, totals },
      );
    });
    return this.getVersion(actor, versionId);
  }

  async validate(actor: AcquisitionActor, versionId: string) {
    const tenantId = this.tenant(actor);
    const row = await this.getRawVersion(tenantId, versionId);
    if (row.requester_id !== actor.user_id)
      throw new ForbiddenException(
        'Only the requester may validate this draft',
      );
    if (row.status !== 'DRAFT')
      throw new ConflictException('Only drafts can be validated');
    const lines = await this.db.query(
      `SELECT * FROM acq_lines WHERE acquisition_version_id=$1 ORDER BY line_number`,
      [versionId],
    );
    const input = this.rowToInput(row, lines);
    const result = validateAcquisition(input);
    await this.db.transaction(async (manager) => {
      for (const line of result.lines) {
        await manager.query(
          `UPDATE acq_lines SET validation_status=$2, validation_errors=$3::jsonb,
             validation_warnings=$4::jsonb WHERE acquisition_version_id=$1 AND line_number=$5`,
          [
            versionId,
            line.errors.length ? 'INVALID' : 'VALID',
            JSON.stringify(line.errors),
            JSON.stringify(line.warnings),
            line.line,
          ],
        );
      }
      await this.writeAudit(
        manager,
        tenantId,
        row.acquisition_id,
        versionId,
        'BUDGET_CHECK_NOT_STARTED',
        actor.user_id,
        { validation: result },
      );
      if (result.valid) {
        const snapshot = {
          ...input,
          calculated_totals: calculateAcquisition(input.lines),
          schema_version: '1.0',
        };
        await manager.query(
          `UPDATE acq_request_versions SET status='VALIDATED', snapshot_json=$2::jsonb,
             snapshot_hash=$3, submitted_at=NOW(), updated_at=NOW()
           WHERE acquisition_version_id=$1 AND status='DRAFT'`,
          [versionId, stableJson(snapshot), sha256(snapshot)],
        );
        await this.writeAudit(
          manager,
          tenantId,
          row.acquisition_id,
          versionId,
          'VALIDATED',
          actor.user_id,
          { snapshot_hash: sha256(snapshot), warnings: result.warnings },
        );
      }
    });
    return { ...result, status: result.valid ? 'VALIDATED' : 'DRAFT' };
  }

  async submit(actor: AcquisitionActor, versionId: string) {
    const tenantId = this.tenant(actor);
    const row = await this.getRawVersion(tenantId, versionId);
    if (row.requester_id !== actor.user_id)
      throw new ForbiddenException('Only the requester may submit');
    const updated = await this.db.query(
      `UPDATE acq_request_versions SET status='VENDOR_REVIEW', updated_at=NOW()
       WHERE acquisition_version_id=$1 AND tenant_id=$2 AND status='VALIDATED' RETURNING *`,
      [versionId, tenantId],
    );
    if (!updated[0])
      throw new ConflictException(
        'Acquisition must be VALIDATED before submission',
      );
    await this.runRecommendationsInternal(tenantId, versionId);
    await this.db.transaction((manager) =>
      this.writeAudit(
        manager,
        tenantId,
        row.acquisition_id,
        versionId,
        'SUBMITTED_FOR_VENDOR_REVIEW',
        actor.user_id,
        {},
      ),
    );
    return this.getVersion(actor, versionId);
  }

  private async runRecommendationsInternal(
    tenantId: string,
    versionId: string,
  ) {
    const existing = await this.db.query(
      `SELECT 1 FROM acq_vendor_recommendations WHERE acquisition_version_id=$1 LIMIT 1`,
      [versionId],
    );
    if (existing.length) return;
    const lines = await this.db.query(
      `SELECT * FROM acq_lines WHERE acquisition_version_id=$1 AND line_status='ACTIVE' ORDER BY line_number`,
      [versionId],
    );
    for (const line of lines) {
      const policies = await this.db.query(
        `SELECT * FROM acq_vendor_scoring_policies
         WHERE tenant_id=$1 AND status='PUBLISHED' AND category IN ($2,'*')
           AND effective_from<=NOW() AND (effective_to IS NULL OR effective_to>NOW())
         ORDER BY CASE WHEN category=$2 THEN 0 ELSE 1 END, policy_version DESC LIMIT 1`,
        [tenantId, line.category],
      );
      const policy = policies[0];
      if (!policy)
        throw new BadRequestException({
          message: `No vendor scoring policy for ${line.category}`,
          code: 'SCORING_POLICY_MISSING',
        });
      const candidates = await this.db.query(
        `SELECT p.*, v.business_name
         FROM acq_vendor_performance p JOIN fin_vendors v ON v.vendor_id=p.vendor_id
         WHERE p.tenant_id=$1 AND v.is_active=true AND p.is_empanelled=true
           AND p.compliance_status='COMPLIANT' AND p.category IN ($2,'*')
         ORDER BY CASE WHEN p.category=$2 THEN 0 ELSE 1 END`,
        [tenantId, line.category],
      );
      const weights = policy.weights as VendorScoreWeights;
      const scored = candidates
        .map((candidate: Record<string, any>) => ({
          candidate,
          score: scoreVendor(weights, {
            price: 50,
            delivery: candidate.delivery_score,
            conformity: candidate.conformity_score,
            invoice_accuracy: candidate.invoice_accuracy_score,
            warranty_service: candidate.warranty_service_score,
            compliance: 100,
            availability: candidate.availability_score,
            evidence_count: Number(candidate.evidence_count),
          }),
        }))
        .sort((a, b) => b.score.finalScore - a.score.finalScore);
      for (let index = 0; index < scored.length; index += 1) {
        const item = scored[index];
        await this.db.query(
          `INSERT INTO acq_vendor_recommendations (
             tenant_id, acquisition_version_id, line_id, vendor_id,
             scoring_policy_id, scoring_policy_version, raw_inputs, factor_scores,
             weighted_calculation, final_score, confidence, eligibility_failures,
             explanation, rank
           ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11,'[]'::jsonb,$12,$13)`,
          [
            tenantId,
            versionId,
            line.line_id,
            item.candidate.vendor_id,
            policy.scoring_policy_id,
            policy.policy_version,
            JSON.stringify(item.candidate),
            JSON.stringify(item.score.factors),
            JSON.stringify(item.score.weighted),
            item.score.finalScore,
            item.score.confidence,
            `${item.candidate.business_name} scored ${item.score.finalScore}/100 under policy v${policy.policy_version}; confidence ${item.score.confidence}.`,
            index + 1,
          ],
        );
      }
      await this.db.query(
        `UPDATE acq_lines SET vendor_review_status=$2 WHERE line_id=$1`,
        [line.line_id, scored.length ? 'RECOMMENDED' : 'PENDING'],
      );
    }
  }

  async runRecommendations(actor: AcquisitionActor, versionId: string) {
    await this.requireCapability(actor, 'ACQUISITION_VENDOR_REVIEW');
    const row = await this.getRawVersion(this.tenant(actor), versionId);
    if (row.status !== 'VENDOR_REVIEW')
      throw new ConflictException('Acquisition is not in vendor review');
    await this.runRecommendationsInternal(this.tenant(actor), versionId);
    return this.getVersion(actor, versionId);
  }

  async selectVendors(
    actor: AcquisitionActor,
    versionId: string,
    selections: Array<{
      line_id: string;
      vendor_id: string;
      deviation_justification?: string;
    }>,
  ) {
    const tenantId = this.tenant(actor);
    await this.requireCapability(actor, 'ACQUISITION_VENDOR_REVIEW');
    const row = await this.getRawVersion(tenantId, versionId);
    if (row.status !== 'VENDOR_REVIEW')
      throw new ConflictException('Acquisition is not in vendor review');
    if (row.requester_id === actor.user_id)
      throw new ForbiddenException({
        message: 'Requester cannot review vendors',
        code: 'SOD_VIOLATION',
      });
    await this.db.transaction(async (manager) => {
      for (const selection of selections) {
        const lines = await manager.query(
          `SELECT * FROM acq_lines WHERE line_id=$1 AND acquisition_version_id=$2 AND line_status='ACTIVE' FOR UPDATE`,
          [selection.line_id, versionId],
        );
        if (!lines[0])
          throw new BadRequestException(
            'Selected line is not part of this acquisition',
          );
        const vendors = await manager.query(
          `SELECT vendor_id FROM fin_vendors WHERE vendor_id=$1 AND tenant_id=$2 AND is_active=true`,
          [selection.vendor_id, tenantId],
        );
        if (!vendors[0])
          throw new BadRequestException('Selected vendor is unavailable');
        const top = await manager.query(
          `SELECT vendor_id FROM acq_vendor_recommendations WHERE line_id=$1 ORDER BY rank LIMIT 1`,
          [selection.line_id],
        );
        const deviates =
          !top[0] || String(top[0].vendor_id) !== selection.vendor_id;
        const justification = selection.deviation_justification?.trim() ?? '';
        if (deviates && justification.length < VENDOR_EXCEPTION_MIN_LENGTH) {
          throw new BadRequestException({
            message: `Non-recommended vendor requires at least ${VENDOR_EXCEPTION_MIN_LENGTH} characters of justification`,
            code: 'VENDOR_DEVIATION_JUSTIFICATION_REQUIRED',
          });
        }
        await manager.query(
          `UPDATE acq_lines SET selected_vendor_id=$2, vendor_deviation_justification=$3,
             vendor_review_status=$4 WHERE line_id=$1`,
          [
            selection.line_id,
            selection.vendor_id,
            justification || null,
            deviates ? 'EXCEPTION' : 'SELECTED',
          ],
        );
        if (deviates) {
          await manager.query(
            `INSERT INTO fin_anomaly_flags (tenant_id, severity, rule_code, details)
             VALUES ($1,'RED','ACQUISITION_VENDOR_DEVIATION',$2::jsonb)`,
            [
              tenantId,
              JSON.stringify({
                acquisition_version_id: versionId,
                line_id: selection.line_id,
                selected_vendor_id: selection.vendor_id,
                justification,
              }),
            ],
          );
        }
      }
      const remaining = await manager.query(
        `SELECT count(*)::int AS count FROM acq_lines
         WHERE acquisition_version_id=$1 AND line_status='ACTIVE' AND selected_vendor_id IS NULL`,
        [versionId],
      );
      if (Number(remaining[0]?.count) > 0)
        throw new BadRequestException(
          'Every active line needs a selected vendor',
        );
      await this.writeAudit(
        manager,
        tenantId,
        row.acquisition_id,
        versionId,
        'VENDORS_SELECTED',
        actor.user_id,
        { selections },
      );
    });
    await this.reserveBudgetAndOpenDofa(actor, row);
    return this.getVersion(actor, versionId);
  }

  private fundingTable(type: string) {
    if (type === 'DEPARTMENT')
      return { table: 'fin_dept_budgets', id: 'budget_id' };
    if (type === 'PROGRAM')
      return { table: 'fin_program_budgets', id: 'program_id' };
    if (type === 'RESEARCH_GRANT')
      return { table: 'research_grants', id: 'grant_id' };
    if (type === 'INSTITUTIONAL')
      return { table: 'fin_university_budgets', id: 'university_budget_id' };
    if (['PROJECT', 'OTHER'].includes(type))
      return { table: 'acq_funding_sources', id: 'funding_source_id' };
    throw new BadRequestException('Unsupported funding source');
  }

  private async reserveBudgetAndOpenDofa(
    actor: AcquisitionActor,
    row: VersionRow,
  ) {
    const tenantId = this.tenant(actor);
    const source = this.fundingTable(row.funding_source_type);
    const reservation = await this.db.transaction(async (manager) => {
      const versions = await manager.query(
        `SELECT * FROM acq_request_versions WHERE acquisition_version_id=$1 AND tenant_id=$2 FOR UPDATE`,
        [row.acquisition_version_id, tenantId],
      );
      if (versions[0]?.status !== 'VENDOR_REVIEW')
        throw new ConflictException('Acquisition changed concurrently');
      const funds = await manager.query(
        `SELECT * FROM ${source.table} WHERE ${source.id}=$1 AND tenant_id=$2 FOR UPDATE`,
        [row.funding_source_id, tenantId],
      );
      if (!funds[0]) {
        await manager.query(
          `UPDATE acq_request_versions SET status='BUDGET_BLOCKED', updated_at=NOW() WHERE acquisition_version_id=$1`,
          [row.acquisition_version_id],
        );
        throw new BadRequestException({
          message: 'Funding source not found',
          code: 'FUNDING_SOURCE_NOT_FOUND',
        });
      }
      const fund = funds[0];
      const allocated = Number(
        fund.allocated_amount ??
          fund.sanctioned_amount ??
          fund.total_allocated ??
          0,
      );
      const utilized = Number(fund.utilized_amount ?? 0);
      const encumbered = Number(fund.encumbered_amount ?? 0);
      const amount = Number(row.estimated_total);
      if (allocated - utilized - encumbered < amount) {
        await manager.query(
          `UPDATE acq_request_versions SET status='BUDGET_BLOCKED', updated_at=NOW() WHERE acquisition_version_id=$1`,
          [row.acquisition_version_id],
        );
        await this.writeAudit(
          manager,
          tenantId,
          row.acquisition_id,
          row.acquisition_version_id,
          'BUDGET_BLOCKED',
          actor.user_id,
          { allocated, utilized, encumbered, requested: amount },
        );
        return null;
      }
      const policies = await manager.query(
        `SELECT reservation_days FROM acq_operational_policies
         WHERE tenant_id=$1 AND status='PUBLISHED'
         ORDER BY policy_version DESC LIMIT 1`,
        [tenantId],
      );
      if (!policies[0])
        throw new BadRequestException(
          'Published acquisition operational policy is required',
        );
      const reservationDays = Number(policies[0].reservation_days);
      await manager.query(
        `UPDATE ${source.table} SET encumbered_amount=COALESCE(encumbered_amount,0)+$2 WHERE ${source.id}=$1 AND tenant_id=$3`,
        [row.funding_source_id, amount, tenantId],
      );
      const reservations = await manager.query(
        `INSERT INTO acq_budget_reservations (
           tenant_id, acquisition_id, acquisition_version_id, funding_source_type,
           funding_source_id, amount, currency, expires_at, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,'INR',NOW()+($7 || ' days')::interval,$8) RETURNING *`,
        [
          tenantId,
          row.acquisition_id,
          row.acquisition_version_id,
          row.funding_source_type,
          row.funding_source_id,
          amount,
          reservationDays,
          actor.user_id,
        ],
      );
      await manager.query(
        `INSERT INTO acq_budget_reservation_events (budget_reservation_id,tenant_id,event_type,reason,actor_user_id)
         VALUES ($1,$2,'RESERVED','Budget availability checked and encumbered',$3)`,
        [reservations[0].budget_reservation_id, tenantId, actor.user_id],
      );
      await manager.query(
        `UPDATE acq_request_versions SET status='BUDGET_RESERVED', expires_at=$2, updated_at=NOW() WHERE acquisition_version_id=$1`,
        [row.acquisition_version_id, reservations[0].expires_at],
      );
      await this.writeAudit(
        manager,
        tenantId,
        row.acquisition_id,
        row.acquisition_version_id,
        'BUDGET_RESERVED',
        actor.user_id,
        {
          budget_reservation_id: reservations[0].budget_reservation_id,
          amount,
        },
      );
      return reservations[0];
    });
    if (!reservation) return;

    try {
      const dofa = await this.dofa.openCase(tenantId, {
        domain: 'ACQUISITION',
        title: `${row.acquisition_number} acquisition approval`,
        requester_id: row.requester_id,
        amount: Number(row.estimated_total),
        source_table: 'acq_request_versions',
        source_id: row.acquisition_version_id,
        payload: {
          acquisition_id: row.acquisition_id,
          snapshot_hash: row.snapshot_hash,
          budget_reservation_id: reservation.budget_reservation_id,
        },
      });
      const graph = await this.db.query(
        `SELECT graph_id, version FROM dofa_policy_graphs
         WHERE tenant_id=$1 AND domain='ACQUISITION' AND status='PUBLISHED'
         ORDER BY version DESC LIMIT 1`,
        [tenantId],
      );
      const matrix = await this.db.query(
        `SELECT required_signatures,exception_escalate_role,rule_key,amount_min,amount_max
         FROM dofa_matrices WHERE matrix_id=$1`,
        [dofa.matrix_id],
      );
      const route = (dofa.steps as Array<Record<string, unknown>>).map(
        (step) => ({
          level: Number(step.step_no) + 1,
          required_role: step.required_role,
          required: true,
          required_signatures: 1,
          escalation_role: matrix[0]?.exception_escalate_role ?? null,
        }),
      );
      const separation = {
        requester_cannot_approve: true,
        distinct_signers: true,
      };
      const ruleInputs = {
        amount: row.estimated_total,
        rule_key: matrix[0]?.rule_key ?? null,
        amount_min: matrix[0]?.amount_min ?? null,
        amount_max: matrix[0]?.amount_max ?? null,
        required_signatures: matrix[0]?.required_signatures ?? route.length,
        escalation_role: matrix[0]?.exception_escalate_role ?? null,
      };
      const routeHash = sha256({
        policy: graph[0] ?? null,
        matrix_id: dofa.matrix_id,
        ruleInputs,
        route,
        separation,
      });
      await this.db.transaction(async (manager) => {
        await manager.query(
          `INSERT INTO acq_dofa_route_snapshots (
             tenant_id, acquisition_version_id, dofa_case_id, policy_graph_id,
             policy_version, matrix_id, rule_inputs, approval_route,
             separation_of_duties, route_snapshot_hash
           ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10)`,
          [
            tenantId,
            row.acquisition_version_id,
            dofa.case_id,
            graph[0]?.graph_id ?? null,
            graph[0]?.version ?? null,
            dofa.matrix_id,
            JSON.stringify(ruleInputs),
            JSON.stringify(route),
            JSON.stringify(separation),
            routeHash,
          ],
        );
        await manager.query(
          `UPDATE acq_request_versions SET status='PENDING_DOFA', dofa_case_id=$2, updated_at=NOW() WHERE acquisition_version_id=$1 AND status='BUDGET_RESERVED'`,
          [row.acquisition_version_id, dofa.case_id],
        );
        await this.writeAudit(
          manager,
          tenantId,
          row.acquisition_id,
          row.acquisition_version_id,
          'DOFA_ROUTE_PINNED',
          actor.user_id,
          {
            dofa_case_id: dofa.case_id,
            route_snapshot_hash: routeHash,
            policy_version: graph[0]?.version ?? null,
          },
        );
      });
    } catch (error) {
      await this.releaseReservation(
        row.acquisition_version_id,
        actor.user_id,
        'DOFA case creation failed',
      );
      await this.db.query(
        `UPDATE acq_request_versions SET status='BUDGET_BLOCKED', updated_at=NOW() WHERE acquisition_version_id=$1`,
        [row.acquisition_version_id],
      );
      throw error;
    }
  }

  async releaseReservation(
    versionId: string,
    actorId: string | null,
    reason: string,
    transactionManager?: EntityManager,
  ) {
    const release = async (manager: EntityManager) => {
      const rows = await manager.query(
        `SELECT r.* FROM acq_budget_reservations r WHERE r.acquisition_version_id=$1 FOR UPDATE`,
        [versionId],
      );
      const reservation = rows[0];
      if (!reservation) return;
      const latest = await manager.query(
        `SELECT event_type FROM acq_budget_reservation_events WHERE budget_reservation_id=$1 ORDER BY created_at DESC LIMIT 1`,
        [reservation.budget_reservation_id],
      );
      if (latest[0]?.event_type !== 'RESERVED') return;
      const source = this.fundingTable(reservation.funding_source_type);
      await manager.query(
        `UPDATE ${source.table} SET encumbered_amount=GREATEST(0,COALESCE(encumbered_amount,0)-$2)
         WHERE ${source.id}=$1 AND tenant_id=$3`,
        [
          reservation.funding_source_id,
          reservation.amount,
          reservation.tenant_id,
        ],
      );
      await manager.query(
        `INSERT INTO acq_budget_reservation_events (budget_reservation_id,tenant_id,event_type,reason,actor_user_id)
         VALUES ($1,$2,'RELEASED',$3,$4)`,
        [
          reservation.budget_reservation_id,
          reservation.tenant_id,
          reason,
          actorId,
        ],
      );
    };
    await (transactionManager
      ? release(transactionManager)
      : this.db.transaction(release));
  }

  async expireDueReservations() {
    const due = await this.db.query(
      `SELECT r.acquisition_version_id
       FROM acq_budget_reservations r
       JOIN LATERAL (
         SELECT event_type FROM acq_budget_reservation_events e
         WHERE e.budget_reservation_id=r.budget_reservation_id
         ORDER BY e.created_at DESC LIMIT 1
       ) latest ON true
       JOIN acq_request_versions v ON v.acquisition_version_id=r.acquisition_version_id
       WHERE latest.event_type='RESERVED' AND r.expires_at<=NOW()
         AND v.status IN ('BUDGET_RESERVED','PENDING_DOFA')
       ORDER BY r.expires_at LIMIT 100`,
    );
    for (const row of due) {
      await this.db.transaction(async (manager) => {
        const reservations = await manager.query(
          `SELECT r.* FROM acq_budget_reservations r
           WHERE r.acquisition_version_id=$1 AND r.expires_at<=NOW() FOR UPDATE`,
          [row.acquisition_version_id],
        );
        const reservation = reservations[0];
        if (!reservation) return;
        const latest = await manager.query(
          `SELECT event_type FROM acq_budget_reservation_events
           WHERE budget_reservation_id=$1 ORDER BY created_at DESC LIMIT 1`,
          [reservation.budget_reservation_id],
        );
        if (latest[0]?.event_type !== 'RESERVED') return;
        const source = this.fundingTable(reservation.funding_source_type);
        await manager.query(
          `UPDATE ${source.table} SET encumbered_amount=GREATEST(0,COALESCE(encumbered_amount,0)-$2)
           WHERE ${source.id}=$1 AND tenant_id=$3`,
          [
            reservation.funding_source_id,
            reservation.amount,
            reservation.tenant_id,
          ],
        );
        await manager.query(
          `INSERT INTO acq_budget_reservation_events
             (budget_reservation_id,tenant_id,event_type,reason)
           VALUES ($1,$2,'EXPIRED','Reservation policy deadline elapsed')`,
          [reservation.budget_reservation_id, reservation.tenant_id],
        );
        await manager.query(
          `UPDATE acq_request_versions SET status='EXPIRED',updated_at=NOW()
           WHERE acquisition_version_id=$1 AND status IN ('BUDGET_RESERVED','PENDING_DOFA')`,
          [reservation.acquisition_version_id],
        );
      });
    }
    return due.length;
  }

  async withdraw(actor: AcquisitionActor, versionId: string) {
    const row = await this.getRawVersion(this.tenant(actor), versionId);
    if (row.requester_id !== actor.user_id)
      throw new ForbiddenException('Only requester may withdraw');
    if (
      ![
        'VALIDATED',
        'VENDOR_REVIEW',
        'BUDGET_RESERVED',
        'PENDING_DOFA',
      ].includes(row.status)
    )
      throw new ConflictException('Acquisition cannot be withdrawn');
    await this.db.transaction(async (manager) => {
      await this.releaseReservation(
        versionId,
        actor.user_id,
        'Requester withdrew acquisition',
        manager,
      );
      await manager.query(
        `UPDATE acq_request_versions SET status='WITHDRAWN', updated_at=NOW()
         WHERE acquisition_version_id=$1`,
        [versionId],
      );
      await this.writeAudit(
        manager,
        this.tenant(actor),
        row.acquisition_id,
        versionId,
        'WITHDRAWN',
        actor.user_id,
        {},
      );
    });
    return this.getVersion(actor, versionId);
  }

  async amend(actor: AcquisitionActor, versionId: string) {
    const tenantId = this.tenant(actor);
    const row = await this.getRawVersion(tenantId, versionId);
    if (row.requester_id !== actor.user_id)
      throw new ForbiddenException('Only requester may amend');
    if (
      ![
        'REJECTED',
        'APPROVED',
        'BUDGET_BLOCKED',
        'EXPIRED',
        'WITHDRAWN',
      ].includes(row.status)
    )
      throw new ConflictException('Current state cannot be amended');
    const newVersionId = await this.db.transaction(async (manager) => {
      await this.releaseReservation(
        versionId,
        actor.user_id,
        'Acquisition superseded by amendment',
        manager,
      );
      const next = Number(row.version_number) + 1;
      const versions = await manager.query(
        `INSERT INTO acq_request_versions (
           acquisition_id, tenant_id, version_number, intended_department_id,
           intended_lab_or_project, intended_use_case, required_by_date, priority,
           funding_source_type, funding_source_id, expected_service_life_months,
           default_item_classification, installation_or_service_required,
           special_procurement_requirements, remarks, currency, product_cost,
           delivery_cost, tax_cost, installation_cost, service_cost, miscellaneous_cost,
           estimated_total, supersedes_version_id, created_by
         ) SELECT acquisition_id, tenant_id, $2, intended_department_id,
           intended_lab_or_project, intended_use_case, required_by_date, priority,
           funding_source_type, funding_source_id, expected_service_life_months,
           default_item_classification, installation_or_service_required,
           special_procurement_requirements, remarks, currency, product_cost,
           delivery_cost, tax_cost, installation_cost, service_cost, miscellaneous_cost,
           estimated_total, acquisition_version_id, $3
         FROM acq_request_versions WHERE acquisition_version_id=$1 RETURNING acquisition_version_id`,
        [versionId, next, actor.user_id],
      );
      const newId = versions[0].acquisition_version_id;
      await manager.query(
        `INSERT INTO acq_lines (
           acquisition_version_id, tenant_id, line_number, acquisition_layout,
           product_name, category, quantity, unit, brand, model_number, part_number,
           technical_specifications, product_description, intended_use,
           estimated_unit_price, estimated_line_total, delivery_cost, tax_cost,
           installation_cost, service_cost, miscellaneous_cost, preferred_vendor_id,
           preferred_vendor_name, product_url, vendor_contact, vendor_address,
           vendor_business_reference, return_policy, replacement_policy,
           warranty_requirements, expected_delivery_days, item_classification,
           expected_service_life_months, special_procurement_requirements, remarks
         ) SELECT $2, tenant_id, line_number, acquisition_layout,
           product_name, category, quantity, unit, brand, model_number, part_number,
           technical_specifications, product_description, intended_use,
           estimated_unit_price, estimated_line_total, delivery_cost, tax_cost,
           installation_cost, service_cost, miscellaneous_cost, preferred_vendor_id,
           preferred_vendor_name, product_url, vendor_contact, vendor_address,
           vendor_business_reference, return_policy, replacement_policy,
           warranty_requirements, expected_delivery_days, item_classification,
           expected_service_life_months, special_procurement_requirements, remarks
         FROM acq_lines WHERE acquisition_version_id=$1 AND line_status<>'EXCLUDED'`,
        [versionId, newId],
      );
      await manager.query(
        `UPDATE acq_request_versions SET status='SUPERSEDED', updated_at=NOW() WHERE acquisition_version_id=$1 AND status<>'APPROVED'`,
        [versionId],
      );
      await manager.query(
        `UPDATE acq_requests SET current_version_id=$2 WHERE acquisition_id=$1`,
        [row.acquisition_id, newId],
      );
      await this.writeAudit(
        manager,
        tenantId,
        row.acquisition_id,
        newId,
        'AMENDMENT_CREATED',
        actor.user_id,
        { supersedes_version_id: versionId, version_number: next },
      );
      return newId;
    });
    return this.getVersion(actor, newVersionId);
  }
}
