import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { createHash } from 'crypto';
import {
  apiStarterTemplate,
  apiText,
  apiYear,
  calculateApiSheet,
  designationKey,
  validateApiSheet,
} from './hr-api-policy.engine';

export type ApiPolicyScope = {
  tenantId: string;
  entityId: number;
  actorId: string;
};
type Policy = {
  policy_id: string;
  designation: string;
  designation_key: string;
  assessment_year: number;
  title: string;
  sheet: unknown;
  version: number;
  revision: number;
  status: string;
  request_hash: string;
};
const canonical = (value: unknown): unknown =>
  value instanceof Date
    ? value.toISOString()
    : Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [
                key,
                canonical((value as Record<string, unknown>)[key]),
              ]),
          )
        : value;
const hash = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
export function apiUuid(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new BadRequestException('A valid UUID is required');
  return value.toLowerCase();
}
export function apiRevision(value?: string): number {
  if (
    !value ||
    !/^"?[1-9]\d{0,8}"?$/.test(value) ||
    value.startsWith('"') !== value.endsWith('"')
  )
    throw new BadRequestException('If-Match must contain the policy revision');
  return Number(value.replace(/"/g, ''));
}

@Injectable()
export class HrApiPolicyService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  private async authorize(
    s: ApiPolicyScope,
    write = false,
    q: Pick<DataSource, 'query'> = this.db,
  ) {
    const roles: Array<{ role_name: string }> = await q.query(
      `SELECT r.role_name FROM users u JOIN roles r ON r.role_id=u.role_id
      WHERE u.tenant_id=$1 AND u.user_id=$2 AND u.is_active=true
      UNION SELECT r.role_name FROM users u JOIN user_roles ur ON ur.user_id=u.user_id JOIN roles r ON r.role_id=ur.role_id
      WHERE u.tenant_id=$1 AND u.user_id=$2 AND u.is_active=true`,
      [s.tenantId, s.actorId],
    );
    if (
      !roles.some((r) =>
        (write
          ? ['HRAdmin', 'SuperAdmin']
          : ['HR', 'HRAdmin', 'SuperAdmin']
        ).includes(r.role_name),
      )
    )
      throw new ForbiddenException('A current authorized HR role is required');
    const denied = await q.query(
      `SELECT 1 FROM hr_access_controls a WHERE a.tenant_id=$1 AND a.user_id=$2 AND a.module_name='POLICIES'
      AND (a.can_view=false OR ($4::boolean AND (a.can_edit=false OR a.department_scope IS NOT NULL))
        OR (a.entity_scope IS NOT NULL AND NOT COALESCE($3=ANY(a.entity_scope),false))) LIMIT 1`,
      [s.tenantId, s.actorId, s.entityId, write],
    );
    if (denied.length)
      throw new ForbiddenException(
        'This policy operation is outside your delegated HR scope',
      );
    return roles.some((r) => ['HRAdmin', 'SuperAdmin'].includes(r.role_name));
  }

  private async policy(
    s: ApiPolicyScope,
    id: string,
    q: Pick<DataSource, 'query'> = this.db,
    lock = false,
  ): Promise<Policy> {
    const rows = await q.query(
      `SELECT p.* FROM hr_api_policies p WHERE tenant_id=$1 AND entity_id=$2 AND policy_id=$3${lock ? ' FOR UPDATE' : ''}`,
      [s.tenantId, s.entityId, apiUuid(id)],
    );
    if (!rows[0])
      throw new NotFoundException('API policy not found in this organization');
    return rows[0];
  }
  private async groupLock(
    s: ApiPolicyScope,
    designation: string,
    year: number,
    q: EntityManager,
  ) {
    await q.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      JSON.stringify([s.tenantId, s.entityId, designation, year]),
    ]);
  }
  private event(
    s: ApiPolicyScope,
    p: Policy,
    action: string,
    details: unknown,
    q: EntityManager,
  ) {
    return q.query(
      `INSERT INTO hr_api_policy_events (tenant_id,entity_id,policy_id,actor_user_id,action,revision,details)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [
        s.tenantId,
        s.entityId,
        p.policy_id,
        s.actorId,
        action,
        p.revision,
        JSON.stringify(details),
      ],
    );
  }

  async list(s: ApiPolicyScope) {
    await this.authorize(s);
    let canEdit = false;
    try {
      canEdit = await this.authorize(s, true);
    } catch (error) {
      if (!(error instanceof ForbiddenException)) throw error;
    }
    const items = await this.db.query(
      `SELECT p.*, (a.policy_id=p.policy_id) AS is_current FROM hr_api_policies p
      LEFT JOIN hr_api_policy_assignments a ON a.tenant_id=p.tenant_id AND a.entity_id=p.entity_id AND a.designation_key=p.designation_key AND a.assessment_year=p.assessment_year
      WHERE p.tenant_id=$1 AND p.entity_id=$2 ORDER BY p.assessment_year DESC,p.designation_key,p.version DESC LIMIT 200`,
      [s.tenantId, s.entityId],
    );
    const designations = await this.db.query(
      `SELECT DISTINCT trim(designation) AS designation FROM hr_employee_profiles
      WHERE tenant_id=$1 AND entity_id=$2 AND designation IS NOT NULL AND trim(designation)<>'' ORDER BY designation`,
      [s.tenantId, s.entityId],
    );
    const employees = await this.db.query(
      `SELECT u.user_id,u.name,p.designation FROM users u
      JOIN roles r ON r.role_id=u.role_id JOIN hr_employee_profiles p ON p.user_id=u.user_id AND p.tenant_id=u.tenant_id
      WHERE u.tenant_id=$1 AND p.entity_id=$2 AND u.is_active=true AND r.role_name NOT IN ('Student','Applicant','Parent')
        AND NOT EXISTS (SELECT 1 FROM hr_access_controls a WHERE a.tenant_id=$1 AND a.user_id=$3 AND a.module_name IN ('DIRECTORY','POLICIES')
          AND (a.can_view=false OR (a.entity_scope IS NOT NULL AND NOT COALESCE($2=ANY(a.entity_scope),false))
            OR (a.department_scope IS NOT NULL AND NOT COALESCE(u.dept_id=ANY(a.department_scope),false))))
      ORDER BY u.name,u.user_id LIMIT 500`,
      [s.tenantId, s.entityId, s.actorId],
    );
    // Templates are never seeded, published or assigned automatically.
    return {
      items,
      employees,
      designations: designations.map(
        (r: { designation: string }) => r.designation,
      ),
      can_edit: canEdit,
      template: apiStarterTemplate(),
    };
  }

  async create(
    s: ApiPolicyScope,
    body: Record<string, unknown>,
    requestId: string,
  ) {
    const id = apiUuid(requestId);
    const designation = apiText(body.designation, 'Designation', 140).replace(
      /\s+/g,
      ' ',
    );
    const key = designationKey(designation);
    const year = apiYear(body.assessment_year);
    const title = apiText(body.title, 'Title');
    const sheet = validateApiSheet(body.sheet);
    const fingerprint = hash({ designation: key, year, title, sheet });
    return this.db.transaction(async (q) => {
      await this.authorize(s, true, q);
      await q.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        JSON.stringify([s.tenantId, s.entityId, id]),
      ]);
      const existing = await q.query(
        'SELECT * FROM hr_api_policies WHERE tenant_id=$1 AND entity_id=$2 AND request_id=$3',
        [s.tenantId, s.entityId, id],
      );
      if (existing[0]) {
        if (existing[0].request_hash !== fingerprint)
          throw new ConflictException(
            'Idempotency key was already used for different policy data',
          );
        return existing[0];
      }
      await this.groupLock(s, key, year, q);
      const rows = await q.query(
        `INSERT INTO hr_api_policies (tenant_id,entity_id,designation,designation_key,assessment_year,version,title,sheet,origin,created_by,request_id,request_hash)
        SELECT $1::uuid,$2::int,$3::varchar(140),$4::varchar(140),$5::int,COALESCE(MAX(version),0)+1,$6::varchar(160),$7::jsonb,$8::varchar(40),$9::uuid,$10::uuid,$11::varchar(64) FROM hr_api_policies
        WHERE tenant_id=$1::uuid AND entity_id=$2::int AND designation_key=$4::varchar(140) AND assessment_year=$5::int RETURNING *`,
        [
          s.tenantId,
          s.entityId,
          designation,
          key,
          year,
          title,
          JSON.stringify(sheet),
          body.from_template === true ? 'ILLUSTRATIVE_TEMPLATE' : 'HR_DEFINED',
          s.actorId,
          id,
          fingerprint,
        ],
      );
      await this.event(s, rows[0], 'CREATED', { sheet_hash: hash(sheet) }, q);
      return rows[0];
    });
  }

  async update(
    s: ApiPolicyScope,
    id: string,
    revision: number,
    body: Record<string, unknown>,
  ) {
    const title = apiText(body.title, 'Title');
    const sheet = validateApiSheet(body.sheet);
    return this.db.transaction(async (q) => {
      await this.authorize(s, true, q);
      const old = await this.policy(s, id, q, true);
      if (old.status !== 'DRAFT' || old.revision !== revision)
        throw new ConflictException(
          'Policy is published or changed; reload it, or create a new version',
        );
      const [p] = await q.query(
        `UPDATE hr_api_policies SET title=$4,sheet=$5::jsonb,revision=revision+1
        WHERE tenant_id=$1 AND entity_id=$2 AND policy_id=$3 AND revision=$6 AND status='DRAFT' RETURNING *`,
        [s.tenantId, s.entityId, id, title, JSON.stringify(sheet), revision],
      );
      if (!p) throw new ConflictException('Policy changed');
      await this.event(
        s,
        p,
        'DRAFT_UPDATED',
        {
          previous_hash: hash(old.sheet),
          sheet_hash: hash(sheet),
          previous_sheet: old.sheet,
          sheet,
        },
        q,
      );
      return p;
    });
  }

  async publish(
    s: ApiPolicyScope,
    id: string,
    revision: number,
    body: Record<string, unknown>,
  ) {
    if (body.acknowledged !== true)
      throw new BadRequestException(
        'Confirm that HR reviewed the sample rules and approved this designation policy',
      );
    const reference = apiText(
      body.approval_reference,
      'Institutional approval reference',
      1000,
    );
    if (reference.length < 10)
      throw new BadRequestException(
        'Provide an approval reference of at least 10 characters',
      );
    return this.db.transaction(async (q) => {
      await this.authorize(s, true, q);
      const found = await this.policy(s, id, q);
      await this.groupLock(s, found.designation_key, found.assessment_year, q);
      const p = await this.policy(s, id, q, true);
      if (p.status !== 'DRAFT' || p.revision !== revision)
        throw new ConflictException(
          'Policy changed or is already published; reload before publishing',
        );
      validateApiSheet(p.sheet);
      const previous = await q.query(
        'SELECT policy_id FROM hr_api_policy_assignments WHERE tenant_id=$1 AND entity_id=$2 AND designation_key=$3 AND assessment_year=$4',
        [s.tenantId, s.entityId, p.designation_key, p.assessment_year],
      );
      const [published] = await q.query(
        `UPDATE hr_api_policies SET status='PUBLISHED',revision=revision+1,published_by=$4,published_at=now(),approval_reference=$5
        WHERE tenant_id=$1 AND entity_id=$2 AND policy_id=$3 RETURNING *`,
        [s.tenantId, s.entityId, id, s.actorId, reference],
      );
      await q.query(
        `INSERT INTO hr_api_policy_assignments (tenant_id,entity_id,designation_key,assessment_year,policy_id) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (tenant_id,entity_id,designation_key,assessment_year) DO UPDATE SET policy_id=EXCLUDED.policy_id`,
        [s.tenantId, s.entityId, p.designation_key, p.assessment_year, id],
      );
      await this.event(
        s,
        published,
        'PUBLISHED',
        {
          approval_reference: reference,
          replaces_policy_id: previous[0]?.policy_id ?? null,
          sheet_hash: hash(p.sheet),
        },
        q,
      );
      return published;
    });
  }

  async preview(s: ApiPolicyScope, body: Record<string, unknown>) {
    await this.authorize(s);
    const p = body.policy_id
      ? await this.policy(s, apiUuid(body.policy_id))
      : null;
    return {
      policy_id: p?.policy_id ?? null,
      revision: p?.revision ?? null,
      version: p?.version ?? null,
      designation: p?.designation ?? null,
      status: p?.status ?? 'UNSAVED_DRAFT',
      calculation: calculateApiSheet(p?.sheet ?? body.sheet, body.inputs),
    };
  }

  async history(s: ApiPolicyScope, id: string) {
    await this.authorize(s);
    await this.policy(s, id);
    return this.db.query(
      `SELECT action,revision,details,actor_user_id,created_at FROM hr_api_policy_events
      WHERE tenant_id=$1 AND entity_id=$2 AND policy_id=$3 ORDER BY event_sequence`,
      [s.tenantId, s.entityId, id],
    );
  }

  async calculations(s: ApiPolicyScope, id: string) {
    await this.authorize(s);
    await this.policy(s, id);
    return this.db.query(
      `SELECT c.snapshot_id,c.sha256,c.created_at,c.checked_by,c.snapshot FROM hr_api_calculation_snapshots c
      JOIN users u ON u.user_id=c.employee_user_id AND u.tenant_id=c.tenant_id
      JOIN hr_employee_profiles p ON p.user_id=u.user_id AND p.tenant_id=u.tenant_id AND p.entity_id=c.entity_id
      WHERE c.tenant_id=$1 AND c.entity_id=$2 AND c.policy_id=$3
        AND NOT EXISTS (SELECT 1 FROM hr_access_controls a WHERE a.tenant_id=$1 AND a.user_id=$4 AND a.module_name IN ('DIRECTORY','POLICIES')
          AND (a.can_view=false OR (a.entity_scope IS NOT NULL AND NOT COALESCE($2=ANY(a.entity_scope),false))
            OR (a.department_scope IS NOT NULL AND NOT COALESCE(u.dept_id=ANY(a.department_scope),false))))
      ORDER BY c.created_at DESC,c.snapshot_id LIMIT 100`,
      [s.tenantId, s.entityId, id, s.actorId],
    );
  }

  private async employee(s: ApiPolicyScope, id: string, q: EntityManager) {
    const employees = await q.query(
      `SELECT u.user_id,u.name,p.designation FROM users u JOIN hr_employee_profiles p ON p.user_id=u.user_id AND p.tenant_id=u.tenant_id
      WHERE u.user_id=$1 AND u.tenant_id=$2 AND p.entity_id=$3 AND u.is_active=true
        AND NOT EXISTS (SELECT 1 FROM hr_access_controls a WHERE a.tenant_id=$2 AND a.user_id=$4 AND a.module_name IN ('DIRECTORY','POLICIES')
          AND (a.can_view=false OR (a.entity_scope IS NOT NULL AND NOT COALESCE($3=ANY(a.entity_scope),false))
            OR (a.department_scope IS NOT NULL AND NOT COALESCE(u.dept_id=ANY(a.department_scope),false))))`,
      [id, s.tenantId, s.entityId, s.actorId],
    );
    if (!employees[0])
      throw new NotFoundException(
        'Employee not found in your authorized organization',
      );
    return employees[0];
  }

  async saveCalculation(
    s: ApiPolicyScope,
    id: string,
    revision: number,
    body: Record<string, unknown>,
    requestId: string,
  ) {
    id = apiUuid(id);
    const key = apiUuid(requestId);
    const employeeId = apiUuid(body.employee_user_id);
    return this.db.transaction(async (q) => {
      await this.authorize(s, true, q);
      await q.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        JSON.stringify([s.tenantId, s.entityId, key]),
      ]);
      const p = await this.policy(s, id, q);
      await this.groupLock(s, p.designation_key, p.assessment_year, q);
      const calculation = calculateApiSheet(p.sheet, body.inputs);
      // Recheck object scope even on an idempotent retry; permissions may have changed.
      const employee = await this.employee(s, employeeId, q);
      const existing = await q.query(
        'SELECT * FROM hr_api_calculation_snapshots WHERE tenant_id=$1 AND entity_id=$2 AND idempotency_key=$3',
        [s.tenantId, s.entityId, key],
      );
      if (existing[0]) {
        const old = existing[0].snapshot;
        if (
          old.policy.policy_id !== id ||
          old.employee.user_id !== employeeId ||
          hash(old.calculation.inputs) !== hash(calculation.inputs)
        )
          throw new ConflictException(
            'Idempotency key was used for a different calculation',
          );
        return {
          snapshot_id: existing[0].snapshot_id,
          sha256: existing[0].sha256,
          snapshot: old,
        };
      }
      const current = await q.query(
        'SELECT policy_id FROM hr_api_policy_assignments WHERE tenant_id=$1 AND entity_id=$2 AND designation_key=$3 AND assessment_year=$4',
        [s.tenantId, s.entityId, p.designation_key, p.assessment_year],
      );
      if (
        p.status !== 'PUBLISHED' ||
        p.revision !== revision ||
        current[0]?.policy_id !== p.policy_id
      )
        throw new ConflictException(
          'Only the current published policy revision can create a new calculation record',
        );
      if (!calculation.complete)
        throw new BadRequestException(calculation.issues);
      if (designationKey(employee.designation) !== p.designation_key)
        throw new BadRequestException(
          'The employee designation does not match this policy',
        );
      const snapshot = {
        kind: 'CHECKED_CALCULATION_NOT_FINAL_APPRAISAL',
        employee,
        policy: p,
        calculation,
      };
      const digest = hash(snapshot);
      const [saved] = await q.query(
        `INSERT INTO hr_api_calculation_snapshots (tenant_id,entity_id,policy_id,employee_user_id,checked_by,idempotency_key,snapshot,sha256)
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8) RETURNING snapshot_id,sha256`,
        [
          s.tenantId,
          s.entityId,
          id,
          employeeId,
          s.actorId,
          key,
          JSON.stringify(snapshot),
          digest,
        ],
      );
      await this.event(
        s,
        p,
        'CALCULATION_SAVED',
        { snapshot_id: saved.snapshot_id, sha256: digest },
        q,
      );
      return { ...saved, snapshot };
    });
  }
}
