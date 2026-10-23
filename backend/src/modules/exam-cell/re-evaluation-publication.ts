import { ConflictException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { ReEvaluationResultCandidate } from '../exams/re-evaluation-result';
import { postgresQueryRows } from '../../common/postgres-query-rows';
import { isQaDeclarationNote } from '../exams/official-result-provenance';
import {
  computeGradeFromPercent,
  computePassFail,
  parseGradeBands,
} from './grading-engine';

export type ReEvaluationSourceTarget = Pick<
  ReEvaluationResultCandidate,
  | 'result_id'
  | 'course_id'
  | 'result_session_id'
  | 'source_mark_id'
  | 'source_report_id'
  | 'source_mark_updated_at'
  | 'grading_policy_snapshot'
  | 'pass_marks_snapshot'
  | 'marks_obtained'
  | 'max_marks'
  | 'exam_type'
  | 'grade'
  | 'grade_points'
>;

const reconcile = () =>
  new ConflictException(
    'The exact declared exam, source marks, report and grading policy must be verified by Exam Cell before requesting or publishing this reassessment.',
  );

/** Read-only eligibility verification; publication additionally locks these rows. */
export async function validateReEvaluationSources(
  db: Pick<DataSource, 'query'>,
  tenantId: string,
  studentId: string,
  target: ReEvaluationSourceTarget,
  revised: number,
  lock = false,
) {
  if (
    !target.result_session_id ||
    !target.source_mark_id ||
    !target.source_report_id ||
    !target.course_id ||
    !target.source_mark_updated_at
  )
    throw reconcile();
  const rows = await db.query(
    `SELECT s.semester, s.max_marks AS session_max, s.declaration_note,
            c.course_name, m.marks_obtained AS source_marks,
            m.max_marks AS source_max, m.updated_at::text AS source_updated_at,
            r.marks_obtained AS report_marks, r.max_marks AS report_max,
            r.declared_at AS report_declared_at, r.grade AS report_grade,
            r.grade_points AS report_grade_points,
            r.result_status AS report_result_status
     FROM exam_result_sessions s
     JOIN academic_courses c ON c.course_id=s.course_id AND c.tenant_id=$1 AND c.deleted_at IS NULL
     JOIN academic_marks m ON m.mark_id=$4 AND m.tenant_id=s.tenant_id
       AND m.student_user_id=$2 AND m.course_id=s.course_id AND m.exam_type=s.exam_type
       AND m.status='PUBLISHED' AND (to_jsonb(m)->>'deleted_at') IS NULL
     JOIN student_exam_reports r ON r.report_id=$5 AND r.session_id=s.session_id
       AND r.tenant_id=s.tenant_id AND r.student_user_id=$2
       AND r.course_id=s.course_id AND r.exam_type=s.exam_type
       AND r.result_status IN ('PASS','FAIL') AND r.declared_at IS NOT NULL
       AND (to_jsonb(r)->>'deleted_at') IS NULL
     WHERE s.session_id=$3 AND s.tenant_id=$1 AND s.course_id=$6 AND s.exam_type=$7
       AND s.declared_at IS NOT NULL AND s.deleted_at IS NULL
     ${lock ? 'FOR UPDATE OF s,m,r' : ''}`,
    [
      tenantId,
      studentId,
      target.result_session_id,
      target.source_mark_id,
      target.source_report_id,
      target.course_id,
      target.exam_type,
    ],
  );
  const source = rows[0];
  if (
    !source ||
    rows.length !== 1 ||
    isQaDeclarationNote(source.declaration_note) ||
    !source.report_declared_at ||
    source.source_marks == null ||
    source.report_marks == null ||
    Number(source.source_marks) !== target.marks_obtained ||
    Number(source.report_marks) !== target.marks_obtained ||
    Number(source.source_max) !== target.max_marks ||
    Number(source.report_max) !== target.max_marks ||
    Number(source.session_max) !== target.max_marks ||
    String(source.source_updated_at) !== String(target.source_mark_updated_at)
  )
    throw reconcile();

  // Use the declaration's exact rules/defaults snapshot, never today's policy
  // or guessed bands for an old result that has no historical snapshot.
  const rules = target.grading_policy_snapshot;
  const rawBands = rules?.bands ?? rules?.gradeBands ?? rules?.grades;
  if (
    !Array.isArray(rawBands) ||
    rawBands.length === 0 ||
    rawBands.some(
      (band: any) =>
        !band ||
        !Number.isFinite(Number(band.minPercent ?? band.min_percent)) ||
        !Number.isFinite(Number(band.maxPercent ?? band.max_percent)) ||
        !Number.isFinite(Number(band.gradePoints ?? band.grade_points)) ||
        typeof band.grade !== 'string' ||
        !band.grade.trim(),
    )
  )
    throw reconcile();
  const maximum = target.max_marks;
  const original = target.marks_obtained;
  if (
    maximum == null ||
    original == null ||
    !Number.isFinite(maximum) ||
    !Number.isFinite(original) ||
    maximum <= 0 ||
    original < 0 ||
    original > maximum ||
    !Number.isFinite(revised) ||
    revised < 0 ||
    revised > maximum
  )
    throw reconcile();
  const percent = Number(((revised / maximum) * 100).toFixed(2));
  const originalPercent = Number(((original / maximum) * 100).toFixed(2));
  const bands = parseGradeBands(rules);
  if (
    !bands.some(
      (band) => percent >= band.minPercent && percent <= band.maxPercent,
    ) ||
    !bands.some(
      (band) =>
        originalPercent >= band.minPercent && originalPercent <= band.maxPercent,
    )
  )
    throw reconcile();
  const passMarks =
    target.pass_marks_snapshot == null
      ? null
      : Number(target.pass_marks_snapshot);
  if (
    passMarks !== null &&
    (!Number.isFinite(passMarks) ||
      passMarks < 0 ||
      passMarks > maximum)
  )
    throw reconcile();

  // Verify the already declared grade against the original marks before
  // calculating any revised outcome. A matching numeric total is insufficient
  // when the canonical result and its historical report disagree.
  const originalGrade = computeGradeFromPercent(originalPercent, bands);
  const originalStatus = computePassFail(original, maximum, passMarks);
  if (
    target.grade !== originalGrade.grade ||
    target.grade_points == null ||
    (typeof target.grade_points === 'string' && !target.grade_points.trim()) ||
    Number(target.grade_points) !== originalGrade.gradePoints ||
    source.report_grade !== originalGrade.grade ||
    source.report_grade_points == null ||
    (typeof source.report_grade_points === 'string' &&
      !source.report_grade_points.trim()) ||
    Number(source.report_grade_points) !== originalGrade.gradePoints ||
    source.report_result_status !== originalStatus
  )
    throw reconcile();

  const { grade, gradePoints } = computeGradeFromPercent(percent, bands);
  const resultStatus = computePassFail(revised, maximum, passMarks);
  const changesFinalGrade = ['END_TERM', 'INTERNAL'].includes(
    target.exam_type ?? '',
  );
  if (changesFinalGrade) {
    const enrollment = await db.query(
      `SELECT enrollment_id FROM student_course_enrollments
       WHERE tenant_id=$1 AND student_user_id=$2 AND course_id=$3 AND semester=$4
         AND (to_jsonb(student_course_enrollments)->>'deleted_at') IS NULL ${lock ? 'FOR UPDATE' : ''}`,
      [tenantId, studentId, target.course_id, source.semester],
    );
    if (enrollment.length !== 1) throw reconcile();
  }
  return {
    source,
    percent,
    grade,
    gradePoints,
    resultStatus,
    changesFinalGrade,
  };
}

/** Caller holds the application/result locks. All writes use its transaction. */
export async function publishReEvaluationSources(
  db: Pick<DataSource, 'query'>,
  tenantId: string,
  studentId: string,
  target: ReEvaluationSourceTarget,
  revised: number,
) {
  const {
    source,
    percent,
    grade,
    gradePoints,
    resultStatus,
    changesFinalGrade,
  } = await validateReEvaluationSources(
    db,
    tenantId,
    studentId,
    target,
    revised,
    true,
  );
  const updatedMark = postgresQueryRows(
    await db.query(
      `UPDATE academic_marks SET marks_obtained=$2, updated_at=NOW()
     WHERE mark_id=$1 AND marks_obtained=$3 AND max_marks=$4 AND updated_at=$5 AND status='PUBLISHED'
     RETURNING updated_at::text`,
      [
        target.source_mark_id,
        revised,
        target.marks_obtained,
        target.max_marks,
        source.source_updated_at,
      ],
    ),
  );
  if (updatedMark.length !== 1) throw reconcile();
  const summary = `${source.course_name} ${target.exam_type}: ${revised}/${target.max_marks} (${percent}%) — Grade ${grade}`;
  const report = postgresQueryRows(
    await db.query(
      `UPDATE student_exam_reports
     SET marks_obtained=$2, percent=$3, grade=$4, grade_points=$5, result_status=$6, report_summary=$7
     WHERE report_id=$1 AND marks_obtained=$8 AND max_marks=$9 RETURNING report_id`,
      [
        target.source_report_id,
        revised,
        percent,
        grade,
        gradePoints,
        resultStatus,
        summary,
        target.marks_obtained,
        target.max_marks,
      ],
    ),
  );
  if (report.length !== 1) throw reconcile();
  if (changesFinalGrade) {
    const enrollment = postgresQueryRows(
      await db.query(
        `UPDATE student_course_enrollments SET grade=$5, grade_points=$6, status=$7
       WHERE tenant_id=$1 AND student_user_id=$2 AND course_id=$3 AND semester=$4
         AND (to_jsonb(student_course_enrollments)->>'deleted_at') IS NULL RETURNING enrollment_id`,
        [
          tenantId,
          studentId,
          target.course_id,
          source.semester,
          grade,
          gradePoints,
          resultStatus === 'PASS' ? 'COMPLETED' : 'FAILED',
        ],
      ),
    );
    if (enrollment.length !== 1) throw reconcile();
  }
  return { grade, gradePoints, sourceMarkUpdatedAt: updatedMark[0].updated_at };
}
