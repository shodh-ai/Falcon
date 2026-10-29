import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { createHash, randomUUID } from 'crypto';
import { requireDepartmentOffice } from '../department-leadership/office-scope';
import { AcademicSessionChangesService } from './academic-session-changes.service';
import {
  academicYearAt,
  listDepartmentFacultyWorkload,
  listDepartmentTimetable,
} from './department-academic-queries';

type Actor = { user_id: string; tenant_id?: string };
type Case = {
  case_id: string;
  dept_id: number;
  kind: 'FOLLOW_UP' | 'TIMETABLE';
  source_id?: string;
  title: string;
  reason: string;
  due_date?: string;
  recommendation?: string;
  status: string;
  revision: number;
  actor_id: string;
  office_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  note?: string;
  application_error?: string;
  decision?: 'APPROVE' | 'REJECT';
  sessions?: unknown[];
};
@Injectable()
export class PrincipalOversightService {
  constructor(
    private readonly db: DataSource,
    private readonly changes: AcademicSessionChangesService,
  ) {}
  private tenant(actor: Actor) {
    if (!actor.tenant_id || !actor.user_id) throw new ForbiddenException();
    return actor.tenant_id;
  }
  private text(value: unknown, label: string) {
    if (
      typeof value !== 'string' ||
      value.trim().length < 5 ||
      value.trim().length > 2000
    )
      throw new BadRequestException(`${label} must contain 5–2000 characters`);
    return value.trim();
  }
  private async office(
    m: Pick<EntityManager, 'query'>,
    actor: Actor,
    kind: 'PRINCIPAL' | 'HOD',
    dept?: string | number,
  ) {
    return requireDepartmentOffice(
      (sql, args) => m.query(sql, args),
      this.tenant(actor),
      actor.user_id,
      kind,
      dept,
    );
  }
  private async latest(
    m: Pick<EntityManager, 'query'>,
    tenant: string,
    id: string,
  ): Promise<Case | null> {
    const [row] = await m.query(
      `SELECT details FROM department_leadership_events WHERE tenant_id=$1
      AND action='PRINCIPAL_CASE' AND details->>'case_id'=$2 ORDER BY (details->>'revision')::int DESC LIMIT 1`,
      [tenant, id],
    );
    return row?.details ?? null;
  }
  private async append(
    m: EntityManager,
    actor: Actor,
    state: Case,
    key: string,
    fingerprint: string,
  ) {
    await m.query(
      `INSERT INTO department_leadership_events(tenant_id,dept_id,actor_user_id,action,details)
      VALUES($1,$2,$3,'PRINCIPAL_CASE',$4::jsonb)`,
      [
        actor.tenant_id,
        state.dept_id,
        actor.user_id,
        JSON.stringify({ ...state, idempotency_key: key, fingerprint }),
      ],
    );
    return state;
  }
  /** Existing append-only leadership audit is the canonical oversight case stream, not a duplicate academic request. */
  private async mutate(
    actor: Actor,
    id: string,
    key: string,
    command: object,
    work: (m: EntityManager, state: Case | null) => Promise<Case>,
  ) {
    if (
      !/^[0-9a-f-]{36}$/i.test(id) ||
      !/^[A-Za-z0-9_-]{16,100}$/.test(key ?? '')
    )
      throw new BadRequestException(
        'Valid case ID and Idempotency-Key (16–100 characters) required',
      );
    const tenant = this.tenant(actor);
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(command))
      .digest('hex');
    return this.db.transaction(async (m) => {
      await m.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `principal-case:${tenant}:${id}`,
      ]);
      // Authorization is checked before replay, so a transferred office cannot replay its old session.
      const prior = await this.latest(m, tenant, id);
      const kind = (command as { role: 'HOD' | 'PRINCIPAL' }).role;
      await this.office(
        m,
        actor,
        kind,
        prior?.dept_id ?? (command as { dept?: string }).dept,
      );
      const [replay] = await m.query(
        `SELECT details FROM department_leadership_events WHERE tenant_id=$1 AND actor_user_id=$2
        AND action='PRINCIPAL_CASE' AND details->>'case_id'=$3 AND details->>'idempotency_key'=$4 LIMIT 1`,
        [tenant, actor.user_id, id, key],
      );
      if (replay) {
        if (replay.details.fingerprint !== fingerprint)
          throw new ConflictException(
            'Idempotency key reused with a different command',
          );
        return replay.details as Case;
      }
      const state = await work(m, prior);
      return this.append(m, actor, state, key, fingerprint);
    });
  }
  async list(actor: Actor, role: 'PRINCIPAL' | 'HOD', selected?: string) {
    const office = await this.office(this.db, actor, role, selected);
    const rows = await this.db.query(
      `SELECT details,COUNT(*) OVER()::int AS total,
        COUNT(*) FILTER(WHERE details->>'status'='PENDING_PRINCIPAL') OVER()::int AS pending_principal,
        COUNT(*) FILTER(WHERE details->>'status'='APPLICATION_FAILED') OVER()::int AS failed_applications,
        COUNT(*) FILTER(WHERE details->>'kind'='FOLLOW_UP' AND details->>'status'<>'CLOSED') OVER()::int AS open_followups
        FROM (
      SELECT DISTINCT ON (details->>'case_id') details FROM department_leadership_events
      WHERE tenant_id=$1 AND dept_id=$2 AND action='PRINCIPAL_CASE'
      ORDER BY details->>'case_id',(details->>'revision')::int DESC
    ) latest ORDER BY details->>'updated_at' DESC LIMIT 250`,
      [actor.tenant_id, office.dept_id],
    );
    return { office, cases: rows.map((r: { details: Case }) => r.details), totals: {total:rows[0]?.total??0,pending_principal:rows[0]?.pending_principal??0,failed_applications:rows[0]?.failed_applications??0,open_followups:rows[0]?.open_followups??0} };
  }
  async detail(actor: Actor, role: 'PRINCIPAL' | 'HOD', id: string) {
    const state = await this.latest(this.db, this.tenant(actor), id);
    if (!state) throw new NotFoundException('Case not found');
    await this.office(this.db, actor, role, state.dept_id);
    const history = await this.db.query(
      `SELECT e.details->>'status' AS status,e.details->>'note' AS note,
      e.details->>'updated_at' AS updated_at,u.name AS actor_name FROM department_leadership_events e
      JOIN users u ON u.user_id=e.actor_user_id AND u.tenant_id=e.tenant_id
      WHERE e.tenant_id=$1 AND e.dept_id=$2 AND e.action='PRINCIPAL_CASE' AND e.details->>'case_id'=$3
      ORDER BY (e.details->>'revision')::int`,
      [actor.tenant_id, state.dept_id, id],
    );
    const sessions =
      state.kind !== 'TIMETABLE'
        ? []
        : await this.db.query(
            `SELECT c.course_code,u.name AS faculty_name,m.source_date::text,
      m.target_date::text,m.target_start_time,m.target_end_time,m.target_room,m.status,t.section
      FROM academic_class_moves m JOIN academic_courses c ON c.course_id=m.course_id AND c.tenant_id=m.tenant_id
      JOIN users u ON u.user_id=m.original_faculty_id AND u.tenant_id=m.tenant_id
      JOIN academic_timetables t ON t.timetable_id=m.source_timetable_id AND t.tenant_id=m.tenant_id
      WHERE m.tenant_id=$1 AND m.change_group_id=$2::uuid AND u.dept_id=$3 ORDER BY m.move_id`,
            [actor.tenant_id, state.source_id, state.dept_id],
          );
    return { state, history, sessions };
  }
  async create(
    actor: Actor,
    role: 'PRINCIPAL' | 'HOD',
    input: {
      kind: 'FOLLOW_UP' | 'TIMETABLE';
      source_id?: string;
      title: string;
      reason: string;
      due_date?: string;
    },
    key: string,
    selected?: string,
  ) {
    if (
      (role === 'PRINCIPAL' && input.kind !== 'FOLLOW_UP') ||
      (role === 'HOD' && input.kind !== 'TIMETABLE')
    )
      throw new ForbiddenException(
        'HOD escalates timetable requests; Principal assigns follow-ups',
      );
    // Stable source identity prevents two active decision owners for a timetable request.
    const id = input.kind === 'TIMETABLE' ? input.source_id! : key;
    const caseId =
      input.kind === 'TIMETABLE'
        ? id
        : /^[0-9a-f-]{36}$/i.test(key)
          ? key
          : randomUUID();
    if (input.kind === 'FOLLOW_UP' && caseId !== key)
      throw new BadRequestException(
        'Use a UUID idempotency key for a follow-up',
      );
    return this.mutate(
      actor,
      caseId,
      key,
      { ...input, role, dept: selected },
      async (m, old) => {
        if (old)
          throw new ConflictException(
            'Case already exists; refresh and use its current revision',
          );
        const office = await this.office(m, actor, role, selected);
        const title = this.text(input.title, 'Title'),
          reason = this.text(input.reason, 'Reason');
        if (input.kind === 'TIMETABLE') {
          await m.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
            `reserved-move:${actor.tenant_id}:${id}`,
          ]);
          // The source record remains authoritative; all legs must be in the HOD's department.
          const rows = await m.query(
            `SELECT m.*,u.dept_id,c.course_code FROM academic_class_moves m
          JOIN users u ON u.user_id=m.original_faculty_id AND u.tenant_id=m.tenant_id
          JOIN academic_courses c ON c.course_id=m.course_id AND c.tenant_id=m.tenant_id
          WHERE m.tenant_id=$1 AND m.change_group_id=$2::uuid ORDER BY m.move_id FOR UPDATE OF m`,
            [actor.tenant_id, id],
          );
          if (!rows.length)
            throw new NotFoundException('Timetable request not found');
          if (rows.some((r) => Number(r.dept_id) !== Number(office.dept_id)))
            throw new ForbiddenException(
              'Cross-department escalation is not permitted',
            );
          if (rows.some((r) => r.status !== 'PENDING_HOD_APPROVAL'))
            throw new ConflictException(
              'Only a pending HOD request can be escalated',
            );
          if (rows.some((r) => r.requested_by_user_id === actor.user_id))
            throw new ForbiddenException(
              'The proposer cannot recommend their own request',
            );
          await this.office(m, actor, 'HOD', office.dept_id);
          const [principal] = await m.query(
            `SELECT a.user_id FROM department_offices o JOIN department_office_appointments a ON a.office_id=o.office_id AND a.valid_to IS NULL AND a.valid_from<=now()
          JOIN users u ON u.user_id=a.user_id AND u.tenant_id=o.tenant_id AND u.dept_id=o.dept_id AND u.is_active=true AND u.deleted_at IS NULL
          WHERE o.tenant_id=$1 AND o.dept_id=$2 AND o.kind='PRINCIPAL'`,
            [actor.tenant_id, office.dept_id],
          );
          if (!principal)
            throw new ConflictException('Assign a Principal before escalating');
        } else if (
          !/^\d{4}-\d{2}-\d{2}$/.test(input.due_date ?? '') ||
          Number.isNaN(Date.parse(input.due_date!)) ||
          new Date(input.due_date!).toISOString().slice(0, 10) !==
            input.due_date
        )
          throw new BadRequestException('A valid due date is required');
        if (input.kind === 'FOLLOW_UP') {
          const holders = await m.query(
            `SELECT 1 FROM department_offices o JOIN department_leadership c ON c.tenant_id=o.tenant_id AND c.dept_id=o.dept_id AND c.structure='PRINCIPAL_HOD'
          JOIN department_office_appointments a ON a.office_id=o.office_id AND a.valid_to IS NULL AND a.valid_from<=now()
          JOIN users u ON u.user_id=a.user_id AND u.tenant_id=o.tenant_id AND u.dept_id=o.dept_id AND u.is_active=true AND u.deleted_at IS NULL
          WHERE o.tenant_id=$1 AND o.dept_id=$2 AND o.kind='HOD'`,
            [actor.tenant_id, office.dept_id],
          );
          if (!holders.length)
            throw new ConflictException(
              'Assign an active HOD before assigning a follow-up',
            );
        }
        const now = new Date().toISOString();
        return {
          case_id: caseId,
          dept_id: Number(office.dept_id),
          kind: input.kind,
          source_id: input.source_id,
          title,
          reason,
          due_date: input.due_date,
          status:
            input.kind === 'TIMETABLE' ? 'PENDING_PRINCIPAL' : 'PENDING_HOD',
          revision: 1,
          actor_id: actor.user_id,
          office_id: office.office_id,
          created_by: actor.user_id,
          created_at: now,
          updated_at: now,
        };
      },
    );
  }
  async act(
    actor: Actor,
    role: 'PRINCIPAL' | 'HOD',
    id: string,
    expected: number,
    input: { action: string; note: string },
    key: string,
  ) {
    let applied: any;
    const result = await this.mutate(
      actor,
      id,
      key,
      { ...input, role, expected },
      async (m, state) => {
        if (!state) throw new NotFoundException('Case not found');
        if (state.revision !== expected)
          throw new ConflictException('Case changed; refresh before deciding');
        const office = await this.office(m, actor, role, state.dept_id);
        const note = this.text(input.note, 'Decision or response');
        const next = {
          ...state,
          revision: state.revision + 1,
          actor_id: actor.user_id,
          office_id: office.office_id,
          note,
          updated_at: new Date().toISOString(),
        };
        if (state.kind === 'FOLLOW_UP') {
        if(role==='PRINCIPAL' && state.status==='PENDING_PRINCIPAL' && state.actor_id===actor.user_id) throw new ForbiddenException('A different officeholder must review the response');
          if (
            role === 'HOD' &&
            ['PENDING_HOD', 'RETURNED'].includes(state.status) &&
            input.action === 'RESPOND'
          ) {
            next.status = 'PENDING_PRINCIPAL';
            next.recommendation = note;
          } else if (
            role === 'PRINCIPAL' &&
            state.status === 'PENDING_PRINCIPAL' &&
            ['CLOSE', 'RETURN'].includes(input.action)
          )
            next.status = input.action === 'CLOSE' ? 'CLOSED' : 'RETURNED';
          else
            throw new ConflictException(
              'This follow-up is not waiting for this action',
            );
        } else {
          if (
            role === 'HOD' &&
            state.status === 'RETURNED' &&
            input.action === 'RESUBMIT'
          ) {
            const rows = await m.query(
              `SELECT m.status,u.dept_id,m.requested_by_user_id FROM academic_class_moves m
            JOIN users u ON u.user_id=m.original_faculty_id AND u.tenant_id=m.tenant_id
            WHERE m.tenant_id=$1 AND m.change_group_id=$2::uuid FOR UPDATE OF m`,
              [actor.tenant_id, state.source_id],
            );
            if (
              !rows.length ||
              rows.some((r) => r.status !== 'PENDING_HOD_APPROVAL')
            )
              throw new ConflictException(
                'Source request is no longer pending',
              );
            if (
              rows.some(
                (r) =>
                  Number(r.dept_id) !== state.dept_id ||
                  r.requested_by_user_id === actor.user_id,
              )
            )
              throw new ForbiddenException(
                'Department recommendation required',
              );
            next.status = 'PENDING_PRINCIPAL';
            next.recommendation = note;
            return next;
          }
          if (role !== 'PRINCIPAL')
            throw new ForbiddenException(
              'Reserved decisions belong to the Principal',
            );
          if (state.created_by === actor.user_id)
            throw new ForbiddenException('No self-approval');
          if (
            state.status === 'PENDING_PRINCIPAL' &&
            input.action === 'RETURN'
          ) {
            next.status = 'RETURNED';
            return next;
          }
          const retry =
            state.status === 'APPLICATION_FAILED' && input.action === 'RETRY';
          if (
            !retry &&
            !(
              state.status === 'PENDING_PRINCIPAL' &&
              ['APPROVE', 'REJECT'].includes(input.action)
            )
          )
            throw new ConflictException(
              'Case is not waiting for this decision',
            );
          // Persist approval evidence even if applying the canonical source fails.
          next.decision = retry
            ? state.decision
            : (input.action as 'APPROVE' | 'REJECT');
          next.status = 'APPROVED';
          await this.append(m, actor, next, `${key}_decision`, 'decision');
          await m.query('SAVEPOINT principal_application');
          try {
            applied = await this.changes.decideInTransaction(
              m,
              actor.user_id,
              this.tenant(actor),
              state.source_id!,
              next.decision === 'REJECT' ? 'REJECT' : 'APPROVE',
              id,
            );
            next.status = next.decision === 'REJECT' ? 'REJECTED' : 'APPLIED';
            delete next.application_error;
            await m.query('RELEASE SAVEPOINT principal_application');
          } catch (e) {
            await m.query('ROLLBACK TO SAVEPOINT principal_application');
            next.status = 'APPLICATION_FAILED';
            next.application_error =
              e instanceof BadRequestException ||
              e instanceof ConflictException ||
              e instanceof ForbiddenException
                ? e.message
                : 'Application failed. No timetable changes committed; operations review required.';
            applied = undefined;
          }
          next.revision++;
        }
        return next;
      },
    );
    if (applied) {
      try {
        await this.changes.notifyDecision(this.tenant(actor), applied);
      } catch {
        // Canonical application remains successful; delivery failure is independently auditable.
        await this.db.query(
          `INSERT INTO department_leadership_events(tenant_id,dept_id,actor_user_id,action,details) VALUES($1,$2,$3,'PRINCIPAL_NOTIFICATION_FAILED',$4::jsonb)`,
          [
            actor.tenant_id,
            result.dept_id,
            actor.user_id,
            JSON.stringify({ case_id: id, revision: result.revision }),
          ],
        );
      }
    }
    return result;
  }
  async hodAvailability(actor: Actor) {
    const rows = await this.db.query(
      `SELECT 1 FROM department_offices o
      JOIN department_leadership c ON c.tenant_id=o.tenant_id AND c.dept_id=o.dept_id AND c.structure='PRINCIPAL_HOD'
      JOIN department_office_appointments a ON a.office_id=o.office_id AND a.valid_to IS NULL AND a.valid_from<=now()
      JOIN users u ON u.user_id=a.user_id AND u.tenant_id=o.tenant_id AND u.dept_id=o.dept_id AND u.is_active=true AND u.deleted_at IS NULL
      WHERE o.tenant_id=$1 AND a.user_id=$2 AND o.kind='HOD'`,
      [this.tenant(actor), actor.user_id],
    );
    return { enabled: rows.length > 0 };
  }
  async overview(actor: Actor, selected?: string) {
    const office = await this.office(this.db, actor, 'PRINCIPAL', selected),
      tenant = this.tenant(actor),
      year = academicYearAt();
    const query = (sql: string, args: unknown[]) => this.db.query(sql, args);
    const [
      workload,
      timetable,
      cases,
      attendance,
      audit,
      syllabus,
      publishedMarks,
      iqac,
    ] = await Promise.all([
      listDepartmentFacultyWorkload(query, tenant, [office.dept_id], year),
      listDepartmentTimetable(query, tenant, [office.dept_id], year),
      this.list(actor, 'PRINCIPAL', String(office.dept_id)),
      this.db.query(
        `SELECT c.course_code,c.course_name,COUNT(*)::int AS recorded_sessions,MAX(l.date)::text AS last_recorded
        FROM course_attendance_logs l JOIN users u ON u.user_id=l.faculty_user_id AND u.tenant_id=l.tenant_id
        JOIN academic_courses c ON c.course_id=l.course_id AND c.tenant_id=l.tenant_id
        WHERE l.tenant_id=$1 AND u.dept_id=$2 AND l.deleted_at IS NULL AND l.date>=($3||'-07-01')::date
          AND l.date<($4||'-07-01')::date GROUP BY c.course_id,c.course_code,c.course_name ORDER BY c.course_code`,
        [tenant, office.dept_id, year.slice(0, 4), year.slice(5)],
      ),
      this.db.query(
        `SELECT e.event_id,e.action,e.created_at,u.name AS actor_name,e.details FROM department_leadership_events e
        JOIN users u ON u.user_id=e.actor_user_id AND u.tenant_id=e.tenant_id
        WHERE e.tenant_id=$1 AND e.dept_id=$2 AND e.action IN ('PRINCIPAL_CASE','PRINCIPAL_NOTIFICATION_FAILED')
        ORDER BY e.created_at DESC,e.event_id LIMIT 100`,
        [tenant, office.dept_id],
      ),
      this.db.query(
        `SELECT c.course_code,c.course_name,COUNT(*)::int AS units,
        COUNT(*) FILTER(WHERE m.status='COMPLETED')::int AS completed_units
        FROM course_modules m JOIN academic_courses c ON c.course_id=m.course_id AND c.tenant_id=m.tenant_id
        JOIN users u ON u.user_id=m.faculty_user_id AND u.tenant_id=m.tenant_id
        WHERE m.tenant_id=$1 AND u.dept_id=$2 AND m.deleted_at IS NULL AND c.deleted_at IS NULL
          AND EXISTS(SELECT 1 FROM academic_course_allocations a WHERE a.tenant_id=m.tenant_id AND a.course_id=m.course_id
            AND a.faculty_user_id=m.faculty_user_id AND a.academic_year=$3 AND a.status='ACTIVE')
        GROUP BY c.course_id,c.course_code,c.course_name ORDER BY c.course_code`,
        [tenant, office.dept_id, year],
      ),
      this.db.query(
        `SELECT c.course_code,COUNT(*)::int AS published_mark_records FROM academic_marks m
        JOIN academic_courses c ON c.course_id=m.course_id AND c.tenant_id=m.tenant_id
        JOIN users student ON student.user_id=m.student_user_id AND student.tenant_id=m.tenant_id
        WHERE m.tenant_id=$1 AND student.dept_id=$2 AND student.deleted_at IS NULL AND m.status='PUBLISHED'
          AND c.deleted_at IS NULL AND EXISTS(SELECT 1 FROM academic_course_allocations a
            JOIN users teacher ON teacher.user_id=a.faculty_user_id AND teacher.tenant_id=a.tenant_id
            WHERE a.tenant_id=m.tenant_id AND a.course_id=m.course_id AND a.academic_year=$3 AND a.status='ACTIVE' AND teacher.dept_id=$2)
        GROUP BY c.course_id,c.course_code ORDER BY c.course_code`,
        [tenant, office.dept_id, year],
      ),
      this.db.query(
        `SELECT ta.status,COUNT(*)::int AS assignments FROM task_assignments ta
        JOIN users u ON u.user_id=ta.assigned_to AND u.tenant_id=ta.tenant_id
        WHERE ta.tenant_id=$1 AND COALESCE(ta.dept_id,u.dept_id)=$2 AND ta.deleted_at IS NULL
          AND ta.assigned_at>=($3||'-07-01')::date AND ta.assigned_at<($4||'-07-01')::date
        GROUP BY ta.status ORDER BY ta.status`,
        [tenant, office.dept_id, year.slice(0, 4), year.slice(5)],
      ),
    ]);
    return {
      office,
      academic_year: year,
      workload,
      timetable,
      cases: cases.cases,
      totals:cases.totals,
      attendance,
      audit,
      syllabus,
      publishedMarks,
      iqac,
    };
  }
}
