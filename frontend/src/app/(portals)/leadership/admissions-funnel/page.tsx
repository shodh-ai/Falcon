'use client';

import { useEffect, useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { DefaulterHeatmap } from '@/components/leadership/LeadershipCharts';
import { LeadershipLineChart, NAVY, GOLD } from '@/components/leadership/LeadershipCharts';
import { LeadershipPageHeader, LeadershipSectionCard } from '@/components/leadership/LeadershipSectionCard';
import {
  ExecutiveDateRangeFilter,
  ExecutiveDrillDown,
  ExecutiveExportButton,
  EXECUTIVE_SPACING,
  TrafficLightKpi,
  type ExecutivePeriod,
} from '@/components/leadership/executive';
import { useLeadershipApi, type AdmissionsAnalytics } from '@/lib/api/api.leadership';

export default function LeadershipAdmissionsFunnelPage() {
  const api = useLeadershipApi();
  const [period, setPeriod] = useState<ExecutivePeriod>('year');
  const [data, setData] = useState<AdmissionsAnalytics | null>(null);

  useEffect(() => {
    void api.admissionsAnalytics(period).then(setData).catch(() => setData(null));
  }, [api, period]);

  const funnelOption = useMemo(() => {
    const seriesData = (data?.funnel ?? []).map((d) => ({ name: d.stage, value: d.count }));
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'funnel',
          top: 10,
          bottom: 10,
          left: '10%',
          width: '80%',
          minSize: '30%',
          maxSize: '100%',
          sort: 'descending',
          label: { color: '#08234a', fontSize: 12, fontWeight: 600 },
          data: seriesData.length ? seriesData : [{ name: 'No data', value: 0 }],
        },
      ],
    };
  }, [data?.funnel]);

  const genderOption = useMemo(() => {
    const genders = data?.demographics.gender ?? [];
    return {
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'pie',
          radius: ['40%', '70%'],
          data: genders.map((g) => ({ name: g.gender, value: g.count })),
        },
      ],
    };
  }, [data?.demographics.gender]);

  const demographicsHeatmap = (data?.demographics.by_state ?? []).map((r) => ({
    department: r.region,
    outstanding: r.count,
  }));

  const seatRows = data?.seat_occupancy ?? [];
  const enrolledTotal = (data?.funnel ?? []).find((s) => s.stage.toLowerCase().includes('enroll'))?.count ?? 0;
  const leadsTotal = (data?.funnel ?? [])[0]?.count ?? 0;
  const fillPct = leadsTotal > 0 ? Math.round((enrolledTotal / leadsTotal) * 100) : 0;

  return (
    <div className={EXECUTIVE_SPACING.page}>
      <LeadershipPageHeader
        eyebrow="Admissions & Enrollment"
        title="Admissions & Growth Funnel"
        description="Lead funnel, YoY growth, seat occupancy, demographics, and marketing ROI"
        action={
          <div className="flex flex-col gap-2 sm:items-end">
            <ExecutiveDateRangeFilter value={period} onChange={setPeriod} />
            <ExecutiveExportButton targetId="admissions-dashboard" filename="admissions-analytics" />
          </div>
        }
      />

      <div id="admissions-dashboard" className={EXECUTIVE_SPACING.section}>
        <ExecutiveDrillDown
          label="Admissions Pipeline"
          value={`${fillPct}%`}
          sub={`${enrolledTotal.toLocaleString()} enrolled from ${leadsTotal.toLocaleString()} leads`}
          status={fillPct >= 75 ? 'green' : fillPct >= 50 ? 'yellow' : 'red'}
          chart={
            <ReactECharts option={funnelOption} style={{ height: 360, width: '100%' }} opts={{ renderer: 'canvas' }} />
          }
          details={
            <div className="space-y-3">
              {seatRows.map((row) => (
                <div key={row.program} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                  <span className="w-full truncate text-sm font-medium text-sgvu-navy sm:w-48">{row.program}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-sgvu-surface">
                    <div
                      className={`h-full rounded-full ${row.fill_pct >= 90 ? 'bg-emerald-600' : row.fill_pct >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.min(row.fill_pct, 100)}%` }}
                    />
                  </div>
                  <span className="font-mono text-sm font-semibold text-sgvu-navy">
                    {row.fill_pct}% ({row.enrolled}/{row.capacity || row.enrolled})
                  </span>
                </div>
              ))}
            </div>
          }
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(data?.funnel ?? []).map((stage) => (
            <TrafficLightKpi
              key={stage.stage}
              label={stage.stage}
              value={stage.count.toLocaleString()}
              status={stage.count > 0 ? 'green' : 'yellow'}
            />
          ))}
        </div>

        <LeadershipSectionCard title="Year-over-Year Admissions (5 Years)">
          <LeadershipLineChart
            data={(data?.yoy_growth ?? []) as Record<string, unknown>[]}
            xKey="year"
            lines={[{ key: 'admissions', color: NAVY, name: 'Enrolled' }]}
          />
        </LeadershipSectionCard>

        <div className="grid gap-6 lg:grid-cols-2">
          <LeadershipSectionCard title="Demographics — State-wise Intake">
            {demographicsHeatmap.length > 0 ? (
              <DefaulterHeatmap data={demographicsHeatmap} />
            ) : (
              <p className="text-sm text-muted-foreground">No regional data available</p>
            )}
          </LeadershipSectionCard>
          <LeadershipSectionCard title="Gender Ratio">
            <ReactECharts option={genderOption} style={{ height: 280, width: '100%' }} opts={{ renderer: 'canvas' }} />
          </LeadershipSectionCard>
        </div>

        <LeadershipSectionCard title="Marketing ROI — Conversion by Source">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-2 pr-4">Source</th>
                  <th className="pb-2 pr-4">Leads</th>
                  <th className="pb-2 pr-4">Converted</th>
                  <th className="pb-2">Conversion %</th>
                </tr>
              </thead>
              <tbody>
                {(data?.marketing_roi ?? []).map((row) => (
                  <tr key={row.source} className="border-b border-sgvu-navy/5">
                    <td className="py-2.5 font-medium text-sgvu-navy">{row.source}</td>
                    <td className="py-2.5 font-mono">{row.leads}</td>
                    <td className="py-2.5 font-mono">{row.converted}</td>
                    <td className="py-2.5">
                      <span
                        className={`font-mono font-semibold ${row.conversion_rate_pct >= 10 ? 'text-emerald-600' : row.conversion_rate_pct >= 5 ? 'text-amber-600' : 'text-red-600'}`}
                      >
                        {row.conversion_rate_pct}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </LeadershipSectionCard>
      </div>
    </div>
  );
}
