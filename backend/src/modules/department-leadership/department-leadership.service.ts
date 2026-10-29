import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
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
    return this.transaction(async (m) => {
      await m.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `${actor.tenant_id}:${deptId}:leadership`,
      ]);
      const [old] = await m.query(
        'SELECT * FROM department_leadership WHERE tenant_id=$1 AND dept_id=$2 FOR UPDATE',
        [actor.tenant_id, deptId],
      );
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
      LEFT JOIN users u ON u.user_id=a.user_id AND u.tenant_id=o.tenant_id AND u.dept_id=o.dept_id AND u.deleted_at IS NULL
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
      JOIN users holder ON holder.user_id=a.user_id AND holder.tenant_id=o.tenant_id AND holder.dept_id=o.dept_id AND holder.is_active=true AND holder.deleted_at IS NULL
      WHERE o.tenant_id=$1 AND a.user_id=$2 AND (c.structure='PRINCIPAL_HOD' OR c.structure=o.kind||'_ONLY')`,
      [tenantId, userId],
    );
    const explicitDean = managed.length
      ? await this.db.query(
          `SELECT 1 FROM users u LEFT JOIN roles r ON r.role_id=u.role_id
      WHERE u.tenant_id=$1 AND u.user_id=$2 AND (r.role_name='Dean' OR EXISTS(SELECT 1 FROM schools s WHERE s.dean_user_id=u.user_id)
      OR EXISTS(SELECT 1 FROM hierarchy_assignments h WHERE h.tenant_id=u.tenant_id AND h.user_id=u.user_id AND upper(h.assignment_type)='DEAN'))`,
          [tenantId, userId],
        )
      : [];
    return {
      managed: !!managed.length,
      offices,
      explicitDean: !!explicitDean.length,
      authRevision:session?.revision ?? 0,
    };
  }
}
