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

type HostelRow = {
  name: string;
  occupancy_pct: number;
  occupied: number;
  capacity: number;
};

export default function LeadershipInfrastructurePage() {
  const api = useLeadershipApi();
  const [period, setPeriod] = useState<ExecutivePeriod>('year');
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    void api.infrastructure().then(setData).catch(() => setData(null));
  }, [api]);

  const hostels = (data?.hostels as HostelRow[]) ?? [];
  const transport = (data?.transport as { buses_on_route?: number; capacity_utilization_pct?: number }) ?? {};

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <LeadershipPageHeader
        eyebrow="Infrastructure & Operations"
        title="Infrastructure, Assets & Hostels"
        description="Hostel occupancy grid and university transport utilization"
        action={
          <div className="flex flex-col gap-2 sm:items-end">
            <ExecutiveDateRangeFilter value={period} onChange={setPeriod} />
            <ExecutiveExportButton targetId="infrastructure-dashboard" filename="infrastructure-analytics" />
          </div>
        }
      />

      <div id="infrastructure-dashboard" className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TrafficLightKpi
            label="Overall Hostel Occupancy"
            value={`${data?.overall_hostel_occupancy_pct ?? '—'}%`}
            status={(Number(data?.overall_hostel_occupancy_pct ?? 0)) <= 95 ? 'green' : 'yellow'}
          />
          <TrafficLightKpi
            label="Transport Utilization"
            value={`${transport.capacity_utilization_pct ?? '—'}%`}
            status="green"
            sub={`${transport.buses_on_route ?? 0} buses active`}
          />
          <TrafficLightKpi label="Hostels Tracked" value={String(hostels.length)} status="green" />
        </div>

        <LeadershipSectionCard title="Hostel Occupancy Grid">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {hostels.map((h) => (
              <div
                key={h.name}
                className="rounded-xl border border-sgvu-navy/10 p-4"
                style={{ background: `rgba(214, 182, 93, ${0.08 + (h.occupancy_pct / 100) * 0.15})` }}
              >
                <p className="text-xs font-medium text-muted-foreground">{h.name}</p>
                <p className="font-mono text-2xl font-black text-sgvu-navy">{h.occupancy_pct}%</p>
                <p className="text-xs text-muted-foreground">
                  {h.occupied} / {h.capacity} beds
                </p>
              </div>
            ))}
            {hostels.length === 0 ? (
              <p className="col-span-full text-sm text-muted-foreground">No hostel occupancy data available</p>
            ) : null}
          </div>
        </LeadershipSectionCard>
      </div>
    </div>
  );
}
