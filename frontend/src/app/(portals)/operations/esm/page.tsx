'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createOperationsApi } from '@/lib/api/api.operations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { toast } from '@/lib/notifications/falcon-toast';

export default function Page() {
  const api = useAuthedApi();
  const ops = useMemo(() => createOperationsApi(api), [api]);
  const [queues, setQueues] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);

  const reload = useCallback(
    () =>
      Promise.all([ops.queues(), ops.tickets()]).then(([q, t]) => {
        setQueues(q);
        setTickets(t);
      }),
    [ops],
  );

  useEffect(() => {
    void reload().catch(() => toast.error('Load failed'));
  }, [reload]);

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-black text-sgvu-navy">ESM Queues</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Route physical tickets from{' '}
          <Link href="/operations/qr-tickets" className="text-sgvu-navy underline">
            QR Ticketing
          </Link>{' '}
          and scan-close on site.
        </p>
      </div>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Open tickets
        </h2>
        {tickets.map((t) => (
          <Card key={t.ticket_id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4 text-sm">
              <div>
                <div className="font-medium">
                  {t.ticket_ref ?? t.ticket_id.slice(0, 8)} — {t.subject ?? t.category}
                </div>
                <div className="text-muted-foreground">
                  {t.location_label ?? 'No location'} · {t.status}
                  {t.sla_deadline
                    ? ` · SLA ${new Date(t.sla_deadline).toLocaleString()}`
                    : ''}
                </div>
              </div>
              <Button
                size="sm"
                onClick={() =>
                  ops
                    .scanClose(t.ticket_id)
                    .then(() => {
                      toast.success('Ticket scan-closed');
                      return reload();
                    })
                    .catch((e) => toast.error(String(e.message ?? e)))
                }
              >
                Scan close
              </Button>
            </CardContent>
          </Card>
        ))}
        {!tickets.length && (
          <p className="text-sm text-muted-foreground">
            No open tickets. Create one from QR Ticketing first.
          </p>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Queue routing
        </h2>
        {queues.map((q) => (
          <Card key={q.queue_id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{q.name}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              Category {q.category} → {q.assignee_role}
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
