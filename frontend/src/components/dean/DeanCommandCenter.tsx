'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  GraduationCap,
  Inbox,
  PartyPopper,
  RefreshCw,
  Users,
} from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { HrStatCard } from '@/components/hr/HrStatCard';
import { FalconLoader } from '@/components/brand/FalconLoader';
import {
  HodActionButton,
  HodPageFrame,
  HodPageHeader,
  HodPanel,
} from '@/components/hod/HodPagePrimitives';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';
import { createDeanApi, type DeanCommandCenter as DeanCommandCenterPayload } from '@/lib/api/api.dean';
import { cn } from '@/lib/utils';

function useIstClock() {
  const [now, setNow] = useState('');
  useEffect(() => {
    const tick = () => {
      setNow(
        new Intl.DateTimeFormat('en-IN', {
          timeZone: 'Asia/Kolkata',
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        }).format(new Date()),
      );
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function ProgressBar({ pct, muted }: { pct: number; muted?: boolean }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
      <div
        className={cn('h-full rounded-full', muted ? 'bg-sgvu-navy/40' : 'bg-sgvu-gold')}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function DeanCommandCenter() {
  const api = useAuthedApi();
  const deanApi = useMemo(() => createDeanApi(api), [api]);
  const istNow = useIstClock();
  const [data, setData] = useState<DeanCommandCenterPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const payload = await deanApi.commandCenter();
        setData(payload);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load school command center');
        if (!silent) setData(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [deanApi],
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <HodPageFrame>
        <FalconLoader label="Loading School Command Center…" className="min-h-[40vh]" />
      </HodPageFrame>
    );
  }

  if (!data) {
    return (
      <HodPageFrame>
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <p className="font-semibold text-sgvu-navy">School command center unavailable</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Ensure your Dean account is assigned to a school in IAM hierarchy.
          </p>
          <Button className="bg-sgvu-navy text-white hover:bg-sgvu-navy/90" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      </HodPageFrame>
    );
  }

  const m = data.health_metrics;
  const behindSyllabus = data.syllabus_coverage.filter((r) => r.behind_schedule);
  const schoolLabel =
    data.schools.length > 0 ? data.schools.map((s) => s.school_name).join(', ') : 'Unassigned school';

  return (
    <HodPageFrame>
      <HodPageHeader
        workspaceLabel="Dean Workspace"
        title="School Command Center"
        description="Cross-department academic health, HOD oversight, and school-wide approval queues."
        meta={
          <>
            <span className="font-medium text-sgvu-navy tabular-nums">{istNow || '—'} IST</span>
            <span>·</span>
            <span>{schoolLabel}</span>
            <span>·</span>
            <span>{data.department_count} departments</span>
            <span>·</span>
            <span>{m.total_students} students</span>
            <span>·</span>
            <span>{m.total_faculty} faculty</span>
          </>
        }
        actions={
          <>
            <Button
              size="default"
              variant="outline"
              className="h-9 gap-2 text-sm text-sgvu-navy"
              disabled={refreshing}
              onClick={() => void load(true)}
            >
              <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
              Refresh
            </Button>
            <HodActionButton href="/dean/departments">Department Oversight</HodActionButton>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <HrStatCard
          label="Departments"
          value={data.department_count}
          sub={`${data.hod_count} HODs assigned`}
          icon={Building2}
          accent="navy"
        />
        <HrStatCard
          label="Total Faculty"
          value={m.total_faculty}
          sub={`${m.faculty_on_leave_today} on leave today`}
          icon={Users}
          accent="navy"
        />
        <HrStatCard
          label="School Attendance"
          value={`${m.average_attendance}%`}
          icon={GraduationCap}
          trend={m.attendance_trend_pct}
          trendLabel={m.attendance_trend_label}
          alert={m.average_attendance < 75}
        />
        <HrStatCard
          label="Pending Inbox"
          value={m.pending_inbox_total}
          sub={`${m.pending_leave_count} leaves · ${m.pending_gate_pass_count} gate passes`}
          icon={Inbox}
          accent="gold"
          alert={m.pending_inbox_total > 0}
        />
        <HrStatCard
          label="Event Approvals"
          value={data.pending_events_count}
          sub="Club events awaiting Dean review"
          icon={PartyPopper}
          accent="gold"
          alert={data.pending_events_count > 0}
        />
        <HrStatCard
          label="Syllabus Risk"
          value={behindSyllabus.length}
          sub={behindSyllabus.length ? 'Courses behind schedule' : 'LMS on track'}
          icon={ClipboardList}
          alert={behindSyllabus.length > 0}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { href: '/dean/departments', label: 'Departments' },
          { href: '/dean/academics/timetable', label: 'Timetable' },
          { href: '/dean/faculty/workload', label: 'Workload' },
          { href: '/dean/academics/syllabus-tracking', label: 'Syllabus' },
          { href: '/dean/inbox?scope=dept', label: 'Dean Inbox' },
          { href: '/dean/events', label: 'Events' },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-sgvu-navy shadow-sm transition-colors hover:border-sgvu-gold/50 hover:bg-sgvu-gold/5"
          >
            {link.label}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <HodPanel
          title="Syllabus Coverage"
          count={data.syllabus_coverage.length}
          href="/dean/academics/syllabus-tracking"
          className="lg:col-span-4"
        >
          {data.syllabus_coverage.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No LMS modules yet.</p>
          ) : (
            <ul className="max-h-[360px] space-y-3 overflow-y-auto">
              {data.syllabus_coverage.map((row) => (
                <li
                  key={`${row.course_code}-${row.faculty_name}`}
                  className={cn(
                    'rounded-lg border px-4 py-3',
                    row.behind_schedule ? 'border-sgvu-gold/50 bg-sgvu-gold/5' : 'border-gray-100 bg-slate-50/50',
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-sgvu-navy">{row.course_code}</p>
                      <p className="truncate text-sm text-muted-foreground">{row.faculty_name}</p>
                    </div>
                    <span className="text-lg font-bold tabular-nums text-sgvu-navy">{row.coverage_percent}%</span>
                  </div>
                  <div className="mt-2">
                    <ProgressBar pct={row.coverage_percent} muted={row.behind_schedule} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </HodPanel>

        <HodPanel
          title="Escalations & Approvals"
          count={data.pending_inbox.length}
          href="/dean/inbox?scope=dept"
          className="lg:col-span-5"
        >
          {data.pending_inbox.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <CheckCircle2 className="h-10 w-10 text-sgvu-gold" />
              <p className="text-sm font-semibold text-sgvu-navy">Inbox clear</p>
              <p className="text-sm text-muted-foreground">No school-wide escalations right now.</p>
            </div>
          ) : (
            <ul className="max-h-[360px] space-y-3 overflow-y-auto">
              {data.pending_inbox.slice(0, 8).map((row) => (
                <li
                  key={`${row.type}-${row.id}`}
                  className="rounded-lg border border-gray-100 bg-white px-4 py-3 shadow-sm"
                >
                  <p className="text-sm font-semibold text-sgvu-navy">{row.employee_name}</p>
                  <p className="text-xs text-muted-foreground">{row.title}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{row.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </HodPanel>

        <HodPanel
          title="Attendance Red Flags"
          count={data.attendance_deficits.length}
          href="/dean/students/defaulters"
          className="lg:col-span-3"
        >
          {data.attendance_deficits.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No students below 75%.</p>
          ) : (
            <ul className="space-y-3">
              {data.attendance_deficits.map((row, idx) => (
                <li
                  key={row.user_id}
                  className="flex items-center gap-3 rounded-lg border border-gray-100 bg-slate-50/50 px-4 py-3"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sgvu-navy text-xs font-bold text-white">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-sgvu-navy">{row.name}</p>
                    <p className="truncate text-sm text-muted-foreground">{row.email}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold tabular-nums text-sgvu-navy">{row.average_attendance}%</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </HodPanel>
      </div>

      {m.pending_profile_corrections > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sgvu-gold/30 bg-sgvu-gold/5 px-5 py-3">
          <p className="text-sm text-sgvu-navy">
            <span className="font-bold">{m.pending_profile_corrections}</span> academic profile correction
            {m.pending_profile_corrections === 1 ? '' : 's'} across the school
          </p>
          <Link href="/dean/inbox">
            <Button size="default" variant="outline" className="h-9 border-sgvu-navy/20 text-sm text-sgvu-navy">
              Open Dean inbox
            </Button>
          </Link>
        </div>
      ) : null}
    </HodPageFrame>
  );
}
