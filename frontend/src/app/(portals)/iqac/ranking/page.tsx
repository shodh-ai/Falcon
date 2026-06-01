'use client';

import { useEffect, useState } from 'react';
import { IqacPageHeader } from '@/components/iqac/IqacPageHeader';
import { IqacBarChart } from '@/components/iqac/IqacCharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';

type RankingData = {
  nirf_simulation: Record<string, number>;
  placement_by_department: { dept_name: string; average_package: string; total_placed: number }[];
};

export default function IqacRankingPage() {
  const api = useAuthedApi();
  const [data, setData] = useState<RankingData | null>(null);

  useEffect(() => {
    void api.get<RankingData>('/iqac/ranking-analytics').then(setData);
  }, [api]);

  const chartData = (data?.placement_by_department ?? []).map((d) => ({
    dept_name: d.dept_name,
    average_package: Number(d.average_package),
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <IqacPageHeader title="Ranking Analytics (NIRF Simulation)" description="Interactive drill-down from pre-computed placement materialized views." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Simulated NIRF parameter scores</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            {data?.nirf_simulation &&
              Object.entries(data.nirf_simulation).map(([k, v]) => (
                <div key={k} className="rounded-lg border p-3">
                  <p className="text-xs capitalize text-muted-foreground">{k.replace(/_/g, ' ')}</p>
                  <p className="text-2xl font-bold text-sgvu-navy">{v}</p>
                </div>
              ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Average package by department (LPA)</CardTitle>
          </CardHeader>
          <CardContent>{chartData.length > 0 ? <IqacBarChart data={chartData} dataKey="average_package" nameKey="dept_name" /> : <p className="text-sm text-muted-foreground">No placement data yet.</p>}</CardContent>
        </Card>
      </div>
    </div>
  );
}
