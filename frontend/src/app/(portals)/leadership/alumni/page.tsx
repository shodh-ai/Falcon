'use client';

import { useEffect, useState } from 'react';
import { LeadershipPageHeader, LeadershipSectionCard } from '@/components/leadership/LeadershipSectionCard';
import {
  ExecutiveDateRangeFilter,
  ExecutiveExportButton,
  TrafficLightKpi,
  type ExecutivePeriod,
} from '@/components/leadership/executive';
import { useLeadershipApi } from '@/lib/api/api.leadership';

type Achievement = {
  name: string;
  designation: string;
  organization: string;
  batch: string;
};

export default function LeadershipAlumniPage() {
  const api = useLeadershipApi();
  const [period, setPeriod] = useState<ExecutivePeriod>('year');
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    void api.alumniSummary().then(setData).catch(() => setData(null));
  }, [api]);

  const achievements = (data?.notable_achievements as Achievement[]) ?? [];
  const funds = Number(data?.funds_raised_fy ?? 0);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <LeadershipPageHeader
        eyebrow="Alumni & Fundraising"
        title="Alumni Engagement & Legacy"
        action={
          <div className="flex flex-col gap-2 sm:items-end">
            <ExecutiveDateRangeFilter value={period} onChange={setPeriod} />
            <ExecutiveExportButton targetId="alumni-dashboard" filename="alumni-analytics" />
          </div>
        }
      />

      <div id="alumni-dashboard" className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TrafficLightKpi
            label="Active Alumni (Portal)"
            value={String(data?.active_alumni ?? '—')}
            status={(Number(data?.active_alumni ?? 0)) > 0 ? 'green' : 'yellow'}
          />
          <TrafficLightKpi
            label="Funds Raised (FY)"
            value={`₹${(funds / 100000).toFixed(2)}L`}
            status={funds > 0 ? 'green' : 'yellow'}
          />
          <TrafficLightKpi label="Notable Achievements" value={String(achievements.length)} status="green" />
        </div>

        <LeadershipSectionCard title="Notable Placements & Achievements" description="Career milestone ticker">
          <div className="space-y-2">
            {achievements.length === 0 ? (
              <p className="text-sm text-muted-foreground">No notable alumni milestones recorded yet</p>
            ) : (
              achievements.map((a) => (
                <div
                  key={`${a.name}-${a.organization}`}
                  className="rounded-xl border border-sgvu-gold/30 bg-gradient-to-r from-sgvu-gold/10 to-transparent px-4 py-3"
                >
                  <p className="font-semibold text-sgvu-navy">{a.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {a.designation} · {a.organization}
                    {a.batch ? ` · Batch ${a.batch}` : ''}
                  </p>
                </div>
              ))
            )}
          </div>
        </LeadershipSectionCard>
      </div>
    </div>
  );
}
