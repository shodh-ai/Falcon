'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Headphones, MessageSquarePlus, Ticket } from 'lucide-react';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentLoadingState } from '@/components/student/StudentLoadingState';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useAuthedApi } from '@/lib/api';

const categories = [
  { label: 'IT / WiFi', value: 'IT' },
  { label: 'Maintenance', value: 'HOSTEL' },
  { label: 'Academics', value: 'ACADEMICS' },
  { label: 'Finance', value: 'FINANCE' },
] as const;

type TicketRow = {
  ticket_id: string;
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

export default function StudentHelpdeskPage() {
  const api = useAuthedApi();
  const searchParams = useSearchParams();
  const highlightTicketId = searchParams.get('ticket');
  const [form, setForm] = useState({ category: 'IT', subject: '', description: '' });
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [discipline, setDiscipline] = useState<DisciplineRecord[]>([]);
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
    void loadTickets();
    void api.get<DisciplineRecord[]>('/api/student/discipline').then(setDiscipline).catch(() => setDiscipline([]));
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
        <StudentSectionCard title="Raise new ticket" description="Describe your issue clearly for faster resolution" icon={MessageSquarePlus} tone="gold">
          <div className="space-y-3">
            <select
              className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={form.category}
              onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
            >
              {categories.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
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
                <div
                  key={ticket.ticket_id}
                  className={`rounded-2xl border p-4 transition hover:shadow-sm ${
                    highlightTicketId === ticket.ticket_id ? 'border-sgvu-gold bg-sgvu-gold/10' : 'border-border/70 bg-white'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono text-xs text-muted-foreground">{ticket.ticket_id}</p>
                    <Badge variant={ticket.status === 'RESOLVED' ? 'success' : ticket.status === 'IN_PROGRESS' ? 'secondary' : 'outline'}>
                      {ticket.status}
                    </Badge>
                  </div>
                  <p className="mt-2 font-semibold text-sgvu-navy">{ticket.subject}</p>
                  <p className="text-xs text-muted-foreground">{ticket.category}</p>
                  {ticket.status === 'REJECTED' && ticket.rejection_reason && (
                    <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-800">
                      Rejection reason: {ticket.rejection_reason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </StudentSectionCard>
      </div>
    </StudentPageShell>
  );
}
