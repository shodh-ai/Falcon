import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { LmsExtendedService } from './lms-extended.service';

describe('LmsExtendedService scope and concurrency controls', () => {
  const notificationEmitter = { liveClassScheduled: jest.fn() } as any;

  function serviceWith(query: jest.Mock, transaction?: jest.Mock) {
    return new LmsExtendedService(
      {
        query,
        transaction: transaction ?? jest.fn(async (work) => work({ query })),
      } as any,
      notificationEmitter,
    );
  }

  it('does not reveal a course from another tenant', async () => {
    const service = serviceWith(jest.fn().mockResolvedValueOnce([]));
    await expect(
      service.listCourseQuizzes('tenant-a', 'course-b', 'student-a', [
        'Student',
      ]),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('blocks an unenrolled student from quizzes and forums', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ course_id: 'course-a' }])
      .mockResolvedValueOnce([]);
    const service = serviceWith(query);
    await expect(
      service.listCourseQuizzes('tenant-a', 'course-a', 'student-a', [
        'Student',
      ]),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks faculty without an active course allocation', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ course_id: 'course-a' }])
      .mockResolvedValueOnce([]);
    const service = serviceWith(query);
    await expect(
      service.listThreads('tenant-a', 'course-a', 'faculty-a', ['Faculty']),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks an HOD from a course outside their department', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ course_id: 'course-a' }])
      .mockResolvedValueOnce([]);
    const service = serviceWith(query);
    await expect(
      service.listThreads('tenant-a', 'course-a', 'hod-b', ['HOD']),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(query.mock.calls[1][1]).toEqual([
      'tenant-a',
      'course-a',
      'hod-b',
      false,
    ]);
  });

  it('serializes attempt creation and applies tenant and enrollment scope', async () => {
    const managerQuery = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          quiz_id: 'quiz-a',
          tenant_id: 'tenant-a',
          course_id: 'course-a',
          max_attempts: 1,
        },
      ])
      .mockResolvedValueOnce([{ course_id: 'course-a' }])
      .mockResolvedValueOnce([{ ok: 1 }])
      .mockResolvedValueOnce([{ c: 0 }])
      .mockResolvedValueOnce([{ attempt_id: 'attempt-a' }]);
    const transaction = jest.fn(async (work) => work({ query: managerQuery }));
    const service = serviceWith(jest.fn(), transaction);

    await expect(
      service.startAttempt('tenant-a', 'quiz-a', 'student-a'),
    ).resolves.toMatchObject({ attempt_id: 'attempt-a' });
    expect(managerQuery.mock.calls[0][0]).toContain('pg_advisory_xact_lock');
    expect(managerQuery.mock.calls[1][1]).toEqual(['tenant-a', 'quiz-a']);
  });

  it('does not increment a forum vote on an idempotent duplicate', async () => {
    const managerQuery = jest
      .fn()
      .mockResolvedValueOnce([{ course_id: 'course-a' }])
      .mockResolvedValueOnce([{ course_id: 'course-a' }])
      .mockResolvedValueOnce([{ ok: 1 }])
      .mockResolvedValueOnce([]);
    const transaction = jest.fn(async (work) => work({ query: managerQuery }));
    const service = serviceWith(jest.fn(), transaction);

    await expect(
      service.upvote(
        'tenant-a',
        'student-a',
        ['Student'],
        'THREAD',
        'thread-a',
      ),
    ).resolves.toEqual({ upvoted: true, duplicate: true });
    expect(
      managerQuery.mock.calls.some(([sql]) =>
        String(sql).includes('SET upvotes = upvotes + 1'),
      ),
    ).toBe(false);
  });
});
