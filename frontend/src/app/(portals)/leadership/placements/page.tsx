'use client';

import { useEffect, useState } from 'react';
import { GOLD, NAVY, LeadershipLineChart } from '@/components/leadership/LeadershipCharts';
import { LeadershipPageHeader, LeadershipSectionCard } from '@/components/leadership/LeadershipSectionCard';
import { useLeadershipApi } from '@/lib/api/api.leadership';

export default function LeadershipPlacementsPage() {
  const api = useLeadershipApi();
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    void api.placements().then(setData).catch(() => setData(null));
  }, [api]);

  const trends = (data?.lpa_trends as Record<string, unknown>[]) ?? [];
  const recruiters = (data?.top_recruiters as Array<{ company: string; hires: number }>) ?? [];

  return (
    <div className="space-y-6 p-6">
      <LeadershipPageHeader eyebrow="Corporate Relations" title="Placements Analytics" />

      <div className="rounded-[1.25rem] border border-sgvu-navy/10 bg-white p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Placement Rate</p>
        <p className="font-mono text-4xl font-black text-sgvu-navy">{data?.placement_pct ?? '—'}%</p>
      </div>

      <LeadershipSectionCard title="LPA Trends (5 Years)">
        <LeadershipLineChart
          data={trends}
          xKey="year"
          lines={[
            { key: 'avg_lpa', color: NAVY, name: 'Avg LPA' },
            { key: 'highest_lpa', color: GOLD, name: 'Highest LPA' },
          ]}
        />
      </LeadershipSectionCard>

      <LeadershipSectionCard title="Top 5 Corporate Recruiters">
        <div className="space-y-2">
          {recruiters.map((r, i) => (
            <div key={r.company} className="flex items-center justify-between rounded-xl border border-sgvu-navy/10 bg-sgvu-surface/50 px-4 py-2.5">
              <span className="text-sm font-medium text-sgvu-navy">
                #{i + 1} {r.company}
              </span>
              <span className="font-mono text-sm font-semibold text-sgvu-gold">{r.hires} hires</span>
            </div>
          ))}
          {recruiters.length === 0 ? <p className="text-sm text-muted-foreground">No placement data yet</p> : null}
        </div>
      </LeadershipSectionCard>
    </div>
  );
}
