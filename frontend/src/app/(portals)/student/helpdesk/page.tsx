'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  BookOpen,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  Headphones,
  IndianRupee,
  LifeBuoy,
  Loader2,
  Mail,
  MessageSquarePlus,
  Phone,
  Search,
  Ticket,
  Wifi,
  Wrench,
} from 'lucide-react';
import { myHelpdeskTicketDetailPath } from '@/lib/helpdesk-routes';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentLoadingState } from '@/components/student/StudentLoadingState';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/notifications/falcon-toast';
import { useAuthedApi } from '@/lib/api';
import { isStudentDemoModeEnabled } from '@/lib/student-demo-mode';
import { cn } from '@/lib/utils';

const categories = [
  { label: 'IT / Wi‑Fi', value: 'IT', icon: Wifi, hint: 'Portal, network, email, LMS' },
  { label: 'Maintenance', value: 'HOSTEL', icon: Wrench, hint: 'Room, mess, campus facilities' },
  { label: 'Academics', value: 'ACADEMICS', icon: BookOpen, hint: 'Registration, marks, timetable' },
  { label: 'Finance', value: 'FINANCE', icon: IndianRupee, hint: 'Fees, receipts, scholarships' },
  { label: 'Other', value: 'OTHER', icon: LifeBuoy, hint: 'General student support' },
] as const;

type TicketRow = {
  ticket_id: string;
  ticket_ref?: string | null;
  category: string;
  status: string;
  subject: string;
  rejection_reason?: string | null;
  created_at?: string | null;
};

type DisciplineRecord = {
  record_id: string;
  incident_type: string;
  description: string;
  action_taken: string;
  date_logged: string;
};

type DisciplineResponse = {
  records: DisciplineRecord[];
  demerit_summary?: {
    cumulative_demerit_points: number;
    is_subject_back_triggered: boolean;
  };
};

type StatusFilter = 'ALL' | 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED';

const DEMO_TICKETS: TicketRow[] = [
  {
    ticket_id: 'demo-tkt-1',
    ticket_ref: 'TKT-0003',
    category: 'HOSTEL',
    status: 'PENDING',
    subject: 'Broken hostel fan — Room B-214',
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    ticket_id: 'demo-tkt-2',
    ticket_ref: 'TKT-0002',
    category: 'IT',
    status: 'IN_PROGRESS',
    subject: 'Wi‑Fi disconnects in Tagore Hostel Block B',
    created_at: new Date(Date.now() - 4 * 86400000).toISOString(),
  },
  {
    ticket_id: 'demo-tkt-3',
    ticket_ref: 'TKT-0001',
    category: 'FINANCE',
    status: 'RESOLVED',
    subject: 'Fee receipt not reflecting after online payment',
    created_at: new Date(Date.now() - 9 * 86400000).toISOString(),
  },
];

const DEMO_DISCIPLINE: DisciplineRecord[] = [
  {
    record_id: 'demo-disc-1',
    incident_type: 'ATTENDANCE_WARNING',
    description:
      'Chronic absenteeism warning issued by Mentor for repeated shortfall in CSE502 Operating Systems.',
    action_taken: 'Written warning recorded. Improve attendance before mid-term detention review.',
    date_logged: new Date(Date.now() - 12 * 86400000).toISOString(),
  },
];

function statusBadgeClass(status: string) {
  const s = status.toUpperCase();
  if (s === 'RESOLVED' || s === 'CLOSED') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (s === 'IN_PROGRESS' || s === 'ASSIGNED') {
    return 'border-sky-200 bg-sky-50 text-sky-700';
  }
  if (s === 'REJECTED') {
    return 'border-red-200 bg-red-50 text-red-700';
  }
  return 'border-amber-200 bg-amber-50 text-amber-800';
}

function statusLabel(status: string) {
  return status.replace(/_/g, ' ');
}

function categoryLabel(value: string) {
  return categories.find((c) => c.value === value)?.label ?? value;
}

function matchesStatusFilter(status: string, filter: StatusFilter) {
  const s = status.toUpperCase();
  if (filter === 'ALL') return true;
  if (filter === 'OPEN') return s === 'PENDING' || s === 'OPEN' || s === 'NEW';
  return s === filter;
}

export default function StudentHelpdeskPage() {
  const api = useAuthedApi();
  const router = useRouter();
  const pathname = '/student/helpdesk';
  const searchParams = useSearchParams();
  const ticketFromQuery = searchParams.get('ticket');
  const demoOn = isStudentDemoModeEnabled();

  const [form, setForm] = useState({ category: 'IT', subject: '', description: '' });
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [discipline, setDiscipline] = useState<DisciplineRecord[]>([]);
  const [demeritSummary, setDemeritSummary] = useState<{
    cumulative_demerit_points: number;
    is_subject_back_triggered: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [usingDemoTickets, setUsingDemoTickets] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  async function loadTickets() {
    setLoading(true);
    try {
      const data = await api.get<TicketRow[]>('/api/helpdesk/tickets/my-tickets');
      if ((!data || data.length === 0) && demoOn) {
        setTickets(DEMO_TICKETS);
        setUsingDemoTickets(true);
      } else {
        setTickets(data ?? []);
        setUsingDemoTickets(false);
      }
    } catch {
      if (demoOn) {
        setTickets(DEMO_TICKETS);
        setUsingDemoTickets(true);
      } else {
        setTickets([]);
        setUsingDemoTickets(false);
        toast.error('Failed to load tickets');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (ticketFromQuery) {
      router.replace(`/student/helpdesk/${encodeURIComponent(ticketFromQuery)}`);
    }
  }, [ticketFromQuery, router]);

  useEffect(() => {
    void loadTickets();
    void api
      .get<DisciplineResponse | DisciplineRecord[]>('/api/student/discipline')
      .then((res) => {
        if (Array.isArray(res)) {
          if (res.length === 0 && demoOn) {
            setDiscipline(DEMO_DISCIPLINE);
            setDemeritSummary({ cumulative_demerit_points: 1, is_subject_back_triggered: false });
          } else {
            setDiscipline(res);
            setDemeritSummary(null);
          }
          return;
        }
        const records = res.records ?? [];
        if (records.length === 0 && demoOn) {
          setDiscipline(DEMO_DISCIPLINE);
          setDemeritSummary(
            res.demerit_summary ?? {
              cumulative_demerit_points: 1,
              is_subject_back_triggered: false,
            },
          );
        } else {
          setDiscipline(records);
          setDemeritSummary(res.demerit_summary ?? null);
        }
      })
      .catch(() => {
        if (demoOn) {
          setDiscipline(DEMO_DISCIPLINE);
          setDemeritSummary({ cumulative_demerit_points: 1, is_subject_back_triggered: false });
        } else {
          setDiscipline([]);
          setDemeritSummary(null);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount / api change
  }, [api, demoOn]);

  async function handleCreateTicket() {
    if (form.subject.trim().length < 5 || form.description.trim().length < 10) {
      toast.error('Subject must be at least 5 characters and description at least 10 characters.');
      return;
    }

    setSubmitting(true);
    const subject = form.subject.trim();
    const description = form.description.trim();

    const pushLocalTicket = () => {
      const local: TicketRow = {
        ticket_id: `demo-tkt-${Date.now()}`,
        ticket_ref: `TKT-${String(Math.floor(Math.random() * 9000) + 1000)}`,
        category: form.category,
        status: 'PENDING',
        subject,
        created_at: new Date().toISOString(),
      };
      setTickets((prev) => [local, ...prev]);
      setUsingDemoTickets(true);
      setForm((prev) => ({ ...prev, subject: '', description: '' }));
      toast.success('Ticket submitted — track it under My tickets');
    };

    try {
      if (usingDemoTickets && demoOn) {
        pushLocalTicket();
        return;
      }
      await api.post('/api/helpdesk/tickets', {
        category: form.category,
        subject,
        description,
      });
      toast.success('Ticket created successfully');
      setForm((prev) => ({ ...prev, subject: '', description: '' }));
      await loadTickets();
    } catch (error) {
      if (demoOn) {
        pushLocalTicket();
      } else {
        toast.error(error instanceof Error ? error.message : 'Unable to create ticket');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const filteredTickets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets.filter((ticket) => {
      if (!matchesStatusFilter(ticket.status, statusFilter)) return false;
      if (!q) return true;
      return [ticket.subject, ticket.category, ticket.ticket_ref, ticket.ticket_id]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [tickets, query, statusFilter]);

  const stats = useMemo(() => {
    const open = tickets.filter((t) =>
      ['PENDING', 'OPEN', 'NEW'].includes(t.status.toUpperCase()),
    ).length;
    const progress = tickets.filter((t) =>
      ['IN_PROGRESS', 'ASSIGNED'].includes(t.status.toUpperCase()),
    ).length;
    const resolved = tickets.filter((t) =>
      ['RESOLVED', 'CLOSED'].includes(t.status.toUpperCase()),
    ).length;
    return { open, progress, resolved, total: tickets.length };
  }, [tickets]);

  const selectedCategory = categories.find((c) => c.value === form.category);

  return (
    <StudentPageShell width="5xl">
      <StudentPageHeader
        title="Help & Support"
        description="Raise IT, maintenance, academic, or finance tickets and track resolution. Discipline notices from Mentor or Warden appear here as read-only records."
        eyebrow="Student Support"
        actions={
          <div className="rounded-xl border border-sgvu-navy/10 bg-sgvu-navy/[0.03] px-4 py-3 text-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-sgvu-gold">Support desk</p>
            <p className="mt-1 font-semibold text-sgvu-navy">Mon–Sat · 10:00 AM – 5:00 PM</p>
            <a
              href="mailto:support@mygyanvihar.com"
              className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-sgvu-navy"
            >
              <Mail className="h-3.5 w-3.5" />
              support@mygyanvihar.com
            </a>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Open tickets', value: stats.open, icon: CircleDot, tone: 'text-amber-700 bg-amber-50' },
          { label: 'In progress', value: stats.progress, icon: Clock3, tone: 'text-sky-700 bg-sky-50' },
          { label: 'Resolved', value: stats.resolved, icon: CheckCircle2, tone: 'text-emerald-700 bg-emerald-50' },
          {
            label: 'Demerit points',
            value: demeritSummary?.cumulative_demerit_points ?? 0,
            icon: AlertTriangle,
            tone: 'text-sgvu-navy bg-sgvu-gold/15',
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-sgvu-navy/10 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {item.label}
                </p>
                <p className="mt-1 text-2xl font-black text-sgvu-navy">{item.value}</p>
              </div>
              <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', item.tone)}>
                <item.icon className="h-5 w-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {demeritSummary && demeritSummary.cumulative_demerit_points > 0 ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">
              Demerit points on record: {demeritSummary.cumulative_demerit_points}
            </p>
            <p className="mt-0.5 text-amber-900/80">
              {demeritSummary.is_subject_back_triggered
                ? 'Subject Back has been triggered on your academic record. Contact your Mentor for guidance.'
                : 'These points are official. Contact Student Affairs if you need clarification.'}
            </p>
          </div>
        </div>
      ) : null}

      {discipline.length > 0 ? (
        <StudentSectionCard
          title="Discipline records"
          description="Official notices from Mentor / Warden — read only"
          icon={AlertTriangle}
          tone="danger"
        >
          <div className="space-y-3">
            {discipline.map((d) => (
              <div
                key={d.record_id}
                className="rounded-2xl border border-red-200/80 bg-gradient-to-br from-red-50/80 to-white p-4 text-sm shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-red-700">
                    {d.incident_type.replace(/_/g, ' ')}
                  </p>
                  <span className="text-xs font-medium text-muted-foreground">
                    {new Date(d.date_logged).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                <p className="mt-2 leading-relaxed text-foreground/90">{d.description}</p>
                <p className="mt-2 rounded-lg bg-white/80 px-3 py-2 text-xs text-muted-foreground">
                  <span className="font-semibold text-sgvu-navy">Action taken:</span> {d.action_taken}
                </p>
              </div>
            ))}
          </div>
        </StudentSectionCard>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.05fr]">
        <StudentSectionCard
          title="Raise a new ticket"
          description="Choose a category, describe the issue clearly, and submit for resolution"
          icon={MessageSquarePlus}
          tone="gold"
          className="overflow-visible"
        >
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Category
              </p>
              <div className="grid grid-cols-2 gap-2">
                {categories.map((item) => {
                  const selected = form.category === item.value;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, category: item.value }))}
                      className={cn(
                        'rounded-xl border px-3 py-3 text-left transition',
                        item.value === 'OTHER' && 'col-span-2',
                        selected
                          ? 'border-sgvu-navy bg-sgvu-navy text-white shadow-sm'
                          : 'border-sgvu-navy/15 bg-white text-sgvu-navy hover:border-sgvu-navy/40 hover:bg-sgvu-navy/[0.02]',
                      )}
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        <Icon className="h-4 w-4 shrink-0 opacity-90" />
                        {item.label}
                      </span>
                      <span
                        className={cn(
                          'mt-1 block text-[11px] leading-snug',
                          selected ? 'text-white/75' : 'text-muted-foreground',
                        )}
                      >
                        {item.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground" htmlFor="ticket-subject">
                Subject
              </label>
              <Input
                id="ticket-subject"
                placeholder="e.g. Wi‑Fi not working in hostel room B-214"
                value={form.subject}
                onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}
                className="h-11 rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="text-xs font-semibold text-muted-foreground"
                htmlFor="ticket-description"
              >
                Description
              </label>
              <textarea
                id="ticket-description"
                className="min-h-32 w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm leading-6 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder={
                  selectedCategory
                    ? `Describe your ${selectedCategory.label} issue — include location, time, and any error messages.`
                    : 'Describe the issue in detail…'
                }
                value={form.description}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, description: event.target.value }))
                }
              />
              <p className="text-[11px] text-muted-foreground">
                Minimum 5 characters for subject and 10 for description.
              </p>
            </div>

            <Button
              className="h-11 w-full bg-sgvu-navy text-white hover:bg-[#123A6D]"
              onClick={() => void handleCreateTicket()}
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  <Ticket className="mr-2 h-4 w-4" />
                  Create Ticket
                </>
              )}
            </Button>
          </div>
        </StudentSectionCard>

        <StudentSectionCard
          title="My tickets"
          description={`${stats.total} ticket${stats.total === 1 ? '' : 's'} on record · tap to open conversation`}
          icon={Headphones}
          action={
            <div className="relative w-full sm:w-48">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tickets"
                className="h-10 rounded-xl pl-9"
                aria-label="Search tickets"
              />
            </div>
          }
        >
          <div className="mb-4 flex flex-wrap gap-2">
            {(
              [
                ['ALL', 'All'],
                ['OPEN', 'Open'],
                ['IN_PROGRESS', 'In progress'],
                ['RESOLVED', 'Resolved'],
                ['REJECTED', 'Rejected'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatusFilter(value)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                  statusFilter === value
                    ? 'border-sgvu-navy bg-sgvu-navy text-white'
                    : 'border-sgvu-navy/15 bg-white text-sgvu-navy hover:border-sgvu-navy/35',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {loading ? (
            <StudentLoadingState label="Loading tickets…" className="min-h-[20vh]" />
          ) : filteredTickets.length === 0 ? (
            <StudentEmptyState
              icon={Ticket}
              title={tickets.length === 0 ? 'No tickets yet' : 'No matching tickets'}
              description={
                tickets.length === 0
                  ? 'Raise a ticket on the left when you need help from campus support.'
                  : 'Try another status filter or search term.'
              }
            />
          ) : (
            <div className="space-y-3">
              {filteredTickets.map((ticket) => {
                const isDemo = ticket.ticket_id.startsWith('demo-');
                const inner = (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-mono text-xs text-muted-foreground">
                        {ticket.ticket_ref ?? ticket.ticket_id.slice(0, 8)}
                      </p>
                      <div className="flex items-center gap-2">
                        <Badge className={cn('border', statusBadgeClass(ticket.status))}>
                          {statusLabel(ticket.status)}
                        </Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-sgvu-navy" />
                      </div>
                    </div>
                    <p className="mt-2 font-semibold text-sgvu-navy">{ticket.subject}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{categoryLabel(ticket.category)}</span>
                      {ticket.created_at ? (
                        <>
                          <span>·</span>
                          <span>
                            {new Date(ticket.created_at).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </span>
                        </>
                      ) : null}
                    </div>
                    {ticket.status === 'REJECTED' && ticket.rejection_reason ? (
                      <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-800">
                        Rejection reason: {ticket.rejection_reason}
                      </p>
                    ) : null}
                  </>
                );

                if (isDemo) {
                  return (
                    <div
                      key={ticket.ticket_id}
                      className="group rounded-2xl border border-border/70 bg-white p-4 shadow-sm transition hover:border-sgvu-navy/30 hover:shadow-md"
                      onClick={() =>
                        toast.info('Demo ticket — live conversation opens when helpdesk API is connected.')
                      }
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toast.info(
                            'Demo ticket — live conversation opens when helpdesk API is connected.',
                          );
                        }
                      }}
                    >
                      {inner}
                    </div>
                  );
                }

                return (
                  <Link
                    key={ticket.ticket_id}
                    href={myHelpdeskTicketDetailPath(pathname, ticket.ticket_id)}
                    className="group block rounded-2xl border border-border/70 bg-white p-4 shadow-sm transition hover:border-sgvu-navy/30 hover:shadow-md"
                  >
                    {inner}
                  </Link>
                );
              })}
            </div>
          )}
        </StudentSectionCard>
      </div>

      <StudentSectionCard
        title="Need help contacting an office?"
        description="Use these channels for urgent matters outside the ticket queue"
        icon={Building2}
      >
        <div className="grid gap-3 md:grid-cols-3">
          {[
            {
              title: 'IT Helpdesk',
              detail: 'Network, email, portal access',
              email: 'ithelp@mygyanvihar.com',
              phone: '+91 141 000 2400',
            },
            {
              title: 'Hostel Maintenance',
              detail: 'Room, mess, and facility issues',
              email: 'hostel@mygyanvihar.com',
              phone: '+91 141 000 2500',
            },
            {
              title: 'Student Affairs',
              detail: 'Discipline, welfare, general support',
              email: 'studentaffairs@mygyanvihar.com',
              phone: '+91 141 000 2300',
            },
          ].map((office) => (
            <div
              key={office.title}
              className="rounded-2xl border border-sgvu-navy/10 bg-sgvu-navy/[0.02] p-4 transition hover:border-sgvu-navy/25"
            >
              <p className="font-semibold text-sgvu-navy">{office.title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{office.detail}</p>
              <div className="mt-3 space-y-1.5 text-sm">
                <a
                  href={`mailto:${office.email}`}
                  className="flex items-center gap-2 text-sgvu-navy hover:underline"
                >
                  <Mail className="h-4 w-4 shrink-0" />
                  {office.email}
                </a>
                <a
                  href={`tel:${office.phone.replace(/\s/g, '')}`}
                  className="flex items-center gap-2 text-sgvu-navy hover:underline"
                >
                  <Phone className="h-4 w-4 shrink-0" />
                  {office.phone}
                </a>
              </div>
            </div>
          ))}
        </div>
      </StudentSectionCard>
    </StudentPageShell>
  );
}
