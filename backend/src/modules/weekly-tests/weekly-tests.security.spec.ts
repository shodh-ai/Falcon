import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { WeeklyTestsController } from './weekly-tests.controller';
import { WeeklyTestsService } from './weekly-tests.service';

const tenantId = 'tenant-a';
const studentId = 'student-a';
const testId = 'test-a';
const answers = ['A', 'B'];
const submission = { answers, violation_count: 0 };
const now = new Date('2026-10-14T10:00:00Z');
const test = {
  test_id: testId,
  course_id: 'course-a',
  test_type: 'WT1',
  question_paper_url: '/paper.pdf',
  answer_key: ['A', 'B'],
  start_time: '2026-10-14T09:00:00Z',
  end_time: '2026-10-14T11:00:00Z',
  status: 'ACTIVE',
  is_active: true,
};
const response = { answers, score: '2.00', submitted_at: now };

function makeService(query: jest.Mock) {
  return new WeeklyTestsService({ query } as never, {} as never);
}

describe('weekly test student security', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(now));
  afterEach(() => jest.useRealTimers());

  it('rejects student calls without tenant context before any service access', () => {
    const tests = { getAvailableTests: jest.fn() };
    const controller = new WeeklyTestsController(tests as never);
    expect(() =>
      controller.getAvailableTests({ user: { user_id: studentId } }),
    ).toThrow(ForbiddenException);
    expect(tests.getAvailableTests).not.toHaveBeenCalled();
  });

  it.each(['getAvailableTests', 'getTestForAttempt'] as const)(
    'scopes %s to enrolled courses in the authenticated tenant',
    async (method) => {
      const query = jest
        .fn<Promise<unknown[]>, [string, unknown[]]>()
        .mockResolvedValue([]);
      const service = makeService(query);
      if (method === 'getTestForAttempt') {
        await expect(
          service.getTestForAttempt(tenantId, studentId, testId),
        ).rejects.toBeInstanceOf(NotFoundException);
      } else {
        await service.getAvailableTests(tenantId, studentId);
      }
      expect(query.mock.calls[0][0]).toContain('c.tenant_id = t.tenant_id');
      expect(query.mock.calls[0][0]).toContain('e.tenant_id = t.tenant_id');
      expect(query.mock.calls[0][0]).toContain("e.status = 'ENROLLED'");
      expect(query.mock.calls[0][0]).toContain('e.deleted_at IS NULL');
      expect(query.mock.calls[0][1].slice(0, 2)).toEqual([tenantId, studentId]);
    },
  );

  it('rejects submission when the test is not in the student enrollment and tenant', async () => {
    const query = jest
      .fn<Promise<unknown[]>, [string, unknown[]]>()
      .mockResolvedValue([]);
    await expect(
      makeService(query).submitTest(tenantId, studentId, testId, submission),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('e.student_user_id = $3');
    expect(query.mock.calls[0][1]).toEqual([testId, tenantId, studentId]);
  });

  it.each([
    { label: 'inactive', fields: { is_active: false } },
    { label: 'future', fields: { start_time: '2026-10-14T10:01:00Z' } },
    { label: 'ended', fields: { end_time: '2026-10-14T09:59:00Z' } },
    { label: 'at deadline', fields: { end_time: now.toISOString() } },
    { label: 'completed', fields: { status: 'COMPLETED' } },
  ])('rejects a new $label submission', async ({ fields }) => {
    const query = jest
      .fn<Promise<unknown[]>, [string, unknown[]]>()
      .mockResolvedValueOnce([{ ...test, ...fields }])
      .mockResolvedValueOnce([]);
    await expect(
      makeService(query).submitTest(tenantId, studentId, testId, submission),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('stores a valid first submission once, with eligibility checked again in SQL', async () => {
    const query = jest
      .fn<Promise<unknown[]>, [string, unknown[]]>()
      .mockResolvedValueOnce([test])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ score: '2.00' }]);
    await expect(
      makeService(query).submitTest(tenantId, studentId, testId, submission),
    ).resolves.toEqual({ success: true, score: 2 });
    const [sql, params] = query.mock.calls[2];
    expect(sql).toContain('ON CONFLICT (test_id, student_user_id) DO NOTHING');
    expect(sql).not.toContain('DO UPDATE');
    expect(sql).toContain('FOR SHARE OF t');
    expect(sql).toContain('t.is_active = true');
    expect(sql).toContain("t.status IN ('SCHEDULED', 'ACTIVE')");
    expect(sql).toContain(
      't.start_time <= clock_timestamp() AND t.end_time > clock_timestamp()',
    );
    expect(sql).toContain('e.tenant_id = t.tenant_id');
    expect(sql).toContain('e.student_user_id = $2');
    expect(sql).toContain('e.deleted_at IS NULL');
    expect(params).toEqual([
      testId,
      studentId,
      JSON.stringify(answers),
      2,
      0,
      tenantId,
    ]);
  });

  it('returns the original result for an identical retry, even after the test closes', async () => {
    const query = jest
      .fn<Promise<unknown[]>, [string, unknown[]]>()
      .mockResolvedValueOnce([
        { ...test, status: 'COMPLETED', is_active: false },
      ])
      .mockResolvedValueOnce([response]);
    await expect(
      makeService(query).submitTest(tenantId, studentId, testId, submission),
    ).resolves.toEqual({ success: true, score: 2 });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('rejects changed answers after submission without computing or overwriting a new score', async () => {
    const query = jest
      .fn<Promise<unknown[]>, [string, unknown[]]>()
      .mockResolvedValueOnce([test])
      .mockResolvedValueOnce([response]);
    await expect(
      makeService(query).submitTest(tenantId, studentId, testId, {
        ...submission,
        answers: ['C', 'D'],
      }),
    ).rejects.toThrow('answers cannot be changed');
    expect(query).toHaveBeenCalledTimes(2);
  });

  it.each([
    { label: 'identical', saved: response, rejected: false },
    {
      label: 'changed',
      saved: { ...response, answers: ['C', 'D'] },
      rejected: true,
    },
  ])(
    'handles a concurrent $label first submission without overwriting it',
    async ({ saved, rejected }) => {
      const query = jest
        .fn<Promise<unknown[]>, [string, unknown[]]>()
        .mockResolvedValueOnce([test])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([saved]);
      const result = makeService(query).submitTest(
        tenantId,
        studentId,
        testId,
        submission,
      );
      if (rejected)
        await expect(result).rejects.toThrow('answers cannot be changed');
      else await expect(result).resolves.toEqual({ success: true, score: 2 });
      expect(query).toHaveBeenCalledTimes(4);
      expect(query.mock.calls[2][0]).not.toContain('DO UPDATE');
    },
  );

  it('rejects when eligibility or the time window changes before the atomic insert', async () => {
    const query = jest
      .fn<Promise<unknown[]>, [string, unknown[]]>()
      .mockResolvedValueOnce([test])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    await expect(
      makeService(query).submitTest(tenantId, studentId, testId, submission),
    ).rejects.toThrow('no longer available');
    expect(query).toHaveBeenCalledTimes(4);
  });

  it('limits missing-response grading to active tenant enrollment and preserves a concurrent submission', async () => {
    const query = jest
      .fn<Promise<unknown[]>, [string, unknown[]]>()
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...test, tenant_id: tenantId }])
      .mockResolvedValueOnce([{ student_user_id: studentId }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    await makeService(query).handleAutoGradeAndPublish();
    const [enrollmentSql, params] = query.mock.calls[3];
    expect(enrollmentSql).toContain('e.tenant_id = $3');
    expect(enrollmentSql).toContain("e.status = 'ENROLLED'");
    expect(enrollmentSql).toContain('e.deleted_at IS NULL');
    expect(params).toEqual([test.course_id, testId, tenantId]);
    expect(query.mock.calls[4][0]).toContain(
      'ON CONFLICT (test_id, student_user_id) DO NOTHING',
    );
  });
});
