'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import Link from 'next/link';

const HostelOccupancyChart = dynamic(
  () => import('@/components/hostel/HostelOccupancyChart'),
  { ssr: false, loading: () => <div className="h-full animate-pulse rounded-xl bg-muted" /> },
);
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/lib/notifications/falcon-toast';
import { useAuthedApi } from '@/lib/api';
import { HostelScopeBar } from '@/components/hostel/HostelScopeBar';

type Dashboard = {
  metrics: {
    total_hostels: number;
    total_students: number;
    available_beds: number;
    occupied_percent: number;
    pending_tickets: number;
  };
  occupancy_trend: Array<{ label: string; occupancy_pct: string }>;
  alerts: Array<{ title: string; time: string; type: string }>;
  pending_ticket_banner: boolean;
};

export default function HostelAdminDashboardPage() {
  const api = useAuthedApi();
  const [hostelId, setHostelId] = useState('');
  const [data, setData] = useState<Dashboard | null>(null);
  const [dismissBanner, setDismissBanner] = useState(false);

  useEffect(() => {
    const q = hostelId ? `?hostelId=${hostelId}` : '';
    void api
      .get<Dashboard>(`/api/hostel-admin/dashboard${q}`)
      .then(setData)
      .catch((err) => {
        setData(null);
        const raw = err instanceof Error ? err.message : 'Failed to load dashboard';
        try {
          const parsed = JSON.parse(raw) as { message?: string };
          toast.error(parsed.message ?? raw);
        } catch {
          toast.error(raw);
        }
      });
  }, [api, hostelId]);

  const m = data?.metrics;
  const chartData = (data?.occupancy_trend ?? []).map((r) => ({
    month: r.label,
    occupancy: Number(r.occupancy_pct ?? 0),
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-sgvu-navy">Hostel Dashboard</h1>
          <p className="text-sm text-muted-foreground">Residential operations — occupancy, roll call, and alerts</p>
        </div>
        <HostelScopeBar value={hostelId} onChange={setHostelId} />
      </div>

      {data?.pending_ticket_banner && !dismissBanner && (
        <div className="flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>
            <strong>{m?.pending_tickets ?? 0}</strong> pending hostel support tickets need attention.
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link href="/hostel-admin/tickets">View tickets</Link>
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDismissBanner(true)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total Hostels', value: m?.total_hostels },
          { label: 'Total Students', value: m?.total_students },
          {
            label: 'Available Beds',
            value: m?.available_beds,
            sub: m ? `${m.occupied_percent}% occupied` : undefined,
          },
          { label: 'Pending Tickets', value: m?.pending_tickets, alert: (m?.pending_tickets ?? 0) > 0 },
        ].map((t) => (
          <Card key={t.label} className={t.alert ? 'border-amber-300' : ''}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-black text-sgvu-navy">{t.value ?? '—'}</p>
              {t.sub && <p className="text-xs text-muted-foreground">{t.sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly Hostel Occupancy Trends</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <HostelOccupancyChart data={chartData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Today&apos;s Schedule &amp; Alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.alerts ?? []).map((a) => (
              <div key={a.title} className="flex items-center justify-between rounded-lg border px-3 py-2">
                <span className="font-medium">{a.title}</span>
                <Badge variant="outline">{a.time}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild className="bg-sgvu-navy">
          <Link href="/hostel-admin/attendance">Mark Today&apos;s Attendance</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/hostel-admin/students">Student list</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/hostel-admin/gate-passes">Gate pass desk</Link>
        </Button>
      </div>
    </div>
  );
}
