'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { GraduationCap, Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';
import {
  createCertificateAutomationApi,
  type CertApplication,
  type CertEvent,
} from '@/lib/api/api.certificate-automation';

function formatInr(value: string | number | null | undefined) {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

export default function AdminConvocationPage() {
  const api = useAuthedApi();
  const certApi = useMemo(() => createCertificateAutomationApi(api), [api]);
  const [events, setEvents] = useState<CertEvent[]>([]);
  const [pending, setPending] = useState<CertApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [form, setForm] = useState({
    event_name: 'Convocation 2026',
    application_start_date: '',
    application_end_date: '',
    base_fee: 1500,
  });

  const load = useCallback(async () => {
    const [ev, queue] = await Promise.all([certApi.listEvents(), certApi.pendingVerification()]);
    setEvents(ev);
    setPending(queue);
  }, [certApi]);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  async function createEvent(e: FormEvent) {
    e.preventDefault();
    try {
      await certApi.createEvent(form);
      toast.success('Convocation event created — eligible final-year students notified');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Create failed');
    }
  }

  async function verify(id: string, action: 'approve' | 'reject') {
    try {
      await certApi.verify(id, action);
      toast.success(action === 'approve' ? 'Verified — no-dues cleared' : 'Application rejected');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verification failed');
    }
  }

  async function generateAll(eventId: string) {
    setGenerating(true);
    try {
      const res = await certApi.generateCertificates(eventId);
      toast.success(`Queued ${res.queued_count} certificate(s) for PDF generation`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-sgvu-navy" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-sgvu-navy sm:text-3xl">
            <GraduationCap className="h-7 w-7 shrink-0" />
            Convocation & Certificate Automation
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Create convocation windows, verify no-dues, and batch-generate watermarked degree PDFs.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Create Convocation Event</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={createEvent} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Input
              placeholder="Event name"
              value={form.event_name}
              onChange={(e) => setForm((f) => ({ ...f, event_name: e.target.value }))}
              required
            />
            <Input
              type="date"
              value={form.application_start_date}
              onChange={(e) => setForm((f) => ({ ...f, application_start_date: e.target.value }))}
              required
            />
            <Input
              type="date"
              value={form.application_end_date}
              onChange={(e) => setForm((f) => ({ ...f, application_end_date: e.target.value }))}
              required
            />
            <Input
              type="number"
              min={0}
              value={form.base_fee}
              onChange={(e) => setForm((f) => ({ ...f, base_fee: Number(e.target.value) }))}
              required
            />
            <Button type="submit">Publish & Notify</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Verification Queue (No-Dues Check)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">No paid applications awaiting verification.</p>
          ) : (
            pending.map((app) => (
              <div key={app.application_id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <div className="flex-1 min-w-[180px]">
                  <p className="font-semibold text-sgvu-navy">{app.student_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {app.enrollment_no} · {app.event_name}
                  </p>
                </div>
                <Badge variant="secondary">Paid · Pending verification</Badge>
                <Button size="sm" onClick={() => void verify(app.application_id, 'approve')}>
                  Verify No-Dues
                </Button>
                <Button size="sm" variant="destructive" onClick={() => void verify(app.application_id, 'reject')}>
                  Reject
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Events & Batch Generation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {events.map((ev) => (
            <div key={ev.event_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
              <div>
                <p className="font-semibold text-sgvu-navy">{ev.event_name}</p>
                <p className="text-xs text-muted-foreground">
                  {ev.application_count ?? 0} applications · {ev.verified_count ?? 0} verified · Fee{' '}
                  {formatInr(ev.base_fee)}
                </p>
              </div>
              <Button
                variant="outline"
                disabled={generating || (ev.verified_count ?? 0) === 0}
                onClick={() => void generateAll(ev.event_id)}
              >
                {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Generate Certificates
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
