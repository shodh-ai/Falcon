import { Client } from 'pg';
import { ExamCellService } from './exam-cell.service';

type Outcome = { label: string; count: number };
type UpcomingExam = {
  exam_schedule_id: string;
  exam_type: string;
  exam_date: string;
  start_time: string | null;
  end_time: string | null;
  venue: string | null;
  subject_name: string | null;
  subject_code: string | null;
};

// pg has no declaration package in this backend; keep the optional test client
// boundary typed without adding a runtime dependency or changing app config.
type ReadOnlyPgClient = {
  connect(): Promise<void>;
  query(sql: string, params?: string[]): Promise<{ rows: unknown[] }>;
  end(): Promise<void>;
};
const PgClient = Client as unknown as new (config: {
  connectionString: string | undefined;
  connectionTimeoutMillis: number;
  query_timeout: number;
}) => ReadOnlyPgClient;

function createDashboard(
  outcomes: Outcome[] = [],
  upcoming: UpcomingExam[] = [],
) {
  const query = jest.fn<
    Promise<Outcome[] | { c: number }[] | UpcomingExam[]>,
    [string, unknown[]]
  >((sql) =>
    Promise.resolve(
      sql.includes('FROM student_exam_reports')
        ? outcomes
        : sql.includes('LIMIT 3')
          ? upcoming
          : [{ c: 3 }],
    ),
  );
  const notify = { examResultsPublished: jest.fn() };
  const resultControl = { declareSession: jest.fn() };
  const service = new ExamCellService(
    { query } as never,
    {} as never,
    {} as never,
    notify as never,
    {} as never,
    {} as never,
    resultControl as never,
    { log: jest.fn() } as never,
  );
  return { service, query, notify, resultControl };
}

async function reportQuery(fragment = 'FROM student_exam_reports') {
  const { service, query } = createDashboard();
  await service.dashboard('tenant-a');
  const call = query.mock.calls.find(([sql]) => sql.includes(fragment));
  if (!call) throw new Error('Dashboard did not query result reports');
  return call;
}

describe('Examination dashboard declared result outcomes', () => {
  it('returns actual outcome counts and derives the declared total from the same rows', async () => {
    const outcomes = [
      { label: 'ABSENT', count: 1 },
      { label: 'FAIL', count: 2 },
      { label: 'PASS', count: 6 },
      { label: 'WITHHELD', count: 1 },
    ];
    const { service, query, notify, resultControl } = createDashboard(outcomes);
    const dashboard = await service.dashboard('tenant-a');

    expect(dashboard.result_status_chart).toEqual(outcomes);
    expect(dashboard.published_results).toBe(10);
    expect(dashboard.todays_exams).toBe(3);
    expect(dashboard.pending_results).toBe(3);
    expect(
      query.mock.calls.filter(([sql]) => sql.includes('student_exam_reports')),
    ).toHaveLength(1);
    expect(query.mock.calls.every(([sql]) => /^\s*SELECT\b/.test(sql))).toBe(
      true,
    );
    expect(notify.examResultsPublished).not.toHaveBeenCalled();
    expect(resultControl.declareSession).not.toHaveBeenCalled();
  });

  it('uses the actual result_status field and both official declaration timestamps', async () => {
    const [sql, params] = await reportQuery();
    expect(sql).toContain('ser.result_status AS label');
    expect(sql).toContain('COUNT(*)::int AS count');
    expect(sql).toContain('GROUP BY ser.result_status');
    expect(sql).toContain('ORDER BY ser.result_status');
    expect(sql).not.toContain('ser.status');
    expect(sql).not.toContain("'PUBLISHED'");
    expect(sql).toContain(
      'ser.declared_at IS NOT NULL AND ers.declared_at IS NOT NULL',
    );
    expect(sql).toContain('ers.session_id = ser.session_id');
    expect(sql).toContain('ers.tenant_id = ser.tenant_id');
    expect(sql).toContain('ser.tenant_id = $1');
    expect(params).toEqual(['tenant-a']);
  });

  it('binds the requested authenticated tenant rather than interpolating a default', async () => {
    const { service, query } = createDashboard();
    await service.dashboard('tenant-b');
    const call = query.mock.calls.find(([sql]) =>
      sql.includes('FROM student_exam_reports'),
    );
    expect(call?.[1]).toEqual(['tenant-b']);
    expect(call?.[0]).not.toContain('tenant-b');
  });

  it('returns a genuine empty chart and zero total when there are no declared reports', async () => {
    const { service } = createDashboard();
    await expect(service.dashboard('tenant-a')).resolves.toMatchObject({
      result_status_chart: [],
      published_results: 0,
    });
  });

  it.each([
    'column ser.result_status does not exist',
    'relation student_exam_reports does not exist',
    'database connection failed',
  ])(
    'does not hide a failed result query as empty data: %s',
    async (message) => {
      const { service, query } = createDashboard();
      query.mockImplementation((sql: string) => {
        if (sql.includes('FROM student_exam_reports'))
          return Promise.reject(new Error(message));
        return Promise.resolve([{ c: 0 }]);
      });
      await expect(service.dashboard('tenant-a')).rejects.toThrow(message);
    },
  );

  it.each(['', '   ', undefined])(
    'rejects missing tenant context before any query: %s',
    async (tenant) => {
      const { service, query } = createDashboard();
      await expect(service.dashboard(tenant as string)).rejects.toThrow(
        'Tenant context required',
      );
      expect(query).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['2026-10-24T18:29:59.000Z', '2026-10-24'],
    ['2026-10-24T18:30:00.000Z', '2026-10-25'],
  ])('uses the IST timetable date at %s', async (clock, date) => {
    jest.useFakeTimers().setSystemTime(new Date(clock));
    try {
      const { service, query } = createDashboard();
      const result = await service.dashboard('tenant-a');
      expect(result.dashboard_date).toBe(date);
      expect(result.timezone).toBe('Asia/Kolkata');
      const dateQueries = query.mock.calls.filter(
        ([, params]) => params.length === 2,
      );
      expect(dateQueries.length).toBeGreaterThan(0);
      expect(dateQueries.every(([, params]) => params[1] === date)).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('returns only the actual ordered upcoming preview and binds tenant/date', async () => {
    const upcoming: UpcomingExam[] = [
      {
        exam_schedule_id: 'schedule-next',
        exam_type: 'END_TERM',
        exam_date: '2026-10-25',
        start_time: '09:00:00',
        end_time: '12:00:00',
        venue: 'Existing room',
        subject_name: 'Existing subject',
        subject_code: 'SUB101',
      },
    ];
    const { service, query } = createDashboard([], upcoming);
    const result = await service.dashboard('tenant-a');
    expect(result.upcoming_exams_preview).toEqual(upcoming);
    const [sql, params] = query.mock.calls.find(([text]) =>
      text.includes('LIMIT 3'),
    )!;
    expect(sql).toContain('es.tenant_id = $1');
    expect(sql).toContain('es.exam_date > $2::date');
    expect(sql).toContain('es.deleted_at IS NULL');
    expect(sql).toContain("es.status <> 'CANCELLED'");
    expect(sql).toContain(
      'ORDER BY es.exam_date ASC, es.start_time ASC, es.exam_schedule_id ASC',
    );
    expect(sql).not.toContain('tenant_id IS NULL');
    expect(params).toEqual(['tenant-a', result.dashboard_date]);
  });

  it('returns an empty upcoming preview rather than invented timetable rows', async () => {
    const { service } = createDashboard();
    await expect(service.dashboard('tenant-a')).resolves.toMatchObject({
      upcoming_exams_preview: [],
    });
  });

  it('counts pending registrations in the database instead of the capped list', async () => {
    const { service, query } = createDashboard();
    const result = await service.dashboard('tenant-a');
    expect(result.pending_registrations).toBe(3);
    const call = query.mock.calls.find(
      ([sql]) =>
        sql.includes('FROM exam_semester_registrations') &&
        sql.includes("status = 'PENDING'"),
    );
    expect(call?.[0]).toContain('tenant_id = $1');
    expect(call?.[0]).not.toContain('LIMIT');
    expect(call?.[1]).toEqual(['tenant-a']);
  });

  it('counts only papers under moderation with a linked latest PDF version', async () => {
    const { service, query } = createDashboard();
    const result = await service.dashboard('tenant-a');
    expect(result.question_papers_awaiting_review).toBe(3);
    expect(result.metric_errors).toEqual({});
    const [sql, params] = query.mock.calls.find(([text]) =>
      text.includes('FROM exam_question_papers'),
    )!;
    expect(sql).toContain("p.status = 'UNDER_MODERATION'");
    expect(sql).toContain('tenant_id = p.tenant_id AND qp_id = p.qp_id');
    expect(sql).toContain('ORDER BY version_number DESC LIMIT 1');
    expect(sql).toContain('p.storage_path = v.storage_key');
    expect(params).toEqual(['tenant-a']);
  });

  it('marks an unavailable optional review source unavailable without a fabricated zero', async () => {
    const { service, query } = createDashboard();
    query.mockImplementation((sql) => {
      if (sql.includes('FROM exam_question_papers'))
        return Promise.reject(
          new Error('relation exam_question_paper_versions does not exist'),
        );
      if (sql.includes('FROM student_exam_reports') || sql.includes('LIMIT 3'))
        return Promise.resolve([]);
      return Promise.resolve([{ c: 2 }]);
    });
    const result = await service.dashboard('tenant-a');
    expect(result.pending_registrations).toBe(2);
    expect(result).not.toHaveProperty('question_papers_awaiting_review');
    expect(result.metric_errors).toEqual({
      question_papers_awaiting_review:
        'Question-paper review data is unavailable.',
    });
  });

  it.each([
    'relation exam_semester_registrations does not exist',
    'column status does not exist',
    'database connection failed',
  ])(
    'never turns a failed operational count into zero: %s',
    async (message) => {
      const { service, query } = createDashboard();
      query.mockImplementation((sql) => {
        if (sql.includes('FROM exam_semester_registrations'))
          return Promise.reject(new Error(message));
        return Promise.resolve([{ c: 0 }]);
      });
      await expect(service.dashboard('tenant-a')).rejects.toThrow(message);
    },
  );

  it.each([
    { rows: [] },
    { rows: [{ c: null }] },
    { rows: [{ c: -1 }] },
    { rows: [{ c: 1.5 }] },
  ])(
    'rejects malformed count responses rather than displaying a false zero: %p',
    async ({ rows }) => {
      const { service, query } = createDashboard();
      query.mockResolvedValue(rows as { c: number }[]);
      await expect(service.dashboard('tenant-a')).rejects.toThrow(
        'Dashboard counts are unavailable',
      );
    },
  );

  it('uses the examination date for today attendance, not the entry timestamp', async () => {
    const { service, query } = createDashboard();
    await service.dashboard('tenant-a');
    const [sql] = query.mock.calls.find(([text]) =>
      text.includes('FROM exam_day_attendance'),
    )!;
    expect(sql).toContain('es.exam_date = $2::date');
    expect(sql).toContain('es.tenant_id = da.tenant_id');
    expect(sql).not.toContain('marked_at::date');
  });
});

// Optional real PostgreSQL execution. These fixtures are read-only CTEs: no
// tables, application data, publications, notifications or schema are changed.
// Run only against the explicitly marked, isolated Exam Cell test database.
const describePostgres =
  process.env.FALCON_TEST_DB === '1' && process.env.TEST_DATABASE_URL
    ? describe
    : describe.skip;

describePostgres('Dashboard queries on PostgreSQL (read-only fixtures)', () => {
  let client: ReadOnlyPgClient;
  let sql: string;
  const fixtures = `
    WITH exam_result_sessions(session_id, tenant_id, declared_at) AS (
      VALUES ('declared-a', 'tenant-a', TIMESTAMPTZ '2026-01-01'),
             ('draft-a', 'tenant-a', NULL::timestamptz),
             ('declared-b', 'tenant-b', TIMESTAMPTZ '2026-01-01')
    ), student_exam_reports(tenant_id, session_id, result_status, declared_at) AS (
      VALUES ('tenant-a', 'declared-a', 'PASS', TIMESTAMPTZ '2026-01-01'),
             ('tenant-a', 'declared-a', 'PASS', TIMESTAMPTZ '2026-01-01'),
             ('tenant-a', 'declared-a', 'FAIL', TIMESTAMPTZ '2026-01-01'),
             ('tenant-a', 'declared-a', 'ABSENT', TIMESTAMPTZ '2026-01-01'),
             ('tenant-a', 'declared-a', 'WITHHELD', TIMESTAMPTZ '2026-01-01'),
             ('tenant-b', 'declared-b', 'PASS', TIMESTAMPTZ '2026-01-01'),
             ('tenant-a', 'draft-a', 'PASS', TIMESTAMPTZ '2026-01-01'),
             ('tenant-a', 'declared-a', 'PASS', NULL::timestamptz),
             ('tenant-a', 'declared-b', 'PASS', TIMESTAMPTZ '2026-01-01'),
             ('tenant-b', 'declared-a', 'FAIL', TIMESTAMPTZ '2026-01-01'),
             ('tenant-a', 'missing-session', 'FAIL', TIMESTAMPTZ '2026-01-01')
    )`;

  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL!);
    if (
      url.hostname !== '127.0.0.1' ||
      url.port !== '55432' ||
      url.pathname !== '/falcon_examcell_test'
    ) {
      throw new Error('Only the isolated Exam Cell test database is allowed');
    }
    [sql] = await reportQuery();
    client = new PgClient({
      connectionString: process.env.TEST_DATABASE_URL,
      connectionTimeoutMillis: 5000,
      query_timeout: 10000,
    });
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const identity = await client.query(
      "SELECT shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname = current_database()",
    );
    if (
      (identity.rows[0] as { marker?: string })?.marker !==
      'falcon-examcell-disposable-integration-20261021'
    ) {
      throw new Error('Isolated database safety marker is missing');
    }
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

  it('counts all four outcomes but excludes undeclared, orphan and cross-tenant reports', async () => {
    const { rows } = await client.query(fixtures + sql, ['tenant-a']);
    expect(rows).toEqual([
      { label: 'ABSENT', count: 1 },
      { label: 'FAIL', count: 1 },
      { label: 'PASS', count: 2 },
      { label: 'WITHHELD', count: 1 },
    ]);
  });

  it('isolates the second tenant even when mismatched reports refer to its sessions', async () => {
    const { rows } = await client.query(fixtures + sql, ['tenant-b']);
    expect(rows).toEqual([{ label: 'PASS', count: 1 }]);
  });

  it('returns no fabricated categories for a tenant without reports', async () => {
    const { rows } = await client.query(fixtures + sql, ['tenant-empty']);
    expect(rows).toEqual([]);
  });

  it('selects the next three actual exams in order and excludes another tenant, today, cancelled and deleted schedules', async () => {
    const [previewSql] = await reportQuery('LIMIT 3');
    const { rows } = await client.query(
      `WITH academic_subjects(subject_id,subject_name,subject_code) AS (
          VALUES (1,'Existing subject','SUB101')
        ), exam_schedules(exam_schedule_id,tenant_id,exam_type,exam_date,start_time,end_time,venue,subject_id,deleted_at,status) AS (
          VALUES
            ('next-4','tenant-a','END_TERM',DATE '2026-10-28',TIME '09:00',TIME '12:00','Room',1,NULL::timestamptz,'SCHEDULED'),
            ('next-3','tenant-a','END_TERM',DATE '2026-10-27',TIME '09:00',TIME '12:00','Room',1,NULL::timestamptz,'SCHEDULED'),
            ('next-2','tenant-a','END_TERM',DATE '2026-10-26',TIME '09:00',TIME '12:00','Room',1,NULL::timestamptz,'SCHEDULED'),
            ('next-1','tenant-a','END_TERM',DATE '2026-10-25',TIME '09:00',TIME '12:00','Room',1,NULL::timestamptz,'SCHEDULED'),
            ('today','tenant-a','END_TERM',DATE '2026-10-24',TIME '09:00',TIME '12:00','Room',1,NULL::timestamptz,'SCHEDULED'),
            ('foreign','tenant-b','END_TERM',DATE '2026-10-25',TIME '08:00',TIME '12:00','Room',1,NULL::timestamptz,'SCHEDULED'),
            ('unscoped',NULL,'END_TERM',DATE '2026-10-25',TIME '08:00',TIME '12:00','Room',1,NULL::timestamptz,'SCHEDULED'),
            ('cancelled','tenant-a','END_TERM',DATE '2026-10-25',TIME '08:00',TIME '12:00','Room',1,NULL::timestamptz,'CANCELLED'),
            ('deleted','tenant-a','END_TERM',DATE '2026-10-25',TIME '08:00',TIME '12:00','Room',1,TIMESTAMPTZ '2026-10-24','SCHEDULED')
        )` + previewSql,
      ['tenant-a', '2026-10-24'],
    );
    expect(rows).toMatchObject([
      { exam_schedule_id: 'next-1', subject_code: 'SUB101' },
      { exam_schedule_id: 'next-2', subject_code: 'SUB101' },
      { exam_schedule_id: 'next-3', subject_code: 'SUB101' },
    ]);
    expect(rows).toHaveLength(3);
  });

  it('counts only pending registration records in the authenticated tenant', async () => {
    const { service, query } = createDashboard();
    await service.dashboard('tenant-a');
    const [registrationSql] = query.mock.calls.find(
      ([text]) =>
        text.includes('FROM exam_semester_registrations') &&
        text.includes("status = 'PENDING'"),
    )!;
    const { rows } = await client.query(
      `WITH exam_semester_registrations(tenant_id,status) AS (
          VALUES ('tenant-a','PENDING'),('tenant-a','APPROVED'),
                 ('tenant-a','REJECTED'),('tenant-b','PENDING')
        )` + registrationSql,
      ['tenant-a'],
    );
    expect(rows).toEqual([{ c: 1 }]);
  });

  it('excludes metadata-only, stale-file, wrong-status and foreign-tenant papers from the review count', async () => {
    const [reviewSql] = await reportQuery('FROM exam_question_papers');
    const { rows } = await client.query(
      `WITH exam_question_papers(qp_id,tenant_id,status,storage_path) AS (
          VALUES ('current','tenant-a','UNDER_MODERATION','current-v2'),
                 ('metadata','tenant-a','UNDER_MODERATION',NULL),
                 ('stale','tenant-a','UNDER_MODERATION','stale-v1'),
                 ('uploaded','tenant-a','UPLOADED','uploaded-v1'),
                 ('foreign','tenant-b','UNDER_MODERATION','foreign-v1')
        ), exam_question_paper_versions(version_id,qp_id,tenant_id,version_number,storage_key) AS (
          VALUES ('v1','current','tenant-a',1,'current-v1'),
                 ('v2','current','tenant-a',2,'current-v2'),
                 ('v3','stale','tenant-a',1,'stale-v1'),
                 ('v4','stale','tenant-a',2,'stale-v2'),
                 ('v5','uploaded','tenant-a',1,'uploaded-v1'),
                 ('v6','foreign','tenant-b',1,'foreign-v1')
        )` + reviewSql,
      ['tenant-a'],
    );
    expect(rows).toEqual([{ c: 1 }]);
  });
});
