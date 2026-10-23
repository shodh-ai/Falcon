import { API_URL, apiFetch } from './client';

const EXAMS = `${API_URL}/api/academics/exams`;

export type ExamType = 'MID_TERM' | 'END_TERM' | 'PRACTICAL';

export interface ExamSchedule {
  exam_schedule_id: string;
  exam_type: ExamType;
  subject_id: number;
  exam_date: string;
  start_time: string;
  end_time: string;
  venue: string;
  seat_no?: string | null;
}

export interface ExamEligibilityResult {
  eligible: boolean;
  attendance_percent: number;
  min_required?: number;
  exempted?: boolean;
  reasons: Array<{ code: 'ATTENDANCE_SHORTFALL' | 'PENDING_FEE_DUES'; message: string; details?: unknown }>;
}

export type ExamApplicationType = 'RE_EVALUATION' | 'BACKLOG';

export type ExamLinkStatus = 'linked' | 'resolved' | 'missing' | 'ambiguous' | 'invalid';
export interface ExamResultLink {
  exam_result_id?: string | null;
  exam_max_marks?: number | string | null;
  exam_session?: string | null;
  exam_type?: string | null;
  exam_link_status?: ExamLinkStatus;
  exam_link_message?: string | null;
}

export interface ReEvaluationResult {
  result_id: string;
  subject_id: number | null;
  subject_name?: string | null;
  subject_code?: string | null;
  exam_session: string | null;
  exam_type: string | null;
  marks_obtained: number | string | null;
  max_marks: number | string | null;
  is_valid: boolean;
  can_apply_for_re_evaluation?: boolean;
  re_evaluation_eligibility_message?: string | null;
  validation_message?: string | null;
  link_verified?: boolean;
  link_validation_message?: string | null;
  grade?: string | null;
  grade_letter?: string | null;
}

export type ExamApplicationCreate = { subject_id: number } & (
  | { application_type: 'RE_EVALUATION'; exam_result_id: string }
  | { application_type: 'BACKLOG'; exam_result_id?: string }
);

export function reevaluationMaximum(exam: ExamResultLink): number | null {
  if (!['linked', 'resolved'].includes(exam.exam_link_status ?? '') || exam.exam_max_marks == null || String(exam.exam_max_marks).trim() === '') return null;
  const maximum = Number(exam.exam_max_marks);
  return Number.isFinite(maximum) && maximum > 0 ? maximum : null;
}

export type ExamApplicationStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'ASSIGNED'
  | 'UNDER_REVIEW'
  | 'COMPLETED'
  | 'APPROVED'
  | 'REJECTED';

export interface ExamApplication extends ExamResultLink {
  exam_application_id: string;
  student_user_id: string;
  subject_id: number;
  subject_name?: string;
  subject_code?: string;
  application_type: ExamApplicationType;
  fee_status: 'PENDING' | 'PAID' | 'WAIVED';
  status: ExamApplicationStatus;
  finance_demand_id?: string | null;
  original_marks?: number | string | null;
  revised_marks?: number | string | null;
  report_notes?: string | null;
  faculty_name?: string | null;
  published_at?: string | null;
  created_at: string;
}

export const examsApi = {
  schedule: (token: string) => apiFetch<ExamSchedule[]>(token, { url: `${EXAMS}/schedule`, headers: {} }),
  eligibility: (token: string) => apiFetch<ExamEligibilityResult>(token, { url: `${EXAMS}/eligibility`, headers: {} }),
  myApplications: (token: string) => apiFetch<ExamApplication[]>(token, { url: `${EXAMS}/applications/my`, headers: {} }),
  reEvaluationResults: (token: string) => apiFetch<ReEvaluationResult[]>(token, { url: `${EXAMS}/re-evaluation-results`, headers: {} }),
  apply: (token: string, dto: ExamApplicationCreate) =>
    apiFetch<ExamApplication>(token, { url: `${EXAMS}/applications`, method: 'POST', headers: {}, data: dto }),
};
