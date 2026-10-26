import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { DataSource, EntityManager } from 'typeorm';
import { ObjectStorageService } from '../../storage/object-storage.service';
import { ExamCellAuditService } from '../exam-cell/exam-cell-audit.service';
import { ExamCellService } from '../exam-cell/exam-cell.service';
import { ExamCellEnterpriseService } from '../exam-cell/exam-cell-enterprise.service';
import {
  IssuedHallTicketService,
  issuedHallTicketKey,
} from './issued-hall-ticket.service';

// Real PostgreSQL + real local ObjectStorageService. Fixtures represent already
// issued documents; these tests do NOT assert an approval policy or new issuance.
// No application .env, schema reset, production connection, or live S3 service.
const integration =
  process.env.FALCON_TEST_DB === '1' ? describe : describe.skip;
const marker = 'falcon-examcell-disposable-integration-20261021';
const migration = resolve(
  __dirname,
  '../../..',
  'migrations/20261023120000_hall_ticket_issued_document_links.sql',
);
const scopeMigration = resolve(
  __dirname,
  '../../..',
  'migrations/20261023143000_hall_ticket_session_scope.sql',
);

function removeTestStorage(root: string) {
  if (
    dirname(resolve(root)) !== resolve(tmpdir()) ||
    !basename(root).startsWith('falcon-hall-ticket-it-')
  )
    throw new Error('Refusing unsafe temporary file cleanup');
  rmSync(root, { recursive: true }); // Only this suite's mkdtemp directory.
}

class FailingRetrievalAudit extends ExamCellAuditService {
  override async log(
    tenant: string,
    actor: string | undefined,
    payload: Parameters<ExamCellAuditService['log']>[2],
    manager?: EntityManager,
  ) {
    await super.log(tenant, actor, payload, manager);
    if (!manager) throw new Error('Transactional audit required');
    await manager.query('SELECT 1 / 0 AS injected_hall_ticket_audit_failure');
  }
}

integration('isolated PostgreSQL issued hall-ticket retrieval', () => {
  jest.setTimeout(30000);
  const run = randomUUID();
  const sources: DataSource[] = [];
  const tenants: string[] = [];
  const bytes = Buffer.from(
    '%PDF-1.4\nDisposable issued-ticket fixture\n%%EOF',
  );
  let primary: DataSource;
  let competing: DataSource;
  let observer: DataSource;
  let storage: ObjectStorageService;
  let root: string;
  let oldUploadPath: string | undefined;
  const clearance = () => Promise.resolve();

  const service = (audit?: ExamCellAuditService) =>
    new IssuedHallTicketService(
      primary,
      storage,
      audit ?? new ExamCellAuditService(primary),
    );

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
          max: 4,
          application_name: `hall-ticket-it-${run}-${name}`,
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
      `SELECT current_database() AS name, shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname=current_database()`,
    );
    if (identity?.name !== 'falcon_examcell_test' || identity.marker !== marker)
      throw new Error('Refusing database without disposable-test marker');
    primary = await connect('primary');
    competing = await connect('competing');
    // Only this additive SQL file, only after the exact target/marker checks.
    await primary.transaction((manager) =>
      manager.query(readFileSync(migration, 'utf8')),
    );
    await primary.transaction((manager) =>
      manager.query(readFileSync(scopeMigration, 'utf8')),
    );
    root = mkdtempSync(join(tmpdir(), 'falcon-hall-ticket-it-'));
    oldUploadPath = process.env.UPLOAD_PATH;
    process.env.UPLOAD_PATH = root;
    storage = new ObjectStorageService(new ConfigService({ S3_ENDPOINT: '' }));
  });

  afterAll(async () => {
    try {
      if (primary?.isInitialized)
        for (const tenant of tenants) {
          await primary.transaction(async (manager) => {
            await manager.query(
              `DELETE FROM exam_admit_card_entries WHERE run_id IN (SELECT run_id FROM exam_admit_card_runs WHERE tenant_id=$1)`,
              [tenant],
            );
            for (const table of [
              'exam_audit_logs',
              'exam_admit_card_runs',
              'exam_schedules',
              'hall_ticket_approvals',
              'exam_semester_registrations',
              'exam_form_windows',
              'exam_sessions',
              'users',
            ])
              await manager.query(`DELETE FROM ${table} WHERE tenant_id=$1`, [
                tenant,
              ]);
            await manager.query('DELETE FROM tenants WHERE tenant_id=$1', [
              tenant,
            ]);
          });
        }
    } finally {
      for (const db of sources.reverse())
        if (db.isInitialized) await db.destroy();
      if (root) {
        if (oldUploadPath === undefined) delete process.env.UPLOAD_PATH;
        else process.env.UPLOAD_PATH = oldUploadPath;
        removeTestStorage(root);
      }
    }
  });

  async function fixture() {
    const f = {
      tenant: randomUUID(),
      student: randomUUID(),
      actor: randomUUID(),
      session: randomUUID(),
      window: randomUUID(),
      registration: randomUUID(),
      approval: randomUUID(),
      run: randomUUID(),
      entry: randomUUID(),
      key: '',
    };
    tenants.push(f.tenant);
    await primary.query(
      `INSERT INTO tenants(tenant_id,name,subdomain,pg_schema) VALUES($1,'Disposable hall-ticket QA',$2,'public')`,
      [f.tenant, `test-${f.tenant}`],
    );
    for (const [id, role] of [
      [f.student, 'Student'],
      [f.actor, 'ExamCell'],
    ])
      await primary.query(
        `INSERT INTO users(user_id,tenant_id,name,official_email,role_id) VALUES($1,$2,'Disposable hall-ticket fixture',$3,(SELECT role_id FROM roles WHERE role_name=$4))`,
        [id, f.tenant, `${id}@example.invalid`, role],
      );
    await primary.query(
      `INSERT INTO exam_sessions(session_id,tenant_id,academic_year,session_name,semester,status) VALUES($1,$2,'2026-2027','Disposable examination',4,'OPEN')`,
      [f.session, f.tenant],
    );
    await primary.query(
      `INSERT INTO exam_form_windows(window_id,tenant_id,session_id,title,semester,opens_at,closes_at,status) VALUES($1,$2,$3,'Disposable window',4,NOW()-INTERVAL '1 day',NOW()+INTERVAL '1 day','OPEN')`,
      [f.window, f.tenant, f.session],
    );
    const [reg] = await primary.query<Array<{ reviewed_at: string }>>(
      `INSERT INTO exam_semester_registrations(registration_id,tenant_id,window_id,student_user_id,session_id,semester,status,reviewed_by,reviewed_at) VALUES($1,$2,$3,$4,$5,4,'APPROVED',$6,NOW()) RETURNING to_char(reviewed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS reviewed_at`,
      [f.registration, f.tenant, f.window, f.student, f.session, f.actor],
    );
    const [approval] = await primary.query<Array<{ approved_at: string }>>(
      `INSERT INTO hall_ticket_approvals(approval_id,tenant_id,student_user_id,semester,batch_label,registration_id,session_id,stage,eligibility_status,finance_status,exam_office_status,coe_status,approved_by,approved_at) VALUES($1,$2,$3,4,'Disposable batch',$4,$5,'APPROVED','APPROVED','APPROVED','APPROVED','APPROVED',$6,NOW()) RETURNING to_char(approved_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS approved_at`,
      [f.approval, f.tenant, f.student, f.registration, f.session, f.actor],
    );
    await primary.query(
      `INSERT INTO exam_admit_card_runs(run_id,tenant_id,batch_label,semester,session_id,run_by) VALUES($1,$2,'Disposable batch',4,$3,$4)`,
      [f.run, f.tenant, f.session, f.actor],
    );
    f.key = issuedHallTicketKey({
      tenant_id: f.tenant,
      student_user_id: f.student,
      session_id: f.session,
      entry_id: f.entry,
    });
    await storage.upload(f.tenant, f.key, bytes, 'application/pdf');
    const snapshot = {
      version: 1,
      tenant_id: f.tenant,
      student_user_id: f.student,
      session_id: f.session,
      registration_id: f.registration,
      window_id: f.window,
      approval_id: f.approval,
      semester: 4,
      approved_at: approval.approved_at,
      reviewed_at: reg.reviewed_at,
      document_bytes: bytes.length,
      exams: [
        {
          exam_schedule_id: randomUUID(),
          course_id: randomUUID(),
          subject_id: 1,
          room: 'R1',
          seat_number: 'S1',
        },
      ],
    };
    await primary.query(
      `INSERT INTO exam_admit_card_entries(entry_id,run_id,student_user_id,eligible,pdf_path,tenant_id,session_id,approval_id,issued_at,issuance_snapshot,document_sha256) VALUES($1,$2,$3,true,$4,$5,$6,$7,NOW(),$8,$9)`,
      [
        f.entry,
        f.run,
        f.student,
        f.key,
        f.tenant,
        f.session,
        f.approval,
        JSON.stringify(snapshot),
        createHash('sha256').update(bytes).digest('hex'),
      ],
    );
    return f;
  }

  const download = (
    f: Awaited<ReturnType<typeof fixture>>,
    reader = service(),
  ) => reader.download(f.student, f.tenant, f.entry, clearance);
  const audits = (tenant: string) =>
    primary.query<unknown[]>(
      `SELECT audit_id FROM exam_audit_logs WHERE tenant_id=$1 AND action='HALL_TICKET_DOCUMENT_RETRIEVED'`,
      [tenant],
    );

  async function waitForLock() {
    const until = Date.now() + 8000;
    while (Date.now() < until) {
      const [row] = await observer.query<Array<{ count: number }>>(
        `SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE application_name LIKE $1 AND wait_event_type='Lock'`,
        [`hall-ticket-it-${run}-%`],
      );
      if (row.count > 0) return;
      await new Promise((done) => setTimeout(done, 30));
    }
    throw new Error('No real PostgreSQL lock waiter observed');
  }

  it('reads the exact stored bytes and commits a required retrieval audit', async () => {
    const f = await fixture();
    expect(await download(f)).toEqual(bytes);
    expect(await audits(f.tenant)).toHaveLength(1);
  });

  it('does not starve upstream clearance when the shared PostgreSQL pool has one connection', async () => {
    const f = await fixture();
    const single = new DataSource({
      ...primary.options,
      extra: { max: 1, connectionTimeoutMillis: 2000, statement_timeout: 5000 },
    });
    sources.push(single);
    await single.initialize();
    const reader = new IssuedHallTicketService(
      single,
      storage,
      new ExamCellAuditService(single),
    );
    const result = await reader.download(
      f.student,
      f.tenant,
      f.entry,
      async () => {
        // Same pool, as used by the existing upstream services, not the held manager.
        await single.query('SELECT 1 AS upstream_clearance_connection');
      },
    );
    expect(result).toEqual(bytes);
    expect(await audits(f.tenant)).toHaveLength(1);
  });

  it('preserves legacy unlinked records on migration rerun but refuses their download', async () => {
    const f = await fixture();
    const legacy = randomUUID();
    await primary.query(
      `INSERT INTO exam_admit_card_entries(entry_id,run_id,student_user_id,eligible,pdf_path) VALUES($1,$2,$3,true,'legacy.pdf')`,
      [legacy, f.run, f.student],
    );
    await primary.transaction((manager) =>
      manager.query(readFileSync(migration, 'utf8')),
    );
    const [row] = await primary.query<
      Array<{ pdf_path: string; issued_at: null }>
    >(
      `SELECT pdf_path,issued_at FROM exam_admit_card_entries WHERE entry_id=$1`,
      [legacy],
    );
    expect(row).toEqual({ pdf_path: 'legacy.pdf', issued_at: null });
    await expect(
      service().download(f.student, f.tenant, legacy, clearance),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('rejects wrong tenant and wrong student at the database-backed lookup', async () => {
    const f = await fixture();
    await expect(
      service().download(f.student, randomUUID(), f.entry, clearance),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service().download(randomUUID(), f.tenant, f.entry, clearance),
    ).rejects.toMatchObject({ status: 404 });
    expect(await audits(f.tenant)).toHaveLength(0);
  });

  it('enforces approval/registration student and tenant consistency in PostgreSQL', async () => {
    const f = await fixture();
    await expect(
      primary.query(
        `UPDATE hall_ticket_approvals SET student_user_id=$2 WHERE approval_id=$1`,
        [f.approval, f.actor],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      primary.query(
        `UPDATE hall_ticket_approvals SET session_id=$2 WHERE approval_id=$1`,
        [f.approval, randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    expect(await download(f)).toEqual(bytes);
  });

  it('rejects partially populated issuance metadata', async () => {
    const f = await fixture();
    await expect(
      primary.query(
        `INSERT INTO exam_admit_card_entries(run_id,student_user_id,eligible,issued_at) VALUES($1,$2,true,NOW())`,
        [f.run, f.student],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it.each(['PENDING', 'REJECTED'])(
    'rejects registration state %s',
    async (status) => {
      const f = await fixture();
      await primary.query(
        'UPDATE exam_semester_registrations SET status=$2 WHERE registration_id=$1',
        [f.registration, status],
      );
      await expect(download(f)).rejects.toMatchObject({ status: 404 });
    },
  );

  it('rejects an inconsistent final approval', async () => {
    const f = await fixture();
    await primary.query(
      `UPDATE hall_ticket_approvals SET coe_status='PENDING' WHERE approval_id=$1`,
      [f.approval],
    );
    await expect(download(f)).rejects.toMatchObject({ status: 404 });
  });

  it('rejects a run for a different semester even when its session ID matches', async () => {
    const f = await fixture();
    await primary.query(
      'UPDATE exam_admit_card_runs SET semester=6 WHERE run_id=$1',
      [f.run],
    );
    await expect(download(f)).rejects.toMatchObject({ status: 404 });
  });

  it('prevents duplicate official tickets for the same student/session at the database boundary', async () => {
    const f = await fixture();
    await expect(
      primary.query(
        `INSERT INTO exam_admit_card_entries(entry_id,run_id,student_user_id,eligible,pdf_path,tenant_id,session_id,approval_id,issued_at,issuance_snapshot,document_sha256)
       SELECT $2,run_id,student_user_id,eligible,pdf_path,tenant_id,session_id,approval_id,issued_at,issuance_snapshot,document_sha256
       FROM exam_admit_card_entries WHERE entry_id=$1`,
        [f.entry, randomUUID()],
      ),
    ).rejects.toMatchObject({
      code: '23505',
      constraint: 'uq_hall_issued_student_session',
    });
    expect(await download(f)).toEqual(bytes);
  });

  it('rejects a changed approval timestamp instead of trusting the old snapshot', async () => {
    const f = await fixture();
    await primary.query(
      `UPDATE hall_ticket_approvals SET approved_at=approved_at+INTERVAL '1 microsecond' WHERE approval_id=$1`,
      [f.approval],
    );
    await expect(download(f)).rejects.toMatchObject({ status: 404 });
  });

  it('rejects a corrupted real stored file without a successful retrieval audit', async () => {
    const f = await fixture();
    await storage.upload(
      f.tenant,
      f.key,
      Buffer.from('%PDF-corrupted'),
      'application/pdf',
    );
    await expect(download(f)).rejects.toMatchObject({ status: 503 });
    expect(await audits(f.tenant)).toHaveLength(0);
  });

  it('rejects a forged storage reference without returning the referenced file', async () => {
    const f = await fixture();
    await primary.query(
      `UPDATE exam_admit_card_entries SET pdf_path='../../outside.pdf' WHERE entry_id=$1`,
      [f.entry],
    );
    await expect(download(f)).rejects.toMatchObject({ status: 404 });
    expect(await audits(f.tenant)).toHaveLength(0);
  });

  it('fails closed on a missing real stored file', async () => {
    const f = await fixture();
    unlinkSync(join(root, f.key));
    await expect(download(f)).rejects.toMatchObject({ status: 503 });
    expect(await audits(f.tenant)).toHaveLength(0);
  });

  it('rolls back a real audit insert on controlled PostgreSQL failure and preserves the issued document', async () => {
    const f = await fixture();
    await expect(
      download(f, service(new FailingRetrievalAudit(primary))),
    ).rejects.toMatchObject({ code: '22012' });
    expect(await audits(f.tenant)).toHaveLength(0);
    expect(readFileSync(join(root, f.key))).toEqual(bytes);
    expect(await download(f)).toEqual(bytes);
  });

  it('holds approval authorization until retrieval/audit commit; revocation then blocks later reads', async () => {
    const f = await fixture();
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((done) => {
      entered = done;
    });
    const gate = new Promise<void>((done) => {
      release = done;
    });
    class PausingRetrievalAudit extends ExamCellAuditService {
      override async log(
        tenant: string,
        actor: string | undefined,
        payload: Parameters<ExamCellAuditService['log']>[2],
        manager?: EntityManager,
      ) {
        await super.log(tenant, actor, payload, manager);
        entered();
        await gate;
      }
    }
    const reading = download(f, service(new PausingRetrievalAudit(primary)));
    await Promise.race([
      started,
      reading.then(() => {
        throw new Error('Retrieval completed before audit barrier');
      }),
    ]);
    const update = competing.query(
      `UPDATE hall_ticket_approvals SET stage='REJECTED' WHERE approval_id=$1`,
      [f.approval],
    );
    try {
      await waitForLock();
    } finally {
      release();
    }
    expect(await reading).toEqual(bytes);
    await update;
    await expect(download(f)).rejects.toMatchObject({ status: 404 });
    expect(await audits(f.tenant)).toHaveLength(1);
  });

  it('rechecks a revocation that commits while retrieval is waiting for the approval lock', async () => {
    const f = await fixture();
    const runner = competing.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query(
        `UPDATE hall_ticket_approvals SET stage='REJECTED' WHERE approval_id=$1`,
        [f.approval],
      );
      const result = download(f).then(
        () => ({ status: 200 }),
        (error: { status: number }) => error,
      );
      await waitForLock();
      await runner.commitTransaction();
      expect(await result).toMatchObject({ status: 404 });
      expect(await audits(f.tenant)).toHaveLength(0);
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
  });

  it('blocks legacy mutations without changing existing approved or issued PostgreSQL records', async () => {
    const f = await fixture();
    const audit = new ExamCellAuditService(primary);
    // Unused external sources intentionally absent: the policy interlock must
    // reject before eligibility, storage, notifications or any database write.
    const core = new ExamCellService(
      primary,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      audit,
    );
    const enterprise = new ExamCellEnterpriseService(
      primary,
      {} as never,
      {} as never,
      audit,
    );
    const state = () =>
      primary.query<Array<Record<string, unknown>>>(
        `SELECT
        (SELECT jsonb_agg(a) FROM hall_ticket_approvals a WHERE tenant_id=$1) AS approvals,
        (SELECT jsonb_agg(r) FROM exam_admit_card_runs r WHERE tenant_id=$1) AS runs,
        (SELECT jsonb_agg(e) FROM exam_admit_card_entries e WHERE tenant_id=$1) AS entries`,
        [f.tenant],
      );
    const before = await state();
    await expect(
      core.generateAdmitCards(
        f.tenant,
        { batch_label: 'Fixture', semester: 4 },
        f.actor,
      ),
    ).rejects.toMatchObject({ status: 503 });
    await expect(
      enterprise.syncHallTicketApprovals(f.tenant, 4, 'Fixture', 'ExamCell'),
    ).rejects.toMatchObject({ status: 503 });
    await expect(
      enterprise.advanceHallTicketApproval(
        f.tenant,
        f.approval,
        f.actor,
        { action: 'APPROVE' },
        'ExamCell',
      ),
    ).rejects.toMatchObject({ status: 503 });
    await expect(
      enterprise.bulkApproveHallTickets(
        f.tenant,
        f.actor,
        { session_id: f.session, approval_ids: [f.approval] },
        'ExamCell',
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(await state()).toEqual(before);
    expect(await audits(f.tenant)).toHaveLength(0);
    expect(await download(f)).toEqual(bytes);
  });

  it('rechecks registration rejection committed while retrieval waits for its registration lock', async () => {
    const f = await fixture();
    const runner = competing.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query(
        `UPDATE exam_semester_registrations SET status='REJECTED' WHERE registration_id=$1`,
        [f.registration],
      );
      const result = download(f).then(
        () => ({ status: 200 }),
        (error: { status: number }) => error,
      );
      await waitForLock();
      await runner.commitTransaction();
      expect(await result).toMatchObject({ status: 404 });
      expect(await audits(f.tenant)).toHaveLength(0);
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
  });

  it('links a timetable row to one same-tenant session without guessing legacy links', async () => {
    const f = await fixture();
    const other = await fixture();
    const id = randomUUID();
    await primary.query(
      `INSERT INTO exam_schedules(exam_schedule_id,tenant_id,exam_type,subject_id,exam_date,start_time,end_time,venue)
       VALUES($1,$2,'END_TERM',1,'2026-11-01','09:00','12:00','Disposable room')`,
      [id, f.tenant],
    );
    await primary.transaction((manager) =>
      manager.query(readFileSync(scopeMigration, 'utf8')),
    );
    expect(
      await primary.query(
        'SELECT session_id FROM exam_schedules WHERE exam_schedule_id=$1',
        [id],
      ),
    ).toEqual([{ session_id: null }]);
    await expect(
      primary.query(
        'UPDATE exam_schedules SET session_id=$2 WHERE exam_schedule_id=$1',
        [id, other.session],
      ),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'fk_hall_schedule_session',
    });
    await primary.query(
      'UPDATE exam_schedules SET session_id=$2 WHERE exam_schedule_id=$1',
      [id, f.session],
    );
    await expect(
      primary.query(
        'UPDATE exam_schedules SET tenant_id=NULL WHERE exam_schedule_id=$1',
        [id],
      ),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'ck_hall_schedule_session_tenant',
    });
    expect(
      await primary.query(
        'SELECT session_id FROM exam_schedules WHERE exam_schedule_id=$1',
        [id],
      ),
    ).toEqual([{ session_id: f.session }]);
  });

  it('refuses migration when duplicate issued business keys exist, without deduplication', async () => {
    const f = await fixture();
    // A transaction-local shadow table exercises the actual preflight SQL.
    // No public constraint is removed and no existing records are altered.
    await expect(
      primary.transaction(async (manager) => {
        await manager.query(
          'CREATE TEMP TABLE exam_admit_card_entries (LIKE public.exam_admit_card_entries INCLUDING DEFAULTS) ON COMMIT DROP',
        );
        await manager.query(
          `INSERT INTO pg_temp.exam_admit_card_entries
         SELECT * FROM public.exam_admit_card_entries WHERE entry_id=$1
         UNION ALL SELECT * FROM public.exam_admit_card_entries WHERE entry_id=$1`,
          [f.entry],
        );
        await manager.query(readFileSync(scopeMigration, 'utf8'));
      }),
    ).rejects.toMatchObject({
      code: '23505',
      message:
        'Duplicate officially issued hall tickets require manual review before applying session uniqueness',
    });
    expect(await download(f)).toEqual(bytes);
    const [index] = await primary.query<Array<{ present: boolean }>>(
      "SELECT to_regclass('public.uq_hall_issued_student_session') IS NOT NULL AS present",
    );
    expect(index.present).toBe(true);
  });

  it('excludes duplicate student/session tickets across different approvals without relying on the unique index', async () => {
    const f = await fixture();
    const duplicateApproval = randomUUID();
    const duplicateEntry = randomUUID();
    const duplicateKey = issuedHallTicketKey({
      tenant_id: f.tenant,
      student_user_id: f.student,
      session_id: f.session,
      entry_id: duplicateEntry,
    });
    await primary.transaction(async (manager) => {
      // Only transaction-local copies omit indexes, representing inconsistent
      // pre-migration records. Public constraints and fixture data stay intact.
      await manager.query(
        'CREATE TEMP TABLE hall_ticket_approvals (LIKE public.hall_ticket_approvals INCLUDING DEFAULTS) ON COMMIT DROP',
      );
      await manager.query(
        'CREATE TEMP TABLE exam_admit_card_entries (LIKE public.exam_admit_card_entries INCLUDING DEFAULTS) ON COMMIT DROP',
      );
      await manager.query(
        `INSERT INTO pg_temp.hall_ticket_approvals
         SELECT * FROM public.hall_ticket_approvals WHERE approval_id=$1`,
        [f.approval],
      );
      await manager.query(
        `INSERT INTO pg_temp.hall_ticket_approvals
         SELECT (jsonb_populate_record(NULL::pg_temp.hall_ticket_approvals,
           to_jsonb(a) || jsonb_build_object('approval_id',$2::uuid))).*
         FROM public.hall_ticket_approvals a WHERE a.approval_id=$1`,
        [f.approval, duplicateApproval],
      );
      await manager.query(
        `INSERT INTO pg_temp.exam_admit_card_entries
         SELECT * FROM public.exam_admit_card_entries WHERE entry_id=$1`,
        [f.entry],
      );
      await manager.query(
        `INSERT INTO pg_temp.exam_admit_card_entries
         SELECT (jsonb_populate_record(NULL::pg_temp.exam_admit_card_entries,
           to_jsonb(e) || jsonb_build_object('entry_id',$2::uuid,
             'approval_id',$3::uuid,'pdf_path',$4::text,
             'issuance_snapshot',e.issuance_snapshot ||
               jsonb_build_object('approval_id',$3::uuid)))).*
         FROM public.exam_admit_card_entries e WHERE e.entry_id=$1`,
        [f.entry, duplicateEntry, duplicateApproval, duplicateKey],
      );
      const [duplicates] = await manager.query<
        Array<{ entries: number; approvals: number }>
      >(
        `SELECT COUNT(*)::int AS entries,
           COUNT(DISTINCT approval_id)::int AS approvals
         FROM pg_temp.exam_admit_card_entries
         WHERE tenant_id=$1 AND student_user_id=$2 AND session_id=$3
           AND issued_at IS NOT NULL`,
        [f.tenant, f.student, f.session],
      );
      expect(duplicates).toEqual({ entries: 2, approvals: 2 });
      // Bind the actual service's queries to this PostgreSQL transaction so
      // they see the temporary copies. No SQL results or locks are mocked.
      const transactionDb = new Proxy(primary, {
        get(target, property, receiver): unknown {
          return property === 'manager'
            ? manager
            : Reflect.get(target, property, receiver);
        },
      });
      const reader = new IssuedHallTicketService(
        transactionDb,
        storage,
        new ExamCellAuditService(primary),
      );
      expect(await reader.list(f.student, f.tenant)).toEqual([]);
      let clearanceChecks = 0;
      for (const entry of [f.entry, duplicateEntry])
        await expect(
          reader.download(f.student, f.tenant, entry, () => {
            clearanceChecks++;
            return Promise.resolve();
          }),
        ).rejects.toMatchObject({ status: 404 });
      expect(clearanceChecks).toBe(0);
      expect(await audits(f.tenant)).toHaveLength(0);
    });
    // Temp tables are gone; the real fixture and public uniqueness remain.
    const [index] = await primary.query<Array<{ present: boolean }>>(
      "SELECT to_regclass('public.uq_hall_issued_student_session') IS NOT NULL AS present",
    );
    expect(index.present).toBe(true);
    expect(await download(f)).toEqual(bytes);
  });

  it.each(['commit', 'rollback'] as const)(
    'the real unique index serializes competing fixture inserts when the first transaction %ss',
    async (outcome) => {
      const f = await fixture();
      const [original] = await primary.query<
        Array<{ value: Record<string, unknown> }>
      >(
        'SELECT to_jsonb(e) AS value FROM exam_admit_card_entries e WHERE entry_id=$1',
        [f.entry],
      );
      // Only this test's own issued fixture is replaced to exercise two inserts.
      // This proves the constraint, not the still-blocked issuance service.
      await primary.query(
        'DELETE FROM exam_admit_card_entries WHERE entry_id=$1 AND tenant_id=$2',
        [f.entry, f.tenant],
      );
      const secondId = randomUUID();
      const secondKey = issuedHallTicketKey({
        tenant_id: f.tenant,
        student_user_id: f.student,
        session_id: f.session,
        entry_id: secondId,
      });
      await storage.upload(f.tenant, secondKey, bytes, 'application/pdf');
      const insert =
        'INSERT INTO exam_admit_card_entries SELECT (jsonb_populate_record(NULL::exam_admit_card_entries, $1::jsonb)).*';
      const runner = primary.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      try {
        await runner.query(insert, [JSON.stringify(original.value)]);
        const second = competing
          .query(insert, [
            JSON.stringify({
              ...original.value,
              entry_id: secondId,
              pdf_path: secondKey,
            }),
          ])
          .then(
            () => ({ code: 'inserted' }),
            (error: { code: string }) => ({ code: error.code }),
          );
        await waitForLock();
        if (outcome === 'commit') await runner.commitTransaction();
        else await runner.rollbackTransaction();
        expect(await second).toEqual({
          code: outcome === 'commit' ? '23505' : 'inserted',
        });
        const winner = outcome === 'commit' ? f.entry : secondId;
        expect(
          await primary.query(
            'SELECT entry_id FROM exam_admit_card_entries WHERE tenant_id=$1 AND student_user_id=$2 AND session_id=$3',
            [f.tenant, f.student, f.session],
          ),
        ).toEqual([{ entry_id: winner }]);
        expect(
          await service().download(f.student, f.tenant, winner, clearance),
        ).toEqual(bytes);
      } finally {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
        await runner.release();
      }
    },
  );
});
