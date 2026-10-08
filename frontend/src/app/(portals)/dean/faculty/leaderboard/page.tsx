'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  HodDataTable,
  HodPageFrame,
  HodPageHeader,
  HodPanel,
} from '@/components/hod/HodPagePrimitives';
import { useAuthedApi } from '@/lib/api';
import { useDeanDepartments } from '@/hooks/useDeanDepartments';
import {
  DeanFilterBar,
  buildDeanFilterQuery,
  type DeanFilterValues,
} from '@/components/dean/DeanFilterBar';

type LeaderboardPayload = {
  top_performers: Array<Record<string, unknown>>;
  needs_improvement: Array<Record<string, unknown>>;
  all: Array<Record<string, unknown>>;
};

export default function DeanFacultyLeaderboardPage() {
  const api = useAuthedApi();
  const { departments } = useDeanDepartments();
  const [filters, setFilters] = useState<DeanFilterValues>({});
  const [data, setData] = useState<LeaderboardPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const payload = await api.get<LeaderboardPayload>(
          `/api/academics/dean/intelligence/faculty-leaderboard${buildDeanFilterQuery(filters)}`,
        );
        setData(payload);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [api, filters]);

  const columns = [
    { key: 'name', label: 'Faculty', render: (r: Record<string, unknown>) => String(r.name) },
    { key: 'dept', label: 'Department', render: (r: Record<string, unknown>) => String(r.department ?? '—') },
    { key: 'att', label: 'Attendance', render: (r: Record<string, unknown>) => String(r.attendance_score ?? '—') },
    { key: 'fb', label: 'Feedback', render: (r: Record<string, unknown>) => String(r.student_feedback ?? '—') },
    { key: 'res', label: 'Research', render: (r: Record<string, unknown>) => String(r.research_score ?? '—') },
    { key: 'api', label: 'API Score', render: (r: Record<string, unknown>) => String(r.api_score ?? '—') },
    { key: 'load', label: 'Workload', render: (r: Record<string, unknown>) => String(r.workload_status ?? '—') },
    { key: 'rating', label: 'Performance', render: (r: Record<string, unknown>) => String(r.performance_rating ?? '—') },
  ];

  return (
    <HodPageFrame>
      <HodPageHeader
        title="Faculty Performance Leaderboard"
        description="School-wide faculty ranking by attendance, feedback, research, API score, and workload."
        workspaceLabel="Dean Workspace"
      />

      <DeanFilterBar departments={departments} value={filters} onChange={setFilters} />

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-sgvu-navy" />
        </div>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Leaderboard unavailable.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <HodPanel title="Top Performers">
            <HodDataTable columns={columns} rows={data.top_performers} rowKey={(r) => String(r.user_id)} />
          </HodPanel>
          <HodPanel title="Needs Improvement">
            <HodDataTable columns={columns} rows={data.needs_improvement} rowKey={(r) => String(r.user_id)} />
          </HodPanel>
        </div>
      )}
    </HodPageFrame>
  );
}
