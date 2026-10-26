import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExamCellService } from './exam-cell.service';
import { ResultControlService } from './result-control.service';
import { parseGradeBands } from './grading-engine';
import {
  resultApprovalState,
  type ResultApprovalMark,
  type ResultApprovalSession,
} from './result-approval-state';

describe('result publication security', () => {
  const tenantId = 'tenant-a';
  const sessionId = 'session-a';
  const actorUserId = 'exam-user';

  function createService(
    options: {
      session?: Partial<ResultApprovalSession> | null;
      marks?: ResultApprovalMark[];
      approval?: boolean;
      enrollmentUpdateRows?: Array<{ enrollment_id: string }>;
      failWhen?: (sql: string) => boolean;
      events?: string[];
    } = {},
  ) {
    const events = options.events ?? [];
    const session: ResultApprovalSession = {
      session_id: sessionId,
      tenant_id: tenantId,
      course_id: 'course-a',
      course_name: 'Algorithms',
      exam_type: 'END_TERM',
      semester: 4,
      grading_policy_id: null,
      pass_marks: 40,
      max_marks: 100,
      declared_at: null,
      entry_status: 'LOCKED',
      marks_locked: true,
      marks_locked_at: '2026-10-21T08:00:00.123456Z',
      ...options.session,
    };
    const marks: ResultApprovalMark[] = options.marks ?? [
      {
        mark_id: 'mark-a',
        student_user_id: 'student-a',
        marks_obtained: 80,
        max_marks: 100,
        status: 'PENDING_COE',
        updated_at: '2026-10-21T07:00:00.123456Z',
        revision: '1001',
      },
    ];
    const state = resultApprovalState(session, marks, {
      rules: null,
      bands: parseGradeBands(null),
    });
    const managerQuery = jest.fn(async (sql: string, _params?: unknown[]) => {
      if (options.failWhen?.(sql)) throw new Error('database write failed');
      if (sql.includes('FROM exam_result_sessions')) {
        return options.session === null ? [] : [session];
      }
      if (sql.includes('FROM exam_result_dean_approval_requests')) {
        return options.approval === false
          ? []
          : [
              {
                request_id: 'approval-a',
                tenant_id: tenantId,
                session_id: sessionId,
                status: 'APPROVED',
                request_summary: { result_state: state },
              },
            ];
      }
      if (sql.includes('FROM exam_audit_logs')) {
        return [
          {
            action: 'RESULT_COE_AUDIT_PASSED',
            new_value: { result_state: state },
          },
        ];
      }
      if (sql.includes('FROM academic_marks')) return marks;
      if (sql.includes('FROM student_course_enrollments'))
        return marks.map((mark) => ({
          enrollment_id: `enrollment-${mark.student_user_id}`,
          student_user_id: mark.student_user_id,
        }));
      if (sql.includes('UPDATE student_course_enrollments')) {
        const rows = options.enrollmentUpdateRows ?? [
          { enrollment_id: `enrollment-${_params?.[1]}` },
        ];
        return [rows, rows.length];
      }
      if (sql.includes('UPDATE exam_result_sessions'))
        return [{ session_id: sessionId }];
      return [];
    });
    const manager = { query: managerQuery };
    const db = {
      query: jest.fn(),
      transaction: jest.fn(
        async (
          callback: (manager: { query: typeof managerQuery }) => unknown,
        ) => {
          const result = await callback(manager);
          events.push('commit');
          return result;
        },
      ),
    };
    const notify = {
      examResultsPublished: jest.fn(() => events.push('notify')),
    };
    const audit = {
      hasAction: jest.fn().mockResolvedValue(false),
      log: jest.fn(
        async (
          _tenant: string,
          _actor: string,
          payload: { action: string },
        ) => {
          events.push(`audit:${payload.action}`);
        },
      ),
    };
    const service = new ResultControlService(
      db as never,
      notify as never,
      audit as never,
    );
    return { service, db, manager, managerQuery, notify, audit, events };
  }

  it('commits all publication writes and emits notifications only after commit', async () => {
    const { service, db, manager, managerQuery, notify, audit, events } =
      createService();

    await expect(
      service.declareSession(tenantId, sessionId, actorUserId, {}),
    ).resolves.toMatchObject({ declared: 1, session_id: sessionId });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.query).not.toHaveBeenCalled();
    const lockIndex = managerQuery.mock.calls.findIndex(([sql]) =>
      sql.includes('pg_advisory_xact_lock'),
    );
    const sessionLockIndex = managerQuery.mock.calls.findIndex(([sql]) =>
      sql.includes('FOR UPDATE OF s'),
    );
    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(sessionLockIndex).toBeGreaterThan(lockIndex);
    expect(
      managerQuery.mock.calls.some(
        ([sql]) =>
          sql.includes('FROM academic_marks') && sql.includes('FOR UPDATE'),
      ),
    ).toBe(true);
    const enrollmentLock = managerQuery.mock.calls.find(([sql]) =>
      sql.includes('FROM student_course_enrollments'),
    );
    expect(enrollmentLock?.[0]).toContain('FOR UPDATE');
    const enrollmentWrite = managerQuery.mock.calls.find(([sql]) =>
      sql.includes('UPDATE student_course_enrollments'),
    );
    expect(enrollmentWrite?.[0]).toContain('RETURNING enrollment_id');
    expect(enrollmentWrite?.[0]).toContain('deleted_at IS NULL');
    expect(enrollmentWrite?.[1]).toEqual([
      tenantId,
      'student-a',
      'course-a',
      expect.any(String),
      expect.any(Number),
      'PASS',
      4,
    ]);
    expect(
      managerQuery.mock.calls.some(([sql]) =>
        sql.includes('declared_at IS NULL'),
      ),
    ).toBe(true);
    expect(notify.examResultsPublished).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith(
      tenantId,
      actorUserId,
      expect.objectContaining({
        action: 'RESULT_DECLARED',
        resource_id: sessionId,
        new_value: expect.objectContaining({ outcome: 'SUCCESS' }),
      }),
      manager,
    );
    expect(events.indexOf('audit:RESULT_DECLARED')).toBeLessThan(
      events.indexOf('commit'),
    );
    expect(events.indexOf('commit')).toBeLessThan(events.indexOf('notify'));
  });

  it('rolls back the logical publication when a required report write fails', async () => {
    const { service, notify, audit, managerQuery } = createService({
      failWhen: (sql) => sql.includes('INSERT INTO student_exam_reports'),
    });

    await expect(
      service.declareSession(tenantId, sessionId, actorUserId, {}),
    ).rejects.toThrow('database write failed');

    expect(notify.examResultsPublished).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      tenantId,
      actorUserId,
      expect.objectContaining({ action: 'RESULT_DECLARATION_FAILED' }),
    );
    expect(
      managerQuery.mock.calls.some(([sql]) =>
        sql.includes('UPDATE exam_result_sessions'),
      ),
    ).toBe(false);
  });

  it('keeps publication committed and attempts other recipients when one notification dispatch fails', async () => {
    const { service, notify, audit, events } = createService({
      marks: ['a', 'b'].map((id) => ({
        mark_id: `mark-${id}`,
        student_user_id: `student-${id}`,
        marks_obtained: 80,
        max_marks: 100,
        status: 'PENDING_COE',
        updated_at: '2026-10-21T07:00:00.123456Z',
        revision: '1001',
      })),
    });
    notify.examResultsPublished.mockImplementationOnce(() => {
      events.push('notify:failed');
      throw new Error('notification transport unavailable');
    });

    await expect(
      service.declareSession(tenantId, sessionId, actorUserId, {}),
    ).resolves.toMatchObject({
      declared: 2,
      session_id: sessionId,
      notification_dispatch_failures: 1,
    });

    expect(notify.examResultsPublished).toHaveBeenCalledTimes(2);
    expect(notify.examResultsPublished).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ tenantId, userId: 'student-b' }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      tenantId,
      actorUserId,
      expect.objectContaining({
        action: 'RESULT_NOTIFICATION_DISPATCH_FAILED',
        resource_type: 'exam_result_session',
        resource_id: sessionId,
        new_value: { outcome: 'PUBLICATION_COMMITTED', failed_count: 1 },
      }),
    );
    expect(events.indexOf('commit')).toBeLessThan(
      events.indexOf('notify:failed'),
    );
    expect(events.indexOf('notify:failed')).toBeLessThan(
      events.indexOf('notify'),
    );
    expect(events.indexOf('commit')).toBeLessThan(
      events.indexOf('audit:RESULT_NOTIFICATION_DISPATCH_FAILED'),
    );
    expect(events).not.toContain('audit:RESULT_DECLARATION_FAILED');
  });

  it('does not reject committed publication if the post-commit notification failure audit also fails', async () => {
    const { service, notify, audit, events } = createService();
    notify.examResultsPublished.mockImplementation(() => {
      events.push('notify:failed');
      throw new Error('notification transport unavailable');
    });
    audit.log.mockImplementation(async (_tenant, _actor, payload) => {
      events.push(`audit:${payload.action}`);
      if (payload.action === 'RESULT_NOTIFICATION_DISPATCH_FAILED') {
        throw new Error('post-commit audit unavailable');
      }
    });

    await expect(
      service.declareSession(tenantId, sessionId, actorUserId, {}),
    ).resolves.toMatchObject({
      declared: 1,
      session_id: sessionId,
      notification_dispatch_failures: 1,
    });

    expect(events).toEqual([
      'audit:RESULT_DECLARED',
      'commit',
      'notify:failed',
      'audit:RESULT_NOTIFICATION_DISPATCH_FAILED',
    ]);
    expect(audit.log).toHaveBeenCalledTimes(2);
  });

  it('fails the declaration when the required legacy mirror write fails', async () => {
    const { service, notify } = createService({
      failWhen: (sql) => sql.includes('INSERT INTO academic_exam_results'),
    });

    await expect(
      service.declareSession(tenantId, sessionId, actorUserId, {}),
    ).rejects.toThrow('database write failed');
    expect(notify.examResultsPublished).not.toHaveBeenCalled();
  });

  it.each([
    ['no enrollment', []],
    [
      'multiple enrollments',
      [{ enrollment_id: 'enrollment-a' }, { enrollment_id: 'enrollment-b' }],
    ],
  ] as const)(
    'rejects publication when the enrollment update affects %s',
    async (_label, enrollmentRows) => {
      const { service, notify, events, audit } = createService({
        enrollmentUpdateRows: [...enrollmentRows],
      });

      await expect(
        service.declareSession(tenantId, sessionId, actorUserId, {}),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(events).not.toContain('commit');
      expect(notify.examResultsPublished).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalledWith(
        tenantId,
        actorUserId,
        expect.objectContaining({ action: 'RESULT_DECLARED' }),
        expect.anything(),
      );
    },
  );

  it('requires Dean approval before any marks are published', async () => {
    const { service, managerQuery, notify } = createService({
      approval: false,
    });

    await expect(
      service.declareSession(tenantId, sessionId, actorUserId, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      managerQuery.mock.calls.some(([sql]) =>
        /^\s*(?:INSERT|UPDATE|DELETE)\b/.test(sql),
      ),
    ).toBe(false);
    expect(notify.examResultsPublished).not.toHaveBeenCalled();
  });

  it('rejects a session outside the authenticated tenant scope', async () => {
    const { service, notify } = createService({ session: null });

    await expect(
      service.declareSession('tenant-b', sessionId, actorUserId, {}),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(notify.examResultsPublished).not.toHaveBeenCalled();
  });

  it('does not republish an already declared session', async () => {
    const { service, managerQuery, notify } = createService({
      session: {
        session_id: sessionId,
        tenant_id: tenantId,
        course_id: 'course-a',
        course_name: 'Algorithms',
        exam_type: 'END_TERM',
        semester: 4,
        declared_at: new Date().toISOString(),
      },
    });

    await expect(
      service.declareSession(tenantId, sessionId, actorUserId, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      managerQuery.mock.calls.some(([sql]) =>
        sql.includes('FROM academic_marks'),
      ),
    ).toBe(false);
    expect(notify.examResultsPublished).not.toHaveBeenCalled();
  });

  it('routes the legacy service method through the declared-session workflow', async () => {
    const resultControl = {
      getSessionForCourse: jest
        .fn()
        .mockResolvedValue({ session_id: sessionId }),
      declareSession: jest.fn().mockResolvedValue({ declared: 1 }),
    };
    const service = Object.create(ExamCellService.prototype) as ExamCellService;
    (service as any).resultControl = resultControl;

    await expect(
      service.publishResults(
        tenantId,
        {
          course_id: 'course-a',
          exam_type: 'END_TERM',
          batch_semester: 4,
        },
        actorUserId,
      ),
    ).resolves.toEqual({ declared: 1 });
    expect(resultControl.getSessionForCourse).toHaveBeenCalledWith(
      tenantId,
      'course-a',
      'END_TERM',
      4,
    );
    expect(resultControl.declareSession).toHaveBeenCalledWith(
      tenantId,
      sessionId,
      actorUserId,
      { declaration_note: 'Published via legacy results endpoint' },
    );
  });
});
