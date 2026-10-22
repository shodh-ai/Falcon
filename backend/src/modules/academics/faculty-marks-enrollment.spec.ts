import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FacultyWorkspacesService } from './faculty-workspaces.service';

describe('Faculty marks student enrollment boundary', () => {
  function setup(enrolled: boolean) {
    const query = jest.fn(
      (sql: string): Promise<Array<Record<string, unknown>>> => {
        if (sql.includes('SELECT 1 AS ok')) return Promise.resolve([{ ok: 1 }]);
        if (sql.includes('SELECT DISTINCT e.student_user_id')) {
          return Promise.resolve(
            enrolled ? [{ student_user_id: 'student' }] : [],
          );
        }
        return Promise.resolve([]);
      },
    );
    const service = new FacultyWorkspacesService(
      { query } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, query };
  }
  const draft = {
    course_id: 'course',
    exam_type: 'QUIZ',
    max_marks: 10,
    entries: [{ student_user_id: 'student', marks_obtained: 5 }],
  };

  it('rejects a student outside the assigned course or tenant before writing marks', async () => {
    const { service, query } = setup(false);
    await expect(
      service.saveMarksDraft('faculty', 'tenant', draft),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO academic_marks'),
      ),
    ).toBe(false);
  });

  it('still saves marks for an enrolled student', async () => {
    const { service } = setup(true);
    await expect(
      service.saveMarksDraft('faculty', 'tenant', draft),
    ).resolves.toEqual({ saved: 1, status: 'DRAFT' });
  });

  it('rejects duplicate student rows before the upsert reaches PostgreSQL', async () => {
    const { service, query } = setup(true);
    await expect(
      service.saveMarksDraft('faculty', 'tenant', {
        ...draft,
        entries: [draft.entries[0], draft.entries[0]],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO academic_marks'),
      ),
    ).toBe(false);
  });
});

describe('Faculty marks after a previously declared component', () => {
  function setup(published = false) {
    const query = jest.fn(
      (sql: string): Promise<Array<Record<string, unknown>>> => {
        if (sql.includes('SELECT 1 AS ok')) return Promise.resolve([{ ok: 1 }]);
        if (sql.includes('SELECT * FROM exam_result_sessions'))
          return Promise.resolve([
            { entry_status: 'OPEN', marks_locked: false, declared_at: null },
          ]);
        if (sql.includes('UNION ALL SELECT 1 FROM academic_exam_results'))
          return Promise.resolve(published ? [{ exists: 1 }] : []);
        if (sql.includes('SELECT DISTINCT e.student_user_id'))
          return Promise.resolve([{ student_user_id: 'student' }]);
        return Promise.resolve([]);
      },
    );
    const service = new FacultyWorkspacesService(
      { query } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { query, service };
  }

  it('allows first END_TERM marks after INTERNAL completed the same enrollment, within an open session', async () => {
    const { query, service } = setup();
    await expect(
      service.saveMarksDraft('faculty', 'tenant', {
        course_id: 'course',
        exam_type: 'END_TERM',
        max_marks: 50,
        entries: [{ student_user_id: 'student', marks_obtained: 43 }],
      }),
    ).resolves.toEqual({ saved: 1, status: 'DRAFT' });
    const enrollmentSql = query.mock.calls.find(([sql]) =>
      sql.includes('SELECT DISTINCT e.student_user_id'),
    )?.[0];
    expect(enrollmentSql).toContain(
      "e.status IN ('ENROLLED', 'COMPLETED', 'FAILED')",
    );
    expect(enrollmentSql).toContain('u.tenant_id = e.tenant_id');
  });

  it('denies overwriting published results even when the legacy academic_marks row is absent', async () => {
    const { query, service } = setup(true);
    await expect(
      service.saveMarksDraft('faculty', 'tenant', {
        course_id: 'course',
        exam_type: 'END_TERM',
        max_marks: 50,
        entries: [{ student_user_id: 'student', marks_obtained: 43 }],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO academic_marks'),
      ),
    ).toBe(false);
  });

  it('keeps declared students in the roster with their published marks read-only', async () => {
    const { query, service } = setup();
    query.mockImplementation((sql: string) => {
      if (sql.includes('SELECT 1 AS ok')) return Promise.resolve([{ ok: 1 }]);
      if (sql.includes('SELECT * FROM exam_result_sessions'))
        return Promise.resolve([
          {
            entry_status: 'CLOSED',
            marks_locked: true,
            declared_at: '2026-10-21',
          },
        ]);
      if (sql.includes('FROM student_course_enrollments e'))
        return Promise.resolve([
          {
            student_user_id: 'student',
            name: 'Synthetic student',
            marks_obtained: '41',
            max_marks: 50,
            mark_status: 'PUBLISHED',
          },
        ]);
      return Promise.resolve([]);
    });
    const result = (await service.listMarks(
      'faculty',
      'tenant',
      'course',
      'INTERNAL',
    )) as { entry_allowed: boolean; rows: Array<{ status: string }> };
    expect(result.entry_allowed).toBe(false);
    expect(result.rows[0].status).toBe('PUBLISHED');
    expect(
      query.mock.calls.find(([sql]) =>
        sql.includes('FROM student_course_enrollments e'),
      )?.[0],
    ).toContain("e.status IN ('ENROLLED', 'COMPLETED', 'FAILED')");
  });
});

describe('Faculty bulk marks publication boundary', () => {
  function setup(
    options: { closed?: boolean; legacyPublished?: boolean } = {},
  ) {
    const managerQuery = jest.fn((sql: string) => {
      if (sql.includes('SELECT mark_id, exam_type'))
        return Promise.resolve([
          { mark_id: 'quiz', exam_type: 'QUIZ' },
          { mark_id: 'end', exam_type: 'END_TERM' },
        ]);
      if (sql.includes('FROM academic_exam_results'))
        return Promise.resolve(
          options.legacyPublished ? [{ result_id: 'published' }] : [],
        );
      if (sql.includes('SELECT * FROM exam_result_sessions'))
        return Promise.resolve([
          {
            entry_status: options.closed ? 'CLOSED' : 'OPEN',
            marks_locked: false,
            declared_at: null,
          },
        ]);
      if (sql.includes('UPDATE academic_marks'))
        return Promise.resolve([
          { exam_type: 'QUIZ' },
          { exam_type: 'END_TERM' },
        ]);
      return Promise.resolve([]);
    });
    const query = jest.fn(
      (sql: string): Promise<Array<Record<string, unknown>>> => {
        if (sql.includes('SELECT 1 AS ok')) return Promise.resolve([{ ok: 1 }]);
        if (sql.includes('course_name FROM academic_courses'))
          return Promise.resolve([{ course_name: 'Synthetic course' }]);
        return Promise.resolve([]);
      },
    );
    const transaction = jest.fn(
      async (
        action: (manager: { query: typeof managerQuery }) => Promise<unknown>,
      ) => action({ query: managerQuery }),
    );
    const marksPublished = jest.fn();
    const service = new FacultyWorkspacesService(
      { query, transaction } as never,
      { marksPublished } as never,
      {} as never,
      {} as never,
    );
    return { service, query, managerQuery, transaction, marksPublished };
  }

  it('preflights the entire bulk request before any publication when one managed component is closed', async () => {
    const { service, managerQuery, marksPublished } = setup({ closed: true });
    await expect(
      service.publishAllCourseMarks('faculty', 'tenant', 'course'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      managerQuery.mock.calls.some(([sql]) =>
        sql.includes('UPDATE academic_marks'),
      ),
    ).toBe(false);
    expect(marksPublished).not.toHaveBeenCalled();
  });

  it('publishes only quizzes and submits ordinary drafts to COE in one audited transaction', async () => {
    const { service, managerQuery, transaction } = setup();
    await expect(
      service.publishAllCourseMarks('faculty', 'tenant', 'course'),
    ).resolves.toMatchObject({ published: 1, submitted: 1, status: 'MIXED' });
    expect(transaction).toHaveBeenCalledTimes(1);
    const update = managerQuery.mock.calls.find(([sql]) =>
      sql.includes('UPDATE academic_marks'),
    )?.[0];
    expect(update).toContain(
      "CASE WHEN exam_type = 'QUIZ' THEN 'PUBLISHED' ELSE 'PENDING_COE' END",
    );
    expect(update).toContain("AND status = 'DRAFT'");
    expect(
      managerQuery.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO system_audit_logs'),
      ),
    ).toBe(true);
  });

  it('cannot use bulk publication to overwrite a previously published result', async () => {
    const { service, managerQuery } = setup({ legacyPublished: true });
    await expect(
      service.publishAllCourseMarks('faculty', 'tenant', 'course'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(
      managerQuery.mock.calls.some(([sql]) =>
        sql.includes('UPDATE academic_marks'),
      ),
    ).toBe(false);
  });
});
