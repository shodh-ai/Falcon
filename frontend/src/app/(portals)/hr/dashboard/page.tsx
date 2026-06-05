'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FalconLoader } from '@/components/brand/FalconLoader';
import { useHrApi } from '@/lib/api/use-hr-api';
import { useHrEntity } from '@/context/HrEntityContext';

type MasterDashboard = {
  headcount_snapshot: {
    total_employees: number;
    new_joiners_this_month: number;
    exits_this_month: number;
  };
  today_attendance: {
    present_pct: number;
    absent_pct: number;
    on_leave_pct: number;
    late_pct: number;
    chart: Array<{ name: string; value: number; pct: number }>;
  };
  pending_actions: {
    leave_approvals: number;
    regularizations: number;
    fnf_clearances: number;
    items: Array<{ label: string; count: number; href: string }>;
  };
  attrition_trend: Array<{ month: string; turnover_pct: number; exits: number }>;
};

const CHART_COLORS = ['#1e3a5f', '#c9a227', '#dc2626', '#f59e0b'];

export default function HrMasterDashboardPage() {
  const api = useHrApi();
  const { entityId } = useHrEntity();
  const [data, setData] = useState<MasterDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void api.get<MasterDashboard>('/api/hr/dashboard/master').then((d) => {
      setData(d);
      setLoading(false);
    });
  }, [api, entityId]);

  if (loading) return <FalconLoader label="Loading HR Master Dashboard…" />;

  const hc = data?.headcount_snapshot;
  const att = data?.today_attendance;
  const pending = data?.pending_actions;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <section>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-sgvu-gold">Falcon HRMS</p>
        <h1 className="mt-1 text-2xl font-black text-sgvu-navy sm:text-3xl">Master HR Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bird&apos;s-eye view of university staff — headcount, live attendance, pending actions, and attrition.
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Total Employees', value: hc?.total_employees, sub: 'Active headcount' },
          { label: 'New Joiners', value: hc?.new_joiners_this_month, sub: 'This month' },
          { label: 'Exits / Resignations', value: hc?.exits_this_month, sub: 'This month', alert: (hc?.exits_this_month ?? 0) > 0 },
        ].map((t) => (
          <Card key={t.label} className={t.alert ? 'border-amber-300' : ''}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-black text-sgvu-navy">{t.value ?? '—'}</p>
              <p className="text-xs text-muted-foreground">{t.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Today&apos;s Live Attendance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3 text-sm">
              <Badge variant="outline">Present {att?.present_pct ?? 0}%</Badge>
              <Badge variant="outline">Absent {att?.absent_pct ?? 0}%</Badge>
              <Badge variant="outline">On Leave {att?.on_leave_pct ?? 0}%</Badge>
              <Badge variant="outline">Late {att?.late_pct ?? 0}%</Badge>
            </div>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={att?.chart ?? []}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                    label={({ name, pct }) => `${name} ${pct}%`}
                  >
                    {(att?.chart ?? []).map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number, name: string, props: { payload?: { pct?: number } }) => [
                    `${v} staff (${props.payload?.pct ?? 0}%)`,
                    name,
                  ]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pending Actions Queue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(pending?.items ?? []).map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm"
              >
                <span>
                  <strong>{item.count}</strong> {item.label}
                </span>
                <Button size="sm" variant="outline" asChild>
                  <Link href={item.href}>Review</Link>
                </Button>
              </div>
            ))}
            {(pending?.items ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">No pending actions — all clear.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Attrition Rate — Last 12 Months</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data?.attrition_trend ?? []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis unit="%" tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => [`${v}%`, 'Turnover']} />
              <Line type="monotone" dataKey="turnover_pct" stroke="#1e3a5f" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
