import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';

export type ReEvaluationSource = {
  result_id: string;
  course_id: string | null;
  course_name: string;
  exam_type: string | null;
  semester: number;
  max_marks: string;
  marks_obtained: string;
  mark_id: string | null;
  session_id: string | null;
  pass_marks: string | null;
  grading_policy_id: number | null;
  subject_id?: number;
  subject_name?: string;
  subject_code?: string;
  published_at?: string;
  source_report_id?: string | null;
};

export type ReEvaluationSelection = {
  source_result_id?: string | null;
  source_session_id?: string | null;
  source_mark_id?: string | null;
};

type Executor = Pick<EntityManager, 'query'>;

function requireSupportedMaximum(
  source: ReEvaluationSource,
): ReEvaluationSource {
  if (
    !Number.isFinite(Number(source.max_marks)) ||
    Number(source.max_marks) <= 0
  ) {
    throw new BadRequestException(
      'The published result must have valid maximum marks before re-evaluation can be requested',
    );
  }
  return source;
}

async function publishedSources(
  manager: Executor,
  tenantId: string,
  studentUserId: string,
  subjectId: number | null,
  selection: ReEvaluationSelection,
  lock: boolean,
): Promise<ReEvaluationSource[]> {
  const params: unknown[] = [tenantId, studentUserId, subjectId];
  let selectedReport = '';
  let selectedLegacy = '';
  if (selection.source_result_id) {
    params.push(selection.source_result_id);
    selectedReport += ` AND ar.result_id = $${params.length}::uuid`;
    selectedLegacy += ` AND ar.result_id = $${params.length}::uuid`;
  }
  if (selection.source_session_id !== undefined && selection.source_result_id) {
    params.push(selection.source_session_id);
    selectedReport += ` AND s.session_id IS NOT DISTINCT FROM $${params.length}::uuid`;
    // Session-backed applications must never silently switch to a legacy row.
    selectedLegacy += ` AND $${params.length}::uuid IS NULL`;
  }
  if (selection.source_mark_id) {
    params.push(selection.source_mark_id);
    selectedReport += ` AND m.mark_id = $${params.length}::uuid`;
    selectedLegacy += ` AND $${params.length}::uuid IS NULL`;
  }
  const reports = await manager.query<ReEvaluationSource[]>(
    `SELECT ar.result_id, c.course_id, c.course_name, s.exam_type, s.semester,
            r.max_marks, r.marks_obtained, m.mark_id, s.session_id,
            s.pass_marks, s.grading_policy_id, sub.subject_id, sub.subject_name,
            sub.subject_code, ar.published_at, r.report_id AS source_report_id
     FROM academic_subjects sub
     JOIN academic_courses c ON c.course_code = sub.subject_code AND c.tenant_id = $1
     JOIN student_exam_reports r ON r.course_id = c.course_id AND r.tenant_id = $1 AND r.student_user_id = $2
     JOIN exam_result_sessions s ON s.session_id = r.session_id AND s.tenant_id = $1
       AND s.course_id = c.course_id AND s.declared_at IS NOT NULL AND s.semester = sub.semester
     JOIN academic_marks m ON m.tenant_id = $1 AND m.course_id = c.course_id
       AND m.student_user_id = $2 AND m.exam_type = s.exam_type AND m.status = 'PUBLISHED'
     JOIN academic_exam_results ar ON ar.tenant_id = $1 AND ar.student_user_id = $2
       AND ar.course_id = c.course_id AND ar.exam_type = s.exam_type AND ar.status = 'PUBLISHED'
     WHERE ($3::int IS NULL OR sub.subject_id = $3)
       AND EXISTS (SELECT 1 FROM student_course_enrollments e WHERE e.tenant_id = $1
         AND e.student_user_id = $2 AND e.course_id = c.course_id AND e.semester = sub.semester)
       ${selectedReport}
       ${lock ? '' : `AND NOT EXISTS (SELECT 1 FROM exam_backlog_attempts attempt WHERE attempt.tenant_id = $1 AND attempt.student_user_id = $2 AND attempt.source_report_id = r.report_id AND attempt.status <> 'REJECTED')`}
     ORDER BY sub.subject_code, s.exam_type, ar.result_id
     ${lock ? 'FOR UPDATE OF r, s, m, ar' : ''}`,
    params,
  );
  const legacy = await manager.query<ReEvaluationSource[]>(
    `SELECT ar.result_id, ar.course_id, sub.subject_name AS course_name,
            ar.exam_type, sub.semester, ar.max_marks, ar.marks_obtained,
            NULL::uuid AS mark_id, NULL::uuid AS session_id,
            NULL::numeric AS pass_marks, NULL::int AS grading_policy_id,
            sub.subject_id, sub.subject_name, sub.subject_code, ar.published_at
     FROM academic_exam_results ar JOIN academic_subjects sub ON sub.subject_id = ar.subject_id
     WHERE ar.tenant_id = $1 AND ar.student_user_id = $2
       AND ($3::int IS NULL OR ar.subject_id = $3) AND ar.status = 'PUBLISHED'
       AND EXISTS (SELECT 1 FROM student_course_enrollments e
         JOIN academic_courses c ON c.course_id = e.course_id AND c.tenant_id = $1
         WHERE e.tenant_id = $1 AND e.student_user_id = $2 AND e.semester = sub.semester
           AND c.course_code = sub.subject_code AND (ar.course_id IS NULL OR ar.course_id = c.course_id))
       AND NOT EXISTS (SELECT 1 FROM student_exam_reports r
         JOIN exam_result_sessions s ON s.session_id = r.session_id AND s.tenant_id = $1
         WHERE r.tenant_id = $1 AND r.student_user_id = $2 AND r.course_id = ar.course_id
           AND s.declared_at IS NOT NULL AND s.exam_type = ar.exam_type AND s.semester = sub.semester)
       ${selectedLegacy}
     ORDER BY sub.subject_code, ar.exam_type, ar.result_id
     ${lock ? 'FOR UPDATE OF ar' : ''}`,
    params,
  );
  return [...reports, ...legacy].filter(
    (source) =>
      (!selection.source_result_id ||
        source.result_id === selection.source_result_id) &&
      (!selection.source_result_id ||
        selection.source_session_id === undefined ||
        source.session_id === selection.source_session_id) &&
      (!selection.source_mark_id ||
        source.mark_id === selection.source_mark_id),
  );
}

/** Only published examinations owned by this student and enrolled subject are offered. */
export async function listReEvaluationSources(
  manager: Executor,
  tenantId: string,
  studentUserId: string,
) {
  const sources = await publishedSources(
    manager,
    tenantId,
    studentUserId,
    null,
    {},
    false,
  );
  return sources
    .filter(
      (source) =>
        Number.isFinite(Number(source.max_marks)) &&
        Number(source.max_marks) > 0,
    )
    .map((source) => ({
      result_id: source.result_id,
      session_id: source.session_id,
      subject_id: source.subject_id,
      subject_name: source.subject_name,
      subject_code: source.subject_code,
      course_id: source.course_id,
      exam_type: source.exam_type,
      semester: source.semester,
      marks_obtained: source.marks_obtained,
      max_marks: source.max_marks,
      published_at: source.published_at,
    }));
}

/** Resolve the same immutable choice at intake, assignment, reassessment and publication. */
export async function resolveReEvaluationSource(
  manager: Executor,
  tenantId: string,
  application: {
    student_user_id: string;
    subject_id: number;
  } & ReEvaluationSelection,
): Promise<ReEvaluationSource> {
  if (
    (application.source_session_id || application.source_mark_id) &&
    !application.source_result_id
  ) {
    throw new BadRequestException(
      'Select a published examination result before re-evaluation',
    );
  }
  const sources = await publishedSources(
    manager,
    tenantId,
    application.student_user_id,
    application.subject_id,
    application,
    true,
  );
  if (sources.length !== 1) {
    throw new BadRequestException(
      sources.length > 1
        ? 'Multiple published results exist for this subject; select the examination result for re-evaluation'
        : 'The selected published examination result is not available for this student and subject',
    );
  }
  if (sources[0].source_report_id) {
    const retakes = await manager.query<Array<{ attempt_id: string }>>(
      `SELECT attempt_id FROM exam_backlog_attempts WHERE tenant_id = $1
         AND student_user_id = $2 AND source_report_id = $3 AND status <> 'REJECTED' LIMIT 1`,
      [tenantId, application.student_user_id, sources[0].source_report_id],
    );
    if (retakes[0])
      throw new BadRequestException(
        'This examination already has a backlog or supplementary attempt; its original result cannot be reassessed',
      );
  }
  return requireSupportedMaximum(sources[0]);
}
