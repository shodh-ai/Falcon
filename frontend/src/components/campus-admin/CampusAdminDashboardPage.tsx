'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardList,
  GraduationCap,
  Loader2,
  Megaphone,
  Network,
  Ticket,
  UserRound,
  Users,
} from 'lucide-react';
import { RegistrarKpiCard } from '@/components/admin/RegistrarKpiCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';
import { createCampusEventsApi, type CampusEvent } from '@/lib/api/api.campus-events';
import { campusAdminRoutes } from '@/lib/campus-admin.roles';
import type { CampusHelpdeskTicketRow } from '@/components/campus-admin/CampusAdminHelpdeskInbox';

type DashboardPayload = {
  campuses?: Array<{ campus_name: string; campus_code?: string | null }>;
  kpis?: Array<{ label: string; value: number }>;
};

type AnnouncementRow = {
  announcement_id: string;
  title: string;
  body_html?: string;
  published_at: string;
};

type CalendarRow = {
  calendar_id?: string;
  date?: string;
  title?: string;
  description?: string | null;
  academic_year?: string | null;
};

type DashboardData = {
  dashboard: DashboardPayload | null;
  dashboardError: string | null;
  facultyCount: number | null;
  hodsCount: number | null;
  staffCount: number | null;
  coursesCount: number | null;
  tickets: CampusHelpdeskTicketRow[] | null;
  ticketsError: string | null;
  announcements: AnnouncementRow[] | null;
  announcementsError: string | null;
  calendar: CalendarRow[] | null;
  calendarError: string | null;
  pendingEvents: CampusEvent[] | null;
  eventsError: string | null;
};

const INITIAL_DATA: DashboardData = {
  dashboard: null,
  dashboardError: null,
  facultyCount: null,
  hodsCount: null,
  staffCount: null,
  coursesCount: null,
  tickets: null,
  ticketsError: null,
  announcements: null,
  announcementsError: null,
  calendar: null,
  calendarError: null,
  pendingEvents: null,
  eventsError: null,
};

const PENDING_TICKET_STATUSES = new Set(['PENDING', 'IN_PROGRESS']);

function kpiValue(
  kpis: Array<{ label: string; value: number }> | undefined,
  label: string,
): number | null {
  const match = kpis?.find(
    (row) => row.label.trim().toLowerCase() === label.trim().toLowerCase(),
  );
  return typeof match?.value === 'number' ? match.value : null;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ticketStatusBadge(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === 'PENDING') {
    return <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">Open</Badge>;
  }
  if (normalized === 'IN_PROGRESS') {
    return <Badge className="bg-sky-100 text-sky-900 hover:bg-sky-100">In Progress</Badge>;
  }
  if (normalized === 'RESOLVED') {
    return <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100">Resolved</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
}

function DashboardSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex min-h-10 items-center justify-between gap-4 border-b border-sgvu-navy/10 pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="h-5 w-1 shrink-0 rounded-full bg-sgvu-gold"
            aria-hidden
          />
          <h2 className="truncate text-base font-bold tracking-tight text-sgvu-navy sm:text-lg">
            {title}
          </h2>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

function SectionState({
  loading,
  error,
  empty,
  onRetry,
  children,
}: {
  loading: boolean;
  error: string | null;
  empty?: boolean;
  onRetry?: () => void;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        <p>{error}</p>
        {onRetry ? (
          <Button className="mt-3 h-8" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>
    );
  }
  if (empty) {
    return <p className="py-8 text-sm text-muted-foreground">No records available.</p>;
  }
  return <>{children}</>;
}

export function CampusAdminDashboardPage() {
  const api = useAuthedApi();
  const eventsApi = useMemo(() => createCampusEventsApi(api), [api]);
  const [data, setData] = useState<DashboardData>(INITIAL_DATA);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      api.get<DashboardPayload>('/api/campus-admin/dashboard'),
      api.get<unknown>('/api/campus-admin/faculty-staff?role=faculty'),
      api.get<unknown>('/api/campus-admin/faculty-staff?role=hod'),
      api.get<unknown>('/api/campus-admin/faculty-staff?role=staff'),
      api.get<unknown>('/api/campus-admin/courses'),
      api.get<CampusHelpdeskTicketRow[]>('/api/campus-admin/requests?limit=100'),
      api.get<AnnouncementRow[]>('/api/admin-ops/announcements'),
      eventsApi.masterCalendar(),
      eventsApi.estatePending(),
    ]);

    const next: DashboardData = { ...INITIAL_DATA };

    if (results[0].status === 'fulfilled') {
      next.dashboard = results[0].value;
    } else {
      next.dashboardError =
        results[0].reason instanceof Error
          ? results[0].reason.message
          : 'Unable to load campus overview.';
    }

    if (results[1].status === 'fulfilled') {
      next.facultyCount = asArray(results[1].value).length;
    }
    if (results[2].status === 'fulfilled') {
      next.hodsCount = asArray(results[2].value).length;
    }
    if (results[3].status === 'fulfilled') {
      next.staffCount = asArray(results[3].value).length;
    }
    if (results[4].status === 'fulfilled') {
      next.coursesCount = asArray(results[4].value).length;
    }

    if (results[5].status === 'fulfilled') {
      next.tickets = asArray<CampusHelpdeskTicketRow>(results[5].value);
    } else {
      next.ticketsError =
        results[5].reason instanceof Error
          ? results[5].reason.message
          : 'Unable to load helpdesk tickets.';
    }

    if (results[6].status === 'fulfilled') {
      next.announcements = asArray<AnnouncementRow>(results[6].value);
    } else {
      next.announcementsError =
        results[6].reason instanceof Error
          ? results[6].reason.message
          : 'Unable to load announcements.';
    }

    if (results[7].status === 'fulfilled') {
      next.calendar = asArray<CalendarRow>(results[7].value);
    } else {
      next.calendarError =
        results[7].reason instanceof Error
          ? results[7].reason.message
          : 'Unable to load academic calendar.';
    }

    if (results[8].status === 'fulfilled') {
      next.pendingEvents = asArray<CampusEvent>(results[8].value);
    } else {
      next.eventsError =
        results[8].reason instanceof Error
          ? results[8].reason.message
          : 'Unable to load pending events.';
    }

    setData(next);
    setLoading(false);
  }, [api, eventsApi]);

  useEffect(() => {
    void load();
  }, [load]);

  const campusName = data.dashboard?.campuses
    ?.map((row) => row.campus_name)
    .filter(Boolean)
    .join(', ');

  const students = kpiValue(data.dashboard?.kpis, 'Students');
  const departments = kpiValue(data.dashboard?.kpis, 'Departments');
  const programs = kpiValue(data.dashboard?.kpis, 'Programs');

  const pendingTickets = useMemo(() => {
    if (!data.tickets) return null;
    return data.tickets.filter((row) =>
      PENDING_TICKET_STATUSES.has(String(row.status ?? '').toUpperCase()),
    );
  }, [data.tickets]);

  const recentTickets = useMemo(() => {
    if (!data.tickets) return null;
    return [...data.tickets]
      .sort(
        (a, b) =>
          new Date(b.updated_at ?? b.created_at).getTime() -
          new Date(a.updated_at ?? a.created_at).getTime(),
      )
      .slice(0, 5);
  }, [data.tickets]);

  const recentAnnouncements = useMemo(() => {
    if (!data.announcements) return null;
    return [...data.announcements]
      .sort(
        (a, b) =>
          new Date(b.published_at).getTime() - new Date(a.published_at).getTime(),
      )
      .slice(0, 5);
  }, [data.announcements]);

  const upcomingCalendar = useMemo(() => {
    if (!data.calendar) return null;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return [...data.calendar]
      .filter((row) => {
        if (!row.date) return false;
        const date = new Date(row.date);
        return !Number.isNaN(date.getTime()) && date.getTime() >= start.getTime();
      })
      .sort((a, b) => new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime())
      .slice(0, 5);
  }, [data.calendar]);

  const academicSession = useMemo(() => {
    if (!data.calendar?.length) return null;
    const years = [
      ...new Set(
        data.calendar
          .map((row) => row.academic_year)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    return years.length === 1 ? years[0] : years[0] ?? null;
  }, [data.calendar]);

  const quickActions = [
    { label: 'View Students', href: campusAdminRoutes.peopleStudents, icon: GraduationCap },
    { label: 'View Faculty', href: campusAdminRoutes.peopleFaculty, icon: UserRound },
    { label: 'View HODs', href: campusAdminRoutes.peopleHods, icon: Network },
    { label: 'Manage Programs & Courses', href: campusAdminRoutes.programsCourses, icon: BookOpen },
    { label: 'Publish Announcement', href: campusAdminRoutes.operationsAnnouncements, icon: Megaphone },
    { label: 'View Helpdesk', href: campusAdminRoutes.operationsRequests, icon: Ticket },
    { label: 'View Timetable', href: campusAdminRoutes.academicsTimetable, icon: ClipboardList },
  ];

  const kpiCards = [
    {
      title: 'Total Students',
      value: students,
      href: campusAdminRoutes.peopleStudents,
      icon: GraduationCap,
      accent: 'blue' as const,
    },
    {
      title: 'Total Faculty',
      value: data.facultyCount,
      href: campusAdminRoutes.peopleFaculty,
      icon: UserRound,
      accent: 'indigo' as const,
    },
    {
      title: 'Total HODs',
      value: data.hodsCount,
      href: campusAdminRoutes.peopleHods,
      icon: Network,
      accent: 'purple' as const,
    },
    {
      title: 'Total Staff',
      value: data.staffCount,
      href: campusAdminRoutes.peopleStaff,
      icon: Users,
      accent: 'emerald' as const,
    },
    {
      title: 'Departments',
      value: departments,
      href: campusAdminRoutes.departments,
      icon: Building2,
      accent: 'amber' as const,
    },
    {
      title: 'Programs',
      value: programs,
      href: campusAdminRoutes.programsCourses,
      icon: BookOpen,
      accent: 'green' as const,
    },
    {
      title: 'Courses',
      value: data.coursesCount,
      href: campusAdminRoutes.programsCourses,
      icon: ClipboardList,
      accent: 'orange' as const,
    },
    {
      title: 'Pending Helpdesk',
      value: pendingTickets ? pendingTickets.length : null,
      href: campusAdminRoutes.operationsRequests,
      icon: Ticket,
      accent: 'health' as const,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6">
      <Card className="overflow-hidden border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="relative p-5 md:p-6">
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_80%_20%,rgba(214,169,69,0.12),transparent_55%)]" />
          <div className="relative space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">
              Campus Administration
            </p>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-sgvu-navy md:text-3xl">
                Campus Command Center
              </h1>
              <p className="mt-2 text-sm text-muted-foreground md:text-base">
                {campusName || 'Assigned campus overview'}
                {academicSession ? ` · Academic Session: ${academicSession}` : ''}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {data.dashboardError ? (
        <Card className="border-destructive/20 bg-white shadow-sm">
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-destructive">{data.dashboardError}</p>
            <Button variant="outline" className="h-9 w-fit" onClick={() => void load()}>
              Retry overview
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <DashboardSection title="KPI Overview">
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
          aria-label="Campus KPIs"
        >
          {kpiCards.map((card) => (
            <RegistrarKpiCard
              key={card.title}
              title={card.title}
              value={card.value ?? '—'}
              icon={card.icon}
              accent={card.accent}
              loading={loading}
              href={card.href}
              trailing={
                card.href ? (
                  <span className="text-xs font-semibold text-sgvu-navy/70">View →</span>
                ) : undefined
              }
            />
          ))}
        </div>
      </DashboardSection>

      <DashboardSection title="Campus Operations Overview">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="border-sgvu-navy/10 bg-white shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-sgvu-navy">Pending Helpdesk</CardTitle>
            </CardHeader>
            <CardContent>
              <SectionState loading={loading} error={data.ticketsError} onRetry={() => void load()}>
                <p className="text-3xl font-black tabular-nums text-sgvu-navy">
                  {(pendingTickets ?? []).length.toLocaleString('en-IN')}
                </p>
                <Button asChild variant="link" className="mt-2 h-auto px-0 text-sgvu-navy">
                  <Link href={campusAdminRoutes.operationsRequests}>View all tickets →</Link>
                </Button>
              </SectionState>
            </CardContent>
          </Card>

          <Card className="border-sgvu-navy/10 bg-white shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-sgvu-navy">Pending Events</CardTitle>
            </CardHeader>
            <CardContent>
              <SectionState loading={loading} error={data.eventsError} onRetry={() => void load()}>
                <p className="text-3xl font-black tabular-nums text-sgvu-navy">
                  {(data.pendingEvents ?? []).length.toLocaleString('en-IN')}
                </p>
                <Button asChild variant="link" className="mt-2 h-auto px-0 text-sgvu-navy">
                  <Link href={campusAdminRoutes.operationsEvents}>Review events →</Link>
                </Button>
              </SectionState>
            </CardContent>
          </Card>

          <Card className="border-sgvu-navy/10 bg-white shadow-sm md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-sgvu-navy">Recent Announcements</CardTitle>
            </CardHeader>
            <CardContent>
              <SectionState
                loading={loading}
                error={data.announcementsError}
                empty={!recentAnnouncements?.length}
                onRetry={() => void load()}
              >
                <ul className="space-y-3">
                  {(recentAnnouncements ?? []).slice(0, 3).map((item) => (
                    <li key={item.announcement_id} className="border-b border-sgvu-navy/5 pb-3 last:border-0 last:pb-0">
                      <p className="text-sm font-semibold text-sgvu-navy">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(item.published_at)}</p>
                    </li>
                  ))}
                </ul>
                <Button asChild variant="link" className="mt-3 h-auto px-0 text-sgvu-navy">
                  <Link href={campusAdminRoutes.operationsAnnouncements}>View all announcements →</Link>
                </Button>
              </SectionState>
            </CardContent>
          </Card>
        </div>
      </DashboardSection>

      <DashboardSection
        title="Academic Overview"
        action={
          <Button asChild variant="outline" className="h-9">
            <Link href={campusAdminRoutes.academicsCalendar}>View calendar</Link>
          </Button>
        }
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="border-sgvu-navy/10 bg-white shadow-sm">
            <CardContent className="p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Departments</p>
              <p className="mt-2 text-3xl font-black tabular-nums text-sgvu-navy">
                {loading ? '—' : departments?.toLocaleString('en-IN') ?? '—'}
              </p>
              <Button asChild variant="link" className="mt-2 h-auto px-0">
                <Link href={campusAdminRoutes.departments}>View all →</Link>
              </Button>
            </CardContent>
          </Card>
          <Card className="border-sgvu-navy/10 bg-white shadow-sm">
            <CardContent className="p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Programs</p>
              <p className="mt-2 text-3xl font-black tabular-nums text-sgvu-navy">
                {loading ? '—' : programs?.toLocaleString('en-IN') ?? '—'}
              </p>
              <Button asChild variant="link" className="mt-2 h-auto px-0">
                <Link href={campusAdminRoutes.programsCourses}>Manage →</Link>
              </Button>
            </CardContent>
          </Card>
          <Card className="border-sgvu-navy/10 bg-white shadow-sm">
            <CardContent className="p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Courses</p>
              <p className="mt-2 text-3xl font-black tabular-nums text-sgvu-navy">
                {loading ? '—' : data.coursesCount?.toLocaleString('en-IN') ?? '—'}
              </p>
              <Button asChild variant="link" className="mt-2 h-auto px-0">
                <Link href={campusAdminRoutes.programsCourses}>Manage →</Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="border-sgvu-navy/10 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-bold text-sgvu-navy">
              <CalendarDays className="h-4 w-4 text-sgvu-gold" />
              Upcoming Academic Calendar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SectionState
              loading={loading}
              error={data.calendarError}
              empty={!upcomingCalendar?.length}
              onRetry={() => void load()}
            >
              <ul className="space-y-3">
                {(upcomingCalendar ?? []).map((row, index) => (
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
                      {formatDate(row.date)}
                    </p>
                  </li>
                ))}
              </ul>
            </SectionState>
          </CardContent>
        </Card>
      </DashboardSection>

      <DashboardSection title="Communication & Support">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-sgvu-navy/10 bg-white shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-bold text-sgvu-navy">
                <Megaphone className="h-4 w-4 text-sgvu-gold" />
                Recent Announcements
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SectionState
                loading={loading}
                error={data.announcementsError}
                empty={!recentAnnouncements?.length}
                onRetry={() => void load()}
              >
                <ul className="space-y-3">
                  {(recentAnnouncements ?? []).map((item) => (
                    <li key={item.announcement_id} className="rounded-xl border border-sgvu-navy/10 px-3 py-3">
                      <p className="text-sm font-semibold text-sgvu-navy">{item.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(item.published_at)}</p>
                    </li>
                  ))}
                </ul>
              </SectionState>
            </CardContent>
          </Card>

          <Card className="border-sgvu-navy/10 bg-white shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-bold text-sgvu-navy">
                <Ticket className="h-4 w-4 text-sgvu-gold" />
                Helpdesk Tickets
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SectionState
                loading={loading}
                error={data.ticketsError}
                empty={!recentTickets?.length}
                onRetry={() => void load()}
              >
                <ul className="space-y-3">
                  {(recentTickets ?? []).map((ticket) => (
                    <li key={ticket.ticket_id} className="rounded-xl border border-sgvu-navy/10 px-3 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-sgvu-navy">
                            {ticket.ticket_ref} · {ticket.subject}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Updated {formatDateTime(ticket.updated_at ?? ticket.created_at)}
                          </p>
                        </div>
                        {ticketStatusBadge(ticket.status)}
                      </div>
                      <Button asChild variant="link" className="mt-2 h-auto px-0">
                        <Link href={campusAdminRoutes.operationsRequestDetail(ticket.ticket_id)}>
                          Open ticket →
                        </Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              </SectionState>
            </CardContent>
          </Card>
        </div>
      </DashboardSection>

      <DashboardSection title="Quick Actions">
        <Card className="border-sgvu-navy/10 bg-white shadow-sm">
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.href}
                  asChild
                  variant="outline"
                  className="h-auto justify-start py-3"
                >
                  <Link href={action.href}>
                    <Icon className="h-4 w-4 text-sgvu-navy" />
                    {action.label}
                  </Link>
                </Button>
              );
            })}
          </CardContent>
        </Card>
      </DashboardSection>
    </div>
  );
}
