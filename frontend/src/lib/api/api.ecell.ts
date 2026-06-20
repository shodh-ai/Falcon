type AuthedApi = {
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body?: unknown) => Promise<T>;
};

export type EcellConfig = {
  config_id: string;
  cohort_name: string;
  is_active: boolean;
  max_funding_limit?: string | number | null;
  level_1_approver_role: string;
  level_2_approver_role: string;
};

export type EcellApproval = {
  approval_id: string;
  approval_level: number;
  status: 'APPROVED' | 'REJECTED';
  approved_funding_amount?: string | number | null;
  remarks?: string | null;
  action_date: string;
};

export type EcellProject = {
  project_id: string;
  startup_name: string;
  innovation_description: string;
  pitch_deck_url?: string | null;
  requested_funding: string | number;
  approved_funding_amount?: string | number | null;
  current_status: string;
  submitted_at: string;
  cohort_name?: string | null;
  student_name?: string;
  approvals?: EcellApproval[] | null;
  l1_approval?: EcellApproval | null;
};

export type EcellDashboard = {
  submitted_count: string | number;
  l1_queue_count: string | number;
  l2_queue_count: string | number;
  funded_count: string | number;
  rejected_count: string | number;
  total_disbursed: string | number;
  active_cohorts?: string | number;
};

export type EcellFinancePayout = {
  disbursement_id: string;
  startup_name: string;
  student_name: string;
  amount: string | number;
  grant_tag: string;
  status: string;
  created_at: string;
  posted_at?: string | null;
  approved_by_label: string;
};

export type EcellGrant = {
  disbursement_id: string;
  startup_name: string;
  student_name: string;
  amount: string | number;
  grant_tag: string;
  status: string;
  bank_account_ref?: string | null;
  created_at: string;
  posted_at?: string | null;
};
export type EcellPortfolioItem = EcellProject & {
  student_email?: string;
  disbursed_amount?: string | number | null;
  funded_at?: string | null;
};

export function isFounderMode(status: string) {
  return status === 'L2_APPROVED' || status === 'FUNDED';
}

export type EcellWorkspace = {
  workspace_id: string;
  name: string;
  capacity?: number | null;
  amenities?: string[] | null;
};

export type EcellWorkspaceBooking = {
  booking_id: string;
  workspace_id: string;
  workspace_name?: string;
  start_time: string;
  end_time: string;
  purpose?: string | null;
  status: string;
  startup_name?: string;
};

export type EcellMentor = {
  user_id: string;
  name: string;
  role_name?: string;
  dept_name?: string | null;
  mentor_type: string;
  expertise_label?: string;
};

export type EcellMentorMeeting = {
  meeting_id: string;
  topic: string;
  requested_time: string;
  status: string;
  meeting_link?: string | null;
  decline_reason?: string | null;
  mentor_feedback?: string | null;
  mentor_name?: string;
  founder_name?: string;
  startup_name?: string;
};

export type EcellFounderStatus = {
  unlocked: boolean;
  project: Pick<EcellProject, 'project_id' | 'startup_name' | 'current_status' | 'approved_funding_amount'> | null;
};

export function createEcellApi(api: AuthedApi) {
  return {
    activeConfig: () => api.get<EcellConfig | null>('/api/ecell/config/active'),
    listConfig: () => api.get<EcellConfig[]>('/api/ecell/config'),
    upsertConfig: (body: Record<string, unknown>) => api.post<EcellConfig>('/api/ecell/config', body),
    submitProject: (body: Record<string, unknown>) => api.post<EcellProject>('/api/ecell/projects', body),
    myProjects: () => api.get<EcellProject[]>('/api/ecell/projects/mine'),
    triageQueue: () => api.get<EcellProject[]>('/api/ecell/admin/triage'),
    pushToL1: (id: string) => api.post(`/api/ecell/admin/triage/${id}/push-l1`, {}),
    triageReject: (id: string, remarks: string) =>
      api.post(`/api/ecell/admin/triage/${id}/reject`, { remarks }),
    pipelineBoard: () => api.get<EcellProject[]>('/api/ecell/admin/pipeline/board'),
    portfolio: () => api.get<EcellPortfolioItem[]>('/api/ecell/admin/portfolio'),
    grants: () => api.get<EcellGrant[]>('/api/ecell/admin/grants'),
    financePayouts: () => api.get<EcellFinancePayout[]>('/api/ecell/finance/payouts'),
    l1Pending: () => api.get<EcellProject[]>('/api/ecell/approvals/l1/pending'),
    approveL1: (id: string, body: { approved_funding_amount?: number; remarks?: string }) =>
      api.post(`/api/ecell/approvals/l1/${id}/approve`, body),
    rejectL1: (id: string, remarks: string) =>
      api.post(`/api/ecell/approvals/l1/${id}/reject`, { remarks }),
    l2Pending: () => api.get<EcellProject[]>('/api/ecell/approvals/l2/pending'),
    approveL2: (id: string, body?: { approved_funding_amount?: number; remarks?: string }) =>
      api.post(`/api/ecell/approvals/l2/${id}/approve`, body ?? {}),
    rejectL2: (id: string, remarks: string) =>
      api.post(`/api/ecell/approvals/l2/${id}/reject`, { remarks }),
    dashboard: () => api.get<EcellDashboard>('/api/ecell/admin/dashboard'),
    founderStatus: () => api.get<EcellFounderStatus>('/api/ecell/founder/status'),
    workspaces: () => api.get<EcellWorkspace[]>('/api/ecell/founder/workspaces'),
    workspaceCalendar: (workspaceId: string, date: string) =>
      api.get<EcellWorkspaceBooking[]>(
        `/api/ecell/founder/workspaces/${workspaceId}/calendar?date=${encodeURIComponent(date)}`,
      ),
    myBookings: () => api.get<EcellWorkspaceBooking[]>('/api/ecell/founder/bookings'),
    bookWorkspace: (body: Record<string, unknown>) =>
      api.post<EcellWorkspaceBooking>('/api/ecell/founder/workspaces/book', body),
    mentors: () => api.get<EcellMentor[]>('/api/ecell/founder/mentors'),
    myMentorMeetings: () => api.get<EcellMentorMeeting[]>('/api/ecell/founder/mentor-meetings'),
    requestMentorMeeting: (body: Record<string, unknown>) =>
      api.post<EcellMentorMeeting>('/api/ecell/founder/mentor-meetings', body),
    mentorInbox: () => api.get<EcellMentorMeeting[]>('/api/ecell/mentor/inbox'),
    mentorFeedbackPending: () => api.get<EcellMentorMeeting[]>('/api/ecell/mentor/feedback-pending'),
    acceptMentorMeeting: (id: string, meeting_link: string) =>
      api.post(`/api/ecell/mentor/meetings/${id}/accept`, { meeting_link }),
    declineMentorMeeting: (id: string, decline_reason: string) =>
      api.post(`/api/ecell/mentor/meetings/${id}/decline`, { decline_reason }),
    submitMentorFeedback: (id: string, mentor_feedback: string) =>
      api.post(`/api/ecell/mentor/meetings/${id}/feedback`, { mentor_feedback }),
  };
}

export const ECELL_TRACKER_STEPS = [
  { key: 'SUBMITTED', label: 'Submitted' },
  { key: 'UNDER_L1_REVIEW', label: 'Under L1 Review' },
  { key: 'L1_APPROVED', label: 'L1 Approved' },
  { key: 'L2_APPROVED', label: 'Under L2 Review' },
  { key: 'FUNDED', label: 'Fund Granted' },
] as const;

export function ecellTrackerIndex(status: string) {
  if (status === 'REJECTED') return -1;
  if (status === 'FUNDED') return ECELL_TRACKER_STEPS.length - 1;
  if (status === 'L2_APPROVED') return 3;
  const idx = ECELL_TRACKER_STEPS.findIndex((s) => s.key === status);
  return idx >= 0 ? idx : 0;
}
