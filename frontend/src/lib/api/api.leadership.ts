'use client';

import { useMemo } from 'react';
import { useAuthedApi } from '@/lib/api';

export type IntelligenceTicker = {
  revenue_today: number;
  expense_today: number;
  net_profit_today: number;
  cash_in_bank: number;
};

export type VersusVariance =
  | {
      metric: string;
      compare: 'MoM' | 'YoY' | 'BUDGET';
      period: string | null;
      current: number;
      previous: number;
      delta: number;
      delta_pct: number | null;
    }
  | {
      metric: string;
      compare: 'BUDGET';
      allocated: number;
      actual: number;
      variance: number;
      variance_pct: number | null;
    };

export type DeptScatter = {
  month: string;
  points: Array<{ department: string; revenue: number; cost: number }>;
};

export type OwnerRatios = {
  ratio_date: string;
  cac: number | null;
  faculty_roi: number | null;
  opex_ratio: number | null;
  fee_collection_efficiency: number | null;
  sources: Record<string, unknown>;
  generated_at: string | null;
};

export type FinanceAllocationRule = {
  rule_id: string;
  fee_head: string;
  program_code: string | null;
  template_id: string | null;
  ledger_category: string;
  weight: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type BankBalanceSnapshot = {
  snapshot_id: string;
  bank_account_key: string;
  balance_date: string;
  closing_balance: number;
  source: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type AdmissionsFunnel = {
  funnel: Array<{ stage: string; count: number }>;
};

export type OwnerBrief = {
  brief_date: string;
  bullets: string[];
  generated_at: string | null;
};

export type CashFlowSankey = {
  from: string;
  to: string;
  nodes: { name: string }[];
  links: { source: string; target: string; value: number }[];
};

export type DailyCashWaterfall = {
  date: string;
  bank_account_key: string;
  starting_balance: number;
  steps: Array<{ label: string; value: number }>;
  ending_balance: number;
};

export type FeedEvent = {
  event_id: string;
  event_type: 'INCOME' | 'EXPENSE' | 'ALERT';
  label: string;
  amount: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type IntelligenceQuadrants = {
  q1_ledger: Array<{ period: string; revenue: number; expenses: number }>;
  q2_revenue: Array<{ source: string; amount: number }>;
  q3_defaulters: { total_due: number; total_collected: number; collection_rate: number };
  q4_dept_scores: Array<{
    department_id: number;
    department_name: string;
    total_score: number;
    budget_adherence: number;
    roi_score: number;
    receivables_score: number;
  }>;
};

export type LeadershipOverview = {
  tickers: {
    total_students: number;
    total_faculty: number;
    revenue_today: number;
    campus_attendance_today: number;
  };
  avg_attendance: number;
  fee_defaulter_count: number;
  refreshed_at: string | null;
  live: {
    library_scans_today: number;
    buses_on_route: number;
    campus_attendance_today_pct: number;
  };
};

export type DrillNode = {
  drill_id: string;
  node_key: string;
  label: string;
  attendance_pct: number;
  meta: Record<string, unknown>;
  alert: boolean;
};

export type LeadershipPlacements = {
  placement_pct: number;
  lpa_trends: Array<{
    year: number;
    avg_lpa: number;
    highest_lpa: number;
  }>;
  top_recruiters: Array<{
    company: string;
    hires: number;
  }>;
};

export function useLeadershipApi() {
  const api = useAuthedApi();

  return useMemo(
    () => ({
      overview: () => api.get<LeadershipOverview>('/api/leadership/overview'),
      finance: () => api.get<Record<string, unknown>>('/api/leadership/finance'),
      academics: () => api.get<Record<string, unknown>>('/api/leadership/academics'),
      placements: () => api.get<LeadershipPlacements>('/api/leadership/placements'),
      admissionsFunnel: () => api.get<AdmissionsFunnel>('/api/leadership/admissions-funnel'),
      hrOps: () => api.get<Record<string, unknown>>('/api/leadership/hr-ops'),
      drilldown: (level: string, parentKey?: string) =>
        api.get<DrillNode[]>(
          `/api/leadership/drilldown?level=${encodeURIComponent(level)}${parentKey ? `&parentKey=${encodeURIComponent(parentKey)}` : ''}`,
        ),
      flagToHod: (body: { node_key: string; label: string; message?: string }) =>
        api.post<{ success: boolean; notified_hod: string }>('/api/leadership/flag-to-hod', body),
      issues: () => api.get<Record<string, unknown>>('/api/leadership/issues'),
      escalateIssue: (ticketId: string) =>
        api.post<{ success: boolean; notified_hod: string }>(`/api/leadership/issues/${ticketId}/escalate`, {}),
      ticker: () => api.get<IntelligenceTicker>('/api/leadership/intelligence/ticker'),
      quadrants: (period?: string) =>
        api.get<IntelligenceQuadrants>(`/api/leadership/intelligence/quadrants${period ? `?period=${period}` : ''}`),
      feed: (limit?: number) =>
        api.get<FeedEvent[]>(`/api/leadership/intelligence/feed${limit ? `?limit=${limit}` : ''}`),
      ownerBrief: () => api.get<OwnerBrief>('/api/leadership/owners/brief'),
      cashFlowSankey: (params?: { from?: string; to?: string }) => {
        const q = new URLSearchParams();
        if (params?.from) q.set('from', params.from);
        if (params?.to) q.set('to', params.to);
        const qs = q.toString();
        return api.get<CashFlowSankey>(`/api/leadership/cash-flow/sankey${qs ? `?${qs}` : ''}`);
      },
      dailyCashWaterfall: (params?: { date?: string; bank_account_key?: string }) => {
        const q = new URLSearchParams();
        if (params?.date) q.set('date', params.date);
        if (params?.bank_account_key) q.set('bank_account_key', params.bank_account_key);
        const qs = q.toString();
        return api.get<DailyCashWaterfall>(`/api/leadership/cash-flow/waterfall${qs ? `?${qs}` : ''}`);
      },
      versusVariance: (params: { metric: string; compare?: 'MoM' | 'YoY' | 'BUDGET' }) => {
        const q = new URLSearchParams();
        q.set('metric', params.metric);
        if (params.compare) q.set('compare', params.compare);
        return api.get<VersusVariance>(`/api/leadership/versus/variance?${q.toString()}`);
      },
      deptScatter: (params?: { month?: string }) => {
        const q = new URLSearchParams();
        if (params?.month) q.set('month', params.month);
        const qs = q.toString();
        return api.get<DeptScatter>(`/api/leadership/versus/dept-scatter${qs ? `?${qs}` : ''}`);
      },
      ownerRatios: (params?: { date?: string }) => {
        const q = new URLSearchParams();
        if (params?.date) q.set('date', params.date);
        const qs = q.toString();
        return api.get<OwnerRatios>(`/api/leadership/versus/ratios${qs ? `?${qs}` : ''}`);
      },
      listAllocationRules: (params?: { fee_head?: string }) => {
        const q = new URLSearchParams();
        if (params?.fee_head) q.set('fee_head', params.fee_head);
        const qs = q.toString();
        return api.get<FinanceAllocationRule[]>(`/api/leadership/finance/allocation-rules${qs ? `?${qs}` : ''}`);
      },
      upsertAllocationRule: (dto: Partial<FinanceAllocationRule> & { fee_head: string; ledger_category: string }) => {
        return api.post<{ created?: boolean; updated?: boolean; rule_id: string }>(
          '/api/leadership/finance/allocation-rules',
          dto,
        );
      },
      listBankBalanceSnapshots: (params?: { bank_account_key?: string; from?: string; to?: string }) => {
        const q = new URLSearchParams();
        if (params?.bank_account_key) q.set('bank_account_key', params.bank_account_key);
        if (params?.from) q.set('from', params.from);
        if (params?.to) q.set('to', params.to);
        const qs = q.toString();
        return api.get<BankBalanceSnapshot[]>(
          `/api/leadership/finance/bank-balance-snapshots${qs ? `?${qs}` : ''}`,
        );
      },
      upsertBankBalanceSnapshot: (dto: {
        bank_account_key: string;
        balance_date: string;
        closing_balance: number;
        source?: string;
        payload?: Record<string, unknown>;
      }) => {
        return api.post<{ upserted: boolean; bank_account_key: string; balance_date: string }>(
          '/api/leadership/finance/bank-balance-snapshots',
          dto,
        );
      },
      departmentScores: () => api.get<unknown[]>('/api/leadership/department-scores'),
      vendorRisk: () => api.get<unknown[]>('/api/leadership/vendors/risk-ranking'),
      auditLog: (params?: { table?: string; record_id?: string; limit?: number }) => {
        const q = new URLSearchParams();
        if (params?.table) q.set('table', params.table);
        if (params?.record_id) q.set('record_id', params.record_id);
        if (params?.limit) q.set('limit', String(params.limit));
        const qs = q.toString();
        return api.get<unknown[]>(`/api/leadership/audit-log${qs ? `?${qs}` : ''}`);
      },
      aiChat: (question: string) =>
        api.post<{ answer: string; sql?: string; rows?: unknown[] }>('/api/leadership/ai/chat', { question }),
      aiDeltaAnalysis: () => api.post<{ narrative: string; deltas: unknown[] }>('/api/leadership/ai/delta-analysis', {}),
      aiScenario: (admissions_drop_pct: number) =>
        api.post<{ narrative: string; projections: unknown[] }>('/api/leadership/ai/scenario', { admissions_drop_pct }),
      aiForecast: () =>
        api.get<Array<{ horizon_days: number; projected_balance: number; assumptions: unknown }>>(
          '/api/leadership/ai/forecast',
        ),
      budgetAllocation: (financialYear?: string) =>
        api.get<{
          financial_year: string;
          university: { total_allocated: number; status: string };
          departments: Array<{ dept_id: number; dept_name: string }>;
          dept_budgets: Array<{
            budget_id: string;
            department_id: number;
            dept_name: string;
            allocated_amount: string | number;
          }>;
        }>(`/api/leadership/budget/allocation${financialYear ? `?financial_year=${encodeURIComponent(financialYear)}` : ''}`),
      saveBudgetDraft: (body: {
        financial_year: string;
        total_university_budget: number;
        departments: Array<{ department_id: number; allocated_amount: number }>;
      }) => api.post('/api/leadership/budget/allocation/draft', body),
      lockBudget: (financial_year: string) =>
        api.post('/api/leadership/budget/allocation/lock', { financial_year }),
      budgetPrograms: (budgetId: string) =>
        api.get<
          Array<{
            program_id: string;
            program_name: string;
            allocated_amount: string | number;
            utilized_amount: string | number;
            encumbered_amount?: string | number;
          }>
        >(`/api/leadership/budget/programs?budget_id=${encodeURIComponent(budgetId)}`),
      createBudgetProgram: (body: {
        budget_id: string;
        program_name: string;
        allocated_amount: number;
        program_type?: string;
      }) => api.post('/api/leadership/budget/programs', body),
      budgetMonitorDepartments: (financialYear?: string) =>
        api.get<unknown[]>(
          `/api/leadership/budget/monitor/departments${financialYear ? `?financial_year=${encodeURIComponent(financialYear)}` : ''}`,
        ),
      budgetMonitorSankey: (financialYear?: string) =>
        api.get<{ nodes: { name: string }[]; links: { source: string; target: string; value: number }[] }>(
          `/api/leadership/budget/monitor/sankey${financialYear ? `?financial_year=${encodeURIComponent(financialYear)}` : ''}`,
        ),
      budgetProgramLedger: (programId: string) =>
        api.get<{ program: Record<string, unknown>; breakdown: Array<{ category: string; total: string }> }>(
          `/api/leadership/budget/monitor/programs/${programId}`,
        ),
      budgetExpenseGroundTruth: (programId: string, category?: string) =>
        api.get<unknown[]>(
          `/api/leadership/budget/monitor/expenses/${programId}${category ? `?category=${encodeURIComponent(category)}` : ''}`,
        ),
      reviewBudgetExpansion: (requestId: string, approve: boolean) =>
        api.post(`/api/leadership/budget/expansion/${requestId}/review`, { approve }),
    }),
    [api],
  );
}
