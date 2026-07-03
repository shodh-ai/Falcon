'use client';

import { useEffect, useState } from 'react';
import { Calendar, Clock, AlertCircle, TrendingDown, Loader2 } from 'lucide-react';
import { useAuthedApi } from '@/lib/api';
import { useTeamScope } from '@/components/self-service/TeamScopeBar';

type MemberSummary = {
  month: string;
  shift_timing: string | null;
  leaves_taken: number;
  leave_assigned: number;
  leave_balance: number;
  present_days: number;
  working_days: number;
  late_arrivals: number;
  on_time: number;
  avg_working_hours: number;
  trend: Array<{ month: string; present_days: number; avg_hours: number }>;
};

type Props = {
  userId: string;
  memberName: string;
  joiningDate: string;
  probationEnd: string;
  shiftTiming: string;
};

function fmtHours(h: number) {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function fmtMonthLabel(monthKey: string) {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

export function ZimyoEmployeeOverview({
  userId,
  memberName,
  joiningDate,
  probationEnd,
  shiftTiming,
}: Props) {
  const api = useAuthedApi();
  const scope = useTeamScope('dept');
  const [month] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<MemberSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void api
      .get<MemberSummary>(
        `/api/hr/ess/team/member/${userId}/summary?scope=${scope}&month=${month}`,
      )
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [api, userId, month, scope]);

  const monthLabel = new Date().toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const displayShift = data?.shift_timing ?? shiftTiming;
  const maxTrendPresent = Math.max(...(data?.trend.map((t) => t.present_days) ?? [1]), 1);
  const maxTrendHours = Math.max(...(data?.trend.map((t) => t.avg_hours) ?? [1]), 1);

  if (loading) {
    return (
      <div className="py-16 flex items-center justify-center gap-2 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-xs font-bold">Loading employee overview...</span>
      </div>
    );
  }

  const overviewCards = [
    {
      title: 'Leaves',
      value: String(data?.leaves_taken ?? 0),
      label: 'TAKEN',
      sub: `Leaves Assigned: ${(data?.leave_assigned ?? 0).toFixed(2)}`,
      sub2: `Balance: ${(data?.leave_balance ?? 0).toFixed(2)}`,
      icon: <Calendar className="h-5 w-5 text-emerald-600" />,
      bg: 'bg-emerald-50',
    },
    {
      title: 'Attendance',
      value: String(data?.present_days ?? 0),
      label: 'days',
      sub: `Total Working Days: ${data?.working_days ?? 0}`,
      icon: <Clock className="h-5 w-5 text-blue-600" />,
      bg: 'bg-blue-50',
    },
    {
      title: 'Discipline',
      value: `${data?.on_time ?? 0}/${data?.present_days ?? 0}`,
      label: '',
      sub: `${data?.late_arrivals ?? 0} Late Arrival · ${data?.on_time ?? 0} On Time · ${data?.present_days ?? 0} Active Working Days`,
      icon: <AlertCircle className="h-5 w-5 text-amber-600" />,
      bg: 'bg-amber-50',
    },
    {
      title: 'Average Working Hours',
      value: fmtHours(data?.avg_working_hours ?? 0),
      label: 'hrs',
      sub: data ? `${fmtHours(data.avg_working_hours)} this month` : 'No data',
      icon: <TrendingDown className="h-5 w-5 text-rose-600" />,
      bg: 'bg-rose-50',
      trend: false,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-6 text-[10px] text-slate-500 font-semibold bg-slate-50 rounded-xl p-4 border border-slate-100">
        <span>Joining Date: <b className="text-slate-700">{joiningDate}</b></span>
        <span>Probation Completion: <b className="text-slate-700">{probationEnd}</b></span>
        <span>Shift Timing: <b className="text-slate-700">{displayShift}</b></span>
      </div>

      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-slate-800">Overview</h4>
        <span className="text-[10px] text-slate-400 font-bold">{monthLabel}</span>
      </div>

      {!data ? (
        <p className="text-xs text-slate-400 font-bold text-center py-8">
          No attendance data available for this employee yet.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {overviewCards.map((card) => (
              <div key={card.title} className="bg-white border border-slate-100 rounded-2xl shadow-sm p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{card.title}</p>
                  <div className={`h-8 w-8 rounded-lg ${card.bg} flex items-center justify-center`}>{card.icon}</div>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-slate-800">{card.value}</span>
                  {card.label && <span className="text-[10px] text-slate-400 font-bold uppercase">{card.label}</span>}
                </div>
                <p className="text-[10px] font-semibold text-slate-400">{card.sub}</p>
                {card.sub2 && <p className="text-[10px] text-slate-400 font-semibold">{card.sub2}</p>}
              </div>
            ))}
          </div>

          <div>
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4">Trends</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-slate-50/60 p-5 rounded-2xl border border-slate-100 space-y-4">
                <h5 className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Leaves Trend (present days)</h5>
                <div className="h-36 flex items-end justify-around border-b border-slate-200 pb-2">
                  {data.trend.map(({ month: m, present_days }) => (
                    <div key={m} className="flex flex-col items-center gap-1.5 w-16">
                      <div
                        className="w-8 bg-emerald-400 rounded-t-sm"
                        style={{ height: Math.max(8, (present_days / maxTrendPresent) * 120) }}
                      />
                      <span className="text-[10px] text-slate-500 font-bold">{fmtMonthLabel(m)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-slate-50/60 p-5 rounded-2xl border border-slate-100 space-y-4">
                <h5 className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Average working hours trend</h5>
                <div className="h-36 flex items-end justify-around border-b border-slate-200 pb-2">
                  {data.trend.map(({ month: m, avg_hours }) => {
                    const h = Math.max(8, (avg_hours / maxTrendHours) * 120);
                    return (
                      <div key={m} className="flex flex-col items-center gap-1.5 w-16 relative">
                        <span className="text-[9px] font-extrabold text-slate-600 absolute" style={{ bottom: h + 4 }}>
                          {avg_hours.toFixed(2)}
                        </span>
                        <div className="w-8 bg-sky-400 rounded-t-sm" style={{ height: h }} />
                        <span className="text-[10px] text-slate-500 font-bold">{fmtMonthLabel(m)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: 'Full Name', value: memberName },
          { label: 'Joining Date', value: joiningDate },
          { label: 'Probation Ends', value: probationEnd },
          { label: 'Shift Timing', value: displayShift },
        ].map(({ label, value }) => (
          <div key={label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">{label}</p>
            <p className="text-xs text-slate-800 font-bold">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
