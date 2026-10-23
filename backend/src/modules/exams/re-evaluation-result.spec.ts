import { reEvaluationResultMetadata, resolveReEvaluationResult, listReEvaluationResultCandidates } from './re-evaluation-result';

describe('Exact re-evaluation result resolution', () => {
  const resultId = '50000000-0000-4000-8000-000000000001';
  const otherId = '50000000-0000-4000-8000-000000000002';
  const input = { tenantId: 'tenant', studentUserId: 'student', subjectId: 1 };
  const row = { result_id: resultId, subject_id: 1, marks_obtained: '10', max_marks: '30', grade: 'F', grade_points: '0', exam_session: '2026-A', exam_type: 'END_TERM' };
  const query = jest.fn();
  const db = { query };
  beforeEach(() => { query.mockReset(); });

  it('uses an explicit exact source instead of another result with a larger maximum', async () => {
    query.mockResolvedValue([row, { ...row, result_id: otherId, max_marks: 100 }]);
    const result = await resolveReEvaluationResult(db, { ...input, examResultId: resultId });
    expect(result.status).toBe('linked');
    expect(result.result?.max_marks).toBe(30);
  });

  it('preserves an invalid explicit key and never turns it into a legacy fallback', async () => {
    query.mockResolvedValue([{ ...row, result_id: otherId }]);
    const invalid = await resolveReEvaluationResult(db, { ...input, examResultId: resultId });
    expect(invalid.status).toBe('invalid');
    const metadata = reEvaluationResultMetadata(invalid, resultId);
    expect(metadata.exam_result_id).toBe(resultId);
    expect((await resolveReEvaluationResult(db, { ...input, examResultId: metadata.exam_result_id })).status).toBe('invalid');
  });

  it('resolves legacy cases only when exactly one total matching row exists', async () => {
    query.mockResolvedValueOnce([row]);
    expect((await resolveReEvaluationResult(db, input)).status).toBe('resolved');
    query.mockResolvedValueOnce([row, { ...row, result_id: otherId, max_marks: null }]);
    expect((await resolveReEvaluationResult(db, input)).status).toBe('ambiguous');
  });

  it.each([
    { ...row, max_marks: null }, { ...row, max_marks: 0 },
    { ...row, marks_obtained: null }, { ...row, marks_obtained: 31 },
  ])('rejects invalid authoritative maximum or original marks', async invalid => {
    query.mockResolvedValue([invalid]);
    expect((await resolveReEvaluationResult(db, { ...input, examResultId: resultId })).status).toBe('invalid');
  });

  it('does not infer a result for creation when an explicit key is required', async () => {
    const result = await resolveReEvaluationResult(db, { ...input, allowLegacyResolution: false });
    expect(result.status).toBe('missing');
    expect(query).not.toHaveBeenCalled();
  });

  it('supports the scoped all-subject student candidate listing', async () => {
    query.mockResolvedValue([row]);
    await listReEvaluationResultCandidates(db, { tenantId: 'tenant', studentUserId: 'student' });
    expect(query.mock.calls[0][1]).toEqual(['tenant', 'student', null]);
    const sql = query.mock.calls[0][0];
    expect(sql).toContain("r.status = 'PUBLISHED'");
    expect(sql).toContain('r.tenant_id = $1 OR r.tenant_id IS NULL');
    expect(sql).toContain('r.subject_id IS NULL');
    expect(sql).toContain('c.tenant_id = $1');
    expect(sql).toContain('r.grade, r.grade_points');
  });
});
