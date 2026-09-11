import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import {
  MODULE_CATALOGUE,
  MODULE_KEYS,
  type BusinessModuleKey,
  type ModuleState,
} from './module-catalog';

export type RuntimeScope = {
  tenantId: string;
  userId?: string;
  campusIds?: Array<string | number>;
  departmentId?: string | number | null;
};

type StateRow = {
  state: ModuleState;
  scope_type: 'GLOBAL' | 'TENANT' | 'CAMPUS' | 'DEPARTMENT';
  scope_id: string | null;
  revision: number;
  updated_at: Date;
};

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function hash(value: unknown): string {
  return createHash('sha256').update(stable(value)).digest('hex');
}

@Injectable()
export class ModuleControlService {
  constructor(private readonly dataSource: DataSource) {}

  catalogue() {
    return MODULE_CATALOGUE;
  }

  private assertModuleKey(value: string): asserts value is BusinessModuleKey {
    if (!(MODULE_KEYS as readonly string[]).includes(value)) {
      throw new NotFoundException({
        code: 'MODULE_UNKNOWN',
        module_key: value,
      });
    }
  }

  async effectiveState(moduleKey: BusinessModuleKey, scope: RuntimeScope) {
    try {
      let campusIds = scope.campusIds ?? [];
      if (!campusIds.length && scope.userId) {
        const campuses = await this.dataSource.query<
          Array<{ campus_id: number }>
        >(
          `SELECT DISTINCT s.campus_id FROM users u JOIN departments d ON d.dept_id=u.dept_id JOIN schools s ON s.school_id=d.school_id WHERE u.user_id=$1 AND u.tenant_id=$2 AND s.campus_id IS NOT NULL`,
          [scope.userId, scope.tenantId],
        );
        campusIds = campuses.map((row) => row.campus_id);
      }
      const rows = await this.dataSource.query<StateRow[]>(
        `SELECT state, scope_type, scope_id, revision, updated_at
           FROM platform_module_states
          WHERE module_key = $1
            AND ((scope_type = 'GLOBAL' AND tenant_id IS NULL)
              OR (scope_type = 'TENANT' AND tenant_id = $2)
              OR (scope_type = 'CAMPUS' AND tenant_id = $2 AND scope_id = ANY($3::text[]))
              OR (scope_type = 'DEPARTMENT' AND tenant_id = $2 AND scope_id = $4))
          ORDER BY CASE scope_type WHEN 'GLOBAL' THEN 1 WHEN 'TENANT' THEN 2 WHEN 'CAMPUS' THEN 3 ELSE 4 END`,
        [
          moduleKey,
          scope.tenantId,
          campusIds.map(String),
          scope.departmentId == null ? null : String(scope.departmentId),
        ],
      );

      const globalPause = rows.find(
        (row) => row.scope_type === 'GLOBAL' && row.state === 'PAUSED',
      );
      const selected = globalPause ?? rows.at(-1);
      const available =
        selected?.state === 'ACTIVE' ||
        (selected?.state === 'PILOT' &&
          ['CAMPUS', 'DEPARTMENT'].includes(selected.scope_type));
      return {
        moduleKey,
        state: selected?.state ?? 'OFF',
        available,
        revision: selected?.revision ?? 0,
        sourceScope: selected?.scope_type ?? 'DEFAULT',
        updatedAt: selected?.updated_at ?? null,
      };
    } catch (error) {
      // Expand-first compatibility: deployments keep working while the control-plane
      // migration is being applied. Readiness exposes this degraded state.
      if ((error as { code?: string }).code === '42P01') {
        return {
          moduleKey,
          state: 'ACTIVE' as const,
          available: true,
          revision: 0,
          sourceScope: 'MIGRATION_FALLBACK',
          updatedAt: null,
        };
      }
      throw error;
    }
  }

  async runtimeManifest(scope: RuntimeScope) {
    const modules = await Promise.all(
      MODULE_KEYS.map((key) => this.effectiveState(key, scope)),
    );
    const revision = hash(
      modules.map(
        ({ moduleKey, state, available, revision: itemRevision }) => ({
          moduleKey,
          state,
          available,
          revision: itemRevision,
        }),
      ),
    );
    return {
      revision,
      generatedAt: new Date().toISOString(),
      cacheSeconds: 30,
      modules: modules.map((module) => ({
        ...module,
        displayName:
          MODULE_CATALOGUE.find((definition) => definition.moduleKey === module.moduleKey)
            ?.displayName ?? module.moduleKey,
      })),
    };
  }

  async isAvailable(
    moduleKey: BusinessModuleKey,
    tenantId: string,
    campusIds?: Array<string | number>,
    departmentId?: string | number | null,
  ) {
    return (
      await this.effectiveState(moduleKey, {
        tenantId,
        campusIds,
        departmentId,
      })
    ).available;
  }

  async readiness(moduleKeyValue: string, scope: RuntimeScope) {
    this.assertModuleKey(moduleKeyValue);
    const current = await this.effectiveState(moduleKeyValue, scope);
    const definition = MODULE_CATALOGUE.find(
      (item) => item.moduleKey === moduleKeyValue,
    )!;
    const dependencyStates = await Promise.all(
      definition.dependencyEdges
        .filter((edge) => edge.kind === 'REQUIRED_AT_ENTRY')
        .map(async (edge) => ({
          ...edge,
          ...(await this.effectiveState(edge.moduleKey, scope)),
        })),
    );
    const schema = await this.hasControlSchema();
    const checks = {
      schema,
      dependencies: dependencyStates.every((item) =>
        ['ACTIVE', 'PILOT'].includes(item.state),
      ),
      permissions: definition.businessOwnerRoles.length > 0,
      rollbackReady: true,
    };
    return {
      moduleKey: moduleKeyValue,
      current,
      checks,
      dependencyStates,
      ready: Object.values(checks).every(Boolean),
    };
  }

  private async hasControlSchema(): Promise<boolean> {
    const [row] = await this.dataSource.query<Array<{ present: boolean }>>(
      `SELECT to_regclass('public.platform_module_states') IS NOT NULL AS present`,
    );
    return Boolean(row?.present);
  }

  async createRollout(input: {
    moduleKey: string;
    tenantId: string;
    scopeType: string;
    scopeId?: string | null;
    desiredState: ModuleState;
    proposerId: string;
    reason: string;
    scheduledAt?: string | null;
    idempotencyKey: string;
  }) {
    this.assertModuleKey(input.moduleKey);
    const id = randomUUID();
    const snapshot = await this.readiness(input.moduleKey, {
      tenantId: input.tenantId,
    });
    const requestHash = hash({
      moduleKey: input.moduleKey,
      scopeType: input.scopeType,
      scopeId: input.scopeId ?? null,
      desiredState: input.desiredState,
      reason: input.reason,
      scheduledAt: input.scheduledAt ?? null,
    });
    const result = await this.dataSource.query(
      `INSERT INTO platform_module_rollouts
       (rollout_id,module_key,tenant_id,scope_type,scope_id,desired_state,status,proposer_id,reason,readiness_snapshot,scheduled_at,create_idempotency_key,request_hash)
       VALUES ($1,$2,$3,$4,$5,$6,'DRAFT',$7,$8,$9,$10,$11,$12)
       ON CONFLICT(tenant_id,proposer_id,create_idempotency_key) DO UPDATE SET updated_at=NOW()
       WHERE platform_module_rollouts.request_hash=EXCLUDED.request_hash RETURNING rollout_id`,
      [
        id,
        input.moduleKey,
        input.tenantId,
        input.scopeType,
        input.scopeId ?? null,
        input.desiredState,
        input.proposerId,
        input.reason,
        JSON.stringify(snapshot),
        input.scheduledAt ?? null,
        input.idempotencyKey,
        requestHash,
      ],
    );
    if (!result[0])
      throw new ConflictException({ code: 'IDEMPOTENCY_PAYLOAD_CHANGED' });
    return this.getRollout(result[0].rollout_id, input.tenantId);
  }

  async submitRollout(
    id: string,
    tenantId: string,
    actorId: string,
    expectedRevision: number,
    idempotencyKey: string,
  ) {
    const existing = await this.getRollout(id, tenantId);
    if (
      existing.submit_idempotency_key === idempotencyKey &&
      ['SUBMITTED', 'APPLIED'].includes(existing.status)
    )
      return existing;
    return this.transitionRollout(
      id,
      tenantId,
      actorId,
      expectedRevision,
      'DRAFT',
      'SUBMITTED',
      'submit_idempotency_key',
      idempotencyKey,
    );
  }

  async approveRollout(
    id: string,
    tenantId: string,
    actorId: string,
    expectedRevision: number,
    roles: string[],
    idempotencyKey: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const [rollout] = await manager.query<any[]>(
        `SELECT * FROM platform_module_rollouts WHERE rollout_id=$1 AND tenant_id=$2 FOR UPDATE`,
        [id, tenantId],
      );
      if (!rollout) throw new NotFoundException('Module rollout not found');
      if (
        rollout.approve_idempotency_key === idempotencyKey &&
        rollout.status === 'APPLIED'
      )
        return rollout;
      if (
        rollout.revision !== expectedRevision ||
        rollout.status !== 'SUBMITTED'
      )
        throw new ConflictException({ code: 'STALE_MODULE_CONFIGURATION' });
      if (rollout.proposer_id === actorId)
        throw new ConflictException({ code: 'MAKER_CHECKER_VIOLATION' });
      const definition = MODULE_CATALOGUE.find(
        (item) => item.moduleKey === rollout.module_key,
      )!;
      if (
        !roles.some(
          (role) =>
            definition.businessOwnerRoles.includes(role) ||
            role === 'SuperAdmin',
        )
      ) {
        throw new ForbiddenException({
          code: 'MODULE_OWNER_APPROVAL_REQUIRED',
        });
      }
      const readiness = await this.readiness(rollout.module_key, { tenantId });
      if (
        !readiness.ready &&
        ['ACTIVE', 'PILOT'].includes(rollout.desired_state)
      ) {
        throw new ConflictException({ code: 'MODULE_NOT_READY', readiness });
      }
      await manager.query(
        `UPDATE platform_module_rollouts SET status='APPROVED',approver_id=$2,approve_idempotency_key=$3,approved_at=NOW(),revision=revision+1,updated_at=NOW() WHERE rollout_id=$1`,
        [id, actorId, idempotencyKey],
      );
      await this.applyState(manager, rollout, actorId);
      await manager.query(
        `UPDATE platform_module_rollouts SET status='APPLIED',updated_at=NOW() WHERE rollout_id=$1`,
        [id],
      );
      return this.getRollout(id, tenantId, manager);
    });
  }

  private async transitionRollout(
    id: string,
    tenantId: string,
    actorId: string,
    revision: number,
    from: string,
    to: string,
    idempotencyColumn: 'submit_idempotency_key',
    idempotencyKey: string,
  ) {
    const result = await this.dataSource.query(
      `UPDATE platform_module_rollouts SET status=$5,submit_idempotency_key=$7,submitted_at=CASE WHEN $5='SUBMITTED' THEN NOW() ELSE submitted_at END,revision=revision+1,updated_at=NOW()
        WHERE rollout_id=$1 AND tenant_id=$2 AND proposer_id=$3 AND revision=$4 AND status=$6 RETURNING *`,
      [id, tenantId, actorId, revision, to, from, idempotencyKey],
    );
    if (!result[0])
      throw new ConflictException({ code: 'STALE_MODULE_CONFIGURATION' });
    return result[0];
  }

  private async applyState(
    manager: { query: Function },
    rollout: any,
    actorId: string,
  ) {
    const scopeId = ['TENANT', 'GLOBAL'].includes(rollout.scope_type)
      ? null
      : rollout.scope_id;
    const stateTenantId =
      rollout.scope_type === 'GLOBAL' ? null : rollout.tenant_id;
    const [previous] = await manager.query(
      `SELECT * FROM platform_module_states WHERE module_key=$1 AND tenant_id IS NOT DISTINCT FROM $2 AND scope_type=$3 AND scope_id IS NOT DISTINCT FROM $4 FOR UPDATE`,
      [rollout.module_key, stateTenantId, rollout.scope_type, scopeId],
    );
    const nextRevision = (previous?.revision ?? 0) + 1;
    await manager.query(
      `INSERT INTO platform_module_states(module_key,tenant_id,scope_type,scope_id,state,revision,changed_by,reason)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (module_key,tenant_id,scope_type,scope_id) DO UPDATE
       SET state=EXCLUDED.state,revision=EXCLUDED.revision,changed_by=EXCLUDED.changed_by,reason=EXCLUDED.reason,updated_at=NOW()`,
      [
        rollout.module_key,
        stateTenantId,
        rollout.scope_type,
        scopeId,
        rollout.desired_state,
        nextRevision,
        actorId,
        rollout.reason,
      ],
    );
    await manager.query(
      `INSERT INTO platform_module_activation_audit(module_key,tenant_id,scope_type,scope_id,previous_state,new_state,revision,actor_id,rollout_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        rollout.module_key,
        rollout.tenant_id,
        rollout.scope_type,
        scopeId,
        previous?.state ?? 'OFF',
        rollout.desired_state,
        nextRevision,
        actorId,
        rollout.rollout_id,
        rollout.reason,
      ],
    );
  }

  async getRollout(
    id: string,
    tenantId: string,
    executor: { query: Function } = this.dataSource,
  ) {
    const [row] = await executor.query(
      `SELECT * FROM platform_module_rollouts WHERE rollout_id=$1 AND tenant_id=$2`,
      [id, tenantId],
    );
    if (!row) throw new NotFoundException('Module rollout not found');
    return row;
  }

  async listRollouts(tenantId: string) {
    return this.dataSource.query(
      `SELECT * FROM platform_module_rollouts WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 200`,
      [tenantId],
    );
  }

  async emergencyPause(input: {
    moduleKey: string;
    tenantId: string;
    actorId: string;
    reason: string;
    incidentReference: string;
    global?: boolean;
  }) {
    this.assertModuleKey(input.moduleKey);
    if (!input.reason?.trim() || !input.incidentReference?.trim())
      throw new ConflictException({
        code: 'EMERGENCY_REASON_AND_INCIDENT_REQUIRED',
      });
    return this.dataSource.transaction(async (manager) => {
      const scopeType = input.global ? 'GLOBAL' : 'TENANT';
      const stateTenantId = input.global ? null : input.tenantId;
      const [previous] = await manager.query(
        `SELECT * FROM platform_module_states WHERE module_key=$1 AND tenant_id IS NOT DISTINCT FROM $2 AND scope_type=$3 AND scope_id IS NULL FOR UPDATE`,
        [input.moduleKey, stateTenantId, scopeType],
      );
      const revision = (previous?.revision ?? 0) + 1;
      await manager.query(
        `INSERT INTO platform_module_states(module_key,tenant_id,scope_type,scope_id,state,revision,changed_by,reason) VALUES($1,$2,$3,NULL,'PAUSED',$4,$5,$6) ON CONFLICT(module_key,tenant_id,scope_type,scope_id) DO UPDATE SET state='PAUSED',revision=$4,changed_by=$5,reason=$6,updated_at=NOW()`,
        [
          input.moduleKey,
          stateTenantId,
          scopeType,
          revision,
          input.actorId,
          input.reason,
        ],
      );
      const [incident] = await manager.query(
        `INSERT INTO platform_module_health_incidents(module_key,tenant_id,status,severity,summary,details,opened_by) VALUES($1,$2,'OPEN','CRITICAL',$3,$4::jsonb,$5) RETURNING *`,
        [
          input.moduleKey,
          stateTenantId,
          input.reason,
          JSON.stringify({ incident_reference: input.incidentReference }),
          input.actorId,
        ],
      );
      await manager.query(
        `INSERT INTO platform_module_activation_audit(module_key,tenant_id,scope_type,previous_state,new_state,revision,actor_id,reason) VALUES($1,$2,$3,$4,'PAUSED',$5,$6,$7)`,
        [
          input.moduleKey,
          stateTenantId,
          scopeType,
          previous?.state ?? 'OFF',
          revision,
          input.actorId,
          `${input.reason} [${input.incidentReference}]`,
        ],
      );
      return {
        moduleKey: input.moduleKey,
        state: 'PAUSED',
        revision,
        incident,
      };
    });
  }

  async listHandoffs(tenantId: string, status?: string) {
    return this.dataSource.query(
      `SELECT * FROM platform_module_handoffs WHERE tenant_id=$1 AND ($2::text IS NULL OR status=$2) ORDER BY created_at DESC LIMIT 500`,
      [tenantId, status ?? null],
    );
  }

  async enqueueHandoff(input: {
    tenantId: string;
    sourceModule: BusinessModuleKey;
    targetModule: BusinessModuleKey;
    operationType: string;
    sourceAggregateId: string;
    sourceRevision: number;
    idempotencyKey: string;
    payload: unknown;
  }) {
    const payloadHash = hash(input.payload);
    const result = await this.dataSource.query(
      `INSERT INTO platform_module_handoffs(handoff_id,tenant_id,source_module,target_module,operation_type,source_aggregate_id,source_revision,idempotency_key,payload,payload_hash,status)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'PENDING')
       ON CONFLICT(tenant_id,source_module,target_module,idempotency_key) DO UPDATE SET updated_at=NOW()
       WHERE platform_module_handoffs.payload_hash=EXCLUDED.payload_hash RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.sourceModule,
        input.targetModule,
        input.operationType,
        input.sourceAggregateId,
        input.sourceRevision,
        input.idempotencyKey,
        JSON.stringify(input.payload),
        payloadHash,
      ],
    );
    if (!result[0])
      throw new ConflictException({ code: 'IDEMPOTENCY_PAYLOAD_CHANGED' });
    return result[0];
  }

  async retryHandoff(id: string, tenantId: string) {
    const result = await this.dataSource.query(
      `UPDATE platform_module_handoffs SET status='PENDING',next_attempt_at=NOW(),retry_count=retry_count+1,updated_at=NOW() WHERE handoff_id=$1 AND tenant_id=$2 AND status IN ('FAILED','REJECTED','PENDING') RETURNING *`,
      [id, tenantId],
    );
    if (!result[0])
      throw new ConflictException({ code: 'HANDOFF_NOT_RETRYABLE' });
    return result[0];
  }

  async pendingHandoffs(limit = 50) {
    return this.dataSource.query(
      `SELECT * FROM platform_module_handoffs WHERE status='PENDING' AND next_attempt_at<=NOW() ORDER BY created_at LIMIT $1`,
      [limit],
    );
  }

  async claimHandoff(id: string) {
    const result = await this.dataSource.query(
      `UPDATE platform_module_handoffs SET status='PROCESSING',updated_at=NOW() WHERE handoff_id=$1 AND status='PENDING' RETURNING *`,
      [id],
    );
    return result[0];
  }

  async completeHandoff(id: string) {
    await this.dataSource.query(
      `UPDATE platform_module_handoffs SET status='COMPLETED',completed_at=NOW(),updated_at=NOW() WHERE handoff_id=$1 AND status='PROCESSING'`,
      [id],
    );
  }

  async failHandoff(id: string, error: unknown) {
    await this.dataSource.query(
      `UPDATE platform_module_handoffs SET status='PENDING',retry_count=retry_count+1,last_error=$2::jsonb,next_attempt_at=NOW()+LEAST(INTERVAL '1 hour',INTERVAL '30 seconds'*POWER(2,LEAST(retry_count,7))),updated_at=NOW() WHERE handoff_id=$1`,
      [
        id,
        JSON.stringify({
          message: error instanceof Error ? error.message : String(error),
          at: new Date().toISOString(),
        }),
      ],
    );
  }
}
