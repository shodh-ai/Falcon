/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call -- TypeORM raw-query rows are validated at domain boundaries */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { createPublicKey, randomBytes, randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { InventoryService } from '../inventory/inventory.service';
import type {
  AttachmentResultInput,
  DeviceContext,
  EncodingResultInput,
  GateObservationInput,
  PhysicalIdentityActor,
  PrintResultInput,
  RegisterDeviceInput,
  VerifyAttachmentInput,
} from './physical-identity.types';
import {
  physicalIdentityHash,
  physicalIdentityJson,
  signPhysicalIdentity,
  verifyPhysicalIdentity,
} from './physical-identity.util';

@Injectable()
export class PhysicalIdentityService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly inventory: InventoryService,
    private readonly config: ConfigService,
  ) {}

  private tenant(actor: PhysicalIdentityActor) {
    if (!actor.tenant_id)
      throw new ForbiddenException('Tenant context is required');
    return actor.tenant_id;
  }
  private roles(actor: PhysicalIdentityActor) {
    return [
      ...new Set([...(actor.roles ?? []), ...(actor.role ? [actor.role] : [])]),
    ].map((role) => role.toLowerCase());
  }
  private async grants(actor: PhysicalIdentityActor, capability: string) {
    return this.db.query(
      `SELECT scope_type,scope_reference FROM acq_access_grants WHERE tenant_id=$1 AND capability=$2
       AND valid_from<=NOW() AND(valid_until IS NULL OR valid_until>NOW())
       AND(principal_user_id=$3 OR lower(principal_role)=ANY($4::text[]))`,
      [this.tenant(actor), capability, actor.user_id, this.roles(actor)],
    );
  }
  private async require(actor: PhysicalIdentityActor, capability: string) {
    if (!(await this.grants(actor, capability)).length)
      throw new ForbiddenException(`Missing ${capability}`);
  }
  private async enabled(tenantId: string, feature: string) {
    return Boolean(
      (
        await this.db.query(
          `SELECT 1 FROM tenant_subscriptions WHERE tenant_id=$1 AND feature_key=$2 AND is_enabled=true AND(expires_at IS NULL OR expires_at>=NOW())`,
          [tenantId, feature],
        )
      )[0],
    );
  }
  private signing() {
    const privateKey = this.config
      .get<string>('INVENTORY_ED25519_PRIVATE_KEY')
      ?.replace(/\\n/g, '\n');
    const keyVersion = this.config.get<string>('INVENTORY_SIGNING_KEY_VERSION');
    if (!privateKey || !keyVersion)
      throw new ConflictException({
        message: 'Module 5 identity signing key is unavailable',
        code: 'MODULE_X_SIGNING_UNAVAILABLE',
      });
    return { privateKey, keyVersion };
  }
  private verificationKey() {
    const configured = this.config
      .get<string>('INVENTORY_ED25519_PUBLIC_KEY')
      ?.replace(/\\n/g, '\n');
    if (configured) return configured;
    const { privateKey } = this.signing();
    return createPublicKey(privateKey)
      .export({ type: 'spki', format: 'pem' })
      .toString();
  }

  async publicLabelScan(code: string, token: string) {
    if (!token?.includes('.'))
      throw new NotFoundException('Physical identity label not found');
    const [encoded, signature] = token.split('.', 2);
    let claims: Record<string, unknown>;
    try {
      claims = JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf8'),
      ) as Record<string, unknown>;
    } catch {
      throw new NotFoundException('Physical identity label not found');
    }
    if (
      claims.type !== 'FALCON_PHYSICAL_IDENTITY_LABEL_V1' ||
      claims.university_asset_id !== code ||
      !verifyPhysicalIdentity(claims, signature, this.verificationKey())
    )
      throw new NotFoundException('Physical identity label not found');
    const rows = await this.db.query(
      `SELECT status FROM pix_provisioning_jobs WHERE generation_request_id=$1 AND inventory_record_id=$2 AND university_asset_id=$3 AND inventory_revision=$4 LIMIT 1`,
      [
        claims.generation_request_id,
        claims.inventory_record_id,
        code,
        claims.inventory_revision,
      ],
    );
    if (!rows[0])
      throw new NotFoundException('Physical identity label not found');
    const inventory = await this.inventory.publicScan(code);
    return {
      ...inventory,
      physical_label_signature_valid: true,
      provisioning_status: rows[0].status,
      label_current:
        rows[0].status === 'COMPLETED' &&
        inventory.current_validity === 'VALID',
    };
  }
  private async idempotent<T>(
    manager: EntityManager,
    tenantId: string,
    actorReference: string,
    key: string,
    input: unknown,
    work: () => Promise<T>,
  ): Promise<T> {
    if (!key?.trim()) throw new BadRequestException('Idempotency-Key required');
    const requestHash = physicalIdentityHash(input);
    await manager.query(
      `SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))`,
      [tenantId, `${actorReference}:${key}`],
    );
    const prior = await manager.query(
      `SELECT request_hash,response_payload FROM pix_idempotency WHERE tenant_id=$1 AND actor_reference=$2 AND idempotency_key=$3 FOR UPDATE`,
      [tenantId, actorReference, key],
    );
    if (prior[0]) {
      if (prior[0].request_hash !== requestHash)
        throw new ConflictException(
          'Idempotency key reused with a changed payload',
        );
      return prior[0].response_payload as T;
    }
    const result = await work();
    await manager.query(
      `INSERT INTO pix_idempotency(tenant_id,actor_reference,idempotency_key,request_hash,response_payload) VALUES($1,$2,$3,$4,$5::jsonb)`,
      [tenantId, actorReference, key, requestHash, JSON.stringify(result)],
    );
    return result;
  }
  private async audit(
    manager: EntityManager,
    tenantId: string,
    aggregateType: string,
    aggregateId: string,
    action: string,
    actorReference: string,
    previousValue: unknown,
    newValue: unknown,
  ) {
    const prior = await manager.query(
      `SELECT event_hash FROM pix_audit_events WHERE tenant_id=$1 AND aggregate_id=$2 ORDER BY occurred_at DESC,audit_event_id DESC LIMIT 1`,
      [tenantId, aggregateId],
    );
    const previousHash = prior[0]?.event_hash ?? null;
    const eventHash = physicalIdentityHash({
      tenantId,
      aggregateType,
      aggregateId,
      action,
      actorReference,
      previousValue,
      newValue,
      previousHash,
    });
    await manager.query(
      `INSERT INTO pix_audit_events(tenant_id,aggregate_type,aggregate_id,action,actor_reference,previous_value,new_value,previous_event_hash,event_hash) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9)`,
      [
        tenantId,
        aggregateType,
        aggregateId,
        action,
        actorReference,
        previousValue === undefined ? null : JSON.stringify(previousValue),
        newValue === undefined ? null : JSON.stringify(newValue),
        previousHash,
        eventHash,
      ],
    );
  }
  private async emit(
    manager: EntityManager,
    job: any,
    eventType: string,
    payload: Record<string, unknown>,
  ) {
    const eventId = randomUUID(),
      revision = Number(job.aggregate_revision) + 1,
      sequence = Number(job.next_event_sequence),
      occurredAt = new Date().toISOString(),
      envelope = {
        event_id: eventId,
        event_type: eventType,
        event_version: 1,
        aggregate_id: job.provisioning_job_id,
        aggregate_revision: revision,
        aggregate_sequence: sequence,
        tenant_id: job.tenant_id,
        inventory_record_id: job.inventory_record_id,
        occurred_at: occurredAt,
        payload,
      },
      payloadHash = physicalIdentityHash(envelope);
    await manager.query(
      `INSERT INTO pix_outbox_events(event_id,event_type,aggregate_id,aggregate_revision,aggregate_sequence,tenant_id,occurred_at,payload,payload_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
      [
        eventId,
        eventType,
        job.provisioning_job_id,
        revision,
        sequence,
        job.tenant_id,
        occurredAt,
        JSON.stringify({ ...envelope, payload_hash: payloadHash }),
        payloadHash,
      ],
    );
    await manager.query(
      `UPDATE pix_provisioning_jobs SET aggregate_revision=$2,next_event_sequence=$3,updated_at=NOW() WHERE provisioning_job_id=$1`,
      [job.provisioning_job_id, revision, sequence + 1],
    );
    job.aggregate_revision = revision;
    job.next_event_sequence = sequence + 1;
    return { ...envelope, payload_hash: payloadHash };
  }
  private async emitObservation(
    manager: EntityManager,
    observation: any,
    eventType: string,
    payload: Record<string, unknown>,
  ) {
    const eventId = randomUUID(),
      occurredAt = new Date().toISOString(),
      envelope = {
        event_id: eventId,
        event_type: eventType,
        event_version: 1,
        aggregate_id: observation.gate_observation_id,
        aggregate_revision: 1,
        aggregate_sequence: 1,
        tenant_id: observation.tenant_id,
        inventory_record_id: observation.inventory_record_id,
        occurred_at: occurredAt,
        payload,
      },
      hash = physicalIdentityHash(envelope);
    await manager.query(
      `INSERT INTO pix_outbox_events(event_id,event_type,aggregate_id,aggregate_revision,aggregate_sequence,tenant_id,occurred_at,payload,payload_hash) VALUES($1,$2,$3,1,1,$4,$5,$6::jsonb,$7)`,
      [
        eventId,
        eventType,
        observation.gate_observation_id,
        observation.tenant_id,
        occurredAt,
        JSON.stringify({ ...envelope, payload_hash: hash }),
        hash,
      ],
    );
  }
  private async emitDevice(
    manager: EntityManager,
    device: any,
    eventType: string,
    payload: Record<string, unknown>,
  ) {
    const eventId = randomUUID(),
      occurredAt = new Date().toISOString(),
      prior = await manager.query(
        `SELECT COALESCE(MAX(aggregate_sequence),0)::bigint latest FROM pix_outbox_events WHERE aggregate_id=$1`,
        [device.device_id],
      ),
      envelope = {
        event_id: eventId,
        event_type: eventType,
        event_version: 1,
        aggregate_id: device.device_id,
        aggregate_revision: 1,
        aggregate_sequence: Number(prior[0]?.latest ?? 0) + 1,
        tenant_id: device.tenant_id,
        occurred_at: occurredAt,
        payload,
      },
      hash = physicalIdentityHash(envelope);
    await manager.query(
      `INSERT INTO pix_outbox_events(event_id,event_type,aggregate_id,aggregate_revision,aggregate_sequence,tenant_id,occurred_at,payload,payload_hash) VALUES($1,$2,$3,1,$4,$5,$6,$7::jsonb,$8)`,
      [
        eventId,
        eventType,
        device.device_id,
        envelope.aggregate_sequence,
        device.tenant_id,
        occurredAt,
        JSON.stringify({ ...envelope, payload_hash: hash }),
        hash,
      ],
    );
  }

  async dashboard(actor: PhysicalIdentityActor) {
    await this.require(actor, 'PHYSICAL_IDENTITY_VIEW');
    const rows = await this.db.query(
      `SELECT COUNT(*)::int total_jobs,COUNT(*) FILTER(WHERE status IN('AUTHORIZED','CLAIMED','ENCODING','PRINTING','ATTACHMENT_PENDING','VERIFICATION_PENDING'))::int active_jobs,COUNT(*) FILTER(WHERE status='VERIFICATION_PENDING')::int awaiting_verification,COUNT(*) FILTER(WHERE status='FAILED')::int failed_jobs FROM pix_provisioning_jobs WHERE tenant_id=$1`,
      [this.tenant(actor)],
    );
    const gates = await this.db.query(
      `SELECT COUNT(*)::int observations,COUNT(*) FILTER(WHERE result='REVIEW_REQUIRED')::int review_required,(SELECT COUNT(*)::int FROM pix_gate_alerts WHERE tenant_id=$1 AND status IN('OPEN','ACKNOWLEDGED','ESCALATED')) open_alerts FROM pix_gate_observations WHERE tenant_id=$1 AND server_received_at>NOW()-INTERVAL '24 hours'`,
      [this.tenant(actor)],
    );
    const devices = await this.db.query(
      `SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE status='ACTIVE' AND attestation_status='ATTESTED')::int healthy FROM pix_devices WHERE tenant_id=$1`,
      [this.tenant(actor)],
    );
    return { ...(rows[0] ?? {}), ...(gates[0] ?? {}), devices: devices[0] };
  }
  async jobs(actor: PhysicalIdentityActor) {
    await this.require(actor, 'PHYSICAL_IDENTITY_VIEW');
    return this.db.query(
      `SELECT j.provisioning_job_id,j.generation_request_id,j.inventory_record_id,j.university_asset_id,j.logical_rfid_code,j.job_type,j.status,j.expires_at,j.physical_tag_uid,j.label_serial,j.aggregate_revision,j.updated_at,m.product_name,m.category,d.device_code
       FROM pix_provisioning_jobs j JOIN inv_records r ON r.inventory_record_id=j.inventory_record_id JOIN inv_product_models m ON m.product_model_id=r.product_model_id LEFT JOIN pix_devices d ON d.device_id=j.claimed_by_device_id
       WHERE j.tenant_id=$1 ORDER BY j.updated_at DESC LIMIT 250`,
      [this.tenant(actor)],
    );
  }
  async eligibleAssets(actor: PhysicalIdentityActor) {
    await this.require(actor, 'PHYSICAL_IDENTITY_VIEW');
    return this.db.query(
      `SELECT r.inventory_record_id,r.university_asset_id,r.record_status,r.lifecycle_status,r.aggregate_revision,m.product_name,m.category,m.brand,m.model_number,l.logical_rfid_code,p.attachment_status,p.provisioning_job_id
       FROM inv_records r JOIN inv_product_models m ON m.product_model_id=r.product_model_id
       LEFT JOIN inv_logical_rfids l ON l.inventory_record_id=r.inventory_record_id AND l.status<>'REVOKED'
       LEFT JOIN pix_inventory_projections p ON p.inventory_record_id=r.inventory_record_id
       WHERE r.tenant_id=$1 AND r.record_type='ITEM' AND r.record_status IN('IDENTITY_PENDING','ACTIVATION_PENDING','ACTIVE')
       ORDER BY r.updated_at DESC LIMIT 500`,
      [this.tenant(actor)],
    );
  }
  async job(actor: PhysicalIdentityActor, id: string) {
    await this.require(actor, 'PHYSICAL_IDENTITY_VIEW');
    const rows = await this.db.query(
      `SELECT j.*,m.product_name,m.category,m.brand,m.model_number FROM pix_provisioning_jobs j JOIN inv_records r ON r.inventory_record_id=j.inventory_record_id JOIN inv_product_models m ON m.product_model_id=r.product_model_id WHERE j.provisioning_job_id=$1 AND j.tenant_id=$2`,
      [id, this.tenant(actor)],
    );
    if (!rows[0]) throw new NotFoundException('Provisioning job not found');
    const [attempts, verification, audits] = await Promise.all([
      this.db.query(
        `SELECT * FROM pix_job_attempts WHERE provisioning_job_id=$1 ORDER BY occurred_at`,
        [id],
      ),
      this.db.query(
        `SELECT * FROM pix_attachment_verifications WHERE provisioning_job_id=$1`,
        [id],
      ),
      this.db.query(
        `SELECT * FROM pix_audit_events WHERE aggregate_id=$1 ORDER BY occurred_at`,
        [id],
      ),
    ]);
    return {
      ...rows[0],
      attempts,
      verification: verification[0] ?? null,
      audits,
    };
  }
  async policies(actor: PhysicalIdentityActor) {
    await this.require(actor, 'PHYSICAL_IDENTITY_VIEW');
    return this.db.query(
      `SELECT * FROM pix_policies WHERE tenant_id=$1 ORDER BY policy_version DESC,category`,
      [this.tenant(actor)],
    );
  }
  async devices(actor: PhysicalIdentityActor) {
    await this.require(actor, 'PHYSICAL_IDENTITY_VIEW');
    return this.db.query(
      `SELECT d.*,p.profile_code,p.driver_adapter,p.simulator_only FROM pix_devices d JOIN pix_hardware_profiles p ON p.hardware_profile_id=d.hardware_profile_id WHERE d.tenant_id=$1 ORDER BY d.device_code`,
      [this.tenant(actor)],
    );
  }
  async hardwareProfiles(actor: PhysicalIdentityActor) {
    await this.require(actor, 'PHYSICAL_IDENTITY_VIEW');
    return this.db.query(
      `SELECT * FROM pix_hardware_profiles WHERE status='ACTIVE' AND(tenant_id=$1 OR tenant_id IS NULL) ORDER BY simulator_only,profile_code`,
      [this.tenant(actor)],
    );
  }
  async registerDevice(
    actor: PhysicalIdentityActor,
    key: string,
    input: RegisterDeviceInput,
  ) {
    await this.require(actor, 'PHYSICAL_IDENTITY_DEVICE_ADMIN');
    if (!/^[a-f0-9]{64}$/i.test(input.certificate_fingerprint))
      throw new BadRequestException('SHA-256 certificate fingerprint required');
    if (!input.public_key.includes('PUBLIC KEY'))
      throw new BadRequestException('Device public key must be PEM encoded');
    return this.db.transaction((manager) =>
      this.idempotent(
        manager,
        this.tenant(actor),
        actor.user_id,
        key,
        input,
        async () => {
          const profile = (
            await manager.query(
              `SELECT * FROM pix_hardware_profiles WHERE hardware_profile_id=$1 AND status='ACTIVE' AND(tenant_id=$2 OR tenant_id IS NULL)`,
              [input.hardware_profile_id, this.tenant(actor)],
            )
          )[0];
          if (!profile)
            throw new NotFoundException('Hardware profile not found');
          if (
            profile.simulator_only &&
            this.config.get<string>('PHYSICAL_IDENTITY_ALLOW_SIMULATOR') !==
              'true'
          )
            throw new ForbiddenException('Simulator devices are disabled');
          const id = randomUUID();
          await manager.query(
            `INSERT INTO pix_devices(device_id,tenant_id,hardware_profile_id,device_code,device_type,campus_reference,location_reference,gate_reference,certificate_fingerprint,public_key,firmware_version,registered_by)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [
              id,
              this.tenant(actor),
              input.hardware_profile_id,
              input.device_code.trim(),
              input.device_type,
              input.campus_reference ?? null,
              input.location_reference ?? null,
              input.gate_reference ?? null,
              input.certificate_fingerprint.toLowerCase(),
              input.public_key,
              input.firmware_version,
              actor.user_id,
            ],
          );
          await this.audit(
            manager,
            this.tenant(actor),
            'DEVICE',
            id,
            'DEVICE_REGISTERED',
            actor.user_id,
            null,
            { device_code: input.device_code, profile: profile.profile_code },
          );
          return { device_id: id, status: 'PENDING' };
        },
      ),
    );
  }

  async registerMachine(
    headers: Record<string, string | undefined>,
    key: string,
    input: RegisterDeviceInput & { tenant_id: string },
  ) {
    const fingerprint = headers['x-client-cert-fingerprint']?.toLowerCase();
    const bootstrapToken = headers['x-device-bootstrap-token'];
    const signature = headers['x-device-signature'];
    const expectedToken = this.config.get<string>(
      'PHYSICAL_IDENTITY_DEVICE_ENROLLMENT_TOKEN',
    );
    if (
      !fingerprint ||
      fingerprint !== input.certificate_fingerprint.toLowerCase() ||
      !bootstrapToken ||
      !expectedToken ||
      bootstrapToken !== expectedToken ||
      !signature ||
      !verifyPhysicalIdentity(
        {
          action: 'DEVICE_REGISTER',
          payload_hash: physicalIdentityHash(input),
        },
        signature,
        input.public_key,
      )
    )
      throw new UnauthorizedException(
        'Device enrollment authentication failed',
      );
    if (
      this.config.get<string>('NODE_ENV') === 'production' &&
      this.config.get<string>('PHYSICAL_IDENTITY_TRUST_MTLS_PROXY') !== 'true'
    )
      throw new UnauthorizedException('Trusted mTLS proxy is required');
    return this.db.transaction((manager) =>
      this.idempotent(
        manager,
        input.tenant_id,
        `device-bootstrap:${fingerprint}`,
        key,
        input,
        async () => {
          const profile = (
            await manager.query(
              `SELECT * FROM pix_hardware_profiles WHERE hardware_profile_id=$1 AND status='ACTIVE' AND(tenant_id=$2 OR tenant_id IS NULL)`,
              [input.hardware_profile_id, input.tenant_id],
            )
          )[0];
          if (!profile)
            throw new NotFoundException('Hardware profile not found');
          if (
            profile.simulator_only &&
            this.config.get<string>('PHYSICAL_IDENTITY_ALLOW_SIMULATOR') !==
              'true'
          )
            throw new ForbiddenException('Simulator devices are disabled');
          const id = randomUUID();
          await manager.query(
            `INSERT INTO pix_devices(device_id,tenant_id,hardware_profile_id,device_code,device_type,campus_reference,location_reference,gate_reference,certificate_fingerprint,public_key,firmware_version)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
              id,
              input.tenant_id,
              input.hardware_profile_id,
              input.device_code,
              profile.device_type,
              input.campus_reference ?? null,
              input.location_reference ?? null,
              input.gate_reference ?? null,
              fingerprint,
              input.public_key,
              input.firmware_version,
            ],
          );
          await this.audit(
            manager,
            input.tenant_id,
            'DEVICE',
            id,
            'DEVICE_MACHINE_REGISTERED',
            `device-bootstrap:${fingerprint}`,
            null,
            { device_code: input.device_code, status: 'PENDING' },
          );
          return {
            device_id: id,
            status: 'PENDING',
            attestation_status: 'PENDING',
          };
        },
      ),
    );
  }

  async requestJob(
    actor: PhysicalIdentityActor,
    inventoryRecordId: string,
    key: string,
    input: {
      job_type?: 'NEW' | 'RETROFIT' | 'REPLACEMENT';
      hardware_profile_id?: string;
    },
  ) {
    const jobType = input.job_type ?? 'NEW';
    await this.require(
      actor,
      jobType === 'RETROFIT'
        ? 'PHYSICAL_IDENTITY_RETROFIT'
        : 'PHYSICAL_IDENTITY_PROVISION',
    );
    const tenantId = this.tenant(actor);
    if (!(await this.enabled(tenantId, 'dofa_module_x_physical_identity')))
      throw new ConflictException('Module X is disabled for this tenant');
    if (
      jobType === 'RETROFIT' &&
      !(await this.enabled(tenantId, 'dofa_module_x_retrofit'))
    )
      throw new ConflictException('Module X retrofit is disabled');
    return this.db.transaction((manager) =>
      this.idempotent(
        manager,
        tenantId,
        actor.user_id,
        key,
        { inventoryRecordId, ...input },
        async () => {
          const scoped = (
            await manager.query(
              `SELECT r.inventory_record_id,r.owner_department_id FROM inv_records r WHERE r.inventory_record_id=$1 AND r.tenant_id=$2 AND EXISTS(SELECT 1 FROM acq_access_grants g WHERE g.tenant_id=r.tenant_id AND g.capability=$3 AND(g.principal_user_id=$4 OR lower(g.principal_role)=ANY($5::text[])) AND(g.scope_type='TENANT' OR(g.scope_type='DEPARTMENT' AND g.scope_reference=r.owner_department_id::text)))`,
              [
                inventoryRecordId,
                tenantId,
                jobType === 'RETROFIT'
                  ? 'PHYSICAL_IDENTITY_RETROFIT'
                  : 'PHYSICAL_IDENTITY_PROVISION',
                actor.user_id,
                this.roles(actor),
              ],
            )
          )[0];
          if (!scoped) throw new NotFoundException('Module 5 ITEM not found');
          const policyRows = await manager.query(
            `SELECT p.*,m.category,COALESCE((SELECT COALESCE(capitalized_cost,verified_invoice_cost,estimated_cost) FROM inv_financial_projections f WHERE f.inventory_record_id=$1 ORDER BY CASE f.status WHEN 'FINAL' THEN 0 WHEN 'PROVISIONAL' THEN 1 ELSE 2 END,f.source_revision DESC LIMIT 1),0)::numeric asset_value
             FROM inv_records r JOIN inv_product_models m ON m.product_model_id=r.product_model_id JOIN LATERAL(SELECT * FROM pix_policies p WHERE p.tenant_id=r.tenant_id AND p.status='PUBLISHED' AND p.effective_from<=NOW() AND(p.effective_to IS NULL OR p.effective_to>NOW()) AND(p.product_model_id=m.product_model_id OR p.product_model_id IS NULL) AND p.category IN(m.category,'*') ORDER BY CASE WHEN p.product_model_id=m.product_model_id THEN 0 WHEN p.category=m.category THEN 1 ELSE 2 END,p.policy_version DESC LIMIT 1) p ON true WHERE r.inventory_record_id=$1`,
            [inventoryRecordId],
          );
          const policy = policyRows[0];
          if (!policy)
            throw new ConflictException('Published Module X policy required');
          if (policy.excluded)
            throw new ConflictException(
              'Asset is excluded from physical provisioning',
            );
          if (jobType === 'RETROFIT' && !policy.retrofit_allowed)
            throw new ConflictException('Retrofit is not allowed by policy');
          const rfidRequired =
            policy.rfid_required === true ||
            Number(policy.asset_value) >= Number(policy.rfid_value_threshold);
          const identity =
            await this.inventory.ensurePhysicalProvisioningIdentityInTransaction(
              manager,
              inventoryRecordId,
              tenantId,
              actor.user_id,
              rfidRequired,
            );
          if (jobType === 'NEW' && identity.record_status === 'ACTIVE')
            throw new ConflictException('Active assets require a retrofit job');
          const allowed = Array.isArray(policy.allowed_hardware_profiles)
            ? policy.allowed_hardware_profiles.map(String)
            : [];
          const requestedProfile = input.hardware_profile_id ?? allowed[0];
          if (!requestedProfile || !allowed.includes(requestedProfile))
            throw new ConflictException(
              'Selected hardware profile is not allowed by policy',
            );
          const profile = (
            await manager.query(
              `SELECT * FROM pix_hardware_profiles WHERE hardware_profile_id=$1 AND status='ACTIVE' AND(tenant_id=$2 OR tenant_id IS NULL)`,
              [requestedProfile, tenantId],
            )
          )[0];
          if (!profile)
            throw new ConflictException('Hardware profile unavailable');
          if (
            profile.simulator_only &&
            this.config.get<string>('PHYSICAL_IDENTITY_ALLOW_SIMULATOR') !==
              'true'
          )
            throw new ForbiddenException(
              'Simulator provisioning is disabled outside explicit test environments',
            );
          const label = (
            await manager.query(
              `SELECT * FROM pix_label_templates WHERE tenant_id=$1 AND status='PUBLISHED' ORDER BY template_version DESC LIMIT 1`,
              [tenantId],
            )
          )[0];
          if (!label)
            throw new ConflictException('Published label template required');
          const generationRequestId = randomUUID(),
            jobId = randomUUID(),
            nonce = randomBytes(32).toString('base64url'),
            expiresAt = new Date(Date.now() + 15 * 60_000).toISOString(),
            { privateKey, keyVersion } = this.signing(),
            labelClaims = {
              type: 'FALCON_PHYSICAL_IDENTITY_LABEL_V1',
              tenant_id: tenantId,
              inventory_record_id: identity.inventory_record_id,
              inventory_revision: Number(identity.aggregate_revision),
              university_asset_id: identity.university_asset_id,
              generation_request_id: generationRequestId,
              signing_key_version: keyVersion,
            },
            labelToken = `${Buffer.from(physicalIdentityJson(labelClaims)).toString('base64url')}.${signPhysicalIdentity(labelClaims, privateKey)}`,
            qrVerificationUri = `/api/physical-identity/v1/public/scan/${encodeURIComponent(identity.university_asset_id)}?token=${encodeURIComponent(labelToken)}`,
            qrPayloadHash = physicalIdentityHash(
              Buffer.from(qrVerificationUri),
            ),
            payload = {
              generation_request_id: generationRequestId,
              tenant_id: tenantId,
              inventory_record_id: identity.inventory_record_id,
              inventory_revision: Number(identity.aggregate_revision),
              subject_id: identity.subject_id,
              verification_identity_id: identity.verification_identity_id,
              university_asset_id: identity.university_asset_id,
              logical_rfid_id: identity.logical_rfid?.logical_rfid_id ?? null,
              logical_rfid_code:
                identity.logical_rfid?.logical_rfid_code ?? null,
              policy_version: Number(policy.policy_version),
              label_template_version: Number(label.template_version),
              allowed_hardware_profile_id: requestedProfile,
              job_type: jobType,
              expires_at: expiresAt,
              nonce,
              qr_verification_uri: qrVerificationUri,
              code128_value: identity.university_asset_id,
            },
            payloadHash = physicalIdentityHash(payload),
            signature = signPhysicalIdentity(payload, privateKey);
          await manager.query(
            `INSERT INTO pix_provisioning_jobs(provisioning_job_id,generation_request_id,tenant_id,inventory_record_id,inventory_revision,subject_id,verification_identity_id,university_asset_id,logical_rfid_id,logical_rfid_code,policy_id,policy_version,label_template_id,label_template_version,allowed_hardware_profile_id,job_type,status,nonce_hash,authorization_payload,payload_hash,signing_key_version,signature,expires_at,qr_payload_hash,code128_value)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'AUTHORIZED',$17,$18::jsonb,$19,$20,$21,$22,$23,$24)`,
            [
              jobId,
              generationRequestId,
              tenantId,
              inventoryRecordId,
              Number(identity.aggregate_revision),
              identity.subject_id,
              identity.verification_identity_id,
              identity.university_asset_id,
              identity.logical_rfid?.logical_rfid_id ?? null,
              identity.logical_rfid?.logical_rfid_code ?? null,
              policy.policy_id,
              Number(policy.policy_version),
              label.label_template_id,
              Number(label.template_version),
              requestedProfile,
              jobType,
              physicalIdentityHash(nonce),
              JSON.stringify(payload),
              payloadHash,
              keyVersion,
              signature,
              expiresAt,
              qrPayloadHash,
              identity.university_asset_id,
            ],
          );
          const job = (
            await manager.query(
              `SELECT * FROM pix_provisioning_jobs WHERE provisioning_job_id=$1`,
              [jobId],
            )
          )[0];
          await this.emit(
            manager,
            job,
            'PhysicalIdentityProvisioningRequested.v1',
            {
              generation_request_id: generationRequestId,
              inventory_record_id: inventoryRecordId,
              job_type: jobType,
              expires_at: expiresAt,
            },
          );
          if (jobType === 'REPLACEMENT')
            await this.emit(
              manager,
              job,
              'PhysicalIdentifierReplacementRequested.v1',
              {
                inventory_record_id: inventoryRecordId,
                previous_binding_preserved: true,
              },
            );
          await this.audit(
            manager,
            tenantId,
            'PROVISIONING_JOB',
            jobId,
            'JOB_AUTHORIZED',
            actor.user_id,
            null,
            { generation_request_id: generationRequestId, job_type: jobType },
          );
          return {
            provisioning_job_id: jobId,
            generation_request_id: generationRequestId,
            status: 'AUTHORIZED',
            expires_at: expiresAt,
            aggregate_revision: job.aggregate_revision,
          };
        },
      ),
    );
  }

  private async deviceFromHeaders(
    headers: Record<string, string | undefined>,
    action: string,
    body: unknown,
    allowPending = false,
  ): Promise<DeviceContext & { public_key: string }> {
    const deviceId = headers['x-device-id'],
      fingerprint = headers['x-client-cert-fingerprint']?.toLowerCase(),
      signature = headers['x-device-signature'],
      sequence = Number(headers['x-device-sequence']);
    if (
      !deviceId ||
      !fingerprint ||
      !signature ||
      !Number.isSafeInteger(sequence) ||
      sequence < 1
    )
      throw new UnauthorizedException(
        'Complete device authentication headers required',
      );
    const rows = await this.db.query(
      `SELECT d.*,p.minimum_firmware,p.simulator_only FROM pix_devices d JOIN pix_hardware_profiles p ON p.hardware_profile_id=d.hardware_profile_id WHERE d.device_id=$1 AND d.certificate_fingerprint=$2`,
      [deviceId, fingerprint],
    );
    const device = rows[0];
    if (
      !device ||
      (!allowPending &&
        (device.status !== 'ACTIVE' ||
          device.attestation_status !== 'ATTESTED'))
    )
      throw new UnauthorizedException('Device is not active and attested');
    if (
      device.simulator_only &&
      this.config.get<string>('PHYSICAL_IDENTITY_ALLOW_SIMULATOR') !== 'true'
    )
      throw new UnauthorizedException('Simulator device is disabled');
    if (
      !device.simulator_only &&
      this.config.get<string>('PHYSICAL_IDENTITY_TRUST_MTLS_PROXY') !== 'true'
    )
      throw new UnauthorizedException(
        'Trusted mTLS proxy enforcement is unavailable',
      );
    const signed = {
      device_id: deviceId,
      sequence,
      action,
      payload_hash: physicalIdentityHash(body),
    };
    if (!verifyPhysicalIdentity(signed, signature, device.public_key))
      throw new UnauthorizedException('Invalid device signature');
    const latest = await this.db.query(
      `SELECT COALESCE(MAX(device_sequence),0)::bigint latest FROM pix_gate_observations WHERE device_id=$1`,
      [deviceId],
    );
    if (
      action === 'GATE_OBSERVATIONS' &&
      sequence <= Number(latest[0]?.latest ?? 0)
    )
      throw new ConflictException('Device sequence replay detected');
    return {
      device_id: device.device_id,
      tenant_id: device.tenant_id,
      device_code: device.device_code,
      device_type: device.device_type,
      hardware_profile_id: device.hardware_profile_id,
      gate_reference: device.gate_reference,
      sequence,
      public_key: device.public_key,
    };
  }

  async attestDevice(
    deviceId: string,
    headers: Record<string, string | undefined>,
    input: { firmware_version: string; attestation: Record<string, unknown> },
  ) {
    if (headers['x-device-id'] !== deviceId)
      throw new UnauthorizedException('Device identity mismatch');
    const device = await this.deviceFromHeaders(
      headers,
      'DEVICE_ATTEST',
      input,
      true,
    );
    return this.db.transaction(async (manager) => {
      const rows = await manager.query(
        `SELECT d.*,p.minimum_firmware FROM pix_devices d JOIN pix_hardware_profiles p ON p.hardware_profile_id=d.hardware_profile_id WHERE d.device_id=$1 AND d.tenant_id=$2 FOR UPDATE OF d`,
        [deviceId, device.tenant_id],
      );
      const row = rows[0];
      if (!row || row.status === 'REVOKED')
        throw new UnauthorizedException('Device registration is unavailable');
      if (
        row.minimum_firmware &&
        input.firmware_version.localeCompare(row.minimum_firmware, undefined, {
          numeric: true,
        }) < 0
      )
        throw new ConflictException(
          'Device firmware is below the approved minimum',
        );
      await manager.query(
        `UPDATE pix_devices SET firmware_version=$2,attestation_status='ATTESTED',status='ACTIVE',last_attested_at=NOW(),last_seen_at=NOW(),updated_at=NOW() WHERE device_id=$1`,
        [deviceId, input.firmware_version],
      );
      await this.audit(
        manager,
        row.tenant_id,
        'DEVICE',
        deviceId,
        'DEVICE_ATTESTED',
        `device:${deviceId}`,
        { status: row.status, attestation_status: row.attestation_status },
        { status: 'ACTIVE', attestation_status: 'ATTESTED' },
      );
      await this.emitDevice(
        manager,
        row,
        'PhysicalIdentityDeviceHealthChanged.v1',
        {
          status: 'ACTIVE',
          attestation_status: 'ATTESTED',
          firmware_version: input.firmware_version,
        },
      );
      return {
        device_id: deviceId,
        status: 'ACTIVE',
        attestation_status: 'ATTESTED',
      };
    });
  }

  async claimJob(
    id: string,
    headers: Record<string, string | undefined>,
    key: string,
  ) {
    const device = await this.deviceFromHeaders(headers, 'JOB_CLAIM', { id });
    if (
      !(await this.enabled(device.tenant_id, 'dofa_module_x_physical_identity'))
    )
      throw new ConflictException('Module X is disabled for this tenant');
    return this.db.transaction((manager) =>
      this.idempotent(
        manager,
        device.tenant_id,
        `device:${device.device_id}`,
        key,
        { id },
        async () => {
          const job = (
            await manager.query(
              `SELECT * FROM pix_provisioning_jobs WHERE provisioning_job_id=$1 AND tenant_id=$2 FOR UPDATE`,
              [id, device.tenant_id],
            )
          )[0];
          if (!job) throw new NotFoundException('Provisioning job not found');
          if (job.status !== 'AUTHORIZED')
            throw new ConflictException(
              `Job cannot be claimed from ${job.status}`,
            );
          if (new Date(job.expires_at).getTime() <= Date.now()) {
            await manager.query(
              `UPDATE pix_provisioning_jobs SET status='EXPIRED',updated_at=NOW() WHERE provisioning_job_id=$1`,
              [id],
            );
            throw new ConflictException('Provisioning job expired');
          }
          if (job.allowed_hardware_profile_id !== device.hardware_profile_id)
            throw new ForbiddenException(
              'Device hardware profile is not authorized for this job',
            );
          const claimedStatus = job.logical_rfid_id ? 'CLAIMED' : 'PRINTING';
          await manager.query(
            `UPDATE pix_provisioning_jobs SET status=$3,claimed_by_device_id=$2,claimed_at=NOW(),operator_id=(SELECT registered_by FROM pix_devices WHERE device_id=$2),updated_at=NOW() WHERE provisioning_job_id=$1`,
            [id, device.device_id, claimedStatus],
          );
          const updated = (
            await manager.query(
              `SELECT * FROM pix_provisioning_jobs WHERE provisioning_job_id=$1`,
              [id],
            )
          )[0];
          await manager.query(
            `INSERT INTO pix_job_attempts(tenant_id,provisioning_job_id,device_id,attempt_number,action,request_hash,status,actor_id) VALUES($1,$2,$3,1,'CLAIM',$4,'SUCCEEDED',$5)`,
            [
              job.tenant_id,
              id,
              device.device_id,
              physicalIdentityHash({ id }),
              updated.operator_id,
            ],
          );
          await this.emit(manager, updated, 'PhysicalIdentityJobClaimed.v1', {
            device_id: device.device_id,
            device_code: device.device_code,
          });
          return {
            provisioning_job_id: id,
            generation_request_id: job.generation_request_id,
            authorization_payload: job.authorization_payload,
            payload_hash: job.payload_hash,
            signature: job.signature,
            signing_key_version: job.signing_key_version,
            qr_payload_hash: job.qr_payload_hash,
            code128_value: job.code128_value,
            rfid_required: Boolean(job.logical_rfid_id),
            next_action: job.logical_rfid_id ? 'ENCODE' : 'PRINT',
            status: claimedStatus,
          };
        },
      ),
    );
  }

  async recordEncoding(
    id: string,
    headers: Record<string, string | undefined>,
    key: string,
    input: EncodingResultInput,
  ) {
    if (!/^[A-Fa-f0-9:_-]{4,240}$/.test(input.physical_tag_uid))
      throw new BadRequestException('Invalid physical RFID UID');
    if (!/^[a-f0-9]{64}$/i.test(input.encoded_payload_hash))
      throw new BadRequestException('Encoded payload SHA-256 required');
    const device = await this.deviceFromHeaders(headers, 'ENCODE_RESULT', {
      id,
      ...input,
    });
    if (
      !(await this.enabled(device.tenant_id, 'dofa_module_x_physical_identity'))
    )
      throw new ConflictException('Module X is disabled for this tenant');
    return this.db.transaction((manager) =>
      this.idempotent(
        manager,
        device.tenant_id,
        `device:${device.device_id}`,
        key,
        { id, ...input },
        async () => {
          const job = (
            await manager.query(
              `SELECT * FROM pix_provisioning_jobs WHERE provisioning_job_id=$1 AND tenant_id=$2 FOR UPDATE`,
              [id, device.tenant_id],
            )
          )[0];
          if (!job) throw new NotFoundException('Provisioning job not found');
          if (
            job.status !== 'CLAIMED' ||
            job.claimed_by_device_id !== device.device_id
          )
            throw new ConflictException('Job is not claimed by this device');
          const bindingId =
            await this.inventory.recordModuleXEncodingInTransaction(
              manager,
              job,
              device.device_id,
              job.operator_id,
              input,
            );
          await manager.query(
            `UPDATE pix_provisioning_jobs SET status='PRINTING',physical_tag_uid=$2,tag_technology=$3,encoded_payload_hash=$4,updated_at=NOW() WHERE provisioning_job_id=$1`,
            [
              id,
              input.physical_tag_uid.toUpperCase(),
              input.tag_technology,
              input.encoded_payload_hash.toLowerCase(),
            ],
          );
          const updated = (
            await manager.query(
              `SELECT * FROM pix_provisioning_jobs WHERE provisioning_job_id=$1`,
              [id],
            )
          )[0];
          await manager.query(
            `INSERT INTO pix_job_attempts(tenant_id,provisioning_job_id,device_id,attempt_number,action,request_hash,result_hash,status,hardware_response,actor_id)
             VALUES($1,$2,$3,(SELECT COALESCE(MAX(attempt_number),0)+1 FROM pix_job_attempts WHERE provisioning_job_id=$2),'ENCODE',$4,$5,'SUCCEEDED',$6::jsonb,$7)`,
            [
              job.tenant_id,
              id,
              device.device_id,
              physicalIdentityHash(input),
              input.encoded_payload_hash.toLowerCase(),
              JSON.stringify(input.hardware_response ?? {}),
              job.operator_id,
            ],
          );
          await this.emit(manager, updated, 'RFIDEncodingCompleted.v1', {
            rfid_binding_id: bindingId,
            physical_tag_uid: input.physical_tag_uid.toUpperCase(),
            encoded_payload_hash: input.encoded_payload_hash.toLowerCase(),
          });
          return {
            provisioning_job_id: id,
            rfid_binding_id: bindingId,
            status: 'PRINTING',
          };
        },
      ),
    );
  }

  async recordPrint(
    id: string,
    headers: Record<string, string | undefined>,
    key: string,
    input: PrintResultInput,
  ) {
    for (const value of [input.label_payload_hash, input.qr_payload_hash])
      if (!/^[a-f0-9]{64}$/i.test(value))
        throw new BadRequestException('Label and QR SHA-256 hashes required');
    const device = await this.deviceFromHeaders(headers, 'PRINT_RESULT', {
      id,
      ...input,
    });
    if (
      !(await this.enabled(device.tenant_id, 'dofa_module_x_physical_identity'))
    )
      throw new ConflictException('Module X is disabled for this tenant');
    return this.db.transaction((manager) =>
      this.idempotent(
        manager,
        device.tenant_id,
        `device:${device.device_id}`,
        key,
        { id, ...input },
        async () => {
          const job = (
            await manager.query(
              `SELECT * FROM pix_provisioning_jobs WHERE provisioning_job_id=$1 AND tenant_id=$2 FOR UPDATE`,
              [id, device.tenant_id],
            )
          )[0];
          if (
            !job ||
            job.status !== 'PRINTING' ||
            job.claimed_by_device_id !== device.device_id
          )
            throw new ConflictException(
              'Job is not ready for printing on this device',
            );
          if (input.qr_payload_hash.toLowerCase() !== job.qr_payload_hash)
            throw new ConflictException(
              'Printed QR does not match the server-authorized label payload',
            );
          await manager.query(
            `UPDATE pix_provisioning_jobs SET status='ATTACHMENT_PENDING',label_serial=$2,label_payload_hash=$3,updated_at=NOW() WHERE provisioning_job_id=$1`,
            [id, input.label_serial, input.label_payload_hash.toLowerCase()],
          );
          const updated = (
            await manager.query(
              `SELECT * FROM pix_provisioning_jobs WHERE provisioning_job_id=$1`,
              [id],
            )
          )[0];
          await this.emit(manager, updated, 'AssetLabelPrinted.v1', {
            label_serial: input.label_serial,
            university_asset_id: job.university_asset_id,
            qr_payload_hash: input.qr_payload_hash.toLowerCase(),
            code128_value: job.university_asset_id,
          });
          return { provisioning_job_id: id, status: 'ATTACHMENT_PENDING' };
        },
      ),
    );
  }

  async recordAttachment(
    id: string,
    headers: Record<string, string | undefined>,
    key: string,
    input: AttachmentResultInput,
  ) {
    if (!/^[a-f0-9]{64}$/i.test(input.evidence_manifest_hash))
      throw new BadRequestException(
        'Attachment evidence manifest hash required',
      );
    const device = await this.deviceFromHeaders(headers, 'ATTACHMENT_RESULT', {
      id,
      ...input,
    });
    if (
      !(await this.enabled(device.tenant_id, 'dofa_module_x_physical_identity'))
    )
      throw new ConflictException('Module X is disabled for this tenant');
    return this.db.transaction((manager) =>
      this.idempotent(
        manager,
        device.tenant_id,
        `device:${device.device_id}`,
        key,
        { id, ...input },
        async () => {
          const job = (
            await manager.query(
              `SELECT * FROM pix_provisioning_jobs WHERE provisioning_job_id=$1 AND tenant_id=$2 FOR UPDATE`,
              [id, device.tenant_id],
            )
          )[0];
          if (
            !job ||
            job.status !== 'ATTACHMENT_PENDING' ||
            job.claimed_by_device_id !== device.device_id
          )
            throw new ConflictException('Job is not ready for attachment');
          await manager.query(
            `UPDATE pix_provisioning_jobs SET status='VERIFICATION_PENDING',attachment_evidence_hash=$2,updated_at=NOW() WHERE provisioning_job_id=$1`,
            [id, input.evidence_manifest_hash.toLowerCase()],
          );
          const updated = (
            await manager.query(
              `SELECT * FROM pix_provisioning_jobs WHERE provisioning_job_id=$1`,
              [id],
            )
          )[0];
          await this.emit(manager, updated, 'PhysicalIdentifierAttached.v1', {
            evidence_manifest_hash: input.evidence_manifest_hash.toLowerCase(),
          });
          return { provisioning_job_id: id, status: 'VERIFICATION_PENDING' };
        },
      ),
    );
  }

  async verifyAttachment(
    actor: PhysicalIdentityActor,
    id: string,
    revision: number,
    key: string,
    input: VerifyAttachmentInput,
  ) {
    await this.require(actor, 'PHYSICAL_IDENTITY_ATTACH_VERIFY');
    return this.db.transaction((manager) =>
      this.idempotent(
        manager,
        this.tenant(actor),
        actor.user_id,
        key,
        { id, revision, ...input },
        async () => {
          const job = (
            await manager.query(
              `SELECT * FROM pix_provisioning_jobs WHERE provisioning_job_id=$1 AND tenant_id=$2 FOR UPDATE`,
              [id, this.tenant(actor)],
            )
          )[0];
          if (!job) throw new NotFoundException('Provisioning job not found');
          if (Number(job.aggregate_revision) !== revision)
            throw new ConflictException({
              message: 'Provisioning job changed',
              code: 'STALE_REVISION',
              current_revision: Number(job.aggregate_revision),
            });
          if (job.status !== 'VERIFICATION_PENDING')
            throw new ConflictException(
              'Job is not awaiting attachment verification',
            );
          if (job.operator_id === actor.user_id)
            throw new ForbiddenException(
              'Provisioning operator cannot verify the same attachment',
            );
          if (
            job.logical_rfid_id &&
            (!input.scanned_physical_tag_uid ||
              !input.scanned_rfid_payload_hash)
          )
            throw new BadRequestException(
              'RFID tag UID and encoded payload hash are required for this job',
            );
          const verificationId = randomUUID(),
            evidenceManifest = input.evidence_manifest ?? [],
            evidenceHash = physicalIdentityHash(evidenceManifest);
          await manager.query(
            `INSERT INTO pix_attachment_verifications(attachment_verification_id,tenant_id,provisioning_job_id,inventory_record_id,physical_tag_uid,scanned_asset_id,scanned_rfid_payload_hash,scanned_qr_payload_hash,evidence_manifest,evidence_manifest_hash,verifier_id,decision,decision_reason)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13)`,
            [
              verificationId,
              job.tenant_id,
              id,
              job.inventory_record_id,
              input.scanned_physical_tag_uid?.toUpperCase() ?? null,
              input.scanned_asset_id,
              input.scanned_rfid_payload_hash?.toLowerCase() ?? null,
              input.scanned_qr_payload_hash.toLowerCase(),
              JSON.stringify(evidenceManifest),
              evidenceHash,
              actor.user_id,
              input.decision,
              input.decision_reason ?? null,
            ],
          );
          if (input.decision === 'REJECTED') {
            await manager.query(
              `UPDATE pix_provisioning_jobs SET status='FAILED',verifier_id=$2,failure_code='ATTACHMENT_REJECTED',failure_detail=$3,updated_at=NOW() WHERE provisioning_job_id=$1`,
              [
                id,
                actor.user_id,
                input.decision_reason ?? 'Attachment rejected',
              ],
            );
            await manager.query(
              `UPDATE inv_rfid_bindings SET status='FAILED' WHERE module_x_provisioning_job_id=$1 AND status='ENCODED'`,
              [id],
            );
            const updated = (
              await manager.query(
                `SELECT * FROM pix_provisioning_jobs WHERE provisioning_job_id=$1`,
                [id],
              )
            )[0];
            await this.emit(
              manager,
              updated,
              'PhysicalIdentityProvisioningFailed.v1',
              { reason: input.decision_reason ?? 'Attachment rejected' },
            );
            return { provisioning_job_id: id, status: 'FAILED' };
          }
          await this.inventory.verifyModuleXAttachmentInTransaction(
            manager,
            job,
            actor.user_id,
            {
              attachment_verification_id: verificationId,
              scanned_asset_id: input.scanned_asset_id,
              scanned_physical_tag_uid: input.scanned_physical_tag_uid,
              scanned_rfid_payload_hash: input.scanned_rfid_payload_hash,
              scanned_qr_payload_hash: input.scanned_qr_payload_hash,
              evidence_manifest_hash: evidenceHash,
            },
          );
          await manager.query(
            `UPDATE pix_provisioning_jobs SET status='COMPLETED',verifier_id=$2,completed_at=NOW(),updated_at=NOW() WHERE provisioning_job_id=$1`,
            [id, actor.user_id],
          );
          const updated = (
            await manager.query(
              `SELECT * FROM pix_provisioning_jobs WHERE provisioning_job_id=$1`,
              [id],
            )
          )[0];
          const event = await this.emit(
            manager,
            updated,
            'PhysicalIdentifierVerified.v1',
            {
              attachment_verification_id: verificationId,
              inventory_record_id: job.inventory_record_id,
              inventory_revision: Number(job.inventory_revision),
              university_asset_id: job.university_asset_id,
              logical_rfid_id: job.logical_rfid_id,
              physical_tag_uid: job.physical_tag_uid,
              label_serial: job.label_serial,
              evidence_manifest_hash: evidenceHash,
            },
          );
          await this.audit(
            manager,
            job.tenant_id,
            'PROVISIONING_JOB',
            id,
            'ATTACHMENT_VERIFIED',
            actor.user_id,
            { status: 'VERIFICATION_PENDING' },
            { status: 'COMPLETED', attachment_verification_id: verificationId },
          );
          return { provisioning_job_id: id, status: 'COMPLETED', event };
        },
      ),
    );
  }

  async voidJob(
    actor: PhysicalIdentityActor,
    id: string,
    revision: number,
    key: string,
    input: { reason: string },
  ) {
    await this.require(actor, 'PHYSICAL_IDENTITY_RECONCILE');
    if (!input.reason?.trim())
      throw new BadRequestException('Void reason required');
    return this.db.transaction((manager) =>
      this.idempotent(
        manager,
        this.tenant(actor),
        actor.user_id,
        key,
        { id, revision, ...input },
        async () => {
          const job = (
            await manager.query(
              `SELECT * FROM pix_provisioning_jobs WHERE provisioning_job_id=$1 AND tenant_id=$2 FOR UPDATE`,
              [id, this.tenant(actor)],
            )
          )[0];
          if (!job) throw new NotFoundException('Provisioning job not found');
          if (Number(job.aggregate_revision) !== revision)
            throw new ConflictException('Provisioning job revision changed');
          if (job.status === 'COMPLETED')
            throw new ConflictException(
              'Completed provisioning cannot be voided',
            );
          if (job.operator_id === actor.user_id)
            throw new ForbiddenException(
              'Provisioning operator cannot solely reconcile their failed label',
            );
          await manager.query(
            `UPDATE pix_provisioning_jobs SET status='VOIDED',failure_code='VOIDED',failure_detail=$2,updated_at=NOW() WHERE provisioning_job_id=$1`,
            [id, input.reason.trim()],
          );
          await manager.query(
            `UPDATE inv_rfid_bindings SET status='FAILED' WHERE module_x_provisioning_job_id=$1 AND status='ENCODED'`,
            [id],
          );
          const updated = (
            await manager.query(
              `SELECT * FROM pix_provisioning_jobs WHERE provisioning_job_id=$1`,
              [id],
            )
          )[0];
          await this.emit(manager, updated, 'PhysicalIdentifierVoided.v1', {
            reason: input.reason.trim(),
            physical_tag_uid: job.physical_tag_uid,
            label_serial: job.label_serial,
          });
          return { provisioning_job_id: id, status: 'VOIDED' };
        },
      ),
    );
  }

  async gateObservations(actor: PhysicalIdentityActor) {
    await this.require(actor, 'GATE_ASSET_REVIEW');
    return this.db.query(
      `SELECT o.*,r.university_asset_id,m.product_name,a.gate_alert_id,a.status alert_status,a.severity
       FROM pix_gate_observations o LEFT JOIN inv_records r ON r.inventory_record_id=o.inventory_record_id LEFT JOIN inv_product_models m ON m.product_model_id=r.product_model_id LEFT JOIN pix_gate_alerts a ON a.gate_observation_id=o.gate_observation_id
       WHERE o.tenant_id=$1 ORDER BY o.server_received_at DESC LIMIT 300`,
      [this.tenant(actor)],
    );
  }
  async gateAlerts(actor: PhysicalIdentityActor) {
    await this.require(actor, 'GATE_ASSET_REVIEW');
    return this.db.query(
      `SELECT a.*,o.gate_reference,o.direction,o.physical_tag_uid,o.reason_code,r.university_asset_id,m.product_name FROM pix_gate_alerts a JOIN pix_gate_observations o ON o.gate_observation_id=a.gate_observation_id LEFT JOIN inv_records r ON r.inventory_record_id=a.inventory_record_id LEFT JOIN inv_product_models m ON m.product_model_id=r.product_model_id WHERE a.tenant_id=$1 ORDER BY CASE a.status WHEN 'OPEN' THEN 0 WHEN 'ACKNOWLEDGED' THEN 1 WHEN 'ESCALATED' THEN 2 ELSE 3 END,a.created_at DESC LIMIT 300`,
      [this.tenant(actor)],
    );
  }
  async resolveGateAlert(
    actor: PhysicalIdentityActor,
    alertId: string,
    key: string,
    input: {
      action: 'ACKNOWLEDGE' | 'ESCALATE' | 'RESOLVE';
      resolution?: string;
    },
  ) {
    await this.require(
      actor,
      input.action === 'ESCALATE' ? 'GATE_ASSET_ESCALATE' : 'GATE_ASSET_REVIEW',
    );
    return this.db.transaction((manager) =>
      this.idempotent(
        manager,
        this.tenant(actor),
        actor.user_id,
        key,
        { alertId, ...input },
        async () => {
          const alert = (
            await manager.query(
              `SELECT a.*,o.gate_observation_id FROM pix_gate_alerts a JOIN pix_gate_observations o ON o.gate_observation_id=a.gate_observation_id WHERE a.gate_alert_id=$1 AND a.tenant_id=$2 FOR UPDATE OF a`,
              [alertId, this.tenant(actor)],
            )
          )[0];
          if (!alert) throw new NotFoundException('Gate alert not found');
          const next =
            input.action === 'ACKNOWLEDGE'
              ? 'ACKNOWLEDGED'
              : input.action === 'ESCALATE'
                ? 'ESCALATED'
                : 'RESOLVED';
          if (next === 'RESOLVED' && !input.resolution?.trim())
            throw new BadRequestException('Resolution is required');
          await manager.query(
            `UPDATE pix_gate_alerts SET status=$2,acknowledged_by=CASE WHEN $2='ACKNOWLEDGED' THEN $3 ELSE acknowledged_by END,acknowledged_at=CASE WHEN $2='ACKNOWLEDGED' THEN NOW() ELSE acknowledged_at END,resolution=CASE WHEN $2='RESOLVED' THEN $4 ELSE resolution END,resolved_by=CASE WHEN $2='RESOLVED' THEN $3 ELSE resolved_by END,resolved_at=CASE WHEN $2='RESOLVED' THEN NOW() ELSE resolved_at END,updated_at=NOW() WHERE gate_alert_id=$1`,
            [alertId, next, actor.user_id, input.resolution ?? null],
          );
          const observation = (
            await manager.query(
              `SELECT * FROM pix_gate_observations WHERE gate_observation_id=$1`,
              [alert.gate_observation_id],
            )
          )[0];
          if (next === 'RESOLVED')
            await this.emitObservation(
              manager,
              observation,
              'GateMovementAlertResolved.v1',
              { gate_alert_id: alertId, resolution: input.resolution },
            );
          return { gate_alert_id: alertId, status: next };
        },
      ),
    );
  }

  async recordGateObservations(
    headers: Record<string, string | undefined>,
    key: string,
    inputs: GateObservationInput[],
  ) {
    if (!inputs.length || inputs.length > 500)
      throw new BadRequestException('One to 500 observations required');
    const device = await this.deviceFromHeaders(
      headers,
      'GATE_OBSERVATIONS',
      inputs.map((input) => {
        const value = { ...input } as Partial<GateObservationInput>;
        delete value.device_signature;
        return value;
      }),
    );
    if (
      !(await this.enabled(device.tenant_id, 'dofa_module_x_gate_observation'))
    )
      throw new ConflictException('Gate observation is disabled');
    if (
      ![
        'FIXED_GATE_READER',
        'HANDHELD_READER',
        'SMARTPHONE_NFC',
        'SIMULATOR',
      ].includes(device.device_type)
    )
      throw new ForbiddenException('Device is not approved for observations');
    return this.db.transaction((manager) =>
      this.idempotent(
        manager,
        device.tenant_id,
        `device:${device.device_id}`,
        key,
        inputs,
        async () => {
          const results: Array<Record<string, unknown>> = [];
          const lockedDevice = (
            await manager.query(
              `SELECT * FROM pix_devices WHERE device_id=$1 FOR UPDATE`,
              [device.device_id],
            )
          )[0];
          let previousSequence = Number(
            (
              await manager.query(
                `SELECT COALESCE(MAX(device_sequence),0)::bigint latest FROM pix_gate_observations WHERE device_id=$1`,
                [device.device_id],
              )
            )[0]?.latest ?? 0,
          );
          for (const input of [...inputs].sort(
            (a, b) => a.device_sequence - b.device_sequence,
          )) {
            if (input.device_sequence <= previousSequence)
              throw new ConflictException(
                'Gate observation sequence replay detected',
              );
            const unsigned = { ...input } as Record<string, unknown>;
            delete unsigned.device_signature;
            const signedObservation = { ...unsigned };
            delete unsigned.payload_hash;
            if (
              physicalIdentityHash(unsigned) !==
              input.payload_hash.toLowerCase()
            )
              throw new ConflictException(
                'Gate observation payload hash mismatch',
              );
            if (
              !verifyPhysicalIdentity(
                signedObservation,
                input.device_signature,
                lockedDevice.public_key,
              )
            )
              throw new UnauthorizedException('Invalid observation signature');
            if (
              lockedDevice.gate_reference &&
              lockedDevice.gate_reference !== input.gate_reference
            )
              throw new ForbiddenException(
                'Reader cannot submit for another gate',
              );
            const binding = (
              await manager.query(
                `SELECT b.*,l.inventory_record_id,l.logical_rfid_id,r.aggregate_revision,r.record_status,r.lifecycle_status
                 FROM inv_rfid_bindings b JOIN inv_logical_rfids l ON l.logical_rfid_id=b.logical_rfid_id JOIN inv_records r ON r.inventory_record_id=l.inventory_record_id
                 WHERE b.tenant_id=$1 AND upper(b.physical_tag_uid)=upper($2) AND b.status='ACTIVE' AND l.status='ACTIVE' LIMIT 1`,
                [device.tenant_id, input.physical_tag_uid],
              )
            )[0];
            if (input.camera_evidence_reference) {
              const cameraAllowed =
                binding &&
                Boolean(
                  (
                    await manager.query(
                      `SELECT 1 FROM inv_records r JOIN inv_product_models m ON m.product_model_id=r.product_model_id JOIN LATERAL(SELECT camera_evidence_enabled FROM pix_policies p WHERE p.tenant_id=r.tenant_id AND p.status='PUBLISHED' AND(p.product_model_id=m.product_model_id OR p.product_model_id IS NULL) AND p.category IN(m.category,'*') ORDER BY CASE WHEN p.product_model_id=m.product_model_id THEN 0 WHEN p.category=m.category THEN 1 ELSE 2 END,p.policy_version DESC LIMIT 1) p ON true WHERE r.inventory_record_id=$1 AND p.camera_evidence_enabled=true`,
                      [binding.inventory_record_id],
                    )
                  )[0],
                );
              if (!cameraAllowed)
                throw new ForbiddenException(
                  'Camera evidence is disabled by the applicable policy',
                );
            }
            let permit: any = null,
              result: 'AUTHORIZED_PASSAGE' | 'REVIEW_REQUIRED' =
                'REVIEW_REQUIRED',
              reason = binding
                ? 'NO_ACTIVE_MOVEMENT_PERMIT'
                : 'UNKNOWN_OR_INACTIVE_TAG';
            const cacheExpired =
              input.cache_expires_at &&
              new Date(input.cache_expires_at).getTime() <
                new Date(input.device_observed_at).getTime();
            if (binding && !cacheExpired) {
              permit = (
                await manager.query(
                  `SELECT p.* FROM pix_movement_permits p JOIN pix_movement_permit_assets a ON a.movement_permit_id=p.movement_permit_id
                   WHERE p.tenant_id=$1 AND a.inventory_record_id=$2 AND p.status='ACTIVE' AND p.valid_from<=$3 AND p.valid_until>=$3
                   AND p.direction IN($4,'BOTH') AND(a.inventory_revision=$5)
                   AND(jsonb_array_length(p.permitted_gates)=0 OR p.permitted_gates ? $6)
                   ORDER BY p.valid_until LIMIT 1`,
                  [
                    device.tenant_id,
                    binding.inventory_record_id,
                    input.device_observed_at,
                    input.direction,
                    Number(binding.aggregate_revision),
                    input.gate_reference,
                  ],
                )
              )[0];
              if (permit && binding.record_status === 'ACTIVE') {
                result = 'AUTHORIZED_PASSAGE';
                reason = 'ACTIVE_WORKFLOW_PERMIT';
              } else if (permit) reason = 'INVENTORY_IDENTITY_NOT_ACTIVE';
            } else if (cacheExpired) reason = 'OFFLINE_CACHE_EXPIRED';
            const retentionDays = Number(
              (
                await manager.query(
                  `SELECT routine_retention_days FROM pix_policies WHERE tenant_id=$1 AND status='PUBLISHED' AND effective_from<=NOW() AND(effective_to IS NULL OR effective_to>NOW()) ORDER BY policy_version DESC LIMIT 1`,
                  [device.tenant_id],
                )
              )[0]?.routine_retention_days ?? 180,
            );
            const observationId = randomUUID();
            await manager.query(
              `INSERT INTO pix_gate_observations(gate_observation_id,tenant_id,device_id,device_sequence,gate_reference,direction,physical_tag_uid,inventory_record_id,logical_rfid_id,inventory_revision,movement_permit_id,result,reason_code,device_observed_at,signal_metadata,cache_issued_at,cache_expires_at,payload_hash,device_signature,camera_evidence_reference,retention_until)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17,$18,$19,$20,NOW()+($21::text||' days')::interval)`,
              [
                observationId,
                device.tenant_id,
                device.device_id,
                input.device_sequence,
                input.gate_reference,
                input.direction,
                input.physical_tag_uid.toUpperCase(),
                binding?.inventory_record_id ?? null,
                binding?.logical_rfid_id ?? null,
                binding ? Number(binding.aggregate_revision) : null,
                permit?.movement_permit_id ?? null,
                result,
                reason,
                input.device_observed_at,
                JSON.stringify(input.signal_metadata ?? {}),
                input.cache_issued_at ?? null,
                input.cache_expires_at ?? null,
                input.payload_hash.toLowerCase(),
                input.device_signature,
                input.camera_evidence_reference ?? null,
                retentionDays,
              ],
            );
            const observation = (
              await manager.query(
                `SELECT * FROM pix_gate_observations WHERE gate_observation_id=$1`,
                [observationId],
              )
            )[0];
            await this.emitObservation(
              manager,
              observation,
              'GateAssetObserved.v1',
              {
                result,
                reason_code: reason,
                gate_reference: input.gate_reference,
              },
            );
            if (result === 'AUTHORIZED_PASSAGE') {
              await manager.query(
                `UPDATE pix_movement_permit_assets SET status='OBSERVED' WHERE movement_permit_id=$1 AND inventory_record_id=$2`,
                [permit.movement_permit_id, binding.inventory_record_id],
              );
              await this.emitObservation(
                manager,
                observation,
                'GateMovementAuthorized.v1',
                { movement_permit_id: permit.movement_permit_id },
              );
            } else {
              const alertId = randomUUID();
              await manager.query(
                `INSERT INTO pix_gate_alerts(gate_alert_id,tenant_id,gate_observation_id,inventory_record_id,alert_type,severity,retention_until)
                 VALUES($1,$2,$3,$4,$5,$6,NOW()+INTERVAL '2557 days')`,
                [
                  alertId,
                  device.tenant_id,
                  observationId,
                  binding?.inventory_record_id ?? null,
                  reason,
                  ['UNKNOWN_OR_INACTIVE_TAG', 'OFFLINE_CACHE_EXPIRED'].includes(
                    reason,
                  )
                    ? 'HIGH'
                    : 'REVIEW',
                ],
              );
              await this.emitObservation(
                manager,
                observation,
                'GateMovementReviewRequired.v1',
                { gate_alert_id: alertId, reason_code: reason },
              );
            }
            previousSequence = input.device_sequence;
            results.push({
              gate_observation_id: observationId,
              result,
              reason_code: reason,
            });
          }
          await manager.query(
            `UPDATE pix_devices SET last_seen_at=NOW(),updated_at=NOW() WHERE device_id=$1`,
            [device.device_id],
          );
          return { accepted: results.length, observations: results };
        },
      ),
    );
  }

  async gateCache(headers: Record<string, string | undefined>) {
    const device = await this.deviceFromHeaders(headers, 'GATE_CACHE', {});
    if (
      !(await this.enabled(device.tenant_id, 'dofa_module_x_gate_observation'))
    )
      throw new ConflictException('Gate observation is disabled');
    const issuedAt = new Date(),
      expiresAt = new Date(issuedAt.getTime() + 30 * 60_000),
      permits = await this.db.query(
        `SELECT p.movement_permit_id,p.direction,p.permitted_gates,p.valid_from,p.valid_until,a.inventory_record_id,a.inventory_revision,l.logical_rfid_code,b.physical_tag_uid
         FROM pix_movement_permits p JOIN pix_movement_permit_assets a ON a.movement_permit_id=p.movement_permit_id JOIN inv_logical_rfids l ON l.inventory_record_id=a.inventory_record_id LEFT JOIN inv_rfid_bindings b ON b.logical_rfid_id=l.logical_rfid_id AND b.status='ACTIVE'
         WHERE p.tenant_id=$1 AND p.status='ACTIVE' AND p.valid_until>=NOW() AND(jsonb_array_length(p.permitted_gates)=0 OR p.permitted_gates ? $2)`,
        [device.tenant_id, device.gate_reference ?? ''],
      ),
      identities = await this.db.query(
        `SELECT r.inventory_record_id,r.aggregate_revision,r.record_status,r.lifecycle_status,l.logical_rfid_code,b.physical_tag_uid FROM inv_records r JOIN inv_logical_rfids l ON l.inventory_record_id=r.inventory_record_id JOIN inv_rfid_bindings b ON b.logical_rfid_id=l.logical_rfid_id AND b.status='ACTIVE' WHERE r.tenant_id=$1 AND r.record_status='ACTIVE'`,
        [device.tenant_id],
      ),
      payload = {
        tenant_id: device.tenant_id,
        gate_reference: device.gate_reference,
        issued_at: issuedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        permits,
        identities,
      },
      { privateKey, keyVersion } = this.signing();
    return {
      ...payload,
      payload_hash: physicalIdentityHash(payload),
      signature: signPhysicalIdentity(payload, privateKey),
      signing_key_version: keyVersion,
    };
  }

  async publishPolicy(
    actor: PhysicalIdentityActor,
    key: string,
    input: {
      category?: string;
      product_model_id?: string;
      currency?: string;
      rfid_value_threshold?: number;
      rfid_required?: boolean;
      excluded?: boolean;
      allowed_hardware_profiles: string[];
      allowed_tag_technologies?: string[];
      attachment_methods?: string[];
      camera_evidence_enabled?: boolean;
      retrofit_allowed?: boolean;
    },
  ) {
    await this.require(actor, 'PHYSICAL_IDENTITY_POLICY_ADMIN');
    if (!input.allowed_hardware_profiles?.length)
      throw new BadRequestException(
        'At least one hardware profile is required',
      );
    if (
      input.rfid_value_threshold !== undefined &&
      input.rfid_value_threshold < 0
    )
      throw new BadRequestException('RFID value threshold cannot be negative');
    return this.db.transaction((manager) =>
      this.idempotent(
        manager,
        this.tenant(actor),
        actor.user_id,
        key,
        input,
        async () => {
          const profiles = await manager.query(
            `SELECT hardware_profile_id FROM pix_hardware_profiles WHERE hardware_profile_id=ANY($1::uuid[]) AND status='ACTIVE' AND(tenant_id=$2 OR tenant_id IS NULL)`,
            [input.allowed_hardware_profiles, this.tenant(actor)],
          );
          if (profiles.length !== new Set(input.allowed_hardware_profiles).size)
            throw new BadRequestException(
              'One or more hardware profiles are invalid',
            );
          const version = Number(
              (
                await manager.query(
                  `SELECT COALESCE(MAX(policy_version),0)+1 next FROM pix_policies WHERE tenant_id=$1`,
                  [this.tenant(actor)],
                )
              )[0].next,
            ),
            id = randomUUID();
          await manager.query(
            `INSERT INTO pix_policies(policy_id,tenant_id,policy_version,status,category,product_model_id,currency,rfid_value_threshold,rfid_required,excluded,allowed_hardware_profiles,allowed_tag_technologies,attachment_methods,camera_evidence_enabled,retrofit_allowed,published_by,published_at)
             VALUES($1,$2,$3,'PUBLISHED',$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14,$15,NOW())`,
            [
              id,
              this.tenant(actor),
              version,
              input.category ?? '*',
              input.product_model_id ?? null,
              (input.currency ?? 'INR').toUpperCase(),
              input.rfid_value_threshold ?? 500,
              input.rfid_required ?? null,
              Boolean(input.excluded),
              JSON.stringify(input.allowed_hardware_profiles),
              JSON.stringify(
                input.allowed_tag_technologies ?? ['NFC_HF', 'UHF'],
              ),
              JSON.stringify(input.attachment_methods ?? []),
              Boolean(input.camera_evidence_enabled),
              input.retrofit_allowed ?? true,
              actor.user_id,
            ],
          );
          return {
            policy_id: id,
            policy_version: version,
            status: 'PUBLISHED',
          };
        },
      ),
    );
  }

  async consumeMovementEvent(
    sourceTable:
      | 'inv_outbox_events'
      | 'ret_outbox_events'
      | 'svc_outbox_events'
      | 'retirement_outbox_events',
    eventId: string,
  ) {
    const allowed = new Set([
      'inv_outbox_events',
      'ret_outbox_events',
      'svc_outbox_events',
      'retirement_outbox_events',
    ]);
    if (!allowed.has(sourceTable))
      throw new BadRequestException('Invalid event source');
    return this.db.transaction(async (manager) => {
      const event = (
        await manager.query(
          `SELECT * FROM ${sourceTable} WHERE event_id=$1 FOR UPDATE`,
          [eventId],
        )
      )[0];
      if (!event)
        throw new NotFoundException('Movement source event not found');
      const prior = await manager.query(
        `SELECT 1 FROM pix_consumed_events WHERE event_id=$1`,
        [eventId],
      );
      if (prior[0]) return { duplicate: true };
      const envelope = event.payload ?? {},
        payload = envelope.payload ?? envelope,
        ids = [
          ...(Array.isArray(payload.inventory_record_ids)
            ? payload.inventory_record_ids
            : []),
          ...(payload.inventory_record_id ? [payload.inventory_record_id] : []),
          ...(envelope.inventory_record_id
            ? [envelope.inventory_record_id]
            : []),
          ...(Array.isArray(payload.subject_allocations)
            ? payload.subject_allocations
                .map((item: any) => item.inventory_record_id)
                .filter(Boolean)
            : []),
        ].filter(Boolean);
      if (!ids.length && sourceTable === 'svc_outbox_events') {
        const serviceCase = await manager.query(
          `SELECT inventory_record_id FROM svc_cases WHERE service_case_id=$1`,
          [event.aggregate_id],
        );
        if (serviceCase[0]?.inventory_record_id)
          ids.push(serviceCase[0].inventory_record_id);
      }
      if (!ids.length) {
        await manager.query(
          `INSERT INTO pix_consumed_events(event_id,event_type,tenant_id,source_payload_hash) VALUES($1,$2,$3,$4)`,
          [eventId, event.event_type, event.tenant_id, event.payload_hash],
        );
        return { ignored: true };
      }
      const sourceModule =
        sourceTable === 'inv_outbox_events'
          ? 'MODULE5'
          : sourceTable === 'ret_outbox_events'
            ? 'MODULE7'
            : sourceTable === 'svc_outbox_events'
              ? 'MODULE8'
              : 'MODULE9';
      const permitId = randomUUID(),
        validFrom =
          payload.valid_from ?? event.occurred_at ?? new Date().toISOString(),
        validUntil =
          payload.valid_until ??
          new Date(
            new Date(validFrom).getTime() + 24 * 60 * 60_000,
          ).toISOString(),
        direction =
          payload.direction === 'ENTRY'
            ? 'ENTRY'
            : payload.direction === 'BOTH'
              ? 'BOTH'
              : 'EXIT',
        permitPayload = {
          source_event_id: eventId,
          source_module: sourceModule,
          source_type: event.event_type,
          source_id: event.aggregate_id,
          inventory_record_ids: ids,
          direction,
          valid_from: validFrom,
          valid_until: validUntil,
          permitted_gates: payload.permitted_gates ?? [],
        },
        { privateKey, keyVersion } = this.signing();
      await manager.query(
        `INSERT INTO pix_movement_permits(movement_permit_id,tenant_id,source_module,source_type,source_id,source_revision,status,permitted_gates,direction,destination,responsible_party_id,provider_reference,valid_from,valid_until,payload,payload_hash,signature,signing_key_version)
         VALUES($1,$2,$3,$4,$5,$6,'ACTIVE',$7::jsonb,$8,$9::jsonb,$10,$11,$12,$13,$14::jsonb,$15,$16,$17)
         ON CONFLICT(tenant_id,source_module,source_type,source_id,source_revision) DO NOTHING`,
        [
          permitId,
          event.tenant_id,
          sourceModule,
          event.event_type,
          event.aggregate_id,
          Number(event.aggregate_revision ?? 1),
          JSON.stringify(payload.permitted_gates ?? []),
          direction,
          JSON.stringify(payload.destination ?? null),
          payload.responsible_party_id ?? null,
          payload.provider_reference ?? null,
          validFrom,
          validUntil,
          JSON.stringify(permitPayload),
          physicalIdentityHash(permitPayload),
          signPhysicalIdentity(permitPayload, privateKey),
          keyVersion,
        ],
      );
      const records = await manager.query(
        `SELECT r.inventory_record_id,r.aggregate_revision,l.logical_rfid_id FROM inv_records r LEFT JOIN inv_logical_rfids l ON l.inventory_record_id=r.inventory_record_id WHERE r.tenant_id=$1 AND r.inventory_record_id=ANY($2::uuid[])`,
        [event.tenant_id, ids],
      );
      for (const record of records)
        await manager.query(
          `INSERT INTO pix_movement_permit_assets(movement_permit_id,inventory_record_id,inventory_revision,logical_rfid_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
          [
            permitId,
            record.inventory_record_id,
            Number(record.aggregate_revision),
            record.logical_rfid_id,
          ],
        );
      await manager.query(
        `INSERT INTO pix_consumed_events(event_id,event_type,tenant_id,source_payload_hash) VALUES($1,$2,$3,$4)`,
        [eventId, event.event_type, event.tenant_id, event.payload_hash],
      );
      return { movement_permit_id: permitId, assets: records.length };
    });
  }

  @Interval(60_000)
  async expireProvisioningJobs() {
    const rows = await this.db.query(
      `UPDATE pix_provisioning_jobs SET status='EXPIRED',failure_code='AUTHORIZATION_EXPIRED',updated_at=NOW()
       WHERE status IN('AUTHORIZED','CLAIMED') AND expires_at<=NOW() RETURNING provisioning_job_id`,
    );
    for (const row of rows)
      await this.db.query(
        `UPDATE inv_rfid_bindings SET status='FAILED' WHERE module_x_provisioning_job_id=$1 AND status='ENCODED'`,
        [row.provisioning_job_id],
      );
  }

  @Interval(60_000)
  async expireMovementPermits() {
    await this.db.query(
      `UPDATE pix_movement_permits SET status='EXPIRED' WHERE status='ACTIVE' AND valid_until<NOW()`,
    );
  }
}
