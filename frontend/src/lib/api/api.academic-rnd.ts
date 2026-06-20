type AuthedApi = {
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body?: unknown) => Promise<T>;
};

export type RndConfig = {
  config_id: string;
  title: string;
  deadline?: string | null;
  attachment_rules: string[];
  is_active: boolean;
};

export type RndApplication = {
  application_id: string;
  config_id: string;
  project_title: string;
  requested_budget?: string | number | null;
  documents: Record<string, string>;
  status: string;
  budget_approved: boolean;
  ranking_score?: string | number | null;
  ranking_status?: string | null;
  config_title?: string;
  student_name?: string;
  submitted_at: string;
  approvals?: { approval_tier: string; status: string; remarks?: string; ranking_score?: number }[];
};

export const RND_TRACKER_STEPS = [
  { key: 'PENDING_GUIDE', label: 'Guide Review' },
  { key: 'PENDING_BUDGET', label: 'Budget Approval' },
  { key: 'PENDING_RANKING', label: 'Committee Ranking' },
  { key: 'GRANT_APPROVED', label: 'Grant Approved' },
] as const;

export function rndTrackerIndex(status: string) {
  if (status === 'GRANT_APPROVED' || status === 'GRANT_REJECTED') return 3;
  if (status === 'PENDING_RANKING') return 2;
  if (status === 'PENDING_BUDGET') return 1;
  if (status === 'PENDING_GUIDE' || status === 'SUBMITTED') return 0;
  return -1;
}

export function createAcademicRndApi(api: AuthedApi) {
  return {
    activeConfig: () => api.get<RndConfig | null>('/api/academic-rnd/config/active'),
    listConfigs: () => api.get<RndConfig[]>('/api/academic-rnd/config'),
    upsertConfig: (body: {
      title: string;
      deadline?: string;
      attachment_rules?: string[];
      is_active?: boolean;
    }) => api.post<RndConfig>('/api/academic-rnd/config', body),
    submitApplication: (body: {
      config_id: string;
      project_title: string;
      requested_budget?: number;
      documents?: Record<string, string>;
    }) => api.post<RndApplication>('/api/academic-rnd/applications', body),
    myApplications: () => api.get<RndApplication[]>('/api/academic-rnd/applications/mine'),
    allApplications: () => api.get<RndApplication[]>('/api/academic-rnd/applications'),
    guideQueue: () => api.get<RndApplication[]>('/api/academic-rnd/approvals/guide/pending'),
    budgetQueue: () => api.get<RndApplication[]>('/api/academic-rnd/approvals/budget/pending'),
    rankingQueue: () => api.get<RndApplication[]>('/api/academic-rnd/approvals/ranking/pending'),
    approveGuide: (id: string, remarks?: string) =>
      api.post(`/api/academic-rnd/approvals/guide/${id}/approve`, { remarks }),
    rejectGuide: (id: string, remarks: string) =>
      api.post(`/api/academic-rnd/approvals/guide/${id}/reject`, { remarks }),
    approveBudget: (id: string, remarks?: string) =>
      api.post(`/api/academic-rnd/approvals/budget/${id}/approve`, { remarks }),
    rejectBudget: (id: string, remarks: string) =>
      api.post(`/api/academic-rnd/approvals/budget/${id}/reject`, { remarks }),
    submitRanking: (id: string, body: { ranking_score: number; ranking_status: 'APPROVED' | 'REJECTED'; remarks?: string }) =>
      api.post(`/api/academic-rnd/approvals/ranking/${id}`, body),
    exportReportUrl: () => '/api/academic-rnd/report/export',
  };
}
