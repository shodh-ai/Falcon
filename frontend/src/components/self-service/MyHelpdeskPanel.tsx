'use client';

import { useEffect, useState } from 'react';
import { Headphones, Loader2, MessageSquarePlus } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';

const categories = [
  { label: 'IT / WiFi', value: 'IT' },
  { label: 'HR / Payroll', value: 'HR' },
  { label: 'Facilities', value: 'HOSTEL' },
  { label: 'Other', value: 'ACADEMICS' },
] as const;

type TicketRow = {
  ticket_id: string;
  category: string;
  status: string;
  subject: string;
};

export function MyHelpdeskPanel() {
  const api = useAuthedApi();
  const [form, setForm] = useState({ category: 'IT', subject: '', description: '' });
  const [tickets, setTickets] = useState<TicketRow[]>([]);
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
      toast.success('Ticket created');
      setForm((prev) => ({ ...prev, subject: '', description: '' }));
      await loadTickets();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create ticket');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquarePlus className="h-5 w-5 text-sgvu-gold" />
            Raise new ticket
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={form.category}
            onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
          >
            {categories.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <Input
            placeholder="Subject"
            value={form.subject}
            onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
          />
          <textarea
            className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="Describe the issue"
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
          />
          <Button onClick={() => void handleCreateTicket()} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit ticket'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Headphones className="h-5 w-5 text-sgvu-gold" />
            My tickets
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && <Loader2 className="h-6 w-6 animate-spin" />}
          {!loading && !tickets.length && (
            <p className="text-sm text-muted-foreground">No tickets yet.</p>
          )}
          {tickets.map((t) => (
            <div key={t.ticket_id} className="rounded-lg border p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-sgvu-navy">{t.subject}</p>
                <Badge variant="outline">{t.status}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t.category}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
