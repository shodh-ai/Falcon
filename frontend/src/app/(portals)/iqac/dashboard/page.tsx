'use client';

import { useEffect, useState } from 'react';
import { IqacPageHeader } from '@/components/iqac/IqacPageHeader';
import { IqacGauge } from '@/components/iqac/IqacCharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';

type KpiData = {
  gauges: {
    faculty_student_ratio: number;
    phd_faculty_percent: number;
    total_research_grants_inr: number;
    placement_rate_percent: number;
    average_placement_lpa: number;
  };
  heatmap: { department: string; pending_reports: number; risk: string }[];
};

export default function IqacDashboardPage() {
  const api = useAuthedApi();
  const [data, setData] = useState<KpiData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<KpiData>('/iqac/dashboard')
      .then((payload) => {
        setData(payload);
        setError(null);
      })
      .catch((e) => {
        setData(null);
        try {
          const parsed = JSON.parse(e instanceof Error ? e.message : '') as { message?: string };
          setError(parsed.message ?? 'Failed to load KPI dashboard');
        } catch {
          setError(e instanceof Error ? e.message : 'Failed to load KPI dashboard');
        }
      });
  }, [api]);

  const g = data?.gauges;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <IqacPageHeader
        title="Master KPI Dashboard"
        description="Read-only aggregates from HR, Academics, Faculty Research, and Placement modules (refreshed nightly)."
      />
      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <IqacGauge label="Faculty : Student Ratio" value={g?.faculty_student_ratio ?? 0} unit=":1" max={30} />
        <IqacGauge label="PhD Faculty %" value={g?.phd_faculty_percent ?? 0} unit="%" />
        <IqacGauge label="Research Grants" value={Math.round((g?.total_research_grants_inr ?? 0) / 100000)} unit="L ₹" max={500} />
        <IqacGauge label="Placement Rate" value={g?.placement_rate_percent ?? 0} unit="%" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Department compliance heat map</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(data?.heatmap ?? []).map((row) => (
            <div key={row.department} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
              <span>{row.department}</span>
              <span className="flex items-center gap-2">
                <span className="text-muted-foreground">{row.pending_reports} pending</span>
                <Badge variant={row.risk === 'HIGH' ? 'destructive' : row.risk === 'MEDIUM' ? 'secondary' : 'default'}>
                  {row.risk}
                </Badge>
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
