'use client';

import { useEffect, useState } from 'react';
import { NAVY, DefaulterHeatmap, LeadershipBarChart } from '@/components/leadership/LeadershipCharts';
import { LeadershipMetricCard, LeadershipPageHeader, LeadershipSectionCard } from '@/components/leadership/LeadershipSectionCard';
import { useLeadershipApi } from '@/lib/api/api.leadership';

export default function LeadershipFinancePage() {
  const api = useLeadershipApi();
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    void api.finance().then(setData).catch(() => setData(null));
  }, [api]);

  const revenueVsExpenses = (data?.revenue_vs_expenses as Record<string, unknown>[]) ?? [];
  const defaulters = (data?.defaulters_by_department as Array<{ department: string; outstanding: number }>) ?? [];

  return (
    <div className="space-y-6 p-6">
      <LeadershipPageHeader eyebrow="Financial Health" title="Finance Command View" />

      <div className="grid gap-4 sm:grid-cols-3">
        <LeadershipMetricCard label="Salary Disbursement (MTD)" value={`₹${Number(data?.salary_disbursement ?? 0).toLocaleString()}`} />
        <LeadershipMetricCard label="Hostel/Mess Revenue" value={`₹${Number(data?.hostel_mess_revenue ?? 0).toLocaleString()}`} highlight />
        <LeadershipMetricCard label="Hostel Ops Cost" value={`₹${Number(data?.hostel_ops_cost ?? 0).toLocaleString()}`} />
      </div>

      <LeadershipSectionCard title="Revenue vs Expenses">
        <LeadershipBarChart
          data={revenueVsExpenses}
          xKey="month"
          bars={[
            { key: 'revenue', color: NAVY, name: 'Revenue' },
            { key: 'expenses', color: '#ef4444', name: 'Expenses' },
          ]}
        />
      </LeadershipSectionCard>

      <LeadershipSectionCard title="Outstanding Fee Defaulters by Department">
        <DefaulterHeatmap data={defaulters} />
      </LeadershipSectionCard>
    </div>
  );
}
