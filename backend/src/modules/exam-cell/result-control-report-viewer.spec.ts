import { NotFoundException } from '@nestjs/common';
import { ResultControlService } from './result-control.service';

describe('ResultControlService read-only declared report viewer', () => {
  const session = {
    session_id: 'session-1',
    course_id: 'course-1',
    course_code: 'SUB101',
    course_name: 'Example subject',
    exam_type: 'END_TERM',
    semester: 4,
    declared_at: '2026-10-08T10:00:00Z',
    declaration_note: null as string | null,
  };
  const report = {
    report_id: 'report-1',
    tenant_id: 'tenant-1',
    session_id: session.session_id,
    student_user_id: 'student-1',
    student_name: 'Example Student',
    enrollment_number: 'ENR-123',
    course_id: session.course_id,
    exam_type: session.exam_type,
    marks_obtained: '42',
    max_marks: '60',
    grade: 'B',
    grade_points: '7',
    result_status: 'PASS',
    report_summary: 'Existing declared report summary',
    declared_at: session.declared_at,
  };
  const result = {
    tenant_id: 'tenant-1',
    result_id: 'result-1',
    student_user_id: report.student_user_id,
    result_session_id: session.session_id,
    course_id: session.course_id,
    exam_type: session.exam_type,
    source_report_id: report.report_id,
    source_mark_id: 'mark-1',
    source_mark_updated_at: '2026-10-08 10:00:00+00',
    grading_policy_snapshot: {
      bands: [{ minPercent: 0, maxPercent: 100, grade: 'B', gradePoints: 7 }],
    },
    pass_marks_snapshot: '24',
    exam_session: 'Semester 4',
    marks_obtained: '42',
    max_marks: '60',
    grade: 'B',
    grade_points: '7',
    status: 'PUBLISHED',
  };
  const source = {
    semester: 4,
    session_max: '60',
    course_name: session.course_name,
    declaration_note: null,
    source_marks: '42',
    source_max: '60',
    source_updated_at: result.source_mark_updated_at,
    report_marks: '42',
    report_max: '60',
    report_declared_at: report.declared_at,
    report_grade: 'B',
    report_grade_points: '7',
    report_result_status: 'PASS',
  };

  function setup(
    overrides: {
      sessions?: Array<Record<string, unknown>>;
      reports?: Array<Record<string, unknown>>;
      results?: Array<Record<string, unknown>>;
      sources?: Array<Record<string, unknown>>;
      enrollments?: Array<Record<string, unknown>>;
    } = {},
  ) {
    const query = jest
      .fn<
        Promise<Array<Record<string, unknown>>>,
        [sql: string, params?: unknown[]]
      >()
      .mockImplementation(async (sql: string) => {
        if (/SELECT s.session_id, s.course_id/.test(sql))
          return overrides.sessions ?? [session];
        if (/SELECT r\.\*, u.name AS student_name/.test(sql))
          return overrides.reports ?? [report];
        if (/SELECT er.tenant_id, er.result_id/.test(sql))
          return overrides.results ?? [result];
        if (/SELECT s.semester, s.max_marks AS session_max/.test(sql))
          return overrides.sources ?? [source];
        if (/SELECT enrollment_id FROM student_course_enrollments/.test(sql))
          return overrides.enrollments ?? [{ enrollment_id: 'enrollment-1' }];
        throw new Error(`Unexpected database operation: ${sql}`);
      });
    const db = { query, transaction: jest.fn() };
    const notify = { examResultsPublished: jest.fn() };
    const audit = {
      log: jest.fn(),
      hasAction: jest.fn(),
      latestAction: jest.fn(),
    };
    const service = new ResultControlService(
      db as never,
      notify as never,
      audit as never,
    );
    return {
      read: () => service.listSessionReports('tenant-1', 'session-1'),
      query,
      db,
      notify,
      audit,
    };
  }

  it('exposes existing report values and exact canonical provenance without modifying any record', async () => {
    const before = JSON.stringify({ session, report, result, source });
    const { read, query, db, notify, audit } = setup();
    await expect(read()).resolves.toEqual([
      {
        ...report,
        course_code: 'SUB101',
        course_name: 'Example subject',
        semester: 4,
        session_declared_at: session.declared_at,
        declaration_note: null,
        result_id: 'result-1',
        exam_session: 'Semester 4',
        canonical_marks_obtained: '42',
        canonical_max_marks: '60',
        canonical_grade: 'B',
        canonical_status: 'PUBLISHED',
        source_mark_id: 'mark-1',
        source_report_id: 'report-1',
        verification_status: 'verified',
        verification_message: expect.stringContaining(
          'Confirm the exact exam and attempt',
        ),
      },
    ]);
    expect(JSON.stringify({ session, report, result, source })).toBe(before);
    for (const [sql] of query.mock.calls) {
      expect(sql.trim()).toMatch(/^SELECT\b/);
      expect(sql).not.toMatch(/\b(UPDATE|INSERT|DELETE|FOR UPDATE)\b/);
    }
    expect(db.transaction).not.toHaveBeenCalled();
    expect(notify.examResultsPublished).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
    expect(audit.hasAction).not.toHaveBeenCalled();
    expect(audit.latestAction).not.toHaveBeenCalled();
  });

  it('requires the requested session to exist in the tenant before reading any student information', async () => {
    const { read, query } = setup({ sessions: [] });
    await expect(read()).rejects.toBeInstanceOf(NotFoundException);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual(['tenant-1', 'session-1']);
    expect(query.mock.calls[0][0]).toContain(
      's.tenant_id=$1 AND s.session_id=$2',
    );
    expect(query.mock.calls[0][0]).toContain('s.deleted_at IS NULL');
    expect(query.mock.calls[0][0]).toContain(
      'c.tenant_id=s.tenant_id AND c.deleted_at IS NULL',
    );
  });

  it('returns an empty array for a real session with no declared student reports', async () => {
    const { read, query } = setup({ reports: [] });
    await expect(read()).resolves.toEqual([]);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('scopes report identities and enrollment details to non-deleted matching tenant records', async () => {
    const { read, query } = setup();
    await read();
    const [sql, params] = query.mock.calls[1];
    expect(params).toEqual(['tenant-1', 'session-1']);
    expect(sql).toContain(
      's.tenant_id=r.tenant_id AND s.course_id=r.course_id',
    );
    expect(sql).toContain('s.exam_type=r.exam_type AND s.deleted_at IS NULL');
    expect(sql).toContain('c.tenant_id=r.tenant_id AND c.deleted_at IS NULL');
    expect(sql).toContain('u.tenant_id=r.tenant_id AND u.deleted_at IS NULL');
    expect(sql).toContain(
      "sp.tenant_id=u.tenant_id AND (to_jsonb(sp)->>'deleted_at') IS NULL",
    );
    expect(sql).toContain("(to_jsonb(r)->>'deleted_at') IS NULL");
    expect(sql).toContain('r.tenant_id=$1 AND r.session_id=$2');
    const [canonicalSql, canonicalParams] = query.mock.calls[2];
    expect(canonicalParams).toEqual(['tenant-1', 'session-1', ['student-1']]);
    expect(canonicalSql).toContain(
      'er.tenant_id=$1 AND er.result_session_id=$2',
    );
    expect(canonicalSql).toContain('er.student_user_id=ANY($3::uuid[])');
    expect(canonicalSql).toContain(
      "er.status='PUBLISHED' AND er.deleted_at IS NULL",
    );
  });

  it('leaves a declared report unverified when there is no matching published result', async () => {
    const { read, query } = setup({ results: [] });
    const [row] = await read();
    expect(row).toMatchObject({
      ...report,
      result_id: null,
      canonical_marks_obtained: null,
      canonical_max_marks: null,
      verification_status: 'unverified',
    });
    expect(row.verification_message).toContain('No exact published result');
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('does not select a canonical result arbitrarily when exact-session mirrors are duplicated', async () => {
    const { read, query } = setup({
      results: [result, { ...result, result_id: 'result-2' }],
    });
    const [row] = await read();
    expect(row.result_id).toBeNull();
    expect(row.verification_status).toBe('unverified');
    expect(row.verification_message).toContain('Multiple published results');
    expect(query).toHaveBeenCalledTimes(3);
  });

  it.each([
    { tenant_id: 'other-tenant' },
    { student_user_id: 'other-student' },
    { result_session_id: 'other-session' },
    { course_id: 'other-course' },
    { exam_type: 'QUIZ' },
    { source_report_id: 'other-report' },
    { status: 'DRAFT' },
  ])(
    'never exposes canonical identifiers from a mismatched result: %j',
    async (mismatch) => {
      const { read, query } = setup({ results: [{ ...result, ...mismatch }] });
      const [row] = await read();
      expect(row.result_id).toBeNull();
      expect(row.source_mark_id).toBeNull();
      expect(row.source_report_id).toBeNull();
      expect(row.exam_session).toBeNull();
      expect(row.verification_status).toBe('unverified');
      expect(query).toHaveBeenCalledTimes(3);
    },
  );

  it.each([
    'SMOKE: End-term results declared for QA walkthrough.',
    'Demo result data',
    'Test fixture results',
  ])(
    'clearly labels QA declaration evidence without treating it as official: %s',
    async (note) => {
      const { read, query } = setup({
        sessions: [{ ...session, declaration_note: note }],
      });
      const [row] = await read();
      expect(row.declaration_note).toBe(note);
      expect(row.verification_status).toBe('qa');
      expect(row.verification_message).toContain('cannot verify an official');
      expect(row.marks_obtained).toBe('42');
      expect(query).toHaveBeenCalledTimes(3);
    },
  );

  it('does not mark an ordinary quality audit note as QA data', async () => {
    const { read } = setup({
      sessions: [{ ...session, declaration_note: 'QA audit completed' }],
    });
    expect((await read())[0].verification_status).toBe('verified');
  });

  it.each(['session', 'report'])(
    'requires declaration evidence on the %s',
    async (missing) => {
      const { read, query } = setup(
        missing === 'session'
          ? { sessions: [{ ...session, declared_at: null }] }
          : { reports: [{ ...report, declared_at: null }] },
      );
      const [row] = await read();
      expect(row.verification_status).toBe('unverified');
      expect(row.verification_message).toContain(
        'must have a recorded declaration',
      );
      expect(query).toHaveBeenCalledTimes(3);
    },
  );

  it.each([
    { marks_obtained: null },
    { marks_obtained: '-1' },
    { marks_obtained: '61' },
    { marks_obtained: 'invalid' },
    { max_marks: null },
    { max_marks: '0' },
  ])('does not verify invalid published marks: %j', async (invalid) => {
    const { read } = setup({ results: [{ ...result, ...invalid }] });
    const [row] = await read();
    expect(row.verification_status).toBe('unverified');
    expect(row.verification_message).toContain(
      'invalid original or maximum marks',
    );
    expect(row.marks_obtained).toBe('42');
    expect(row.max_marks).toBe('60');
  });

  it.each([
    { source_marks: '48' },
    { source_max: '100' },
    { report_marks: '48' },
    { session_max: '100' },
    { source_updated_at: '2026-10-09 10:00:00+00' },
    { report_declared_at: null },
    { report_grade: 'A' },
    { report_grade_points: '8' },
    { report_result_status: 'FAIL' },
  ])(
    'fails verification for changed or mismatched declaration sources: %j',
    async (mismatch) => {
      const { read } = setup({ sources: [{ ...source, ...mismatch }] });
      const [row] = await read();
      expect(row.verification_status).toBe('unverified');
      expect(row.verification_message).toContain('could not be verified');
      expect(row.marks_obtained).toBe('42');
    },
  );

  it.each([
    { marks_obtained: '48' },
    { max_marks: '100' },
    { grade: 'A' },
    { grade_points: '8' },
    { grade_points: null },
    { result_status: 'FAIL' },
  ])(
    'retains report values but flags disagreement with the canonical result: %j',
    async (mismatch) => {
      const existingReport = { ...report, ...mismatch };
      const { read } = setup({ reports: [existingReport] });
      const [row] = await read();
      expect(row).toMatchObject(existingReport);
      expect(row.verification_status).toBe('unverified');
      expect(row.verification_message).toContain('do not agree');
    },
  );

  it('does not verify missing grading snapshots or missing final-grade enrollment evidence', async () => {
    const missingPolicy = setup({
      results: [{ ...result, grading_policy_snapshot: null }],
    });
    expect((await missingPolicy.read())[0].verification_status).toBe(
      'unverified',
    );
    const missingEnrollment = setup({ enrollments: [] });
    expect((await missingEnrollment.read())[0].verification_status).toBe(
      'unverified',
    );
  });

  it('does not disguise a database outage as a successful verification response', async () => {
    const { read, query } = setup();
    query.mockImplementation(async (sql: string) => {
      if (/SELECT s.session_id/.test(sql)) return [session];
      if (/SELECT r\.\*/.test(sql)) return [report];
      if (/SELECT er.tenant_id/.test(sql)) return [result];
      throw new Error('Database unavailable');
    });
    await expect(read()).rejects.toThrow('Database unavailable');
  });
});
