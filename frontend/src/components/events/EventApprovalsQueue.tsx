'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { createCampusEventsApi, type CampusEvent } from '@/lib/api/api.campus-events';

export function EventApprovalsQueue({
  title,
  description,
  loadPending,
  approve,
  reject,
  approveLabel,
}: {
  title: string;
  description: string;
  loadPending: (api: ReturnType<typeof createCampusEventsApi>) => Promise<CampusEvent[]>;
  approve: (api: ReturnType<typeof createCampusEventsApi>, id: string) => Promise<unknown>;
  reject: (api: ReturnType<typeof createCampusEventsApi>, id: string, comment: string) => Promise<unknown>;
  approveLabel: string;
}) {
  const api = useAuthedApi();
  const eventsApi = useMemo(() => createCampusEventsApi(api), [api]);
  const [pending, setPending] = useState<CampusEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const rows = await loadPending(eventsApi);
    setPending(rows);
  }, [eventsApi, loadPending]);

  useEffect(() => {
    void load()
      .catch(() => toast.error('Could not load event approvals'))
      .finally(() => setLoading(false));
  }, [load]);

  if (loading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading event approvals…</p>;
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-black text-sgvu-navy">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>

      {pending.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No pending club events in your queue.
          </CardContent>
        </Card>
      ) : (
        pending.map((ev) => (
          <Card key={ev.event_id}>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="text-lg">{ev.title}</CardTitle>
                <p className="text-sm text-muted-foreground">{ev.club_name}</p>
              </div>
              <Badge>{ev.status}</Badge>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                {ev.venue ?? 'Venue TBD'} · {new Date(ev.event_date).toLocaleString()} · {ev.total_slots} slots
              </p>
              {ev.description ? <p className="text-muted-foreground">{ev.description}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  disabled={busy === ev.event_id}
                  onClick={() => {
                    setBusy(ev.event_id);
                    void approve(eventsApi, ev.event_id)
                      .then(() => {
                        toast.success(approveLabel);
                        window.dispatchEvent(new CustomEvent('falcon:notifications-refresh'));
                        return load();
                      })
                      .catch((e) => toast.error(e instanceof Error ? e.message : 'Approve failed'))
                      .finally(() => setBusy(null));
                  }}
                >
                  <Check className="mr-1 h-4 w-4" />
                  Approve
                </Button>
                <Button size="sm" variant="outline" onClick={() => setRejectId(ev.event_id)}>
                  <X className="mr-1 h-4 w-4" />
                  Reject
                </Button>
              </div>
              {rejectId === ev.event_id ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input placeholder="Rejection reason" value={comment} onChange={(e) => setComment(e.target.value)} />
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy === ev.event_id}
                    onClick={() => {
                      if (comment.trim().length < 3) {
                        toast.error('Rejection comment is required');
                        return;
                      }
                      setBusy(ev.event_id);
                      void reject(eventsApi, ev.event_id, comment.trim())
                        .then(() => {
                          toast.success('Event rejected');
                          setRejectId(null);
                          setComment('');
                          window.dispatchEvent(new CustomEvent('falcon:notifications-refresh'));
                          return load();
                        })
                        .catch((e) => toast.error(e instanceof Error ? e.message : 'Reject failed'))
                        .finally(() => setBusy(null));
                    }}
                  >
                    Confirm reject
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
