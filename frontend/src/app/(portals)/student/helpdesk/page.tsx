'use client';

import { useEffect, useState } from 'react';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

type Ticket = {
  ticket_id: string;
  category: string;
  status: string;
  subject: string;
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
  const [form, setForm] = useState({ category: 'IT', subject: '', description: '' });
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [discipline, setDiscipline] = useState<DisciplineRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function loadTickets() {
    try {
      const data = await api.get<Ticket[]>('/api/helpdesk/tickets/my-tickets');
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
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <StudentPageHeader
        title="Grievances & Helpdesk"
        description="Raise IT or maintenance grievances. Discipline records are read-only official notices from Proctor/Warden."
      />

      {discipline.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-base text-destructive">Discipline records (read-only)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {discipline.map((d) => (
              <div key={d.record_id} className="rounded-lg border border-destructive/30 bg-background p-3 text-sm">
                <p className="font-semibold">{d.incident_type} · {new Date(d.date_logged).toLocaleDateString()}</p>
                <p className="mt-1">{d.description}</p>
                <p className="mt-1 text-muted-foreground">Action: {d.action_taken}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Raise New Ticket</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <select
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={form.category}
              onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
            >
              {categories.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <Input
              placeholder="Short subject"
              value={form.subject}
              onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}
            />
            <Input
              placeholder="Describe the issue"
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            />
            <Button className="w-full" onClick={handleCreateTicket} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Ticket'}
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Ticket Tracking</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading && <p className="text-sm text-muted-foreground">Loading tickets...</p>}
            {tickets.map((ticket) => (
              <div key={ticket.ticket_id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{ticket.ticket_id}</p>
                  <Badge variant={ticket.status === 'RESOLVED' ? 'default' : ticket.status === 'IN_PROGRESS' ? 'secondary' : 'outline'}>
                    {ticket.status}
                  </Badge>
                </div>
                <p className="mt-1 text-sm">{ticket.subject}</p>
                <p className="text-xs text-muted-foreground">{ticket.category}</p>
                <Button variant="ghost" className="mt-2 h-auto p-0 text-sm text-sgvu-navy">
                  Open chat with handler
                </Button>
              </div>
            ))}
            {!loading && tickets.length === 0 && <p className="text-sm text-muted-foreground">No tickets raised yet.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
