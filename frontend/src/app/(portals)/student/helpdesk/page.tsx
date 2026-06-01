'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useAuthedApi } from '@/lib/api';

const categories = [
  { label: 'Name Correction', value: 'ACADEMICS' },
  { label: 'Fee Receipt not generated', value: 'FINANCE' },
  { label: 'WiFi login issue', value: 'IT' },
  { label: 'Hostel Maintenance', value: 'HOSTEL' },
] as const;

type Ticket = {
  ticket_id: string;
  category: string;
  status: string;
  subject: string;
};

export default function StudentHelpdeskPage() {
  const api = useAuthedApi();
  const [form, setForm] = useState({ category: 'ACADEMICS', subject: '', description: '' });
  const [tickets, setTickets] = useState<Ticket[]>([]);
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
  }, []);

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
    <div className="mx-auto max-w-6xl space-y-6">
      <section>
        <h2 className="text-2xl font-bold text-sgvu-navy sm:text-3xl">Helpdesk & Ticketing</h2>
        <p className="mt-1 text-sm text-muted-foreground">Raise requests once and track ownership and status across departments.</p>
      </section>

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
