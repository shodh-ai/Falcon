import { NotFoundException } from '@nestjs/common';
import { Client } from 'pg';
import { ExamCellEnterpriseService } from './exam-cell-enterprise.service';
import { ExamCellOperationsService } from './exam-cell-operations.service';
import { SemesterResultsService } from './semester-results.service';

type Row = Record<string, unknown>;
type Query = (sql: string, params?: unknown[]) => Promise<Row[]>;

function services(query: Query) {
  const db = { query } as never;
  const finance = { getPendingDues: jest.fn(() => Promise.resolve([])) };
  const audit = { log: jest.fn() };
  const notifications = { dispatch: jest.fn() };
  const semesterResults = new SemesterResultsService(db, {} as never);
  return {
    enterprise: new ExamCellEnterpriseService(
      db,
      {} as never,
      finance as never,
      audit as never,
    ),
    operations: new ExamCellOperationsService(
      db,
      {} as never,
      finance as never,
      audit as never,
      notifications as never,
      semesterResults,
    ),
    finance,
    audit,
    notifications,
    semesterResults,
  };
}

function mockQuery() {
  return jest.fn<Promise<Row[]>, [string, unknown[]?]>().mockResolvedValue([]);
}

describe('Student examination timeline', () => {
  it('handles a student with no registration, ticket, attendance, result or revaluation', async () => {
    const query = mockQuery().mockResolvedValueOnce([
      { name: 'Test Student', enrollment_number: null },
    ]);
    const { enterprise, audit, notifications } = services(query);
    const data = await enterprise.studentExamTimeline('tenant-a', 'student-a');
    expect(data.timeline).toEqual([
      { stage: 'Registration', status: 'NOT_STARTED', at: null },
      { stage: 'Fee Paid', status: 'COMPLETED', at: null },
      { stage: 'Hall Ticket', status: 'PENDING', at: null },
      { stage: 'Exam Attendance', status: 'NOT_MARKED', at: null },
      { stage: 'Result', status: 'PENDING', at: null },
    ]);
    expect(query.mock.calls.every(([sql]) => /^\s*SELECT\b/.test(sql))).toBe(
      true,
    );
    expect(audit.log).not.toHaveBeenCalled();
    expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  it('reads single-row ticket, declared result and revaluation records correctly', async () => {
    const at = '2026-10-19T10:00:00Z';
    const query = mockQuery()
      .mockResolvedValueOnce([{ name: 'Test Student' }])
      .mockResolvedValueOnce([{ status: 'APPROVED', created_at: at }])
      .mockResolvedValueOnce([{ eligible: true, created_at: at }])
      .mockResolvedValueOnce([{ status: 'PRESENT', marked_at: at }])
      .mockResolvedValueOnce([{ status: 'PASS', declared_at: at }])
      .mockResolvedValueOnce([{ status: 'PENDING', created_at: at }]);
    const { enterprise } = services(query);
    const data = await enterprise.studentExamTimeline('tenant-a', 'student-a');
    expect(data.timeline).toEqual(
      expect.arrayContaining([
        { stage: 'Hall Ticket', status: 'GENERATED', at },
        { stage: 'Result', status: 'PASS', at },
        { stage: 'Revaluation', status: 'PENDING', at },
      ]),
    );
    const [resultSql, resultParams] = query.mock.calls[4];
    expect(resultSql).toContain('ser.result_status AS status');
    expect(resultSql).toContain('ers.tenant_id = ser.tenant_id');
    expect(resultSql).toContain(
      'ser.declared_at IS NOT NULL AND ers.declared_at IS NOT NULL',
    );
    expect(resultSql).not.toMatch(/ser\.(status|updated_at)/);
    expect(resultParams).toEqual(['student-a', 'tenant-a']);
    expect(query.mock.calls[5][1]).toEqual(['student-a', 'tenant-a']);
  });

  it('rejects unknown or other-tenant students before reading their records', async () => {
    const query = mockQuery();
    const { enterprise, finance } = services(query);
    await expect(
      enterprise.studentExamTimeline('tenant-b', 'student-a'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('u.tenant_id = $2');
    expect(query.mock.calls[0][1]).toEqual(['student-a', 'tenant-b']);
    expect(finance.getPendingDues).not.toHaveBeenCalled();
  });

  it.each([1, 2, 3, 4, 5])(
    'does not turn a failed record query (%i) into a pending event',
    async (failedCall) => {
      const query = mockQuery();
      let call = 0;
      query.mockImplementation(() => {
        if (call++ === failedCall)
          return Promise.reject(new Error('database read failed'));
        return Promise.resolve(call === 1 ? [{ name: 'Test Student' }] : []);
      });
      await expect(
        services(query).enterprise.studentExamTimeline('tenant-a', 'student-a'),
      ).rejects.toThrow('database read failed');
    },
  );
});

describe('Examination reports and analytics', () => {
  it('reuses grade-card merit ranking and returns numeric GPA values for the existing page', async () => {
    const query = mockQuery().mockImplementation((sql) => {
      if (sql.includes('FROM student_exam_reports'))
        return Promise.resolve([
          { label: 'PASS', count: 6 },
          { label: 'FAIL', count: 1 },
        ]);
      if (sql.includes('FROM grade_cards'))
        return Promise.resolve([
          {
            student_name: 'Ranked Student',
            enrollment_number: 'TEST',
            cgpa: '8.25',
            sgpa: '8.50',
          },
          {
            student_name: 'No GPA',
            enrollment_number: null,
            cgpa: null,
            sgpa: null,
          },
        ]);
      return Promise.resolve([]);
    });
    const { operations, semesterResults } = services(query);
    const ranking = jest.spyOn(semesterResults, 'topStudents');
    const data = await operations.getReportsSummary('tenant-a', 4);
    expect(ranking).toHaveBeenCalledWith('tenant-a', 4, 10);
    expect(data.pass_percentage).toBe(86);
    expect(data.top_rankers).toEqual([
      {
        name: 'Ranked Student',
        enrollment_number: 'TEST',
        cgpa: 8.25,
        sgpa: 8.5,
      },
      { name: 'No GPA', enrollment_number: null, cgpa: null, sgpa: null },
    ]);
    expect(
      (data.top_rankers as Array<{ cgpa: number | null }>)[0].cgpa?.toFixed(2),
    ).toBe('8.25');
    expect(
      query.mock.calls.some(([sql]) => sql.includes('student_grade_cards')),
    ).toBe(false);
    expect(
      query.mock.calls.find(([sql]) => sql.includes('AS department'))?.[0],
    ).toContain('COUNT(DISTINCT e.student_user_id)');
  });

  it('returns genuine empty datasets and zero pass percentage without inventing records', async () => {
    const { operations, enterprise } = services(mockQuery());
    expect(await operations.getReportsSummary('tenant-a')).toMatchObject({
      semester: 4,
      pass_fail: [],
      pass_percentage: 0,
      top_rankers: [],
    });
    expect(await enterprise.advancedAnalytics('tenant-a', 4)).toEqual({
      semester: 4,
      grade_distribution: [],
      subject_analysis: [],
      faculty_performance: [],
      pass_fail: [],
    });
  });

  it('uses authoritative declarations for all result charts and tenant/course/semester scope for faculty counts', async () => {
    const query = mockQuery();
    const { operations, enterprise, audit, notifications } = services(query);
    await operations.getReportsSummary('tenant-a', 4);
    await enterprise.advancedAnalytics('tenant-a', 4);
    const resultQueries = query.mock.calls.filter(([sql]) =>
      sql.includes('FROM student_exam_reports'),
    );
    expect(resultQueries).toHaveLength(4);
    for (const [sql, params] of resultQueries) {
      expect(sql).toContain('ers.tenant_id = ser.tenant_id');
      expect(sql).toContain('ser.tenant_id = $1 AND ers.semester = $2');
      expect(sql).toContain(
        'ser.declared_at IS NOT NULL AND ers.declared_at IS NOT NULL',
      );
      expect(params).toEqual(['tenant-a', 4]);
      expect(sql).not.toMatch(
        /ser\.status|academic_exam_results|JOIN student_course_enrollments/,
      );
    }
    const facultySql = query.mock.calls.find(([sql]) =>
      sql.includes('FROM academic_marks'),
    )?.[0];
    expect(facultySql).toContain('am.uploaded_by');
    expect(facultySql).toContain("am.status != 'DRAFT'");
    expect(facultySql).toContain('EXISTS');
    expect(facultySql).toContain('e.tenant_id = am.tenant_id');
    expect(facultySql).toContain(
      'e.course_id = am.course_id AND e.semester = $2',
    );
    expect(query.mock.calls.every(([sql]) => /^\s*SELECT\b/.test(sql))).toBe(
      true,
    );
    expect(audit.log).not.toHaveBeenCalled();
    expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  it.each(['reports', 'analytics'] as const)(
    '%s propagates database/schema failures instead of showing empty charts',
    async (kind) => {
      const query = mockQuery().mockRejectedValue(
        new Error('column does not exist'),
      );
      const { operations, enterprise } = services(query);
      await expect(
        kind === 'reports'
          ? operations.getReportsSummary('tenant-a', 4)
          : enterprise.advancedAnalytics('tenant-a', 4),
      ).rejects.toThrow('column does not exist');
    },
  );
});

// Read-only PostgreSQL CTE fixtures shadow tables only for each SELECT. No seeds,
// temporary tables, writes, migrations or publication calls are performed.
type PgClientType = {
  connect(): Promise<void>;
  query(sql: string, params?: unknown[]): Promise<{ rows: Row[] }>;
  end(): Promise<void>;
};
const PgClient = Client as unknown as new (config: {
  connectionString?: string;
  connectionTimeoutMillis: number;
  query_timeout: number;
}) => PgClientType;
const describePostgres =
  process.env.FALCON_TEST_DB === '1' && process.env.TEST_DATABASE_URL
    ? describe
    : describe.skip;

const fixtures = `WITH
users(user_id, tenant_id, name, dept_id) AS (
  VALUES ('student-a','tenant-a','Student A','dept-a'), ('student-b','tenant-b','Student B','dept-b'),
         ('faculty-a','tenant-a','Faculty A','dept-a'), ('faculty-b','tenant-b','Faculty B','dept-b')
), student_profiles(user_id,enrollment_number,enrollment_no,branch_name) AS (
  VALUES ('student-a','TEST-A','TEST-A','Department A'), ('student-b','TEST-B','TEST-B','Department B')
), departments(dept_id,dept_name) AS (VALUES ('dept-a','Department A'), ('dept-b','Department B')),
academic_courses(course_id,tenant_id,course_code,course_name) AS (
  VALUES ('course-a','tenant-a','A101','Course A'), ('course-b','tenant-b','B101','Course B')
), exam_result_sessions(session_id,tenant_id,semester,declared_at) AS (
  VALUES ('declared-a','tenant-a',4,TIMESTAMPTZ '2026-01-01'),
         ('draft-a','tenant-a',4,NULL::timestamptz), ('other-sem','tenant-a',5,TIMESTAMPTZ '2026-01-02'),
         ('declared-b','tenant-b',4,TIMESTAMPTZ '2026-01-01')
), student_exam_reports(report_id,tenant_id,session_id,student_user_id,course_id,grade,result_status,marks_obtained,declared_at) AS (
  VALUES ('r1','tenant-a','declared-a','student-a','course-a','A','PASS',80,TIMESTAMPTZ '2026-01-01'),
         ('r2','tenant-a','declared-a','student-a','course-a','F','FAIL',20,TIMESTAMPTZ '2026-01-01'),
         ('r3','tenant-a','draft-a','student-a','course-a','A','PASS',90,TIMESTAMPTZ '2026-02-01'),
         ('r4','tenant-a','declared-a','student-a','course-a','A','PASS',90,NULL::timestamptz),
         ('r5','tenant-a','declared-b','student-a','course-a','A','PASS',90,TIMESTAMPTZ '2026-02-01'),
         ('r6','tenant-b','declared-b','student-b','course-b','B','PASS',70,TIMESTAMPTZ '2026-01-01'),
         ('r7','tenant-a','other-sem','student-a','course-a','B','PASS',60,TIMESTAMPTZ '2026-01-02')
), student_course_enrollments(tenant_id,student_user_id,course_id,semester) AS (
  VALUES ('tenant-a','student-a','course-a',4), ('tenant-a','student-a','course-a',4),
         ('tenant-a','student-a','other-course',4), ('tenant-b','student-a','cross-course',4),
         ('tenant-a','student-a','later-course',5), ('tenant-b','student-b','course-b',4)
), academic_marks(mark_id,tenant_id,student_user_id,course_id,uploaded_by,status) AS (
  VALUES ('m1','tenant-a','student-a','course-a','faculty-a','PUBLISHED'),
         ('m2','tenant-a','student-a','course-a','faculty-a','DRAFT'),
         ('m3','tenant-a','student-a','missing-course','faculty-a','SUBMITTED'),
         ('m4','tenant-a','student-a','later-course','faculty-a','SUBMITTED'),
         ('m5','tenant-a','student-a','cross-course','faculty-a','SUBMITTED'),
         ('m6','tenant-a','student-a','course-a','faculty-b','SUBMITTED'),
         ('m7','tenant-b','student-b','course-b','faculty-b','SUBMITTED')
), grade_cards(student_user_id,tenant_id,semester,status,payload) AS (
  VALUES ('student-a','tenant-a',4,'PUBLISHED','{"sgpa":8.5,"cgpa":8.25,"rank":1,"result_stage":"FINAL"}'::jsonb),
         ('student-a','tenant-a',4,'WITHHELD','{"sgpa":10,"cgpa":10,"rank":1}'::jsonb),
         ('student-b','tenant-b',4,'PUBLISHED','{"sgpa":9,"cgpa":9,"rank":1}'::jsonb)
), exam_semester_registrations(tenant_id,student_user_id,status,created_at) AS (
  VALUES ('tenant-a','student-a','APPROVED',TIMESTAMPTZ '2026-01-01')
), exam_admit_card_runs(run_id,tenant_id) AS (VALUES ('run-a','tenant-a')),
exam_admit_card_entries(run_id,student_user_id,eligible,created_at) AS (
  VALUES ('run-a','student-a',true,TIMESTAMPTZ '2026-01-01')
), exam_day_attendance(tenant_id,student_user_id,status,marked_at) AS (
  VALUES ('tenant-a','student-a','PRESENT',TIMESTAMPTZ '2026-01-01')
), exam_applications(student_user_id,application_type,status,created_at) AS (
  VALUES ('student-a','RE_EVALUATION','PENDING',TIMESTAMPTZ '2026-02-01')
) `;

describePostgres('Read models on PostgreSQL (read-only fixtures)', () => {
  let client: PgClientType;
  let models: ReturnType<typeof services>;
  beforeAll(async () => {
    client = new PgClient({
      connectionString: process.env.TEST_DATABASE_URL,
      connectionTimeoutMillis: 5000,
      query_timeout: 10000,
    });
    await client.connect();
    await client.query('BEGIN READ ONLY');
    models = services(
      async (sql, params) => (await client.query(fixtures + sql, params)).rows,
    );
  });
  afterAll(async () => {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } finally {
        await client.end();
      }
    }
  });

  it('returns a complete timeline with the latest official result, not a newer draft', async () => {
    const data = await models.enterprise.studentExamTimeline(
      'tenant-a',
      'student-a',
    );
    expect(
      data.timeline.map(({ stage, status }) => ({ stage, status })),
    ).toEqual([
      { stage: 'Registration', status: 'APPROVED' },
      { stage: 'Fee Paid', status: 'COMPLETED' },
      { stage: 'Hall Ticket', status: 'GENERATED' },
      { stage: 'Exam Attendance', status: 'PRESENT' },
      { stage: 'Result', status: 'PASS' },
      { stage: 'Revaluation', status: 'PENDING' },
    ]);
    expect(data.timeline.find((e) => e.stage === 'Result')?.at).toEqual(
      new Date('2026-01-02'),
    );
  });

  it('does not read another tenant student', async () => {
    await expect(
      models.enterprise.studentExamTimeline('tenant-b', 'student-a'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('counts declared outcomes once, preserves numeric ranking, and counts students rather than enrollments', async () => {
    const data = await models.operations.getReportsSummary('tenant-a', 4);
    expect(data.pass_fail).toEqual([
      { label: 'FAIL', count: 1 },
      { label: 'PASS', count: 1 },
    ]);
    expect(data.pass_percentage).toBe(50);
    expect(data.top_rankers).toEqual([
      { name: 'Student A', enrollment_number: 'TEST-A', cgpa: 8.25, sgpa: 8.5 },
    ]);
    expect(data.department_enrollment).toEqual([
      { department: 'Department A', students: 1 },
    ]);
  });

  it('does not multiply result or faculty counts by duplicate or unrelated enrollments', async () => {
    const data = await models.enterprise.advancedAnalytics('tenant-a', 4);
    expect(data.grade_distribution).toEqual([
      { grade: 'A', count: 1 },
      { grade: 'F', count: 1 },
    ]);
    expect(data.subject_analysis).toEqual([
      {
        subject_code: 'A101',
        subject_name: 'Course A',
        avg_marks: 50,
        students: 1,
      },
    ]);
    expect(data.faculty_performance).toEqual([
      { name: 'Faculty A', submissions: 1 },
    ]);
    expect(data.pass_fail).toEqual([
      { label: 'FAIL', count: 1 },
      { label: 'PASS', count: 1 },
    ]);
  });

  it('isolates another tenant and another semester', async () => {
    const otherTenant = await models.enterprise.advancedAnalytics(
      'tenant-b',
      4,
    );
    expect(otherTenant.pass_fail).toEqual([{ label: 'PASS', count: 1 }]);
    expect(otherTenant.faculty_performance).toEqual([
      { name: 'Faculty B', submissions: 1 },
    ]);
    const otherSemester = await models.operations.getReportsSummary(
      'tenant-a',
      5,
    );
    expect(otherSemester.pass_fail).toEqual([{ label: 'PASS', count: 1 }]);
    expect(otherSemester.top_rankers).toEqual([]);
  });

  it('handles a tenant with no records without inventing counts', async () => {
    expect(await models.operations.getReportsSummary('empty', 4)).toMatchObject(
      {
        pass_fail: [],
        top_rankers: [],
        pass_percentage: 0,
        department_enrollment: [],
      },
    );
    expect(await models.enterprise.advancedAnalytics('empty', 4)).toEqual({
      semester: 4,
      grade_distribution: [],
      subject_analysis: [],
      faculty_performance: [],
      pass_fail: [],
    });
  });
});
