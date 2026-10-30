import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { createHash } from 'crypto';
import { remainingLeadershipApprovers, resolveLeadershipChain } from './approval-chain';
import {
  CampusScopeService,
  ScopedAuthUser,
} from '../../common/campus-scope/campus-scope.service';
import {
  DepartmentStructure,
  OfficeContext,
  OfficeKind,
  officeEnabled,
  reportingKind,
} from './leadership.types';

@Injectable()
export class DepartmentLeadershipService {
  constructor(
    private readonly db: DataSource,
    private readonly campus: CampusScopeService,
  ) {}

  private async transaction<T>(
    work: (m: EntityManager) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.db.transaction('SERIALIZABLE', work);
    } catch (error) {
      if (
        ['40001', '40P01', '23505'].includes(
          (error as { code?: string }).code ?? '',
        )
      )
        throw new ConflictException(
          'Leadership changed concurrently or the office alias is already reserved; refresh and retry',
        );
      throw error;
    }
  }

  private async scope(actor: ScopedAuthUser, deptId: number) {
    if (!actor.tenant_id || !actor.user_id) throw new ForbiddenException();
    if(![...(actor.roles??[]),actor.role??''].some(role=>['campusadmin','superadmin'].includes(role.trim().toLowerCase())))
      throw new ForbiddenException('Only Campus/Super Admin may manage department offices');
    if (!Number.isInteger(deptId) || deptId < 1)
      throw new BadRequestException('Invalid department');
    const campuses = await this.campus.resolveCampusIds(actor);
    const rows = await this.db.query(
      `SELECT d.dept_id FROM departments d JOIN schools s ON s.school_id=d.school_id
      JOIN users u ON u.dept_id=d.dept_id AND u.tenant_id=$1 AND u.deleted_at IS NULL
      WHERE d.dept_id=$2 AND d.deleted_at IS NULL AND ($3::int[] IS NULL OR s.campus_id=ANY($3)) LIMIT 1`,
      [actor.tenant_id, deptId, campuses],
    );
    if (!rows.length)
      throw new ForbiddenException('Department is outside your tenant/campus');
  }

  async read(actor: ScopedAuthUser, deptId: number) {
    await this.scope(actor, deptId);
    const [config] = await this.db.query(
      'SELECT * FROM department_leadership WHERE tenant_id=$1 AND dept_id=$2',
      [actor.tenant_id, deptId],
    );
    const offices = await this.db.query(
      `SELECT o.office_id,o.kind,o.login_alias,a.appointment_id,a.user_id,a.valid_from,u.name,u.official_email
      FROM department_offices o LEFT JOIN department_office_appointments a ON a.office_id=o.office_id AND a.valid_to IS NULL
      LEFT JOIN users u ON u.user_id=a.user_id AND u.tenant_id=o.tenant_id WHERE o.tenant_id=$1 AND o.dept_id=$2 ORDER BY o.kind`,
      [actor.tenant_id, deptId],
    );
    return { config: config ?? null, offices };
  }

  async previewFlexible(actor: ScopedAuthUser, deptId: number) {
    await this.scope(actor, deptId);
    const [current, [counts]] = await Promise.all([
      this.read(actor, deptId),
      this.db.query(`SELECT
        (SELECT count(*)::int FROM users u WHERE u.tenant_id=$1 AND u.dept_id=$2
          AND u.is_active=true AND u.deleted_at IS NULL
          AND NOT EXISTS(SELECT 1 FROM student_profiles sp WHERE sp.tenant_id=u.tenant_id AND sp.user_id=u.user_id)) AS staff_count,
        (SELECT count(*)::int FROM staff_leave_requests r JOIN users u ON u.user_id=r.staff_user_id
          WHERE r.tenant_id=$1 AND u.dept_id=$2 AND r.status IN ('PENDING','HOD_APPROVED')) AS pending_count`,
        [actor.tenant_id, deptId]),
    ]);
    return { ...current, staff_count: counts.staff_count, pending_count: counts.pending_count };
  }

  /** One reviewed change replaces separate structure and appointment mutations. */
  async configureFlexible(
    actor: ScopedAuthUser,
    deptId: number,
    input: {
      hod_user_id: string | null;
      principal_user_id: string | null;
      dean_user_id: string | null;
      higher_officer_id: string | null;
    },
    revision: number,
    idempotencyKey: string,
  ) {
    if (![...(actor.roles ?? []), actor.role ?? ''].some((role) => role.toLowerCase() === 'superadmin'))
      throw new ForbiddenException('Super Admin is required');
    await this.scope(actor, deptId);
    if (!idempotencyKey || idempotencyKey.length > 128)
      throw new BadRequestException('Idempotency-Key is required');
    const normalized = {
      hod_user_id: input.hod_user_id || null,
      principal_user_id: input.principal_user_id || null,
      dean_user_id: input.dean_user_id || null,
      higher_officer_id: input.higher_officer_id || null,
    };
    const hash = createHash('sha256').update(JSON.stringify({ deptId, normalized })).digest('hex');
    return this.transaction(async (m) => {
      await m.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${actor.tenant_id}:${deptId}:leadership`]);
      const [repeat] = await m.query(
        `SELECT request_hash,applied_revision FROM department_leadership_changes
         WHERE tenant_id=$1 AND idempotency_key=$2`, [actor.tenant_id, idempotencyKey],
      );
      if (repeat) {
        if (repeat.request_hash !== hash) throw new ConflictException('Idempotency key was used for a different change');
        return { success: true, revision: repeat.applied_revision, replayed: true };
      }
      const [old] = await m.query(
        `SELECT * FROM department_leadership WHERE tenant_id=$1 AND dept_id=$2 FOR UPDATE`,
        [actor.tenant_id, deptId],
      );
      const oldHolders = await m.query<Array<{ kind: string; user_id: string }>>(
        `SELECT o.kind,a.user_id FROM department_offices o
         JOIN department_office_appointments a ON a.office_id=o.office_id
           AND a.valid_to IS NULL
         WHERE o.tenant_id=$1 AND o.dept_id=$2`, [actor.tenant_id, deptId],
      );
      const oldHodId = oldHolders.find((holder) => holder.kind === 'HOD')?.user_id;
      const oldPrincipalId = oldHolders.find((holder) => holder.kind === 'PRINCIPAL')?.user_id;
      if (Number(old?.revision ?? 0) !== revision)
        throw new ConflictException('Leadership configuration changed; refresh');
      // Older academic and administrative paths still read the global
      // departments.hod_user_id. Until those paths use tenant-scoped offices,
      // changing that field is safe only when this department belongs to one
      // active tenant. Never let one tenant's switch rewrite another's HOD.
      const [sharedDepartment] = await m.query(
        `SELECT 1 FROM users u WHERE u.dept_id=$1 AND u.tenant_id<>$2
          AND u.is_active=true AND u.deleted_at IS NULL LIMIT 1`,
        [deptId, actor.tenant_id],
      );
      if (sharedDepartment)
        throw new ConflictException('This department is shared by another tenant; its legacy HOD scope must be migrated before leadership can change');
      const selected = Object.values(normalized).filter((id): id is string => !!id);
      if (new Set(selected).size !== selected.length)
        throw new BadRequestException('One person cannot hold two levels in the same reporting chain');
      if (!selected.length)
        throw new BadRequestException('Select at least one reporting officer');
      const people = await m.query<Array<{ user_id: string; dept_id: number | null }>>(
        `SELECT u.user_id,u.dept_id FROM users u WHERE u.tenant_id=$1
          AND u.user_id=ANY($2::uuid[]) AND u.is_active=true AND u.deleted_at IS NULL
          AND NOT EXISTS(SELECT 1 FROM student_profiles sp WHERE sp.tenant_id=u.tenant_id AND sp.user_id=u.user_id)`,
        [actor.tenant_id, selected],
      );
      if (people.length !== selected.length)
        throw new BadRequestException('Every officeholder must be active staff in this tenant');
      if (normalized.hod_user_id &&
          people.find((p) => p.user_id === normalized.hod_user_id)?.dept_id !== deptId)
        throw new BadRequestException('HOD must belong to the selected department');
      if (normalized.higher_officer_id &&
          people.find((p) => p.user_id === normalized.higher_officer_id)?.dept_id === deptId)
        throw new BadRequestException('Higher reporting officer must be outside this department');
      if (normalized.higher_officer_id) {
        const cycle = await m.query(
          `WITH RECURSIVE chain AS (
             SELECT u.user_id,u.dept_id,u.reporting_officer_id,ARRAY[u.user_id] AS path
             FROM users u WHERE u.tenant_id=$1 AND u.user_id=$2
             UNION ALL
             SELECT u.user_id,u.dept_id,u.reporting_officer_id,chain.path||u.user_id
             FROM users u JOIN chain ON u.user_id=chain.reporting_officer_id
             WHERE u.tenant_id=$1 AND NOT u.user_id=ANY(chain.path)
           ) SELECT 1 FROM chain WHERE dept_id=$3
             OR user_id=ANY($4::uuid[]) LIMIT 1`,
          [actor.tenant_id, normalized.higher_officer_id, deptId,
            selected.filter((id) => id !== normalized.higher_officer_id)],
        );
        if (cycle.length)
          throw new BadRequestException('Reporting hierarchy would contain a cycle');
      }
      const structure: DepartmentStructure = normalized.hod_user_id
        ? normalized.principal_user_id ? 'PRINCIPAL_HOD' : 'HOD_ONLY'
        : normalized.principal_user_id ? 'PRINCIPAL_ONLY' : 'NONE';
      const [saved] = await m.query<Array<{ revision: number }>>(
        `INSERT INTO department_leadership
           (tenant_id,dept_id,structure,dean_enabled,dean_user_id,higher_officer_id,revision)
         VALUES($1,$2,$3,$4,$5,$6,1)
         ON CONFLICT(tenant_id,dept_id) DO UPDATE SET
           structure=$3,dean_enabled=$4,dean_user_id=$5,higher_officer_id=$6,
           revision=department_leadership.revision+1 RETURNING revision`,
        [actor.tenant_id, deptId, structure, !!normalized.dean_user_id,
          normalized.dean_user_id, normalized.higher_officer_id],
      );
      if (old?.dean_user_id !== normalized.dean_user_id) {
        const changed = [old?.dean_user_id, normalized.dean_user_id].filter(Boolean);
        if (changed.length) await m.query(
          `INSERT INTO department_office_session_revisions(tenant_id,user_id,revision)
           SELECT $1,unnest($2::uuid[]),1 ON CONFLICT(tenant_id,user_id)
           DO UPDATE SET revision=department_office_session_revisions.revision+1`,
          [actor.tenant_id, changed],
        );
      }
      for (const kind of ['HOD', 'PRINCIPAL'] as const) {
        const person = kind === 'HOD' ? normalized.hod_user_id : normalized.principal_user_id;
        const [office] = await m.query<Array<{ office_id: string }>>(
          `INSERT INTO department_offices(tenant_id,dept_id,kind,login_alias)
           VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,dept_id,kind)
           DO UPDATE SET kind=EXCLUDED.kind RETURNING office_id`,
          [actor.tenant_id, deptId, kind, `${kind.toLowerCase()}-d${deptId}@office.falcon.invalid`],
        );
        const [prior] = await m.query<Array<{ user_id: string }>>(
          `SELECT user_id FROM department_office_appointments
           WHERE office_id=$1 AND valid_to IS NULL FOR UPDATE`, [office.office_id],
        );
        if (prior?.user_id !== person) {
          await m.query(`UPDATE department_office_appointments SET valid_to=now()
            WHERE office_id=$1 AND valid_to IS NULL`, [office.office_id]);
          if (person) await m.query(
            `INSERT INTO department_office_appointments(office_id,user_id,assigned_by)
             VALUES($1,$2,$3)`, [office.office_id, person, actor.user_id],
          );
          const affected = [prior?.user_id, person].filter(Boolean);
          if (affected.length) await m.query(
            `INSERT INTO department_office_session_revisions(tenant_id,user_id,revision)
             SELECT $1,unnest($2::uuid[]),1 ON CONFLICT(tenant_id,user_id)
             DO UPDATE SET revision=department_office_session_revisions.revision+1`,
            [actor.tenant_id, affected],
          );
        }
      }
      await m.query(`UPDATE departments SET hod_user_id=$1 WHERE dept_id=$2`,
        [normalized.hod_user_id, deptId]);
      const staff = await m.query<Array<{ user_id: string }>>(
        `SELECT u.user_id FROM users u WHERE u.tenant_id=$1 AND u.dept_id=$2
         AND u.is_active=true AND u.deleted_at IS NULL
         AND NOT EXISTS(SELECT 1 FROM student_profiles sp WHERE sp.tenant_id=u.tenant_id AND sp.user_id=u.user_id)
         ORDER BY u.user_id`, [actor.tenant_id, deptId],
      );
      for (const person of staff) {
        const chain = await resolveLeadershipChain((sql, args) => m.query(sql, args),
          actor.tenant_id!, person.user_id);
        if (!chain) throw new BadRequestException('Reporting chain could not be resolved');
        await m.query(`UPDATE users SET reporting_officer_id=$1,updated_at=now()
          WHERE tenant_id=$2 AND user_id=$3`,
          [chain.approverIds[0], actor.tenant_id, person.user_id]);
      }
      const pending = await m.query<Array<{ leave_id: string; staff_user_id: string;
        current_approver_user_id: string | null; current_step_order: number }>>(
        `SELECT r.leave_id,r.staff_user_id,r.current_approver_user_id,r.current_step_order
         FROM staff_leave_requests r JOIN users u ON u.user_id=r.staff_user_id
         WHERE r.tenant_id=$1 AND u.dept_id=$2 AND r.status IN ('PENDING','HOD_APPROVED')
         FOR UPDATE OF r`, [actor.tenant_id, deptId],
      );
      for (const request of pending) {
        const chain = await resolveLeadershipChain((sql, args) => m.query(sql, args),
          actor.tenant_id!, request.staff_user_id);
        if (!chain) continue;
        const approved = await m.query<Array<{ actor_user_id: string; step_order: number }>>(
          `SELECT actor_user_id,step_order FROM hr_staff_request_decisions
           WHERE tenant_id=$1 AND leave_id=$2 AND action='APPROVE' ORDER BY step_order`,
          [actor.tenant_id, request.leave_id],
        );
        const completed = new Set(approved.map((decision) => decision.actor_user_id));
        const [previousRoute] = await m.query<Array<{ current_index: number }>>(
          `SELECT current_index FROM hr_department_request_routes
           WHERE tenant_id=$1 AND leave_id=$2 FOR UPDATE`,
          [actor.tenant_id, request.leave_id],
        );
        // Completed stages remain complete even when a different person now
        // holds that office. A change must not send work backwards to a new HOD.
        const completedStages = Number(previousRoute?.current_index ?? approved.length);
        const remaining = remainingLeadershipApprovers(chain.approverIds,
          completedStages, [...completed]);
        const nextStep = Math.max(Number(request.current_step_order),
          ...approved.map((decision) => Number(decision.step_order))) + 1;
        await m.query(`INSERT INTO hr_department_request_routes
          (leave_id,tenant_id,dept_id,approver_ids,current_index,leadership_revision)
          VALUES($1,$2,$3,$4::uuid[],0,$5)
          ON CONFLICT(leave_id) DO UPDATE SET approver_ids=$4::uuid[],current_index=0,
            leadership_revision=$5,updated_at=now()`,
          [request.leave_id, actor.tenant_id, deptId, remaining, saved.revision]);
        await m.query(`UPDATE staff_leave_requests SET workflow_id=NULL,
          current_step_order=$1,current_approver_user_id=$2
          WHERE tenant_id=$3 AND leave_id=$4`,
          [nextStep, remaining[0], actor.tenant_id, request.leave_id]);
        await this.event(m, actor, deptId, 'REROUTE_HR_REQUEST', {
          leave_id: request.leave_id, previous_approver_user_id: request.current_approver_user_id,
          new_approver_user_id: remaining[0], preserved_approvals: [...completed],
        });
      }
      const appeals = await m.query<Array<{ appeal_id: string; requester_user_id: string;
        rejecting_user_id: string; rejecting_level: string | null; reviewer_user_id: string }>>(
        `SELECT a.appeal_id,a.requester_user_id,a.rejecting_user_id,a.rejecting_level,a.reviewer_user_id
         FROM hr_staff_request_appeals a
         JOIN staff_leave_requests r ON r.leave_id=a.leave_id AND r.tenant_id=a.tenant_id
         JOIN users u ON u.user_id=r.staff_user_id AND u.tenant_id=r.tenant_id
         WHERE a.tenant_id=$1 AND u.dept_id=$2 AND a.status='PENDING_REVIEW'
         FOR UPDATE OF a`, [actor.tenant_id, deptId],
      );
      for (const appeal of appeals) {
        const reviewer = appeal.rejecting_level === 'HOD' || appeal.rejecting_user_id === oldHodId
          ? normalized.principal_user_id || normalized.dean_user_id || normalized.higher_officer_id
          : appeal.rejecting_level === 'PRINCIPAL' || appeal.rejecting_user_id === oldPrincipalId
            ? normalized.dean_user_id || normalized.higher_officer_id
            : appeal.rejecting_level === 'DEAN' || appeal.rejecting_user_id === old?.dean_user_id
              ? normalized.higher_officer_id
              : normalized.principal_user_id || normalized.dean_user_id || normalized.higher_officer_id;
        if (!reviewer || reviewer === appeal.requester_user_id || reviewer === appeal.rejecting_user_id)
          throw new BadRequestException('An open appeal would be left without an independent reviewer');
        if (reviewer !== appeal.reviewer_user_id) {
          await m.query(`UPDATE hr_staff_request_appeals SET reviewer_user_id=$1,
            revision=revision+1,updated_at=now() WHERE appeal_id=$2`,
            [reviewer, appeal.appeal_id]);
          await this.event(m, actor, deptId, 'REROUTE_HR_APPEAL', {
            appeal_id: appeal.appeal_id,
            previous_reviewer_user_id: appeal.reviewer_user_id,
            new_reviewer_user_id: reviewer,
          });
        }
      }
      const activeAppeals = await m.query<Array<{
        appeal_id: string; leave_id: string; status: string; requester_user_id: string;
        rejecting_user_id: string; rejecting_level: string | null;
        reviewer_user_id: string; current_approver_user_id: string | null;
        current_step_order: number;
      }>>(`SELECT a.appeal_id,a.leave_id,a.status,a.requester_user_id,
          a.rejecting_user_id,a.rejecting_level,a.reviewer_user_id,
          r.current_approver_user_id,r.current_step_order
        FROM hr_staff_request_appeals a
        JOIN staff_leave_requests r ON r.leave_id=a.leave_id AND r.tenant_id=a.tenant_id
        JOIN users u ON u.user_id=r.staff_user_id AND u.tenant_id=r.tenant_id
        WHERE a.tenant_id=$1 AND u.dept_id=$2
          AND a.status IN ('PENDING_RECONSIDERATION','PENDING_FINAL')
        FOR UPDATE OF a,r`, [actor.tenant_id, deptId]);
      for (const appeal of activeAppeals) {
        const reviewer = appeal.rejecting_level === 'HOD' || appeal.rejecting_user_id === oldHodId
          ? normalized.principal_user_id || normalized.dean_user_id || normalized.higher_officer_id
          : appeal.rejecting_level === 'PRINCIPAL' || appeal.rejecting_user_id === oldPrincipalId
            ? normalized.dean_user_id || normalized.higher_officer_id
            : appeal.rejecting_level === 'DEAN' || appeal.rejecting_user_id === old?.dean_user_id
              ? normalized.higher_officer_id
              : normalized.principal_user_id || normalized.dean_user_id || normalized.higher_officer_id;
        const currentRejecting = appeal.rejecting_level === 'HOD' ? normalized.hod_user_id
          : appeal.rejecting_level === 'PRINCIPAL' ? normalized.principal_user_id
            : appeal.rejecting_level === 'DEAN' ? normalized.dean_user_id
              : appeal.rejecting_user_id;
        const rejecting = currentRejecting || appeal.rejecting_user_id;
        if (!reviewer || reviewer === appeal.requester_user_id || reviewer === rejecting ||
            (appeal.status === 'PENDING_RECONSIDERATION' &&
              (!currentRejecting || rejecting === appeal.requester_user_id)))
          throw new BadRequestException('An open appeal needs independent officers before this change can be applied');
        const remaining = appeal.status === 'PENDING_RECONSIDERATION'
          ? [rejecting!, reviewer] : [reviewer];
        const nextApprover = remaining[0];
        const nextStep = Number(appeal.current_step_order) + 1;
        await m.query(`UPDATE hr_department_request_routes
          SET approver_ids=$3::uuid[],current_index=0,leadership_revision=$4,updated_at=now()
          WHERE tenant_id=$1 AND leave_id=$2`,
          [actor.tenant_id, appeal.leave_id, remaining, saved.revision]);
        await m.query(`UPDATE staff_leave_requests
          SET current_approver_user_id=$3,current_step_order=$4
          WHERE tenant_id=$1 AND leave_id=$2`,
          [actor.tenant_id, appeal.leave_id, nextApprover, nextStep]);
        await m.query(`UPDATE hr_staff_request_appeals
          SET rejecting_user_id=$3,reviewer_user_id=$4,revision=revision+1,updated_at=now()
          WHERE tenant_id=$1 AND appeal_id=$2`,
          [actor.tenant_id, appeal.appeal_id, rejecting, reviewer]);
        await this.event(m, actor, deptId, 'REROUTE_HR_APPEAL', {
          appeal_id: appeal.appeal_id,
          previous_approver_user_id: appeal.current_approver_user_id,
          new_approver_user_id: nextApprover,
          preserved_decisions: true,
        });
      }
      await this.event(m, actor, deptId, 'CONFIGURE_FLEXIBLE', {
        before: old ?? null, after: normalized, pending_rerouted: pending.length,
      });
      await m.query(`INSERT INTO department_leadership_changes
        (tenant_id,dept_id,idempotency_key,request_hash,applied_revision)
        VALUES($1,$2,$3,$4,$5)`,
        [actor.tenant_id, deptId, idempotencyKey, hash, saved.revision]);
      return { success: true, revision: saved.revision, pending_rerouted: pending.length };
    });
  }

  async configure(
    actor: ScopedAuthUser,
    deptId: number,
    input: {
      structure: DepartmentStructure;
      higher_officer_id?: string | null;
    },
    revision: number,
  ) {
    await this.scope(actor, deptId);
    if (input.structure === 'NONE')
      throw new BadRequestException('Use the flexible leadership editor for departments without offices');
    return this.transaction(async (m) => {
      await m.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `${actor.tenant_id}:${deptId}:leadership`,
      ]);
      const [old] = await m.query(
        'SELECT * FROM department_leadership WHERE tenant_id=$1 AND dept_id=$2 FOR UPDATE',
        [actor.tenant_id, deptId],
      );
      const [flexible] = (await m.query(
        'SELECT 1 FROM department_leadership_changes WHERE tenant_id=$1 AND dept_id=$2 LIMIT 1',
        [actor.tenant_id, deptId],
      )) ?? [];
      if (flexible) throw new ConflictException('Use the flexible leadership editor for this department');
      if ((old?.revision ?? 0) !== revision)
        throw new ConflictException(
          'Leadership configuration changed; refresh',
        );
      if (input.higher_officer_id) {
        const rows = await m.query(
          `SELECT user_id FROM users u WHERE user_id=$1 AND tenant_id=$2 AND is_active=true AND deleted_at IS NULL
          AND u.dept_id IS DISTINCT FROM $3
          AND NOT EXISTS(SELECT 1 FROM student_profiles sp WHERE sp.tenant_id=u.tenant_id AND sp.user_id=u.user_id)`,
          [input.higher_officer_id, actor.tenant_id, deptId],
        );
        if (rows.length !== 1)
          throw new BadRequestException(
            'Higher reporting officer must be active staff outside this department in the same tenant',
          );
      }
      const holders = await m.query(
        `SELECT a.user_id,o.kind FROM department_offices o JOIN department_office_appointments a ON a.office_id=o.office_id AND a.valid_to IS NULL
        WHERE o.tenant_id=$1 AND o.dept_id=$2`,
        [actor.tenant_id, deptId],
      );
      if (holders.some((h) => !officeEnabled(input.structure, h.kind)))
        throw new ConflictException(
          'End the excluded office appointment before changing structure',
        );
      await m.query(
        `INSERT INTO department_leadership(tenant_id,dept_id,structure,higher_officer_id)
        VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,dept_id) DO UPDATE SET structure=$3,higher_officer_id=$4,revision=department_leadership.revision+1`,
        [
          actor.tenant_id,
          deptId,
          input.structure,
          input.higher_officer_id ?? null,
        ],
      );
      await this.projectReporting(m, actor.tenant_id!, deptId, actor.user_id);
      await this.event(m, actor, deptId, 'CONFIGURE', {
        before: old ?? null,
        after: input,
      });
      return { success: true, revision: revision + 1 };
    });
  }

  async appoint(
    actor: ScopedAuthUser,
    deptId: number,
    kind: OfficeKind,
    alias: string,
    userId: string | null,
    revision: number,
  ) {
    await this.scope(actor, deptId);
    return this.transaction(async (m) => {
      const [config] = await m.query(
        'SELECT * FROM department_leadership WHERE tenant_id=$1 AND dept_id=$2 FOR UPDATE',
        [actor.tenant_id, deptId],
      );
      if (!config || config.revision !== revision)
        throw new ConflictException(
          'Leadership configuration changed; refresh',
        );
      if (!officeEnabled(config.structure, kind))
        throw new BadRequestException(
          'This office is disabled by the department structure',
        );
      alias = alias.trim().toLowerCase();
      const collision = await m.query(
        'SELECT user_id FROM users WHERE tenant_id=$1 AND lower(official_email)=$2',
        [actor.tenant_id, alias],
      );
      if (collision.length)
        throw new ConflictException(
          'Office alias conflicts with a personal account',
        );
      if (userId) {
        const holder = await m.query(
          `SELECT u.user_id FROM users u JOIN roles r ON r.role_id=u.role_id WHERE u.user_id=$1 AND u.tenant_id=$2 AND u.dept_id=$3
          AND r.role_name IN ('Faculty','HOD','Dean','Principal')
          AND u.is_active=true AND u.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM student_profiles sp WHERE sp.user_id=u.user_id AND sp.tenant_id=u.tenant_id)`,
          [userId, actor.tenant_id, deptId],
        );
        if (holder.length !== 1)
          throw new BadRequestException(
            'Officeholder must be an active staff member of this department',
          );
        if (userId === config.higher_officer_id)
          throw new BadRequestException(
            'Officeholder cannot be their own higher reporting officer',
          );
      }
      const [flexible] = (await m.query(
        'SELECT 1 FROM department_leadership_changes WHERE tenant_id=$1 AND dept_id=$2 LIMIT 1',
        [actor.tenant_id, deptId],
      )) ?? [];
      if (flexible) throw new ConflictException('Use the flexible leadership editor for this department');
      const [office] = await m.query(
        `INSERT INTO department_offices(tenant_id,dept_id,kind,login_alias) VALUES($1,$2,$3,$4)
        ON CONFLICT(tenant_id,dept_id,kind) DO UPDATE SET login_alias=$4 RETURNING office_id`,
        [actor.tenant_id, deptId, kind, alias],
      );
      const prior = await m.query(
        'SELECT user_id FROM department_office_appointments WHERE office_id=$1 AND valid_to IS NULL',
        [office.office_id],
      );
      await m.query(
        'UPDATE department_office_appointments SET valid_to=now() WHERE office_id=$1 AND valid_to IS NULL',
        [office.office_id],
      );
      if (userId)
        await m.query(
          'INSERT INTO department_office_appointments(office_id,user_id,assigned_by) VALUES($1,$2,$3)',
          [office.office_id, userId, actor.user_id],
        );
      const affected = [
        ...new Set([
          ...prior.map((p) => p.user_id),
          ...(userId ? [userId] : []),
        ]),
      ];
      if (affected.length)
        await m.query(
          `INSERT INTO department_office_session_revisions(tenant_id,user_id,revision)
           SELECT $1,unnest($2::uuid[]),1 ON CONFLICT(tenant_id,user_id) DO UPDATE SET revision=department_office_session_revisions.revision+1`,
          [actor.tenant_id, affected],
        );
      await m.query(
        'UPDATE department_leadership SET revision=revision+1 WHERE tenant_id=$1 AND dept_id=$2',
        [actor.tenant_id, deptId],
      );
      if (kind === 'HOD')
        await m.query(
          'UPDATE departments SET hod_user_id=$1 WHERE dept_id=$2',
          [userId, deptId],
        );
      await this.projectReporting(m, actor.tenant_id!, deptId, actor.user_id);
      await this.event(m, actor, deptId, 'APPOINT', {
        office_id: office.office_id,
        kind,
        login_alias: alias,
        previous: prior,
        new_user_id: userId,
        pending_personal_requests: 'unchanged',
      });
      return { success: true, revision: revision + 1 };
    });
  }

  private async projectReporting(
    m: EntityManager,
    tenantId: string,
    deptId: number,
    actorId?: string,
  ) {
    const [config] = await m.query(
      'SELECT * FROM department_leadership WHERE tenant_id=$1 AND dept_id=$2',
      [tenantId, deptId],
    );
    const [head] = await m.query(
      `SELECT a.user_id FROM department_offices o JOIN department_office_appointments a ON a.office_id=o.office_id AND a.valid_to IS NULL
      WHERE o.tenant_id=$1 AND o.dept_id=$2 AND o.kind=$3`,
      [tenantId, deptId, reportingKind(config.structure)],
    );
    // Do not fall back to HOD when a configured Principal office is vacant.
    const headId = head?.user_id ?? null;
    if (config.higher_officer_id && headId) {
      const cycle = await m.query(
        `WITH RECURSIVE chain AS (
        SELECT user_id,reporting_officer_id,ARRAY[user_id] AS path FROM users WHERE tenant_id=$1 AND user_id=$2
        UNION ALL SELECT u.user_id,u.reporting_officer_id,c.path||u.user_id FROM users u JOIN chain c ON u.user_id=c.reporting_officer_id
        WHERE u.tenant_id=$1 AND NOT u.user_id=ANY(c.path)) SELECT 1 FROM chain c JOIN users person ON person.user_id=c.user_id AND person.tenant_id=$1 WHERE c.user_id=$3 OR person.dept_id=$4`,
        [tenantId, config.higher_officer_id, headId, deptId],
      );
      if (cycle.length)
        throw new BadRequestException(
          'Reporting hierarchy would contain a cycle',
        );
    }
    const before = await m.query(
      `SELECT u.user_id,u.reporting_officer_id FROM users u
      WHERE u.tenant_id=$1 AND u.dept_id=$2 AND u.is_active=true AND u.deleted_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM student_profiles sp WHERE sp.tenant_id=u.tenant_id AND sp.user_id=u.user_id)
      ORDER BY u.user_id`,
      [tenantId, deptId],
    );
    await m.query(
      `UPDATE users u SET reporting_officer_id=CASE WHEN user_id=$3 THEN $4::uuid ELSE $3::uuid END
      WHERE tenant_id=$1 AND dept_id=$2 AND is_active=true AND deleted_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM student_profiles sp WHERE sp.tenant_id=u.tenant_id AND sp.user_id=u.user_id)`,
      [tenantId, deptId, headId, config.higher_officer_id ?? null],
    );
    if (actorId)
      await this.event(
        m,
        { tenant_id: tenantId, user_id: actorId },
        deptId,
        'REPORTING_PROJECTION',
        {
          before,
          head_user_id: headId,
          higher_officer_id: config.higher_officer_id ?? null,
          pending_personal_requests: 'unchanged',
        },
      );
  }

  private event(
    m: EntityManager,
    actor: ScopedAuthUser,
    deptId: number,
    action: string,
    details: object,
  ) {
    return m.query(
      'INSERT INTO department_leadership_events(tenant_id,dept_id,actor_user_id,action,details) VALUES($1,$2,$3,$4,$5)',
      [actor.tenant_id, deptId, actor.user_id, action, JSON.stringify(details)],
    );
  }

  async resolveAlias(tenantId: string, alias: string) {
    const rows = await this.db.query(
      `SELECT a.user_id,u.password_hash,u.is_active,o.office_id,o.dept_id,o.kind,o.login_alias,a.appointment_id
      FROM department_offices o JOIN department_leadership c ON c.tenant_id=o.tenant_id AND c.dept_id=o.dept_id
      LEFT JOIN department_office_appointments a ON a.office_id=o.office_id AND a.valid_to IS NULL AND a.valid_from<=now()
      LEFT JOIN users u ON u.user_id=a.user_id AND u.tenant_id=o.tenant_id AND u.deleted_at IS NULL
      WHERE o.tenant_id=$1 AND o.login_alias=lower($2)`,
      [tenantId, alias],
    );
    if (rows.length > 1) throw new UnauthorizedException('Invalid login');
    return rows[0];
  }

  async context(
    tenantId: string,
    userId: string,
  ): Promise<{
    managed: boolean;
    offices: OfficeContext[];
    explicitDean: boolean;
    authRevision:number;
  }> {
    const managed = await this.db.query(
      `SELECT 1 FROM users u JOIN department_leadership c ON c.tenant_id=u.tenant_id AND c.dept_id=u.dept_id WHERE u.tenant_id=$1 AND u.user_id=$2`,
      [tenantId, userId],
    );
    const [session]=await this.db.query('SELECT revision FROM department_office_session_revisions WHERE tenant_id=$1 AND user_id=$2',[tenantId,userId]);
    const offices = await this.db.query(
      `SELECT o.office_id,o.dept_id,o.kind,o.login_alias,a.appointment_id FROM department_offices o
      JOIN department_leadership c ON c.tenant_id=o.tenant_id AND c.dept_id=o.dept_id
      JOIN department_office_appointments a ON a.office_id=o.office_id AND a.valid_to IS NULL AND a.valid_from<=now()
      JOIN users holder ON holder.user_id=a.user_id AND holder.tenant_id=o.tenant_id AND holder.is_active=true AND holder.deleted_at IS NULL
      WHERE o.tenant_id=$1 AND a.user_id=$2 AND (c.structure='PRINCIPAL_HOD' OR c.structure=o.kind||'_ONLY')`,
      [tenantId, userId],
    );
    const explicitDean = await this.db.query(
          `SELECT 1 FROM users u LEFT JOIN roles r ON r.role_id=u.role_id
      WHERE u.tenant_id=$1 AND u.user_id=$2 AND (r.role_name='Dean' OR EXISTS(SELECT 1 FROM schools s WHERE s.dean_user_id=u.user_id)
      OR EXISTS(SELECT 1 FROM department_leadership c WHERE c.tenant_id=u.tenant_id
        AND c.dean_enabled=true AND c.dean_user_id=u.user_id)
      OR EXISTS(SELECT 1 FROM hierarchy_assignments h WHERE h.tenant_id=u.tenant_id AND h.user_id=u.user_id AND upper(h.assignment_type)='DEAN'))`,
          [tenantId, userId],
        );
    return {
      managed: !!managed.length,
      offices,
      explicitDean: !!explicitDean.length,
      authRevision:session?.revision ?? 0,
    };
  }
}
