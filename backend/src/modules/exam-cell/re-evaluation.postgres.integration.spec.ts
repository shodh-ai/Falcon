import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'dotenv';
import { DataSource, EntitySchema, QueryRunner } from 'typeorm';
import { ExamApplication } from '../../entities/exam-application.entity';
import { ExamsService } from '../exams/exams.service';
import { ExamCellService } from './exam-cell.service';
import { ResultControlService } from './result-control.service';

jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));

/**
 * Opt in with FALCON_REEVAL_PG=1. Uses local backend .env settings, or
 * TEST_DATABASE_URL. Every fixture is in an uncommitted, uniquely named schema;
 * public is excluded from search_path and the outer transaction is rolled back.
 * No real finance calls, notifications, migrations, resets or seeds are run.
 */
const describePostgres =
  process.env.FALCON_REEVAL_PG === '1' ? describe : describe.skip;

const FixtureUser = new EntitySchema({
  name: 'ReEvaluationFixtureUser',
  tableName: 'users',
  columns: {
    user_id: { type: 'uuid', primary: true },
    tenant_id: { type: 'uuid' },
    name: { type: 'text' },
    official_email: { type: 'text' },
    is_active: { type: 'boolean' },
    deleted_at: { type: 'timestamptz', nullable: true, deleteDate: true },
  },
});

describePostgres(
  'Re-evaluation services against isolated PostgreSQL fixtures',
  () => {
    jest.setTimeout(30_000);
    const schema = `reeval_fixture_${randomUUID().replace(/-/g, '')}`;
    const tenant = randomUUID();
    const otherTenant = randomUUID();
    const student = randomUUID();
    const otherStudent = randomUUID();
    const foreignStudent = randomUUID();
    const faculty = randomUUID();
    const otherFaculty = randomUUID();
    const foreignFaculty = randomUUID();
    const actor = randomUUID();
    const result = randomUUID();
    const alternateResult = randomUUID();
    const course = randomUUID();
    const demand = randomUUID();
    let source: DataSource;
    let runner: QueryRunner;
    let exams: ExamsService;
    let examCell: ExamCellService;
    let resultControl: ResultControlService;
    let beforePublic: unknown;
    const finance = { createDemand: jest.fn() };
    const notify = {
      examRevaluationAssigned: jest.fn(),
      examRevaluationReportReady: jest.fn(),
      examRevaluationPublished: jest.fn(),
      examResultsPublished: jest.fn(),
    };

    async function publicFingerprint() {
      const fingerprints: unknown[] = [];
      for (const [table, key] of [
        ['exam_applications', 'exam_application_id'],
        ['academic_exam_results', 'result_id'],
        ['academic_marks', 'mark_id'],
        ['student_exam_reports', 'report_id'],
        ['student_course_enrollments', 'enrollment_id'],
        ['exam_result_sessions', 'session_id'],
      ]) {
        fingerprints.push(
          await runner.query(
            `SELECT COUNT(*)::int AS count,
                md5(COALESCE(string_agg(to_jsonb(row)::text, '' ORDER BY row.${key}), '')) AS fingerprint
         FROM public.${table} row`,
          ),
        );
      }
      return fingerprints;
    }

    beforeAll(async () => {
      let local: Record<string, string> = {};
      try {
        local = parse(readFileSync(join(process.cwd(), '.env')));
      } catch {
        /* Environment-only CI is supported. */
      }
      const setting = (key: string) => process.env[key] ?? local[key];
      const url = process.env.TEST_DATABASE_URL;
      source = new DataSource({
        type: 'postgres',
        ...(url
          ? { url }
          : {
              host: setting('DB_HOST') ?? 'localhost',
              port: Number(setting('DB_PORT') ?? 5433),
              username:
                setting('DB_USERNAME') ?? setting('DB_USER') ?? 'postgres',
              password: setting('DB_PASSWORD') ?? '',
              database: setting('DB_DATABASE') ?? 'university_governance',
            }),
        schema,
        entities: [ExamApplication, FixtureUser],
        synchronize: false,
        migrationsRun: false,
        installExtensions: false,
        logging: false,
        extra: { connectionTimeoutMillis: 5_000 },
      });
      await source.initialize();
      runner = source.createQueryRunner();
      await runner.connect();
      beforePublic = await publicFingerprint();
      await runner.startTransaction();
      await runner.query(`CREATE SCHEMA "${schema}"`);
      await runner.query(`SET LOCAL search_path TO "${schema}", pg_catalog`);
      expect(
        (await runner.query('SHOW search_path'))[0].search_path,
      ).not.toContain('public');
      await runner.query(`
      CREATE TABLE users (
        user_id uuid PRIMARY KEY, tenant_id uuid NOT NULL, name text NOT NULL,
        official_email text NOT NULL, is_active boolean NOT NULL DEFAULT true,
        deleted_at timestamptz
      );
      CREATE TABLE roles (role_id uuid PRIMARY KEY, role_name text NOT NULL);
      CREATE TABLE user_roles (user_id uuid REFERENCES users, role_id uuid REFERENCES roles);
      CREATE TABLE academic_subjects (
        subject_id int PRIMARY KEY, subject_code text NOT NULL, subject_name text NOT NULL,
        deleted_at timestamptz
      );
      CREATE TABLE academic_courses (
        course_id uuid PRIMARY KEY, tenant_id uuid NOT NULL, course_code text NOT NULL,
        course_name text DEFAULT 'Fixture course', deleted_at timestamptz
      );
      CREATE TABLE academic_grading_policies (policy_id int PRIMARY KEY, rules jsonb);
      CREATE TABLE exam_result_sessions (
        session_id uuid PRIMARY KEY, tenant_id uuid NOT NULL, course_id uuid REFERENCES academic_courses,
        exam_type text NOT NULL, semester int NOT NULL, max_marks numeric(6,2), pass_marks numeric(6,2),
        grading_policy_id int REFERENCES academic_grading_policies, declared_at timestamptz,
        declared_by uuid, declaration_note text, entry_status text, marks_locked boolean,
        updated_at timestamptz DEFAULT NOW(), deleted_at timestamptz
      );
      CREATE TABLE academic_marks (
        mark_id uuid PRIMARY KEY, tenant_id uuid NOT NULL, student_user_id uuid REFERENCES users,
        course_id uuid REFERENCES academic_courses, exam_type text NOT NULL,
        marks_obtained numeric(6,2), max_marks numeric(6,2), status text,
        published_at timestamptz DEFAULT NOW(), updated_at timestamptz DEFAULT NOW()
      );
      CREATE TABLE student_exam_reports (
        report_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
        session_id uuid REFERENCES exam_result_sessions, student_user_id uuid REFERENCES users,
        course_id uuid REFERENCES academic_courses, exam_type text, marks_obtained numeric(6,2),
        max_marks numeric(6,2), percent numeric(5,2), grade text, grade_points numeric(4,2),
        result_status text, report_summary text, declared_at timestamptz DEFAULT NOW(), notified_at timestamptz,
        UNIQUE (session_id,student_user_id)
      );
      CREATE TABLE student_course_enrollments (
        enrollment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
        student_user_id uuid REFERENCES users, course_id uuid REFERENCES academic_courses,
        semester int, grade text, grade_points numeric(4,2), status text
      );
      CREATE TABLE exam_result_dean_approval_requests (tenant_id uuid,session_id uuid,status text);
      CREATE TABLE academic_exam_results (
        result_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_user_id uuid REFERENCES users,
        subject_id int REFERENCES academic_subjects, course_id uuid REFERENCES academic_courses,
        tenant_id uuid, exam_session text, exam_type text, status text NOT NULL,
        marks_obtained numeric(6,2), max_marks numeric(6,2), grade text,grade_points numeric(4,2),
        deleted_at timestamptz, updated_at timestamptz DEFAULT NOW()
      );
      CREATE UNIQUE INDEX uq_academic_exam_results_course_exam
        ON academic_exam_results (tenant_id,student_user_id,course_id,exam_type)
        WHERE tenant_id IS NOT NULL AND course_id IS NOT NULL AND exam_type IS NOT NULL;
      CREATE TABLE exam_applications (
        exam_application_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        student_user_id uuid NOT NULL REFERENCES users,
        subject_id int NOT NULL REFERENCES academic_subjects,
        exam_result_id uuid REFERENCES academic_exam_results(result_id) ON DELETE RESTRICT,
        application_type varchar(20) NOT NULL, fee_status varchar(20) NOT NULL DEFAULT 'PENDING',
        status varchar(20) NOT NULL DEFAULT 'PENDING', finance_demand_id uuid,
        assigned_faculty_user_id uuid REFERENCES users, assigned_by uuid REFERENCES users,
        original_marks numeric(6,2), revised_marks numeric(6,2), report_notes text,
        assigned_at timestamptz, report_submitted_at timestamptz, published_at timestamptz,
        published_by uuid REFERENCES users, created_at timestamptz NOT NULL DEFAULT NOW(),
        deleted_at timestamptz
      );
      CREATE TABLE parent_student_links (student_user_id uuid REFERENCES users, parent_mobile text, parent_name text);
      CREATE TABLE integration_jobs (
        tenant_id uuid NOT NULL, integration_type text NOT NULL,
        entity_type text NOT NULL, payload jsonb NOT NULL
      );
    `);
      const migration = readFileSync(
        join(
          process.cwd(),
          'migrations/20261019130000_exam_result_source_provenance.sql',
        ),
        'utf8',
      );
      await runner.query(migration);
      await runner.query(migration);
      const constraints = await runner.query(
        `SELECT confdeltype FROM pg_constraint WHERE conrelid='academic_exam_results'::regclass AND conname LIKE 'fk_exam_result_%_source'`,
      );
      expect(constraints).toHaveLength(3);
      expect(constraints.every((row: any) => row.confdeltype === 'r')).toBe(
        true,
      );
      const index = await runner.query(
        `SELECT indexdef FROM pg_indexes WHERE schemaname=$1 AND indexname='uq_academic_exam_results_course_exam'`,
        [schema],
      );
      expect(index[0].indexdef).toContain('result_session_id IS NULL');
      // The manager is pinned to this QueryRunner. Its transaction() uses actual
      // nested SAVEPOINTs, keeping service commits inside our rollback boundary.
      exams = new ExamsService(
        {} as never,
        runner.manager.getRepository(ExamApplication),
        runner.manager.getRepository(FixtureUser) as never,
        runner.manager as never,
        finance as never,
        {} as never,
        {} as never,
      );
      examCell = new ExamCellService(
        runner.manager as never,
        finance as never,
        {} as never,
        notify as never,
        {} as never,
        {} as never,
      );
      resultControl = new ResultControlService(
        runner.manager as never,
        notify as never,
        { hasAction: jest.fn().mockResolvedValue(true) } as never,
      );
    });

    beforeEach(async () => {
      jest.clearAllMocks();
      finance.createDemand.mockResolvedValue({ demand_id: demand });
      await runner.startTransaction();
      const people = [
        [student, tenant],
        [otherStudent, tenant],
        [foreignStudent, otherTenant],
        [faculty, tenant],
        [otherFaculty, tenant],
        [foreignFaculty, otherTenant],
        [actor, tenant],
      ];
      for (const [id, tenantId] of people) {
        await runner.query(
          'INSERT INTO users (user_id, tenant_id, name, official_email) VALUES ($1,$2,$3,$4)',
          [id, tenantId, `Fixture ${id}`, `${id}@fixture.invalid`],
        );
      }
      const role = randomUUID();
      await runner.query("INSERT INTO roles VALUES ($1, 'Faculty')", [role]);
      for (const id of [faculty, otherFaculty, foreignFaculty]) {
        await runner.query('INSERT INTO user_roles VALUES ($1,$2)', [id, role]);
      }
      await runner.query(
        "INSERT INTO academic_subjects VALUES (1,'FIXTURE101','Fixture subject',NULL),(2,'OTHER101','Other subject',NULL)",
      );
      await runner.query(
        "INSERT INTO academic_courses (course_id,tenant_id,course_code) VALUES ($1,$2,'FIXTURE101')",
        [course, tenant],
      );
      await addResult(result, {});
      await attachSource(result);
      await addResult(alternateResult, {
        max: 100,
        marks: 42,
        session: 'ANOTHER-ATTEMPT',
      });
    });

    afterEach(async () => {
      if (runner?.isTransactionActive) await runner.rollbackTransaction();
    });

    afterAll(async () => {
      try {
        if (runner?.isTransactionActive) await runner.rollbackTransaction();
        if (runner) {
          expect(
            (
              await runner.query('SELECT to_regnamespace($1) AS namespace', [
                schema,
              ])
            )[0].namespace,
          ).toBeNull();
          expect(await publicFingerprint()).toEqual(beforePublic);
        }
      } finally {
        if (runner && !runner.isReleased) await runner.release();
        if (source?.isInitialized) await source.destroy();
      }
    });

    async function addResult(
      id: string,
      change: {
        owner?: string;
        tenantId?: string;
        subject?: number;
        status?: string;
        max?: number | null;
        marks?: number | null;
        deleted?: boolean;
        session?: string;
      },
    ) {
      await runner.query(
        `INSERT INTO academic_exam_results
       (result_id,student_user_id,subject_id,course_id,tenant_id,exam_session,exam_type,status,marks_obtained,max_marks,deleted_at)
       VALUES ($1,$2,$3,$4,$5,$6,'END_TERM',$7,$8,$9,$10)`,
        [
          id,
          change.owner ?? student,
          change.subject ?? 1,
          id === result || id === alternateResult ? course : null,
          change.tenantId ?? tenant,
          change.session ?? 'FIXTURE-2026',
          change.status ?? 'PUBLISHED',
          change.marks === undefined ? 0 : change.marks,
          change.max === undefined ? 30 : change.max,
          change.deleted ? new Date() : null,
        ],
      );
      return id;
    }

    const policy = {
      bands: [
        { minPercent: 50, maxPercent: 100, grade: 'P', gradePoints: 8 },
        { minPercent: 0, maxPercent: 49.99, grade: 'F', gradePoints: 0 },
      ],
    };
    async function attachSource(id: string) {
      const sessionId = randomUUID(),
        markId = randomUUID(),
        reportId = randomUUID();
      await runner.query(
        'INSERT INTO academic_grading_policies VALUES (1,$1)',
        [policy],
      );
      await runner.query(
        `INSERT INTO exam_result_sessions
      (session_id,tenant_id,course_id,exam_type,semester,max_marks,pass_marks,grading_policy_id,declared_at)
      VALUES ($1,$2,$3,'END_TERM',4,30,15,1,NOW())`,
        [sessionId, tenant, course],
      );
      await runner.query(
        `INSERT INTO academic_marks
      (mark_id,tenant_id,student_user_id,course_id,exam_type,marks_obtained,max_marks,status)
      VALUES ($1,$2,$3,$4,'END_TERM',0,30,'PUBLISHED')`,
        [markId, tenant, student, course],
      );
      await runner.query(
        `INSERT INTO student_exam_reports
      (report_id,tenant_id,session_id,student_user_id,course_id,exam_type,marks_obtained,max_marks,grade,grade_points,result_status)
      VALUES ($1,$2,$3,$4,$5,'END_TERM',0,30,'F',0,'FAIL')`,
        [reportId, tenant, sessionId, student, course],
      );
      await runner.query(
        `INSERT INTO student_course_enrollments
      (tenant_id,student_user_id,course_id,semester,grade,grade_points,status) VALUES ($1,$2,$3,4,'F',0,'FAILED')`,
        [tenant, student, course],
      );
      await runner.query(
        `UPDATE academic_exam_results SET result_session_id=$2,source_mark_id=$3,source_report_id=$4,
      source_mark_updated_at=(SELECT updated_at FROM academic_marks WHERE mark_id=$3),
      grading_policy_snapshot=$5::jsonb,pass_marks_snapshot=15,grade='F',grade_points=0 WHERE result_id=$1`,
        [id, sessionId, markId, reportId, JSON.stringify(policy)],
      );
    }

    async function application(
      change: {
        state?: string;
        linkedResult?: string | null;
        owner?: string;
        assignedFaculty?: string;
        original?: number;
        revised?: number;
        paid?: boolean;
      } = {},
    ) {
      const id = randomUUID();
      await runner.query(
        `INSERT INTO exam_applications
       (exam_application_id,student_user_id,subject_id,exam_result_id,application_type,fee_status,status,
        assigned_faculty_user_id,original_marks,revised_marks,report_notes,report_submitted_at)
       VALUES ($1,$2,1,$3,'RE_EVALUATION',$4,$5,$6,$7,$8,$9,$10)`,
        [
          id,
          change.owner ?? student,
          change.linkedResult === undefined ? result : change.linkedResult,
          change.paid === false ? 'PENDING' : 'PAID',
          change.state ?? 'PENDING',
          change.assignedFaculty ?? null,
          change.original ?? 0,
          change.revised ?? null,
          change.state === 'UNDER_REVIEW' ? 'Fixture reassessment' : null,
          change.state === 'UNDER_REVIEW' ? new Date() : null,
        ],
      );
      return id;
    }

    const getApplication = async (id: string) =>
      (
        await runner.query(
          'SELECT * FROM exam_applications WHERE exam_application_id=$1',
          [id],
        )
      )[0];
    const getResult = async (id = result) =>
      (
        await runner.query(
          'SELECT * FROM academic_exam_results WHERE result_id=$1',
          [id],
        )
      )[0];
    const report = (
      id: string,
      revised = 30,
      reviewer = faculty,
      tenantId = tenant,
    ) =>
      examCell.submitReEvaluationReport(
        reviewer,
        id,
        {
          revised_marks: revised,
          report_notes: '  Fixture reassessment complete  ',
        },
        tenantId,
      );

    it('uses a real pinned PostgreSQL connection and its native UPDATE RETURNING shape', async () => {
      expect(source.isInitialized).toBe(true);
      expect(runner.isTransactionActive).toBe(true);
      expect(
        (await runner.query('SELECT current_schema() AS schema'))[0].schema,
      ).toBe(schema);
      const returned = await runner.query(
        'UPDATE users SET name=name WHERE user_id=$1 RETURNING user_id',
        [student],
      );
      expect(returned).toEqual([[{ user_id: student }], 1]);
    });

    it('creates the exact zero-mark result, assigns, submits the maximum and publishes only that result', async () => {
      const created = await exams.createApplication(
        student,
        {
          subject_id: 1,
          application_type: 'RE_EVALUATION',
          exam_result_id: result,
        },
        tenant,
      );
      expect(created).toMatchObject({
        exam_result_id: result,
        original_marks: 0,
        status: 'DRAFT',
        finance_demand_id: demand,
      });
      expect(finance.createDemand).toHaveBeenCalledWith(
        expect.objectContaining({ total_amount: 500 }),
        tenant,
      );
      // Payment processing is outside this test: promote only our scratch fixture.
      await runner.query(
        "UPDATE exam_applications SET fee_status='PAID',status='PENDING' WHERE exam_application_id=$1",
        [created.exam_application_id],
      );
      const assigned = await examCell.assignReEvaluation(
        tenant,
        actor,
        created.exam_application_id,
        faculty,
      );
      expect(assigned).toMatchObject({
        status: 'ASSIGNED',
        exam_result_id: result,
        exam_max_marks: 30,
      });
      const submitted = await report(created.exam_application_id);
      expect(submitted).toMatchObject({
        status: 'UNDER_REVIEW',
        report_notes: 'Fixture reassessment complete',
      });
      expect(Number(submitted.revised_marks)).toBe(30);
      const published = await examCell.publishReEvaluation(
        tenant,
        actor,
        created.exam_application_id,
      );
      expect(published.status).toBe('COMPLETED');
      expect(Number((await getResult()).marks_obtained)).toBe(30);
      expect(Number((await getResult(alternateResult)).marks_obtained)).toBe(
        42,
      );
      expect(await getResult()).toMatchObject({
        grade: 'P',
        grade_points: '8.00',
      });
      expect(
        (
          await runner.query(
            'SELECT marks_obtained,grade,result_status FROM student_exam_reports',
          )
        )[0],
      ).toMatchObject({
        marks_obtained: '30.00',
        grade: 'P',
        result_status: 'PASS',
      });
      expect(
        (await runner.query('SELECT marks_obtained FROM academic_marks'))[0]
          .marks_obtained,
      ).toBe('30.00');
      expect(
        (
          await runner.query(
            'SELECT grade,grade_points,status FROM student_course_enrollments',
          )
        )[0],
      ).toMatchObject({
        grade: 'P',
        grade_points: '8.00',
        status: 'COMPLETED',
      });
      expect(notify.examRevaluationAssigned).toHaveBeenCalledTimes(1);
      expect(notify.examRevaluationReportReady).toHaveBeenCalledTimes(1);
      expect(notify.examRevaluationPublished).toHaveBeenCalledTimes(1);
    });

    it('requires explicit linking when legacy results are ambiguous and persists the selected attempt', async () => {
      const id = await application({ linkedResult: null });
      await expect(
        examCell.assignReEvaluation(tenant, actor, id, faculty),
      ).rejects.toThrow('More than one');
      expect((await getApplication(id)).exam_result_id).toBeNull();
      const linked = await examCell.linkReEvaluationExamResult(
        tenant,
        actor,
        id,
        result,
      );
      expect(linked).toMatchObject({
        exam_result_id: result,
        exam_max_marks: 30,
      });
      const assigned = await examCell.assignReEvaluation(
        tenant,
        actor,
        id,
        faculty,
      );
      expect(assigned.status).toBe('ASSIGNED');
      expect(Number(assigned.original_marks)).toBe(0);
    });

    // Reproduce the demo request snapshots in this disposable schema only.
    // These fixtures must never be used to relabel or repair public QA records.
    async function matchingLegacyFixture(state: 'ASSIGNED' | 'UNDER_REVIEW') {
      await runner.query(
        'UPDATE exam_result_sessions SET max_marks=100,pass_marks=50',
      );
      await runner.query(
        'UPDATE academic_marks SET marks_obtained=42,max_marks=100',
      );
      await runner.query(
        'UPDATE student_exam_reports SET marks_obtained=42,max_marks=100,percent=42',
      );
      await runner.query(
        `UPDATE academic_exam_results SET marks_obtained=42,max_marks=100,
          pass_marks_snapshot=50,
          source_mark_updated_at=(SELECT updated_at FROM academic_marks WHERE mark_id=source_mark_id)
         WHERE result_id=$1`,
        [result],
      );
      return application({
        state,
        linkedResult: null,
        assignedFaculty: faculty,
        original: 42,
        ...(state === 'UNDER_REVIEW' ? { revised: 46 } : {}),
      });
    }

    async function resultEvidenceSnapshot() {
      const snapshots: unknown[] = [];
      for (const table of [
        'academic_exam_results',
        'academic_marks',
        'student_exam_reports',
        'student_course_enrollments',
        'exam_result_sessions',
      ]) {
        snapshots.push(await runner.query(`SELECT * FROM ${table} ORDER BY 1`));
      }
      return snapshots;
    }

    it.each(['ASSIGNED', 'UNDER_REVIEW'] as const)(
      'links only the reference on a matching 42-mark %s fixture, preserving every marks row and request snapshot',
      async (state) => {
        const id = await matchingLegacyFixture(state);
        const beforeRequest = await getApplication(id);
        const beforeEvidence = await resultEvidenceSnapshot();

        await examCell.linkReEvaluationExamResult(tenant, actor, id, result);

        expect(await getApplication(id)).toEqual({
          ...beforeRequest,
          exam_result_id: result,
        });
        expect(await resultEvidenceSnapshot()).toEqual(beforeEvidence);
        expect(await runner.query('SELECT * FROM integration_jobs')).toEqual([]);
        expect(notify.examRevaluationPublished).not.toHaveBeenCalled();
        expect(notify.examRevaluationReportReady).not.toHaveBeenCalled();
      },
    );

    it.each(['ASSIGNED', 'UNDER_REVIEW'] as const)(
      'keeps a matching 42-mark %s fixture unlinked when its declaration is QA data',
      async (state) => {
        const id = await matchingLegacyFixture(state);
        await runner.query(
          'UPDATE exam_result_sessions SET declaration_note=$1',
          ['SMOKE: End-term results declared for QA walkthrough.'],
        );
        const beforeRequest = await getApplication(id);
        const beforeEvidence = await resultEvidenceSnapshot();

        await expect(
          examCell.linkReEvaluationExamResult(tenant, actor, id, result),
        ).rejects.toThrow();

        expect(await getApplication(id)).toEqual(beforeRequest);
        expect(await resultEvidenceSnapshot()).toEqual(beforeEvidence);
        expect(await runner.query('SELECT * FROM integration_jobs')).toEqual([]);
        expect(notify.examRevaluationPublished).not.toHaveBeenCalled();
      },
    );

    it.each([
      { reason: 'another student', change: { owner: otherStudent } },
      { reason: 'another tenant', change: { tenantId: otherTenant } },
      { reason: 'another subject', change: { subject: 2 } },
      { reason: 'deleted', change: { deleted: true } },
      { reason: 'unpublished', change: { status: 'DRAFT' } },
      { reason: 'zero maximum', change: { max: 0 } },
      { reason: 'unknown maximum', change: { max: null } },
    ])(
      'rejects exact result $reason without charging or saving',
      async ({ change }) => {
        const invalid = await addResult(randomUUID(), change);
        await expect(
          exams.createApplication(
            student,
            {
              subject_id: 1,
              application_type: 'RE_EVALUATION',
              exam_result_id: invalid,
            },
            tenant,
          ),
        ).rejects.toThrow();
        expect(
          (
            await runner.query(
              'SELECT COUNT(*)::int AS count FROM exam_applications',
            )
          )[0].count,
        ).toBe(0);
        expect(finance.createDemand).not.toHaveBeenCalled();
      },
    );

    it('rejects an authenticated student tenant mismatch before any fee or application write', async () => {
      await expect(
        exams.createApplication(
          student,
          {
            subject_id: 1,
            application_type: 'RE_EVALUATION',
            exam_result_id: result,
          },
          otherTenant,
        ),
      ).rejects.toThrow('active student');
      expect(finance.createDemand).not.toHaveBeenCalled();
      expect(
        (
          await runner.query(
            'SELECT COUNT(*)::int AS count FROM exam_applications',
          )
        )[0].count,
      ).toBe(0);
    });

    it('rejects 30.01 for a 30-mark exam and accepts genuine zero', async () => {
      const id = await application({
        state: 'ASSIGNED',
        assignedFaculty: faculty,
      });
      await expect(report(id, 30.01)).rejects.toThrow('maximum of 30');
      expect((await getApplication(id)).status).toBe('ASSIGNED');
      expect(notify.examRevaluationReportReady).not.toHaveBeenCalled();
      const submitted = await report(id, 0);
      expect(Number(submitted.revised_marks)).toBe(0);
      await examCell.publishReEvaluation(tenant, actor, id);
      expect(Number((await getResult()).marks_obtained)).toBe(0);
    });

    it('refuses a report when its linked maximum becomes zero', async () => {
      const id = await application({
        state: 'ASSIGNED',
        assignedFaculty: faculty,
      });
      await runner.query(
        'UPDATE academic_exam_results SET max_marks=0 WHERE result_id=$1',
        [result],
      );
      await expect(report(id, 0)).rejects.toThrow('maximum marks');
      expect((await getApplication(id)).status).toBe('ASSIGNED');
      expect(notify.examRevaluationReportReady).not.toHaveBeenCalled();
    });

    it('rejects another reviewer and a faculty tenant mismatch without submitting', async () => {
      const id = await application({
        state: 'ASSIGNED',
        assignedFaculty: faculty,
      });
      await expect(report(id, 10, otherFaculty)).rejects.toThrow(
        'not assigned',
      );
      await expect(report(id, 10, foreignFaculty)).rejects.toThrow(
        'active faculty',
      );
      expect((await getApplication(id)).report_submitted_at).toBeNull();
      expect(notify.examRevaluationReportReady).not.toHaveBeenCalled();
    });

    it('isolates read, link, assignment, publication and rejection by application tenant', async () => {
      const foreignResult = await addResult(randomUUID(), {
        owner: foreignStudent,
        tenantId: otherTenant,
      });
      const id = await application({
        owner: foreignStudent,
        linkedResult: foreignResult,
      });
      await expect(examCell.getReEvaluation(tenant, id)).rejects.toThrow(
        'not found',
      );
      await expect(
        examCell.linkReEvaluationExamResult(tenant, actor, id, result),
      ).rejects.toThrow('not found');
      await expect(
        examCell.assignReEvaluation(tenant, actor, id, faculty),
      ).rejects.toThrow('not found');
      await expect(
        examCell.publishReEvaluation(tenant, actor, id),
      ).rejects.toThrow('not found');
      await expect(
        examCell.rejectReEvaluation(tenant, actor, id, 'Fixture decline'),
      ).rejects.toThrow('not found');
      expect((await getApplication(id)).status).toBe('PENDING');
      expect(notify.examRevaluationAssigned).not.toHaveBeenCalled();
      expect(notify.examRevaluationPublished).not.toHaveBeenCalled();
    });

    it('rejects duplicate report and publish replays without changing the result twice', async () => {
      const id = await application({
        state: 'ASSIGNED',
        assignedFaculty: faculty,
      });
      await report(id, 12.25);
      await expect(report(id, 20)).rejects.toThrow('assigned applications');
      await examCell.publishReEvaluation(tenant, actor, id);
      await expect(
        examCell.publishReEvaluation(tenant, actor, id),
      ).rejects.toThrow('submitted report');
      await expect(
        examCell.rejectReEvaluation(tenant, actor, id),
      ).rejects.toThrow('cannot be rejected');
      expect(Number((await getResult()).marks_obtained)).toBe(12.25);
      expect(notify.examRevaluationReportReady).toHaveBeenCalledTimes(1);
      expect(notify.examRevaluationPublished).toHaveBeenCalledTimes(1);
    });

    it('cannot move an assigned case to another result or publish a changed original', async () => {
      const id = await application({
        state: 'ASSIGNED',
        assignedFaculty: faculty,
      });
      await expect(
        examCell.linkReEvaluationExamResult(tenant, actor, id, alternateResult),
      ).rejects.toThrow('cannot be moved');
      await report(id, 15);
      await runner.query(
        'UPDATE academic_exam_results SET marks_obtained=1 WHERE result_id=$1',
        [result],
      );
      await expect(
        examCell.publishReEvaluation(tenant, actor, id),
      ).rejects.toThrow('original exam result changed');
      expect((await getApplication(id)).status).toBe('UNDER_REVIEW');
      expect(Number((await getResult()).marks_obtained)).toBe(1);
      expect(notify.examRevaluationPublished).not.toHaveBeenCalled();
    });

    it('rejects a case without changing its result or creating an integration job', async () => {
      const id = await application({
        state: 'UNDER_REVIEW',
        assignedFaculty: faculty,
        revised: 20,
      });
      const rejected = await examCell.rejectReEvaluation(
        tenant,
        actor,
        id,
        '  Fixture decline  ',
      );
      expect(rejected).toMatchObject({
        status: 'REJECTED',
        report_notes: 'Fixture decline',
      });
      expect(Number((await getResult()).marks_obtained)).toBe(0);
      expect(
        (
          await runner.query(
            'SELECT COUNT(*)::int AS count FROM integration_jobs',
          )
        )[0].count,
      ).toBe(0);
      await expect(
        examCell.rejectReEvaluation(tenant, actor, id),
      ).rejects.toThrow('cannot be rejected');
      expect(notify.examRevaluationPublished).toHaveBeenCalledTimes(1);
    });

    it('rolls back result and case changes when a later publish statement fails', async () => {
      const id = await application({
        state: 'UNDER_REVIEW',
        assignedFaculty: faculty,
        revised: 25,
      });
      await runner.query(
        "INSERT INTO parent_student_links VALUES ($1,'0000000000','Fixture parent')",
        [student],
      );
      await runner.query(
        'ALTER TABLE integration_jobs ADD CONSTRAINT fixture_force_publish_failure CHECK (false)',
      );
      await expect(
        examCell.publishReEvaluation(tenant, actor, id),
      ).rejects.toThrow();
      expect(Number((await getResult()).marks_obtained)).toBe(0);
      expect((await getApplication(id)).status).toBe('UNDER_REVIEW');
      expect((await getApplication(id)).published_at).toBeNull();
      expect(
        (
          await runner.query(
            'SELECT COUNT(*)::int AS count FROM integration_jobs',
          )
        )[0].count,
      ).toBe(0);
      expect(notify.examRevaluationPublished).not.toHaveBeenCalled();
      expect(
        (await runner.query('SELECT marks_obtained FROM academic_marks'))[0]
          .marks_obtained,
      ).toBe('0.00');
      expect(
        (
          await runner.query('SELECT marks_obtained FROM student_exam_reports')
        )[0].marks_obtained,
      ).toBe('0.00');
      expect(
        (await runner.query('SELECT status FROM student_course_enrollments'))[0]
          .status,
      ).toBe('FAILED');
    });

    it('fails closed for legacy results without declared source provenance', async () => {
      await expect(
        exams.createApplication(
          student,
          {
            subject_id: 1,
            application_type: 'RE_EVALUATION',
            exam_result_id: alternateResult,
          },
          tenant,
        ),
      ).rejects.toThrow('official declaration source');
      expect(finance.createDemand).not.toHaveBeenCalled();
      const id = await application({
        state: 'UNDER_REVIEW',
        linkedResult: alternateResult,
        original: 42,
        revised: 46,
      });
      await expect(
        examCell.publishReEvaluation(tenant, actor, id),
      ).rejects.toThrow('source marks, report and grading policy');
      expect(Number((await getResult(alternateResult)).marks_obtained)).toBe(
        42,
      );
      expect((await getApplication(id)).status).toBe('UNDER_REVIEW');
      expect(notify.examRevaluationPublished).not.toHaveBeenCalled();
    });

    it('rejects a source edited since declaration even if its numeric marks are unchanged', async () => {
      const id = await application({ state: 'UNDER_REVIEW', revised: 20 });
      await runner.query(
        "UPDATE academic_marks SET updated_at=updated_at+interval '1 second'",
      );
      await expect(
        exams.createApplication(
          student,
          {
            subject_id: 1,
            application_type: 'RE_EVALUATION',
            exam_result_id: result,
          },
          tenant,
        ),
      ).rejects.toThrow('source marks');
      expect(finance.createDemand).not.toHaveBeenCalled();
      await expect(
        examCell.publishReEvaluation(tenant, actor, id),
      ).rejects.toThrow('source marks, report and grading policy');
      expect(Number((await getResult()).marks_obtained)).toBe(0);
      expect((await getApplication(id)).status).toBe('UNDER_REVIEW');
    });

    it('grades from the exact declaration snapshot after the current policy changes', async () => {
      const id = await application({ state: 'UNDER_REVIEW', revised: 20 });
      await runner.query('UPDATE academic_grading_policies SET rules=$1', [
        {
          bands: [
            { minPercent: 0, maxPercent: 100, grade: 'NEW', gradePoints: 1 },
          ],
        },
      ]);
      await examCell.publishReEvaluation(tenant, actor, id);
      expect(await getResult()).toMatchObject({
        grade: 'P',
        grade_points: '8.00',
      });
    });

    async function prepareNextSession() {
      const id = randomUUID();
      await runner.query(
        `INSERT INTO exam_result_sessions
      (session_id,tenant_id,course_id,exam_type,semester,max_marks,pass_marks,grading_policy_id)
      VALUES ($1,$2,$3,'END_TERM',5,30,15,1)`,
        [id, tenant, course],
      );
      await runner.query(
        "INSERT INTO exam_result_dean_approval_requests VALUES ($1,$2,'APPROVED')",
        [tenant, id],
      );
      await runner.query(
        "UPDATE academic_marks SET marks_obtained=20,status='PENDING_COE',updated_at=clock_timestamp()",
      );
      await runner.query(
        `INSERT INTO student_course_enrollments
      (tenant_id,student_user_id,course_id,semester,status) VALUES ($1,$2,$3,5,'ACTIVE')`,
        [tenant, student, course],
      );
      return id;
    }

    it('declares another semester as a distinct canonical attempt and preserves existing linked result IDs', async () => {
      const oldCase = await application({ state: 'UNDER_REVIEW', revised: 10 });
      const next = await prepareNextSession();
      await expect(
        resultControl.declareSession(tenant, next, actor, {}),
      ).resolves.toMatchObject({ declared: 1 });
      const attempts = await runner.query(
        'SELECT result_id,result_session_id,marks_obtained FROM academic_exam_results ORDER BY result_id',
      );
      expect(attempts).toHaveLength(3);
      expect(
        attempts.find((row: any) => row.result_id === result).marks_obtained,
      ).toBe('0.00');
      const created = attempts.find(
        (row: any) => row.result_session_id === next,
      );
      expect(created.result_id).not.toBe(result);
      expect(created.marks_obtained).toBe('20.00');
      expect((await getApplication(oldCase)).exam_result_id).toBe(result);
      await expect(
        examCell.publishReEvaluation(tenant, actor, oldCase),
      ).rejects.toThrow('source marks, report and grading policy');
      expect(notify.examResultsPublished).toHaveBeenCalledTimes(1);
    });

    it('rolls back the whole declaration if canonical attempt creation fails', async () => {
      const next = await prepareNextSession();
      await runner.query(`ALTER TABLE academic_exam_results ADD CONSTRAINT fixture_block_new_attempt
      CHECK (result_session_id IS NULL OR result_id='${result}')`);
      await expect(
        resultControl.declareSession(tenant, next, actor, {}),
      ).rejects.toThrow();
      expect(
        (await runner.query('SELECT status FROM academic_marks'))[0].status,
      ).toBe('PENDING_COE');
      expect(
        (
          await runner.query(
            'SELECT declared_at FROM exam_result_sessions WHERE session_id=$1',
            [next],
          )
        )[0].declared_at,
      ).toBeNull();
      expect(
        await runner.query(
          'SELECT report_id FROM student_exam_reports WHERE session_id=$1',
          [next],
        ),
      ).toHaveLength(0);
      expect(notify.examResultsPublished).not.toHaveBeenCalled();
    });
  },
);
