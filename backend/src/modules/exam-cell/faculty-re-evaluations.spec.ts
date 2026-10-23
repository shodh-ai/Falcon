import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ExamCellService } from './exam-cell.service';
import { FacultyReEvaluationsController } from './faculty-re-evaluations.controller';
import { SubmitReEvaluationReportDto } from './dto/re-evaluations.dto';

jest.mock('uuid', () => ({ v4: jest.fn() }));

describe('Faculty re-evaluation report safeguards', () => {
  const facultyId = '10000000-0000-4000-8000-000000000001';
  const tenantId = '20000000-0000-4000-8000-000000000001';
  const applicationId = '30000000-0000-4000-8000-000000000001';
  const studentId = '40000000-0000-4000-8000-000000000001';
  const resultId = '50000000-0000-4000-8000-000000000001';
  const courseId = '60000000-0000-4000-8000-000000000001';
  const sessionId = '70000000-0000-4000-8000-000000000001';
  const markId = '80000000-0000-4000-8000-000000000001';
  const reportId = '90000000-0000-4000-8000-000000000001';
  const sourceVersion = '2026-10-19 10:00:00+00';
  const publishedVersion = '2026-10-19 11:00:00+00';
  const policy = { bands: [
    { minPercent: 0, maxPercent: 49.99, grade: 'F', gradePoints: 0 },
    { minPercent: 50, maxPercent: 100, grade: 'A', gradePoints: 8 },
  ] };
  const query = jest.fn();
  const getReEvaluation = jest.fn();
  const examRevaluationReportReady = jest.fn();
  const examRevaluationPublished = jest.fn();
  const valid = { revised_marks: 0, report_notes: '  Reassessment completed  ' };
  let service: ExamCellService;
  let application: Record<string, unknown>;
  let results: Record<string, unknown>[];

  function mockLinkingQueries(sourceOverrides: Record<string, unknown> = {}) {
    query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.startsWith('SELECT r.result_id')) return results;
      if (sql.startsWith('SELECT result_id')) return [{ result_id: resultId }];
      if (sql.startsWith('SELECT s.semester')) return [{
        semester: 4, session_max: results[0].max_marks, course_name: 'Test Course',
        source_marks: results[0].marks_obtained, source_max: results[0].max_marks,
        source_updated_at: sourceVersion, report_marks: results[0].marks_obtained,
        report_max: results[0].max_marks, declaration_note: 'Official October examination',
        report_declared_at: sourceVersion, report_grade: 'F', report_grade_points: 0,
        report_result_status: 'FAIL',
        ...sourceOverrides,
      }];
      if (sql.startsWith('SELECT enrollment_id')) return [{ enrollment_id: 'enrollment-1' }];
      if (sql.startsWith('UPDATE exam_applications')) return [{ ...application, exam_result_id: params[1] }];
      return [];
    });
  }

  beforeEach(() => {
    jest.resetAllMocks();
    application = {
      exam_application_id: applicationId, student_user_id: studentId,
      assigned_faculty_user_id: facultyId, status: 'ASSIGNED',
      original_marks: 0, subject_name: 'Test Subject', report_submitted_at: null,
      subject_id: 1, exam_result_id: resultId,
    };
    results = [{
      result_id: resultId, subject_id: 1, max_marks: 200, marks_obtained: 0,
      exam_session: '2026', exam_type: 'END_TERM', course_id: courseId,
      result_session_id: sessionId, source_mark_id: markId, source_report_id: reportId,
      source_mark_updated_at: sourceVersion, grading_policy_snapshot: policy, pass_marks_snapshot: null,
      grade: 'F', grade_points: 0,
    }];
    getReEvaluation.mockImplementation(async () => ({ ...application }));
    query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.startsWith('SELECT tenant_id')) return [{ tenant_id: tenantId }];
      if (sql.startsWith('SELECT r.result_id')) return results;
      if (sql.startsWith('UPDATE exam_applications')) return [{
        ...application, status: 'UNDER_REVIEW', revised_marks: params[1], report_notes: params[2],
      }];
      return [];
    });
    service = Object.assign(Object.create(ExamCellService.prototype), {
      db: { query, transaction: (run: any) => run({ query }) }, getReEvaluation,
      notify: { examRevaluationReportReady, examRevaluationPublished },
    });
  });

  it.each(['', '0', null, undefined, Number.NaN, Number.POSITIVE_INFINITY, -1, 1.001, 10000])
    ('rejects invalid marks %p before reading or writing data', async marks => {
      await expect(service.submitReEvaluationReport(facultyId, applicationId, {
        ...valid, revised_marks: marks as number,
      }, tenantId)).rejects.toBeInstanceOf(BadRequestException);
      expect(query).not.toHaveBeenCalled();
      expect(examRevaluationReportReady).not.toHaveBeenCalled();
    });

  it.each(['', '   ', null, 42, 'x'.repeat(2001)])
    ('rejects missing, blank or oversized notes before writing', async notes => {
      await expect(service.submitReEvaluationReport(facultyId, applicationId, {
        ...valid, report_notes: notes as string,
      }, tenantId)).rejects.toBeInstanceOf(BadRequestException);
      expect(query).not.toHaveBeenCalled();
    });

  it('preserves genuine zero, trims notes and scopes the atomic update to the assigned faculty tenant', async () => {
    const result = await service.submitReEvaluationReport(facultyId, applicationId, valid, tenantId);
    expect(result.revised_marks).toBe(0);
    expect(result.original_marks).toBe(0);
    expect(result.report_notes).toBe('Reassessment completed');
    expect(getReEvaluation).toHaveBeenCalledWith(tenantId, applicationId, expect.objectContaining({ query }), true, false);
    const [sql, params] = query.mock.calls.find(([sql]) => sql.startsWith('UPDATE exam_applications'))!;
    expect(sql).toContain("a.status = 'ASSIGNED'");
    expect(sql).toContain('a.assigned_faculty_user_id = $4');
    expect(sql).toContain('student.tenant_id = $5');
    expect(sql).toContain('a.report_submitted_at IS NULL');
    expect(sql).toContain('RETURNING a.*');
    expect(params).toEqual([applicationId, 0, 'Reassessment completed', facultyId, tenantId, resultId, 0]);
    expect(examRevaluationReportReady).toHaveBeenCalledWith(expect.objectContaining({
      tenantId, userId: studentId, revisedMarks: 0, reportNotes: 'Reassessment completed',
    }));
  });

  it('uses the linked maximum rather than inventing a maximum of 100', async () => {
    const result = await service.submitReEvaluationReport(facultyId, applicationId, {
      ...valid, revised_marks: 150.25,
    }, tenantId);
    expect(result.revised_marks).toBe(150.25);
  });

  it.each([{ rows: [] }, { rows: [{ tenant_id: null }] }])('fails closed when the faculty tenant is unavailable', async ({ rows }) => {
    query.mockResolvedValueOnce(rows);
    await expect(service.submitReEvaluationReport(facultyId, applicationId, valid, tenantId))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(getReEvaluation).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('rejects a tenant mismatch before reading an application', async () => {
    await expect(service.submitReEvaluationReport(facultyId, applicationId, valid, 'another-tenant'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(getReEvaluation).not.toHaveBeenCalled();
  });

  it('rejects a report from faculty other than the assigned reviewer', async () => {
    application.assigned_faculty_user_id = 'another-faculty';
    await expect(service.submitReEvaluationReport(facultyId, applicationId, valid, tenantId))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it.each(['PENDING', 'UNDER_REVIEW', 'COMPLETED'])('rejects reports for %s applications', async status => {
    application.status = status;
    await expect(service.submitReEvaluationReport(facultyId, applicationId, valid, tenantId))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('allows only one concurrent report and emits one notification', async () => {
    let submitted = false;
    query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.startsWith('SELECT tenant_id')) return [{ tenant_id: tenantId }];
      if (sql.startsWith('SELECT r.result_id')) return results;
      if (sql.startsWith('SELECT result_id')) return [{ result_id: resultId }];
      if (submitted) return [];
      submitted = true;
      return [{ ...application, status: 'UNDER_REVIEW', revised_marks: params[1], report_notes: params[2] }];
    });
    const settled = await Promise.allSettled([
      service.submitReEvaluationReport(facultyId, applicationId, valid, tenantId),
      service.submitReEvaluationReport(facultyId, applicationId, valid, tenantId),
    ]);
    expect(settled.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = settled.find(result => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ConflictException);
    expect(examRevaluationReportReady).toHaveBeenCalledTimes(1);
  });

  it('rejects 31 for the linked 30-mark exam even when another exam has a 100-mark maximum', async () => {
    results = [
      { ...results[0], max_marks: 30 },
      { ...results[0], result_id: '50000000-0000-4000-8000-000000000002', max_marks: 100 },
    ];
    await expect(service.submitReEvaluationReport(facultyId, applicationId, { ...valid, revised_marks: 31 }, tenantId))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
  });

  it.each([0, 30])('accepts %s within the linked 30-mark exam', async marks => {
    results[0].max_marks = 30;
    const result = await service.submitReEvaluationReport(facultyId, applicationId, { ...valid, revised_marks: marks }, tenantId);
    expect(result.revised_marks).toBe(marks);
    expect(result.exam_max_marks).toBe(30);
  });

  it('fails closed for an ambiguous legacy application without updating anything', async () => {
    application.exam_result_id = null;
    results.push({ ...results[0], result_id: '50000000-0000-4000-8000-000000000002' });
    await expect(service.submitReEvaluationReport(facultyId, applicationId, valid, tenantId))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
  });

  it('publishes only the exact linked result and leaves other exams unchanged', async () => {
    Object.assign(application, { status: 'UNDER_REVIEW', original_marks: 10, revised_marks: 25 });
    results = [{ ...results[0], marks_obtained: 10, max_marks: 30 },
      { ...results[0], result_id: '50000000-0000-4000-8000-000000000002', marks_obtained: 80, max_marks: 100 }];
    query.mockImplementation(async (sql: string, params: any[]) => {
      if (sql.startsWith('SELECT r.result_id')) return results;
      if (sql.startsWith('SELECT result_id')) return [{ result_id: resultId }];
      if (sql.startsWith('SELECT s.semester')) return [{
        semester: 4, session_max: 30, course_name: 'Test Course',
        source_marks: 10, source_max: 30, source_updated_at: sourceVersion,
        report_marks: 10, report_max: 30,
        report_declared_at: sourceVersion, report_grade: 'F', report_grade_points: 0,
        report_result_status: 'FAIL',
      }];
      if (sql.startsWith('SELECT enrollment_id')) return [{ enrollment_id: 'enrollment-1' }];
      if (sql.startsWith('UPDATE academic_marks')) return [[{ updated_at: publishedVersion }], 1];
      if (sql.startsWith('UPDATE student_exam_reports')) return [[{ report_id: reportId }], 1];
      if (sql.startsWith('UPDATE student_course_enrollments')) return [[{ enrollment_id: 'enrollment-1' }], 1];
      if (sql.startsWith('UPDATE academic_exam_results')) {
        const selected = results.find(row => row.result_id === params[0])!;
        selected.marks_obtained = params[1];
        return [[{ result_id: params[0] }], 1];
      }
      if (sql.startsWith('UPDATE exam_applications')) return [[{ ...application, status: 'COMPLETED', exam_result_id: params[2] }], 1];
      return [];
    });
    const result = await service.publishReEvaluation(tenantId, facultyId, applicationId);
    expect(result.status).toBe('COMPLETED');
    expect(results[0].marks_obtained).toBe(25);
    expect(results[1].marks_obtained).toBe(80);
    const [sql, params] = query.mock.calls.find(([sql]) => sql.startsWith('UPDATE academic_exam_results'))!;
    expect(sql).toContain('WHERE result_id = $1 AND student_user_id = $3');
    expect(params).toEqual([resultId, 25, studentId, tenantId, 10, 30, 'A', 8, publishedVersion]);
    const sourceWrite = query.mock.calls.find(([sql]) => sql.startsWith('UPDATE academic_marks'))!;
    expect(sourceWrite[1]).toEqual([markId, 25, 10, 30, sourceVersion]);
    const reportWrite = query.mock.calls.find(([sql]) => sql.startsWith('UPDATE student_exam_reports'))!;
    expect(reportWrite[1]).toEqual([reportId, 25, 83.33, 'A', 8, 'PASS',
      'Test Course END_TERM: 25/30 (83.33%) — Grade A', 10, 30]);
    const enrollmentWrite = query.mock.calls.find(([sql]) => sql.startsWith('UPDATE student_course_enrollments'))!;
    expect(enrollmentWrite[1]).toEqual([tenantId, studentId, courseId, 4, 'A', 8, 'COMPLETED']);
    expect(examRevaluationPublished).toHaveBeenCalledTimes(1);
  });

  it.each(['result_session_id', 'source_mark_id', 'source_report_id', 'course_id', 'source_mark_updated_at'])(
    'does not publish a canonical result missing exact declared provenance %s', async field => {
      Object.assign(application, { status: 'UNDER_REVIEW', original_marks: 0, revised_marks: 25 });
      results[0][field] = null;
      await expect(service.publishReEvaluation(tenantId, facultyId, applicationId)).rejects.toBeInstanceOf(ConflictException);
      expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
      expect(examRevaluationPublished).not.toHaveBeenCalled();
    },
  );

  it('does not publish when an exact source declaration, published mark or report cannot be read', async () => {
    Object.assign(application, { status: 'UNDER_REVIEW', original_marks: 0, revised_marks: 25 });
    await expect(service.publishReEvaluation(tenantId, facultyId, applicationId)).rejects.toBeInstanceOf(ConflictException);
    expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
    expect(examRevaluationPublished).not.toHaveBeenCalled();
  });

  it('does not overwrite a source result that changed since reassessment', async () => {
    Object.assign(application, { status: 'UNDER_REVIEW', original_marks: 10, revised_marks: 25 });
    Object.assign(results[0], { marks_obtained: 12, max_marks: 30 });
    await expect(service.publishReEvaluation(tenantId, facultyId, applicationId))
      .rejects.toBeInstanceOf(ConflictException);
    expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
    expect(examRevaluationPublished).not.toHaveBeenCalled();
  });

  it('revalidates a reduced maximum before publishing', async () => {
    Object.assign(application, { status: 'UNDER_REVIEW', original_marks: 0, revised_marks: 25 });
    results[0].max_marks = 20;
    await expect(service.publishReEvaluation(tenantId, facultyId, applicationId))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
  });

  it('does not retarget an already linked submitted report', async () => {
    application.status = 'UNDER_REVIEW';
    await expect(service.linkReEvaluationExamResult(tenantId, facultyId, applicationId,
      '50000000-0000-4000-8000-000000000002')).rejects.toBeInstanceOf(ConflictException);
    expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
  });

  it('does not move an assigned case to a different exam result', async () => {
    await expect(service.linkReEvaluationExamResult(tenantId, facultyId, applicationId,
      '50000000-0000-4000-8000-000000000002')).rejects.toBeInstanceOf(ConflictException);
    expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
  });

  it('allows an assigned case to retain its exact result link', async () => {
    mockLinkingQueries();
    const linked = await service.linkReEvaluationExamResult(tenantId, facultyId, applicationId, resultId);
    expect(linked.exam_result_id).toBe(resultId);
    expect(linked.exam_link_status).toBe('linked');
  });

  it('does not reject a case that was concurrently completed or archived', async () => {
    application.status = 'UNDER_REVIEW';
    query.mockResolvedValueOnce([]);
    await expect(service.rejectReEvaluation(tenantId, facultyId, applicationId, 'Declined'))
      .rejects.toBeInstanceOf(ConflictException);
    const [sql] = query.mock.calls[0];
    expect(sql).toContain("status IN ('PENDING', 'ASSIGNED', 'UNDER_REVIEW')");
    expect(sql).toContain('deleted_at IS NULL');
    expect(sql).toContain('RETURNING *');
    expect(examRevaluationPublished).not.toHaveBeenCalled();
  });

  it('does not repair a submitted legacy report whose original snapshot does not match', async () => {
    Object.assign(application, { status: 'UNDER_REVIEW', exam_result_id: null, original_marks: 10, revised_marks: 25 });
    results[0].marks_obtained = 12;
    await expect(service.linkReEvaluationExamResult(tenantId, facultyId, applicationId, resultId))
      .rejects.toBeInstanceOf(ConflictException);
    expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
  });

  it.each(['PENDING', 'ASSIGNED', 'UNDER_REVIEW'])(
    'repairs only the result reference for a verified %s request without altering saved marks or reports', async status => {
      Object.assign(application, {
        status, exam_result_id: null, original_marks: '0.00', revised_marks: '150.25',
        report_notes: 'Existing reassessment report', report_submitted_at: '2026-10-20T10:00:00Z',
        grade: 'A', max_marks: '200.00',
      });
      const before = { ...application };
      mockLinkingQueries();
      const linked = await service.linkReEvaluationExamResult(tenantId, facultyId, applicationId, resultId);
      expect(linked).toMatchObject({ ...before, exam_result_id: resultId });
      expect(application).toEqual(before);
      const writes = query.mock.calls.filter(([sql]) => /^(UPDATE|INSERT|DELETE)/.test(sql));
      expect(writes).toHaveLength(1);
      expect(writes[0][0].match(/SET[\s\S]*?FROM/)[0].replace(/\s+/g, ' ')).toBe('SET exam_result_id = $2 FROM');
      expect(writes[0][0]).toContain('a.exam_result_id IS NOT DISTINCT FROM $4::uuid');
      expect(writes[0][0]).toContain('a.original_marks IS NOT DISTINCT FROM $5::numeric');
      expect(writes[0][0]).toContain('a.revised_marks IS NOT DISTINCT FROM $6::numeric');
      expect(writes[0][0]).toContain('student.tenant_id = $7');
      expect(writes[0][1]).toEqual([applicationId, resultId, status, null, '0.00', '150.25', tenantId]);
      expect(query.mock.calls.find(([sql]) => sql.startsWith('SELECT s.semester'))![0]).toContain('FOR UPDATE OF s,m,r');
      expect(getReEvaluation).toHaveBeenCalledWith(tenantId, applicationId, expect.objectContaining({ query }), true, false);
      expect(examRevaluationReportReady).not.toHaveBeenCalled();
      expect(examRevaluationPublished).not.toHaveBeenCalled();
    },
  );

  it.each(['PENDING', 'ASSIGNED', 'UNDER_REVIEW'])(
    'refuses to replace 42 with 48 while linking a %s request', async status => {
      Object.assign(application, { status, exam_result_id: null, original_marks: 42, revised_marks: 46 });
      results[0].marks_obtained = 48;
      mockLinkingQueries();
      await expect(service.linkReEvaluationExamResult(tenantId, facultyId, applicationId, resultId))
        .rejects.toThrow('Linking cannot change marks');
      expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
      expect(application.original_marks).toBe(42);
      expect(application.revised_marks).toBe(46);
    },
  );

  it.each([null, undefined, '', 'not-numeric', Number.NaN, Number.POSITIVE_INFINITY, false])(
    'refuses missing or nonnumeric original marks %p instead of filling them from the result', async original => {
      Object.assign(application, { exam_result_id: null, original_marks: original });
      mockLinkingQueries();
      await expect(service.linkReEvaluationExamResult(tenantId, facultyId, applicationId, resultId))
        .rejects.toBeInstanceOf(ConflictException);
      expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
    },
  );

  it.each([-1, 201, 1.001, '0.001', '', Number.NaN, Number.POSITIVE_INFINITY, false])(
    'refuses invalid saved revised marks %p without changing them', async revised => {
      Object.assign(application, { exam_result_id: null, revised_marks: revised });
      mockLinkingQueries();
      await expect(service.linkReEvaluationExamResult(tenantId, facultyId, applicationId, resultId))
        .rejects.toThrow('Linking cannot change the report or marks');
      expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
    },
  );

  it('requires the saved revised marks on an under-review request', async () => {
    Object.assign(application, { status: 'UNDER_REVIEW', exam_result_id: null, revised_marks: null });
    mockLinkingQueries();
    await expect(service.linkReEvaluationExamResult(tenantId, facultyId, applicationId, resultId))
      .rejects.toThrow('has no revised marks');
    expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
  });

  it.each(['result_session_id', 'source_mark_id', 'source_report_id', 'source_mark_updated_at', 'grading_policy_snapshot'])(
    'does not link a published-looking result missing official provenance %s', async field => {
      results[0][field] = null;
      mockLinkingQueries();
      await expect(service.linkReEvaluationExamResult(tenantId, facultyId, applicationId, resultId))
        .rejects.toBeInstanceOf(ConflictException);
      expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
    },
  );

  it('rejects an explicitly QA-labelled declaration even when its numeric marks match', async () => {
    mockLinkingQueries({ declaration_note: 'SMOKE: End-term results declared for QA walkthrough.' });
    await expect(service.linkReEvaluationExamResult(tenantId, facultyId, applicationId, resultId))
      .rejects.toBeInstanceOf(ConflictException);
    expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
  });

  it.each([null, undefined, ''])(
    'refuses an undeclared student report (%p) even if its marks match', async reportDeclaredAt => {
      mockLinkingQueries({ report_declared_at: reportDeclaredAt });
      await expect(service.linkReEvaluationExamResult(tenantId, facultyId, applicationId, resultId))
        .rejects.toBeInstanceOf(ConflictException);
      const sourceRead = query.mock.calls.find(([sql]) => sql.startsWith('SELECT s.semester'))!;
      expect(sourceRead[0]).toContain('r.declared_at IS NOT NULL');
      expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
    },
  );

  it.each([{ grade: 'A' }, { grade: null }, { grade_points: 8 }, { grade_points: null }, { grade_points: '' }])(
    'refuses canonical grade evidence inconsistent with original marks: %p', async canonical => {
      Object.assign(results[0], canonical);
      mockLinkingQueries();
      await expect(service.linkReEvaluationExamResult(tenantId, facultyId, applicationId, resultId))
        .rejects.toBeInstanceOf(ConflictException);
      expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
    },
  );

  it.each([
    { report_grade: 'A' }, { report_grade: null }, { report_grade_points: 8 },
    { report_grade_points: null }, { report_grade_points: '' },
    { report_result_status: 'PASS' }, { report_result_status: null },
  ])('refuses declared report grade or status inconsistent with original marks: %p', async source => {
    mockLinkingQueries(source);
    await expect(service.linkReEvaluationExamResult(tenantId, facultyId, applicationId, resultId))
      .rejects.toBeInstanceOf(ConflictException);
    expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
  });

  it.each([{ source_marks: null }, { report_marks: null }, { source_marks: 1 }, { report_marks: 1 }, { session_max: 100 }, { source_updated_at: publishedVersion }])(
    'rejects a stale or inconsistent declared source %p', async source => {
      mockLinkingQueries(source);
      await expect(service.linkReEvaluationExamResult(tenantId, facultyId, applicationId, resultId))
        .rejects.toBeInstanceOf(ConflictException);
      expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
    },
  );

  it('fails when the guarded application update no longer matches', async () => {
    mockLinkingQueries();
    const originalImplementation = query.getMockImplementation()!;
    query.mockImplementation(async (sql: string, params: unknown[]) => sql.startsWith('UPDATE exam_applications')
      ? [] : originalImplementation(sql, params));
    await expect(service.linkReEvaluationExamResult(tenantId, facultyId, applicationId, resultId))
      .rejects.toThrow('This application changed');
    expect(examRevaluationPublished).not.toHaveBeenCalled();
  });

  it('labels verified candidates separately from numeric validity without writing or auto-linking', async () => {
    Object.assign(application, { exam_result_id: null });
    mockLinkingQueries();
    const listed = await service.listReEvaluationExamResults(tenantId, applicationId);
    expect(listed[0]).toMatchObject({ is_valid: true, link_verified: true, link_validation_message: null });
    expect(application.exam_result_id).toBeNull();
    expect(query.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
    expect(query.mock.calls.some(([sql]) => sql.includes('FOR UPDATE'))).toBe(false);
  });

  it('keeps QA results readable but does not mark them as safe link targets', async () => {
    mockLinkingQueries({ declaration_note: 'Results for QA walkthrough' });
    const listed = await service.listReEvaluationExamResults(tenantId, applicationId);
    expect(listed[0]).toMatchObject({ is_valid: true, link_verified: false });
    expect(listed[0].link_validation_message).toContain('must be verified');
    expect(query.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
  });

  it('does not advertise a numeric match for another exam link as a verified candidate', async () => {
    results[0].result_id = '50000000-0000-4000-8000-000000000002';
    mockLinkingQueries();
    const listed = await service.listReEvaluationExamResults(tenantId, applicationId);
    expect(listed[0]).toMatchObject({ is_valid: true, link_verified: false });
    expect(listed[0].link_validation_message).toContain('cannot be moved');
  });

  it('propagates an operational source lookup error instead of calling it an invalid official result', async () => {
    mockLinkingQueries();
    const originalImplementation = query.getMockImplementation()!;
    query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.startsWith('SELECT s.semester')) throw new Error('Database unavailable');
      return originalImplementation(sql, params);
    });
    await expect(service.listReEvaluationExamResults(tenantId, applicationId)).rejects.toThrow('Database unavailable');
  });

  it('lists only assigned cases belonging to the verified faculty tenant', async () => {
    await service.listFacultyReEvaluations(facultyId, tenantId);
    const [sql, params] = query.mock.calls[1];
    expect(sql).toContain('a.assigned_faculty_user_id = $1');
    expect(sql).toContain('u.tenant_id = $2');
    expect(sql).toContain('a.deleted_at IS NULL');
    expect(sql).toContain('sub.deleted_at IS NULL');
    expect(params).toEqual([facultyId, tenantId]);
  });
});

describe('Re-evaluation HTTP validation and tenant forwarding', () => {
  it('trims notes and rejects whitespace or excessive numeric precision in the DTO', async () => {
    const valid = plainToInstance(SubmitReEvaluationReportDto, { revised_marks: 0, report_notes: '  Rechecked  ' });
    expect(valid.report_notes).toBe('Rechecked');
    await expect(validate(valid)).resolves.toHaveLength(0);
    const blank = plainToInstance(SubmitReEvaluationReportDto, { revised_marks: 0, report_notes: '   ' });
    expect((await validate(blank)).some(error => error.property === 'report_notes')).toBe(true);
    const precision = plainToInstance(SubmitReEvaluationReportDto, { revised_marks: 0.001, report_notes: 'Rechecked' });
    expect((await validate(precision)).some(error => error.property === 'revised_marks')).toBe(true);
  });

  it('forwards the authenticated tenant to list and submit service methods', () => {
    const api = { listFacultyReEvaluations: jest.fn(), submitReEvaluationReport: jest.fn() };
    const controller = new FacultyReEvaluationsController(api as never);
    const req = { user: { user_id: 'faculty', tenant_id: 'tenant' } };
    const dto = { revised_marks: 0, report_notes: 'Rechecked' };
    controller.list(req);
    controller.submitReport(req, 'application', dto);
    expect(api.listFacultyReEvaluations).toHaveBeenCalledWith('faculty', 'tenant');
    expect(api.submitReEvaluationReport).toHaveBeenCalledWith('faculty', 'application', dto, 'tenant');
  });
});
