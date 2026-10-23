import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  ReEvaluationQaService,
  REEVALUATION_QA_IDS,
} from './re-evaluation-qa.service';
import { ReEvaluationQaController } from './re-evaluation-qa.controller';

describe('isolated local re-evaluation QA workflow', () => {
  const tenant = '10000000-0000-4000-8000-000000000001';
  const actor = '20000000-0000-4000-8000-000000000001';
  const id = REEVALUATION_QA_IDS[0];
  const query = jest.fn();
  let service: ReEvaluationQaService;
  let row: any;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      REEVALUATION_QA_ENABLED: 'true',
      DB_HOST: 'localhost',
      DATABASE_ENV: 'test',
      DEPLOYMENT_ENV: 'test',
    };
    query.mockReset();
    row = {
      request_id: id,
      tenant_id: tenant,
      original_marks: '42.00',
      max_marks: '100.00',
      revised_marks: null,
      result_marks: '42.00',
      source: 'LOCAL_QA',
      status: 'ASSIGNED',
      version: 0,
      report_notes: null,
    };
    query.mockImplementation(async (sql: string) =>
      sql.startsWith('SELECT')
        ? [row]
        : [[{ ...row, version: row.version + 1 }], 1],
    );
    service = new ReEvaluationQaService({
      query,
      transaction: async (run: any) => run({ query }),
    } as never);
  });
  afterEach(() => {
    process.env = originalEnv;
  });

  it.each([
    ['NODE_ENV', 'production'],
    ['NODE_ENV', ''],
    ['REEVALUATION_QA_ENABLED', 'false'],
    ['DB_HOST', 'remote-db.example'],
    ['DEPLOYMENT_ENV', 'production'],
    ['DATABASE_ENV', 'live'],
  ])(
    'refuses QA access when %s=%s before querying any data',
    async (key, value) => {
      process.env[key] = value;
      await expect(service.get(tenant, id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(query).not.toHaveBeenCalled();
    },
  );

  it('rejects all request IDs outside the two exact seeded cases', async () => {
    await expect(service.get(tenant, actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('scopes reads to tenant, exact student, subject, original snapshot and assigned reviewer', async () => {
    const value = await service.get(tenant, id, actor);
    expect(value).toMatchObject({
      is_qa: true,
      official_publication: false,
      original_marks: '42.00',
    });
    expect(query.mock.calls[0][1]).toEqual([id, tenant, actor]);
    for (const part of [
      'q.tenant_id=$2',
      'a.original_marks=q.original_marks',
      'a.exam_result_id IS NULL',
      'student4@mygyanvihar.com',
      "s.subject_code='SMOKE101'",
      'a.assigned_faculty_user_id=$3',
    ]) {
      expect(query.mock.calls[0][0]).toContain(part);
    }
  });

  it('fails closed for an absent or differently owned fixture', async () => {
    query.mockResolvedValue([]);
    await expect(service.get(tenant, id, actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('shows a clear setup error when the QA schema has not been installed', async () => {
    query.mockRejectedValue({ code: '42P01' });
    await expect(service.get(tenant, id)).rejects.toThrow('not been set up');
  });

  it.each([-1, 100.01, 1.234, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid QA marks %s before writing',
    async (revised_marks) => {
      await expect(
        service.act(tenant, id, 'report', 0, actor, {
          revised_marks,
          report_notes: 'QA only',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(
        false,
      );
    },
  );

  it.each([0, 100])(
    'accepts a boundary mark of %s but writes only QA storage',
    async (revised_marks) => {
      await service.act(tenant, id, 'report', 0, actor, {
        revised_marks,
        report_notes: ' QA only ',
      });
      expect(query.mock.calls[0][0]).toContain(
        'FOR UPDATE OF q FOR SHARE OF a,u',
      );
      expect(query.mock.calls[0][1]).toEqual([id, tenant, actor]);
      expect(query.mock.calls[1][0]).toContain(
        'UPDATE local_reevaluation_qa.cases',
      );
      expect(query.mock.calls[1][1]).toEqual([
        id,
        tenant,
        0,
        revised_marks,
        'QA only',
      ]);
      expect(
        query.mock.calls.some(([sql]) =>
          /(?:UPDATE|INSERT INTO|DELETE FROM) public\./.test(sql),
        ),
      ).toBe(false);
    },
  );

  it('rejects a stale report version before writing', async () => {
    row.version = 2;
    await expect(
      service.act(tenant, id, 'report', 1, actor, {
        revised_marks: 46,
        report_notes: 'QA only',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('rejects a duplicate report after submission', async () => {
    row.status = 'UNDER_REVIEW';
    await expect(
      service.act(tenant, id, 'report', 0, actor, {
        revised_marks: 46,
        report_notes: 'QA only',
      }),
    ).rejects.toThrow('already been submitted');
  });

  it('requires a valid report before QA completion', async () => {
    await expect(service.act(tenant, id, 'complete', 0, actor)).rejects.toThrow(
      'required first',
    );
  });

  it('completes only the QA result without updating public results or notifying anyone', async () => {
    Object.assign(row, {
      status: 'UNDER_REVIEW',
      revised_marks: '46.00',
      report_notes: 'Existing QA report',
    });
    const value = await service.act(tenant, id, 'complete', 0, actor);
    expect(value.official_publication).toBe(false);
    expect(query.mock.calls[1][0]).toContain(
      "result_marks=revised_marks,status='COMPLETED'",
    );
    expect(query.mock.calls[1][0]).not.toContain('public.');
  });

  it('resets only the QA snapshot using optimistic concurrency', async () => {
    await service.act(tenant, id, 'reset', 0, actor);
    expect(query.mock.calls[1][0]).toContain('status=initial_status');
    expect(query.mock.calls[1][0]).toContain('version=version+1');
    expect(query.mock.calls[1][0]).not.toContain('public.');
  });

  it('uses the same tenant/assignment restriction from the QA controller', () => {
    const api = { get: jest.fn(), act: jest.fn() };
    const controller = new ReEvaluationQaController(api as never);
    const faculty = {
      user: { user_id: actor, tenant_id: tenant, role: 'Faculty' },
    };
    controller.get(faculty, id);
    expect(api.get).toHaveBeenCalledWith(tenant, id, actor);
    controller.report(faculty, id, {
      expected_version: 0,
      revised_marks: 46,
      report_notes: 'QA only',
    });
    expect(api.act).toHaveBeenCalledWith(
      tenant,
      id,
      'report',
      0,
      actor,
      expect.objectContaining({ revised_marks: 46 }),
    );
    expect(() =>
      controller.complete(faculty, id, { expected_version: 0 }),
    ).toThrow();
    expect(() =>
      controller.reset(faculty, id, { expected_version: 0 }),
    ).toThrow();
  });
});
