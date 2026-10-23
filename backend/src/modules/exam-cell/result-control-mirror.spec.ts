import { BadRequestException } from '@nestjs/common';
import { ResultControlService } from './result-control.service';

describe('ResultControlService exact declared result mirror', () => {
  const policy = { bands: [{ minPercent: 0, maxPercent: 100, grade: 'B', gradePoints: 7 }] };
  const input = {
    tenantId: 'tenant-1', studentUserId: 'student-1', courseId: 'course-1', examType: 'END_TERM',
    semester: 4, sessionId: 'session-1', markId: 'mark-1', reportId: 'report-1',
    markUpdatedAt: '2026-10-19 12:00:00+00', obtained: 42, maximum: 60,
    grade: 'B', gradePoints: 7, policy, passMarks: 24,
  };
  type MirrorMethod = (manager: { query: jest.Mock }, values: typeof input) => Promise<void>;
  const values = (source = input) => [source.tenantId, source.studentUserId, source.courseId, source.examType,
    source.obtained, source.maximum, source.grade, source.gradePoints, source.sessionId,
    source.markId, source.reportId, source.markUpdatedAt, JSON.stringify(source.policy), source.passMarks,
    `Semester ${source.semester}`];

  function setup(existing: Array<{ result_id: string }> = []) {
    const query = jest.fn().mockImplementation(async (sql: string) => {
      if (/SELECT result_id/.test(sql)) return existing;
      if (/UPDATE academic_exam_results/.test(sql)) return [[{ result_id: existing[0]?.result_id }], 1];
      return [];
    });
    const db = { query: jest.fn(), transaction: jest.fn() };
    const service = new ResultControlService(db as never, {} as never, {} as never);
    const mirror = (source = input) => (
      service as unknown as { upsertExamResult: MirrorMethod }
    ).upsertExamResult({ query }, source);
    return { query, db, mirror };
  }

  it('preserves the exact-session result ID and stores source mark, report and grading snapshots', async () => {
    const { query, db, mirror } = setup([{ result_id: 'linked-result-1' }]);
    await mirror();
    const update = query.mock.calls.find(([sql]) => /UPDATE academic_exam_results/.test(sql))!;
    expect(update[0]).toMatch(/WHERE result_id\s*=\s*\$16/);
    expect(update[0]).toMatch(/tenant_id\s*=\s*\$1/);
    expect(update[0]).toMatch(/student_user_id\s*=\s*\$2/);
    expect(update[0]).toMatch(/course_id\s*=\s*\$3/);
    expect(update[0]).toMatch(/exam_type\s*=\s*\$4/);
    expect(update[0]).toMatch(/result_session_id\s*=\s*\$9/);
    expect(update[0]).toContain('source_mark_id=$10,source_report_id=$11,source_mark_updated_at=$12');
    expect(update[0]).toContain('grading_policy_snapshot=$13::jsonb,pass_marks_snapshot=$14');
    expect(update[1]).toEqual([...values(), 'linked-result-1']);
    expect(query.mock.calls.some(([sql]) => /DELETE|INSERT INTO academic_exam_results/.test(sql))).toBe(false);
    expect(db.query).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('creates a result carrying authoritative declaration provenance when this exact session has none', async () => {
    const { query, mirror } = setup();
    await mirror();
    const insert = query.mock.calls.find(([sql]) => /INSERT INTO academic_exam_results/.test(sql))!;
    expect(insert[1]).toEqual(values());
    expect(insert[0]).toContain('result_session_id,source_mark_id,source_report_id,source_mark_updated_at');
    expect(insert[0]).toContain('grading_policy_snapshot,pass_marks_snapshot,exam_session,status');
    expect(query.mock.calls.some(([sql]) => /DELETE|UPDATE academic_exam_results/.test(sql))).toBe(false);
  });

  it('takes a session-scoped lock on the caller transaction before reading canonical results', async () => {
    const { query, mirror } = setup();
    await mirror();
    expect(query.mock.calls[0][0]).toContain('pg_advisory_xact_lock');
    expect(query.mock.calls[0][1]).toEqual(['exam-result-session:tenant-1:student-1:session-1']);
    expect(query.mock.calls[1][0]).toMatch(/SELECT result_id[\s\S]*FOR UPDATE/);
    expect(query.mock.calls[1][1]).toEqual(['tenant-1', 'student-1', 'session-1']);
    expect(query.mock.calls[1][0]).toContain('result_session_id=$3');
    expect(query.mock.calls[1][0]).toContain('deleted_at IS NULL');
    expect(query.mock.calls[1][0]).not.toMatch(/LIMIT\s+1/i);
  });

  it('rejects ambiguous rows for the same exact session so the caller can roll back declaration', async () => {
    const { query, mirror } = setup([{ result_id: 'result-1' }, { result_id: 'result-2' }]);
    await expect(mirror()).rejects.toBeInstanceOf(BadRequestException);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls.some(([sql]) => /DELETE|UPDATE academic_exam_results|INSERT INTO academic_exam_results/.test(sql))).toBe(false);
  });

  it('fails closed when a guarded existing-result update affects no rows', async () => {
    const { query, mirror } = setup([{ result_id: 'result-1' }]);
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ result_id: 'result-1' }]).mockResolvedValueOnce([[], 0]);
    await expect(mirror()).rejects.toBeInstanceOf(BadRequestException);
  });

  it('retains the same result ID for subsequent declarations of the same exact session', async () => {
    const { query, mirror } = setup();
    let resultId: string | null = null;
    query.mockImplementation(async (sql: string) => {
      if (/SELECT result_id/.test(sql)) return resultId ? [{ result_id: resultId }] : [];
      if (/INSERT INTO academic_exam_results/.test(sql)) resultId = 'stable-result-1';
      if (/UPDATE academic_exam_results/.test(sql)) return [[{ result_id: resultId }], 1];
      return [];
    });
    await mirror();
    const next = { ...input, obtained: 45, grade: 'A', gradePoints: 8, markUpdatedAt: '2026-10-20 12:00:00+00' };
    await mirror(next);
    expect(query.mock.calls.filter(([sql]) => /INSERT INTO academic_exam_results/.test(sql))).toHaveLength(1);
    const updates = query.mock.calls.filter(([sql]) => /UPDATE academic_exam_results/.test(sql));
    expect(updates).toHaveLength(1);
    expect(updates[0][1]).toEqual([...values(next), 'stable-result-1']);
    expect(resultId).toBe('stable-result-1');
  });

  it('keeps different attempts of the same student, course and exam type as separate session results', async () => {
    const { query, mirror } = setup();
    const results = new Map<string, string>();
    query.mockImplementation(async (sql: string, params: any[]) => {
      if (/SELECT result_id/.test(sql)) return results.has(params[2]) ? [{ result_id: results.get(params[2]) }] : [];
      if (/INSERT INTO academic_exam_results/.test(sql)) results.set(params[8], `result-${results.size + 1}`);
      return [];
    });
    await mirror();
    await mirror({ ...input, sessionId: 'session-2', markId: 'mark-2', reportId: 'report-2' });
    expect([...results.keys()]).toEqual(['session-1', 'session-2']);
    expect(query.mock.calls.filter(([sql]) => /INSERT INTO academic_exam_results/.test(sql))).toHaveLength(2);
    expect(query.mock.calls.some(([sql]) => /DELETE|UPDATE academic_exam_results/.test(sql))).toBe(false);
  });

  it('propagates canonical save errors to the declaration transaction instead of publishing an unlinked report', async () => {
    const { query, mirror } = setup();
    query.mockRejectedValue(new Error('Result provenance column unavailable'));
    await expect(mirror()).rejects.toThrow('Result provenance column unavailable');
  });
});
