import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { decodePDFRawStream, PDFDocument, PDFRawStream } from 'pdf-lib';
import { DataSource, EntityManager } from 'typeorm';
import { ObjectStorageService } from '../../storage/object-storage.service';
import { EnterpriseAuditService } from '../../core/audit/enterprise-audit.service';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { OfficialTranscriptPdfService } from './official-transcript-pdf.service';
import { OfficialTranscriptService } from './official-transcript.service';
import { SemesterResultsService } from './semester-results.service';

/**
 * Real PostgreSQL, actual application services and actual PDF generation.
 * Storage is deliberately an in-memory test double, not an S3/MinIO test.
 * No .env, schema synchronization, migration runner, resets or application DB.
 * Only the two missing document CREATE TABLE statements from existing migrations
 * are provisioned, after target/marker checks; no broad migration is executed.
 * Only UUID-owned disposable fixtures are removed during cleanup.
 */
const integration =
  process.env.FALCON_TEST_DB === '1' ? describe : describe.skip;

type Fixture = {
  tenant: string;
  students: string[];
  course: string;
};

async function until(check: () => Promise<boolean>, description: string) {
  const deadline = Date.now() + 10000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(description);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function pdfText(buffer: Buffer) {
  const document = await PDFDocument.load(buffer);
  const decoded: string[] = [];
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    const stream = Buffer.from(decodePDFRawStream(object).decode()).toString(
      'latin1',
    );
    for (const match of stream.matchAll(/<([0-9a-f]+)>\s*Tj/gi)) {
      decoded.push(Buffer.from(match[1], 'hex').toString('latin1'));
    }
  }
  return decoded.join('\n');
}

integration('isolated PostgreSQL official-document security', () => {
  jest.setTimeout(30000);
  const run = randomUUID();
  const sources: DataSource[] = [];
  const fixtures: Fixture[] = [];
  let db: DataSource, peer: DataSource, observer: DataSource;
  let roleId: number;
  const appNames = {
    db: `documents-${run}-primary`,
    peer: `documents-${run}-peer`,
  };

  beforeAll(async () => {
    const target = new URL(process.env.TEST_DATABASE_URL || 'http://invalid');
    if (
      process.env.FALCON_RESET_DB === '1' ||
      !['postgres:', 'postgresql:'].includes(target.protocol) ||
      target.hostname !== '127.0.0.1' ||
      target.port !== '55432' ||
      target.pathname !== '/falcon_examcell_test' ||
      target.search ||
      target.hash
    ) {
      throw new Error('Refusing non-isolated official-document database');
    }
    async function connect(name: string) {
      const source = new DataSource({
        type: 'postgres',
        url: target.toString(),
        synchronize: false,
        migrationsRun: false,
        entities: [],
        extra: {
          max: 3,
          application_name: name,
          statement_timeout: 15000,
        },
      });
      sources.push(source);
      await source.initialize();
      return source;
    }
    observer = await connect(`documents-${run}-observer`);
    const [identity] = await observer.query<
      Array<{ database_name: string; marker: string }>
    >(
      "SELECT current_database() AS database_name, shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()",
    );
    if (
      identity.database_name !== 'falcon_examcell_test' ||
      identity.marker !== 'falcon-examcell-disposable-integration-20261021'
    ) {
      throw new Error('Disposable PostgreSQL marker required before writes');
    }
    db = await connect(appNames.db);
    peer = await connect(appNames.peer);
    const documentTables = [
      {
        table: 'grade_cards',
        migration: '20260530144500_campus_os_gap_modules.sql',
      },
      {
        table: 'official_transcripts',
        migration: '20260718120000_enterprise_integration_e4.sql',
      },
    ];
    await db.transaction(async (manager) => {
      for (const { table, migration } of documentTables) {
        const source = readFileSync(
          resolve(__dirname, '../../../migrations', migration),
          'utf8',
        );
        // Preserve the repository DDL verbatim. Never execute neighboring seeds,
        // unrelated tables or the full application migration backlog.
        const definition = source.match(
          new RegExp(
            `CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\n\\);`,
          ),
        );
        if (!definition) {
          throw new Error(`Existing ${table} CREATE TABLE statement not found`);
        }
        await manager.query(definition[0]);
      }
    });
    const [role] = await db.query<Array<{ role_id: number }>>(
      "SELECT role_id FROM roles WHERE role_name='Student'",
    );
    if (!role) throw new Error('Existing isolated Student role is required');
    roleId = role.role_id;
  });

  afterAll(async () => {
    try {
      if (db?.isInitialized) {
        for (const fixture of fixtures.reverse()) {
          await db.transaction(async (manager) => {
            for (const table of [
              'official_transcripts',
              'grade_cards',
              'student_exam_reports',
              'exam_result_sessions',
              'academic_marks',
              'student_course_enrollments',
              'student_profiles',
              'academic_courses',
              'users',
            ]) {
              const [relation] = await manager.query<
                Array<{ present: boolean }>
              >('SELECT to_regclass($1) IS NOT NULL AS present', [
                `public.${table}`,
              ]);
              if (!relation.present) continue;
              await manager.query(`DELETE FROM ${table} WHERE tenant_id=$1`, [
                fixture.tenant,
              ]);
            }
            await manager.query('DELETE FROM tenants WHERE tenant_id=$1', [
              fixture.tenant,
            ]);
          });
        }
      }
    } finally {
      for (const source of sources.reverse()) {
        if (source.isInitialized) await source.destroy();
      }
    }
  });

  async function course(tenant: string, name: string) {
    const id = randomUUID();
    await db.query(
      'INSERT INTO academic_courses(course_id,tenant_id,course_code,course_name,credits) VALUES($1,$2,$3,$4,4)',
      [id, tenant, `DOC-${id.slice(0, 12)}`, name],
    );
    return id;
  }

  async function fixture() {
    const f = {
      tenant: randomUUID(),
      students: [randomUUID(), randomUUID()],
      course: '',
    };
    fixtures.push(f);
    await db.query(
      "INSERT INTO tenants(tenant_id,name,subdomain,pg_schema) VALUES($1,'Disposable official-document QA',$2,'public')",
      [f.tenant, `documents-${f.tenant}`],
    );
    for (const [index, student] of f.students.entries()) {
      await db.query(
        'INSERT INTO users(user_id,tenant_id,name,official_email,role_id,is_active) VALUES($1,$2,$3,$4,$5,true)',
        [
          student,
          f.tenant,
          `Disposable document student ${index}`,
          `${student}@example.invalid`,
          roleId,
        ],
      );
      await db.query(
        'INSERT INTO student_profiles(tenant_id,user_id,enrollment_no) VALUES($1,$2,$3)',
        [f.tenant, student, `DOC-${student}`],
      );
    }
    f.course = await course(f.tenant, 'Published snapshot course');
    for (const student of f.students) {
      await db.query(
        "INSERT INTO student_course_enrollments(tenant_id,student_user_id,course_id,semester,status,grade,grade_points) VALUES($1,$2,$3,4,'COMPLETED','A',8)",
        [f.tenant, student, f.course],
      );
    }
    return f;
  }

  async function cards(f: Fixture) {
    return observer.query<Array<Record<string, unknown>>>(
      'SELECT * FROM grade_cards WHERE tenant_id=$1 ORDER BY student_user_id',
      [f.tenant],
    );
  }

  it.each([
    ["status='PUBLISHED'", 'published status'],
    ['published_at=NOW()', 'publication timestamp'],
    [
      "payload=jsonb_set(payload,'{result_stage}','\"PROVISIONAL\"')",
      'provisional snapshot',
    ],
    [
      "payload=jsonb_set(payload,'{result_stage}','\"FINAL\"')",
      'final snapshot',
    ],
    [
      "status='WITHHELD',published_at=NOW()",
      'previously issued withheld snapshot',
    ],
  ])('refuses whole-batch regeneration with %s (%s)', async (mutation) => {
    const f = await fixture();
    const service = new SemesterResultsService(db);
    await service.generateGradeCards(f.tenant, 4);
    await db.query(
      `UPDATE grade_cards SET ${mutation} WHERE tenant_id=$1 AND student_user_id=$2`,
      [f.tenant, f.students[1]],
    );
    const before = await cards(f);
    await db.query(
      "UPDATE student_course_enrollments SET grade='B',grade_points=6 WHERE tenant_id=$1",
      [f.tenant],
    );
    await expect(
      service.generateGradeCards(f.tenant, 4),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await cards(f)).toEqual(before);
  });

  it('regenerates only unpublished drafts without duplicate rows', async () => {
    const f = await fixture();
    const service = new SemesterResultsService(db);
    await service.generateGradeCards(f.tenant, 4);
    const before = await cards(f);
    await db.query(
      "UPDATE student_course_enrollments SET grade='B',grade_points=6 WHERE tenant_id=$1",
      [f.tenant],
    );
    const result = await service.generateGradeCards(f.tenant, 4);
    const after = await cards(f);
    expect(result.generated_count).toBe(2);
    expect(after.map((card) => card.grade_card_id)).toEqual(
      before.map((card) => card.grade_card_id),
    );
    expect(after).toHaveLength(2);
    for (const card of after) {
      expect(card.status).toBe('DRAFT');
      expect(card.published_at).toBeNull();
      expect(card.payload).toMatchObject({ result_stage: 'DRAFT', sgpa: 6 });
    }
  });

  it('preserves a withheld final snapshot even when its legacy stage marker is draft', async () => {
    const f = await fixture();
    const service = new SemesterResultsService(db);
    await service.generateGradeCards(f.tenant, 4);
    await db.query(
      "UPDATE grade_cards SET status='WITHHELD',payload=jsonb_set(payload,'{final_published_at}',to_jsonb(NOW()::text)) WHERE tenant_id=$1 AND student_user_id=$2",
      [f.tenant, f.students[0]],
    );
    const before = await cards(f);
    await expect(
      service.publishProvisional(f.tenant, 4),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await cards(f)).toEqual(before);
  });

  it('retries provisional and final publication without changing the issued snapshots', async () => {
    const f = await fixture();
    const service = new SemesterResultsService(db);
    await service.generateGradeCards(f.tenant, 4);
    expect(await service.publishProvisional(f.tenant, 4)).toMatchObject({
      updated_count: 2,
    });
    const provisional = await cards(f);
    expect(await service.publishProvisional(f.tenant, 4)).toMatchObject({
      updated_count: 0,
    });
    expect(await cards(f)).toEqual(provisional);
    expect(await service.finalize(f.tenant, 4)).toMatchObject({
      updated_count: 2,
    });
    const final = await cards(f);
    expect(await service.finalize(f.tenant, 4)).toMatchObject({
      updated_count: 0,
    });
    expect(await cards(f)).toEqual(final);
    await expect(
      service.publishProvisional(f.tenant, 4),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await cards(f)).toEqual(final);
  });

  it('rejects a zero-row defensive upsert and rolls back the entire grade-card batch', async () => {
    const f = await fixture();
    await new SemesterResultsService(db).generateGradeCards(f.tenant, 4);
    const before = await cards(f);
    await db.query(
      "UPDATE student_course_enrollments SET grade='B',grade_points=6 WHERE tenant_id=$1",
      [f.tenant],
    );
    let updateCount = 0;
    let defensiveResult: unknown;
    // Deliberately exercise the SQL guard after its initial batch-level read.
    // The injected mutation uses the same real transaction and is rolled back
    // with the earlier draft update; it is not another approval workflow.
    const guardedSource = {
      transaction: <T>(work: (manager: EntityManager) => Promise<T>) =>
        db.transaction((manager) => {
          const injectedManager = {
            query: async <R>(
              sql: string,
              parameters?: unknown[],
            ): Promise<R> => {
              const guardedUpdate =
                /WITH\s+updated\s+AS\s*\(\s*UPDATE\s+grade_cards/i.test(sql);
              if (guardedUpdate) {
                updateCount++;
                if (updateCount === 2) {
                  await manager.query(
                    "UPDATE grade_cards SET status='PUBLISHED',published_at=NOW(),payload=jsonb_set(payload,'{result_stage}','\"FINAL\"') WHERE grade_card_id=$1 AND tenant_id=$2",
                    [parameters?.[0], f.tenant],
                  );
                }
              }
              const result = await manager.query<R>(sql, parameters);
              if (guardedUpdate && updateCount === 2) defensiveResult = result;
              return result;
            },
          } as unknown as EntityManager;
          return work(injectedManager);
        }),
    } as unknown as DataSource;
    await expect(
      new SemesterResultsService(guardedSource).generateGradeCards(f.tenant, 4),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(updateCount).toBe(2);
    expect(defensiveResult).toEqual([]);
    expect(await cards(f)).toEqual(before);
  });

  it('rolls back the first card if a later required card write fails in PostgreSQL', async () => {
    const f = await fixture();
    let insertCount = 0;
    // Controlled failure injection only: the application still runs a real
    // DataSource transaction and every query uses its real PostgreSQL manager.
    // SELECT 1/0 aborts PostgreSQL itself; rollback is not mocked.
    const failureSource = {
      transaction: <T>(work: (manager: EntityManager) => Promise<T>) =>
        db.transaction((manager) => {
          const injectedManager = {
            query: async <R>(
              sql: string,
              parameters?: unknown[],
            ): Promise<R> => {
              if (/INSERT\s+INTO\s+grade_cards/i.test(sql)) {
                insertCount++;
                if (insertCount === 2) {
                  await manager.query('SELECT 1 / 0 AS document_test_failure');
                }
              }
              return manager.query<R>(sql, parameters);
            },
          } as unknown as EntityManager;
          return work(injectedManager);
        }),
    } as unknown as DataSource;
    await expect(
      new SemesterResultsService(failureSource).generateGradeCards(f.tenant, 4),
    ).rejects.toThrow('division by zero');
    expect(insertCount).toBe(2);
    expect(await cards(f)).toEqual([]);
  });

  it('publishes the complete regenerated draft when generation wins the real PostgreSQL lock', async () => {
    const f = await fixture();
    await new SemesterResultsService(db).generateGradeCards(f.tenant, 4);
    await db.query(
      "UPDATE student_course_enrollments SET grade='B',grade_points=6 WHERE tenant_id=$1",
      [f.tenant],
    );
    const blocker = observer.createQueryRunner();
    await blocker.connect();
    await blocker.startTransaction();
    const pending: Promise<unknown>[] = [];
    try {
      await blocker.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`falcon:grade-cards:${f.tenant}:4`],
      );
      async function isBlocked(name: string) {
        const [row] = await observer.query<Array<{ blocked: boolean }>>(
          "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid))>0) AS blocked",
          [name],
        );
        return row.blocked;
      }
      const generation = new SemesterResultsService(peer).generateGradeCards(
        f.tenant,
        4,
      );
      pending.push(generation);
      await until(
        () => isBlocked(appNames.peer),
        'Generation did not wait on the real PostgreSQL semester lock',
      );
      const publication = new SemesterResultsService(db).publishProvisional(
        f.tenant,
        4,
      );
      pending.push(publication);
      await until(
        () => isBlocked(appNames.db),
        'Publication did not wait on the real PostgreSQL semester lock',
      );
      await blocker.commitTransaction();
      await generation;
      await publication;
      const final = await cards(f);
      expect(final).toHaveLength(2);
      for (const card of final) {
        expect(card.status).toBe('PUBLISHED');
        expect(card.published_at).not.toBeNull();
        expect(card.payload).toMatchObject({
          result_stage: 'PROVISIONAL',
          sgpa: 6,
        });
      }
    } finally {
      if (blocker.isTransactionActive) await blocker.rollbackTransaction();
      await Promise.allSettled(pending);
      await blocker.release();
    }
  });

  it('serializes real concurrent publication and regeneration without overwriting publication', async () => {
    const f = await fixture();
    await new SemesterResultsService(db).generateGradeCards(f.tenant, 4);
    const blocker = observer.createQueryRunner();
    await blocker.connect();
    await blocker.startTransaction();
    const pending: Promise<unknown>[] = [];
    try {
      await blocker.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`falcon:grade-cards:${f.tenant}:4`],
      );
      async function isBlocked(name: string) {
        const [row] = await observer.query<Array<{ blocked: boolean }>>(
          "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid))>0) AS blocked",
          [name],
        );
        return row.blocked;
      }
      // The two services use independent pools/connections. Queue publication
      // first, then generation; PostgreSQL lock waits are observed, not mocked.
      const publication = new SemesterResultsService(db).publishProvisional(
        f.tenant,
        4,
      );
      pending.push(publication);
      await until(
        () => isBlocked(appNames.db),
        'Publication did not wait on the real PostgreSQL semester lock',
      );
      const regeneration = new SemesterResultsService(peer)
        .generateGradeCards(f.tenant, 4)
        .then(
          () => ({ rejected: false, error: undefined }),
          (error: unknown) => ({ rejected: true, error }),
        );
      pending.push(regeneration);
      await until(
        () => isBlocked(appNames.peer),
        'Generation did not wait on the real PostgreSQL semester lock',
      );
      await blocker.commitTransaction();
      await publication;
      const outcome = await regeneration;
      expect(outcome.rejected).toBe(true);
      expect(outcome.error).toBeInstanceOf(ConflictException);
      for (const card of await cards(f)) {
        expect(card.status).toBe('PUBLISHED');
        expect(card.published_at).not.toBeNull();
        expect(card.payload).toMatchObject({ result_stage: 'PROVISIONAL' });
      }
    } finally {
      if (blocker.isTransactionActive) await blocker.rollbackTransaction();
      await Promise.allSettled(pending);
      await blocker.release();
    }
  });

  function transcriptService() {
    const documents: Buffer[] = [];
    const upload = jest.fn((_tenant: string, key: string, buffer: Buffer) => {
      documents.push(Buffer.from(buffer));
      return Promise.resolve({ url: `memory-test-only://${key}`, key });
    });
    const storage = {
      buildKey: (tenant: string, path: string) => `${tenant}/${path}`,
      upload,
    } as unknown as ObjectStorageService;
    return {
      service: new OfficialTranscriptPdfService(db, storage),
      upload,
      documents,
    };
  }

  async function transcript(f: Fixture, student = f.students[0]) {
    const id = randomUUID();
    await db.query(
      "INSERT INTO official_transcripts(transcript_id,tenant_id,student_user_id,semester,status) VALUES($1,$2,$3,4,'APPROVED')",
      [id, f.tenant, student],
    );
    return id;
  }

  async function declaredReport(
    f: Fixture,
    opts: {
      course?: string;
      student?: string;
      semester?: number;
      declared?: boolean;
      resultStatus?: string;
    } = {},
  ) {
    const courseId = opts.course ?? f.course;
    const sessionId = randomUUID();
    await db.query(
      "INSERT INTO exam_result_sessions(session_id,tenant_id,course_id,exam_type,semester,declared_at) VALUES($1,$2,$3,'END_TERM',$4,$5)",
      [
        sessionId,
        f.tenant,
        courseId,
        opts.semester ?? 4,
        opts.declared === false ? null : new Date(),
      ],
    );
    await db.query(
      "INSERT INTO student_exam_reports(tenant_id,session_id,student_user_id,course_id,exam_type,marks_obtained,max_marks,grade,result_status,declared_at) VALUES($1,$2,$3,$4,'END_TERM',80,100,'A',$5,NOW())",
      [
        f.tenant,
        sessionId,
        opts.student ?? f.students[0],
        courseId,
        opts.resultStatus ?? 'PASS',
      ],
    );
    return sessionId;
  }

  it('renders only the exact tenant/student/semester official declared snapshot, never live draft marks', async () => {
    const f = await fixture();
    const other = await fixture();
    await declaredReport(f);
    await declaredReport(other);
    const unpublished = await course(f.tenant, 'Unreleased session course');
    const wrongSemester = await course(f.tenant, 'Wrong semester course');
    const otherStudent = await course(f.tenant, 'Other student course');
    await declaredReport(f, { course: unpublished, declared: false });
    await declaredReport(f, { course: wrongSemester, semester: 5 });
    await declaredReport(f, {
      course: otherStudent,
      student: f.students[1],
    });
    await db.query(
      "INSERT INTO academic_marks(tenant_id,student_user_id,course_id,exam_type,marks_obtained,max_marks,status) VALUES($1,$2,$3,'END_TERM',1,100,'DRAFT')",
      [f.tenant, f.students[0], f.course],
    );
    await db.query(
      "UPDATE student_course_enrollments SET grade='F',grade_points=0 WHERE tenant_id=$1 AND student_user_id=$2",
      [f.tenant, f.students[0]],
    );
    const id = await transcript(f);
    const { service, upload, documents } = transcriptService();
    const result = await service.generate(f.tenant, id);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(documents[0]).toEqual(result.buffer);
    const text = await pdfText(result.buffer);
    expect(text).toContain('Published snapshot course: 80.00/100.00 (A)');
    expect(text).not.toContain('Unreleased session course');
    expect(text).not.toContain('Wrong semester course');
    expect(text).not.toContain('Other student course');
    expect(text).not.toContain(': 1.00/100.00');
    await expect(service.generate(other.tenant, id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('rejects a semester without official declaration before storage', async () => {
    const f = await fixture();
    await declaredReport(f, { declared: false });
    const { service, upload } = transcriptService();
    await expect(
      service.generate(f.tenant, await transcript(f)),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(upload).not.toHaveBeenCalled();
  });

  it('keeps every declared result across real generated PDF pages while excluding unpublished and wrong-semester rows', async () => {
    const f = await fixture();
    const expectedCodes: string[] = [];
    for (let index = 0; index < 80; index++) {
      const courseId = await course(f.tenant, `Declared long course ${index}`);
      const code = `PAGINATION${String(index).padStart(3, '0')}`;
      expectedCodes.push(code);
      await db.query(
        'UPDATE academic_courses SET course_code=$2 WHERE course_id=$1 AND tenant_id=$3',
        [courseId, code, f.tenant],
      );
      await declaredReport(f, { course: courseId });
    }
    const unpublished = await course(f.tenant, 'SECRET_UNPUBLISHED_COURSE');
    const otherSemester = await course(f.tenant, 'SECRET_OTHER_SEMESTER');
    await declaredReport(f, { course: unpublished, declared: false });
    await declaredReport(f, { course: otherSemester, semester: 5 });
    const { service, documents, upload } = transcriptService();

    const result = await service.generate(f.tenant, await transcript(f));
    const pdf = await PDFDocument.load(result.buffer);
    const text = await pdfText(result.buffer);

    expect(pdf.getPageCount()).toBeGreaterThan(1);
    for (const code of expectedCodes) {
      expect(text.match(new RegExp(code, 'g'))).toHaveLength(1);
    }
    expect(text).toContain('Declared long course 79');
    expect(text).not.toContain('SECRET_UNPUBLISHED_COURSE');
    expect(text).not.toContain('SECRET_OTHER_SEMESTER');
    expect(text.match(/OFFICIAL TRANSCRIPT/g)).toHaveLength(pdf.getPageCount());
    for (let page = 1; page <= pdf.getPageCount(); page++) {
      expect(text).toContain(`Page ${page} of ${pdf.getPageCount()}`);
    }
    expect(upload).toHaveBeenCalledTimes(1);
    expect(documents).toEqual([result.buffer]);
  });

  it('runs the actual batch, PDF generation and archived listing with real PostgreSQL rows and the correct notification recipient', async () => {
    const f = await fixture();
    await declaredReport(f);
    const pdf = transcriptService();
    // Only the external audit/notification delivery and object storage are test
    // doubles. Batch selection, inserts, UPDATE RETURNING, PDF creation and GET
    // listing queries execute against the safety-marked PostgreSQL database.
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const notify = { transcriptGenerated: jest.fn() };
    const actor = { userId: f.students[1], role: 'ExamCell' };
    const service = new OfficialTranscriptService(
      db,
      pdf.service,
      audit as unknown as EnterpriseAuditService,
      notify as unknown as NotificationEmitterService,
    );

    const response = await service.requestForSemester(f.tenant, 4, actor);

    expect(response).toMatchObject({ semester: 4, requested: 1 });
    expect(response.transcript_ids).toHaveLength(1);
    const transcriptId = response.transcript_ids[0];
    const [stored] = await db.query<
      Array<{
        transcript_id: string;
        student_user_id: string;
        semester: number;
        status: string;
        verification_code: string;
        pdf_url: string;
        generated_at: Date;
        archived_at: Date;
      }>
    >(
      'SELECT * FROM official_transcripts WHERE transcript_id=$1 AND tenant_id=$2',
      [transcriptId, f.tenant],
    );
    expect(stored).toMatchObject({
      transcript_id: transcriptId,
      student_user_id: f.students[0],
      semester: 4,
      status: 'ARCHIVED',
    });
    expect(stored.generated_at).toBeInstanceOf(Date);
    expect(stored.archived_at).toBeInstanceOf(Date);
    expect(stored.verification_code).toMatch(/^[A-F0-9]{16}$/);
    expect(stored.pdf_url).toBe(
      `memory-test-only://${f.tenant}/transcripts/${transcriptId}.pdf`,
    );
    const listed = (await service.listForTenant(f.tenant, {
      semester: 4,
      status: 'ARCHIVED',
    })) as Array<Record<string, unknown>>;
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      transcript_id: transcriptId,
      student_user_id: f.students[0],
      semester: 4,
      status: 'ARCHIVED',
    });
    expect(notify.transcriptGenerated).toHaveBeenCalledTimes(1);
    expect(notify.transcriptGenerated).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: f.tenant,
        userId: f.students[0],
        semester: 4,
        verificationCode: stored.verification_code,
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'TRANSCRIPT_GENERATED',
        tenantId: f.tenant,
        recordId: transcriptId,
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'TRANSCRIPT_BATCH_REQUESTED',
        newValue: { semester: 4, count: 1 },
      }),
    );
    expect(pdf.documents).toHaveLength(1);
    expect(await pdfText(pdf.documents[0])).toContain(
      'Published snapshot course: 80.00/100.00 (A)',
    );
  });

  it('lists only same-tenant transcripts with exact student/semester official declarations while preserving existing status filters', async () => {
    const f = await fixture();
    const other = await fixture();
    await declaredReport(f);
    await declaredReport(other);
    const valid = await transcript(f);
    await transcript(f, f.students[1]);
    await transcript(other);
    await transcript(f, other.students[0]);
    const wrongSemester = await transcript(f);
    await db.query(
      'UPDATE official_transcripts SET semester=5 WHERE transcript_id=$1 AND tenant_id=$2',
      [wrongSemester, f.tenant],
    );
    const service = new OfficialTranscriptService(
      db,
      {} as OfficialTranscriptPdfService,
      {} as EnterpriseAuditService,
      {} as NotificationEmitterService,
    );

    const rows = (await service.listForTenant(f.tenant)) as Array<{
      transcript_id: string;
      tenant_id: string;
      student_user_id: string;
      semester: number;
      status: string;
    }>;
    expect(rows.map((row) => row.transcript_id)).toEqual([valid]);
    expect(rows[0]).toMatchObject({
      tenant_id: f.tenant,
      student_user_id: f.students[0],
      semester: 4,
      status: 'APPROVED',
    });
    await expect(
      service.listForTenant(f.tenant, { status: 'GENERATED' }),
    ).resolves.toEqual([]);
    await expect(
      service.listForTenant(f.tenant, { semester: 5 }),
    ).resolves.toEqual([]);
    const otherRows = (await service.listForTenant(other.tenant)) as Array<{
      transcript_id: string;
    }>;
    expect(otherRows.map((row) => row.transcript_id)).not.toContain(valid);
  });

  it('does not expose transcript metadata for an undeclared report or a semester with a withheld official result', async () => {
    const f = await fixture();
    const session = await declaredReport(f, { declared: false });
    await transcript(f);
    const service = new OfficialTranscriptService(
      db,
      {} as OfficialTranscriptPdfService,
      {} as EnterpriseAuditService,
      {} as NotificationEmitterService,
    );
    await expect(service.listForTenant(f.tenant)).resolves.toEqual([]);
    await db.query(
      'UPDATE exam_result_sessions SET declared_at=NOW() WHERE session_id=$1 AND tenant_id=$2',
      [session, f.tenant],
    );
    // The authoritative migration makes a report declaration timestamp NOT
    // NULL. Exercise that actual constraint rather than weakening the isolated
    // schema to fabricate a legacy row that it cannot store.
    await expect(
      db.query(
        'UPDATE student_exam_reports SET declared_at=NULL WHERE session_id=$1 AND tenant_id=$2',
        [session, f.tenant],
      ),
    ).rejects.toMatchObject({ code: '23502' });
    expect(await service.listForTenant(f.tenant)).toHaveLength(1);
    await db.query(
      "UPDATE student_exam_reports SET declared_at=NOW(),result_status='WITHHELD' WHERE session_id=$1 AND tenant_id=$2",
      [session, f.tenant],
    );
    await expect(service.listForTenant(f.tenant)).resolves.toEqual([]);
  });

  it.each(['course', 'exam type'])(
    'rejects an officially dated report with a mismatched session %s',
    async (mismatch) => {
      const f = await fixture();
      const session = await declaredReport(f);
      if (mismatch === 'course') {
        const otherCourse = await course(f.tenant, 'Mismatched session course');
        await db.query(
          'UPDATE student_exam_reports SET course_id=$2 WHERE session_id=$1',
          [session, otherCourse],
        );
      } else {
        await db.query(
          "UPDATE student_exam_reports SET exam_type='CAT1' WHERE session_id=$1",
          [session],
        );
      }
      const { service, upload } = transcriptService();
      await expect(
        service.generate(f.tenant, await transcript(f)),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(upload).not.toHaveBeenCalled();
    },
  );

  it('rejects a transcript linked to another tenant student before storage', async () => {
    const f = await fixture();
    const other = await fixture();
    const { service, upload } = transcriptService();
    const id = await transcript(f, other.students[0]);
    await expect(service.generate(f.tenant, id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(upload).not.toHaveBeenCalled();
  });

  it('rejects withheld officially declared results before storage', async () => {
    const f = await fixture();
    await declaredReport(f, { resultStatus: 'WITHHELD' });
    const { service, upload } = transcriptService();
    await expect(
      service.generate(f.tenant, await transcript(f)),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(upload).not.toHaveBeenCalled();
  });
});
