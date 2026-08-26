'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Building2,
  CalendarDays,
  ClipboardList,
  Download,
  Loader2,
  Megaphone,
  Ticket,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';
import { campusAdminRoutes } from '@/lib/campus-admin.roles';

type InsightMode = 'analytics' | 'reports';

type InsightPayload = {
  generated_at?: string;
  campuses?: Array<{
    campus_id?: number;
    campus_name?: string;
    campus_code?: string | null;
    address?: string | null;
    university_name?: string | null;
  }>;
  kpis?: Array<{ label: string; value: number }>;
  breakdowns?: {
    tickets_by_status?: Array<{ status: string; count: number }>;
    people_by_role?: Array<{ role_name: string; count: number }>;
  };
  recent_tickets?: Array<{
    ticket_id: string;
    ticket_ref: string;
    subject: string;
    status: string;
    category?: string;
    submitted_by_name?: string | null;
    created_at?: string;
  }>;
  modules?: Array<{
    key: string;
    label: string;
    count: number;
    href: string;
  }>;
};

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

function statusBadge(status: string) {
  const normalized = String(status ?? '').toUpperCase();
  if (normalized === 'PENDING') {
    return <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">Open</Badge>;
  }
  if (normalized === 'IN_PROGRESS') {
    return <Badge className="bg-sky-100 text-sky-900 hover:bg-sky-100">In Progress</Badge>;
  }
  if (normalized === 'RESOLVED') {
    return <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100">Resolved</Badge>;
  }
  if (normalized === 'REJECTED') {
    return <Badge className="bg-red-100 text-red-900 hover:bg-red-100">Rejected</Badge>;
  }
  return <Badge variant="outline">{status || '—'}</Badge>;
}

function kpiOf(kpis: Array<{ label: string; value: number }> | undefined, label: string) {
  return kpis?.find((row) => row.label.toLowerCase() === label.toLowerCase())?.value ?? 0;
}

function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          const text = String(cell ?? '');
          return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(','),
    )
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function CampusAdminInsightsPage({ mode }: { mode: InsightMode }) {
  const api = useAuthedApi();
  const [data, setData] = useState<InsightPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const endpoint =
    mode === 'analytics' ? '/api/campus-admin/analytics' : '/api/campus-admin/reports';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await api.get<InsightPayload>(endpoint);
      setData(payload ?? null);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Unable to load campus insights.');
    } finally {
      setLoading(false);
    }
  }, [api, endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  const title = mode === 'analytics' ? 'Analytics' : 'Campus Reports';
  const subtitle =
    mode === 'analytics'
      ? 'Live campus pulse for people, academics, admissions, and support operations.'
      : 'Campus inventory snapshot with module counts and exportable KPI summary.';

  const campus = data?.campuses?.[0];
  const kpis = data?.kpis ?? [];
  const ticketBreakdown = data?.breakdowns?.tickets_by_status ?? [];
  const roleBreakdown = data?.breakdowns?.people_by_role ?? [];
  const modules = data?.modules ?? [];
  const recentTickets = data?.recent_tickets ?? [];

  const highlightCards = useMemo(() => {
    if (mode === 'analytics') {
      return [
        {
          label: 'Students',
          value: kpiOf(kpis, 'Students'),
          href: campusAdminRoutes.peopleStudents,
          icon: <Users className="h-4 w-4" />,
        },
        {
          label: 'Faculty & staff',
          value: kpiOf(kpis, 'Faculty & staff'),
          href: campusAdminRoutes.peopleFaculty,
          icon: <Users className="h-4 w-4" />,
        },
        {
          label: 'Open tickets',
          value: kpiOf(kpis, 'Open tickets'),
          href: campusAdminRoutes.operationsRequests,
          icon: <Ticket className="h-4 w-4" />,
        },
        {
          label: 'Applications',
          value: kpiOf(kpis, 'Applications'),
          href: campusAdminRoutes.admissionsApplications,
          icon: <ClipboardList className="h-4 w-4" />,
        },
        {
          label: 'Pending events',
          value: kpiOf(kpis, 'Pending events'),
          href: campusAdminRoutes.operationsEvents,
          icon: <CalendarDays className="h-4 w-4" />,
        },
        {
          label: 'Announcements',
          value: kpiOf(kpis, 'Announcements'),
          href: campusAdminRoutes.operationsAnnouncements,
          icon: <Megaphone className="h-4 w-4" />,
        },
      ];
    }
    return [
      {
        label: 'Departments',
        value: kpiOf(kpis, 'Departments'),
        href: campusAdminRoutes.departments,
        icon: <Building2 className="h-4 w-4" />,
      },
      {
        label: 'Programs',
        value: kpiOf(kpis, 'Programs'),
        href: campusAdminRoutes.programsCourses,
        icon: <BarChart3 className="h-4 w-4" />,
      },
      {
        label: 'Courses',
        value: kpiOf(kpis, 'Courses'),
        href: campusAdminRoutes.programsCourses,
        icon: <BarChart3 className="h-4 w-4" />,
      },
      {
        label: 'Students',
        value: kpiOf(kpis, 'Students'),
        href: campusAdminRoutes.peopleStudents,
        icon: <Users className="h-4 w-4" />,
      },
      {
        label: 'Timetable slots',
        value: kpiOf(kpis, 'Timetable slots'),
        href: campusAdminRoutes.academicsTimetable,
        icon: <CalendarDays className="h-4 w-4" />,
      },
      {
        label: 'Venues',
        value: kpiOf(kpis, 'Venues'),
        href: campusAdminRoutes.operationsFacilities,
        icon: <Building2 className="h-4 w-4" />,
      },
    ];
  }, [kpis, mode]);

  const maxTicket = Math.max(1, ...ticketBreakdown.map((row) => Number(row.count ?? 0)));
  const maxRole = Math.max(1, ...roleBreakdown.map((row) => Number(row.count ?? 0)));

  function exportSummary() {
    const rows: Array<Array<string | number>> = [
      ['Campus Admin', mode === 'analytics' ? 'Analytics' : 'Reports'],
      ['Generated at', data?.generated_at ?? new Date().toISOString()],
      ['Campus', campus?.campus_name ?? ''],
      ['Campus code', campus?.campus_code ?? ''],
      [],
      ['KPI', 'Value'],
      ...kpis.map((kpi) => [kpi.label, kpi.value]),
      [],
      ['Ticket status', 'Count'],
      ...ticketBreakdown.map((row) => [row.status, row.count]),
      [],
      ['Role', 'Count'],
      ...roleBreakdown.map((row) => [row.role_name, row.count]),
    ];
    downloadCsv(
      `campus-${mode}-${new Date().toISOString().slice(0, 10)}.csv`,
      rows,
    );
  }

  return (
    <div className="space-y-5 p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-end md:justify-between md:p-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">
              Campus Admin
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-sgvu-navy">{title}</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>
            {data?.generated_at ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Updated {formatDateTime(data.generated_at)}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="h-9" onClick={() => void load()}>
              Refresh data
            </Button>
            <Button
              type="button"
              className="h-9 bg-sgvu-navy text-white hover:bg-sgvu-navy/90"
              onClick={exportSummary}
              disabled={!data}
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading campus {mode}…
        </div>
      ) : error ? (
        <Card className="border-destructive/20 bg-white shadow-sm">
          <CardContent className="py-10 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button className="mt-3 h-9" variant="outline" onClick={() => void load()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-sgvu-navy/10 bg-white shadow-sm">
            <CardContent className="grid gap-4 p-5 md:grid-cols-[1.2fr_1fr] md:p-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-sgvu-gold">
                  Campus profile
                </p>
                <h2 className="mt-1 text-xl font-bold text-sgvu-navy">
                  {campus?.campus_name || 'Assigned campus'}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {[campus?.campus_code, campus?.university_name].filter(Boolean).join(' · ') ||
                    'Campus-scoped insight desk'}
                </p>
                {campus?.address ? (
                  <p className="mt-3 text-sm text-sgvu-navy/80">{campus.address}</p>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <MiniStat label="Campuses" value={kpiOf(kpis, 'Campuses')} />
                <MiniStat label="Departments" value={kpiOf(kpis, 'Departments')} />
                <MiniStat label="Programs" value={kpiOf(kpis, 'Programs')} />
                <MiniStat label="Courses" value={kpiOf(kpis, 'Courses')} />
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {highlightCards.map((card) => (
              <Card key={card.label} className="border-sgvu-navy/10 bg-white shadow-sm">
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {card.label}
                    </p>
                    <p className="mt-1 text-2xl font-bold text-sgvu-navy">
                      {Number(card.value).toLocaleString('en-IN')}
                    </p>
                    <Link
                      href={card.href}
                      className="mt-2 inline-block text-sm font-semibold text-sgvu-navy hover:underline"
                    >
                      View
                    </Link>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sgvu-navy/5 text-sgvu-navy">
                    {card.icon}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="border-sgvu-navy/10 bg-white shadow-sm">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-bold text-sgvu-navy">Tickets by status</h3>
                  <Button asChild size="sm" variant="outline" className="h-8">
                    <Link href={campusAdminRoutes.operationsRequests}>Open helpdesk</Link>
                  </Button>
                </div>
                {ticketBreakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No ticket activity yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {ticketBreakdown.map((row) => (
                      <li key={row.status}>
                        <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                          <span className="font-medium text-sgvu-navy">{row.status}</span>
                          <span>{Number(row.count).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100">
                          <div
                            className="h-2 rounded-full bg-sgvu-navy"
                            style={{
                              width: `${Math.max(8, (Number(row.count) / maxTicket) * 100)}%`,
                            }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="border-sgvu-navy/10 bg-white shadow-sm">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-bold text-sgvu-navy">People by role</h3>
                  <Button asChild size="sm" variant="outline" className="h-8">
                    <Link href={campusAdminRoutes.peopleUsers}>Manage users</Link>
                  </Button>
                </div>
                {roleBreakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No active people found.</p>
                ) : (
                  <ul className="space-y-3">
                    {roleBreakdown.map((row) => (
                      <li key={row.role_name}>
                        <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                          <span className="font-medium text-sgvu-navy">{row.role_name}</span>
                          <span>{Number(row.count).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100">
                          <div
                            className="h-2 rounded-full bg-sgvu-gold"
                            style={{
                              width: `${Math.max(8, (Number(row.count) / maxRole) * 100)}%`,
                            }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-sgvu-navy/10 bg-white shadow-sm">
            <CardContent className="space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-bold text-sgvu-navy">Campus modules</h3>
                <p className="text-xs text-muted-foreground">
                  Jump into each area with live counts from your campus.
                </p>
              </div>
              <div className="overflow-x-auto rounded-xl border border-sgvu-navy/10">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="p-3 font-semibold">Module</th>
                      <th className="p-3 font-semibold">Count</th>
                      <th className="p-3 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modules.map((module) => (
                      <tr key={module.key} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="p-3 font-semibold text-sgvu-navy">{module.label}</td>
                        <td className="p-3">{Number(module.count).toLocaleString('en-IN')}</td>
                        <td className="p-3 text-right">
                          <Link
                            href={module.href}
                            className="text-sm font-semibold text-sgvu-navy hover:underline"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="border-sgvu-navy/10 bg-white shadow-sm">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-bold text-sgvu-navy">Recent helpdesk tickets</h3>
                <Button asChild size="sm" variant="outline" className="h-8">
                  <Link href={campusAdminRoutes.operationsRequests}>View all</Link>
                </Button>
              </div>
              {recentTickets.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent tickets for this campus.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-sgvu-navy/10">
                  <table className="w-full min-w-[48rem] text-left text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="p-3 font-semibold">Ref</th>
                        <th className="p-3 font-semibold">Subject</th>
                        <th className="p-3 font-semibold">Category</th>
                        <th className="p-3 font-semibold">Requester</th>
                        <th className="p-3 font-semibold">Status</th>
                        <th className="p-3 font-semibold text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentTickets.map((ticket) => (
                        <tr key={ticket.ticket_id} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="p-3 font-medium text-sgvu-navy">{ticket.ticket_ref}</td>
                          <td className="p-3">{ticket.subject}</td>
                          <td className="p-3">{ticket.category ?? '—'}</td>
                          <td className="p-3">{ticket.submitted_by_name ?? '—'}</td>
                          <td className="p-3">{statusBadge(ticket.status)}</td>
                          <td className="p-3 text-right">
                            <Link
                              href={campusAdminRoutes.operationsRequestDetail(ticket.ticket_id)}
                              className="text-sm font-semibold text-sgvu-navy hover:underline"
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-sgvu-navy/10 bg-slate-50/70 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-sgvu-navy">
        {Number(value).toLocaleString('en-IN')}
      </p>
    </div>
  );
}
