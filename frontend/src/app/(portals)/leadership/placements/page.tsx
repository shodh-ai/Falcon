'use client';

import { useEffect, useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { GOLD, NAVY, LeadershipLineChart } from '@/components/leadership/LeadershipCharts';
import { LeadershipPageHeader, LeadershipSectionCard } from '@/components/leadership/LeadershipSectionCard';
import {
  ExecutiveDateRangeFilter,
  ExecutiveExportButton,
  EXECUTIVE_SPACING,
  TrafficLightKpi,
  type ExecutivePeriod,
} from '@/components/leadership/executive';
import { useLeadershipApi, type LeadershipPlacements } from '@/lib/api/api.leadership';

export default function LeadershipPlacementsPage() {
  const api = useLeadershipApi();
  const [period, setPeriod] = useState<ExecutivePeriod>('year');
  const [data, setData] = useState<LeadershipPlacements | null>(null);

  useEffect(() => {
    void api.placements().then(setData).catch(() => setData(null));
  }, [api]);

  const pkg = data?.package_stats;
  const placementStatus =
    (data?.placement_pct ?? 0) >= 70 ? 'green' : (data?.placement_pct ?? 0) >= 50 ? 'yellow' : 'red';

  const gaugeOption = useMemo(
    () => ({
      series: [
        {
          type: 'gauge',
          min: 0,
          max: 100,
          progress: { show: true },
          detail: { formatter: '{value}%', fontSize: 20 },
          data: [{ value: data?.placement_pct ?? 0, name: 'Placement Rate' }],
        },
      ],
    }),
    [data?.placement_pct],
  );

  return (
    <div className={EXECUTIVE_SPACING.page}>
      <LeadershipPageHeader
        eyebrow="Placements & Corporate Relations"
        title="Placements Analytics"
        action={
          <div className="flex flex-col gap-2 sm:items-end">
            <ExecutiveDateRangeFilter value={period} onChange={setPeriod} />
            <ExecutiveExportButton targetId="placements-dashboard" filename="placements-analytics" />
          </div>
        }
      />

      <div id="placements-dashboard" className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TrafficLightKpi
            label="Placement Rate"
            value={`${data?.placement_pct ?? '—'}%`}
            status={placementStatus}
            sub={`${data?.placed_students ?? 0} / ${data?.eligible_students ?? 0} eligible`}
          />
          <TrafficLightKpi label="Internships Secured" value={`${data?.internship_pct ?? 0}%`} status="green" />
          <TrafficLightKpi label="Avg Package (LPA)" value={String(pkg?.avg_lpa ?? '—')} status="green" />
          <TrafficLightKpi label="Median Package (LPA)" value={String(pkg?.median_lpa ?? '—')} status="green" />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <LeadershipSectionCard title="Placement Success Rate">
            <ReactECharts option={gaugeOption} style={{ height: 260, width: '100%' }} opts={{ renderer: 'canvas' }} />
          </LeadershipSectionCard>
          <LeadershipSectionCard title="Package Analytics (LPA)">
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Highest</dt>
                <dd className="font-mono text-2xl font-black text-sgvu-gold">{pkg?.highest_lpa ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Lowest</dt>
                <dd className="font-mono text-2xl font-black text-sgvu-navy">{pkg?.lowest_lpa ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Average</dt>
                <dd className="font-mono text-2xl font-black text-sgvu-navy">{pkg?.avg_lpa ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Median</dt>
                <dd className="font-mono text-2xl font-black text-sgvu-navy">{pkg?.median_lpa ?? '—'}</dd>
              </div>
            </dl>
          </LeadershipSectionCard>
        </div>

        <LeadershipSectionCard title="LPA Trends (5 Years)">
          <LeadershipLineChart
            data={data?.lpa_trends ?? []}
            xKey="year"
            lines={[
              { key: 'avg_lpa', color: NAVY, name: 'Avg LPA' },
              { key: 'highest_lpa', color: GOLD, name: 'Highest LPA' },
            ]}
          />
        </LeadershipSectionCard>

        <LeadershipSectionCard title="Top 10 Corporate Recruiters">
          <div className="space-y-2">
            {(data?.top_recruiters ?? []).map((r, i) => (
              <div
                key={r.company}
                className="flex items-center justify-between rounded-xl border border-sgvu-navy/10 bg-sgvu-surface/50 px-4 py-2.5"
              >
                <span className="text-sm font-medium text-sgvu-navy">
                  #{i + 1} {r.company}
                </span>
                <span className="font-mono text-sm font-semibold text-sgvu-gold">{r.hires} hires</span>
              </div>
            ))}
            {(data?.top_recruiters ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No placement data yet</p>
            ) : null}
          </div>
        </LeadershipSectionCard>
      </div>
    </div>
  );
}
