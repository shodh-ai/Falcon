'use client';

import { Suspense, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { useAuth } from '@/context/AuthContext';
import { getSubdomainFromClient } from '@/lib/tenant';
import { getApiBaseUrl } from '@/lib/api-base-url';
import {
  useTeamScope,
  useTeamScopeCounts,
  scopeTabLabel,
  type TeamScope,
} from '@/components/self-service/TeamScopeBar';

const LIVE_REPORT = {
  id: 'team-attendance',
  title: 'Team Attendance Matrix (Excel)',
  description:
    'Day-wise in/out times, hours, leave markers, and week-offs for every team member in the selected scope and month.',
  filename: (month: string) => `team-attendance-${month}.xlsx`,
} as const;

const COMING_SOON_REPORTS = [
  { title: 'Attendance Summary', description: 'Aggregated monthly present/absent/leave totals per employee.' },
  { title: 'Daily Attendance', description: 'Punch-level daily attendance register.' },
  { title: 'Attendance & Time Logs', description: 'In/out audit trail for punctuality review.' },
  { title: 'Trip and Travel Summary', description: 'Employee travel history with locations and timings.' },
  { title: 'One to One Meeting', description: 'Scheduled and completed one-on-one meetings.' },
  { title: 'Continuous Feedback', description: 'Feedback submissions across the team.' },
  { title: 'Appreciation', description: 'Team recognition and appreciation records.' },
] as const;

type Props = {
  defaultScope?: TeamScope;
};

function ReportsContent({ defaultScope = 'direct' }: Props) {
  const { token } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scope = useTeamScope(defaultScope);
  const scopeCounts = useTeamScopeCounts();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [downloading, setDownloading] = useState(false);

  function setScope(next: TeamScope) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('scope', next);
    params.set('tab', 'reports');
    router.replace(`${pathname}?${params.toString()}`);
  }

  async function downloadReport() {
    if (!token) {
      toast.error('Please sign in to download reports');
      return;
    }
    setDownloading(true);
    try {
      const path = `/api/hr/ess/team/attendance/export?scope=${scope}&month=${month}`;
      const res = await fetch(`${getApiBaseUrl()}${path}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-tenant-subdomain': getSubdomainFromClient(),
        },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = LIVE_REPORT.filename(month);
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Team attendance report downloaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  }

  const scopeTabs: TeamScope[] = ['direct', 'indirect', 'dept'];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex border-b border-slate-200 gap-6 text-sm font-semibold text-slate-400">
          {scopeTabs.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setScope(key)}
              className={`pb-3 border-b-2 transition-all ${scope === key ? 'border-sgvu-navy text-sgvu-navy font-bold' : 'border-transparent hover:text-slate-700'}`}
            >
              {scopeTabLabel(key, scopeCounts)}
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white border border-emerald-100 rounded-2xl shadow-sm p-5 flex flex-col gap-3 hover:shadow-md transition-all ring-1 ring-emerald-50">
          <div className="flex items-start justify-between gap-3">
            <div className="flex gap-3 flex-1">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-slate-800">{LIVE_REPORT.title}</h3>
                  <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                    Live Data
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium mt-1 leading-relaxed">{LIVE_REPORT.description}</p>
              </div>
            </div>
            <button
              onClick={() => void downloadReport()}
              disabled={downloading}
              className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-sgvu-navy hover:text-white hover:border-sgvu-navy transition-all shrink-0 disabled:opacity-50"
              title="Download report"
            >
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {COMING_SOON_REPORTS.map((report) => (
          <div
            key={report.title}
            className="bg-white border border-slate-100 rounded-2xl shadow-sm p-5 flex flex-col gap-3 opacity-90"
          >
            <div className="flex gap-3">
              <FileSpreadsheet className="h-5 w-5 text-slate-300 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-slate-600">{report.title}</h3>
                <p className="text-[11px] text-slate-400 font-medium mt-1 leading-relaxed">{report.description}</p>
              </div>
            </div>
            <span className="text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full w-fit">
              Coming Soon
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ZimyoReportsGrid({ defaultScope = 'direct' }: Props) {
  return (
    <Suspense fallback={<Loader2 className="mx-auto h-8 w-8 animate-spin" />}>
      <ReportsContent defaultScope={defaultScope} />
    </Suspense>
  );
}
