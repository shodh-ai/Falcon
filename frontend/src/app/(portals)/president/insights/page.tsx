'use client';

import { useEffect, useState } from 'react';
import { AcademicInsightsDashboard } from '@/components/leadership/AcademicInsightsDashboard';
import { useAuthedApi } from '@/lib/api';
import { Loader2 } from 'lucide-react';

export default function PresidentInsightsPage() {
  const api = useAuthedApi();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/academics/insights/academic-performance')
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load insights', err);
        setLoading(false);
      });
  }, [api]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">University Results Insights</h1>
        <p className="text-muted-foreground">High-level executive overview of end-term grade distributions.</p>
      </div>
      {data && <AcademicInsightsDashboard data={data} showMidTerm={false} />}
    </div>
  );
}
