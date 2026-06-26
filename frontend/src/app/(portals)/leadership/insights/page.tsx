'use client';

import { useEffect, useState } from 'react';
import { AcademicInsightsDashboard } from '@/components/leadership/AcademicInsightsDashboard';
import { LeadershipPageHeader } from '@/components/leadership/LeadershipSectionCard';
import {
  ExecutiveDateRangeFilter,
  ExecutiveExportButton,
  type ExecutivePeriod,
} from '@/components/leadership/executive';
import { useAuthedApi } from '@/lib/api';
import { Loader2 } from 'lucide-react';

export default function LeadershipInsightsPage() {
  const api = useAuthedApi();
  const [period, setPeriod] = useState<ExecutivePeriod>('year');
  const [data, setData] = useState<Parameters<typeof AcademicInsightsDashboard>[0]['data'] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get<Parameters<typeof AcademicInsightsDashboard>[0]['data']>('/api/academics/insights/academic-performance')
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [api, period]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <LeadershipPageHeader
        eyebrow="Academic Health"
        title="University Results Insights"
        description="Executive overview of end-term grade distributions and academic performance"
        action={
          <div className="flex flex-col gap-2 sm:items-end">
            <ExecutiveDateRangeFilter value={period} onChange={setPeriod} />
            <ExecutiveExportButton targetId="insights-dashboard" filename="result-insights" />
          </div>
        }
      />
      <div id="insights-dashboard">{data ? <AcademicInsightsDashboard data={data} showMidTerm={false} /> : null}</div>
    </div>
  );
}
