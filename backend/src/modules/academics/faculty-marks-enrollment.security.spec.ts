import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FacultyWorkspacesService } from './faculty-workspaces.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const courseId = '22222222-2222-4222-8222-222222222222';
const facultyId = '33333333-3333-4333-8333-333333333333';
const enrolledStudentId = '44444444-4444-4444-8444-444444444444';
const outsideStudentId = '55555555-5555-4555-8555-555555555555';

const openSession = {
  entry_status: 'OPEN',
  marks_locked: false,
  declared_at: null,
  entry_open_at: null,
  entry_close_at: null,
};

function draft(studentIds = [enrolledStudentId]) {
  return {
    course_id: courseId,
    exam_type: 'CAT1',
    max_marks: 50,
    entries: studentIds.map((student_user_id, index) => ({
      student_user_id,
      marks_obtained: 30 + index,
    })),
  };
}

function createService(options?: {
  enrolledRows?: Array<{ student_user_id: string }>;
  session?: Record<string, unknown> | null;
  sessions?: Array<Record<string, unknown>>;
  locked?: boolean;
  authorized?: boolean;
  savedCount?: number;
}) {
  const manager = { query: jest.fn() };
  const events: string[] = [];
  const dataSource = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('SELECT 1 AS ok'))
        return options?.authorized === false ? [] : [{ ok: 1 }];
      throw new Error(`Unexpected global query: ${sql}`);
    }),
    transaction: jest.fn(
      async (work: (transactionManager: typeof manager) => Promise<unknown>) => {
        events.push('begin');
        try {
          const result = await work(manager);
          events.push('commit');
          return result;
        } catch (error) {
          events.push('rollback');
          throw error;
        }
      },
    ),
  };
  manager.query.mockImplementation(async (sql: string) => {
    if (sql.includes('pg_advisory_xact_lock')) return [];
    if (sql.includes('FROM exam_result_sessions')) {
      return options?.sessions ??
        (options?.session === null ? [] : [options?.session ?? openSession]);
    }
    if (sql.includes('FROM academic_marks')) {
      return options?.locked ? [{ mark_id: 'locked' }] : [];
    }
    if (sql.includes('FROM student_course_enrollments')) {
      return options?.enrolledRows ?? [{ student_user_id: enrolledStudentId }];
    }
    if (sql.includes('INSERT INTO academic_marks')) {
      return Array.from({ length: options?.savedCount ?? 1 }, (_, index) => ({
        mark_id: `saved-${index}`,
      }));
    }
    throw new Error(`Unexpected transaction query: ${sql}`);
  });
  const service = new FacultyWorkspacesService(
    dataSource as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, dataSource, manager, events };
}

describe('Faculty marks enrollment authorization', () => {
  it('writes marks only after tenant-and-course roster validation in one transaction', async () => {
    const { service, dataSource, manager } = createService();

    await expect(service.saveMarksDraft(facultyId, tenantId, draft())).resolves.toEqual({
      saved: 1,
      status: 'DRAFT',
    });

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    const queries = manager.query.mock.calls.map(([sql]) => sql as string);
    expect(queries[0]).toContain('pg_advisory_xact_lock');
    expect(manager.query.mock.calls[0][1]).toEqual([
      JSON.stringify(['result-input', tenantId, courseId, 'CAT1']),
    ]);
    expect(queries[1]).toContain('FROM exam_result_sessions');
    expect(queries[1]).toContain('FOR UPDATE');
    expect(queries[2]).toContain('FROM academic_marks');
    expect(queries[2]).toContain('FOR UPDATE');
    expect(queries[3]).toContain('FROM student_course_enrollments');
    expect(queries[3]).toContain("status = 'ENROLLED'");
    expect(manager.query.mock.calls[3][1]).toEqual([tenantId, courseId, [enrolledStudentId]]);
    expect(queries[4]).toContain('INSERT INTO academic_marks');
    expect(queries[4]).toContain(
      "WHERE academic_marks.status NOT IN ('PENDING_COE', 'PUBLISHED')",
    );
    expect(queries[4]).toContain('RETURNING mark_id');
    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a student not enrolled in the course', [{ student_user_id: enrolledStudentId }]],
    ['a student from another tenant or course', []],
  ])('rejects %s without writing any marks', async (_label, enrolledRows) => {
    const { service, manager } = createService({ enrolledRows });

    await expect(
      service.saveMarksDraft(facultyId, tenantId, draft([enrolledStudentId, outsideStudentId])),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(manager.query.mock.calls.some(([sql]) =>
      (sql as string).includes('INSERT INTO academic_marks'),
    )).toBe(false);
  });

  it('rejects duplicate student IDs before opening a write transaction', async () => {
    const { service, dataSource, manager } = createService();

    await expect(
      service.saveMarksDraft(facultyId, tenantId, draft([enrolledStudentId, enrolledStudentId])),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(manager.query).not.toHaveBeenCalled();
  });

  it('rechecks a missing session inside the transaction before any marks write', async () => {
    const { service, dataSource, manager } = createService({ session: null });

    await expect(service.saveMarksDraft(facultyId, tenantId, draft())).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.query).toHaveBeenCalledTimes(2);
    expect(manager.query.mock.calls[1][0]).toContain('FOR UPDATE');
  });

  it('rechecks and locks submitted marks inside the same transaction', async () => {
    const { service, dataSource, manager } = createService({ locked: true });

    await expect(service.saveMarksDraft(facultyId, tenantId, draft())).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.query).toHaveBeenCalledTimes(3);
    expect(manager.query.mock.calls[2][0]).toContain('FOR UPDATE');
  });

  it.each([
    ['closed', { ...openSession, entry_status: 'CLOSED' }],
    ['locked', { ...openSession, marks_locked: true }],
    ['declared', { ...openSession, declared_at: '2026-01-01' }],
    ['not opened yet', { ...openSession, entry_open_at: '2999-01-01' }],
    ['expired', { ...openSession, entry_close_at: '2000-01-01' }],
  ])('rejects a session that is %s when its transaction lock is acquired', async (_label, session) => {
    const { service, manager, events } = createService({ session });
    await expect(service.saveMarksDraft(facultyId, tenantId, draft())).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(manager.query).toHaveBeenCalledTimes(2);
    expect(events).toEqual(['begin', 'rollback']);
  });

  it('rejects unassigned faculty before starting the transaction', async () => {
    const { service, dataSource } = createService({ authorized: false });
    await expect(service.saveMarksDraft(facultyId, tenantId, draft())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('does not let a newer open session bypass an older locked batch sharing its marks', async () => {
    const { service, manager } = createService({
      sessions: [openSession, { ...openSession, marks_locked: true }],
    });
    await expect(service.saveMarksDraft(facultyId, tenantId, draft())).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(manager.query.mock.calls[1][0]).not.toContain('LIMIT 1');
    expect(manager.query).toHaveBeenCalledTimes(2);
  });

  it('respects an existing lock for direct-entry grading components too', async () => {
    const { service } = createService({ session: { ...openSession, marks_locked: true } });
    await expect(service.saveMarksDraft(facultyId, tenantId, {
      ...draft(), exam_type: 'ETE',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('preserves direct-entry grading when no result session exists', async () => {
    const { service } = createService({ session: null });
    await expect(service.saveMarksDraft(facultyId, tenantId, {
      ...draft(), exam_type: 'ETE',
    })).resolves.toEqual({ saved: 1, status: 'DRAFT' });
  });

  it.each([
    { ...openSession, marks_locked: true },
    { ...openSession, declared_at: '2026-01-01' },
  ])('does not bypass a protected result session for quiz drafts: %j', async (session) => {
    const { service, manager } = createService({ session });
    await expect(service.saveMarksDraft(facultyId, tenantId, {
      ...draft(), exam_type: 'QUIZ',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.query).toHaveBeenCalledTimes(2);
  });

  it('preserves quiz draft entry when no result session exists', async () => {
    const { service } = createService({ session: null });
    await expect(service.saveMarksDraft(facultyId, tenantId, {
      ...draft(), exam_type: 'QUIZ',
    })).resolves.toEqual({ saved: 1, status: 'DRAFT' });
  });

  it('rolls back the entire save if a conflict becomes protected before the upsert', async () => {
    const { service, events } = createService({ savedCount: 0 });
    await expect(service.saveMarksDraft(facultyId, tenantId, draft())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(events).toEqual(['begin', 'rollback']);
  });

  it('does not reset a published quiz or change its maximum/uploader', async () => {
    const { service, manager, events } = createService({ savedCount: 0 });
    await expect(service.saveMarksDraft(facultyId, tenantId, {
      ...draft(), exam_type: 'QUIZ',
    })).rejects.toBeInstanceOf(ForbiddenException);
    const upsert = manager.query.mock.calls.find(([sql]) =>
      (sql as string).includes('INSERT INTO academic_marks'),
    );
    expect(upsert?.[0]).toContain("WHERE academic_marks.status NOT IN ('PENDING_COE', 'PUBLISHED')");
    expect(events).toEqual(['begin', 'rollback']);
  });
});
