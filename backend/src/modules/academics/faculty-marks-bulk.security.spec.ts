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

function setup(
  options: {
    types?: string[];
    status?: string;
    session?: Record<string, unknown> | null;
    authorized?: boolean;
    failWrite?: boolean;
    failCommit?: boolean;
  } = {},
) {
  const events: string[] = [];
  const marks = (options.types ?? ['END_TERM']).map((exam_type, i) => ({
    mark_id: `mark-${i}`,
    exam_type,
    status: options.status ?? 'DRAFT',
  }));
  const manager = {
    query: jest.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('SELECT mark_id, exam_type FROM academic_marks')) {
        return marks.filter((row) => row.status === 'DRAFT');
      }
      if (sql.includes('FROM exam_result_sessions')) {
        return options.session === null ? [] : [options.session ?? openSession];
      }
      if (sql.includes('FROM academic_exam_results')) return [];
      if (sql.includes('INSERT INTO system_audit_logs')) return [];
      if (sql.includes('UPDATE academic_marks')) {
        if (options.failWrite) throw new Error('write failed');
        const changed = marks.filter((row) => row.status === 'DRAFT');
        for (const row of changed) {
          row.status = row.exam_type === 'QUIZ' ? 'PUBLISHED' : 'PENDING_COE';
        }
        return [changed, changed.length];
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
    transaction: jest.fn(
      async (work: (executor: typeof manager) => Promise<unknown>) => {
        const result = await work(manager);
        if (options.failCommit) throw new Error('commit failed');
        events.push('commit');
        return result;
      },
    ),
  };
  const notify = { marksPublished: jest.fn(() => events.push('notify')) };
  const service = new FacultyWorkspacesService(
    db as never,
    notify as never,
    {} as never,
    {} as never,
  );
  const submit = () =>
    service.publishAllCourseMarks(facultyId, tenantId, courseId);
  return { submit, db, manager, marks, notify, events };
}

describe('Faculty bulk marks submission security', () => {
  it.each(['END_TERM', 'ETE', 'CAT1', 'MT1', 'GA1'])(
    'submits %s for Exam Cell rather than publishing or notifying students',
    async (examType) => {
      const { submit, marks, notify, manager, db } = setup({
        types: [examType],
      });
      await expect(submit()).resolves.toMatchObject({
        published: 0,
        submitted: 1,
        status: 'PENDING_COE',
        notified_count: 0,
      });
      expect(marks[0].status).toBe('PENDING_COE');
      expect(notify.marksPublished).not.toHaveBeenCalled();
      expect(db.transaction).toHaveBeenCalledTimes(1);
      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE'),
        [tenantId, courseId, examType],
      );
      const update = manager.query.mock.calls.find(([sql]) =>
        sql.includes('UPDATE academic_marks'),
      )!;
      expect(update[0]).toContain(
        "CASE WHEN exam_type = 'QUIZ' THEN 'PUBLISHED' ELSE 'PENDING_COE' END",
      );
      expect(update[0]).toContain(
        "status = 'DRAFT' AND mark_id = ANY($4::uuid[])",
      );
      expect(update[1]).toEqual([tenantId, courseId, facultyId, ['mark-0']]);
      expect(db.query.mock.calls.some(([sql]) => sql.includes('UPDATE'))).toBe(
        false,
      );
    },
  );

  it('keeps the tenant and assigned-faculty course check', async () => {
    const { submit, db, manager, notify } = setup({ authorized: false });
    await expect(submit()).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('tenant_id = $1'),
      [tenantId, facultyId, courseId],
    );
    expect(db.transaction).not.toHaveBeenCalled();
    expect(manager.query).not.toHaveBeenCalled();
    expect(notify.marksPublished).not.toHaveBeenCalled();
  });

  it.each([
    ['missing session', null],
    ['closed window', { ...openSession, entry_status: 'CLOSED' }],
    ['locked marks', { ...openSession, marks_locked: true }],
    ['already declared', { ...openSession, declared_at: '2026-01-01' }],
    ['future window', { ...openSession, entry_open_at: '2999-01-01' }],
    ['expired window', { ...openSession, entry_close_at: '2000-01-01' }],
  ])('rejects the entire mixed batch for %s', async (_label, session) => {
    const { submit, marks, manager, notify } = setup({
      types: ['QUIZ', 'END_TERM'],
      session,
    });
    await expect(submit()).rejects.toBeInstanceOf(BadRequestException);
    expect(marks.every((row) => row.status === 'DRAFT')).toBe(true);
    expect(
      manager.query.mock.calls.some(([sql]) =>
        sql.trimStart().startsWith('UPDATE'),
      ),
    ).toBe(false);
    expect(notify.marksPublished).not.toHaveBeenCalled();
  });

  it('respects an existing ETE session lock even for direct-entry grading components', async () => {
    const { submit, notify } = setup({
      types: ['ETE'],
      session: { ...openSession, marks_locked: true },
    });
    await expect(submit()).rejects.toBeInstanceOf(BadRequestException);
    expect(notify.marksPublished).not.toHaveBeenCalled();
  });

  it('allows existing ETE direct entry to be submitted, never published, without a session', async () => {
    const { submit, notify } = setup({ types: ['ETE'], session: null });
    await expect(submit()).resolves.toMatchObject({
      published: 0,
      submitted: 1,
    });
    expect(notify.marksPublished).not.toHaveBeenCalled();
  });

  it.each(['PENDING_COE', 'PUBLISHED'])(
    'does not change %s rows or send notifications on retry',
    async (status) => {
      const { submit, marks, manager, notify } = setup({ status });
      await expect(submit()).resolves.toMatchObject({
        published: 0,
        submitted: 0,
        status: 'UNCHANGED',
      });
      expect(marks[0].status).toBe(status);
      expect(
        manager.query.mock.calls.some(([sql]) =>
          sql.trimStart().startsWith('UPDATE'),
        ),
      ).toBe(false);
      expect(notify.marksPublished).not.toHaveBeenCalled();
    },
  );

  it('publishes only quizzes in a mixed batch and notifies only after commit, once', async () => {
    const { submit, marks, notify, events } = setup({
      types: ['QUIZ', 'END_TERM'],
    });
    await expect(submit()).resolves.toMatchObject({
      published: 1,
      submitted: 1,
      notified_count: 1,
    });
    expect(marks.map((row) => row.status)).toEqual([
      'PUBLISHED',
      'PENDING_COE',
    ]);
    expect(events).toEqual(['commit', 'notify']);
    expect(notify.marksPublished).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId, examType: 'QUIZ' }),
    );
    await expect(submit()).resolves.toMatchObject({
      published: 0,
      submitted: 0,
    });
    expect(notify.marksPublished).toHaveBeenCalledTimes(1);
  });

  it.each([{ failWrite: true }, { failCommit: true }])(
    'does not notify on transaction failure: %j',
    async (failure) => {
      const { submit, notify } = setup({
        types: ['QUIZ', 'END_TERM'],
        ...failure,
      });
      await expect(submit()).rejects.toThrow('failed');
      expect(notify.marksPublished).not.toHaveBeenCalled();
    },
  );

  it.each(['UNKNOWN', 'WT1', 'WT2'])(
    'fails closed for unsupported/manual-auto type %s',
    async (examType) => {
      const { submit, manager, notify } = setup({ types: [examType] });
      await expect(submit()).rejects.toBeInstanceOf(BadRequestException);
      expect(
        manager.query.mock.calls.some(([sql]) =>
          sql.trimStart().startsWith('UPDATE'),
        ),
      ).toBe(false);
      expect(notify.marksPublished).not.toHaveBeenCalled();
    },
  );
});
