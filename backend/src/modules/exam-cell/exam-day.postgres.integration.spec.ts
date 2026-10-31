import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DataSource, EntityManager } from 'typeorm';
import { ExamCellAuditService } from './exam-cell-audit.service';
import { ExamDayScriptsService } from './exam-day-scripts.service';
import { ExamCellOperationsService } from './exam-cell-operations.service';

// Real PostgreSQL services, transactions, locks, constraints and audit writes.
// No application .env, reset, schema synchronization or external notifications.
const integration =
  process.env.FALCON_TEST_DB === '1' ? describe : describe.skip;
const marker = 'falcon-examcell-disposable-integration-20261021';
type Fixture = {
  tenant: string;
  actor: string;
  students: string[];
  schedule: string;
  subject: number;
  course: string;
};
type Row = Record<string, unknown>;

integration('isolated PostgreSQL exam-day operations', () => {
  jest.setTimeout(30000);
  const run = randomUUID();
  const sources: DataSource[] = [];
  const fixtures: Fixture[] = [];
  let primary: DataSource;
  let competing: DataSource;
  let observer: DataSource;
  let studentRole: number;
  let officerRole: number;

  beforeAll(async () => {
    if (process.env.FALCON_RESET_DB === '1')
      throw new Error('Refusing reset-enabled environment');
    const supplied = process.env.TEST_DATABASE_URL;
    if (!supplied) throw new Error('Explicit TEST_DATABASE_URL required');
    const url = new URL(supplied);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.hostname !== '127.0.0.1' ||
      url.port !== '55432' ||
      url.pathname !== '/falcon_examcell_test' ||
      url.search ||
      url.hash
    )
      throw new Error('Refusing non-disposable PostgreSQL target');
    async function connect(name: string) {
      const db = new DataSource({
        type: 'postgres',
        url: supplied,
        synchronize: false,
        migrationsRun: false,
        logging: false,
        extra: {
          max: 3,
          application_name: `examday-it-${run}-${name}`,
          statement_timeout: 15000,
        },
      });
      sources.push(db);
      await db.initialize();
      return db;
    }
    observer = await connect('observer');
    const [identity] = await observer.query<
      Array<{ name: string; marker: string }>
    >(
      "SELECT current_database() AS name,shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()",
    );
    if (identity?.name !== 'falcon_examcell_test' || identity.marker !== marker)
      throw new Error('Refusing database without disposable-test marker');
    primary = await connect('primary');
    competing = await connect('competing');
    await migrate();
    const roles = await primary.query<
      Array<{ role_id: number; role_name: string }>
    >(
      "SELECT role_id,role_name FROM roles WHERE role_name IN ('Student','ExamCell')",
    );
    studentRole = roles.find((r) => r.role_name === 'Student')?.role_id ?? 0;
    officerRole = roles.find((r) => r.role_name === 'ExamCell')?.role_id ?? 0;
    if (!studentRole || !officerRole)
      throw new Error('Isolated role seed is required');
  });

  function migrate() {
    return primary.transaction((m) =>
      m.query(
        readFileSync(
          resolve(
            __dirname,
            '../../../migrations/20261023180000_exam_day_script_reconciliation.sql',
          ),
          'utf8',
        ),
      ),
    );
  }

  afterAll(async () => {
    try {
      if (primary?.isInitialized)
        for (const f of fixtures.reverse()) {
          await primary.transaction(async (manager) => {
            for (const table of [
              'exam_audit_logs',
              'exam_script_discrepancies',
              'answer_sheet_tracking',
              'exam_day_attendance',
              'ufm_cases',
              'exam_seating_allocations',
              'exam_schedules',
              'academic_marks',
              'academic_courses',
              'users',
            ])
              await manager.query(`DELETE FROM ${table} WHERE tenant_id=$1`, [
                f.tenant,
              ]);
            await manager.query(
              'DELETE FROM academic_subjects WHERE subject_id=$1',
              [f.subject],
            );
            await manager.query('DELETE FROM tenants WHERE tenant_id=$1', [
              f.tenant,
            ]);
          });
        }
    } finally {
      for (const db of sources.reverse())
        if (db.isInitialized) await db.destroy();
    }
  });

  async function fixture() {
    const f: Fixture = {
      tenant: randomUUID(),
      actor: randomUUID(),
      students: [randomUUID(), randomUUID(), randomUUID()],
      schedule: randomUUID(),
      subject: 0,
      course: randomUUID(),
    };
    fixtures.push(f);
    await primary.query(
      "INSERT INTO tenants(tenant_id,name,subdomain,pg_schema) VALUES($1,'Disposable exam-day QA',$2,'public')",
      [f.tenant, `examday-${f.tenant}`],
    );
    for (const id of [f.actor, ...f.students])
      await primary.query(
        "INSERT INTO users(user_id,tenant_id,name,official_email,role_id) VALUES($1,$2,'Disposable exam-day candidate',$3,$4)",
        [
          id,
          f.tenant,
          `${id}@example.invalid`,
          id === f.actor ? officerRole : studentRole,
        ],
      );
    const [subject] = await primary.query<Array<{ subject_id: number }>>(
      "INSERT INTO academic_subjects(subject_code,subject_name,program_id,semester) VALUES($1,'Disposable exam-day subject',1,4) RETURNING subject_id",
      [`ED-${f.tenant.replaceAll('-', '').slice(0, 24)}`],
    );
    f.subject = subject.subject_id;
    await primary.query(
      "INSERT INTO academic_courses(course_id,tenant_id,course_code,course_name,credits) VALUES($1,$2,$3,'Disposable exam-day course',4)",
      [f.course, f.tenant, `ED-${f.course}`],
    );
    await primary.query(
      "INSERT INTO exam_schedules(exam_schedule_id,tenant_id,subject_id,exam_type,exam_date,start_time,end_time,venue,status) VALUES($1,$2,$3,'END_TERM',CURRENT_DATE,'09:00','12:00','Test room','SCHEDULED')",
      [f.schedule, f.tenant, f.subject],
    );
    for (const [index, student] of f.students.entries())
      await primary.query(
        "INSERT INTO exam_seating_allocations(tenant_id,exam_schedule_id,student_user_id,room,seat_number) VALUES($1,$2,$3,'Test room',$4)",
        [f.tenant, f.schedule, student, String(index + 1)],
      );
    return f;
  }

  function scripts(db = primary, audit = new ExamCellAuditService(db)) {
    return new ExamDayScriptsService(db, audit);
  }
  function attendance(db = primary, audit = new ExamCellAuditService(db)) {
    return new ExamCellOperationsService(
      db,
      undefined as never,
      undefined as never,
      audit,
      undefined as never,
      undefined as never,
    );
  }
  function mark(
    f: Fixture,
    status = 'PRESENT',
    student = f.students[0],
    ops = attendance(),
  ) {
    return ops.markExamDayAttendance(f.tenant, f.actor, {
      exam_schedule_id: f.schedule,
      student_user_id: student,
      status,
    });
  }
  function collect(
    f: Fixture,
    sheet = 'BOOK-1',
    service = scripts(),
    reason?: string,
  ) {
    return service.create(
      f.tenant,
      f.actor,
      {
        exam_schedule_id: f.schedule,
        student_user_id: f.students[0],
        sheet_number: sheet,
        collect: true,
        ...(reason ? { resolution_reason: reason } : {}),
      },
      'ExamCell',
    );
  }
  function missing(f: Fixture, service = scripts()) {
    return service.reportMissing(
      f.tenant,
      f.actor,
      {
        exam_schedule_id: f.schedule,
        student_user_id: f.students[0],
        reason: 'Candidate script not returned at collection',
      },
      'ExamCell',
    );
  }
  function incident(f: Fixture, service = scripts(), requestId = randomUUID()) {
    return service.reportIncident(
      f.tenant,
      f.actor,
      {
        exam_schedule_id: f.schedule,
        student_user_id: f.students[0],
        description: 'Unauthorized material reported for review',
        request_id: requestId,
      },
      'ExamCell',
    );
  }
  async function actions(f: Fixture) {
    const rows = await primary.query<Array<{ action: string }>>(
      'SELECT action FROM exam_audit_logs WHERE tenant_id=$1 ORDER BY created_at',
      [f.tenant],
    );
    return rows.map((r) => r.action);
  }
  async function waitForLock() {
    const deadline = Date.now() + 7000;
    while (Date.now() < deadline) {
      const [row] = await observer.query<Array<{ count: number }>>(
        "SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE application_name LIKE $1 AND wait_event_type='Lock'",
        [`examday-it-${run}-%`],
      );
      if (row.count > 0) return;
      await new Promise((done) => setTimeout(done, 25));
    }
    throw new Error('No real PostgreSQL lock waiter observed');
  }
  function auditGate(action: string) {
    let entered!: () => void;
    let release!: () => void;
    const ready = new Promise<void>((done) => {
      entered = done;
    });
    const hold = new Promise<void>((done) => {
      release = done;
    });
    class GatedAudit extends ExamCellAuditService {
      override async log(
        tenant: string,
        actor: string | undefined,
        payload: Parameters<ExamCellAuditService['log']>[2],
        manager?: EntityManager,
      ) {
        await super.log(tenant, actor, payload, manager);
        if (payload.action === action) {
          entered();
          await hold;
        }
      }
    }
    return { audit: new GatedAudit(primary), ready, release };
  }
  class FailingAudit extends ExamCellAuditService {
    override async log(
      tenant: string,
      actor: string | undefined,
      payload: Parameters<ExamCellAuditService['log']>[2],
      manager?: EntityManager,
    ) {
      await super.log(tenant, actor, payload, manager);
      if (!manager)
        throw new Error('Audit must participate in the transaction');
      await manager.query('SELECT 1/0 AS injected_exam_day_audit_failure');
    }
  }

  it('persists attendance, absence, physical receipts, missing and found scripts without inferring missing attendance', async () => {
    const f = await fixture();
    const marked = await mark(f);
    expect(marked.attendance_id).toMatch(/^[0-9a-f-]{36}$/);
    await mark(f, 'LATE', f.students[1]);
    await mark(f, 'ABSENT', f.students[2]);
    const report = await missing(f);
    let view = await scripts().reconciliation(f.tenant, f.schedule, 'ExamCell');
    expect(view.summary).toMatchObject({
      expected_candidates: 2,
      received_candidates: 0,
      absent: 1,
      missing: 1,
      pending_collection: 1,
    });
    const received = await collect(
      f,
      'BOOK-FOUND',
      scripts(),
      'Found in the sealed collection tray',
    );
    expect(received.collected_by).toBe(f.actor);
    expect(received.status).toBe('COLLECTED');
    view = await scripts().reconciliation(f.tenant, f.schedule, 'ExamCell');
    expect(view.summary).toMatchObject({
      expected_candidates: 2,
      received_candidates: 1,
      received_booklets: 1,
      missing: 0,
    });
    expect(view.candidates[0].student_user_id).toBeDefined();
    const [resolved] = await primary.query<Row[]>(
      'SELECT * FROM exam_script_discrepancies WHERE discrepancy_id=$1',
      [report.discrepancy_id],
    );
    expect(resolved).toMatchObject({
      status: 'RESOLVED',
      resolution: 'FOUND',
      resolved_by: f.actor,
    });
    expect(await actions(f)).toEqual(
      expect.arrayContaining([
        'EXAM_SCRIPT_MISSING',
        'ANSWER_SHEET_COLLECTED',
        'EXAM_SCRIPT_RESOLVED',
      ]),
    );
  });

  it('keeps unmarked candidates separate from absent and never fabricates collection from a legacy lifecycle label', async () => {
    const f = await fixture();
    await primary.query(
      "INSERT INTO answer_sheet_tracking(tenant_id,sheet_number,exam_schedule_id,student_user_id,qr_payload,status) VALUES($1,'LEGACY',$2,$3,'legacy','CHECKED')",
      [f.tenant, f.schedule, f.students[0]],
    );
    const view = await scripts().reconciliation(
      f.tenant,
      f.schedule,
      'ExamOperator',
    );
    expect(view.summary).toMatchObject({
      attendance_pending: 3,
      absent: 0,
      received_booklets: 0,
    });
    await mark(f);
    await expect(collect(f, 'LEGACY')).rejects.toThrow(
      'Legacy lifecycle status',
    );
  });

  it.each(['ABSENT', 'MEDICAL', 'DEBARRED'])(
    'rejects collection and missing-script reports for %s candidates',
    async (status) => {
      const f = await fixture();
      await mark(f, status);
      await expect(collect(f)).rejects.toThrow('PRESENT or LATE');
      await expect(missing(f)).rejects.toThrow('PRESENT or LATE');
      expect(
        await primary.query<Row[]>(
          'SELECT * FROM answer_sheet_tracking WHERE tenant_id=$1',
          [f.tenant],
        ),
      ).toHaveLength(0);
    },
  );

  it('requires marked attendance and a unique same-exam roster student before receipt', async () => {
    const f = await fixture();
    await expect(collect(f)).rejects.toThrow('PRESENT or LATE');
    await expect(
      scripts().create(
        f.tenant,
        f.actor,
        {
          exam_schedule_id: f.schedule,
          student_user_id: f.actor,
          sheet_number: 'INVALID',
        },
        'ExamCell',
      ),
    ).rejects.toThrow('verified seat');
  });

  it('enforces tenant, actor and existing action permissions before any write', async () => {
    const f = await fixture();
    const other = await fixture();
    await mark(f);
    await expect(
      scripts().reconciliation(other.tenant, f.schedule, 'ExamCell'),
    ).rejects.toThrow('not found');
    await expect(
      scripts().create(
        f.tenant,
        other.actor,
        {
          exam_schedule_id: f.schedule,
          student_user_id: f.students[0],
          sheet_number: 'X',
        },
        'ExamCell',
      ),
    ).rejects.toThrow('authenticated officer');
    await expect(
      scripts().create(
        f.tenant,
        f.actor,
        {
          exam_schedule_id: f.schedule,
          student_user_id: other.students[0],
          sheet_number: 'X',
        },
        'ExamCell',
      ),
    ).rejects.toThrow('verified seat');
    await expect(
      scripts().create(
        f.tenant,
        f.actor,
        {
          exam_schedule_id: f.schedule,
          student_user_id: f.students[0],
          sheet_number: 'X',
        },
        'ExamOperator',
      ),
    ).rejects.toThrow('permission');
    await expect(
      scripts().reportIncident(
        f.tenant,
        f.actor,
        {
          exam_schedule_id: f.schedule,
          student_user_id: f.students[0],
          request_id: randomUUID(),
          description: 'Test incident',
        },
        'ExamAdmin',
      ),
    ).rejects.toThrow('permission');
    await expect(
      scripts().reconciliation(' ', f.schedule, 'ExamCell'),
    ).rejects.toThrow();
  });

  it('makes collection retries idempotent while counting supplementary booklets separately', async () => {
    const f = await fixture();
    await mark(f);
    const first = await collect(f);
    const repeat = await collect(f);
    expect(repeat.sheet_id).toBe(first.sheet_id);
    await collect(f, 'SUPPLEMENT-2');
    expect(
      (await scripts().reconciliation(f.tenant, f.schedule, 'ExamCell'))
        .summary,
    ).toMatchObject({ received_candidates: 1, received_booklets: 2 });
    expect(
      (await actions(f)).filter((a) => a === 'ANSWER_SHEET_COLLECTED'),
    ).toHaveLength(2);
  });

  it('rejects reuse of a booklet for another candidate and custody-stage skipping', async () => {
    const f = await fixture();
    await mark(f);
    const receipt = await collect(f);
    await expect(
      scripts().create(
        f.tenant,
        f.actor,
        {
          exam_schedule_id: f.schedule,
          student_user_id: f.students[1],
          sheet_number: 'BOOK-1',
        },
        'ExamCell',
      ),
    ).rejects.toThrow('another examination or student');
    await expect(
      scripts().transition(
        f.tenant,
        receipt.sheet_id,
        f.actor,
        { status: 'ARCHIVED' },
        'ExamCell',
      ),
    ).rejects.toThrow('next legal');
    await scripts().transition(
      f.tenant,
      receipt.sheet_id,
      f.actor,
      { status: 'PACKED' },
      'ExamCell',
    );
    await scripts().transition(
      f.tenant,
      receipt.sheet_id,
      f.actor,
      { status: 'DISPATCHED' },
      'ExamCell',
    );
    await expect(
      scripts().transition(
        f.tenant,
        receipt.sheet_id,
        f.actor,
        { status: 'EVALUATOR_ASSIGNED', evaluator_user_id: f.students[1] },
        'ExamCell',
      ),
    ).rejects.toThrow('active assignment');
  });

  it('keeps a partially returned multi-booklet script missing until every registered booklet is physically received', async () => {
    const f = await fixture();
    await mark(f);
    for (const sheet_number of ['MAIN', 'SUPPLEMENT-1', 'SUPPLEMENT-2']) {
      await scripts().create(
        f.tenant,
        f.actor,
        {
          exam_schedule_id: f.schedule,
          student_user_id: f.students[0],
          sheet_number,
        },
        'ExamCell',
      );
    }
    const first = await collect(f, 'MAIN');
    let view = await scripts().reconciliation(f.tenant, f.schedule, 'ExamCell');
    expect(view.summary).toMatchObject({
      registered_booklets: 3,
      received_booklets: 1,
      outstanding_booklets: 2,
      pending_collection: 1,
    });
    expect(
      view.candidates.find((c) => c.student_user_id === f.students[0])
        ?.collection_status,
    ).toBe('PENDING_COLLECTION');
    await missing(f);
    await collect(
      f,
      'SUPPLEMENT-1',
      scripts(),
      'First supplement located in collection tray',
    );
    view = await scripts().reconciliation(f.tenant, f.schedule, 'ExamCell');
    expect(view.summary).toMatchObject({
      received_booklets: 2,
      outstanding_booklets: 1,
      missing: 1,
    });
    await expect(
      scripts().transition(
        f.tenant,
        first.sheet_id,
        f.actor,
        { status: 'PACKED' },
        'ExamCell',
      ),
    ).rejects.toThrow('missing-script discrepancy');
    await collect(
      f,
      'SUPPLEMENT-2',
      scripts(),
      'Last outstanding supplement physically located',
    );
    expect(
      (await scripts().reconciliation(f.tenant, f.schedule, 'ExamCell'))
        .summary,
    ).toMatchObject({
      registered_booklets: 3,
      received_booklets: 3,
      outstanding_booklets: 0,
      missing: 0,
    });
    expect(
      (await actions(f)).filter((a) => a === 'EXAM_SCRIPT_RESOLVED'),
    ).toHaveLength(1);
  });

  it('preserves legacy unlinked rows through an idempotent additive migration but refuses their mutation', async () => {
    const f = await fixture();
    const [legacy] = await primary.query<Array<{ sheet_id: string }>>(
      "INSERT INTO answer_sheet_tracking(tenant_id,sheet_number,qr_payload,status) VALUES($1,'OLD-UNLINKED','old','ISSUED') RETURNING sheet_id",
      [f.tenant],
    );
    await migrate();
    await expect(
      scripts().transition(
        f.tenant,
        legacy.sheet_id,
        f.actor,
        { status: 'COLLECTED' },
        'ExamCell',
      ),
    ).rejects.toThrow('Legacy unlinked');
    expect(
      await primary.query<Row[]>(
        'SELECT * FROM answer_sheet_tracking WHERE sheet_id=$1',
        [legacy.sheet_id],
      ),
    ).toHaveLength(1);
  });

  it('requires a resolution reason and actual receipt for FOUND; mistaken reports can be corrected without fabricating a receipt', async () => {
    const f = await fixture();
    await mark(f);
    const report = await missing(f);
    await expect(collect(f)).rejects.toThrow('resolution reason');
    await expect(
      scripts().resolveMissing(
        f.tenant,
        report.discrepancy_id,
        f.actor,
        { resolution: 'FOUND', reason: 'Claimed found without receipt' },
        'ExamCell',
      ),
    ).rejects.toThrow('actual booklet receipt');
    await scripts().resolveMissing(
      f.tenant,
      report.discrepancy_id,
      f.actor,
      {
        resolution: 'REPORTED_IN_ERROR',
        reason: 'Candidate was marked present in error',
      },
      'ExamCell',
    );
    await mark(f, 'ABSENT');
    expect(
      (await scripts().reconciliation(f.tenant, f.schedule, 'ExamCell'))
        .summary,
    ).toMatchObject({ absent: 1, received_booklets: 0, missing: 0 });
  });

  it('does not change attendance to absent while receipts or an unresolved missing script exist', async () => {
    const f = await fixture();
    await mark(f);
    await missing(f);
    await expect(mark(f, 'ABSENT')).rejects.toThrow('Resolve the script');
    await collect(f, 'FOUND', scripts(), 'Located after collection count');
    await expect(mark(f, 'MEDICAL')).rejects.toThrow('Resolve the script');
  });

  it('corrects an erroneous unforwarded receipt with its original evidence audited before correcting attendance', async () => {
    const f = await fixture();
    await mark(f);
    const receipt = await collect(f);
    const corrected = await scripts().correctReceipt(
      f.tenant,
      receipt.sheet_id,
      f.actor,
      { reason: 'Receipt was recorded for the wrong candidate' },
      'ExamCell',
    );
    expect(corrected).toMatchObject({
      status: 'ISSUED',
      collected_at: null,
      collected_by: null,
    });
    await mark(f, 'ABSENT');
    const [audit] = await primary.query<
      Array<{ old_value: { collected_by: string; collected_at: string } }>
    >(
      "SELECT old_value FROM exam_audit_logs WHERE tenant_id=$1 AND action='ANSWER_SHEET_RECEIPT_CORRECTED'",
      [f.tenant],
    );
    expect(audit.old_value.collected_by).toBe(f.actor);
    expect(audit.old_value.collected_at).toBeTruthy();
    expect(
      (await scripts().reconciliation(f.tenant, f.schedule, 'ExamCell'))
        .summary,
    ).toMatchObject({ received_booklets: 0, absent: 1 });
  });

  it('does not correct receipts after packing and rolls correction back on required audit failure', async () => {
    const f = await fixture();
    await mark(f);
    const receipt = await collect(f);
    await expect(
      scripts(primary, new FailingAudit(primary)).correctReceipt(
        f.tenant,
        receipt.sheet_id,
        f.actor,
        { reason: 'Injected audit failure must preserve receipt' },
        'ExamCell',
      ),
    ).rejects.toThrow('division by zero');
    expect(
      (await scripts().reconciliation(f.tenant, f.schedule, 'ExamCell')).summary
        .received_booklets,
    ).toBe(1);
    await scripts().transition(
      f.tenant,
      receipt.sheet_id,
      f.actor,
      { status: 'PACKED' },
      'ExamCell',
    );
    await expect(
      scripts().correctReceipt(
        f.tenant,
        receipt.sheet_id,
        f.actor,
        { reason: 'Cannot invalidate handed-over custody' },
        'ExamCell',
      ),
    ).rejects.toThrow('advanced custody');
  });

  it('records and sequentially reviews UFM incidents without changing any marks or publication records', async () => {
    const f = await fixture();
    await primary.query(
      "INSERT INTO academic_marks(tenant_id,student_user_id,course_id,exam_type,marks_obtained,max_marks,status,uploaded_by) VALUES($1,$2,$3,'END_TERM',55,100,'DRAFT',$4)",
      [f.tenant, f.students[0], f.course, f.actor],
    );
    const before = await primary.query<Row[]>(
      'SELECT * FROM academic_marks WHERE tenant_id=$1',
      [f.tenant],
    );
    const requestId = randomUUID();
    const reported = await incident(f, scripts(), requestId);
    expect(reported).toMatchObject({
      status: 'OPEN',
      marks_locked: false,
      penalty_applied: null,
    });
    expect((await incident(f, scripts(), requestId)).case_id).toBe(
      reported.case_id,
    );
    await expect(
      scripts().reviewIncident(
        f.tenant,
        reported.case_id,
        f.actor,
        { status: 'CLOSED', reason: 'Attempt to skip review' },
        'ExamCell',
      ),
    ).rejects.toThrow('Review an open incident');
    await scripts().reviewIncident(
      f.tenant,
      reported.case_id,
      f.actor,
      {
        status: 'UNDER_REVIEW',
        reason: 'Evidence sent to examination officer',
      },
      'ExamCell',
    );
    await scripts().reviewIncident(
      f.tenant,
      reported.case_id,
      f.actor,
      {
        status: 'CLOSED',
        reason: 'Review complete; no marks penalty applied here',
      },
      'ExamCell',
    );
    expect(
      await primary.query<Row[]>(
        'SELECT * FROM academic_marks WHERE tenant_id=$1',
        [f.tenant],
      ),
    ).toEqual(before);
    expect(
      (await scripts().listIncidents(f.tenant, f.schedule, 'ExamCell'))[0],
    ).toMatchObject({
      status: 'CLOSED',
      review_reason: 'Review complete; no marks penalty applied here',
    });
  });

  it('does not reuse an incident retry key for a different candidate or bypass a sanctioned case', async () => {
    const f = await fixture();
    const requestId = randomUUID();
    const report = await incident(f, scripts(), requestId);
    await expect(
      scripts().reportIncident(
        f.tenant,
        f.actor,
        {
          exam_schedule_id: f.schedule,
          student_user_id: f.students[1],
          request_id: requestId,
          description: 'Another incident',
        },
        'ExamCell',
      ),
    ).rejects.toThrow('different report');
    await primary.query(
      'UPDATE ufm_cases SET marks_locked=true WHERE case_id=$1 AND tenant_id=$2',
      [report.case_id, f.tenant],
    );
    await expect(
      scripts().reviewIncident(
        f.tenant,
        report.case_id,
        f.actor,
        { status: 'UNDER_REVIEW', reason: 'Do not bypass sanctions' },
        'ExamCell',
      ),
    ).rejects.toThrow('authorized UFM process');
  });

  it.each(['receipt', 'missing', 'incident', 'attendance'])(
    'rolls back %s and its audit on a real required audit SQL failure',
    async (operation) => {
      const f = await fixture();
      await mark(f);
      const failing = new FailingAudit(primary);
      const svc = scripts(primary, failing);
      const before = await actions(f);
      const task =
        operation === 'receipt'
          ? collect(f, 'ROLLBACK', svc)
          : operation === 'missing'
            ? missing(f, svc)
            : operation === 'incident'
              ? incident(f, svc)
              : mark(f, 'LATE', f.students[0], attendance(primary, failing));
      await expect(task).rejects.toThrow('division by zero');
      expect(await actions(f)).toEqual(before);
      const view = await scripts().reconciliation(
        f.tenant,
        f.schedule,
        'ExamCell',
      );
      expect(view.summary).toMatchObject({ received_booklets: 0, missing: 0 });
      expect(
        await scripts().listIncidents(f.tenant, f.schedule, 'ExamCell'),
      ).toHaveLength(0);
      expect(
        view.candidates.find((c) => c.student_user_id === f.students[0])
          ?.attendance_status,
      ).toBe('PRESENT');
    },
  );

  it('rolls back receipt, resolution and audits together when resolving a found script fails', async () => {
    const f = await fixture();
    await mark(f);
    await missing(f);
    class FailingResolutionAudit extends ExamCellAuditService {
      override async log(
        tenant: string,
        actor: string | undefined,
        payload: Parameters<ExamCellAuditService['log']>[2],
        manager?: EntityManager,
      ) {
        await super.log(tenant, actor, payload, manager);
        if (payload.action === 'EXAM_SCRIPT_RESOLVED')
          await manager!.query('SELECT 1/0');
      }
    }
    await expect(
      collect(
        f,
        'FOUND-FAIL',
        scripts(primary, new FailingResolutionAudit(primary)),
        'Found but audit unavailable',
      ),
    ).rejects.toThrow('division by zero');
    expect(
      (await scripts().reconciliation(f.tenant, f.schedule, 'ExamCell'))
        .summary,
    ).toMatchObject({ missing: 1, received_booklets: 0 });
  });

  it('serializes two real concurrent collection requests and commits only one receipt event', async () => {
    const f = await fixture();
    await mark(f);
    const gate = auditGate('ANSWER_SHEET_COLLECTED');
    const first = collect(f, 'CONCURRENT', scripts(primary, gate.audit));
    await gate.ready;
    const second = collect(f, 'CONCURRENT', scripts(competing));
    try {
      await waitForLock();
    } finally {
      gate.release();
    }
    const [a, b] = await Promise.all([first, second]);
    expect(a.sheet_id).toBe(b.sheet_id);
    expect(
      (await actions(f)).filter((a) => a === 'ANSWER_SHEET_COLLECTED'),
    ).toHaveLength(1);
  });

  it('publication-independent receipt first blocks a concurrent absence edit, which then fails safely', async () => {
    const f = await fixture();
    await mark(f);
    const gate = auditGate('ANSWER_SHEET_COLLECTED');
    const receipt = collect(f, 'RACE', scripts(primary, gate.audit));
    await gate.ready;
    const absence = mark(
      f,
      'ABSENT',
      f.students[0],
      attendance(competing),
    ).then(
      () => null,
      (e: unknown) => e,
    );
    try {
      await waitForLock();
    } finally {
      gate.release();
    }
    await receipt;
    expect(await absence).toMatchObject({ status: 409 });
    expect(
      (
        await scripts().reconciliation(f.tenant, f.schedule, 'ExamCell')
      ).candidates.find((c) => c.student_user_id === f.students[0])
        ?.attendance_status,
    ).toBe('PRESENT');
  });

  it('absence first blocks a concurrent receipt, which rejects the committed absence without a partial booklet', async () => {
    const f = await fixture();
    await mark(f);
    const gate = auditGate('EXAM_DAY_ATTENDANCE_MARKED');
    const absence = mark(
      f,
      'ABSENT',
      f.students[0],
      attendance(primary, gate.audit),
    );
    await gate.ready;
    const receipt = collect(f, 'AFTER-ABSENT', scripts(competing)).then(
      () => null,
      (e: unknown) => e,
    );
    try {
      await waitForLock();
    } finally {
      gate.release();
    }
    await absence;
    expect(await receipt).toMatchObject({ status: 409 });
    expect(
      await primary.query<Row[]>(
        'SELECT * FROM answer_sheet_tracking WHERE tenant_id=$1',
        [f.tenant],
      ),
    ).toHaveLength(0);
  });

  it('database constraints reject cross-tenant schedule/student links on new sheet and discrepancy writes', async () => {
    const f = await fixture();
    const other = await fixture();
    await expect(
      primary.query(
        "INSERT INTO answer_sheet_tracking(tenant_id,sheet_number,exam_schedule_id,student_user_id,qr_payload) VALUES($1,'FOREIGN',$2,$3,'forged')",
        [f.tenant, other.schedule, f.students[0]],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      primary.query(
        "INSERT INTO exam_script_discrepancies(tenant_id,exam_schedule_id,student_user_id,reason,reported_by) VALUES($1,$2,$3,'Invalid foreign candidate',$4)",
        [f.tenant, f.schedule, other.students[0], f.actor],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });
});
