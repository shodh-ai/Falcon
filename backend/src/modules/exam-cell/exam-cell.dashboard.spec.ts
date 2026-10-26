import { Client } from 'pg';
import { ExamCellService } from './exam-cell.service';

type Outcome = { label: string; count: number };

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

function createDashboard(outcomes: Outcome[] = []) {
  const query = jest.fn<
    Promise<Outcome[] | { c: number }[]>,
    [string, unknown[]]
  >((sql) =>
    Promise.resolve(
      sql.includes('FROM student_exam_reports') ? outcomes : [{ c: 3 }],
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
  );
  return { service, query, notify, resultControl };
}

async function reportQuery() {
  const { service, query } = createDashboard();
  await service.dashboard('tenant-a');
  const call = query.mock.calls.find(([sql]) =>
    sql.includes('FROM student_exam_reports'),
  );
  if (!call) throw new Error('Dashboard did not query result reports');
  return call;
}

describe('Examination dashboard declared result outcomes', () => {
  it('uses the campus date and excludes cancelled or deleted sessions from schedule counts', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-25T20:00:00.000Z'));
    try {
      const { service, query } = createDashboard();
      await service.dashboard('tenant-a');
      const scheduleCalls = query.mock.calls.filter(([sql]) =>
        sql.includes('FROM exam_schedules WHERE tenant_id'),
      );
      expect(scheduleCalls).toHaveLength(3);
      expect(scheduleCalls[1][1]).toEqual(['tenant-a', '2026-10-26']);
      expect(scheduleCalls[2][1]).toEqual(['tenant-a', '2026-10-26']);
      for (const [sql] of scheduleCalls) {
        expect(sql).toContain('deleted_at IS NULL');
        expect(sql).toContain("status <> 'CANCELLED'");
      }
      const attendanceCall = query.mock.calls.find(([sql]) =>
        sql.includes('FROM exam_day_attendance da'),
      );
      expect(attendanceCall?.[0]).toContain('es.tenant_id = da.tenant_id');
      expect(attendanceCall?.[1]).toEqual(['tenant-a', '2026-10-26']);
    } finally {
      jest.useRealTimers();
    }
  });

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
    expect(sql).toContain('COALESCE(br.result_status, ser.result_status) AS label');
    expect(sql).toContain('COUNT(*)::int AS count');
    expect(sql).toContain('GROUP BY COALESCE(br.result_status, ser.result_status)');
    expect(sql).toContain('ORDER BY label');
    expect(sql).toContain('br.tenant_id = ser.tenant_id');
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
});

// Optional real PostgreSQL execution. These fixtures are read-only CTEs: no
// tables, application data, publications, notifications or schema are changed.
// Run with FALCON_TEST_DB=1 and TEST_DATABASE_URL pointing at a local database.
const describePostgres =
  process.env.FALCON_TEST_DB === '1' && process.env.TEST_DATABASE_URL
    ? describe
    : describe.skip;

describePostgres(
  'Dashboard outcome query on PostgreSQL (read-only fixtures)',
  () => {
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
      [sql] = await reportQuery();
      client = new PgClient({
        connectionString: process.env.TEST_DATABASE_URL,
        connectionTimeoutMillis: 5000,
        query_timeout: 10000,
      });
      await client.connect();
      await client.query('BEGIN READ ONLY');
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
  },
);
