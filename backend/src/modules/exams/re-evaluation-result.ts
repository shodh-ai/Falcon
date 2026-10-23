import { isUUID } from 'class-validator';

type Queryable = { query: (sql: string, params?: any[]) => Promise<any> };

export type ReEvaluationResultInput = {
  tenantId: string;
  studentUserId: string;
  subjectId: number;
  examResultId?: string | null;
  allowLegacyResolution?: boolean;
};

export type ReEvaluationResultCandidate = {
  result_id: string;
  course_id?: string | null;
  result_session_id?: string | null;
  source_mark_id?: string | null;
  source_report_id?: string | null;
  source_mark_updated_at?: Date | string | null;
  grading_policy_snapshot?: Record<string, any> | null;
  pass_marks_snapshot?: number | string | null;
  subject_id: number;
  subject_code: string;
  subject_name: string;
  exam_session: string | null;
  exam_type: string | null;
  marks_obtained: number | null;
  max_marks: number | null;
  grade: string | null;
  grade_points: number | string | null;
  is_valid: boolean;
  validation_message: string | null;
  can_apply_for_re_evaluation: boolean;
  re_evaluation_eligibility_message: string | null;
};

export type ReEvaluationResultResolution = {
  status: 'linked' | 'resolved' | 'missing' | 'ambiguous' | 'invalid';
  result: ReEvaluationResultCandidate | null;
  message: string | null;
};

export async function listReEvaluationResultCandidates(
  db: Queryable,
  input: Omit<ReEvaluationResultInput, 'subjectId'> & { subjectId?: number },
): Promise<ReEvaluationResultCandidate[]> {
  const rows = await db.query(
    `SELECT r.result_id, r.course_id, r.result_session_id, r.source_mark_id,
            r.source_report_id, r.source_mark_updated_at::text,
            r.grading_policy_snapshot, r.pass_marks_snapshot,
            sub.subject_id, sub.subject_code, sub.subject_name,
            r.exam_session, r.exam_type, r.marks_obtained, r.max_marks,
            r.grade, r.grade_points
     FROM academic_exam_results r
     JOIN users student ON student.user_id = r.student_user_id
     JOIN academic_subjects sub ON ($3::int IS NULL OR sub.subject_id = $3) AND sub.deleted_at IS NULL
     LEFT JOIN academic_courses c ON c.course_id = r.course_id
       AND c.tenant_id = $1 AND c.deleted_at IS NULL
     WHERE r.student_user_id = $2
       AND student.tenant_id = $1 AND student.deleted_at IS NULL
       AND (r.tenant_id = $1 OR r.tenant_id IS NULL)
       AND r.deleted_at IS NULL AND r.status = 'PUBLISHED'
       AND (
         r.subject_id = sub.subject_id
         OR (r.subject_id IS NULL AND c.course_code = sub.subject_code
           AND (SELECT COUNT(*) FROM academic_subjects code_subject
                WHERE code_subject.subject_code = sub.subject_code
                  AND code_subject.deleted_at IS NULL) = 1)
       )
     ORDER BY r.result_id`,
    [input.tenantId, input.studentUserId, input.subjectId ?? null],
  );
  return rows.map((row: any) => {
    const maximum = row.max_marks == null ? null : Number(row.max_marks);
    const original =
      row.marks_obtained == null ? null : Number(row.marks_obtained);
    const maximumValid =
      maximum !== null && Number.isFinite(maximum) && maximum > 0;
    const originalValid =
      original !== null &&
      Number.isFinite(original) &&
      original >= 0 &&
      maximumValid &&
      original <= maximum;
    const valid = maximumValid && originalValid;
    const hasSource = Boolean(
      row.course_id &&
      row.result_session_id &&
      row.source_mark_id &&
      row.source_report_id &&
      row.source_mark_updated_at &&
      Array.isArray(row.grading_policy_snapshot?.bands) &&
      row.grading_policy_snapshot.bands.length,
    );
    return {
      ...row,
      max_marks: maximumValid ? maximum : null,
      marks_obtained:
        original !== null && Number.isFinite(original) ? original : null,
      is_valid: valid,
      can_apply_for_re_evaluation: valid && hasSource,
      re_evaluation_eligibility_message: hasSource
        ? null
        : 'Exam Cell must verify this result’s official declaration source before a paid re-evaluation can be requested.',
      validation_message: valid
        ? null
        : !maximumValid
          ? 'The published result has no valid maximum marks. Exam Cell must correct the result first.'
          : 'The published result has no valid original marks. Exam Cell must correct the result first.',
    };
  });
}

export async function resolveReEvaluationResult(
  db: Queryable,
  input: ReEvaluationResultInput,
): Promise<ReEvaluationResultResolution> {
  if (input.examResultId && !isUUID(input.examResultId)) {
    return {
      status: 'invalid',
      result: null,
      message: 'The linked exam result is invalid.',
    };
  }
  if (!input.examResultId && input.allowLegacyResolution === false) {
    return {
      status: 'missing',
      result: null,
      message: 'Select the exact published exam result.',
    };
  }
  const candidates = await listReEvaluationResultCandidates(db, input);
  if (input.examResultId) {
    const selected = candidates.find(
      (row) =>
        row.result_id.toLowerCase() === input.examResultId!.toLowerCase(),
    );
    if (!selected) {
      return {
        status: 'invalid',
        result: null,
        message:
          'The linked published result does not match this student, subject and university.',
      };
    }
    if (!selected.is_valid)
      return {
        status: 'invalid',
        result: null,
        message: selected.validation_message,
      };
    return { status: 'linked', result: selected, message: null };
  }
  if (candidates.length === 0) {
    return {
      status: 'missing',
      result: null,
      message:
        'No matching published exam result is available. Exam Cell must link the correct result.',
    };
  }
  if (candidates.length !== 1) {
    return {
      status: 'ambiguous',
      result: null,
      message:
        'More than one published result matches this subject. Exam Cell must select the exact exam result.',
    };
  }
  const selected = candidates[0];
  if (!selected.is_valid)
    return {
      status: 'invalid',
      result: null,
      message: selected.validation_message,
    };
  return { status: 'resolved', result: selected, message: null };
}

export function reEvaluationResultMetadata(
  resolution: ReEvaluationResultResolution,
  persistedExamResultId?: string | null,
) {
  return {
    exam_result_id:
      resolution.result?.result_id ?? persistedExamResultId ?? null,
    exam_max_marks: resolution.result?.max_marks ?? null,
    exam_session: resolution.result?.exam_session ?? null,
    exam_type: resolution.result?.exam_type ?? null,
    exam_link_status: resolution.status,
    exam_link_message: resolution.message,
  };
}
