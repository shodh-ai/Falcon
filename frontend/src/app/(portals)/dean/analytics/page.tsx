'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  HodMetricChip,
  HodPageFrame,
  HodPageHeader,
  HodPanel,
} from '@/components/hod/HodPagePrimitives';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useAuthedApi } from '@/lib/api';
import {
  DeanFilterBar,
  buildDeanFilterQuery,
  type DeanFilterValues,
} from '@/components/dean/DeanFilterBar';

type AnalyticsPayload = {
  attendance_trend: Array<{ week: string; attendance: number; target: number }>;
  result_trend: Array<{ label: string; pass_rate: number }>;
  placement_trend: Array<{ department: string; placement_pct: number }>;
  faculty_growth: Array<{ month: string; count: number }>;
  enrollment_trend: Array<{ month: string; count: number }>;
  research_growth: Array<{ month: string; count: number }>;
  budget_utilization: Array<{ label: string; allocated: number; spent: number }>;
};

export default function DeanAnalyticsPage() {
  const api = useAuthedApi();
  const [filters, setFilters] = useState<DeanFilterValues>({});
  const [departments, setDepartments] = useState<Array<{ dept_id: number; dept_name: string }>>([]);
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api
      .get<Array<{ dept_id: number; dept_name: string }>>('/api/academics/dean/departments')
      .then((rows) => setDepartments(rows))
      .catch(() => setDepartments([]));
  }, [api]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const payload = await api.get<AnalyticsPayload>(
          `/api/academics/dean/intelligence/analytics${buildDeanFilterQuery(filters)}`,
        );
        setData(payload);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [api, filters]);

  return (
    <HodPageFrame>
      <HodPageHeader
        title="School Analytics"
        description="Attendance, results, placement, faculty growth, enrollment, research, and budget trends."
        workspaceLabel="Dean Workspace"
        meta={
          <>
            <HodMetricChip label="Charts" value={7} emphasis />
          </>
        }
      />

      <DeanFilterBar departments={departments} value={filters} onChange={setFilters} />

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-sgvu-navy" />
        </div>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Analytics unavailable.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {[
            { title: 'Attendance Trend', chart: 'attendance' },
            { title: 'Result Trend', chart: 'result' },
            { title: 'Placement Trend', chart: 'placement' },
            { title: 'Faculty Growth', chart: 'faculty' },
            { title: 'Student Enrollment', chart: 'enrollment' },
            { title: 'Research Growth', chart: 'research' },
            { title: 'Budget Utilization', chart: 'budget' },
          ].map((panel) => (
            <HodPanel key={panel.chart} title={panel.title}>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  {panel.chart === 'attendance' ? (
                    <AreaChart data={data.attendance_trend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Area type="monotone" dataKey="attendance" stroke="#1e3a5f" fill="#1e3a5f33" />
                    </AreaChart>
                  ) : panel.chart === 'result' ? (
                    <BarChart data={data.result_trend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="pass_rate" fill="#c9a227" />
                    </BarChart>
                  ) : panel.chart === 'placement' ? (
                    <BarChart data={data.placement_trend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="department" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="placement_pct" fill="#1e3a5f" />
                    </BarChart>
                  ) : panel.chart === 'budget' ? (
                    <BarChart data={data.budget_utilization}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="allocated" fill="#64748b" />
                      <Bar dataKey="spent" fill="#c9a227" />
                    </BarChart>
                  ) : (
                    <AreaChart
                      data={
                        panel.chart === 'faculty'
                          ? data.faculty_growth
                          : panel.chart === 'enrollment'
                            ? data.enrollment_trend
                            : data.research_growth
                      }
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Area type="monotone" dataKey="count" stroke="#1e3a5f" fill="#1e3a5f33" />
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              </div>
            </HodPanel>
          ))}
        </div>
      )}
    </HodPageFrame>
  );
}
