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
import { UserMinus, UserPlus, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FalconLoader } from '@/components/brand/FalconLoader';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { HrStatCard } from '@/components/hr/HrStatCard';
import { HrEmptyState } from '@/components/hr/HrEmptyState';
import { useHrApi } from '@/lib/api/use-hr-api';
import { useHrEntity } from '@/context/HrEntityContext';

type MasterDashboard = {
  headcount_snapshot: {
    total_employees: number;
    new_joiners_this_month: number;
    exits_this_month: number;
  };
  today_attendance: {
    total_staff: number;
    present: number;
    absent: number;
    on_leave: number;
    late: number;
    unmarked: number;
    present_pct: number;
    absent_pct: number;
    on_leave_pct: number;
    late_pct: number;
    unmarked_pct: number;
    chart: Array<{ name: string; value: number; pct: number; color: string }>;
  };
  pending_actions: {
    leave_approvals: number;
    regularizations: number;
    fnf_clearances: number;
    items: Array<{ label: string; count: number; href: string }>;
  };
  attrition_trend: Array<{ month: string; turnover_pct: number; exits: number }>;
};

const ATTENDANCE_STATS = [
  { key: 'present_pct' as const, countKey: 'present' as const, label: 'Present', color: '#1e3a5f', bg: 'bg-sgvu-navy/8' },
  { key: 'absent_pct' as const, countKey: 'absent' as const, label: 'Absent', color: '#c9a227', bg: 'bg-sgvu-gold/15' },
  { key: 'on_leave_pct' as const, countKey: 'on_leave' as const, label: 'On Leave', color: '#dc2626', bg: 'bg-red-50' },
  { key: 'unmarked_pct' as const, countKey: 'unmarked' as const, label: 'Unmarked', color: '#94a3b8', bg: 'bg-slate-100' },
];

export default function HrMasterDashboardPage() {
  const api = useHrApi();
  const { entityReady, loading: entityLoading, entities } = useHrEntity();
  const [data, setData] = useState<MasterDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!entityReady) return;
    setLoading(true);
    setError(null);
    void api
      .get<MasterDashboard>('/api/hr/dashboard/master')
      .then((d) => setData(d))
      .catch((e: unknown) => {
        setData(null);
        setError(e instanceof Error ? e.message : 'Failed to load dashboard');
      })
      .finally(() => setLoading(false));
  }, [api, entityReady]);

  if (entityLoading || (entityReady && loading && !data && !error)) {
    return <FalconLoader label="Loading HR Master Dashboard…" />;
  }

  if (!entityReady) {
    return (
      <>
        <p className="text-lg font-semibold text-sgvu-navy">Organization entity required</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {entities.length === 0
            ? 'No organization entity is assigned to your account. Contact your Super Admin.'
            : 'Select an organization from the entity switcher in the header, then reload this page.'}
        </p>
      </>
    );
  }

  if (error) {
    return (
      <>
        <p className="text-lg font-semibold text-red-700">Could not load dashboard</p>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
      </>
    );
  }

  const hc = data?.headcount_snapshot;
  const att = data?.today_attendance;
  const pending = data?.pending_actions;
  const attrition = data?.attrition_trend ?? [];
  const lastTurnover = attrition[attrition.length - 1]?.turnover_pct ?? 0;
  const prevTurnover = attrition[attrition.length - 2]?.turnover_pct ?? lastTurnover;
  const turnoverDelta = Math.round((lastTurnover - prevTurnover) * 10) / 10;

  return (
    <>
      <HrPageHeader
        title="Master HR Dashboard"
        description="Bird's-eye view of university staff — headcount, live attendance, pending actions, and attrition."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <HrStatCard
          label="Total Employees"
          value={hc?.total_employees ?? '—'}
          sub="Active headcount"
          icon={Users}
          accent="navy"
        />
        <HrStatCard
          label="New Joiners"
          value={hc?.new_joiners_this_month ?? 0}
          sub="This month"
          icon={UserPlus}
          trendLabel={
            (hc?.new_joiners_this_month ?? 0) > 0
              ? `↑ ${hc?.new_joiners_this_month} added this month`
              : 'No new joiners yet'
          }
          trend={(hc?.new_joiners_this_month ?? 0) > 0 ? 1 : 0}
        />
        <HrStatCard
          label="Exits / Resignations"
          value={hc?.exits_this_month ?? 0}
          sub="This month"
          icon={UserMinus}
          alert={(hc?.exits_this_month ?? 0) > 0}
          trend={-turnoverDelta}
          trendLabel={`${turnoverDelta >= 0 ? '↑' : '↓'} ${Math.abs(turnoverDelta)}% turnover vs prior month`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden border-sgvu-navy/10">
          <CardHeader className="border-b bg-gradient-to-r from-slate-50 to-white pb-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Today&apos;s Live Attendance</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {att?.total_staff ?? 0} active staff · mutually exclusive buckets (sums to 100%)
                </p>
              </div>
              {(att?.late ?? 0) > 0 && (
                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                  {att?.late} late arrival{att?.late === 1 ? '' : 's'} (within Present)
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ATTENDANCE_STATS.map((stat) => (
                <div
                  key={stat.label}
                  className={`rounded-xl border border-border/60 px-3 py-2.5 ${stat.bg}`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: stat.color }} />
                    <span className="text-xs font-medium text-muted-foreground">{stat.label}</span>
                  </div>
                  <p className="mt-1 text-xl font-black text-sgvu-navy">{att?.[stat.key] ?? 0}%</p>
                  <p className="text-xs text-muted-foreground">{att?.[stat.countKey] ?? 0} staff</p>
                </div>
              ))}
            </div>

            <div className="relative mt-6 h-56 sm:h-64">
              {(att?.chart ?? []).length === 0 ? (
                <div className="flex h-full items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
                  No attendance data recorded yet today.
                </div>
              ) : (
                <>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-3xl font-black text-sgvu-navy">{att?.present_pct ?? 0}%</p>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Present</p>
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={att?.chart ?? []}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius="58%"
                        outerRadius="82%"
                        paddingAngle={3}
                        stroke="none"
                      >
                        {(att?.chart ?? []).map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          borderRadius: '12px',
                          border: '1px solid #e2e8f0',
                          boxShadow: '0 4px 12px rgba(8,35,74,0.08)',
                        }}
                        formatter={(v: number, name: string, props: { payload?: { pct?: number } }) => [
                          `${v} staff · ${props.payload?.pct ?? 0}%`,
                          name,
                        ]}
                      />
                      <Legend
                        verticalAlign="bottom"
                        iconType="circle"
                        wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </>
              )}
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
                className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3 text-sm transition-colors hover:bg-gray-50"
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
              <HrEmptyState
                title="No pending actions"
                description="You're all caught up — nothing awaiting HR review right now."
              />
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
    </>
  );
}
