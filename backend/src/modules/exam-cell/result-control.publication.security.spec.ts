import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExamCellService } from './exam-cell.service';
import { ResultControlService } from './result-control.service';

describe('result publication security', () => {
  const tenantId = 'tenant-a';
  const sessionId = 'session-a';
  const actorUserId = 'exam-user';

  function createService(options: {
    session?: Record<string, unknown> | null;
    marks?: Array<Record<string, unknown>>;
    approval?: boolean;
    failWhen?: (sql: string) => boolean;
    events?: string[];
  } = {}) {
    const events = options.events ?? [];
    const managerQuery = jest.fn(async (sql: string) => {
      if (options.failWhen?.(sql)) throw new Error('database write failed');
      if (sql.includes('FROM exam_result_sessions s')) {
        return options.session === null
          ? []
          : [
              options.session ?? {
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
              },
            ];
      }
      if (sql.includes('FROM exam_result_dean_approval_requests')) {
        return options.approval === false ? [] : [{ ok: true }];
      }
      if (sql.includes('FROM academic_marks')) {
        return options.marks ?? [
          {
            mark_id: 'mark-a',
            student_user_id: 'student-a',
            marks_obtained: 80,
            max_marks: 100,
          },
        ];
      }
      if (sql.includes('UPDATE exam_result_sessions')) return [{ session_id: sessionId }];
      return [];
    });
    const db = {
      query: jest.fn(),
      transaction: jest.fn(async (callback: (manager: { query: typeof managerQuery }) => unknown) => {
        const result = await callback({ query: managerQuery });
        events.push('commit');
        return result;
      }),
    };
    const notify = {
      examResultsPublished: jest.fn(() => events.push('notify')),
    };
    const audit = {
      hasAction: jest.fn().mockResolvedValue(false),
      log: jest.fn(async (_tenant: string, _actor: string, payload: { action: string }) => {
        events.push(`audit:${payload.action}`);
      }),
    };
    const service = new ResultControlService(
      db as never,
      notify as never,
      audit as never,
    );
    return { service, db, managerQuery, notify, audit, events };
  }

  it('commits all publication writes and emits notifications only after commit', async () => {
    const { service, db, managerQuery, notify, audit, events } = createService();

    await expect(
      service.declareSession(tenantId, sessionId, actorUserId, {}),
    ).resolves.toMatchObject({ declared: 1, session_id: sessionId });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.query).not.toHaveBeenCalled();
    expect(managerQuery.mock.calls[0][0]).toContain('FOR UPDATE OF s');
    expect(
      managerQuery.mock.calls.some(
        ([sql]) => sql.includes('FROM academic_marks') && sql.includes('FOR UPDATE'),
      ),
    ).toBe(true);
    expect(
      managerQuery.mock.calls.some(([sql]) => sql.includes('declared_at IS NULL')),
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
    );
    expect(events.indexOf('commit')).toBeLessThan(events.indexOf('notify'));
    expect(events.indexOf('notify')).toBeLessThan(events.indexOf('audit:RESULT_DECLARED'));
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
      managerQuery.mock.calls.some(([sql]) => sql.includes('UPDATE exam_result_sessions')),
    ).toBe(false);
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

  it('requires Dean approval before any marks are published', async () => {
    const { service, managerQuery, notify } = createService({ approval: false });

    await expect(
      service.declareSession(tenantId, sessionId, actorUserId, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      managerQuery.mock.calls.some(([sql]) => sql.includes('FROM academic_marks')),
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
      managerQuery.mock.calls.some(([sql]) => sql.includes('FROM academic_marks')),
    ).toBe(false);
    expect(notify.examResultsPublished).not.toHaveBeenCalled();
  });

  it('routes the legacy service method through the declared-session workflow', async () => {
    const resultControl = {
      getSessionForCourse: jest.fn().mockResolvedValue({ session_id: sessionId }),
      declareSession: jest.fn().mockResolvedValue({ declared: 1 }),
    };
    const service = Object.create(ExamCellService.prototype) as ExamCellService;
    (service as any).resultControl = resultControl;

    await expect(
      service.publishResults(tenantId, {
        course_id: 'course-a',
        exam_type: 'END_TERM',
        batch_semester: 4,
      }, actorUserId),
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
