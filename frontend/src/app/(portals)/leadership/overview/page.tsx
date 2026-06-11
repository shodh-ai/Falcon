'use client';

import { useEffect, useState } from 'react';
import { AttendanceDrillDown } from '@/components/leadership/AttendanceDrillDown';
import { LiveTickerRow } from '@/components/leadership/LiveTicker';
import { LeadershipPageHeader, LeadershipSectionCard } from '@/components/leadership/LeadershipSectionCard';
import { useLeadershipApi, type LeadershipOverview } from '@/lib/api/api.leadership';

export default function LeadershipOverviewPage() {
  const api = useLeadershipApi();
  const [data, setData] = useState<LeadershipOverview | null>(null);

  useEffect(() => {
    void api.overview().then(setData).catch(() => setData(null));
  }, [api]);

  const tickers = data?.tickers;

  return (
    <div className="space-y-6 p-6">
      <LeadershipPageHeader
        eyebrow="Global Command Center"
        title="University Executive Overview"
        description={
          data?.refreshed_at
            ? `Read-only analytics · Materialized views refreshed nightly at 2:00 AM · Last sync: ${new Date(data.refreshed_at).toLocaleString()}`
            : 'Read-only analytics · Materialized views refreshed nightly at 2:00 AM'
        }
      />

      <LiveTickerRow
        items={[
          { label: 'Total Students', value: tickers?.total_students?.toLocaleString() ?? '—' },
          { label: 'Total Faculty', value: tickers?.total_faculty?.toLocaleString() ?? '—' },
          {
            label: 'Revenue Collected Today',
            value: tickers ? `₹${(tickers.revenue_today / 100000).toFixed(2)}L` : '—',
          },
          {
            label: 'Campus Attendance Today',
            value: tickers ? `${tickers.campus_attendance_today}%` : '—',
            alert: (tickers?.campus_attendance_today ?? 100) < 75,
          },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <LeadershipSectionCard title="Live Campus Feed" description="Redis-backed counters" className="lg:col-span-1">
          <ul className="space-y-3 text-sm">
            <li className="flex justify-between">
              <span className="text-muted-foreground">Library scans today</span>
              <span className="font-mono font-semibold text-sgvu-navy">{data?.live.library_scans_today ?? '—'}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">Buses on route</span>
              <span className="font-mono font-semibold text-sgvu-navy">{data?.live.buses_on_route ?? '—'}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">Fee defaulters</span>
              <span className="font-mono font-semibold text-red-600">{data?.fee_defaulter_count ?? '—'}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">Avg enrollment attendance</span>
              <span className="font-mono font-semibold text-sgvu-navy">{data?.avg_attendance ?? '—'}%</span>
            </li>
          </ul>
        </LeadershipSectionCard>
        <div className="lg:col-span-2">
          <AttendanceDrillDown />
        </div>
      </div>
    </div>
  );
}
