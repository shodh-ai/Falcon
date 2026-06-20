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
  apply: (token: string, dto: { subject_id: number; application_type: ExamApplicationType }) =>
    apiFetch<ExamApplication>(token, { url: `${EXAMS}/applications`, method: 'POST', headers: {}, data: dto }),
};
