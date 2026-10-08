'use client';

import Link from 'next/link';
import { TrendingDown, TrendingUp } from 'lucide-react';
import {
  HodDataTable,
  HodMetricChip,
  HodPanel,
} from '@/components/hod/HodPagePrimitives';
import { HrStatCard } from '@/components/hr/HrStatCard';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { cn } from '@/lib/utils';

type SchoolHealth = {
  score: number;
  color: 'green' | 'yellow' | 'red';
  trend_delta: number;
  trend_label: string;
  trend_direction: 'up' | 'down' | 'flat';
};

type DeptRanking = {
  rank: number;
  dept_id: number;
  department: string;
  health_score: number;
  trend: 'up' | 'down' | 'flat';
};

type AlertRow = {
  id: string;
  priority: 'critical' | 'warning' | 'information';
  title: string;
  detail: string;
  href?: string;
};

type Recommendation = {
  id: string;
  title: string;
  detail: string;
  href?: string;
};

function healthTextClass(color: SchoolHealth['color']) {
  if (color === 'green') return 'text-emerald-600';
  if (color === 'yellow') return 'text-amber-600';
  return 'text-red-600';
}

function alertBadgeClass(priority: AlertRow['priority']) {
  if (priority === 'critical') return 'bg-red-100 text-red-800';
  if (priority === 'warning') return 'bg-amber-100 text-amber-800';
  return 'bg-slate-100 text-slate-700';
}

export function DeanIntelligencePanels({
  schoolHealth,
  departmentRankings,
  alerts,
  recommendations,
  attendanceTrend = [],
}: {
  schoolHealth: SchoolHealth;
  departmentRankings: DeptRanking[];
  alerts: AlertRow[];
  recommendations: Recommendation[];
  attendanceTrend?: Array<{ week: string; attendance: number; target: number }>;
}) {
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        <HrStatCard
          label="School Health"
          value={`${schoolHealth.score}/100`}
          sub="Composite school health score"
          trend={schoolHealth.trend_delta}
          trendLabel={schoolHealth.trend_label}
          alert={schoolHealth.color === 'red'}
        />
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm lg:col-span-2">
          <p className="text-sm font-medium text-muted-foreground">Health status</p>
          <p className={cn('mt-2 text-2xl font-black', healthTextClass(schoolHealth.color))}>
            {schoolHealth.color === 'green'
              ? 'Healthy'
              : schoolHealth.color === 'yellow'
                ? 'Needs attention'
                : 'At risk'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <HodMetricChip label="Score" value={schoolHealth.score} emphasis />
            <span
              className={cn(
                'inline-flex items-center gap-1 text-sm font-medium',
                schoolHealth.trend_direction === 'up'
                  ? 'text-emerald-600'
                  : 'text-red-600',
              )}
            >
              {schoolHealth.trend_direction === 'up' ? (
                <TrendingUp className="h-4 w-4" />
              ) : (
                <TrendingDown className="h-4 w-4" />
              )}
              {schoolHealth.trend_label}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <HodPanel title="Department Ranking">
          <HodDataTable
            columns={[
              { key: 'rank', label: 'Rank', render: (r) => String(r.rank) },
              { key: 'dept', label: 'Department', render: (r) => r.department },
              {
                key: 'score',
                label: 'Health Score',
                render: (r) => `${r.health_score}`,
              },
              {
                key: 'trend',
                label: 'Trend',
                render: (r) =>
                  r.trend === 'up' ? '▲' : r.trend === 'down' ? '▼' : '—',
              },
            ]}
            rows={departmentRankings}
            rowKey={(r) => String(r.dept_id)}
          />
        </HodPanel>

        <HodPanel title="Academic Alerts">
          {alerts.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No active alerts.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {alerts.map((alert) => (
                <li key={alert.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-medium text-sgvu-navy">{alert.title}</p>
                    <p className="text-muted-foreground">{alert.detail}</p>
                    {alert.href ? (
                      <Link href={alert.href} className="text-xs font-semibold text-sgvu-navy hover:underline">
                        Review →
                      </Link>
                    ) : null}
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold capitalize',
                      alertBadgeClass(alert.priority),
                    )}
                  >
                    {alert.priority}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </HodPanel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <HodPanel title="Smart Recommendations">
          {recommendations.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No recommendations right now.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {recommendations.map((rec) => (
                <li key={rec.id} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                  <p className="font-medium text-sgvu-navy">{rec.title}</p>
                  <p className="text-muted-foreground">{rec.detail}</p>
                  {rec.href ? (
                    <Link href={rec.href} className="text-xs font-semibold text-sgvu-navy hover:underline">
                      Take action →
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </HodPanel>

        <HodPanel title="Attendance Trend">
          {attendanceTrend.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No trend data yet.</p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={attendanceTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="attendance" stroke="#1e3a5f" fill="#1e3a5f33" />
                  <Area type="monotone" dataKey="target" stroke="#c9a227" fill="transparent" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </HodPanel>
      </div>
    </>
  );
}
