import { API_URL, apiFetch, type ApiRequest } from './client';
import { extractApiErrorMessage } from '@/lib/notifications/parse-api-error';

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

export type ExamApplicationStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'ASSIGNED'
  | 'UNDER_REVIEW'
  | 'COMPLETED'
  | 'APPROVED'
  | 'REJECTED';

export interface ExamApplication {
  exam_application_id: string;
  student_user_id: string;
  subject_id: number;
  source_result_id?: string | null;
  source_session_id?: string | null;
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

export interface ReEvaluationSource {
  result_id: string;
  session_id: string | null;
  subject_id: number;
  subject_name: string;
  subject_code: string;
  exam_type: string | null;
  semester: number;
  marks_obtained: string | number;
  max_marks: string | number;
  published_at?: string | null;
}

function examFetch<T>(token: string, request: ApiRequest): Promise<T> {
  return apiFetch<T>(token, request).catch((cause: unknown) => {
    if (cause instanceof Error) {
      const response = /^API (\d{3})[^:]*:\s*([\s\S]*)$/.exec(cause.message);
      if (response) throw new Error(extractApiErrorMessage(response[2], Number(response[1]), request.url));
    }
    throw cause;
  });
}

export const examsApi = {
  schedule: (token: string) => examFetch<ExamSchedule[]>(token, { url: `${EXAMS}/schedule`, headers: {} }),
  eligibility: (token: string) => examFetch<ExamEligibilityResult>(token, { url: `${EXAMS}/eligibility`, headers: {} }),
  myApplications: (token: string) => examFetch<ExamApplication[]>(token, { url: `${EXAMS}/applications/my`, headers: {} }),
  reEvaluationSources: (token: string) => examFetch<ReEvaluationSource[]>(token, { url: `${EXAMS}/re-evaluation-sources`, headers: {} }),
  apply: (token: string, dto: { subject_id: number; application_type: ExamApplicationType; source_result_id?: string; source_session_id?: string | null }) =>
    examFetch<ExamApplication>(token, { url: `${EXAMS}/applications`, method: 'POST', headers: {}, data: dto }),
};
