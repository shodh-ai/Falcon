'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  Clock,
  Calendar,
  TrendingDown,
  TrendingUp,
  Users,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { useAuthedApi } from '@/lib/api';
import { useTeamScope, useTeamScopeCounts, scopeTabLabel, type TeamScope } from '@/components/self-service/TeamScopeBar';

type DashboardPayload = {
  scope: string;
  month: string;
  team_size: number;
  metrics: {
    avg_working_hours: number;
    avg_leave_taken: number;
    avg_early_going_pct: number;
    avg_late_arrival_pct: number;
    attendance_pct: number;
  };
  leaderboard: {
    on_time_arrival: Array<{ name: string; user_id: string; on_time_days: number }>;
    least_leaves: Array<{ name: string; user_id: string; leave_days: number }>;
    top_working_hours: Array<{ name: string; user_id: string; avg_hours: string }>;
    lowest_working_hours: Array<{ name: string; user_id: string; avg_hours: string }>;
  };
  need_attention: {
    most_leaves: Array<{ name: string; user_id: string; cnt: number }>;
    unplanned_leaves: Array<{ name: string; user_id: string; cnt: number }>;
    late_early_anomalies: Array<{ name: string; user_id: string; anomaly_count: number }>;
  };
};

type Props = {
  defaultScope?: TeamScope;
};

function fmtHours(h: number) {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')} hr`;
}

function LeaderboardCard({
  title,
  items,
  valueKey,
  valueSuffix,
  emptyMsg,
}: {
  title: string;
  items: Array<{ name: string; [key: string]: string | number }>;
  valueKey: string;
  valueSuffix: string;
  emptyMsg: string;
}) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-5 space-y-4">
      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">{title}</h4>
      {items.length === 0 ? (
        <div className="py-8 flex flex-col items-center gap-2 text-center">
          <Users className="h-8 w-8 text-slate-200" />
          <p className="text-[10px] text-slate-400 font-bold">{emptyMsg}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={String(item.user_id ?? idx)} className="flex items-center gap-3 py-1.5">
              <span className="text-[10px] font-extrabold text-slate-400 w-5">#{idx + 1}</span>
              <div className="h-8 w-8 rounded-full bg-sgvu-navy/10 text-sgvu-navy font-bold flex items-center justify-center text-[9px] border border-sgvu-navy/10 shrink-0">
                {String(item.name).split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-800 truncate">{item.name}</p>
              </div>
              <span className="text-[10px] font-extrabold text-sgvu-navy bg-sgvu-navy/5 px-2 py-0.5 rounded-full">
                {item[valueKey]} {valueSuffix}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DashboardContent({ defaultScope = 'direct' }: Props) {
  const api = useAuthedApi();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scope = useTeamScope(defaultScope);
  const scopeCounts = useTeamScopeCounts();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function setScope(next: TeamScope) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('scope', next);
    router.replace(`${pathname}?${params.toString()}`);
  }

  useEffect(() => {
    setLoading(true);
    setError(null);
    setData(null);
    void api
      .get<DashboardPayload>(`/api/hr/ess/team/dashboard?scope=${scope}&month=${month}`)
      .then(setData)
      .catch((err) => {
        setData(null);
        setError(err instanceof Error ? err.message : 'Failed to load team dashboard');
      })
      .finally(() => setLoading(false));
  }, [api, scope, month]);

  const m = data?.metrics;
  const sparseData = m && m.attendance_pct === 0 && m.avg_working_hours === 0;

  const scopeTabs: { key: TeamScope; label: string }[] = [
    { key: 'direct', label: scopeTabLabel('direct', scopeCounts) },
    { key: 'indirect', label: scopeTabLabel('indirect', scopeCounts) },
    { key: 'dept', label: scopeTabLabel('dept', scopeCounts) },
  ];

  const metricCards = [
    {
      label: 'Average working hours',
      value: m ? fmtHours(m.avg_working_hours) : '--',
      icon: <Clock className="h-5 w-5" />,
      bg: 'bg-blue-50',
      text: 'text-blue-600',
    },
    {
      label: 'Average leave taken',
      value: m && m.avg_leave_taken > 0 ? m.avg_leave_taken.toFixed(2) : '--',
      icon: <Calendar className="h-5 w-5" />,
      bg: 'bg-emerald-50',
      text: 'text-emerald-600',
    },
    {
      label: 'Average early going',
      value: m ? m.avg_early_going_pct.toFixed(2) : '--',
      icon: <TrendingDown className="h-5 w-5" />,
      bg: 'bg-amber-50',
      text: 'text-amber-600',
    },
    {
      label: 'Average late arrival',
      value: m ? m.avg_late_arrival_pct.toFixed(2) : '--',
      icon: <TrendingUp className="h-5 w-5" />,
      bg: 'bg-rose-50',
      text: 'text-rose-600',
    },
    {
      label: 'Attendance',
      value: m ? `${m.attendance_pct.toFixed(2)}%` : '--',
      icon: <Users className="h-5 w-5" />,
      bg: 'bg-violet-50',
      text: 'text-violet-600',
    },
  ];

  const attentionCards = [
    {
      title: 'Most Leaves Taken',
      items: data?.need_attention.most_leaves ?? [],
      valueKey: 'cnt',
      suffix: 'days',
      empty: 'No Leaves Taken By Your Team During This Period.',
    },
    {
      title: 'Most Unplanned Leaves',
      items: data?.need_attention.unplanned_leaves ?? [],
      valueKey: 'cnt',
      suffix: 'days',
      empty: 'No Unplanned Leaves Taken By Your Team During This Period.',
    },
    {
      title: 'Lowest average working hours',
      items: data?.leaderboard.lowest_working_hours ?? [],
      valueKey: 'avg_hours',
      suffix: 'hrs',
      empty: 'No Data Found.',
    },
    {
      title: 'Highest early leaving Incidents',
      items: (data?.need_attention.late_early_anomalies ?? []).filter(
        (item) => Number(item.anomaly_count) > 0,
      ).slice(0, 3),
      valueKey: 'anomaly_count',
      suffix: 'count',
      empty: "There Hasn't Been Any Early Leaving Incidents In Your Team.",
    },
    {
      title: 'Highest late arrival incidents',
      items: data?.need_attention.late_early_anomalies ?? [],
      valueKey: 'anomaly_count',
      suffix: 'count',
      empty: 'No late arrival incidents found.',
    },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex border-b border-slate-200 gap-6 text-sm font-semibold text-slate-400">
          {scopeTabs.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setScope(key)}
              className={`pb-3 border-b-2 transition-all ${scope === key ? 'border-sgvu-navy text-sgvu-navy font-bold' : 'border-transparent hover:text-slate-700'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 font-bold text-slate-600 bg-white focus:outline-none focus:ring-1 focus:ring-sgvu-navy"
        />
      </div>

      {loading ? (
        <div className="py-16 flex items-center justify-center gap-2 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-xs font-bold">Loading team analytics...</span>
        </div>
      ) : error ? (
        <div className="py-12 text-center space-y-2 rounded-2xl border border-rose-100 bg-rose-50/40">
          <p className="text-sm font-bold text-rose-700">Could not load dashboard</p>
          <p className="text-xs text-rose-600/80">{error}</p>
        </div>
      ) : (
        <>
          {sparseData && (
            <div className="rounded-2xl border border-amber-100 bg-amber-50/60 px-4 py-3 text-xs font-semibold text-amber-900">
              No punch hours recorded for this month/scope yet. Open{' '}
              <button
                type="button"
                className="font-bold text-sgvu-navy underline underline-offset-2"
                onClick={() => {
                  const params = new URLSearchParams(searchParams.toString());
                  params.set('tab', 'attendance');
                  router.replace(`${pathname}?${params.toString()}`);
                }}
              >
                Spreadsheet Tracker
              </button>{' '}
              to see day-wise Absent / Present status from attendance records.
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {metricCards.map(({ label, value, icon, bg, text }) => (
              <div key={label} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-3">
                <div className="flex items-start justify-between">
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider leading-tight">{label}</p>
                  <div className={`h-8 w-8 rounded-lg ${bg} ${text} flex items-center justify-center shrink-0`}>{icon}</div>
                </div>
                <h3 className="text-xl font-bold text-slate-800">{value}</h3>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <LeaderboardCard
              title="On time arrival"
              items={data?.leaderboard.on_time_arrival ?? []}
              valueKey="on_time_days"
              valueSuffix="days"
              emptyMsg="No Employees Here"
            />
            <LeaderboardCard
              title="Least leaves taken"
              items={data?.leaderboard.least_leaves ?? []}
              valueKey="leave_days"
              valueSuffix="days"
              emptyMsg="No Employees Here"
            />
            <LeaderboardCard
              title="Average working hrs"
              items={data?.leaderboard.top_working_hours ?? []}
              valueKey="avg_hours"
              valueSuffix="hrs"
              emptyMsg="No Employees Here"
            />
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Need Attention
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {attentionCards.map(({ title, items, valueKey, suffix, empty }) => (
                <div key={title} className="bg-white border border-slate-100 rounded-2xl shadow-sm p-4 space-y-3">
                  <h4 className="text-[10px] font-bold text-slate-600 uppercase tracking-wider leading-tight">{title}</h4>
                  {items.length === 0 ? (
                    <p className="text-[10px] text-slate-400 font-medium leading-relaxed">{empty}</p>
                  ) : (
                    <div className="space-y-2">
                      {items.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-sgvu-navy/10 text-sgvu-navy font-bold flex items-center justify-center text-[8px] shrink-0">
                            {String(item.name).substring(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold text-slate-700 truncate">{item.name}</p>
                          </div>
                          <span className="text-[9px] font-extrabold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-full">
                            {String((item as Record<string, string | number>)[valueKey])} {suffix}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function ZimyoTeamDashboard(props: Props) {
  return (
    <Suspense
      fallback={
        <div className="py-16 flex items-center justify-center gap-2 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-xs font-bold">Loading dashboard...</span>
        </div>
      }
    >
      <DashboardContent {...props} />
    </Suspense>
  );
}
