'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, ChevronRight, Headphones, MessageSquarePlus, Ticket } from 'lucide-react';
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
import { Loader2 } from 'lucide-react';
import { useAuthedApi } from '@/lib/api';

const categories = [
  { label: 'IT / WiFi', value: 'IT' },
  { label: 'Maintenance', value: 'HOSTEL' },
  { label: 'Academics', value: 'ACADEMICS' },
  { label: 'Finance', value: 'FINANCE' },
  { label: 'Other', value: 'OTHER' },
] as const;

type TicketRow = {
  ticket_id: string;
  ticket_ref?: string | null;
  category: string;
  status: string;
  subject: string;
  rejection_reason?: string | null;
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

export default function StudentHelpdeskPage() {
  const api = useAuthedApi();
  const router = useRouter();
  const pathname = '/student/helpdesk';
  const searchParams = useSearchParams();
  const ticketFromQuery = searchParams.get('ticket');
  const [form, setForm] = useState({ category: 'IT', subject: '', description: '' });
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [discipline, setDiscipline] = useState<DisciplineRecord[]>([]);
  const [demeritSummary, setDemeritSummary] = useState<{ cumulative_demerit_points: number; is_subject_back_triggered: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function loadTickets() {
    try {
      const data = await api.get<TicketRow[]>('/api/helpdesk/tickets/my-tickets');
      setTickets(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load tickets');
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
          setDiscipline(res);
          setDemeritSummary(null);
        } else {
          setDiscipline(res.records ?? []);
          setDemeritSummary(res.demerit_summary ?? null);
        }
      })
      .catch(() => {
        setDiscipline([]);
        setDemeritSummary(null);
      });
  }, [api]);

  async function handleCreateTicket() {
    if (form.subject.trim().length < 5 || form.description.trim().length < 10) {
      toast.error('Subject must be 5+ chars and description must be 10+ chars.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/api/helpdesk/tickets', {
        category: form.category,
        subject: form.subject.trim(),
        description: form.description.trim(),
      });
      toast.success('Ticket created successfully');
      setForm((prev) => ({ ...prev, subject: '', description: '' }));
      await loadTickets();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create ticket');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <StudentPageShell>
      <StudentPageHeader
        title="Grievances & Helpdesk"
        description="Raise IT or maintenance grievances. Discipline records are read-only official notices from Mentor/Warden."
      />

      {demeritSummary && demeritSummary.cumulative_demerit_points > 0 ? (
        <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Demerit points on record: <strong>{demeritSummary.cumulative_demerit_points}</strong>
          {demeritSummary.is_subject_back_triggered ? ' · Subject Back applied' : null}
        </div>
      ) : null}

      {discipline.length > 0 && (
        <StudentSectionCard title="Discipline records" description="Official notices — read only" icon={AlertTriangle} tone="danger">
          <div className="space-y-3">
            {discipline.map((d) => (
              <div key={d.record_id} className="rounded-2xl border border-destructive/30 bg-background p-4 text-sm">
                <p className="font-semibold text-destructive">
                  {d.incident_type} · {new Date(d.date_logged).toLocaleDateString()}
                </p>
                <p className="mt-1">{d.description}</p>
                <p className="mt-1 text-muted-foreground">Action: {d.action_taken}</p>
              </div>
            ))}
          </div>
        </StudentSectionCard>
      )}

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <StudentSectionCard title="Raise new ticket" description="Describe your issue clearly for faster resolution" icon={MessageSquarePlus} tone="gold" className="overflow-visible">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {categories.map((item) => {
                const selected = form.category === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, category: item.value }))}
                    className={`rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition ${
                      item.value === 'OTHER' ? 'col-span-2' : ''
                    } ${
                      selected
                        ? 'border-sgvu-navy bg-sgvu-navy text-white shadow-sm'
                        : 'border-input bg-background text-sgvu-navy hover:border-sgvu-gold/50'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
            <Input placeholder="Short subject" value={form.subject} onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))} />
            <textarea
              className="min-h-24 w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm leading-6 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Describe the issue in detail…"
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            />
            <Button className="w-full" onClick={handleCreateTicket} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Ticket'}
            </Button>
          </div>
        </StudentSectionCard>

        <StudentSectionCard
          title="Ticket tracking"
          description={`${tickets.length} ticket${tickets.length === 1 ? '' : 's'} on record`}
          icon={Headphones}
        >
          {loading ? (
            <StudentLoadingState label="Loading tickets…" className="min-h-[20vh]" />
          ) : tickets.length === 0 ? (
            <StudentEmptyState icon={Ticket} title="No tickets yet" description="Raise a ticket on the left when you need help." />
          ) : (
            <div className="space-y-3">
              {tickets.map((ticket) => (
                <Link
                  key={ticket.ticket_id}
                  href={myHelpdeskTicketDetailPath(pathname, ticket.ticket_id)}
                  className="group block rounded-2xl border border-border/70 bg-white p-4 transition hover:border-sgvu-navy/30 hover:shadow-md"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono text-xs text-muted-foreground">
                      {ticket.ticket_ref ?? ticket.ticket_id.slice(0, 8)}
                    </p>
                    <div className="flex items-center gap-2">
                      <Badge variant={ticket.status === 'RESOLVED' ? 'success' : ticket.status === 'IN_PROGRESS' ? 'secondary' : 'outline'}>
                        {ticket.status}
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-sgvu-navy" />
                    </div>
                  </div>
                  <p className="mt-2 font-semibold text-sgvu-navy group-hover:text-sgvu-navy">{ticket.subject}</p>
                  <p className="text-xs text-muted-foreground">{ticket.category}</p>
                  {ticket.status === 'REJECTED' && ticket.rejection_reason && (
                    <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-800">
                      Rejection reason: {ticket.rejection_reason}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          )}
        </StudentSectionCard>
      </div>
    </StudentPageShell>
  );
}
