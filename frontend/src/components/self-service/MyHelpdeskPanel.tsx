'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Headphones, Loader2, MessageSquarePlus } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { myHelpdeskTicketDetailPath } from '@/lib/helpdesk-routes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';
import { SelfServiceLoadError } from './SelfServiceLoadError';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const categories = [
  { label: 'IT / WiFi', value: 'IT' },
  { label: 'HR / Payroll', value: 'HR' },
  { label: 'Facilities', value: 'FACILITIES' },
  { label: 'Other', value: 'ACADEMICS' },
] as const;

type TicketRow = {
  ticket_id: string;
  ticket_ref?: string | null;
  category: string;
  status: string;
  subject: string;
};

function statusVariant(status: string): 'success' | 'secondary' | 'outline' | 'destructive' {
  if (status === 'RESOLVED') return 'success';
  if (status === 'IN_PROGRESS') return 'secondary';
  if (status === 'REJECTED') return 'destructive';
  return 'outline';
}

export function MyHelpdeskPanel() {
  const pathname = usePathname();
  const api = useAuthedApi();
  const [scope, setScope] = useState({ api, pathname, revision: 0 });
  if (scope.api !== api || scope.pathname !== pathname) setScope({ api, pathname, revision: scope.revision + 1 });
  return <MyHelpdeskWorkspace key={scope.revision} api={api} pathname={pathname} />;
}

function MyHelpdeskWorkspace({ api, pathname }: { api: ReturnType<typeof useAuthedApi>; pathname: ReturnType<typeof usePathname> }) {
  const [form, setForm] = useState({ category: 'IT', subject: '', description: '' });
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const mounted = useRef(false);
  const requestId = useRef(0);
  const mutation = useRef<symbol | null>(null);
  const createdTickets = useRef(new Map<string, TicketRow>());

  const loadTickets = useCallback(async () => {
    const id = ++requestId.current;
    const current = () => mounted.current && requestId.current === id;
    try {
      const data = await api.get<TicketRow[]>('/api/helpdesk/tickets/my-tickets');
      let rows = Array.isArray(data) ? data : [];
      if (pathname?.startsWith('/faculty')) {
        const { isEmptyArray, withFacultyDemoFallback } = await import('@/lib/faculty-demo-mode');
        const { facultyDemoHelpdeskTickets } = await import('@/lib/mock/faculty-portal-demo');
        rows = withFacultyDemoFallback(rows, facultyDemoHelpdeskTickets() as TicketRow[], isEmptyArray);
      }
      if (!current()) return;
      setLoadError(null);
      const returnedIds = new Set(rows.map((row) => row.ticket_id));
      for (const key of returnedIds) createdTickets.current.delete(key);
      setTickets([...createdTickets.current.values(), ...rows]);
    } catch (error) {
      if (!current()) return;
      if (pathname?.startsWith('/faculty')) {
        const { isEmptyArray, withFacultyDemoFallback } = await import('@/lib/faculty-demo-mode');
        const { facultyDemoHelpdeskTickets } = await import('@/lib/mock/faculty-portal-demo');
        const demo = withFacultyDemoFallback(
          [],
          facultyDemoHelpdeskTickets() as TicketRow[],
          isEmptyArray,
        );
        if (!current()) return;
        if (demo.length > 0) setTickets(demo);
        if (demo.length === 0) {
          setLoadError(error instanceof Error ? error.message : 'Failed to load tickets');
        }
      } else {
        setLoadError(error instanceof Error ? error.message : 'Failed to load tickets');
      }
    } finally {
      if (current()) setLoading(false);
    }
  }, [api, pathname]);

  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; requestId.current += 1; };
  }, []);

  useEffect(() => {
    // Subscribe to the remote list; state is updated only by its guarded response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTickets();
  }, [loadTickets]);

  async function handleCreateTicket() {
    if (mutation.current) return;
    if (form.subject.trim().length < 5 || form.description.trim().length < 10) {
      toast.error('Subject must be 5+ chars and description must be 10+ chars.');
      return;
    }
    const id = Symbol();
    mutation.current = id;
    const current = () => mounted.current && mutation.current === id;
    setSubmitting(true);
    try {
      const created = await api.post<TicketRow>('/api/helpdesk/tickets', {
        category: form.category,
        subject: form.subject.trim(),
        description: form.description.trim(),
      });
      if (!current()) return;
      if (created?.ticket_id) {
        createdTickets.current.set(created.ticket_id, created);
        setTickets((previous) => [created, ...previous.filter((row) => row.ticket_id !== created.ticket_id)]);
      }
      toast.success('Ticket created');
      setForm((prev) => ({ ...prev, subject: '', description: '' }));
      await loadTickets();
    } catch (error) {
      if (current()) toast.error(error instanceof Error ? error.message : 'Unable to create ticket');
    } finally {
      if (current()) {
        mutation.current = null;
        setSubmitting(false);
      }
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
          <Select
            disabled={submitting}
            value={form.category}
            onValueChange={(val) => setForm((prev) => ({ ...prev, category: val }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select category..." />
            </SelectTrigger>
            <SelectContent>
              {categories.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            disabled={submitting}
            placeholder="Subject"
            value={form.subject}
            onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
          />
          <textarea
            disabled={submitting}
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
          {!loading && loadError && <SelfServiceLoadError message={loadError} onRetry={() => { setLoading(true); setLoadError(null); void loadTickets(); }} />}
          {!loading && !loadError && !tickets.length && (
            <p className="text-sm text-muted-foreground">No tickets yet.</p>
          )}
          {tickets.map((t) => (
            <Link
              key={t.ticket_id}
              href={myHelpdeskTicketDetailPath(pathname, t.ticket_id)}
              className="group block rounded-lg border p-3 text-sm transition hover:border-sgvu-navy/30 hover:bg-muted/20 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sgvu-navy group-hover:underline">{t.subject}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t.ticket_ref ?? t.ticket_id.slice(0, 8)} · {t.category}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Badge variant={statusVariant(t.status)}>{t.status}</Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-sgvu-navy" />
                </div>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
