'use client';

import { useEffect, useState } from 'react';
import { IqacPageHeader } from '@/components/iqac/IqacPageHeader';
import { IqacBarChart } from '@/components/iqac/IqacCharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';

type Outcomes = {
  progression: { pg_pursuing: number; total_alumni: number };
  placement: {
    average_lpa: number;
    highest_lpa: number;
    placement_percent: number;
    by_department: { dept_name: string; total_placed: number; average_package: string }[];
  };
};

export default function IqacStudentOutcomesPage() {
  const api = useAuthedApi();
  const [data, setData] = useState<Outcomes | null>(null);

  useEffect(() => {
    void api.get<Outcomes>('/iqac/student-outcomes').then(setData);
  }, [api]);

  const chartData = (data?.placement.by_department ?? []).map((d) => ({
    dept_name: d.dept_name,
    total_placed: d.total_placed,
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <IqacPageHeader title="Student Progression & Placements" description="Alumni higher-ed pathways and placement ATS outcomes." />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Batch placement %</p>
            <p className="text-3xl font-black text-sgvu-navy">{data?.placement.placement_percent ?? 0}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Average LPA</p>
            <p className="text-3xl font-black text-sgvu-navy">{data?.placement.average_lpa ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Highest LPA</p>
            <p className="text-3xl font-black text-sgvu-navy">{data?.placement.highest_lpa ?? 0}</p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alumni progression (UG → PG)</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p>
            {data?.progression.pg_pursuing ?? 0} of {data?.progression.total_alumni ?? 0} verified alumni pursuing higher education
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Placements by department</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length ? <IqacBarChart data={chartData} dataKey="total_placed" nameKey="dept_name" /> : <p className="text-sm text-muted-foreground">No placement stats yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
