'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ClipboardList,
  FileCheck2,
  GraduationCap,
  Inbox,
  Loader2,
  Ticket,
  UserRound,
  Users,
} from 'lucide-react';
import { RegistrarKpiCard } from '@/components/admin/RegistrarKpiCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';
import { campusAdminRoutes } from '@/lib/campus-admin.roles';

type DashboardPayload = {
  campuses?: Array<{ campus_name: string; campus_code?: string | null }>;
  kpis?: Array<{ label: string; value: number }>;
};

type KanbanColumn = { stage: string; leads?: unknown[] };
type ApplicationRow = { status?: string };
type RequestRow = { status?: string };
type QueueRow = { user_id?: string };
type SeatRow = { filled_seats?: number | string };
type CalendarRow = {
  calendar_id?: string;
  date?: string;
  title?: string;
  description?: string;
};

type KpiValue = number | 'N/A';

const ATTENTION_APPLICATION_STATUSES = new Set([
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
]);

const PENDING_REQUEST_STATUSES = new Set(['PENDING', 'IN_PROGRESS']);

function kpiFromDashboard(
  kpis: Array<{ label: string; value: number }> | undefined,
  label: string,
): KpiValue {
  const match = kpis?.find(
    (row) => row.label.trim().toLowerCase() === label.trim().toLowerCase(),
  );
  return typeof match?.value === 'number' ? match.value : 'N/A';
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function settledArray<T>(result: PromiseSettledResult<unknown>): T[] | null {
  if (result.status !== 'fulfilled') return null;
  return asArray<T>(result.value);
}

function formatKpi(value: KpiValue): string | number {
  return value;
}

export function CampusAdminDashboardPage() {
  const api = useAuthedApi();
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [applications, setApplications] = useState<ApplicationRow[] | null>(null);
  const [requests, setRequests] = useState<RequestRow[] | null>(null);
  const [queue, setQueue] = useState<QueueRow[] | null>(null);
  const [kanban, setKanban] = useState<KanbanColumn[] | null>(null);
  const [enrolled, setEnrolled] = useState<unknown[] | null>(null);
  const [seats, setSeats] = useState<SeatRow[] | null>(null);
  const [calendar, setCalendar] = useState<CalendarRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void Promise.allSettled([
      api.get<DashboardPayload>('/api/campus-admin/dashboard'),
      api.get<unknown>('/api/campus-admin/applications'),
      api.get<unknown>('/api/campus-admin/requests'),
      api.get<unknown>('/api/admin/student-verifications/queue'),
      api.get<unknown>('/api/admissions-crm/kanban'),
      api.get<unknown>('/api/admissions-crm/enrolled-students'),
      api.get<unknown>('/api/admissions-crm/counseling/seats'),
      api.get<unknown>('/api/campus-events/master-calendar?academic_year=2025-26'),
    ]).then((results) => {
      if (cancelled) return;

      const dashResult = results[0];
      if (dashResult.status === 'fulfilled') {
        setDashboard(dashResult.value);
      } else {
        setDashboard(null);
        setError(
          dashResult.reason instanceof Error
            ? dashResult.reason.message
            : 'Could not load campus dashboard',
        );
      }

      setApplications(settledArray<ApplicationRow>(results[1]));
      setRequests(settledArray<RequestRow>(results[2]));
      setQueue(settledArray<QueueRow>(results[3]));
      setKanban(settledArray<KanbanColumn>(results[4]));
      setEnrolled(settledArray<unknown>(results[5]));
      setSeats(settledArray<SeatRow>(results[6]));
      setCalendar(settledArray<CalendarRow>(results[7]));
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [api]);

  const campusName = dashboard?.campuses
    ?.map((row) => row.campus_name)
    .filter(Boolean)
    .join(', ');

  const totalStudents = kpiFromDashboard(dashboard?.kpis, 'Students');
  const facultyStaff = kpiFromDashboard(dashboard?.kpis, 'Faculty & staff');
  const applicationsCount = kpiFromDashboard(dashboard?.kpis, 'Applications');
  const enrolledCount: KpiValue = enrolled ? enrolled.length : 'N/A';
  const pendingVerifications: KpiValue = queue ? queue.length : 'N/A';

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const column of kanban ?? []) {
      counts[column.stage] = Array.isArray(column.leads) ? column.leads.length : 0;
    }
    return counts;
  }, [kanban]);

  const counsellingFilled: KpiValue = seats
    ? seats.reduce((sum, row) => sum + Number(row.filled_seats ?? 0), 0)
    : 'N/A';

  const admissionsBars = [
    {
      label: 'Applications',
      value: applicationsCount === 'N/A' ? stageCounts.APPLICATION_STARTED ?? 0 : applicationsCount,
      available: applicationsCount !== 'N/A' || kanban != null,
    },
    {
      label: 'Verified',
      value: stageCounts.DOCUMENT_VERIFICATION ?? 0,
      available: kanban != null,
    },
    {
      label: 'Counselling',
      value: counsellingFilled === 'N/A' ? 0 : counsellingFilled,
      available: counsellingFilled !== 'N/A',
    },
    {
      label: 'Enrolled',
      value: enrolledCount === 'N/A' ? stageCounts.ENROLLED ?? 0 : enrolledCount,
      available: enrolledCount !== 'N/A' || kanban != null,
    },
  ];
  const admissionsMax = Math.max(1, ...admissionsBars.map((row) => (row.available ? row.value : 0)));

  const attentionItems = [
    {
      id: 'verifications',
      title: 'Pending Verifications',
      count: pendingVerifications,
      href: campusAdminRoutes.admissionsVerifications,
    },
    {
      id: 'requests',
      title: 'Pending Campus Requests',
      count: requests
        ? requests.filter((row) =>
            PENDING_REQUEST_STATUSES.has(String(row.status ?? '').toUpperCase()),
          ).length
        : ('N/A' as const),
      href: campusAdminRoutes.operationsRequests,
    },
    {
      id: 'applications',
      title: 'Applications requiring attention',
      count: applications
        ? applications.filter((row) =>
            ATTENTION_APPLICATION_STATUSES.has(String(row.status ?? '').toUpperCase()),
          ).length
        : ('N/A' as const),
      href: campusAdminRoutes.admissionsApplications,
    },
  ];

  const upcoming = useMemo(() => {
    if (!calendar) return null;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return [...calendar]
      .filter((row) => {
        if (!row.date) return false;
        const date = new Date(row.date);
        return !Number.isNaN(date.getTime()) && date.getTime() >= start.getTime();
      })
      .sort((a, b) => new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime())
      .slice(0, 5);
  }, [calendar]);

  const quickActions = [
    {
      label: 'Applications',
      href: campusAdminRoutes.admissionsApplications,
      icon: Inbox,
    },
    {
      label: 'Verifications',
      href: campusAdminRoutes.admissionsVerifications,
      icon: FileCheck2,
    },
    {
      label: 'Students',
      href: campusAdminRoutes.students,
      icon: GraduationCap,
    },
    {
      label: 'Campus Requests',
      href: campusAdminRoutes.operationsRequests,
      icon: Ticket,
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <Card className="overflow-hidden border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="relative p-5 md:p-6">
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_80%_20%,rgba(214,169,69,0.14),transparent_55%)]" />
          <div className="relative space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">
              Falcon Workspace · Campus Admin
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-sgvu-navy">Campus Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Overview of your assigned campus
              {campusName ? ` · ${campusName}` : ''}
            </p>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-destructive/20 bg-white shadow-sm">
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-label="Campus KPIs">
        <RegistrarKpiCard
          title="Total Students"
          value={formatKpi(totalStudents)}
          icon={GraduationCap}
          accent="blue"
          loading={loading}
          href={campusAdminRoutes.students}
        />
        <RegistrarKpiCard
          title="Faculty & Staff"
          value={formatKpi(facultyStaff)}
          icon={UserRound}
          accent="indigo"
          loading={loading}
          href={campusAdminRoutes.facultyStaff}
        />
        <RegistrarKpiCard
          title="Applications"
          value={formatKpi(applicationsCount)}
          icon={Inbox}
          accent="purple"
          loading={loading}
          href={campusAdminRoutes.admissionsApplications}
        />
        <RegistrarKpiCard
          title="Enrolled Students"
          value={formatKpi(enrolledCount)}
          icon={Users}
          accent="emerald"
          loading={loading}
          href={campusAdminRoutes.admissionsEnrolledStudents}
        />
        <RegistrarKpiCard
          title="Pending Verifications"
          value={formatKpi(pendingVerifications)}
          icon={FileCheck2}
          accent="amber"
          loading={loading}
          href={campusAdminRoutes.admissionsVerifications}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-sgvu-navy/10 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold text-sgvu-navy">Admissions Overview</CardTitle>
            <p className="text-sm text-muted-foreground">Campus pipeline summary</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading admissions…
              </p>
            ) : (
              admissionsBars.map((row) => (
                <div key={row.label}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-medium text-sgvu-navy">{row.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {row.available ? row.value.toLocaleString('en-IN') : 'N/A'}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-sgvu-navy to-sgvu-gold"
                      style={{
                        width: row.available
                          ? `${Math.min(100, (row.value / admissionsMax) * 100)}%`
                          : '0%',
                      }}
                    />
                  </div>
                </div>
              ))
            )}
            <Button asChild variant="outline" className="w-full">
              <Link href={campusAdminRoutes.admissionsKanban}>Open Kanban</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-sgvu-navy/10 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold text-sgvu-navy">Attention Required</CardTitle>
            <p className="text-sm text-muted-foreground">Items that need campus follow-up</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading alerts…
              </p>
            ) : (
              attentionItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-sgvu-navy/10 px-3 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-sgvu-navy">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.count === 'N/A' ? 'N/A' : `${item.count.toLocaleString('en-IN')} items`}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href={item.href}>View</Link>
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-sgvu-navy/10 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-bold text-sgvu-navy">
              <CalendarDays className="h-4 w-4 text-sgvu-gold" />
              Upcoming
            </CardTitle>
            <p className="text-sm text-muted-foreground">Academic calendar dates</p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading calendar…
              </p>
            ) : upcoming == null ? (
              <p className="py-6 text-sm text-muted-foreground">Calendar could not be loaded.</p>
            ) : upcoming.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">
                No upcoming academic dates on the university calendar.
              </p>
            ) : (
              <ul className="space-y-3">
                {upcoming.map((row, index) => (
                  <li
                    key={row.calendar_id ?? `${row.date}-${index}`}
                    className="flex items-start justify-between gap-3 border-b border-sgvu-navy/5 pb-3 last:border-0 last:pb-0"
                  >
                    <div>
                      <p className="text-sm font-semibold text-sgvu-navy">{row.title || 'Calendar date'}</p>
                      {row.description ? (
                        <p className="text-xs text-muted-foreground">{row.description}</p>
                      ) : null}
                    </div>
                    <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {row.date
                        ? new Date(row.date).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <Button asChild variant="outline" className="mt-4 w-full">
              <Link href={campusAdminRoutes.academicsCalendar}>Open Academic Calendar</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-sgvu-navy/10 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-bold text-sgvu-navy">
              <ClipboardList className="h-4 w-4 text-sgvu-gold" />
              Quick Actions
            </CardTitle>
            <p className="text-sm text-muted-foreground">Jump to campus modules</p>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Button key={action.href} asChild variant="outline" className="h-auto justify-start py-3">
                  <Link href={action.href}>
                    <Icon className="h-4 w-4 text-sgvu-navy" />
                    {action.label}
                  </Link>
                </Button>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
