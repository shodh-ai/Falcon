'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useAuthedApi } from '@/lib/api';
import { LeadershipSectionCard } from '@/components/leadership/LeadershipSectionCard';
import { cn } from '@/lib/utils';

type Profile360 = {
  type: 'student' | 'faculty';
  user: Record<string, unknown>;
  proctor_name?: string | null;
  reporting_hod?: string | null;
  current_semester?: number | null;
  summary: Record<string, unknown>;
  tabs: Record<string, unknown>;
};

const TAB_LABELS: Record<string, string> = {
  academics: 'Academic Health',
  finance: 'Finance Ledger',
  hostel: 'Hostel / Mess',
  discipline: 'Disciplinary',
  ufm: 'UFM Records',
  tickets: 'Helpdesk',
  timetable: 'Timetable',
  leaves: 'Leave Balances',
  appraisal: 'Research / API',
};

export function Profile360View({ userId }: { userId: string }) {
  const api = useAuthedApi();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile360 | null>(null);
  const [tab, setTab] = useState('academics');

  const goBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push('/directory');
  };

  useEffect(() => {
    if (!userId) return;
    void api
      .get<Profile360>(`/api/search/profile/${userId}`)
      .then((p) => {
        setProfile(p);
        setTab(p.type === 'student' ? 'academics' : 'timetable');
      })
      .catch(() => setProfile(null));
  }, [api, userId]);

  if (!profile) {
    return <div className="p-6 text-sm text-muted-foreground">Loading 360° profile…</div>;
  }

  const name = String(profile.user.name);
  const id = String(profile.user.enrollment_no ?? profile.user.employee_id ?? '—');
  const email = String(profile.user.official_email ?? '—');
  const roleLine = `${String(profile.user.role_name)} · ${String(profile.user.dept_name ?? 'University-wide')}`;
  const tabs = Object.keys(profile.tabs).filter((k) => TAB_LABELS[k]);
  const tabData = profile.tabs[tab];

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <button
        type="button"
        onClick={goBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-sgvu-navy"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to previous page
      </button>

      <section className="rounded-2xl border border-sgvu-navy/10 bg-white px-5 py-5 shadow-sm sm:px-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-sgvu-navy text-2xl font-black text-white sm:h-[4.5rem] sm:w-[4.5rem]">
              {name.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-sgvu-gold">360° Directory</p>
              <h1 className="truncate text-xl font-black text-sgvu-navy sm:text-2xl">{name}</h1>
              <p className="truncate text-sm font-medium text-sgvu-navy/80">{id}</p>
              <p className="truncate text-sm text-muted-foreground">{email}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{roleLine}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            {profile.type === 'student' ? (
              <>
                <StatBadge label="Semester" value={String(profile.current_semester ?? '—')} />
                <StatBadge label="Avg CGPA" value={String(profile.summary.avg_cgpa ?? '—')} highlight />
                <StatBadge label="Attendance" value={`${profile.summary.avg_attendance ?? '—'}%`} />
              </>
            ) : (
              <>
                <StatBadge label="Designation" value={String(profile.user.designation ?? '—')} />
                <StatBadge label="API Score" value={String(profile.summary.api_score ?? '—')} highlight />
                <StatBadge label="Reporting HOD" value={String(profile.reporting_hod ?? '—')} />
              </>
            )}
          </div>
        </div>
      </section>

      <div className="flex w-full gap-1 overflow-x-auto rounded-xl border border-sgvu-navy/10 bg-white p-1 shadow-sm">
        {tabs.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'min-w-[7.5rem] flex-1 whitespace-nowrap rounded-lg px-3 py-2.5 text-center text-[10px] font-bold uppercase tracking-wide transition sm:text-[11px]',
              tab === key
                ? 'bg-sgvu-navy text-white shadow-sm'
                : 'text-sgvu-navy/70 hover:bg-sgvu-navy/5 hover:text-sgvu-navy',
            )}
          >
            {TAB_LABELS[key]}
          </button>
        ))}
      </div>

      <LeadershipSectionCard title={TAB_LABELS[tab] ?? tab}>
        <DataTable data={tabData} />
      </LeadershipSectionCard>
    </div>
  );
}

function StatBadge({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border px-3 py-2 text-center sm:min-w-[7rem]',
        highlight ? 'border-sgvu-gold/40 bg-sgvu-gold/10' : 'border-sgvu-navy/10 bg-sgvu-surface/50',
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('text-sm font-black', highlight ? 'text-sgvu-navy' : 'text-sgvu-navy/90')}>{value}</p>
    </div>
  );
}

function DataTable({ data }: { data: unknown }) {
  if (!data) return <p className="text-sm text-muted-foreground">No records.</p>;
  if (!Array.isArray(data)) {
    return (
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        {Object.entries(data as Record<string, unknown>).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 border-b border-sgvu-navy/5 py-2">
            <span className="text-muted-foreground">{k.replace(/_/g, ' ')}</span>
            <span className="font-medium text-sgvu-navy">{String(v ?? '—')}</span>
          </div>
        ))}
      </dl>
    );
  }
  if (data.length === 0) return <p className="text-sm text-muted-foreground">No records.</p>;
  const keys = Object.keys(data[0] as object);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-full text-sm">
        <thead>
          <tr className="border-b border-sgvu-navy/10 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            {keys.map((k) => (
              <th key={k} className="px-4 py-3 font-semibold">
                {k.replace(/_/g, ' ')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b border-sgvu-navy/5 last:border-0">
              {keys.map((k) => (
                <td key={k} className="px-4 py-3 text-sgvu-navy">
                  {String((row as Record<string, unknown>)[k] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
