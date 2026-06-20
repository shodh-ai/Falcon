'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  GraduationCap,
  Inbox,
  Loader2,
  RefreshCw,
  Users,
} from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { HrAvatar } from '@/components/hr/HrAvatar';
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
import { cn } from '@/lib/utils';
import { TodayBirthdaysWidget } from '@/components/dashboard/TodayBirthdaysWidget';

type HealthMetrics = {
  total_faculty: number;
  faculty_present_today: number;
  faculty_on_leave_today: number;
  total_students: number;
  classes_scheduled_today: number;
  classes_cancelled_today: number;
  classes_rescheduled_today: number;
  average_attendance: number;
  attendance_trend_pct: number;
  attendance_trend_label: string;
  pending_leave_count: number;
  pending_gate_pass_count: number;
  pending_profile_corrections: number;
  pending_inbox_total: number;
};

type SyllabusRow = {
  course_code: string;
  course_name: string;
  faculty_name: string;
  coverage_percent: number;
  behind_schedule: boolean;
  days_behind?: number;
};

type InboxRow = {
  id: string;
  type: string;
  title: string;
  employee_name: string;
  date_label: string;
  detail: string;
};

type DeficitRow = {
  user_id: string;
  name: string;
  email: string;
  average_attendance: number;
  course_count: number;
};

type CommandCenterPayload = {
  health_metrics: HealthMetrics;
  syllabus_coverage: SyllabusRow[];
  pending_inbox: InboxRow[];
  attendance_deficits: DeficitRow[];
};

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

export function HodCommandCenter() {
  const api = useAuthedApi();
  const istNow = useIstClock();
  const [data, setData] = useState<CommandCenterPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const payload = await api.get<CommandCenterPayload>('/api/academics/hod/command-center');
        setData(payload);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load command center');
        if (!silent) setData(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [api],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function actOnInbox(row: InboxRow, action: 'APPROVE' | 'REJECT') {
    setActingId(row.id);
    const previous = data;
    if (previous) {
      setData({
        ...previous,
        pending_inbox: previous.pending_inbox.filter((item) => item.id !== row.id),
        health_metrics: {
          ...previous.health_metrics,
          pending_inbox_total: Math.max(0, previous.health_metrics.pending_inbox_total - 1),
          pending_leave_count:
            row.type === 'LEAVE'
              ? Math.max(0, previous.health_metrics.pending_leave_count - 1)
              : previous.health_metrics.pending_leave_count,
          pending_gate_pass_count:
            row.type === 'GATE_PASS'
              ? Math.max(0, previous.health_metrics.pending_gate_pass_count - 1)
              : previous.health_metrics.pending_gate_pass_count,
        },
      });
    }
    try {
      if (row.type === 'LEAVE') {
        if (action === 'APPROVE') {
          await api.patch(`/api/hr/leaves/${row.id}/approve`, {});
        } else {
          await api.patch(`/api/hr/leaves/${row.id}/reject`, { remarks: 'Rejected from HOD dashboard' });
        }
      } else if (row.type === 'GATE_PASS') {
        await api.patch(`/api/hr/gate-passes/${row.id}/action`, {
          status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        });
      } else {
        await api.patch(`/api/academics/hod/approvals/extra-classes/${row.id}`, {
          action,
          remarks: action === 'REJECT' ? 'Rejected from HOD dashboard' : undefined,
        });
      }
      toast.success(action === 'APPROVE' ? 'Approved' : 'Rejected');
      void load(true);
    } catch (e) {
      if (previous) setData(previous);
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActingId(null);
    }
  }

  const facultyPulse = useMemo(() => {
    if (!data) return null;
    const m = data.health_metrics;
    const total = Math.max(m.total_faculty, 1);
    return {
      presentPct: Math.round((m.faculty_present_today / total) * 100),
      leavePct: Math.round((m.faculty_on_leave_today / total) * 100),
      otherPct: Math.max(0, 100 - Math.round((m.faculty_present_today / total) * 100) - Math.round((m.faculty_on_leave_today / total) * 100)),
      ...m,
    };
  }, [data]);

  if (loading) {
    return (
      <HodPageFrame>
        <FalconLoader label="Loading Department Command Center…" className="min-h-[40vh]" />
      </HodPageFrame>
    );
  }

  if (!data) {
    return (
      <HodPageFrame>
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <p className="font-semibold text-sgvu-navy">Command center unavailable</p>
          <Button className="bg-sgvu-navy text-white hover:bg-sgvu-navy/90" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      </HodPageFrame>
    );
  }

  const m = data.health_metrics;
  const behindSyllabus = data.syllabus_coverage.filter((r) => r.behind_schedule);

  return (
    <HodPageFrame>
      <HodPageHeader
        title="Department Command Center"
        description="Academic health, faculty operations, and pending approvals for your department."
        meta={
          <>
            <span className="font-medium text-sgvu-navy tabular-nums">{istNow || '—'} IST</span>
            <span>·</span>
            <span>{m.total_students} students</span>
            <span>·</span>
            <span>{m.total_faculty} faculty</span>
            <span>·</span>
            <span>{m.pending_inbox_total} pending sign-offs</span>
            {facultyPulse ? (
              <>
                <span>·</span>
                <span>
                  {facultyPulse.faculty_present_today} present, {facultyPulse.faculty_on_leave_today} on leave,{' '}
                  {facultyPulse.classes_scheduled_today} classes today
                </span>
              </>
            ) : null}
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
            <HodActionButton href="/hod/academics/course-allocation">Allocate Courses</HodActionButton>
          </>
        }
      />

      <TodayBirthdaysWidget />

      {facultyPulse ? (
        <div className="rounded-xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-sgvu-navy">Faculty pulse today</p>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className="bg-sgvu-gold" style={{ width: `${facultyPulse.presentPct}%` }} />
            <div className="bg-sgvu-navy/40" style={{ width: `${facultyPulse.leavePct}%` }} />
            <div className="bg-slate-200" style={{ width: `${facultyPulse.otherPct}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap gap-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-sgvu-gold" />
              Present {facultyPulse.presentPct}%
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-sgvu-navy/40" />
              On leave {facultyPulse.leavePct}%
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
              Unmarked {facultyPulse.otherPct}%
            </span>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <HrStatCard
          label="Total Faculty"
          value={m.total_faculty}
          sub={`${m.faculty_on_leave_today} on leave today`}
          icon={Users}
          accent="navy"
        />
        <HrStatCard
          label="Classes Today"
          value={m.classes_scheduled_today}
          sub={`${m.classes_cancelled_today} cancelled · ${m.classes_rescheduled_today} rescheduled`}
          icon={CalendarClock}
          accent="gold"
          alert={m.classes_cancelled_today > 0}
        />
        <HrStatCard
          label="Dept Attendance"
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
          label="Red Flags"
          value={data.attendance_deficits.length}
          sub="Students below 75%"
          icon={AlertTriangle}
          alert={data.attendance_deficits.length > 0}
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
          { href: '/hod/department-timetable', label: 'Timetable' },
          { href: '/hod/faculty/workload', label: 'Workload' },
          { href: '/hod/academics/syllabus-tracking', label: 'Syllabus' },
          { href: '/hod/academics/result-analytics', label: 'Results' },
          { href: '/hod/inbox?scope=dept', label: 'HR Inbox' },
          { href: '/hod/students/defaulters', label: 'Defaulters' },
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
          href="/hod/academics/syllabus-tracking"
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
                  {row.behind_schedule ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Behind schedule — {row.coverage_percent}% complete
                      {row.days_behind ? ` · ${row.days_behind} days behind planned syllabus` : ''}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </HodPanel>

        <HodPanel
          title="Pending Approvals"
          count={data.pending_inbox.length}
          href="/hod/inbox?scope=dept"
          className="lg:col-span-5"
        >
          {data.pending_inbox.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <CheckCircle2 className="h-10 w-10 text-sgvu-gold" />
              <p className="text-sm font-semibold text-sgvu-navy">Inbox clear</p>
              <p className="text-sm text-muted-foreground">No pending sign-offs right now.</p>
            </div>
          ) : (
            <ul className="max-h-[360px] space-y-3 overflow-y-auto">
              {data.pending_inbox.slice(0, 10).map((row) => {
                const busy = actingId === row.id;
                return (
                  <li
                    key={`${row.type}-${row.id}`}
                    className="flex items-start gap-3 rounded-lg border border-gray-100 bg-white p-3 shadow-sm"
                  >
                    <span className="mt-1 h-auto w-1 shrink-0 self-stretch rounded-full bg-sgvu-gold" />
                    <HrAvatar name={row.employee_name} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-sgvu-navy">{row.employee_name}</p>
                        <span className="rounded-md border border-gray-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {row.title}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{row.detail}</p>
                      <p className="mt-1 text-sm tabular-nums text-muted-foreground">{row.date_label}</p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2">
                      <Button
                        size="default"
                        className="h-9 bg-sgvu-navy px-4 text-sm hover:bg-sgvu-navy/90"
                        disabled={busy}
                        onClick={() => void actOnInbox(row, 'APPROVE')}
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Approve'}
                      </Button>
                      <Button
                        size="default"
                        variant="outline"
                        className="h-9 px-4 text-sm text-sgvu-navy"
                        disabled={busy}
                        onClick={() => void actOnInbox(row, 'REJECT')}
                      >
                        Reject
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </HodPanel>

        <HodPanel
          title="Attendance Red Flags"
          count={data.attendance_deficits.length}
          href="/hod/students/defaulters"
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
                    <p className="text-sm text-muted-foreground">{row.course_count} courses</p>
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
            <span className="font-bold">{m.pending_profile_corrections}</span> profile correction
            {m.pending_profile_corrections === 1 ? '' : 's'} pending review
          </p>
          <Link href="/hod/approvals/profile-corrections">
            <Button size="default" variant="outline" className="h-9 border-sgvu-navy/20 text-sm text-sgvu-navy">
              Review profiles
            </Button>
          </Link>
        </div>
      ) : null}
    </HodPageFrame>
  );
}
