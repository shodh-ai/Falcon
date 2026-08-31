/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument -- SQL rows are intentionally dynamic */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { createPublicKey, randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import type {
  EncodeRfidInput,
  InventoryActor,
  MovementType,
  PrepareIdentityInput,
} from './inventory.types';
import {
  inventoryHash,
  normalizedSerial,
  renderIdentifier,
  signInventoryIdentity,
  verifyInventoryIdentity,
} from './inventory.util';

@Injectable()
export class InventoryService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly config: ConfigService,
  ) {}

  private tenant(actor: InventoryActor) {
    if (!actor.tenant_id)
      throw new ForbiddenException('Tenant context required');
    return actor.tenant_id;
  }

  private roles(actor: InventoryActor) {
    return [
      ...new Set([...(actor.roles ?? []), ...(actor.role ? [actor.role] : [])]),
    ].map((role) => role.toLowerCase());
  }

  private grants(actor: InventoryActor, capability: string) {
    return this.db.query(
      `SELECT scope_type,scope_reference FROM acq_access_grants WHERE tenant_id=$1 AND capability=$2
       AND valid_from<=NOW() AND (valid_until IS NULL OR valid_until>NOW())
       AND (principal_user_id=$3::uuid OR lower(principal_role)=ANY($4::text[]))`,
      [this.tenant(actor), capability, actor.user_id, this.roles(actor)],
    );
  }

  private async accessible(
    actor: InventoryActor,
    id: string,
    capability = 'INVENTORY_VIEW',
  ) {
    const grants = await this.grants(actor, capability);
    if (!grants.length)
      throw new ForbiddenException({
        message: `Missing scoped capability ${capability}`,
        code: 'INVENTORY_CAPABILITY_REQUIRED',
      });
    const tenantWide = grants.some(
      (grant: any) => grant.scope_type === 'TENANT',
    );
    const departments = grants
      .filter((grant: any) => grant.scope_type === 'DEPARTMENT')
      .map((grant: any) => Number(grant.scope_reference))
      .filter(Number.isInteger);
    const rows = await this.db.query(
      `SELECT r.*,m.product_model_code,m.product_name,m.category,m.brand,m.manufacturer,m.model_number,b.batch_code,b.receipt_line_id
       FROM inv_records r JOIN inv_product_models m ON m.product_model_id=r.product_model_id
       JOIN inv_procurement_batches b ON b.procurement_batch_id=r.procurement_batch_id
       WHERE r.inventory_record_id=$1 AND r.tenant_id=$2 AND ($3::boolean OR r.owner_department_id=ANY($4::int[]))`,
      [id, this.tenant(actor), tenantWide, departments],
    );
    if (!rows[0]) throw new NotFoundException('Inventory record not found');
    return rows[0];
  }

  private async locked(manager: EntityManager, id: string, tenantId: string) {
    const rows = await manager.query(
      `SELECT * FROM inv_records WHERE inventory_record_id=$1 AND tenant_id=$2 FOR UPDATE`,
      [id, tenantId],
    );
    if (!rows[0]) throw new NotFoundException('Inventory record not found');
    return rows[0];
  }

  private assertRevision(row: any, expected: number) {
    if (!Number.isInteger(expected) || expected <= 0)
      throw new BadRequestException('If-Match revision is required');
    if (Number(row.aggregate_revision) !== expected)
      throw new ConflictException({
        message: 'Inventory record changed',
        code: 'STALE_REVISION',
        current_revision: Number(row.aggregate_revision),
      });
  }

  private async validateTargetReferences(
    manager: EntityManager,
    tenantId: string,
    input: {
      owner_department_id?: unknown;
      custodian_user_id?: unknown;
      location_space_id?: unknown;
    },
  ) {
    if (input.owner_department_id !== undefined) {
      const departmentId = Number(input.owner_department_id);
      if (
        !Number.isInteger(departmentId) ||
        !(
          await manager.query(`SELECT 1 FROM departments WHERE dept_id=$1`, [
            departmentId,
          ])
        )[0]
      )
        throw new BadRequestException('Owner department is invalid');
    }
    if (
      input.custodian_user_id &&
      !(
        await manager.query(
          `SELECT 1 FROM users WHERE user_id=$1 AND tenant_id=$2 AND is_active=true`,
          [input.custodian_user_id, tenantId],
        )
      )[0]
    )
      throw new BadRequestException('Custodian is outside the tenant scope');
    if (
      input.location_space_id &&
      !(
        await manager.query(
          `SELECT 1 FROM campus_spaces WHERE space_id=$1 AND tenant_id=$2`,
          [input.location_space_id, tenantId],
        )
      )[0]
    )
      throw new BadRequestException('Location is outside the tenant scope');
  }

  private async withIdempotency<T>(
    manager: EntityManager,
    tenantId: string,
    actorId: string,
    key: string,
    input: unknown,
    work: () => Promise<T>,
  ): Promise<T> {
    if (!key?.trim())
      throw new BadRequestException('Idempotency-Key is required');
    await manager.query(
      `SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))`,
      [tenantId, `${actorId}:${key}`],
    );
    const requestHash = inventoryHash(input);
    const prior = await manager.query(
      `SELECT request_hash,response_payload FROM inv_idempotency WHERE tenant_id=$1 AND actor_id=$2 AND idempotency_key=$3 FOR UPDATE`,
      [tenantId, actorId, key],
    );
    if (prior[0]) {
      if (prior[0].request_hash !== requestHash)
        throw new ConflictException({
          message: 'Idempotency key reused with changed payload',
          code: 'IDEMPOTENCY_PAYLOAD_CONFLICT',
        });
      if (prior[0].response_payload) return prior[0].response_payload as T;
    } else
      await manager.query(
        `INSERT INTO inv_idempotency(tenant_id,actor_id,idempotency_key,request_hash) VALUES($1,$2,$3,$4)`,
        [tenantId, actorId, key, requestHash],
      );
    const response = await work();
    await manager.query(
      `UPDATE inv_idempotency SET response_payload=$4::jsonb WHERE tenant_id=$1 AND actor_id=$2 AND idempotency_key=$3`,
      [tenantId, actorId, key, JSON.stringify(response)],
    );
    return response;
  }

  private async audit(
    manager: EntityManager,
    row: any,
    entityType: string,
    entityId: string,
    eventType: string,
    actorId: string | null,
    previous: unknown,
    next: unknown,
    reason?: string,
  ) {
    const last = await manager.query(
      `SELECT event_hash FROM inv_audit_events WHERE inventory_record_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [row.inventory_record_id],
    );
    const eventHash = inventoryHash({
      inventory_record_id: row.inventory_record_id,
      entityType,
      entityId,
      eventType,
      actorId,
      previous,
      next,
      reason,
      previous_hash: last[0]?.event_hash ?? null,
    });
    await manager.query(
      `INSERT INTO inv_audit_events(tenant_id,inventory_record_id,entity_type,entity_id,event_type,actor_id,previous_value,new_value,reason,previous_hash,event_hash) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11)`,
      [
        row.tenant_id,
        row.inventory_record_id,
        entityType,
        entityId,
        eventType,
        actorId,
        previous ? JSON.stringify(previous) : null,
        next ? JSON.stringify(next) : null,
        reason ?? null,
        last[0]?.event_hash ?? null,
        eventHash,
      ],
    );
  }

  private async emit(
    manager: EntityManager,
    row: any,
    eventType: string,
    payload: Record<string, unknown>,
  ) {
    const eventId = randomUUID();
    const sequence = Number(row.next_event_sequence);
    const revision = Number(row.aggregate_revision) + 1;
    const occurredAt = new Date().toISOString();
    const envelope = {
      event_id: eventId,
      event_type: eventType,
      event_version: 1,
      aggregate_id: row.inventory_record_id,
      aggregate_revision: revision,
      aggregate_sequence: sequence,
      tenant_id: row.tenant_id,
      inventory_record_id: row.inventory_record_id,
      subject_id: row.subject_id,
      occurred_at: occurredAt,
      ...payload,
    };
    await manager.query(
      `INSERT INTO inv_outbox_events(event_id,tenant_id,inventory_record_id,subject_id,aggregate_id,aggregate_revision,aggregate_sequence,event_type,occurred_at,payload,payload_hash) VALUES($1,$2,$3,$4,$3,$5,$6,$7,$8,$9::jsonb,$10)`,
      [
        eventId,
        row.tenant_id,
        row.inventory_record_id,
        row.subject_id,
        revision,
        sequence,
        eventType,
        occurredAt,
        JSON.stringify(envelope),
        inventoryHash(envelope),
      ],
    );
    await manager.query(
      `UPDATE inv_records SET aggregate_revision=$2,next_event_sequence=$3,updated_at=NOW() WHERE inventory_record_id=$1`,
      [row.inventory_record_id, revision, sequence + 1],
    );
    row.aggregate_revision = revision;
    row.next_event_sequence = sequence + 1;
    return envelope;
  }

  private async syncLotProjection(
    manager: EntityManager,
    inventoryRecordId: string,
  ) {
    await manager.query(
      `UPDATE inventory_items i
       SET quantity=GREATEST(0,FLOOR(COALESCE((SELECT SUM(m.signed_quantity) FROM inv_lot_movements m WHERE m.inventory_record_id=$1),0)))::int
       WHERE i.module5_source_id=$1 AND i.module5_managed=true`,
      [inventoryRecordId],
    );
  }

  private signingConfiguration() {
    const privateKey = this.config
      .get<string>('INVENTORY_ED25519_PRIVATE_KEY')
      ?.replace(/\\n/g, '\n');
    const keyVersion = this.config.get<string>('INVENTORY_SIGNING_KEY_VERSION');
    if (!privateKey || !keyVersion)
      throw new ConflictException({
        message: 'Inventory signing key is unavailable',
        code: 'INVENTORY_SIGNING_UNAVAILABLE',
      });
    return { privateKey, keyVersion };
  }

  private async nextCode(
    manager: EntityManager,
    tenantId: string,
    codeType: string,
    pattern: string,
  ) {
    const tenants = await manager.query(
      `SELECT subdomain FROM tenants WHERE tenant_id=$1`,
      [tenantId],
    );
    const now = new Date();
    const period =
      codeType === 'BATCH'
        ? `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`
        : ['ASSET', 'RFID', 'LOT'].includes(codeType)
          ? String(now.getUTCFullYear())
          : 'ALL';
    await manager.query(
      `INSERT INTO inv_code_sequences(tenant_id,code_type,period_key,next_value) VALUES($1,$2,$3,1) ON CONFLICT DO NOTHING`,
      [tenantId, codeType, period],
    );
    const rows = await manager.query(
      `UPDATE inv_code_sequences SET next_value=next_value+1,updated_at=NOW() WHERE tenant_id=$1 AND code_type=$2 AND period_key=$3 RETURNING next_value-1 AS allocated`,
      [tenantId, codeType, period],
    );
    return renderIdentifier(
      pattern,
      tenants[0]?.subdomain ?? tenantId.slice(0, 8),
      Number(rows[0].allocated),
      now,
    );
  }

  async dashboard(actor: InventoryActor) {
    const grants = await this.grants(actor, 'INVENTORY_VIEW');
    if (!grants.length)
      throw new ForbiddenException('Inventory access required');
    const tenantWide = grants.some((g: any) => g.scope_type === 'TENANT');
    const departments = grants
      .filter((g: any) => g.scope_type === 'DEPARTMENT')
      .map((g: any) => Number(g.scope_reference))
      .filter(Number.isInteger);
    const rows = await this.db.query(
      `SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE record_status='ACTIVE')::int active,COUNT(*) FILTER(WHERE record_status='IDENTITY_PENDING')::int identity_pending,COUNT(*) FILTER(WHERE record_status='QUARANTINED')::int quarantined,COUNT(*) FILTER(WHERE record_type='ITEM')::int items,COUNT(*) FILTER(WHERE record_type='LOT')::int lots FROM inv_records WHERE tenant_id=$1 AND($2::boolean OR owner_department_id=ANY($3::int[]))`,
      [this.tenant(actor), tenantWide, departments],
    );
    return rows[0];
  }

  async publishIdentifierPolicy(
    actor: InventoryActor,
    input: {
      product_pattern: string;
      batch_pattern: string;
      asset_pattern: string;
      rfid_pattern: string;
      lot_pattern: string;
    },
  ) {
    if (!(await this.grants(actor, 'INVENTORY_POLICY_ADMIN')).length)
      throw new ForbiddenException('Inventory policy administration required');
    for (const pattern of Object.values(input))
      if (!pattern.includes('{seq6}') || !pattern.includes('{tenant}'))
        throw new BadRequestException(
          'Identifier patterns require {tenant} and {seq6}',
        );
    return this.db.transaction(async (manager) => {
      await manager.query(
        `SELECT pg_advisory_xact_lock(hashtext($1),hashtext('inventory-identifier-policy'))`,
        [this.tenant(actor)],
      );
      const current = await manager.query(
        `SELECT COALESCE(MAX(policy_version),0) version FROM inv_identifier_policies WHERE tenant_id=$1`,
        [this.tenant(actor)],
      );
      const version = Number(current[0].version) + 1;
      await manager.query(
        `UPDATE inv_identifier_policies SET status='SUPERSEDED',effective_to=NOW() WHERE tenant_id=$1 AND status='PUBLISHED'`,
        [this.tenant(actor)],
      );
      const rows = await manager.query(
        `INSERT INTO inv_identifier_policies(tenant_id,policy_version,status,product_pattern,batch_pattern,asset_pattern,rfid_pattern,lot_pattern,published_by,published_at) VALUES($1,$2,'PUBLISHED',$3,$4,$5,$6,$7,$8,NOW()) RETURNING *`,
        [
          this.tenant(actor),
          version,
          input.product_pattern,
          input.batch_pattern,
          input.asset_pattern,
          input.rfid_pattern,
          input.lot_pattern,
          actor.user_id,
        ],
      );
      return rows[0];
    });
  }

  async policies(actor: InventoryActor) {
    if (!(await this.grants(actor, 'INVENTORY_VIEW')).length)
      throw new ForbiddenException('Inventory access required');
    const [identifier, categories] = await Promise.all([
      this.db.query(
        `SELECT * FROM inv_identifier_policies WHERE tenant_id=$1 AND status='PUBLISHED' ORDER BY policy_version DESC LIMIT 1`,
        [this.tenant(actor)],
      ),
      this.db.query(
        `SELECT * FROM inv_category_policies WHERE tenant_id=$1 AND status='PUBLISHED' ORDER BY category,subject_type,policy_version DESC`,
        [this.tenant(actor)],
      ),
    ]);
    return {
      identifier_policy: identifier[0] ?? null,
      category_policies: categories,
    };
  }

  async publishCategoryPolicy(
    actor: InventoryActor,
    input: {
      category?: string;
      subject_type: 'ITEM' | 'LOT';
      required_attributes?: string[];
      manufacturer_serial_required?: boolean;
      rfid_required?: boolean;
    },
  ) {
    if (!(await this.grants(actor, 'INVENTORY_POLICY_ADMIN')).length)
      throw new ForbiddenException('Inventory policy administration required');
    if (!['ITEM', 'LOT'].includes(input.subject_type))
      throw new BadRequestException('ITEM or LOT subject type required');
    if (input.subject_type === 'LOT' && input.manufacturer_serial_required)
      throw new BadRequestException(
        'Manufacturer serial cannot be required for LOT inventory',
      );
    const category = input.category?.trim() || '*';
    return this.db.transaction(async (manager) => {
      await manager.query(
        `SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))`,
        [
          this.tenant(actor),
          `inventory-category-policy:${category}:${input.subject_type}`,
        ],
      );
      const current = await manager.query(
        `SELECT COALESCE(MAX(policy_version),0) version FROM inv_category_policies WHERE tenant_id=$1 AND category=$2 AND subject_type=$3`,
        [this.tenant(actor), category, input.subject_type],
      );
      const version = Number(current[0].version) + 1;
      await manager.query(
        `UPDATE inv_category_policies SET status='SUPERSEDED',effective_to=NOW() WHERE tenant_id=$1 AND category=$2 AND subject_type=$3 AND status='PUBLISHED'`,
        [this.tenant(actor), category, input.subject_type],
      );
      const rows = await manager.query(
        `INSERT INTO inv_category_policies(tenant_id,category,subject_type,policy_version,status,required_attributes,manufacturer_serial_required,rfid_required,published_by,published_at) VALUES($1,$2,$3,$4,'PUBLISHED',$5::jsonb,$6,$7,$8,NOW()) RETURNING *`,
        [
          this.tenant(actor),
          category,
          input.subject_type,
          version,
          JSON.stringify(input.required_attributes ?? []),
          Boolean(input.manufacturer_serial_required),
          Boolean(input.rfid_required),
          actor.user_id,
        ],
      );
      return rows[0];
    });
  }

  async legacyQueue(actor: InventoryActor) {
    if (!(await this.grants(actor, 'INVENTORY_LEGACY_RECONCILE')).length)
      throw new ForbiddenException('Legacy reconciliation capability required');
    return this.db.query(
      `SELECT 'university_assets' legacy_source,a.asset_id legacy_record_id,a.asset_tag legacy_code,a.name,false module5_managed,
              COALESCE(r.status,'LEGACY') reconciliation_status,r.candidate_inventory_record_id
       FROM university_assets a LEFT JOIN inv_legacy_reconciliations r ON r.tenant_id=a.tenant_id AND r.legacy_source='university_assets' AND r.legacy_record_id=a.asset_id
       WHERE a.tenant_id=$1 AND a.module5_managed=false
       UNION ALL
       SELECT 'inventory_items',i.inventory_item_id,i.item_code,i.item_name,false,COALESCE(r.status,'LEGACY'),r.candidate_inventory_record_id
       FROM inventory_items i LEFT JOIN inv_legacy_reconciliations r ON r.tenant_id=i.tenant_id AND r.legacy_source='inventory_items' AND r.legacy_record_id=i.inventory_item_id
       WHERE i.tenant_id=$1 AND i.module5_managed=false ORDER BY legacy_source,legacy_code`,
      [this.tenant(actor)],
    );
  }

  async reconcileLegacy(
    actor: InventoryActor,
    key: string,
    input: {
      legacy_source: 'university_assets' | 'inventory_items';
      legacy_record_id: string;
      candidate_inventory_record_id?: string;
      decision: 'RECONCILIATION_REQUIRED' | 'RECONCILED' | 'REJECTED_DUPLICATE';
      reason: string;
    },
  ) {
    if (!(await this.grants(actor, 'INVENTORY_LEGACY_RECONCILE')).length)
      throw new ForbiddenException('Legacy reconciliation capability required');
    if (!input.reason?.trim())
      throw new BadRequestException('Reconciliation reason required');
    return this.db.transaction(async (manager) =>
      this.withIdempotency(
        manager,
        this.tenant(actor),
        actor.user_id,
        key,
        input,
        async () => {
          if (input.candidate_inventory_record_id) {
            const candidate = await manager.query(
              `SELECT 1 FROM inv_records WHERE inventory_record_id=$1 AND tenant_id=$2`,
              [input.candidate_inventory_record_id, this.tenant(actor)],
            );
            if (!candidate[0])
              throw new NotFoundException(
                'Candidate inventory record not found',
              );
          }
          const rows = await manager.query(
            `INSERT INTO inv_legacy_reconciliations(tenant_id,legacy_source,legacy_record_id,candidate_inventory_record_id,status,evidence,requested_by,decided_by,decision_reason,decided_at)
           VALUES($1,$2,$3,$4,$5,'{}',$6,$6,$7,NOW())
           ON CONFLICT(tenant_id,legacy_source,legacy_record_id) DO UPDATE SET candidate_inventory_record_id=EXCLUDED.candidate_inventory_record_id,status=EXCLUDED.status,decided_by=EXCLUDED.decided_by,decision_reason=EXCLUDED.decision_reason,decided_at=NOW() RETURNING *`,
            [
              this.tenant(actor),
              input.legacy_source,
              input.legacy_record_id,
              input.candidate_inventory_record_id ?? null,
              input.decision,
              actor.user_id,
              input.reason.trim(),
            ],
          );
          if (
            input.decision === 'RECONCILED' &&
            input.candidate_inventory_record_id
          ) {
            const table =
              input.legacy_source === 'university_assets'
                ? 'university_assets'
                : 'inventory_items';
            const idColumn =
              input.legacy_source === 'university_assets'
                ? 'asset_id'
                : 'inventory_item_id';
            await manager.query(
              `UPDATE ${table} SET module5_source_id=$1,module5_managed=true WHERE ${idColumn}=$2 AND tenant_id=$3`,
              [
                input.candidate_inventory_record_id,
                input.legacy_record_id,
                this.tenant(actor),
              ],
            );
          }
          return rows[0];
        },
      ),
    );
  }

  async list(actor: InventoryActor, search?: string, status?: string) {
    const grants = await this.grants(actor, 'INVENTORY_VIEW');
    if (!grants.length)
      throw new ForbiddenException('Inventory access required');
    const tenantWide = grants.some((g: any) => g.scope_type === 'TENANT');
    const departments = grants
      .filter((g: any) => g.scope_type === 'DEPARTMENT')
      .map((g: any) => Number(g.scope_reference))
      .filter(Number.isInteger);
    return this.db.query(
      `SELECT r.inventory_record_id,r.record_type,r.university_asset_id,r.lot_id,r.record_status,r.lifecycle_status,r.owner_department_id,r.location_text,r.condition,r.aggregate_revision,m.product_model_code,m.product_name,m.category,m.brand,m.model_number,b.batch_code,lr.logical_rfid_code FROM inv_records r JOIN inv_product_models m ON m.product_model_id=r.product_model_id JOIN inv_procurement_batches b ON b.procurement_batch_id=r.procurement_batch_id LEFT JOIN inv_logical_rfids lr ON lr.inventory_record_id=r.inventory_record_id WHERE r.tenant_id=$1 AND ($2::boolean OR r.owner_department_id=ANY($3::int[])) AND ($4::text IS NULL OR r.record_status=$4) AND ($5::text IS NULL OR m.product_name ILIKE '%'||$5||'%' OR r.university_asset_id ILIKE '%'||$5||'%' OR r.lot_id ILIKE '%'||$5||'%' OR lr.logical_rfid_code ILIKE '%'||$5||'%') ORDER BY r.updated_at DESC LIMIT 200`,
      [
        this.tenant(actor),
        tenantWide,
        departments,
        status ?? null,
        search?.trim() || null,
      ],
    );
  }

  async get(actor: InventoryActor, id: string) {
    const row = await this.accessible(actor, id);
    const financial = (await this.grants(actor, 'INVENTORY_FINANCIAL_VIEW'))
      .length
      ? await this.db.query(
          `SELECT * FROM inv_financial_projections WHERE inventory_record_id=$1 ORDER BY source_revision DESC`,
          [id],
        )
      : [];
    const [source, identity, rfid, movements, history, discrepancies, audits] =
      await Promise.all([
        this.db.query(
          `SELECT source_snapshot_id,source_event_id,source_event_hash,verification_record_hash,evidence_manifest_hash,reference_snapshot_hash,snapshot_hash,created_at FROM inv_source_snapshots WHERE inventory_record_id=$1`,
          [id],
        ),
        this.db.query(
          `SELECT * FROM inv_identity_revisions WHERE inventory_record_id=$1 ORDER BY identity_revision DESC`,
          [id],
        ),
        this.db.query(
          `SELECT l.*,COALESCE(json_agg(b ORDER BY b.encoded_at) FILTER(WHERE b.rfid_binding_id IS NOT NULL),'[]') bindings FROM inv_logical_rfids l LEFT JOIN inv_rfid_bindings b ON b.logical_rfid_id=l.logical_rfid_id WHERE l.inventory_record_id=$1 GROUP BY l.logical_rfid_id`,
          [id],
        ),
        this.db.query(
          `SELECT * FROM inv_lot_movements WHERE inventory_record_id=$1 ORDER BY occurred_at`,
          [id],
        ),
        this.db.query(
          `SELECT * FROM inv_state_history WHERE inventory_record_id=$1 ORDER BY created_at DESC`,
          [id],
        ),
        this.db.query(
          `SELECT * FROM inv_discrepancies WHERE inventory_record_id=$1 ORDER BY created_at DESC`,
          [id],
        ),
        this.db.query(
          `SELECT * FROM inv_audit_events WHERE inventory_record_id=$1 ORDER BY created_at DESC LIMIT 200`,
          [id],
        ),
      ]);
    return {
      ...row,
      source,
      identity_revisions: identity,
      rfid: rfid[0] ?? null,
      lot_movements: movements,
      state_history: history,
      discrepancies,
      financial_projections: financial,
      audit_timeline: audits,
    };
  }

  async consumeVerifiedProduct(eventId: string) {
    return this.db.transaction(async (manager) => {
      if (
        (
          await manager.query(
            `SELECT 1 FROM inv_consumed_events WHERE event_id=$1`,
            [eventId],
          )
        )[0]
      )
        return { duplicate: true };
      const events = await manager.query(
        `SELECT * FROM pv_outbox_events WHERE event_id=$1 AND event_type='PhysicalProductVerified.v1' FOR UPDATE`,
        [eventId],
      );
      const event = events[0];
      if (!event || inventoryHash(event.payload) !== event.payload_hash)
        throw new ConflictException(
          'Physical verification event hash mismatch',
        );
      const payload = event.payload;
      const sources = await manager.query(
        `SELECT s.*,c.proc_case_id,c.proc_case_line_id,c.acquisition_line_id,c.order_line_id,c.receipt_line_id,c.vendor_id,c.department_id,pcl.product_name,pcl.category,pcl.unit,pcl.approved_unit_price,pcl.currency,al.brand,al.model,al.part_number,al.technical_specifications,al.expected_service_life_months,rs.acquisition_snapshot,rs.order_snapshot,rs.receipt_snapshot,rs.invoice_snapshot,i.status identity_status,i.signed_payload,i.signature FROM pv_subjects s JOIN pv_cases c ON c.verification_case_id=s.verification_case_id JOIN proc_case_lines pcl ON pcl.proc_case_line_id=c.proc_case_line_id JOIN acq_lines al ON al.line_id=c.acquisition_line_id JOIN pv_verification_identities i ON i.verification_identity_id=$2 AND i.subject_id=s.subject_id LEFT JOIN pv_reference_snapshots rs ON rs.subject_id=s.subject_id AND rs.snapshot_hash=$3 WHERE s.subject_id=$1 AND s.tenant_id=$4`,
        [
          payload.subject_id,
          payload.verification_identity_id,
          payload.reference_snapshot_hash,
          event.tenant_id,
        ],
      );
      const source = sources[0];
      if (
        !source ||
        source.identity_status !== 'ACTIVE' ||
        Number(source.verification_revision) !==
          Number(payload.verification_revision)
      )
        throw new ConflictException(
          'Current active Module 4 identity required',
        );
      const policies = await manager.query(
        `SELECT ip.*,cp.category_policy_id,cp.required_attributes,cp.manufacturer_serial_required,cp.rfid_required FROM inv_identifier_policies ip JOIN LATERAL(SELECT * FROM inv_category_policies WHERE tenant_id=ip.tenant_id AND subject_type=$2 AND category IN($3,'*') AND status='PUBLISHED' AND effective_from<=NOW() AND(effective_to IS NULL OR effective_to>NOW()) ORDER BY CASE WHEN category=$3 THEN 0 ELSE 1 END,policy_version DESC LIMIT 1) cp ON true WHERE ip.tenant_id=$1 AND ip.status='PUBLISHED' AND ip.effective_from<=NOW() AND(ip.effective_to IS NULL OR ip.effective_to>NOW()) ORDER BY ip.policy_version DESC LIMIT 1`,
        [event.tenant_id, payload.subject_type, source.category],
      );
      if (!policies[0])
        throw new ConflictException('Published Module 5 policies required');
      const policy = policies[0];
      const fingerprint = inventoryHash({
        category: source.category,
        brand: source.brand ?? '',
        manufacturer: source.manufacturer ?? '',
        model: source.model ?? '',
        part_number: source.part_number ?? '',
        specs: source.technical_specifications ?? {},
      });
      let models = await manager.query(
        `SELECT * FROM inv_product_models WHERE tenant_id=$1 AND normalized_fingerprint=$2 FOR UPDATE`,
        [event.tenant_id, fingerprint],
      );
      if (!models[0]) {
        const code = await this.nextCode(
          manager,
          event.tenant_id,
          'PRODUCT',
          policy.product_pattern,
        );
        models = await manager.query(
          `INSERT INTO inv_product_models(tenant_id,product_model_code,product_name,category,brand,manufacturer,model_number,part_number,technical_specifications,normalized_fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10) RETURNING *`,
          [
            event.tenant_id,
            code,
            source.product_name,
            source.category,
            source.brand ?? null,
            source.manufacturer ?? null,
            source.model ?? null,
            source.part_number ?? null,
            JSON.stringify(source.technical_specifications ?? {}),
            fingerprint,
          ],
        );
      }
      let batches = await manager.query(
        `SELECT * FROM inv_procurement_batches WHERE tenant_id=$1 AND receipt_line_id=$2 AND product_model_id=$3 FOR UPDATE`,
        [event.tenant_id, source.receipt_line_id, models[0].product_model_id],
      );
      if (!batches[0]) {
        const code = await this.nextCode(
          manager,
          event.tenant_id,
          'BATCH',
          policy.batch_pattern,
        );
        const previous = await manager.query(
          `SELECT COALESCE(SUM(CASE WHEN r.record_type='ITEM' AND r.record_status='ACTIVE' THEN 1 WHEN r.record_type='LOT' AND r.record_status='ACTIVE' THEN COALESCE((SELECT SUM(signed_quantity) FROM inv_lot_movements lm WHERE lm.inventory_record_id=r.inventory_record_id),0) ELSE 0 END),0) stock FROM inv_records r WHERE r.tenant_id=$1 AND r.product_model_id=$2`,
          [event.tenant_id, models[0].product_model_id],
        );
        batches = await manager.query(
          `INSERT INTO inv_procurement_batches(tenant_id,batch_code,product_model_id,proc_case_id,acquisition_line_id,order_line_id,receipt_line_id,vendor_id,batch_quantity,unit_of_measure,previous_stock,resulting_stock) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11+$9) RETURNING *`,
          [
            event.tenant_id,
            code,
            models[0].product_model_id,
            source.proc_case_id,
            source.acquisition_line_id,
            source.order_line_id,
            source.receipt_line_id,
            source.vendor_id,
            payload.verified_quantity,
            payload.unit_of_measure,
            previous[0].stock,
          ],
        );
      }
      const recordId = randomUUID();
      const permanentCode = await this.nextCode(
        manager,
        event.tenant_id,
        payload.subject_type === 'ITEM' ? 'ASSET' : 'LOT',
        payload.subject_type === 'ITEM'
          ? policy.asset_pattern
          : policy.lot_pattern,
      );
      const rows = await manager.query(
        `INSERT INTO inv_records(inventory_record_id,tenant_id,subject_id,verification_identity_id,product_model_id,procurement_batch_id,record_type,university_asset_id,lot_id,record_status,owner_department_id,category_policy_id,identifier_policy_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'IDENTITY_PENDING',$10,$11,$12) RETURNING *`,
        [
          recordId,
          event.tenant_id,
          payload.subject_id,
          payload.verification_identity_id,
          models[0].product_model_id,
          batches[0].procurement_batch_id,
          payload.subject_type,
          payload.subject_type === 'ITEM' ? permanentCode : null,
          payload.subject_type === 'LOT' ? permanentCode : null,
          source.department_id,
          policy.category_policy_id,
          policy.identifier_policy_id,
        ],
      );
      const context = {
        product: models[0],
        batch: batches[0],
        procurement: {
          proc_case_id: source.proc_case_id,
          acquisition_line_id: source.acquisition_line_id,
          order_line_id: source.order_line_id,
          receipt_line_id: source.receipt_line_id,
          vendor_id: source.vendor_id,
          unit_price: source.approved_unit_price,
          currency: source.currency,
        },
        module4: {
          verification_identity_id: payload.verification_identity_id,
          verification_revision: payload.verification_revision,
          signature: payload.signature,
        },
      };
      const snapshotHash = inventoryHash({ source: payload, context });
      await manager.query(
        `INSERT INTO inv_source_snapshots(tenant_id,inventory_record_id,source_event_id,source_event_hash,verification_record_hash,evidence_manifest_hash,reference_snapshot_hash,source_payload,source_context,snapshot_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10)`,
        [
          event.tenant_id,
          recordId,
          eventId,
          event.payload_hash,
          payload.verification_record_hash,
          payload.evidence_manifest_hash,
          payload.reference_snapshot_hash,
          JSON.stringify(payload),
          JSON.stringify(context),
          snapshotHash,
        ],
      );
      if (payload.subject_type === 'LOT')
        await manager.query(
          `INSERT INTO inv_lot_movements(movement_group_id,tenant_id,inventory_record_id,movement_type,quantity,signed_quantity,unit_of_measure,reason,actor_id,occurred_at) VALUES($1,$2,$3,'RECEIPT',$4,$4,$5,'Verified Module 4 receipt',$6,$7)`,
          [
            randomUUID(),
            event.tenant_id,
            recordId,
            payload.verified_quantity,
            payload.unit_of_measure,
            source.created_by,
            payload.verified_at,
          ],
        );
      const row = rows[0];
      await this.audit(
        manager,
        row,
        'INVENTORY_RECORD',
        recordId,
        'INVENTORY_INGESTED',
        null,
        null,
        { source_event_id: eventId, snapshot_hash: snapshotHash },
      );
      const started = await this.emit(
        manager,
        row,
        'InventoryIngestionStarted.v1',
        {
          product_model_id: models[0].product_model_id,
          procurement_batch_id: batches[0].procurement_batch_id,
          record_type: payload.subject_type,
          university_asset_id: row.university_asset_id,
          lot_id: row.lot_id,
        },
      );
      await manager.query(
        `INSERT INTO inv_consumed_events(event_id,tenant_id,event_type,inventory_record_id) VALUES($1,$2,$3,$4)`,
        [eventId, event.tenant_id, event.event_type, recordId],
      );
      return { inventory_record_id: recordId, event: started };
    });
  }

  async prepareIdentity(
    actor: InventoryActor,
    id: string,
    revision: number,
    key: string,
    input: PrepareIdentityInput,
  ) {
    const access = await this.accessible(
      actor,
      id,
      'INVENTORY_IDENTITY_PREPARE',
    );
    return this.db.transaction(async (manager) => {
      const row = await this.locked(manager, id, access.tenant_id);
      this.assertRevision(row, revision);
      const serviceHold = await manager.query(
        `SELECT c.asset_availability FROM svc_asset_holds h JOIN svc_cases c ON c.service_case_id=h.service_case_id
         WHERE h.inventory_record_id=$1 AND h.status='ACTIVE' FOR UPDATE OF h`,
        [id],
      );
      if (serviceHold[0])
        throw new ConflictException(
          serviceHold[0].asset_availability === 'VENDOR_SERVICE_CUSTODY'
            ? 'Vendor-held asset can only change custody or location through Module 8'
            : 'Asset has an active Module 8 service hold',
        );
      return this.withIdempotency(
        manager,
        row.tenant_id,
        actor.user_id,
        key,
        input,
        async () => {
          if (!['IDENTITY_PENDING', 'ON_HOLD'].includes(row.record_status))
            throw new ConflictException(
              'Identity cannot be prepared in current state',
            );
          await this.validateTargetReferences(manager, row.tenant_id, input);
          const policies = await manager.query(
            `SELECT cp.*,ip.* FROM inv_category_policies cp JOIN inv_identifier_policies ip ON ip.identifier_policy_id=$2 WHERE cp.category_policy_id=$1`,
            [row.category_policy_id, row.identifier_policy_id],
          );
          const policy = policies[0];
          const serial = normalizedSerial(input.manufacturer_serial);
          if (policy.manufacturer_serial_required && !serial)
            throw new BadRequestException(
              'Manufacturer serial is required by category policy',
            );
          if (
            serial &&
            (
              await manager.query(
                `SELECT inventory_record_id FROM inv_records WHERE tenant_id=$1 AND normalized_manufacturer_serial=$2 AND inventory_record_id<>$3 AND record_status NOT IN('REJECTED','SUPERSEDED')`,
                [row.tenant_id, serial, id],
              )
            )[0]
          )
            throw new ConflictException({
              message: 'Manufacturer serial requires duplicate investigation',
              code: 'DUPLICATE_MANUFACTURER_SERIAL',
            });
          await manager.query(
            `UPDATE inv_records SET manufacturer_serial=$2,normalized_manufacturer_serial=$3,owner_department_id=COALESCE($4,owner_department_id),custodian_user_id=$5,location_space_id=$6,location_text=$7,condition=COALESCE($8,condition),attributes=$9::jsonb,record_status='ACTIVATION_PENDING',aggregate_revision=aggregate_revision+1,updated_at=NOW() WHERE inventory_record_id=$1`,
            [
              id,
              input.manufacturer_serial?.trim() ?? null,
              serial,
              input.owner_department_id ?? null,
              input.custodian_user_id ?? null,
              input.location_space_id ?? null,
              input.location_text ?? null,
              input.condition ?? null,
              JSON.stringify(input.attributes ?? {}),
            ],
          );
          if (row.record_type === 'ITEM')
            await manager.query(
              `INSERT INTO inv_asset_identities(tenant_id,inventory_record_id,university_asset_id,prepared_by) VALUES($1,$2,$3,$4) ON CONFLICT(inventory_record_id) DO NOTHING`,
              [row.tenant_id, id, row.university_asset_id, actor.user_id],
            );
          if (policy.rfid_required) {
            const code = await this.nextCode(
              manager,
              row.tenant_id,
              'RFID',
              policy.rfid_pattern,
            );
            await manager.query(
              `INSERT INTO inv_logical_rfids(tenant_id,inventory_record_id,logical_rfid_code,status,prepared_by) VALUES($1,$2,$3,'PREPARED',$4) ON CONFLICT(inventory_record_id) DO NOTHING`,
              [row.tenant_id, id, code, actor.user_id],
            );
          }
          await this.audit(
            manager,
            row,
            'IDENTITY',
            id,
            'IDENTITY_PREPARED',
            actor.user_id,
            null,
            input,
          );
          const event = await this.emit(
            manager,
            row,
            'InventoryIdentityPrepared.v1',
            {
              university_asset_id: row.university_asset_id,
              lot_id: row.lot_id,
              manufacturer_serial: input.manufacturer_serial ?? null,
              rfid_required: policy.rfid_required,
            },
          );
          return {
            inventory_record_id: id,
            aggregate_revision: Number(row.aggregate_revision),
            event,
          };
        },
      );
    });
  }

  async encodeRfid(
    actor: InventoryActor,
    id: string,
    revision: number,
    key: string,
    input: EncodeRfidInput,
  ) {
    const access = await this.accessible(actor, id, 'INVENTORY_RFID_ENCODE');
    const moduleXEnabled = Boolean(
      (
        await this.db.query(
          `SELECT 1 FROM tenant_subscriptions WHERE tenant_id=$1 AND feature_key='dofa_module_x_physical_identity' AND is_enabled=true AND(expires_at IS NULL OR expires_at>=NOW())`,
          [access.tenant_id],
        )
      )[0],
    );
    if (
      moduleXEnabled &&
      this.config.get<string>('PHYSICAL_IDENTITY_ALLOW_SIMULATOR') !== 'true'
    )
      throw new ConflictException({
        message:
          'Direct RFID encoding is disabled; use a signed Module X provisioning job',
        code: 'MODULE_X_PROVISIONING_REQUIRED',
      });
    if (!/^[A-Fa-f0-9:_-]{4,240}$/.test(input.physical_tag_uid))
      throw new BadRequestException('Invalid physical RFID UID');
    if (!/^[a-f0-9]{64}$/i.test(input.encoded_payload_hash))
      throw new BadRequestException('Encoded payload SHA-256 is required');
    return this.db.transaction(async (manager) => {
      const row = await this.locked(manager, id, access.tenant_id);
      this.assertRevision(row, revision);
      return this.withIdempotency(
        manager,
        row.tenant_id,
        actor.user_id,
        key,
        input,
        async () => {
          const rfids = await manager.query(
            `SELECT * FROM inv_logical_rfids WHERE inventory_record_id=$1 FOR UPDATE`,
            [id],
          );
          if (!rfids[0])
            throw new ConflictException(
              'Logical RFID is not required or prepared',
            );
          const bindingId = randomUUID();
          await manager.query(
            `INSERT INTO inv_rfid_bindings(rfid_binding_id,tenant_id,logical_rfid_id,physical_tag_uid,tag_technology,encoder_device_id,encoded_payload_hash,key_version,encoded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              bindingId,
              row.tenant_id,
              rfids[0].logical_rfid_id,
              input.physical_tag_uid.toUpperCase(),
              input.tag_technology,
              input.encoder_device_id,
              input.encoded_payload_hash.toLowerCase(),
              input.key_version ?? null,
              actor.user_id,
            ],
          );
          await manager.query(
            `UPDATE inv_logical_rfids SET status='ENCODED' WHERE logical_rfid_id=$1`,
            [rfids[0].logical_rfid_id],
          );
          await this.audit(
            manager,
            row,
            'RFID_BINDING',
            bindingId,
            'RFID_ENCODED',
            actor.user_id,
            null,
            {
              physical_tag_uid: input.physical_tag_uid,
              encoded_payload_hash: input.encoded_payload_hash,
            },
          );
          await manager.query(
            `UPDATE inv_records SET aggregate_revision=aggregate_revision+1,updated_at=NOW() WHERE inventory_record_id=$1`,
            [id],
          );
          return {
            rfid_binding_id: bindingId,
            aggregate_revision: Number(row.aggregate_revision) + 1,
          };
        },
      );
    });
  }

  /** Module X internal boundary: Module 5 remains the only allocator of permanent identities. */
  async ensurePhysicalProvisioningIdentityInTransaction(
    manager: EntityManager,
    inventoryRecordId: string,
    tenantId: string,
    actorId: string,
    requireRfid: boolean,
  ) {
    const rows = await manager.query(
      `SELECT r.*,m.category,m.product_name,m.product_model_id,cp.rfid_required,ip.rfid_pattern
       FROM inv_records r JOIN inv_product_models m ON m.product_model_id=r.product_model_id
       JOIN inv_category_policies cp ON cp.category_policy_id=r.category_policy_id
       JOIN inv_identifier_policies ip ON ip.identifier_policy_id=r.identifier_policy_id
       WHERE r.inventory_record_id=$1 AND r.tenant_id=$2 AND r.record_type='ITEM' FOR UPDATE OF r`,
      [inventoryRecordId, tenantId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Module 5 ITEM identity not found');
    if (!row.university_asset_id)
      throw new ConflictException('Module 5 Asset ID must be prepared first');
    await manager.query(
      `INSERT INTO inv_asset_identities(tenant_id,inventory_record_id,university_asset_id,prepared_by)
       VALUES($1,$2,$3,$4) ON CONFLICT(inventory_record_id) DO NOTHING`,
      [tenantId, inventoryRecordId, row.university_asset_id, actorId],
    );
    if (requireRfid) {
      const existing = await manager.query(
        `SELECT * FROM inv_logical_rfids WHERE inventory_record_id=$1 FOR UPDATE`,
        [inventoryRecordId],
      );
      if (!existing[0]) {
        const code = await this.nextCode(
          manager,
          tenantId,
          'RFID',
          row.rfid_pattern,
        );
        await manager.query(
          `INSERT INTO inv_logical_rfids(tenant_id,inventory_record_id,logical_rfid_code,status,prepared_by)
           VALUES($1,$2,$3,'PREPARED',$4)`,
          [tenantId, inventoryRecordId, code, actorId],
        );
      }
    }
    const logical = await manager.query(
      `SELECT * FROM inv_logical_rfids WHERE inventory_record_id=$1`,
      [inventoryRecordId],
    );
    return { ...row, logical_rfid: logical[0] ?? null };
  }

  /** Module X internal command: records hardware output without accepting an operator-selected identity. */
  async recordModuleXEncodingInTransaction(
    manager: EntityManager,
    job: any,
    deviceId: string,
    operatorId: string,
    input: {
      physical_tag_uid: string;
      tag_technology: string;
      encoded_payload_hash: string;
    },
  ) {
    const expectedHash = inventoryHash({
      inventory_record_id: job.inventory_record_id,
      inventory_revision: Number(job.inventory_revision),
      university_asset_id: job.university_asset_id,
      logical_rfid_id: job.logical_rfid_id,
      logical_rfid_code: job.logical_rfid_code,
      generation_request_id: job.generation_request_id,
      signing_key_version: job.signing_key_version,
    });
    if (input.encoded_payload_hash.toLowerCase() !== expectedHash)
      throw new ConflictException({
        message: 'Encoded payload does not match the Module 5 identity job',
        code: 'MODULE_X_PAYLOAD_MISMATCH',
      });
    if (!job.logical_rfid_id)
      throw new ConflictException('This job does not authorize an RFID tag');
    const bindingId = randomUUID();
    await manager.query(
      `INSERT INTO inv_rfid_bindings(rfid_binding_id,tenant_id,logical_rfid_id,physical_tag_uid,tag_technology,encoder_device_id,encoded_payload_hash,key_version,status,encoded_by,module_x_provisioning_job_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,'ENCODED',$9,$10)`,
      [
        bindingId,
        job.tenant_id,
        job.logical_rfid_id,
        input.physical_tag_uid.toUpperCase(),
        input.tag_technology,
        deviceId,
        input.encoded_payload_hash.toLowerCase(),
        job.signing_key_version,
        operatorId,
        job.provisioning_job_id,
      ],
    );
    await manager.query(
      `UPDATE inv_logical_rfids SET status='ENCODED' WHERE logical_rfid_id=$1`,
      [job.logical_rfid_id],
    );
    return bindingId;
  }

  /** Module X internal command: validates exact attachment before activating the binding. */
  async verifyModuleXAttachmentInTransaction(
    manager: EntityManager,
    job: any,
    verifierId: string,
    verification: {
      attachment_verification_id: string;
      scanned_asset_id: string;
      scanned_physical_tag_uid?: string;
      scanned_rfid_payload_hash?: string;
      scanned_qr_payload_hash: string;
      evidence_manifest_hash: string;
    },
  ) {
    if (job.operator_id === verifierId)
      throw new ForbiddenException({
        message: 'Provisioning operator cannot verify the same attachment',
        code: 'MODULE_X_MAKER_CHECKER_VIOLATION',
      });
    const rfidMismatch = job.logical_rfid_id
      ? !verification.scanned_physical_tag_uid ||
        !verification.scanned_rfid_payload_hash ||
        verification.scanned_physical_tag_uid.toUpperCase() !==
          String(job.physical_tag_uid).toUpperCase() ||
        verification.scanned_rfid_payload_hash.toLowerCase() !==
          job.encoded_payload_hash
      : Boolean(
          verification.scanned_physical_tag_uid ||
          verification.scanned_rfid_payload_hash ||
          job.physical_tag_uid ||
          job.encoded_payload_hash,
        );
    if (
      verification.scanned_asset_id !== job.university_asset_id ||
      rfidMismatch ||
      verification.scanned_qr_payload_hash.toLowerCase() !== job.qr_payload_hash
    )
      throw new ConflictException({
        message:
          'Physical identifiers do not match the authorized Module 5 identity',
        code: 'MODULE_X_ATTACHMENT_MISMATCH',
      });
    let binding: any = null;
    if (job.logical_rfid_id) {
      const bindings = await manager.query(
        `SELECT b.*,l.logical_rfid_id FROM inv_rfid_bindings b JOIN inv_logical_rfids l ON l.logical_rfid_id=b.logical_rfid_id
         WHERE b.module_x_provisioning_job_id=$1 AND l.inventory_record_id=$2 FOR UPDATE OF b,l`,
        [job.provisioning_job_id, job.inventory_record_id],
      );
      binding = bindings[0];
      if (!binding)
        throw new NotFoundException('Module X RFID binding not found');
      if (job.job_type === 'REPLACEMENT')
        await manager.query(
          `UPDATE inv_rfid_bindings SET status='SUPERSEDED',active_to=NOW() WHERE logical_rfid_id=$1 AND status='ACTIVE' AND rfid_binding_id<>$2`,
          [binding.logical_rfid_id, binding.rfid_binding_id],
        );
      await manager.query(
        `UPDATE inv_rfid_bindings SET status='ACTIVE',verified_by=$2,verified_at=NOW(),active_from=NOW(),attachment_verified_at=NOW() WHERE rfid_binding_id=$1`,
        [binding.rfid_binding_id, verifierId],
      );
      await manager.query(
        `UPDATE inv_logical_rfids SET status='ACTIVE' WHERE logical_rfid_id=$1`,
        [binding.logical_rfid_id],
      );
    }
    await manager.query(
      `INSERT INTO pix_inventory_projections(inventory_record_id,tenant_id,provisioning_job_id,physical_tag_uid,label_serial,attachment_status,attachment_verification_id,source_event_id,source_payload_hash,verified_at)
       VALUES($1,$2,$3,$4,$5,'VERIFIED',$6,$7,$8,NOW())
       ON CONFLICT(inventory_record_id) DO UPDATE SET provisioning_job_id=EXCLUDED.provisioning_job_id,physical_tag_uid=EXCLUDED.physical_tag_uid,label_serial=EXCLUDED.label_serial,attachment_status='VERIFIED',attachment_verification_id=EXCLUDED.attachment_verification_id,source_event_id=EXCLUDED.source_event_id,source_payload_hash=EXCLUDED.source_payload_hash,verified_at=NOW(),updated_at=NOW()`,
      [
        job.inventory_record_id,
        job.tenant_id,
        job.provisioning_job_id,
        job.physical_tag_uid,
        job.label_serial,
        verification.attachment_verification_id,
        randomUUID(),
        inventoryHash({
          job: job.provisioning_job_id,
          evidence: verification.evidence_manifest_hash,
        }),
      ],
    );
    const record = (
      await manager.query(
        `SELECT * FROM inv_records WHERE inventory_record_id=$1 FOR UPDATE`,
        [job.inventory_record_id],
      )
    )[0];
    await this.audit(
      manager,
      record,
      job.logical_rfid_id ? 'RFID_BINDING' : 'PHYSICAL_LABEL',
      binding?.rfid_binding_id ?? job.provisioning_job_id,
      'MODULE_X_ATTACHMENT_VERIFIED',
      verifierId,
      { status: binding?.status ?? 'ATTACHMENT_PENDING' },
      { status: 'ACTIVE', provisioning_job_id: job.provisioning_job_id },
    );
    if (binding)
      await this.emit(manager, record, 'RFIDTagBound.v1', {
        rfid_binding_id: binding.rfid_binding_id,
        logical_rfid_id: binding.logical_rfid_id,
        physical_tag_uid: binding.physical_tag_uid,
        module_x_provisioning_job_id: job.provisioning_job_id,
        attachment_verification_id: verification.attachment_verification_id,
      });
    return binding;
  }

  async verifyRfid(
    actor: InventoryActor,
    id: string,
    bindingId: string,
    revision: number,
    key: string,
  ) {
    const access = await this.accessible(
      actor,
      id,
      'INVENTORY_IDENTITY_VERIFY',
    );
    const moduleXEnabled = Boolean(
      (
        await this.db.query(
          `SELECT 1 FROM tenant_subscriptions WHERE tenant_id=$1 AND feature_key='dofa_module_x_physical_identity' AND is_enabled=true AND(expires_at IS NULL OR expires_at>=NOW())`,
          [access.tenant_id],
        )
      )[0],
    );
    if (
      moduleXEnabled &&
      this.config.get<string>('PHYSICAL_IDENTITY_ALLOW_SIMULATOR') !== 'true'
    )
      throw new ConflictException({
        message:
          'Direct RFID verification is disabled; use Module X attachment verification',
        code: 'MODULE_X_PROVISIONING_REQUIRED',
      });
    return this.db.transaction(async (manager) => {
      const row = await this.locked(manager, id, access.tenant_id);
      this.assertRevision(row, revision);
      return this.withIdempotency(
        manager,
        row.tenant_id,
        actor.user_id,
        key,
        { bindingId },
        async () => {
          const bindings = await manager.query(
            `SELECT b.*,l.logical_rfid_id FROM inv_rfid_bindings b JOIN inv_logical_rfids l ON l.logical_rfid_id=b.logical_rfid_id WHERE b.rfid_binding_id=$1 AND l.inventory_record_id=$2 FOR UPDATE OF b,l`,
            [bindingId, id],
          );
          const binding = bindings[0];
          if (!binding) throw new NotFoundException('RFID binding not found');
          if (binding.encoded_by === actor.user_id)
            throw new ForbiddenException({
              message: 'RFID encoder cannot verify the same binding',
              code: 'RFID_MAKER_CHECKER_VIOLATION',
            });
          await manager.query(
            `UPDATE inv_rfid_bindings SET status='ACTIVE',verified_by=$2,verified_at=NOW(),active_from=NOW() WHERE rfid_binding_id=$1`,
            [bindingId, actor.user_id],
          );
          await manager.query(
            `UPDATE inv_logical_rfids SET status='ACTIVE' WHERE logical_rfid_id=$1`,
            [binding.logical_rfid_id],
          );
          await this.audit(
            manager,
            row,
            'RFID_BINDING',
            bindingId,
            'RFID_VERIFIED',
            actor.user_id,
            { status: binding.status },
            { status: 'ACTIVE' },
          );
          const event = await this.emit(manager, row, 'RFIDTagBound.v1', {
            rfid_binding_id: bindingId,
            logical_rfid_id: binding.logical_rfid_id,
            physical_tag_uid: binding.physical_tag_uid,
          });
          return {
            rfid_binding_id: bindingId,
            status: 'ACTIVE',
            aggregate_revision: Number(row.aggregate_revision),
            event,
          };
        },
      );
    });
  }

  async activate(
    actor: InventoryActor,
    id: string,
    revision: number,
    key: string,
  ) {
    const access = await this.accessible(
      actor,
      id,
      'INVENTORY_IDENTITY_VERIFY',
    );
    return this.db.transaction(async (manager) => {
      const row = await this.locked(manager, id, access.tenant_id);
      this.assertRevision(row, revision);
      return this.withIdempotency(
        manager,
        row.tenant_id,
        actor.user_id,
        key,
        { action: 'ACTIVATE' },
        async () => {
          if (row.record_status !== 'ACTIVATION_PENDING')
            throw new ConflictException('Record is not ready for activation');
          const sources = await manager.query(
            `SELECT s.*,i.status identity_status FROM inv_source_snapshots s JOIN pv_verification_identities i ON i.verification_identity_id=$2 WHERE s.inventory_record_id=$1`,
            [id, row.verification_identity_id],
          );
          if (!sources[0] || sources[0].identity_status !== 'ACTIVE')
            throw new ConflictException('Current Module 4 identity required');
          if (
            (
              await manager.query(
                `SELECT 1 FROM inv_discrepancies WHERE inventory_record_id=$1 AND status NOT IN('RESOLVED','REJECTED')`,
                [id],
              )
            )[0]
          )
            throw new ConflictException(
              'Unresolved inventory discrepancy blocks activation',
            );
          const policies = await manager.query(
            `SELECT * FROM inv_category_policies WHERE category_policy_id=$1`,
            [row.category_policy_id],
          );
          const policy = policies[0];
          if (
            policy.manufacturer_serial_required &&
            !row.normalized_manufacturer_serial
          )
            throw new ConflictException('Manufacturer serial is required');
          const requiredAttributes = Array.isArray(policy.required_attributes)
            ? policy.required_attributes.map(String)
            : [];
          const attributes = (row.attributes ?? {}) as Record<string, unknown>;
          const missingAttributes = requiredAttributes.filter((name) => {
            const value = attributes[name];
            return (
              value === undefined ||
              value === null ||
              (typeof value === 'string' && value.trim() === '')
            );
          });
          if (missingAttributes.length)
            throw new ConflictException({
              message: 'Category-required inventory attributes are missing',
              code: 'INVENTORY_REQUIRED_ATTRIBUTES_MISSING',
              attributes: missingAttributes,
            });
          const moduleXEnabled = Boolean(
            (
              await manager.query(
                `SELECT 1 FROM tenant_subscriptions WHERE tenant_id=$1 AND feature_key='dofa_module_x_provisioning_gate' AND is_enabled=true AND(expires_at IS NULL OR expires_at>=NOW())`,
                [row.tenant_id],
              )
            )[0],
          );
          let moduleXRfidRequired = false;
          if (moduleXEnabled && row.record_type === 'ITEM') {
            const physicalPolicies = await manager.query(
              `SELECT p.*,COALESCE((SELECT COALESCE(capitalized_cost,verified_invoice_cost,estimated_cost) FROM inv_financial_projections f WHERE f.inventory_record_id=$1 ORDER BY CASE f.status WHEN 'FINAL' THEN 0 WHEN 'PROVISIONAL' THEN 1 ELSE 2 END,f.source_revision DESC LIMIT 1),0)::numeric asset_value
               FROM inv_product_models m JOIN LATERAL(SELECT * FROM pix_policies p WHERE p.tenant_id=$2 AND p.status='PUBLISHED' AND p.effective_from<=NOW() AND(p.effective_to IS NULL OR p.effective_to>NOW()) AND(p.product_model_id=m.product_model_id OR p.product_model_id IS NULL) AND p.category IN(m.category,'*') ORDER BY CASE WHEN p.product_model_id=m.product_model_id THEN 0 WHEN p.category=m.category THEN 1 ELSE 2 END,p.policy_version DESC LIMIT 1) p ON true WHERE m.product_model_id=$3`,
              [id, row.tenant_id, row.product_model_id],
            );
            const physicalPolicy = physicalPolicies[0];
            if (!physicalPolicy)
              throw new ConflictException(
                'Published Module X physical-identity policy is required',
              );
            if (!physicalPolicy.excluded) {
              moduleXRfidRequired =
                physicalPolicy.rfid_required === true ||
                Number(physicalPolicy.asset_value) >=
                  Number(physicalPolicy.rfid_value_threshold);
              const projection = await manager.query(
                `SELECT * FROM pix_inventory_projections WHERE inventory_record_id=$1 AND tenant_id=$2 AND attachment_status='VERIFIED'`,
                [id, row.tenant_id],
              );
              if (!projection[0])
                throw new ConflictException({
                  message:
                    'Verified Module X physical identifier attachment is required',
                  code: 'MODULE_X_ATTACHMENT_REQUIRED',
                });
            }
          }
          let activeBinding: any = null;
          let logical: any = null;
          if (policy.rfid_required || moduleXRfidRequired) {
            const rfids = await manager.query(
              `SELECT l.*,b.rfid_binding_id,b.physical_tag_uid,b.verified_by FROM inv_logical_rfids l JOIN inv_rfid_bindings b ON b.logical_rfid_id=l.logical_rfid_id AND b.status='ACTIVE' WHERE l.inventory_record_id=$1 AND l.status='ACTIVE'`,
              [id],
            );
            if (!rfids[0])
              throw new ConflictException('Verified RFID binding is required');
            logical = rfids[0];
            activeBinding = rfids[0];
            if (activeBinding.verified_by !== actor.user_id) {
              /* verifier can be the activation checker */
            }
          }
          const prepared = await manager.query(
            `SELECT prepared_by FROM inv_asset_identities WHERE inventory_record_id=$1`,
            [id],
          );
          if (prepared[0]?.prepared_by === actor.user_id)
            throw new ForbiddenException({
              message: 'Identity preparer cannot activate the same record',
              code: 'IDENTITY_MAKER_CHECKER_VIOLATION',
            });
          const previous = await manager.query(
            `SELECT identity_revision,payload_hash FROM inv_identity_revisions WHERE inventory_record_id=$1 ORDER BY identity_revision DESC LIMIT 1`,
            [id],
          );
          const identityRevision =
            Number(previous[0]?.identity_revision ?? 0) + 1;
          const { privateKey, keyVersion } = this.signingConfiguration();
          const payload = {
            inventory_record_id: id,
            identity_revision: identityRevision,
            product_model_id: row.product_model_id,
            procurement_batch_id: row.procurement_batch_id,
            subject_id: row.subject_id,
            verification_identity_id: row.verification_identity_id,
            university_asset_id: row.university_asset_id,
            lot_id: row.lot_id,
            logical_rfid_id: logical?.logical_rfid_id ?? null,
            logical_rfid_code: logical?.logical_rfid_code ?? null,
            physical_tag_binding: activeBinding
              ? {
                  rfid_binding_id: activeBinding.rfid_binding_id,
                  physical_tag_uid: activeBinding.physical_tag_uid,
                }
              : null,
            category_policy_id: row.category_policy_id,
            identifier_policy_id: row.identifier_policy_id,
            issued_at: new Date().toISOString(),
            signing_key_version: keyVersion,
          };
          const payloadHash = inventoryHash(payload);
          const signature = signInventoryIdentity(payload, privateKey);
          await manager.query(
            `UPDATE inv_identity_revisions SET status='SUPERSEDED' WHERE inventory_record_id=$1 AND status='ACTIVE'`,
            [id],
          );
          const revisions = await manager.query(
            `INSERT INTO inv_identity_revisions(tenant_id,inventory_record_id,identity_revision,signed_payload,payload_hash,previous_revision_hash,signing_key_version,signature,issued_by,issued_at) VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10) RETURNING identity_revision_id`,
            [
              row.tenant_id,
              id,
              identityRevision,
              JSON.stringify(payload),
              payloadHash,
              previous[0]?.payload_hash ?? null,
              keyVersion,
              signature,
              actor.user_id,
              payload.issued_at,
            ],
          );
          await manager.query(
            `UPDATE inv_records SET record_status='ACTIVE',activated_at=NOW(),aggregate_revision=aggregate_revision+1,updated_at=NOW() WHERE inventory_record_id=$1`,
            [id],
          );
          if (row.record_type === 'ITEM')
            await manager.query(
              `UPDATE inv_asset_identities SET status='ACTIVE',activated_by=$2,activated_at=NOW() WHERE inventory_record_id=$1`,
              [id, actor.user_id],
            );
          if (row.record_type === 'ITEM')
            await manager.query(
              `INSERT INTO university_assets(tenant_id,asset_tag,asset_type,name,status,inventory_item_id,purchase_date,asset_value,module5_source_id,module5_managed)
             SELECT r.tenant_id,r.university_asset_id,m.category,m.product_name,'AVAILABLE',NULL,CURRENT_DATE,
                    (SELECT verified_invoice_cost FROM inv_financial_projections WHERE inventory_record_id=r.inventory_record_id ORDER BY source_revision DESC LIMIT 1),r.inventory_record_id,true
             FROM inv_records r JOIN inv_product_models m ON m.product_model_id=r.product_model_id WHERE r.inventory_record_id=$1
             ON CONFLICT(tenant_id,asset_tag) DO UPDATE SET module5_source_id=EXCLUDED.module5_source_id,module5_managed=true`,
              [id],
            );
          else
            await manager.query(
              `INSERT INTO inventory_items(tenant_id,item_code,item_name,category,quantity,reorder_level,location,module5_source_id,module5_managed)
             SELECT r.tenant_id,r.lot_id,m.product_name,m.category,
                    FLOOR(COALESCE((SELECT SUM(signed_quantity) FROM inv_lot_movements WHERE inventory_record_id=r.inventory_record_id),0))::int,0,r.location_text,r.inventory_record_id,true
             FROM inv_records r JOIN inv_product_models m ON m.product_model_id=r.product_model_id WHERE r.inventory_record_id=$1
             ON CONFLICT(tenant_id,item_code) DO UPDATE SET module5_source_id=EXCLUDED.module5_source_id,module5_managed=true`,
              [id],
            );
          await manager.query(
            `UPDATE inv_procurement_batches SET status='ACTIVE',activated_at=COALESCE(activated_at,NOW()) WHERE procurement_batch_id=$1`,
            [row.procurement_batch_id],
          );
          await this.audit(
            manager,
            row,
            'IDENTITY_REVISION',
            revisions[0].identity_revision_id,
            'INVENTORY_ACTIVATED',
            actor.user_id,
            null,
            { identity_revision: identityRevision, payload_hash: payloadHash },
          );
          row.aggregate_revision = Number(row.aggregate_revision) + 1;
          const identityEvent = await this.emit(
            manager,
            row,
            'InventoryIdentityAllocated.v1',
            {
              identity_revision_id: revisions[0].identity_revision_id,
              identity_revision: identityRevision,
              product_model_id: row.product_model_id,
              procurement_batch_id: row.procurement_batch_id,
              university_asset_id: row.university_asset_id,
              lot_id: row.lot_id,
              manufacturer_serial: row.manufacturer_serial,
              logical_rfid_id: logical?.logical_rfid_id ?? null,
              logical_rfid_code: logical?.logical_rfid_code ?? null,
              physical_tag_uid: activeBinding?.physical_tag_uid ?? null,
              verification_identity_id: row.verification_identity_id,
              signature,
              signing_key_version: keyVersion,
              identity_status: 'ACTIVE',
            },
          );
          await this.emit(manager, row, 'InventoryRecordActivated.v1', {
            identity_revision: identityRevision,
            record_type: row.record_type,
          });
          await this.updateLineCompletion(manager, row);
          return {
            inventory_record_id: id,
            status: 'ACTIVE',
            identity_revision: identityRevision,
            signature,
            event: identityEvent,
          };
        },
      );
    });
  }

  private async updateLineCompletion(manager: EntityManager, row: any) {
    const totals = await manager.query(
      `SELECT c.proc_case_id,c.proc_case_line_id,COUNT(s.subject_id)::int eligible,COUNT(r.inventory_record_id) FILTER(WHERE r.record_status='ACTIVE')::int active,BOOL_AND(CASE WHEN cp.rfid_required THEN EXISTS(SELECT 1 FROM inv_logical_rfids lr JOIN inv_rfid_bindings b ON b.logical_rfid_id=lr.logical_rfid_id AND b.status='ACTIVE' WHERE lr.inventory_record_id=r.inventory_record_id) ELSE true END) rfid_complete FROM pv_cases c JOIN pv_subjects s ON s.verification_case_id=c.verification_case_id AND s.status='ACTIVE' LEFT JOIN inv_records r ON r.subject_id=s.subject_id LEFT JOIN inv_category_policies cp ON cp.category_policy_id=r.category_policy_id WHERE c.proc_case_line_id=(SELECT c2.proc_case_line_id FROM pv_cases c2 JOIN pv_subjects s2 ON s2.verification_case_id=c2.verification_case_id WHERE s2.subject_id=$1) GROUP BY c.proc_case_id,c.proc_case_line_id`,
      [row.subject_id],
    );
    const total = totals[0];
    if (!total) return;
    const finalized = Number(total.eligible) === Number(total.active);
    await this.emit(manager, row, 'InventoryLineCompleted.v1', {
      proc_case_id: total.proc_case_id,
      proc_case_line_id: total.proc_case_line_id,
      status: finalized ? 'FINALIZED' : 'PENDING',
      asset_id_allocation:
        row.record_type === 'ITEM'
          ? finalized
            ? 'FINALIZED'
            : 'PENDING'
          : 'NOT_REQUIRED',
      rfid_allocation:
        row.record_type === 'ITEM'
          ? total.rfid_complete
            ? 'FINALIZED'
            : 'PENDING'
          : 'NOT_REQUIRED',
      inventory_ingestion: finalized ? 'FINALIZED' : 'PENDING',
      consumable_ledger:
        row.record_type === 'LOT'
          ? finalized
            ? 'FINALIZED'
            : 'PENDING'
          : 'NOT_REQUIRED',
    });
  }

  async lotMovement(
    actor: InventoryActor,
    id: string,
    revision: number,
    key: string,
    input: {
      movement_type: MovementType;
      quantity: number;
      reason: string;
      evidence_reference?: string;
    },
  ) {
    const access = await this.accessible(actor, id, 'INVENTORY_LOT_MOVEMENT');
    return this.db.transaction(async (manager) => {
      const row = await this.locked(manager, id, access.tenant_id);
      this.assertRevision(row, revision);
      return this.withIdempotency(
        manager,
        row.tenant_id,
        actor.user_id,
        key,
        input,
        async () => {
          if (row.record_type !== 'LOT' || row.record_status !== 'ACTIVE')
            throw new ConflictException('Active LOT record required');
          if (!(input.quantity > 0) || !input.reason?.trim())
            throw new BadRequestException(
              'Positive quantity and reason required',
            );
          const balanceRows = await manager.query(
            `SELECT COALESCE(SUM(signed_quantity),0) balance FROM inv_lot_movements WHERE inventory_record_id=$1`,
            [id],
          );
          const positive = input.movement_type === 'ADJUSTMENT_IN';
          const signed = positive ? input.quantity : -input.quantity;
          if (Number(balanceRows[0].balance) + signed < -0.0005)
            throw new ConflictException({
              message: 'Lot movement exceeds on-hand quantity',
              code: 'NEGATIVE_LOT_BALANCE',
            });
          const movementId = randomUUID();
          const groupId = randomUUID();
          await manager.query(
            `INSERT INTO inv_lot_movements(lot_movement_id,movement_group_id,tenant_id,inventory_record_id,movement_type,quantity,signed_quantity,unit_of_measure,reason,evidence_reference,actor_id) SELECT $1,$2,$3,$4,$5,$6,$7,b.unit_of_measure,$8,$9,$10 FROM inv_procurement_batches b WHERE b.procurement_batch_id=$11`,
            [
              movementId,
              groupId,
              row.tenant_id,
              id,
              input.movement_type,
              input.quantity,
              signed,
              input.reason.trim(),
              input.evidence_reference ?? null,
              actor.user_id,
              row.procurement_batch_id,
            ],
          );
          await this.audit(
            manager,
            row,
            'LOT_MOVEMENT',
            movementId,
            'LOT_MOVEMENT_POSTED',
            actor.user_id,
            { balance: Number(balanceRows[0].balance) },
            {
              movement_type: input.movement_type,
              quantity: input.quantity,
              balance: Number(balanceRows[0].balance) + signed,
            },
            input.reason,
          );
          const event = await this.emit(
            manager,
            row,
            'InventoryLotMovementPosted.v1',
            {
              lot_movement_id: movementId,
              movement_group_id: groupId,
              movement_type: input.movement_type,
              quantity: input.quantity,
              signed_quantity: signed,
            },
          );
          await this.syncLotProjection(manager, id);
          return {
            lot_movement_id: movementId,
            movement_group_id: groupId,
            balance: Number(balanceRows[0].balance) + signed,
            aggregate_revision: Number(row.aggregate_revision),
            event,
          };
        },
      );
    });
  }

  async postConsumableMovement(
    manager: EntityManager,
    input: {
      tenant_id: string;
      inventory_record_id: string;
      movement_type:
        | 'ISSUE'
        | 'ISSUE_RETURN'
        | 'ADJUSTMENT_IN'
        | 'ADJUSTMENT_OUT'
        | 'RETURN';
      quantity: number;
      source_type: string;
      source_id: string;
      reason_code: string;
      reason: string;
      actor_id: string;
      department_id?: number;
      project_reference?: string;
      location_space_id?: string;
      idempotency_key: string;
    },
  ) {
    const prior = await manager.query(
      `SELECT * FROM inv_lot_movements WHERE tenant_id=$1 AND idempotency_key=$2`,
      [input.tenant_id, input.idempotency_key],
    );
    if (prior[0]) return prior[0];
    const rows = await manager.query(
      `SELECT r.*,b.unit_of_measure FROM inv_records r JOIN inv_procurement_batches b ON b.procurement_batch_id=r.procurement_batch_id WHERE r.inventory_record_id=$1 AND r.tenant_id=$2 FOR UPDATE OF r`,
      [input.inventory_record_id, input.tenant_id],
    );
    const row = rows[0];
    if (!row || row.record_type !== 'LOT' || row.record_status !== 'ACTIVE')
      throw new ConflictException('Active Module 5 LOT required');
    if (!(input.quantity > 0) || !input.reason?.trim())
      throw new BadRequestException(
        'Positive movement quantity and reason required',
      );
    const positive = ['ISSUE_RETURN', 'ADJUSTMENT_IN'].includes(
      input.movement_type,
    );
    const signed = positive ? input.quantity : -input.quantity;
    const balance = Number(
      (
        await manager.query(
          `SELECT COALESCE(SUM(signed_quantity),0) balance FROM inv_lot_movements WHERE inventory_record_id=$1`,
          [input.inventory_record_id],
        )
      )[0].balance,
    );
    const returnHeld = Number(
      (
        await manager.query(
          `SELECT COALESCE(SUM(quantity),0) held FROM ret_case_allocations WHERE inventory_record_id=$1 AND status='HELD'`,
          [input.inventory_record_id],
        )
      )[0].held,
    );
    if (
      signed < 0 &&
      input.movement_type !== 'RETURN' &&
      balance + signed < returnHeld - 0.0005
    )
      throw new ConflictException(
        'Movement conflicts with an active Module 7 return hold',
      );
    if (balance + signed < -0.0005)
      throw new ConflictException('Consumables movement exceeds LOT balance');
    const movementId = randomUUID();
    await manager.query(
      `INSERT INTO inv_lot_movements(lot_movement_id,movement_group_id,tenant_id,inventory_record_id,movement_type,quantity,signed_quantity,unit_of_measure,reason,actor_id,source_type,source_id,reason_code,department_id,project_reference,location_space_id,idempotency_key)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        movementId,
        randomUUID(),
        input.tenant_id,
        input.inventory_record_id,
        input.movement_type,
        input.quantity,
        signed,
        row.unit_of_measure,
        input.reason.trim(),
        input.actor_id,
        input.source_type,
        input.source_id,
        input.reason_code,
        input.department_id ?? null,
        input.project_reference ?? null,
        input.location_space_id ?? null,
        input.idempotency_key,
      ],
    );
    await this.audit(
      manager,
      row,
      'LOT_MOVEMENT',
      movementId,
      'CONSUMABLE_MOVEMENT_POSTED',
      input.actor_id,
      { balance },
      {
        movement_type: input.movement_type,
        quantity: input.quantity,
        balance: balance + signed,
      },
      input.reason,
    );
    await this.emit(manager, row, 'InventoryLotMovementPosted.v1', {
      lot_movement_id: movementId,
      movement_type: input.movement_type,
      quantity: input.quantity,
      signed_quantity: signed,
      source_type: input.source_type,
      source_id: input.source_id,
      reason_code: input.reason_code,
    });
    await this.syncLotProjection(manager, input.inventory_record_id);
    return { lot_movement_id: movementId, balance: balance + signed };
  }

  async placeReturnHold(
    manager: EntityManager,
    input: {
      tenant_id: string;
      inventory_record_id: string;
      return_case_id: string;
      actor_id: string;
    },
  ) {
    const rows = await manager.query(
      `SELECT * FROM inv_records WHERE inventory_record_id=$1 AND tenant_id=$2 FOR UPDATE`,
      [input.inventory_record_id, input.tenant_id],
    );
    const row = rows[0];
    if (!row || row.record_status !== 'ACTIVE')
      throw new ConflictException('Active inventory record required');
    if (
      ['RETURNED', 'RETIRED', 'WRITTEN_OFF', 'DISPOSED'].includes(
        row.lifecycle_status,
      )
    )
      throw new ConflictException('Inventory lifecycle is not return eligible');
    if (row.record_type === 'ITEM') {
      if (row.lifecycle_status === 'RETURN_PENDING')
        throw new ConflictException('Inventory item already has a return hold');
      await manager.query(
        `UPDATE inv_records SET lifecycle_status='RETURN_PENDING',updated_at=NOW() WHERE inventory_record_id=$1`,
        [row.inventory_record_id],
      );
      await this.audit(
        manager,
        row,
        'RETURN_HOLD',
        input.return_case_id,
        'RETURN_HOLD_PLACED',
        input.actor_id,
        { lifecycle_status: row.lifecycle_status },
        { lifecycle_status: 'RETURN_PENDING' },
      );
      await this.emit(manager, row, 'InventoryReturnHoldPlaced.v1', {
        return_case_id: input.return_case_id,
        previous_lifecycle_status: row.lifecycle_status,
        lifecycle_status: 'RETURN_PENDING',
      });
    }
    return { previous_lifecycle_status: row.lifecycle_status };
  }

  async releaseReturnHold(
    manager: EntityManager,
    input: {
      tenant_id: string;
      inventory_record_id: string;
      return_case_id: string;
      previous_lifecycle_status?: string | null;
      actor_id: string;
      reason: string;
    },
  ) {
    const rows = await manager.query(
      `SELECT * FROM inv_records WHERE inventory_record_id=$1 AND tenant_id=$2 FOR UPDATE`,
      [input.inventory_record_id, input.tenant_id],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Inventory record not found');
    if (
      row.record_type === 'ITEM' &&
      row.lifecycle_status === 'RETURN_PENDING'
    ) {
      const restored =
        input.previous_lifecycle_status &&
        !['RETURN_PENDING', 'RETURNED'].includes(
          input.previous_lifecycle_status,
        )
          ? input.previous_lifecycle_status
          : 'AVAILABLE';
      await manager.query(
        `UPDATE inv_records SET lifecycle_status=$2,updated_at=NOW() WHERE inventory_record_id=$1`,
        [row.inventory_record_id, restored],
      );
      await this.audit(
        manager,
        row,
        'RETURN_HOLD',
        input.return_case_id,
        'RETURN_HOLD_RELEASED',
        input.actor_id,
        { lifecycle_status: 'RETURN_PENDING' },
        { lifecycle_status: restored },
        input.reason,
      );
      await this.emit(manager, row, 'InventoryReturnHoldReleased.v1', {
        return_case_id: input.return_case_id,
        lifecycle_status: restored,
        reason: input.reason,
      });
    }
  }

  async shipReturnAllocation(
    manager: EntityManager,
    input: {
      tenant_id: string;
      inventory_record_id: string;
      return_case_id: string;
      quantity: number;
      actor_id: string;
      idempotency_key: string;
    },
  ) {
    const rows = await manager.query(
      `SELECT * FROM inv_records WHERE inventory_record_id=$1 AND tenant_id=$2 FOR UPDATE`,
      [input.inventory_record_id, input.tenant_id],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Inventory record not found');
    if (row.record_type === 'LOT')
      return this.postConsumableMovement(manager, {
        tenant_id: input.tenant_id,
        inventory_record_id: input.inventory_record_id,
        movement_type: 'RETURN',
        quantity: input.quantity,
        source_type: 'RETURN_CASE',
        source_id: input.return_case_id,
        reason_code: 'VENDOR_RETURN_SHIPPED',
        reason: 'Exact Module 7 LOT allocation shipped to vendor',
        actor_id: input.actor_id,
        idempotency_key: input.idempotency_key,
      });
    if (row.lifecycle_status !== 'RETURN_PENDING')
      throw new ConflictException('ITEM does not have an active return hold');
    await manager.query(
      `UPDATE inv_records SET lifecycle_status='RETURNED',updated_at=NOW() WHERE inventory_record_id=$1`,
      [row.inventory_record_id],
    );
    await manager.query(
      `UPDATE inv_rfid_bindings b SET status='REVOKED',active_to=NOW() FROM inv_logical_rfids r WHERE b.logical_rfid_id=r.logical_rfid_id AND r.inventory_record_id=$1 AND b.status='ACTIVE'`,
      [row.inventory_record_id],
    );
    await this.audit(
      manager,
      row,
      'RETURN',
      input.return_case_id,
      'RETURN_SHIPPED',
      input.actor_id,
      { lifecycle_status: row.lifecycle_status },
      { lifecycle_status: 'RETURNED' },
    );
    return this.emit(manager, row, 'InventoryItemReturned.v1', {
      return_case_id: input.return_case_id,
      lifecycle_status: 'RETURNED',
    });
  }

  async transferLot(
    actor: InventoryActor,
    sourceId: string,
    revision: number,
    key: string,
    input: { destination_id: string; quantity: number; reason: string },
  ) {
    const access = await this.accessible(actor, sourceId, 'INVENTORY_TRANSFER');
    await this.accessible(actor, input.destination_id, 'INVENTORY_TRANSFER');
    const ids = [sourceId, input.destination_id].sort();
    return this.db.transaction(async (manager) => {
      const rows = await manager.query(
        `SELECT * FROM inv_records WHERE inventory_record_id=ANY($1::uuid[]) AND tenant_id=$2 ORDER BY inventory_record_id FOR UPDATE`,
        [ids, access.tenant_id],
      );
      const source = rows.find((r: any) => r.inventory_record_id === sourceId);
      const destination = rows.find(
        (r: any) => r.inventory_record_id === input.destination_id,
      );
      if (
        !source ||
        !destination ||
        source.record_type !== 'LOT' ||
        destination.record_type !== 'LOT' ||
        source.product_model_id !== destination.product_model_id
      )
        throw new ConflictException(
          'Compatible source and destination LOT records required',
        );
      this.assertRevision(source, revision);
      return this.withIdempotency(
        manager,
        source.tenant_id,
        actor.user_id,
        key,
        input,
        async () => {
          const balance = Number(
            (
              await manager.query(
                `SELECT COALESCE(SUM(signed_quantity),0) balance FROM inv_lot_movements WHERE inventory_record_id=$1`,
                [sourceId],
              )
            )[0].balance,
          );
          const held = Number(
            (
              await manager.query(
                `SELECT COALESCE(SUM(quantity),0) held FROM ret_case_allocations WHERE inventory_record_id=$1 AND status='HELD'`,
                [sourceId],
              )
            )[0].held,
          );
          if (!(input.quantity > 0) || balance - held + 0.0005 < input.quantity)
            throw new ConflictException('Transfer exceeds on-hand quantity');
          const groupId = randomUUID();
          for (const [record, type, signed, counterpart] of [
            [source, 'TRANSFER_OUT', -input.quantity, destination],
            [destination, 'TRANSFER_IN', input.quantity, source],
          ] as const)
            await manager.query(
              `INSERT INTO inv_lot_movements(movement_group_id,tenant_id,inventory_record_id,movement_type,quantity,signed_quantity,unit_of_measure,counterparty_record_id,reason,actor_id) SELECT $1,$2,$3,$4,$5,$6,b.unit_of_measure,$7,$8,$9 FROM inv_procurement_batches b WHERE b.procurement_batch_id=$10`,
              [
                groupId,
                record.tenant_id,
                record.inventory_record_id,
                type,
                input.quantity,
                signed,
                counterpart.inventory_record_id,
                input.reason,
                actor.user_id,
                record.procurement_batch_id,
              ],
            );
          await manager.query(
            `UPDATE inv_records SET aggregate_revision=aggregate_revision+1,updated_at=NOW() WHERE inventory_record_id=ANY($1::uuid[])`,
            [ids],
          );
          await this.audit(
            manager,
            source,
            'LOT_TRANSFER',
            groupId,
            'LOT_TRANSFER_POSTED',
            actor.user_id,
            null,
            input,
            input.reason,
          );
          const event = await this.emit(
            manager,
            source,
            'InventoryLotMovementPosted.v1',
            {
              movement_group_id: groupId,
              source_inventory_record_id: sourceId,
              destination_inventory_record_id: input.destination_id,
              quantity: input.quantity,
              atomic: true,
            },
          );
          await this.syncLotProjection(manager, sourceId);
          await this.syncLotProjection(manager, input.destination_id);
          return {
            movement_group_id: groupId,
            source_balance: balance - input.quantity,
            event,
          };
        },
      );
    });
  }

  async reportDiscrepancy(
    actor: InventoryActor,
    id: string,
    revision: number,
    key: string,
    input: {
      discrepancy_type: string;
      description: string;
      severity?: string;
      evidence?: unknown[];
    },
  ) {
    const access = await this.accessible(
      actor,
      id,
      'INVENTORY_DISCREPANCY_REPORT',
    );
    return this.db.transaction(async (manager) => {
      const row = await this.locked(manager, id, access.tenant_id);
      this.assertRevision(row, revision);
      if (row.lifecycle_status === 'RETURN_PENDING')
        throw new ConflictException(
          'Inventory state changes are blocked by an active return hold',
        );
      return this.withIdempotency(
        manager,
        row.tenant_id,
        actor.user_id,
        key,
        input,
        async () => {
          if (!input.description?.trim())
            throw new BadRequestException('Discrepancy description required');
          const discrepancyId = randomUUID();
          await manager.query(
            `INSERT INTO inv_discrepancies(discrepancy_id,tenant_id,inventory_record_id,discrepancy_type,description,reported_by,severity,evidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
            [
              discrepancyId,
              row.tenant_id,
              id,
              input.discrepancy_type,
              input.description.trim(),
              actor.user_id,
              input.severity ?? 'REVIEWABLE',
              JSON.stringify(input.evidence ?? []),
            ],
          );
          await this.audit(
            manager,
            row,
            'DISCREPANCY',
            discrepancyId,
            'INVENTORY_DISCREPANCY_RAISED',
            actor.user_id,
            null,
            input,
          );
          const event = await this.emit(
            manager,
            row,
            'InventoryDiscrepancyRaised.v1',
            {
              discrepancy_id: discrepancyId,
              discrepancy_type: input.discrepancy_type,
              severity: input.severity ?? 'REVIEWABLE',
            },
          );
          return {
            discrepancy_id: discrepancyId,
            aggregate_revision: Number(row.aggregate_revision),
            event,
          };
        },
      );
    });
  }

  async requestStateChange(
    actor: InventoryActor,
    id: string,
    revision: number,
    key: string,
    input: {
      dimension:
        | 'OWNERSHIP'
        | 'CUSTODY'
        | 'LOCATION'
        | 'CONDITION'
        | 'LIFECYCLE';
      new_value: Record<string, unknown>;
      reason: string;
    },
  ) {
    const capability =
      input.dimension === 'OWNERSHIP'
        ? 'INVENTORY_TRANSFER'
        : 'INVENTORY_ASSIGN';
    const access = await this.accessible(actor, id, capability);
    if (!input.reason?.trim())
      throw new BadRequestException('State-change reason required');
    return this.db.transaction(async (manager) => {
      const row = await this.locked(manager, id, access.tenant_id);
      this.assertRevision(row, revision);
      return this.withIdempotency(
        manager,
        row.tenant_id,
        actor.user_id,
        key,
        input,
        async () => {
          const previousByDimension: Record<string, unknown> = {
            OWNERSHIP: { owner_department_id: row.owner_department_id },
            CUSTODY: { custodian_user_id: row.custodian_user_id },
            LOCATION: {
              location_space_id: row.location_space_id,
              location_text: row.location_text,
            },
            CONDITION: { condition: row.condition },
            LIFECYCLE: { lifecycle_status: row.lifecycle_status },
          };
          const historyId = randomUUID();
          await manager.query(
            `INSERT INTO inv_state_history(history_id,tenant_id,inventory_record_id,dimension,previous_value,new_value,reason,initiated_by)
           VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8)`,
            [
              historyId,
              row.tenant_id,
              id,
              input.dimension,
              JSON.stringify(previousByDimension[input.dimension]),
              JSON.stringify(input.new_value),
              input.reason.trim(),
              actor.user_id,
            ],
          );
          await manager.query(
            `UPDATE inv_records SET aggregate_revision=aggregate_revision+1,updated_at=NOW() WHERE inventory_record_id=$1`,
            [id],
          );
          await this.audit(
            manager,
            row,
            'STATE_CHANGE',
            historyId,
            'INVENTORY_STATE_CHANGE_REQUESTED',
            actor.user_id,
            previousByDimension[input.dimension],
            input.new_value,
            input.reason,
          );
          return {
            history_id: historyId,
            status: 'PENDING',
            aggregate_revision: Number(row.aggregate_revision) + 1,
          };
        },
      );
    });
  }

  async acknowledgeStateChange(
    actor: InventoryActor,
    id: string,
    historyId: string,
    revision: number,
    key: string,
  ) {
    const access = await this.accessible(actor, id, 'INVENTORY_TRANSFER');
    return this.db.transaction(async (manager) => {
      const row = await this.locked(manager, id, access.tenant_id);
      this.assertRevision(row, revision);
      return this.withIdempotency(
        manager,
        row.tenant_id,
        actor.user_id,
        key,
        { historyId },
        async () => {
          const histories = await manager.query(
            `SELECT * FROM inv_state_history WHERE history_id=$1 AND inventory_record_id=$2 AND status='PENDING' FOR UPDATE`,
            [historyId, id],
          );
          const history = histories[0];
          if (!history)
            throw new NotFoundException('Pending state change not found');
          if (history.initiated_by === actor.user_id)
            throw new ForbiddenException({
              message: 'Initiator cannot acknowledge the same state change',
              code: 'INVENTORY_STATE_MAKER_CHECKER_VIOLATION',
            });
          const value = history.new_value as Record<string, unknown>;
          await this.validateTargetReferences(manager, row.tenant_id, value);
          const lifecycle =
            typeof value.lifecycle_status === 'string'
              ? value.lifecycle_status
              : null;
          if (
            lifecycle &&
            ![
              'AVAILABLE',
              'ASSIGNED',
              'IN_USE',
              'MAINTENANCE',
              'RETURNED',
              'RETIRED',
              'WRITTEN_OFF',
              'DISPOSED',
            ].includes(lifecycle)
          )
            throw new BadRequestException('Invalid lifecycle status');
          await manager.query(
            `UPDATE inv_records SET
             owner_department_id=CASE WHEN $2='OWNERSHIP' THEN ($3->>'owner_department_id')::int ELSE owner_department_id END,
             custodian_user_id=CASE WHEN $2='CUSTODY' THEN NULLIF($3->>'custodian_user_id','')::uuid ELSE custodian_user_id END,
             location_space_id=CASE WHEN $2='LOCATION' THEN NULLIF($3->>'location_space_id','')::uuid ELSE location_space_id END,
             location_text=CASE WHEN $2='LOCATION' THEN $3->>'location_text' ELSE location_text END,
             condition=CASE WHEN $2='CONDITION' THEN $3->>'condition' ELSE condition END,
             lifecycle_status=CASE WHEN $2='LIFECYCLE' THEN $3->>'lifecycle_status' ELSE lifecycle_status END,
             aggregate_revision=aggregate_revision+1,updated_at=NOW() WHERE inventory_record_id=$1`,
            [id, history.dimension, JSON.stringify(value)],
          );
          await manager.query(
            `UPDATE inv_state_history SET status='APPLIED',acknowledged_by=$2,applied_at=NOW() WHERE history_id=$1`,
            [historyId, actor.user_id],
          );
          const eventName: Record<string, string> = {
            OWNERSHIP: 'InventoryOwnershipTransferred.v1',
            CUSTODY: 'InventoryCustodianChanged.v1',
            LOCATION: 'InventoryLocationChanged.v1',
            CONDITION: 'InventoryConditionChanged.v1',
            LIFECYCLE: 'InventoryLifecycleChanged.v1',
          };
          row.aggregate_revision = Number(row.aggregate_revision) + 1;
          await this.audit(
            manager,
            row,
            'STATE_CHANGE',
            historyId,
            'INVENTORY_STATE_CHANGE_APPLIED',
            actor.user_id,
            history.previous_value,
            value,
            history.reason,
          );
          const event = await this.emit(
            manager,
            row,
            eventName[history.dimension],
            {
              history_id: historyId,
              previous_value: history.previous_value,
              new_value: value,
            },
          );
          return {
            history_id: historyId,
            status: 'APPLIED',
            aggregate_revision: Number(row.aggregate_revision),
            event,
          };
        },
      );
    });
  }

  async revokeRfid(
    actor: InventoryActor,
    id: string,
    revision: number,
    key: string,
    input: { reason: string; status?: 'LOST' | 'REVOKED' },
  ) {
    const access = await this.accessible(actor, id, 'INVENTORY_RFID_ENCODE');
    if (!input.reason?.trim())
      throw new BadRequestException('RFID revocation reason required');
    return this.db.transaction(async (manager) => {
      const row = await this.locked(manager, id, access.tenant_id);
      this.assertRevision(row, revision);
      return this.withIdempotency(
        manager,
        row.tenant_id,
        actor.user_id,
        key,
        input,
        async () => {
          const bindings = await manager.query(
            `SELECT b.*,l.logical_rfid_id FROM inv_rfid_bindings b JOIN inv_logical_rfids l ON l.logical_rfid_id=b.logical_rfid_id WHERE l.inventory_record_id=$1 AND b.status='ACTIVE' FOR UPDATE OF b,l`,
            [id],
          );
          const binding = bindings[0];
          if (!binding)
            throw new NotFoundException('Active RFID binding not found');
          const status = input.status ?? 'REVOKED';
          await manager.query(
            `UPDATE inv_rfid_bindings SET status=$2,active_to=NOW() WHERE rfid_binding_id=$1`,
            [binding.rfid_binding_id, status],
          );
          await manager.query(
            `UPDATE inv_logical_rfids SET status='PREPARED' WHERE logical_rfid_id=$1`,
            [binding.logical_rfid_id],
          );
          await manager.query(
            `UPDATE inv_identity_revisions SET status='SUPERSEDED' WHERE inventory_record_id=$1 AND status='ACTIVE'`,
            [id],
          );
          await manager.query(
            `UPDATE inv_records SET record_status='ACTIVATION_PENDING',aggregate_revision=aggregate_revision+1,updated_at=NOW() WHERE inventory_record_id=$1`,
            [id],
          );
          row.aggregate_revision = Number(row.aggregate_revision) + 1;
          await this.audit(
            manager,
            row,
            'RFID_BINDING',
            binding.rfid_binding_id,
            'RFID_TAG_REVOKED',
            actor.user_id,
            { status: binding.status },
            { status },
            input.reason,
          );
          const event = await this.emit(manager, row, 'RFIDTagRevoked.v1', {
            rfid_binding_id: binding.rfid_binding_id,
            logical_rfid_id: binding.logical_rfid_id,
            reason: input.reason,
            status,
          });
          await this.updateLineCompletion(manager, row);
          return {
            rfid_binding_id: binding.rfid_binding_id,
            status,
            aggregate_revision: Number(row.aggregate_revision),
            event,
          };
        },
      );
    });
  }

  async resolveDiscrepancy(
    actor: InventoryActor,
    id: string,
    discrepancyId: string,
    revision: number,
    key: string,
    input: {
      resolution: string;
      reason: string;
      correction?: Record<string, unknown>;
    },
  ) {
    const access = await this.accessible(
      actor,
      id,
      'INVENTORY_DISCREPANCY_RESOLVE',
    );
    return this.db.transaction(async (manager) => {
      const row = await this.locked(manager, id, access.tenant_id);
      this.assertRevision(row, revision);
      return this.withIdempotency(
        manager,
        row.tenant_id,
        actor.user_id,
        key,
        input,
        async () => {
          const discrepancies = await manager.query(
            `SELECT * FROM inv_discrepancies WHERE discrepancy_id=$1 AND inventory_record_id=$2 FOR UPDATE`,
            [discrepancyId, id],
          );
          const discrepancy = discrepancies[0];
          if (!discrepancy)
            throw new NotFoundException('Discrepancy not found');
          if (discrepancy.reported_by === actor.user_id)
            throw new ForbiddenException({
              message: 'Reporter cannot resolve the same discrepancy',
              code: 'DISCREPANCY_MAKER_CHECKER_VIOLATION',
            });
          await manager.query(
            `INSERT INTO inv_discrepancy_resolutions(discrepancy_id,tenant_id,resolution,correction,reason,resolved_by) VALUES($1,$2,$3,$4::jsonb,$5,$6)`,
            [
              discrepancyId,
              row.tenant_id,
              input.resolution,
              JSON.stringify(input.correction ?? {}),
              input.reason,
              actor.user_id,
            ],
          );
          await manager.query(
            `UPDATE inv_discrepancies SET status='RESOLVED',resolved_at=NOW() WHERE discrepancy_id=$1`,
            [discrepancyId],
          );
          await this.audit(
            manager,
            row,
            'DISCREPANCY',
            discrepancyId,
            'INVENTORY_DISCREPANCY_RESOLVED',
            actor.user_id,
            { status: discrepancy.status },
            {
              resolution: input.resolution,
              correction: input.correction ?? {},
            },
            input.reason,
          );
          const event = await this.emit(
            manager,
            row,
            'InventoryDiscrepancyResolved.v1',
            { discrepancy_id: discrepancyId, resolution: input.resolution },
          );
          return {
            discrepancy_id: discrepancyId,
            status: 'RESOLVED',
            aggregate_revision: Number(row.aggregate_revision),
            event,
          };
        },
      );
    });
  }

  async consumeInvalidation(eventId: string) {
    return this.db.transaction(async (manager) => {
      if (
        (
          await manager.query(
            `SELECT 1 FROM inv_consumed_events WHERE event_id=$1`,
            [eventId],
          )
        )[0]
      )
        return { duplicate: true };
      const events = await manager.query(
        `SELECT * FROM pv_outbox_events WHERE event_id=$1 AND event_type IN('PhysicalVerificationIdentityRevoked.v1','PhysicalVerificationReconsidered.v1') FOR UPDATE`,
        [eventId],
      );
      const event = events[0];
      if (!event || inventoryHash(event.payload) !== event.payload_hash)
        throw new ConflictException('Invalid Module 4 event');
      const records = await manager.query(
        `SELECT * FROM inv_records WHERE subject_id=$1 AND tenant_id=$2 FOR UPDATE`,
        [event.subject_id, event.tenant_id],
      );
      const row = records[0];
      if (row) {
        await manager.query(
          `UPDATE inv_records SET record_status='QUARANTINED',quarantined_at=NOW(),aggregate_revision=aggregate_revision+1,updated_at=NOW() WHERE inventory_record_id=$1`,
          [row.inventory_record_id],
        );
        await manager.query(
          `UPDATE inv_identity_revisions SET status='REVOKED',revoked_at=NOW() WHERE inventory_record_id=$1 AND status='ACTIVE'`,
          [row.inventory_record_id],
        );
        await manager.query(
          `UPDATE inv_rfid_bindings SET status='REVOKED',active_to=NOW() WHERE logical_rfid_id IN(SELECT logical_rfid_id FROM inv_logical_rfids WHERE inventory_record_id=$1) AND status='ACTIVE'`,
          [row.inventory_record_id],
        );
        row.aggregate_revision = Number(row.aggregate_revision) + 1;
        await this.audit(
          manager,
          row,
          'INVENTORY_RECORD',
          row.inventory_record_id,
          'INVENTORY_QUARANTINED',
          null,
          { record_status: row.record_status },
          { record_status: 'QUARANTINED', source_event_id: eventId },
        );
        await this.emit(manager, row, 'InventoryRecordQuarantined.v1', {
          source_event_id: eventId,
          reason: event.event_type,
        });
        await this.updateLineCompletion(manager, row);
      }
      await manager.query(
        `INSERT INTO inv_consumed_events(event_id,tenant_id,event_type,inventory_record_id) VALUES($1,$2,$3,$4)`,
        [
          eventId,
          event.tenant_id,
          event.event_type,
          row?.inventory_record_id ?? null,
        ],
      );
      return { quarantined: Boolean(row) };
    });
  }

  async placeServiceHold(
    manager: EntityManager,
    actor: InventoryActor,
    serviceCaseId: string,
    inventoryRecordId: string,
    reason: string,
  ) {
    const rows = await manager.query(
      `SELECT * FROM inv_records WHERE inventory_record_id=$1 AND tenant_id=$2 FOR UPDATE`,
      [inventoryRecordId, this.tenant(actor)],
    );
    const row = rows[0];
    if (!row || row.record_type !== 'ITEM' || row.record_status !== 'ACTIVE')
      throw new ConflictException('Active ITEM inventory record required');
    if (
      ['RETURNED', 'RETIRED', 'WRITTEN_OFF', 'DISPOSED'].includes(
        row.lifecycle_status,
      )
    )
      throw new ConflictException('Asset lifecycle is not service eligible');
    const existing = await manager.query(
      `SELECT 1 FROM svc_asset_holds WHERE inventory_record_id=$1 AND status='ACTIVE'`,
      [inventoryRecordId],
    );
    if (existing[0])
      throw new ConflictException(
        'Asset already has an active service execution',
      );
    const holdId = randomUUID();
    await manager.query(
      `INSERT INTO svc_asset_holds(service_hold_id,tenant_id,service_case_id,inventory_record_id,previous_lifecycle_status,hold_reason,placed_by)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [
        holdId,
        row.tenant_id,
        serviceCaseId,
        inventoryRecordId,
        row.lifecycle_status,
        reason,
        actor.user_id,
      ],
    );
    await manager.query(
      `UPDATE inv_records SET lifecycle_status='MAINTENANCE',updated_at=NOW() WHERE inventory_record_id=$1`,
      [inventoryRecordId],
    );
    await this.audit(
      manager,
      row,
      'SERVICE_HOLD',
      serviceCaseId,
      'ASSET_SERVICE_HOLD_PLACED',
      actor.user_id,
      { lifecycle_status: row.lifecycle_status },
      { lifecycle_status: 'MAINTENANCE' },
      reason,
    );
    await this.emit(manager, row, 'InventoryServiceHoldPlaced.v1', {
      service_case_id: serviceCaseId,
      previous_lifecycle_status: row.lifecycle_status,
    });
    return {
      service_hold_id: holdId,
      previous_lifecycle_status: row.lifecycle_status,
    };
  }

  async transferServiceCustody(
    manager: EntityManager,
    actor: InventoryActor,
    serviceCaseId: string,
    inventoryRecordId: string,
    availability:
      | 'INTERNAL_SERVICE_CUSTODY'
      | 'VENDOR_SERVICE_CUSTODY'
      | 'RETURNED_TO_CUSTODIAN',
    providerId?: string | null,
    serviceLocation?: string,
    shipmentReference?: string,
    condition?: string,
    evidenceManifestHash?: string,
  ) {
    const row = (
      await manager.query(
        `SELECT * FROM inv_records WHERE inventory_record_id=$1 AND tenant_id=$2 FOR UPDATE`,
        [inventoryRecordId, this.tenant(actor)],
      )
    )[0];
    if (!row) throw new NotFoundException('Inventory record not found');
    const hold = (
      await manager.query(
        `SELECT 1 FROM svc_asset_holds WHERE service_case_id=$1 AND inventory_record_id=$2 AND status='ACTIVE' FOR UPDATE`,
        [serviceCaseId, inventoryRecordId],
      )
    )[0];
    if (!hold)
      throw new ConflictException('Active Module 8 service hold required');
    const current =
      (
        await manager.query(
          `SELECT new_availability FROM svc_custody_history WHERE service_case_id=$1 ORDER BY occurred_at DESC LIMIT 1`,
          [serviceCaseId],
        )
      )[0]?.new_availability ?? 'OUT_OF_SERVICE';
    if (availability === 'VENDOR_SERVICE_CUSTODY' && !providerId)
      throw new ConflictException(
        'Vendor custody requires an approved provider',
      );
    await manager.query(
      `INSERT INTO svc_custody_history(tenant_id,service_case_id,inventory_record_id,previous_availability,new_availability,provider_id,service_location,shipment_reference,condition,evidence_manifest_hash,handed_over_by,received_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        row.tenant_id,
        serviceCaseId,
        inventoryRecordId,
        current,
        availability,
        providerId ?? null,
        serviceLocation ?? null,
        shipmentReference ?? null,
        condition ?? null,
        evidenceManifestHash ?? null,
        actor.user_id,
        availability === 'RETURNED_TO_CUSTODIAN' ? actor.user_id : null,
      ],
    );
    await this.audit(
      manager,
      row,
      'SERVICE_CUSTODY',
      serviceCaseId,
      'ASSET_SERVICE_CUSTODY_CHANGED',
      actor.user_id,
      { availability: current },
      {
        availability,
        provider_id: providerId,
        service_location: serviceLocation,
      },
    );
    await this.emit(manager, row, 'InventoryServiceCustodyChanged.v1', {
      service_case_id: serviceCaseId,
      availability,
      provider_id: providerId,
      service_location: serviceLocation,
    });
  }

  async releaseServiceHold(
    manager: EntityManager,
    actor: InventoryActor,
    serviceCaseId: string,
    inventoryRecordId: string,
    reason: string,
  ) {
    const row = (
      await manager.query(
        `SELECT * FROM inv_records WHERE inventory_record_id=$1 AND tenant_id=$2 FOR UPDATE`,
        [inventoryRecordId, this.tenant(actor)],
      )
    )[0];
    if (!row) throw new NotFoundException('Inventory record not found');
    const hold = (
      await manager.query(
        `SELECT * FROM svc_asset_holds WHERE service_case_id=$1 AND inventory_record_id=$2 AND status='ACTIVE' FOR UPDATE`,
        [serviceCaseId, inventoryRecordId],
      )
    )[0];
    if (!hold) return;
    const restored = [
      'RETURNED',
      'RETIRED',
      'WRITTEN_OFF',
      'DISPOSED',
      'RETURN_PENDING',
    ].includes(hold.previous_lifecycle_status)
      ? 'AVAILABLE'
      : hold.previous_lifecycle_status;
    await manager.query(
      `UPDATE svc_asset_holds SET status='RELEASED',released_by=$2,released_at=NOW(),release_reason=$3 WHERE service_hold_id=$1`,
      [hold.service_hold_id, actor.user_id, reason],
    );
    await manager.query(
      `UPDATE inv_records SET lifecycle_status=$2,updated_at=NOW() WHERE inventory_record_id=$1`,
      [inventoryRecordId, restored],
    );
    await this.audit(
      manager,
      row,
      'SERVICE_HOLD',
      serviceCaseId,
      'ASSET_SERVICE_HOLD_RELEASED',
      actor.user_id,
      { lifecycle_status: row.lifecycle_status },
      { lifecycle_status: restored },
      reason,
    );
    await this.emit(manager, row, 'InventoryServiceHoldReleased.v1', {
      service_case_id: serviceCaseId,
      lifecycle_status: restored,
      reason,
    });
  }

  async quarantineForService(
    manager: EntityManager,
    actor: InventoryActor,
    serviceCaseId: string,
    inventoryRecordId: string,
    reason: string,
  ) {
    const row = (
      await manager.query(
        `SELECT * FROM inv_records WHERE inventory_record_id=$1 AND tenant_id=$2 FOR UPDATE`,
        [inventoryRecordId, this.tenant(actor)],
      )
    )[0];
    if (!row) throw new NotFoundException('Inventory record not found');
    await manager.query(
      `UPDATE inv_records SET record_status='QUARANTINED',lifecycle_status='MAINTENANCE',quarantined_at=NOW(),updated_at=NOW() WHERE inventory_record_id=$1`,
      [inventoryRecordId],
    );
    await this.audit(
      manager,
      row,
      'SERVICE_OUTCOME',
      serviceCaseId,
      'ASSET_SERVICE_QUARANTINED',
      actor.user_id,
      { record_status: row.record_status },
      { record_status: 'QUARANTINED', reason },
    );
    await this.emit(manager, row, 'InventoryRecordQuarantined.v1', {
      service_case_id: serviceCaseId,
      reason,
    });
  }

  async publicScan(code: string) {
    if (!/^[A-Z0-9][A-Z0-9_-]{3,119}$/.test(code))
      throw new NotFoundException('Inventory identity not found');
    const rows = await this.db.query(
      `SELECT r.inventory_record_id,r.record_type,r.record_status,r.lifecycle_status,r.university_asset_id,r.lot_id,m.product_name,m.category,t.name institution_name,lr.logical_rfid_code,ir.signed_payload,ir.signature,ir.signing_key_version,ir.identity_revision
       FROM inv_records r JOIN tenants t ON t.tenant_id=r.tenant_id JOIN inv_product_models m ON m.product_model_id=r.product_model_id
       LEFT JOIN inv_logical_rfids lr ON lr.inventory_record_id=r.inventory_record_id
       LEFT JOIN inv_identity_revisions ir ON ir.inventory_record_id=r.inventory_record_id AND ir.status='ACTIVE'
       WHERE r.university_asset_id=$1 OR r.lot_id=$1 OR lr.logical_rfid_code=$1 LIMIT 2`,
      [code],
    );
    const row = rows[0];
    if (!row || rows.length !== 1)
      throw new NotFoundException('Inventory identity not found');
    const configuredPublic = this.config
      .get<string>('INVENTORY_ED25519_PUBLIC_KEY')
      ?.replace(/\\n/g, '\n');
    const privateKey = this.config
      .get<string>('INVENTORY_ED25519_PRIVATE_KEY')
      ?.replace(/\\n/g, '\n');
    let publicKey = configuredPublic;
    if (!publicKey && privateKey)
      publicKey = createPublicKey(privateKey)
        .export({ type: 'spki', format: 'pem' })
        .toString();
    const signatureValid =
      publicKey && row.signed_payload
        ? verifyInventoryIdentity(row.signed_payload, row.signature, publicKey)
        : null;
    return {
      university_asset_id: row.university_asset_id,
      lot_id: row.lot_id,
      logical_rfid_id: row.logical_rfid_code,
      record_type: row.record_type,
      institutional_owner: row.institution_name,
      product_name: row.product_name,
      category: row.category,
      record_status: row.record_status,
      lifecycle_status: row.lifecycle_status,
      current_validity:
        row.record_status === 'ACTIVE' && signatureValid !== false
          ? 'VALID'
          : 'NOT_VALID',
      identity_revision: Number(row.identity_revision ?? 0),
      signature_valid: signatureValid,
      signing_key_version: row.signing_key_version,
    };
  }
}
