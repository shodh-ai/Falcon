'use client';

import { useEffect, useMemo, useState } from 'react';
import { FalconLoader } from '@/components/brand/FalconLoader';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LeadershipPageHeader } from '@/components/leadership/LeadershipSectionCard';
import { EXECUTIVE_SPACING } from '@/components/leadership/executive/design-tokens';
import { useAuthedApi } from '@/lib/api';
import { presidentPages } from '@/lib/workspace-pages';
import { cn } from '@/lib/utils';
import { ExecutiveInsightCard } from './ExecutiveInsightCard';
import { DemoDataBanner } from './DemoDataBanner';
import { PRESIDENT_ALERTS } from './mockData';
import { PresidentAlertsWidget } from './PresidentAlertsWidget';
import type { PresidentAlert } from './types';

const config = presidentPages.executiveSummary;

const FALLBACK_SUMMARY_DATA = {
  total_university_revenue: 47_400_000,
  total_collected: 15_000_000,
  headcount: { students: 4_520, staff: 345 },
};

type ApiAlerts = {
  alerts?: Array<Omit<PresidentAlert, 'timestamp'>>;
};

/** Executive Summary with insight brief, KPI cards, then Action Center alerts. */
export function ExecutiveSummaryWithAlerts({ className }: { className?: string }) {
  const api = useAuthedApi();
  const [data, setData] = useState<unknown>(FALLBACK_SUMMARY_DATA);
  const [alerts, setAlerts] = useState<PresidentAlert[]>(PRESIDENT_ALERTS);
  const [usingSmokeData, setUsingSmokeData] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const result = await api.get<Record<string, unknown>>(config.endpoint);
        const revenue = Number(result?.total_university_revenue ?? 0);
        const collected = Number(result?.total_collected ?? 0);
        const students = Number((result?.headcount as { students?: number } | undefined)?.students ?? 0);
        if (result && (revenue > 0 || collected > 0 || students > 0)) {
          setData(result);
          setUsingSmokeData(false);
        } else {
          setData(FALLBACK_SUMMARY_DATA);
          setUsingSmokeData(true);
        }
      } catch {
        setData(FALLBACK_SUMMARY_DATA);
        setUsingSmokeData(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [api]);

  useEffect(() => {
    void (async () => {
      try {
        const result = await api.get<ApiAlerts>('/api/president/alerts');
        const liveAlerts = result?.alerts ?? [];
        if (liveAlerts.length > 0) {
          setAlerts(liveAlerts.map((alert) => ({ ...alert, timestamp: 'Today' })));
        }
      } catch {
        // Keep the sample alerts when the endpoint is unavailable.
      }
    })();
  }, [api]);

  const summary = useMemo(() => config.summary?.(data) ?? [], [data]);

  const criticalAlerts = alerts.filter((a) => a.severity === 'critical').length;
  const pendingApprovals = alerts.filter(
    (a) => a.status === 'Pending' || a.status === 'Escalated',
  ).length;

  if (loading) return <FalconLoader label="Loading Executive Summary…" />;

  return (
    <div className={cn(EXECUTIVE_SPACING.page, className)}>
      <div className="mx-auto max-w-7xl space-y-6">
        <LeadershipPageHeader
          eyebrow="Falcon Workspace"
          title="Executive Summary"
          description="The President's bird's-eye view of revenue and university headcount."
        />

        {usingSmokeData && (
          <DemoDataBanner message="Showing demo executive KPIs for portal testing (live summary was empty or unavailable)." />
        )}

        <ExecutiveInsightCard
          pendingApprovals={pendingApprovals}
          criticalAlerts={criticalAlerts}
        />

        {summary.length > 0 && (
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
            {summary.map((item) => (
              <Card key={item.label}>
                <CardHeader>
                  <CardDescription>{item.label}</CardDescription>
                  <CardTitle className="text-3xl font-black">{item.value}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>

      <PresidentAlertsWidget alerts={alerts} />
    </div>
  );
}
