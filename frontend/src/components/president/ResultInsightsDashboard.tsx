'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AcademicInsightsDashboard } from '@/components/leadership/AcademicInsightsDashboard';
import { LeadershipPageHeader } from '@/components/leadership/LeadershipSectionCard';
import { EXECUTIVE_SPACING } from '@/components/leadership/executive/design-tokens';
import { useAuthedApi } from '@/lib/api';
import {
  RESULT_INSIGHTS_SMOKE_DATA,
  hasResultInsightsPayload,
  isMeaningfulResultInsights,
  type ResultInsightsData,
} from '@/components/president/insightsMockData';

export function ResultInsightsDashboard() {
  const api = useAuthedApi();
  // Always seed smoke first so the page is never blank during portal testing.
  const [data, setData] = useState<ResultInsightsData>(RESULT_INSIGHTS_SMOKE_DATA);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    api
      .get<ResultInsightsData>('/api/academics/insights/academic-performance')
      .then((res) => {
        if (cancelled) return;
        if (hasResultInsightsPayload(res) && isMeaningfulResultInsights(res)) {
          setData(res);
        } else {
          setData(RESULT_INSIGHTS_SMOKE_DATA);
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setData(RESULT_INSIGHTS_SMOKE_DATA);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [api]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={EXECUTIVE_SPACING.page}>
      <LeadershipPageHeader
        eyebrow="Falcon Workspace"
        title="University Results Insights"
        description="Executive overview of end-term grade distributions, department benchmarks, and academic risk signals across SGVU programmes."
      />

      <AcademicInsightsDashboard data={data} showMidTerm={false} />
    </div>
  );
}
