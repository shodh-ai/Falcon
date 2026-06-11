'use client';

import { useMemo } from 'react';
import { useAuthedApi } from '@/lib/api';

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
  }),
    [api],
  );
}
