import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ResultControlService } from './result-control.service';
import { resolveDeanDepartmentIds } from '../academics/dean-scope.util';

jest.mock('../academics/dean-scope.util', () => ({
  resolveDeanDepartmentIds: jest.fn(),
}));
const scope = jest.mocked(resolveDeanDepartmentIds);
const snapshot = {
  session_id: 'session',
  course_id: 'course',
  course_code: 'SYNTH',
  course_name: 'Synthetic course',
  exam_type: 'INTERNAL',
  semester: 6,
  max_marks: 50,
  pass_marks: 20,
  grading_policy_id: null,
  grading_rules: null,
  entry_status: 'LOCKED',
  marks_locked: true,
  declared_at: null,
  input_hash: 'current-hash',
  marks: [
    {
      mark_id: 'mark',
      student_user_id: 'student',
      marks_obtained: '42',
      max_marks: '50',
      status: 'PENDING_COE',
    },
  ],
};
type Internal = {
  workflowSnapshot: (...args: unknown[]) => Promise<typeof snapshot>;
  latestCoeAudit: (...args: unknown[]) => Promise<unknown>;
};
function setup() {
  const approval = {
    request_id: 'request',
    status: 'APPROVED',
    request_summary: { input_hash: 'current-hash' },
  };
  const query = jest
    .fn<Promise<Array<Record<string, unknown>>>, [string, unknown[]?]>()
    .mockImplementation((sql) => {
      if (
        sql.includes('SELECT status,request_summary') ||
        sql.includes('SELECT request_id,status,request_summary')
      )
        return Promise.resolve([approval]);
      if (sql.includes('SELECT r.session_id'))
        return Promise.resolve([{ session_id: 'session' }]);
      if (sql.includes('SELECT session_id FROM exam_result_sessions'))
        return Promise.resolve([{ session_id: 'session' }]);
      if (sql.includes('INSERT INTO exam_result_dean_approval_requests'))
        return Promise.resolve([{ request_id: 'request', status: 'PENDING' }]);
      return Promise.resolve([]);
    });
  const manager = { query };
  const transaction = jest.fn(
    async (work: (tx: typeof manager) => Promise<unknown>) => work(manager),
  );
  const audit = {
    log: jest.fn().mockResolvedValue(undefined),
    hasAction: jest.fn().mockResolvedValue(true),
  };
  const notify = {
    examResultsPublished: jest.fn(),
    approvalRequired: jest.fn(),
  };
  const service = new ResultControlService(
    { query, transaction } as never,
    notify as never,
    audit as never,
  );
  const internal = service as unknown as Internal;
  const read = jest
    .spyOn(internal, 'workflowSnapshot')
    .mockResolvedValue({ ...snapshot, marks: [...snapshot.marks] });
  const coe = jest.spyOn(internal, 'latestCoeAudit').mockResolvedValue({
    action: 'RESULT_COE_AUDIT_PASSED',
    new_value: { input_hash: 'current-hash' },
  });
  const getSession = jest
    .spyOn(service, 'getSession')
    .mockResolvedValue(snapshot);
  scope.mockResolvedValue([7]);
  return {
    service,
    internal,
    query,
    manager,
    transaction,
    audit,
    notify,
    read,
    coe,
    approval,
    getSession,
  };
}

describe('Result review binding', () => {
  beforeEach(() => jest.clearAllMocks());
  it.each(['REJECTED', 'PENDING'])(
    'does not use historical approval when latest decision is %s',
    async (status) => {
      const f = setup();
      f.approval.status = status;
      await expect(
        f.service.declareSession('tenant', 'session', 'actor', {}),
      ).rejects.toThrow('Current Dean approval');
      expect(f.audit.hasAction).not.toHaveBeenCalled();
      expect(f.notify.examResultsPublished).not.toHaveBeenCalled();
      expect(
        f.query.mock.calls.some(([sql]) =>
          sql.includes('UPDATE academic_marks'),
        ),
      ).toBe(false);
    },
  );
  it.each([
    {},
    { input_hash: 'old-hash' },
    { input_hash: 'current-hash', invalidated_at: '2026-10-21' },
  ])(
    'fails closed for legacy, changed or invalidated approval %j',
    async (summary) => {
      const f = setup();
      f.approval.request_summary = summary as { input_hash: string };
      await expect(
        f.service.declareSession('tenant', 'session', 'actor', {}),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(f.notify.examResultsPublished).not.toHaveBeenCalled();
    },
  );
  it.each(['RESULT_COE_AUDIT_ANOMALY', 'RESULT_COE_AUDIT_INVALIDATED'])(
    'refuses latest COE state %s even after a historic pass',
    async (action) => {
      const f = setup();
      f.coe.mockResolvedValue({
        action,
        new_value: { input_hash: 'current-hash' },
      });
      await expect(
        f.service.declareSession('tenant', 'session', 'actor', {}),
      ).rejects.toThrow('current COE formula audit');
    },
  );
  it('requires COE audit to bind exactly the current marks/rules hash', async () => {
    const f = setup();
    f.coe.mockResolvedValue({
      action: 'RESULT_COE_AUDIT_PASSED',
      new_value: { input_hash: 'old-hash' },
    });
    await expect(
      f.service.requestDeanApproval('tenant', 'session', 'actor'),
    ).rejects.toThrow('current COE formula audit');
  });
  it('requires locked faculty entry before publication or review', async () => {
    const f = setup();
    f.read.mockResolvedValue({
      ...snapshot,
      marks_locked: false,
      entry_status: 'OPEN',
    });
    await expect(
      f.service.declareSession('tenant', 'session', 'actor', {}),
    ).rejects.toThrow('Close and lock');
    await expect(
      f.service.requestDeanApproval('tenant', 'session', 'actor'),
    ).rejects.toThrow('Close and lock');
  });
  it('publishes only current approved inputs and audits in the same transaction', async () => {
    const f = setup();
    await expect(
      f.service.declareSession('tenant', 'session', 'actor', {}),
    ).resolves.toMatchObject({ declared: 1 });
    expect(f.audit.log).toHaveBeenCalledWith(
      'tenant',
      'actor',
      expect.objectContaining({
        action: 'RESULT_DECLARED',
        new_value: { declared: 1, input_hash: 'current-hash' },
      }),
      f.manager,
    );
    expect(
      f.query.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO student_exam_reports'),
      ),
    ).toBe(true);
  });
  it.each(['configure', 'reopen', 'open'])(
    'invalidates old approvals and COE audit transactionally on %s mutation',
    async (kind) => {
      const f = setup();
      if (kind === 'configure')
        await f.service.configureRules(
          'tenant',
          'session',
          { pass_marks: 21 },
          'actor',
        );
      if (kind === 'reopen')
        await f.service.reopenEntry(
          'tenant',
          'session',
          { reason: 'Synthetic correction' },
          'actor',
        );
      if (kind === 'open')
        await f.service.openEntry('tenant', 'session', {}, 'actor');
      expect(
        f.query.mock.calls.some(([sql]) =>
          sql.includes("'invalidated_at',NOW()::text"),
        ),
      ).toBe(true);
      expect(f.audit.log).toHaveBeenCalledWith(
        'tenant',
        'actor',
        expect.objectContaining({ action: 'RESULT_COE_AUDIT_INVALIDATED' }),
        f.manager,
      );
    },
  );
  it.each(['configure', 'open', 'reopen', 'create'])(
    'refuses mutation of declared sessions through %s',
    async (kind) => {
      const f = setup();
      f.read.mockResolvedValue({
        ...snapshot,
        declared_at: new Date() as never,
      });
      if (kind === 'create')
        f.query.mockResolvedValueOnce([{ course_id: 'course' }]);
      const promise =
        kind === 'configure'
          ? f.service.configureRules('tenant', 'session', { pass_marks: 21 })
          : kind === 'open'
            ? f.service.openEntry('tenant', 'session', {})
            : kind === 'reopen'
              ? f.service.reopenEntry('tenant', 'session', {
                  reason: 'Synthetic',
                })
              : f.service.createSession('tenant', {
                  course_id: 'course',
                  exam_type: 'INTERNAL',
                  semester: 6,
                });
      await expect(promise).rejects.toThrow('immutable');
      expect(
        f.query.mock.calls.some(([sql]) =>
          /UPDATE academic_marks|INSERT INTO exam_result_sessions/.test(sql),
        ),
      ).toBe(false);
    },
  );
  it.each(['close', 'lock'])(
    'keeps declared sessions immutable for %s actions',
    async (kind) => {
      const f = setup();
      f.getSession.mockResolvedValue({ ...snapshot, declared_at: new Date() });
      await expect(
        kind === 'close'
          ? f.service.closeEntry('tenant', 'session')
          : f.service.lockMarks('tenant', 'session', 'actor'),
      ).rejects.toThrow('immutable');
      expect(f.query).not.toHaveBeenCalled();
    },
  );
  it.each(['close', 'lock'])(
    'guards %s mutation atomically against concurrent declaration',
    async (kind) => {
      const f = setup();
      await expect(
        kind === 'close'
          ? f.service.closeEntry('tenant', 'session')
          : f.service.lockMarks('tenant', 'session', 'actor'),
      ).rejects.toThrow('immutable');
      expect(f.query.mock.calls[0][0]).toContain(
        'declared_at IS NULL RETURNING session_id',
      );
      expect(f.query.mock.calls[0][0]).toContain('tenant_id=');
    },
  );
  it('does not swallow audit failure during rule mutation', async () => {
    const f = setup();
    f.audit.log.mockRejectedValueOnce(new Error('audit unavailable'));
    await expect(
      f.service.configureRules(
        'tenant',
        'session',
        { pass_marks: 21 },
        'actor',
      ),
    ).rejects.toThrow('audit unavailable');
  });
  it('stores exact audited input hash', async () => {
    const f = setup();
    await expect(
      f.service.runFormulaAudit('tenant', 'session', 'actor'),
    ).resolves.toMatchObject({ status: 'passed' });
    expect(f.audit.log).toHaveBeenCalledWith(
      'tenant',
      'actor',
      expect.objectContaining({
        new_value: expect.objectContaining({
          input_hash: 'current-hash',
        }) as unknown,
      }),
      f.manager,
    );
  });
});

describe('Dean result decision scope', () => {
  beforeEach(() => jest.clearAllMocks());
  it('requires actual course timetable department scope for a Dean', async () => {
    const f = setup();
    f.query.mockImplementation((sql) =>
      Promise.resolve(sql.includes('SELECT r.session_id') ? [] : []),
    );
    await expect(
      f.service.decideDeanResultApproval(
        'tenant',
        'dean',
        'request',
        'APPROVED',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(f.query.mock.calls[0][0]).toContain('faculty.tenant_id=r.tenant_id');
    expect(f.query.mock.calls[0][0]).toContain(
      'faculty.dept_id=ANY($3::int[])',
    );
    expect(f.query.mock.calls[0][1]).toEqual(['tenant', 'request', [7]]);
    expect(f.query.mock.calls[0][0]).toContain("allocation.status='ACTIVE'");
    expect(f.query.mock.calls[0][0]).toContain('t.deleted_at IS NULL');
    expect(f.audit.log).not.toHaveBeenCalled();
  });
  it('rejects a Dean with no scope before any mutation', async () => {
    const f = setup();
    scope.mockResolvedValue([]);
    await expect(
      f.service.decideDeanResultApproval(
        'tenant',
        'dean',
        'request',
        'APPROVED',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(f.query).not.toHaveBeenCalled();
  });
  it('approves only the latest bound pending request with history and audit in one transaction', async () => {
    const f = setup();
    f.approval.status = 'PENDING';
    await expect(
      f.service.decideDeanResultApproval(
        'tenant',
        'dean',
        'request',
        'APPROVED',
      ),
    ).resolves.toEqual({
      request_id: 'request',
      session_id: 'session',
      status: 'APPROVED',
    });
    expect(f.audit.log).toHaveBeenCalledWith(
      'tenant',
      'dean',
      expect.objectContaining({ action: 'RESULT_DEAN_APPROVED' }),
      f.manager,
    );
    expect(
      f.query.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO exam_result_dean_approval_history'),
      ),
    ).toBe(true);
  });
});

describe('Review fingerprint determinism', () => {
  it('binds marks, max/pass marks and configured grading rules while preserving publication transition', async () => {
    const row = {
      ...snapshot,
      grading_rules: { bands: [{ grade: 'A', min: 80 }], other: true },
    };
    const marks = [...snapshot.marks];
    const query = jest
      .fn<Promise<unknown[]>, [string, unknown[]?]>()
      .mockImplementation((sql) =>
        Promise.resolve(sql.includes('SELECT s.session_id') ? [row] : marks),
      );
    const service = new ResultControlService(
      { query } as never,
      {} as never,
      {} as never,
    ) as unknown as Internal;
    const original = await service.workflowSnapshot(
      { query },
      'tenant',
      'session',
    );
    marks[0] = { ...marks[0], status: 'PUBLISHED' };
    const published = await service.workflowSnapshot(
      { query },
      'tenant',
      'session',
    );
    expect(published.input_hash).toBe(original.input_hash);
    marks[0] = { ...marks[0], marks_obtained: '43' };
    expect(
      (await service.workflowSnapshot({ query }, 'tenant', 'session'))
        .input_hash,
    ).not.toBe(original.input_hash);
    marks[0] = { ...snapshot.marks[0] };
    row.grading_rules = { bands: [{ grade: 'A', min: 85 }], other: true };
    expect(
      (await service.workflowSnapshot({ query }, 'tenant', 'session'))
        .input_hash,
    ).not.toBe(original.input_hash);
    row.grading_rules = { bands: [{ grade: 'A', min: 80 }], other: true };
    row.pass_marks = 21;
    expect(
      (await service.workflowSnapshot({ query }, 'tenant', 'session'))
        .input_hash,
    ).not.toBe(original.input_hash);
  });
});
