import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, EntityManager } from 'typeorm';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { NotificationEvents } from '../../core/notifications/notification.events';
import { FacultyWorkspacesService } from '../academics/faculty-workspaces.service';
import { FacultyTeachingDepartmentsService } from '../academics/faculty-teaching-departments.service';
import { DeanAuditService } from '../academics/dean-audit.service';
import { ExamCellAuditService } from './exam-cell-audit.service';
import { ResultControlService } from './result-control.service';

/**
 * Opt-in REAL PostgreSQL tests. No schema synchronization, migration, reset or
 * production configuration is loaded here. The root test runner must provision
 * and migrate a fresh, dedicated container before enabling this suite.
 *
 * FALCON_TEST_DB=1 TEST_DATABASE_URL=postgres://...@127.0.0.1:55432/falcon_examcell_test
 * Database COMMENT must equal DATABASE_MARKER below. Only test-created UUID
 * tenants/rows are cleaned up. Notification listeners are isolated in-process:
 * no email, queue, websocket, application listener or external transport starts.
 */
const DATABASE_MARKER = 'falcon-examcell-disposable-integration-20261021';
const enabled = process.env.FALCON_TEST_DB === '1';
const integration = enabled ? describe : describe.skip;
type Row = Record<string, unknown>;
type AuditPayload = Parameters<ExamCellAuditService['log']>[2];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function bounded<T>(
  promise: Promise<T>,
  message: string,
  milliseconds = 10000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Calls real audit SQL, then pauses the owning transaction for lock observation. */
class PausingAudit extends ExamCellAuditService {
  readonly reached = deferred<number>();
  private readonly releaseGate = deferred<void>();
  private paused = false;
  constructor(
    db: DataSource,
    private readonly pauseAction: string,
  ) {
    super(db);
  }
  release() {
    this.releaseGate.resolve();
  }
  override async log(
    tenant: string,
    actor: string | undefined,
    payload: AuditPayload,
    manager?: EntityManager,
  ) {
    await super.log(tenant, actor, payload, manager);
    if (manager && payload.action === this.pauseAction && !this.paused) {
      this.paused = true;
      const [row] = await manager.query<Array<{ pid: number }>>(
        'SELECT pg_backend_pid() AS pid',
      );
      this.reached.resolve(row.pid);
      await bounded(
        this.releaseGate.promise,
        'Test barrier was not released',
        15000,
      );
    }
  }
}

/** Real PostgreSQL error, inside the same manager/transaction, not a mocked query. */
class FailingAudit extends ExamCellAuditService {
  constructor(
    db: DataSource,
    private readonly failAction: string,
  ) {
    super(db);
  }
  override async log(
    tenant: string,
    actor: string | undefined,
    payload: AuditPayload,
    manager?: EntityManager,
  ) {
    await super.log(tenant, actor, payload, manager);
    if (manager && payload.action === this.failAction) {
      await manager.query('SELECT 1 / 0 AS exam_test_injected_audit_failure');
    }
  }
}

type Fixture = {
  tenant: string;
  course: string;
  students: string[];
  faculty: string;
  dean: string;
  outsider: string;
  officer: string;
  department?: number;
  policy?: number;
  session?: string;
  request?: string;
};

integration(
  'isolated PostgreSQL result approval, concurrency and rollback',
  () => {
    jest.setTimeout(45000);
    let primary: DataSource;
    let competing: DataSource;
    let observer: DataSource;
    let url: string;
    const run = randomUUID().replaceAll('-', '');
    const fixtures: Fixture[] = [];
    const createdRoles: number[] = [];
    const sources: DataSource[] = [];
    const events = new EventEmitter2();
    const notify = new NotificationEmitterService(events);
    const publications: Row[] = [];
    const commitVisibility: Array<Promise<Row[]>> = [];

    function resultService(
      db = primary,
      audit: ExamCellAuditService = new ExamCellAuditService(db),
    ) {
      return new ResultControlService(db, notify, audit);
    }

    function facultyService(db = primary) {
      return new FacultyWorkspacesService(
        db,
        notify,
        new FacultyTeachingDepartmentsService(db),
        new DeanAuditService(db),
      );
    }

    beforeAll(async () => {
      if (process.env.FALCON_RESET_DB === '1')
        throw new Error('Refusing reset-enabled test environment');
      const supplied = process.env.TEST_DATABASE_URL;
      if (!supplied)
        throw new Error(
          'TEST_DATABASE_URL is required for opt-in PostgreSQL tests',
        );
      const parsed = new URL(supplied);
      if (
        !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
        parsed.hostname !== '127.0.0.1' ||
        parsed.port !== '55432' ||
        parsed.pathname !== '/falcon_examcell_test' ||
        parsed.search ||
        parsed.hash
      ) {
        throw new Error(
          'Refusing database other than dedicated 127.0.0.1:55432/falcon_examcell_test',
        );
      }
      url = supplied;
      async function connect(name: string) {
        const source = new DataSource({
          type: 'postgres',
          url,
          synchronize: false,
          migrationsRun: false,
          logging: false,
          entities: [],
          extra: {
            max: 4,
            application_name: `exam-it-${run}-${name}`,
            statement_timeout: 20000,
          },
        });
        sources.push(source);
        await source.initialize();
        return source;
      }
      // Read-only identity check happens before any test fixture/database write.
      observer = await connect('observer');
      const [identity] = await observer.query<
        Array<{ name: string; marker: string; version: string }>
      >(
        `SELECT current_database() AS name,
        shobj_description(oid, 'pg_database') AS marker,
        current_setting('server_version') AS version
       FROM pg_database WHERE datname = current_database()`,
      );
      if (
        identity?.name !== 'falcon_examcell_test' ||
        identity.marker !== DATABASE_MARKER
      ) {
        throw new Error(
          'Refusing database without the disposable integration-test identity marker',
        );
      }
      primary = await connect('primary');
      competing = await connect('competing');
      events.on(NotificationEvents.EXAM_RESULTS_PUBLISHED, (payload: Row) => {
        publications.push(payload);
        // Independent connection must already see the committed session and audit.
        commitVisibility.push(
          observer.query(
            `SELECT s.declared_at, EXISTS(SELECT 1 FROM exam_audit_logs a
           WHERE a.tenant_id=s.tenant_id AND a.resource_id=s.session_id::text
             AND a.action='RESULT_DECLARED') AS audit_committed
         FROM exam_result_sessions s WHERE s.tenant_id=$1 AND s.session_id=$2`,
            [payload.tenantId, String(payload.actionLink).split('report=')[1]],
          ),
        );
      });
    });

    afterAll(async () => {
      events.removeAllListeners();
      const observed = await Promise.allSettled(commitVisibility);
      try {
        // Each WHERE value comes only from UUID fixtures inserted by this suite.
        if (primary?.isInitialized) {
          for (const fixture of fixtures.reverse()) {
            await primary.transaction(async (manager) => {
              for (const table of [
                'exam_result_dean_approval_history',
                'exam_result_dean_approval_requests',
                'student_exam_reports',
                'academic_exam_results',
                'exam_audit_logs',
                'exam_result_sessions',
                'academic_marks',
                'student_course_enrollments',
                'academic_timetables',
                'academic_courses',
                'users',
              ]) {
                await manager.query(`DELETE FROM ${table} WHERE tenant_id=$1`, [
                  fixture.tenant,
                ]);
              }
              await manager.query('DELETE FROM tenants WHERE tenant_id=$1', [
                fixture.tenant,
              ]);
              if (fixture.policy)
                await manager.query(
                  'DELETE FROM academic_grading_policies WHERE policy_id=$1',
                  [fixture.policy],
                );
              if (fixture.department)
                await manager.query(
                  'DELETE FROM departments WHERE dept_id=$1',
                  [fixture.department],
                );
            });
          }
          for (const role of createdRoles)
            await primary.query('DELETE FROM roles WHERE role_id=$1', [role]);
        }
      } finally {
        for (const source of sources.reverse())
          if (source.isInitialized) await source.destroy();
      }
      const failures = observed.filter(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected',
      );
      if (failures.length) {
        throw new AggregateError(
          failures.map((result) => result.reason),
          'Post-commit visibility observation failed',
        );
      }
    });

    async function role(name: string) {
      const [existing] = await primary.query<Array<{ role_id: number }>>(
        'SELECT role_id FROM roles WHERE role_name=$1',
        [name],
      );
      if (existing) return existing.role_id;
      const [created] = await primary.query<Array<{ role_id: number }>>(
        'INSERT INTO roles(role_name) VALUES($1) RETURNING role_id',
        [name],
      );
      createdRoles.push(created.role_id);
      return created.role_id;
    }

    async function fixture(
      approved = true,
      sessionSemester = 4,
    ): Promise<Fixture> {
      const f: Fixture = {
        tenant: randomUUID(),
        course: randomUUID(),
        students: [randomUUID(), randomUUID()],
        faculty: randomUUID(),
        dean: randomUUID(),
        outsider: randomUUID(),
        officer: randomUUID(),
      };
      fixtures.push(f);
      await primary.query(
        `INSERT INTO tenants(tenant_id,name,subdomain,pg_schema)
      VALUES($1,$2,$3,'public')`,
        [f.tenant, `Disposable examination test ${run}`, `test-${f.tenant}`],
      );
      const [department] = await primary.query<Array<{ dept_id: number }>>(
        'INSERT INTO departments(dept_name) VALUES($1) RETURNING dept_id',
        [`Exam IT ${f.tenant}`],
      );
      f.department = department.dept_id;
      const actors: Array<[string, string, number | null]> = [
        [f.officer, 'ExamCell', f.department],
        [f.dean, 'Dean', f.department],
        [f.faculty, 'Faculty', f.department],
        [f.outsider, 'Dean', null],
        ...f.students.map((id): [string, string, null] => [
          id,
          'Student',
          null,
        ]),
      ];
      for (const [id, name, dept] of actors) {
        await primary.query(
          `INSERT INTO users(user_id,tenant_id,name,official_email,role_id,dept_id)
        VALUES($1,$2,$3,$4,$5,$6)`,
          [
            id,
            f.tenant,
            `Disposable ${name}`,
            `${id}@example.invalid`,
            await role(name),
            dept,
          ],
        );
      }
      await primary.query(
        `INSERT INTO academic_courses(course_id,tenant_id,course_code,course_name,credits)
      VALUES($1,$2,$3,'Disposable result concurrency test',4)`,
        [f.course, f.tenant, `IT-${f.course}`],
      );
      await primary.query(
        `INSERT INTO academic_timetables(tenant_id,course_id,faculty_user_id,day_of_week,start_time,end_time)
      VALUES($1,$2,$3,1,'09:00','10:00')`,
        [f.tenant, f.course, f.faculty],
      );
      for (const student of f.students)
        await primary.query(
          `INSERT INTO student_course_enrollments
      (tenant_id,student_user_id,course_id,semester,status) VALUES($1,$2,$3,4,'ENROLLED')`,
          [f.tenant, student, f.course],
        );
      const [policy] = await primary.query<Array<{ policy_id: number }>>(
        `INSERT INTO academic_grading_policies
      (policy_name,effective_from,rules) VALUES($1,CURRENT_DATE,'{}'::jsonb) RETURNING policy_id`,
        [`Exam IT ${f.tenant}`],
      );
      f.policy = policy.policy_id;
      const service = resultService();
      const session = await service.createSession(
        f.tenant,
        {
          course_id: f.course,
          exam_type: 'END_TERM',
          semester: sessionSemester,
          max_marks: 100,
          pass_marks: 40,
          grading_policy_id: f.policy,
        },
        f.officer,
      );
      f.session = session.session_id as string;
      await service.openEntry(f.tenant, f.session, {}, f.officer);
      await save(f, 80);
      await facultyService().publishMarks(
        f.faculty,
        f.tenant,
        f.course,
        'END_TERM',
      );
      await service.prepareForDeclaration(f.tenant, f.session, f.officer);
      if (approved) await approve(f);
      return f;
    }

    async function save(
      f: Fixture,
      marks: number,
      actor = f.faculty,
      db = primary,
    ) {
      return facultyService(db).saveMarksDraft(actor, f.tenant, {
        course_id: f.course,
        exam_type: 'END_TERM',
        max_marks: 100,
        entries: f.students.map((id) => ({
          student_user_id: id,
          marks_obtained: marks,
        })),
      });
    }

    async function approve(f: Fixture, service = resultService()) {
      expect(
        await service.runFormulaAudit(f.tenant, f.session!, f.officer),
      ).toMatchObject({ status: 'passed' });
      const request = await service.requestDeanApproval(
        f.tenant,
        f.session!,
        f.officer,
      );
      f.request = request.request_id as string;
      expect(
        await service.decideDeanResultApproval(
          f.tenant,
          f.dean,
          f.request,
          'APPROVED',
          'Disposable QA approval',
          'Dean',
        ),
      ).toMatchObject({ status: 'APPROVED' });
    }

    function declare(f: Fixture, service = resultService()) {
      return service.declareSession(f.tenant, f.session!, f.officer, {});
    }

    async function snapshot(f: Fixture) {
      return {
        sessions: await observer.query(
          'SELECT * FROM exam_result_sessions WHERE tenant_id=$1 ORDER BY session_id',
          [f.tenant],
        ),
        marks: await observer.query(
          'SELECT * FROM academic_marks WHERE tenant_id=$1 ORDER BY mark_id',
          [f.tenant],
        ),
        reports: await observer.query(
          'SELECT * FROM student_exam_reports WHERE tenant_id=$1 ORDER BY report_id',
          [f.tenant],
        ),
        mirror: await observer.query(
          'SELECT * FROM academic_exam_results WHERE tenant_id=$1 ORDER BY result_id',
          [f.tenant],
        ),
        enrollments: await observer.query(
          'SELECT * FROM student_course_enrollments WHERE tenant_id=$1 ORDER BY enrollment_id',
          [f.tenant],
        ),
        approvals: await observer.query(
          'SELECT * FROM exam_result_dean_approval_requests WHERE tenant_id=$1 ORDER BY request_id',
          [f.tenant],
        ),
        history: await observer.query(
          'SELECT * FROM exam_result_dean_approval_history WHERE tenant_id=$1 ORDER BY history_id',
          [f.tenant],
        ),
      };
    }

    async function auditActions(f: Fixture) {
      return (
        await observer.query<Array<{ action: string }>>(
          'SELECT action FROM exam_audit_logs WHERE tenant_id=$1 ORDER BY created_at,audit_id',
          [f.tenant],
        )
      ).map((row) => row.action);
    }

    async function expectPublished(f: Fixture, mark = 80) {
      const state = await snapshot(f);
      expect(state.sessions).toHaveLength(1);
      expect(state.sessions[0]).toMatchObject({
        entry_status: 'LOCKED',
        marks_locked: true,
        declared_at: expect.any(Date),
      });
      expect(state.marks).toHaveLength(2);
      for (const row of state.marks)
        expect(row).toMatchObject({
          status: 'PUBLISHED',
          marks_obtained: mark.toFixed(2),
        });
      for (const table of [state.reports, state.mirror]) {
        expect(table).toHaveLength(2);
        for (const row of table)
          expect(row).toMatchObject({ marks_obtained: mark.toFixed(2) });
      }
      for (const row of state.enrollments)
        expect(row).toMatchObject({ status: 'COMPLETED' });
      expect(
        (await auditActions(f)).filter(
          (action) => action === 'RESULT_DECLARED',
        ),
      ).toHaveLength(1);
      expect(
        publications.filter((event) => event.tenantId === f.tenant),
      ).toHaveLength(2);
      const visible = await Promise.all(commitVisibility);
      for (const rows of visible)
        expect(rows[0]).toMatchObject({
          declared_at: expect.any(Date),
          audit_committed: true,
        });
    }

    async function observeBlocked(
      blocker: number,
      lock: 'advisory' | 'enrollment' = 'advisory',
    ) {
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        const rows = await observer.query<
          Array<{
            pid: number;
            wait_event_type: string;
            wait_event: string;
            query: string;
            blockers: number[];
          }>
        >(
          `SELECT pid,wait_event_type,wait_event,query,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
         WHERE application_name=$1 AND $2::int=ANY(pg_blocking_pids(pid))`,
          [`exam-it-${run}-competing`, blocker],
        );
        if (rows.length) {
          expect(rows[0].pid).not.toBe(blocker);
          expect(rows[0].wait_event_type).toBe('Lock');
          if (lock === 'advisory') {
            expect(rows[0].wait_event).toBe('advisory');
            expect(rows[0].query).toContain('pg_advisory_xact_lock');
          } else {
            expect(['transactionid', 'tuple']).toContain(rows[0].wait_event);
            expect(rows[0].query).toContain('student_course_enrollments');
          }
          expect(rows[0].blockers).toContain(blocker);
          return;
        }
        // Polling interval is not evidence; only PostgreSQL's blocking graph passes.
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error(
        'PostgreSQL did not report the competing connection blocked on the owning transaction',
      );
    }

    it('schema: migrated PostgreSQL has the nonpartial unique keys required by the session/report upserts', async () => {
      const indexes = await observer.query<
        Array<{ table_name: string; columns: string[] }>
      >(
        `SELECT t.relname AS table_name, array_agg(a.attname::text ORDER BY k.ordinality) AS columns
         FROM pg_index i
         JOIN pg_class t ON t.oid=i.indrelid
         JOIN pg_namespace n ON n.oid=t.relnamespace
         CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ordinality)
         JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.attnum
         WHERE n.nspname='public' AND t.relname=ANY($1::text[])
           AND i.indisunique AND i.indisvalid AND i.indisready
           AND i.indpred IS NULL AND i.indexprs IS NULL AND k.ordinality<=i.indnkeyatts
         GROUP BY t.relname,i.indexrelid`,
        [['exam_result_sessions', 'student_exam_reports']],
      );
      expect(indexes).toEqual(
        expect.arrayContaining([
          {
            table_name: 'exam_result_sessions',
            columns: ['tenant_id', 'course_id', 'exam_type', 'semester'],
          },
          {
            table_name: 'student_exam_reports',
            columns: ['session_id', 'student_user_id'],
          },
        ]),
      );
    });

    it('A: current real COE/Dean approval publishes all records once; repeated declaration is rejected', async () => {
      const f = await fixture();
      await expect(declare(f)).resolves.toMatchObject({ declared: 2 });
      await expectPublished(f);
      const before = await snapshot(f);
      await expect(declare(f)).rejects.toBeInstanceOf(BadRequestException);
      expect(await snapshot(f)).toEqual(before);
      await expectPublished(f);
    });

    it('semester: a session for the wrong semester cannot pass COE audit or request Dean approval', async () => {
      // Official enrollments belong to semester 4; create the real result session
      // for semester 5 through the supported service, not by forging approvals.
      const f = await fixture(false, 5);
      const before = await snapshot(f);
      await expect(
        resultService().runFormulaAudit(f.tenant, f.session!, f.officer),
      ).rejects.toThrow('matching course enrollment for this semester');
      await expect(
        resultService().requestDeanApproval(f.tenant, f.session!, f.officer),
      ).rejects.toThrow('matching course enrollment for this semester');
      await expect(declare(f)).rejects.toBeInstanceOf(BadRequestException);
      expect(await snapshot(f)).toEqual(before);
      expect(await auditActions(f)).not.toContain('RESULT_COE_AUDIT_PASSED');
      expect(
        publications.filter((event) => event.tenantId === f.tenant),
      ).toHaveLength(0);
    });

    it('semester: one wrong-semester enrollment rejects the entire mixed batch without publishing valid students', async () => {
      const f = await fixture();
      // Simulate the authoritative enrollment owner's change using only this
      // fixture's row. There is no invented Exam Cell enrollment-write API.
      await primary.query(
        `UPDATE student_course_enrollments SET semester=5
         WHERE tenant_id=$1 AND course_id=$2 AND student_user_id=$3`,
        [f.tenant, f.course, f.students[1]],
      );
      const before = await snapshot(f);
      await expect(declare(f)).rejects.toThrow(
        'matching course enrollment for this semester',
      );
      await expect(
        resultService().runFormulaAudit(f.tenant, f.session!, f.officer),
      ).rejects.toThrow('matching course enrollment for this semester');
      expect(await snapshot(f)).toEqual(before);
      expect(before.enrollments.map((row: Row) => row.semester).sort()).toEqual(
        [4, 5],
      );
      expect(before.reports).toHaveLength(0);
      expect(before.mirror).toHaveLength(0);
      expect(await auditActions(f)).not.toContain('RESULT_DECLARED');
      expect(
        publications.filter((event) => event.tenantId === f.tenant),
      ).toHaveLength(0);
    });

    it('semester: enrollment changes after the approval request prevent the Dean from approving the stale roster', async () => {
      const f = await fixture(false);
      await resultService().runFormulaAudit(f.tenant, f.session!, f.officer);
      const request = await resultService().requestDeanApproval(
        f.tenant,
        f.session!,
        f.officer,
      );
      await primary.query(
        `UPDATE student_course_enrollments SET semester=5
         WHERE tenant_id=$1 AND course_id=$2`,
        [f.tenant, f.course],
      );
      const before = await snapshot(f);
      await expect(
        resultService().decideDeanResultApproval(
          f.tenant,
          f.dean,
          request.request_id,
          'APPROVED',
          'Disposable stale roster check',
          'Dean',
        ),
      ).rejects.toThrow('matching course enrollment for this semester');
      expect(await snapshot(f)).toEqual(before);
      expect(before.approvals[0].status).toBe('PENDING');
      expect(await auditActions(f)).not.toContain('RESULT_DEAN_APPROVED');
      await expect(declare(f)).rejects.toBeInstanceOf(BadRequestException);
    });

    it.each(['missing', 'deleted'] as const)(
      'semester: an already approved batch with a %s enrollment cannot be declared',
      async (kind) => {
        const f = await fixture();
        await primary.query(
          kind === 'missing'
            ? `DELETE FROM student_course_enrollments
               WHERE tenant_id=$1 AND course_id=$2 AND student_user_id=$3`
            : `UPDATE student_course_enrollments SET deleted_at=NOW()
               WHERE tenant_id=$1 AND course_id=$2 AND student_user_id=$3`,
          [f.tenant, f.course, f.students[1]],
        );
        const before = await snapshot(f);
        await expect(declare(f)).rejects.toThrow(
          'matching course enrollment for this semester',
        );
        expect(await snapshot(f)).toEqual(before);
        expect(await auditActions(f)).not.toContain('RESULT_DECLARED');
        expect(
          publications.filter((event) => event.tenantId === f.tenant),
        ).toHaveLength(0);
      },
    );

    it('A: reopening and faculty marks changes invalidate old approval until a fresh COE/Dean cycle', async () => {
      const f = await fixture();
      const oldRequest = f.request;
      await resultService().reopenEntry(
        f.tenant,
        f.session!,
        { reason: 'Disposable correction test' },
        f.officer,
      );
      await save(f, 85);
      await facultyService().publishMarks(
        f.faculty,
        f.tenant,
        f.course,
        'END_TERM',
      );
      await resultService().prepareForDeclaration(
        f.tenant,
        f.session!,
        f.officer,
      );
      await expect(declare(f)).rejects.toBeInstanceOf(BadRequestException);
      const state = await snapshot(f);
      expect(state.reports).toHaveLength(0);
      expect(
        state.approvals.find((row: Row) => row.request_id === oldRequest),
      ).toMatchObject({ status: 'REJECTED', decided_by: null });
      expect(state.history).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'INVALIDATED',
            request_id: oldRequest,
          }),
        ]),
      );
      await approve(f);
      expect(f.request).not.toBe(oldRequest);
      await declare(f);
      await expectPublished(f, 85);
    });

    it('A: rule changes invalidate old approval and require fresh COE and Dean review', async () => {
      const f = await fixture();
      await resultService().configureRules(
        f.tenant,
        f.session!,
        { pass_marks: 45 },
        f.officer,
      );
      await expect(declare(f)).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        resultService().requestDeanApproval(f.tenant, f.session!, f.officer),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(await auditActions(f)).toEqual(
        expect.arrayContaining([
          'RESULT_APPROVALS_INVALIDATED',
          'RESULT_INPUTS_CHANGED',
        ]),
      );
      await approve(f);
      await declare(f);
      await expectPublished(f);
    });

    it('A: an upstream grading-policy row revision makes existing COE and Dean approval stale', async () => {
      const f = await fixture();
      const previousRequest = f.request;
      const [before] = await observer.query<Array<{ revision: string }>>(
        'SELECT xmin::text AS revision FROM academic_grading_policies WHERE policy_id=$1',
        [f.policy],
      );
      // Simulate the authoritative policy owner's update, only on this suite's
      // disposable policy row. There is no invented Exam Cell policy-write API.
      await primary.query(
        'UPDATE academic_grading_policies SET rules=$2::jsonb, updated_at=NOW() WHERE policy_id=$1',
        [
          f.policy,
          JSON.stringify({
            bands: [
              { minPercent: 80, maxPercent: 100, grade: 'A+', gradePoints: 10 },
              { minPercent: 0, maxPercent: 79.99, grade: 'F', gradePoints: 0 },
            ],
          }),
        ],
      );
      const [after] = await observer.query<Array<{ revision: string }>>(
        'SELECT xmin::text AS revision FROM academic_grading_policies WHERE policy_id=$1',
        [f.policy],
      );
      expect(after.revision).not.toBe(before.revision);
      await expect(declare(f)).rejects.toBeInstanceOf(BadRequestException);
      await resultService().runFormulaAudit(f.tenant, f.session!, f.officer);
      // A fresh COE audit alone must not revive the Dean's old version approval.
      await expect(declare(f)).rejects.toBeInstanceOf(BadRequestException);
      expect((await snapshot(f)).reports).toHaveLength(0);
      await approve(f);
      expect(f.request).not.toBe(previousRequest);
      await declare(f);
      await expectPublished(f);
      for (const report of (await snapshot(f)).reports)
        expect(report.grade).toBe('A+');
    });

    it('A: faculty assignment, Dean department, role and tenant boundaries reject unauthorized service actions', async () => {
      const f = await fixture(false);
      await expect(save(f, 99, f.students[0])).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await resultService().runFormulaAudit(f.tenant, f.session!, f.officer);
      const request = await resultService().requestDeanApproval(
        f.tenant,
        f.session!,
        f.officer,
      );
      await expect(
        resultService().decideDeanResultApproval(
          f.tenant,
          f.dean,
          request.request_id,
          'APPROVED',
          undefined,
          'Faculty',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        resultService().decideDeanResultApproval(
          f.tenant,
          f.outsider,
          request.request_id,
          'APPROVED',
          undefined,
          'Dean',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        resultService().decideDeanResultApproval(
          randomUUID(),
          f.dean,
          request.request_id,
          'APPROVED',
          undefined,
          'Dean',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        resultService().declareSession(randomUUID(), f.session!, f.officer, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(declare(f)).rejects.toBeInstanceOf(BadRequestException);
      expect((await snapshot(f)).reports).toHaveLength(0);
    });

    it.each(['marks', 'rules'] as const)(
      'B: publication first blocks concurrent %s changes, which then reject declared results',
      async (kind) => {
        const f = await fixture();
        const gate = new PausingAudit(primary, 'RESULT_DECLARED');
        const publication = declare(f, resultService(primary, gate));
        let update: Promise<unknown> | undefined;
        try {
          const pid = await bounded(
            gate.reached.promise,
            'Publication did not reach transaction barrier',
          );
          expect((await snapshot(f)).reports).toHaveLength(0);
          expect(
            publications.filter((event) => event.tenantId === f.tenant),
          ).toHaveLength(0);
          update =
            kind === 'marks'
              ? resultService(competing).applySessionGraceMarks(
                  f.tenant,
                  f.session!,
                  f.officer,
                  1,
                )
              : resultService(competing).configureRules(
                  f.tenant,
                  f.session!,
                  { pass_marks: 45 },
                  f.officer,
                );
          const result = Promise.allSettled([publication, update]);
          await observeBlocked(pid);
          gate.release();
          const outcomes = await result;
          expect(outcomes[0].status).toBe('fulfilled');
          expect(outcomes[1]).toMatchObject({
            status: 'rejected',
            reason: expect.any(BadRequestException),
          });
          await expectPublished(f);
        } finally {
          gate.release();
          await Promise.allSettled([publication, ...(update ? [update] : [])]);
        }
      },
    );

    it.each(['marks', 'rules'] as const)(
      'B: %s update first blocks publication, invalidates approval and prevents stale publication',
      async (kind) => {
        const f = await fixture();
        const gate = new PausingAudit(
          primary,
          kind === 'marks'
            ? 'RESULT_GRACE_MARKS_APPLIED'
            : 'RESULT_INPUTS_CHANGED',
        );
        const service = resultService(primary, gate);
        const update =
          kind === 'marks'
            ? service.applySessionGraceMarks(f.tenant, f.session!, f.officer, 1)
            : service.configureRules(
                f.tenant,
                f.session!,
                { pass_marks: 45 },
                f.officer,
              );
        let publication: Promise<unknown> | undefined;
        try {
          const pid = await bounded(
            gate.reached.promise,
            'Update did not reach transaction barrier',
          );
          publication = declare(f, resultService(competing));
          const result = Promise.allSettled([update, publication]);
          await observeBlocked(pid);
          gate.release();
          const outcomes = await result;
          expect(outcomes[0].status).toBe('fulfilled');
          expect(outcomes[1]).toMatchObject({
            status: 'rejected',
            reason: expect.any(BadRequestException),
          });
          const state = await snapshot(f);
          expect(state.sessions[0].declared_at).toBeNull();
          expect(state.reports).toHaveLength(0);
          expect(state.mirror).toHaveLength(0);
          expect(
            publications.filter((event) => event.tenantId === f.tenant),
          ).toHaveLength(0);
          await approve(f);
          await declare(f);
          await expectPublished(f, kind === 'marks' ? 81 : 80);
        } finally {
          gate.release();
          await Promise.allSettled([
            update,
            ...(publication ? [publication] : []),
          ]);
        }
      },
    );

    it('B: two independent publishers serialize in PostgreSQL and only one commits/events are not duplicated', async () => {
      const f = await fixture();
      const gate = new PausingAudit(primary, 'RESULT_DECLARED');
      const first = declare(f, resultService(primary, gate));
      let second: Promise<unknown> | undefined;
      try {
        const pid = await bounded(
          gate.reached.promise,
          'First publisher did not reach transaction barrier',
        );
        second = declare(f, resultService(competing));
        const result = Promise.allSettled([first, second]);
        await observeBlocked(pid);
        gate.release();
        const outcomes = await result;
        expect(
          outcomes.filter((outcome) => outcome.status === 'fulfilled'),
        ).toHaveLength(1);
        expect(outcomes[1]).toMatchObject({
          status: 'rejected',
          reason: expect.any(BadRequestException),
        });
        await expectPublished(f);
      } finally {
        gate.release();
        await Promise.allSettled([first, ...(second ? [second] : [])]);
      }
    });

    it('semester concurrency: an enrollment update first blocks declaration, which rejects the committed wrong-semester roster', async () => {
      const f = await fixture();
      const reached = deferred<number>();
      const release = deferred<void>();
      // An upstream owner need not acquire the Exam Cell advisory lock. Verify
      // the real enrollment row lock also protects declaration in that case.
      const update = primary.transaction(async (manager) => {
        await manager.query(
          `UPDATE student_course_enrollments SET semester=5
           WHERE tenant_id=$1 AND course_id=$2 AND student_user_id=$3`,
          [f.tenant, f.course, f.students[1]],
        );
        const [row] = await manager.query<Array<{ pid: number }>>(
          'SELECT pg_backend_pid() AS pid',
        );
        reached.resolve(row.pid);
        await bounded(
          release.promise,
          'Enrollment update was not released',
          15000,
        );
      });
      let publication: Promise<unknown> | undefined;
      try {
        const pid = await bounded(
          reached.promise,
          'Enrollment update did not reach transaction barrier',
        );
        publication = declare(f, resultService(competing));
        const result = Promise.allSettled([update, publication]);
        await observeBlocked(pid, 'enrollment');
        expect((await snapshot(f)).reports).toHaveLength(0);
        release.resolve();
        const outcomes = await result;
        expect(outcomes[0].status).toBe('fulfilled');
        expect(outcomes[1]).toMatchObject({
          status: 'rejected',
          reason: expect.any(BadRequestException),
        });
        const state = await snapshot(f);
        expect(state.sessions[0].declared_at).toBeNull();
        expect(state.reports).toHaveLength(0);
        expect(state.mirror).toHaveLength(0);
        expect(
          state.marks.every((row: Row) => row.status === 'PENDING_COE'),
        ).toBe(true);
        expect(await auditActions(f)).not.toContain('RESULT_DECLARED');
        expect(
          publications.filter((event) => event.tenantId === f.tenant),
        ).toHaveLength(0);
      } finally {
        release.resolve();
        await Promise.allSettled([
          update,
          ...(publication ? [publication] : []),
        ]);
      }
    });

    it('semester concurrency: publication holds enrollment rows until commit, blocking a simultaneous enrollment update', async () => {
      const f = await fixture();
      const gate = new PausingAudit(primary, 'RESULT_DECLARED');
      const publication = declare(f, resultService(primary, gate));
      const abortUpdate = new Error(
        'Rollback test-only upstream enrollment update',
      );
      let update: Promise<unknown> | undefined;
      try {
        const pid = await bounded(
          gate.reached.promise,
          'Publication did not reach transaction barrier',
        );
        update = competing.transaction(async (manager) => {
          await manager.query(
            `UPDATE student_course_enrollments SET semester=5
             WHERE tenant_id=$1 AND course_id=$2 AND student_user_id=$3`,
            [f.tenant, f.course, f.students[1]],
          );
          // The upstream service owns policy for changes AFTER publication. Do
          // not alter this published fixture; prove this write had to wait and
          // explicitly roll its transaction back after PostgreSQL releases it.
          throw abortUpdate;
        });
        const result = Promise.allSettled([publication, update]);
        await observeBlocked(pid, 'enrollment');
        expect(
          publications.filter((event) => event.tenantId === f.tenant),
        ).toHaveLength(0);
        gate.release();
        const outcomes = await result;
        expect(outcomes[0].status).toBe('fulfilled');
        expect(outcomes[1]).toMatchObject({
          status: 'rejected',
          reason: abortUpdate,
        });
        await expectPublished(f);
        for (const enrollment of (await snapshot(f)).enrollments)
          expect(enrollment.semester).toBe(4);
      } finally {
        gate.release();
        await Promise.allSettled([publication, ...(update ? [update] : [])]);
      }
    });

    it('C: a real audit SQL error rolls back all publication writes, preserves existing published results, and emits no success', async () => {
      const existing = await fixture();
      await declare(existing);
      const existingBefore = await snapshot(existing);
      const f = await fixture();
      const before = await snapshot(f);
      const service = resultService(
        primary,
        new FailingAudit(primary, 'RESULT_DECLARED'),
      );
      await expect(declare(f, service)).rejects.toMatchObject({
        driverError: { code: '22012' },
      });
      expect(await snapshot(f)).toEqual(before);
      expect(await snapshot(existing)).toEqual(existingBefore);
      expect(await auditActions(f)).not.toContain('RESULT_DECLARED');
      expect(await auditActions(f)).toContain('RESULT_DECLARATION_FAILED');
      expect(
        publications.filter((event) => event.tenantId === f.tenant),
      ).toHaveLength(0);
      await declare(f);
      await expectPublished(f);
    });

    it('C: a required invalidation audit SQL error rolls back marks, approval invalidation and history together', async () => {
      const f = await fixture();
      const before = await snapshot(f);
      const beforeAudit = await auditActions(f);
      await expect(
        resultService(
          primary,
          new FailingAudit(primary, 'RESULT_APPROVALS_INVALIDATED'),
        ).reopenEntry(
          f.tenant,
          f.session!,
          { reason: 'Injected rollback test' },
          f.officer,
        ),
      ).rejects.toMatchObject({ driverError: { code: '22012' } });
      expect(await snapshot(f)).toEqual(before);
      expect(await auditActions(f)).toEqual(beforeAudit);
      await declare(f);
      await expectPublished(f);
    });

    it('C: a real fixture-scoped mirror trigger failure rolls back earlier marks writes', async () => {
      const f = await fixture();
      const before = await snapshot(f);
      // Names and UUID are generated by this test, never client input. Test-only DDL
      // is removed in finally; trigger cannot affect any other fixture/tenant.
      const name = `exam_it_${randomUUID().replaceAll('-', '')}`;
      await primary.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.tenant_id = '${f.tenant}'::uuid THEN
        RAISE EXCEPTION 'Disposable required mirror failure' USING ERRCODE='P0001';
      END IF; RETURN NEW; END $$`);
      try {
        await primary.query(
          `CREATE TRIGGER ${name} BEFORE INSERT ON academic_exam_results FOR EACH ROW EXECUTE FUNCTION ${name}()`,
        );
        await expect(declare(f)).rejects.toMatchObject({
          driverError: { code: 'P0001' },
        });
        expect(await snapshot(f)).toEqual(before);
        expect(await auditActions(f)).not.toContain('RESULT_DECLARED');
        expect(
          publications.filter((event) => event.tenantId === f.tenant),
        ).toHaveLength(0);
      } finally {
        await primary.query(
          `DROP TRIGGER IF EXISTS ${name} ON academic_exam_results`,
        );
        await primary.query(`DROP FUNCTION ${name}()`);
      }
      await declare(f);
      await expectPublished(f);
    });

    it('semester rollback: a suppressed required enrollment grade update rolls back the entire publication', async () => {
      const f = await fixture();
      const before = await snapshot(f);
      const name = `exam_it_${randomUUID().replaceAll('-', '')}`;
      // RETURN NULL is a real PostgreSQL zero-row UPDATE, not a thrown SQL error:
      // declaration must check the required write's affected row count itself.
      await primary.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.tenant_id = '${f.tenant}'::uuid
        AND NEW.student_user_id = '${f.students[1]}'::uuid THEN RETURN NULL;
      END IF; RETURN NEW; END $$`);
      try {
        await primary.query(
          `CREATE TRIGGER ${name} BEFORE UPDATE ON student_course_enrollments FOR EACH ROW EXECUTE FUNCTION ${name}()`,
        );
        await expect(declare(f)).rejects.toThrow(
          'Expected exactly one enrollment grade update for each declared student',
        );
        expect(await snapshot(f)).toEqual(before);
        expect(await auditActions(f)).not.toContain('RESULT_DECLARED');
        expect(
          publications.filter((event) => event.tenantId === f.tenant),
        ).toHaveLength(0);
      } finally {
        await primary.query(
          `DROP TRIGGER IF EXISTS ${name} ON student_course_enrollments`,
        );
        await primary.query(`DROP FUNCTION ${name}()`);
      }
      await declare(f);
      await expectPublished(f);
    });

    it('C: a post-commit notification listener failure must not report committed publication as rolled back', async () => {
      const f = await fixture();
      const fail = (payload: Row) => {
        if (payload.tenantId === f.tenant)
          throw new Error('Disposable notification transport failure');
      };
      events.on(NotificationEvents.EXAM_RESULTS_PUBLISHED, fail);
      try {
        // This intentionally fails if a synchronous notification error leaks after
        // COMMIT: the API must not falsely tell its caller publication failed.
        const [outcome] = await Promise.allSettled([declare(f)]);
        const state = await snapshot(f);
        expect(state.sessions[0].declared_at).toBeInstanceOf(Date);
        expect(state.reports).toHaveLength(2);
        expect(
          (await auditActions(f)).filter(
            (action) => action === 'RESULT_DECLARED',
          ),
        ).toHaveLength(1);
        expect(await auditActions(f)).not.toContain(
          'RESULT_DECLARATION_FAILED',
        );
        expect(outcome).toMatchObject({
          status: 'fulfilled',
          value: { declared: 2, notification_dispatch_failures: 2 },
        });
        const failures = await observer.query<Array<{ new_value: Row }>>(
          `SELECT new_value FROM exam_audit_logs WHERE tenant_id=$1
           AND action='RESULT_NOTIFICATION_DISPATCH_FAILED'`,
          [f.tenant],
        );
        expect(failures).toHaveLength(1);
        expect(failures[0].new_value).toMatchObject({ failed_count: 2 });
      } finally {
        events.off(NotificationEvents.EXAM_RESULTS_PUBLISHED, fail);
      }
      const before = await snapshot(f);
      await expect(declare(f)).rejects.toBeInstanceOf(BadRequestException);
      expect(await snapshot(f)).toEqual(before);
    });
  },
);
