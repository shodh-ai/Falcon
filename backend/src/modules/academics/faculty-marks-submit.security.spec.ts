import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FacultyWorkspacesService } from './faculty-workspaces.service';

const tenantId = 'tenant-a';
const facultyId = 'faculty-a';
const courseId = 'course-a';
const openSession = {
  entry_status: 'OPEN',
  marks_locked: false,
  declared_at: null,
  entry_open_at: null,
  entry_close_at: null,
};

function setup(options: {
  examType?: string;
  sessions?: Array<Record<string, unknown>>;
  authorized?: boolean;
  failWrite?: boolean;
  failCommit?: boolean;
} = {}) {
  const events: string[] = [];
  let status = 'DRAFT';
  const manager = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('FROM exam_result_sessions'))
        return options.sessions ?? [openSession];
      if (sql.includes('UPDATE academic_marks')) {
        if (options.failWrite) throw new Error('write failed');
        if (status !== 'DRAFT') return [[], 0];
        status = String(params?.[4]);
        return [[{ mark_id: 'mark-a' }], 1];
      }
      throw new Error(`Unexpected transaction query: ${sql}`);
    }),
  };
  const db = {
    query: jest.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('SELECT 1 AS ok'))
        return options.authorized === false ? [] : [{ ok: 1 }];
      if (sql.includes('FROM academic_courses'))
        return [{ course_name: 'Algorithms' }];
      if (sql.includes('FROM student_course_enrollments'))
        return [{ student_user_id: 'student-a' }];
      throw new Error(`Unexpected global query: ${sql}`);
    }),
    transaction: jest.fn(async (work: (executor: typeof manager) => Promise<unknown>) => {
      const initial = status;
      events.push('begin');
      try {
        const result = await work(manager);
        if (options.failCommit) throw new Error('commit failed');
        events.push('commit');
        return result;
      } catch (error) {
        status = initial;
        events.push('rollback');
        throw error;
      }
    }),
  };
  const notify = { marksPublished: jest.fn(() => events.push('notify')) };
  const service = new FacultyWorkspacesService(
    db as never,
    notify as never,
    {} as never,
    {} as never,
  );
  const submit = () => service.publishMarks(
    facultyId, tenantId, courseId, options.examType ?? 'END_TERM',
  );
  return { submit, db, manager, notify, events };
}

// These mocks assert lock/write ordering and failure handling, not PostgreSQL concurrency.
describe('Faculty single-assessment submission security', () => {
  it('locks the input scope and session before submitting marks in one transaction', async () => {
    const { submit, db, manager, notify, events } = setup();
    await expect(submit()).resolves.toMatchObject({
      published: 1, status: 'PENDING_COE', notified_count: 0,
    });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(manager.query.mock.calls[0]).toEqual([
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [JSON.stringify(['result-input', tenantId, courseId, 'END_TERM'])],
    ]);
    expect(manager.query.mock.calls[1][0]).toContain('FOR UPDATE');
    expect(manager.query.mock.calls[1][1]).toEqual([tenantId, courseId, 'END_TERM']);
    expect(manager.query.mock.calls[2][0]).toContain("status = 'DRAFT'");
    expect(manager.query.mock.calls[2][1]).toEqual([
      tenantId, courseId, 'END_TERM', facultyId, 'PENDING_COE',
    ]);
    expect(db.query.mock.calls.some(([sql]) => sql.includes('UPDATE'))).toBe(false);
    expect(notify.marksPublished).not.toHaveBeenCalled();
    expect(events).toEqual(['begin', 'commit']);
  });

  it.each([
    ['missing session', []],
    ['closed window', [{ ...openSession, entry_status: 'CLOSED' }]],
    ['locked marks', [{ ...openSession, marks_locked: true }]],
    ['already declared', [{ ...openSession, declared_at: '2026-01-01' }]],
    ['future window', [{ ...openSession, entry_open_at: '2999-01-01' }]],
    ['expired window', [{ ...openSession, entry_close_at: '2000-01-01' }]],
  ])('rejects %s using the locked current state before writing', async (_label, sessions) => {
    const { submit, manager, notify, events } = setup({ sessions });
    await expect(submit()).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.query).toHaveBeenCalledTimes(2);
    expect(events).toEqual(['begin', 'rollback']);
    expect(notify.marksPublished).not.toHaveBeenCalled();
  });

  it('rejects a locked older session even when the newest session is open', async () => {
    const { submit, manager } = setup({
      sessions: [openSession, { ...openSession, marks_locked: true }],
    });
    await expect(submit()).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.query.mock.calls[1][0]).not.toContain('LIMIT 1');
    expect(manager.query).toHaveBeenCalledTimes(2);
  });

  it('keeps the existing assigned-faculty and tenant checks', async () => {
    const { submit, db } = setup({ authorized: false });
    await expect(submit()).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('tenant_id = $1'), [tenantId, facultyId, courseId],
    );
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('respects an existing direct-entry component session lock', async () => {
    const { submit, manager } = setup({
      examType: 'ETE', sessions: [{ ...openSession, marks_locked: true }],
    });
    await expect(submit()).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.query).toHaveBeenCalledTimes(2);
  });

  it('keeps direct-entry components supported without a result session', async () => {
    const { submit, notify } = setup({ examType: 'ETE', sessions: [] });
    await expect(submit()).resolves.toMatchObject({ status: 'PENDING_COE' });
    expect(notify.marksPublished).not.toHaveBeenCalled();
  });

  it('does not submit protected marks again on retry', async () => {
    const { submit, notify } = setup();
    await expect(submit()).resolves.toMatchObject({ status: 'PENDING_COE' });
    await expect(submit()).rejects.toThrow('No draft marks found');
    expect(notify.marksPublished).not.toHaveBeenCalled();
  });

  it('retains quiz-only direct publication and notifies after commit', async () => {
    const { submit, manager, notify, events } = setup({ examType: 'QUIZ', sessions: [] });
    await expect(submit()).resolves.toMatchObject({ status: 'PUBLISHED', notified_count: 1 });
    expect(manager.query.mock.calls[0][0]).toContain('pg_advisory_xact_lock');
    expect(events).toEqual(['begin', 'commit', 'notify']);
    expect(notify.marksPublished).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId, examType: 'QUIZ' }),
    );
  });

  it.each([
    { ...openSession, marks_locked: true },
    { ...openSession, declared_at: '2026-01-01' },
  ])('does not bypass a protected result session for quiz submission: %j', async (session) => {
    const { submit, manager, notify } = setup({ examType: 'QUIZ', sessions: [session] });
    await expect(submit()).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.query).toHaveBeenCalledTimes(2);
    expect(notify.marksPublished).not.toHaveBeenCalled();
  });

  it.each([{ failWrite: true }, { failCommit: true }])(
    'never sends success notifications when a transaction fails: %j', async (failure) => {
      const { submit, notify, events } = setup({ examType: 'QUIZ', ...failure });
      await expect(submit()).rejects.toThrow('failed');
      expect(notify.marksPublished).not.toHaveBeenCalled();
      expect(events).toEqual(['begin', 'rollback']);
    },
  );
});
