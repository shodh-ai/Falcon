'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { createCampusEventsApi, type CampusEvent, type Venue } from '@/lib/api/api.campus-events';

export default function AdminOpsEventsPage() {
  const api = useAuthedApi();
  const eventsApi = useMemo(() => createCampusEventsApi(api), [api]);
  const [pending, setPending] = useState<CampusEvent[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [approveForm, setApproveForm] = useState<Record<string, { venue_id: string; notes: string }>>({});

  const load = useCallback(async () => {
    const [p, v] = await Promise.all([eventsApi.estatePending(), eventsApi.venues()]);
    setPending(p);
    setVenues(v);
  }, [eventsApi]);

  useEffect(() => {
    void load()
      .catch(() => toast.error('Could not load estate queue'))
      .finally(() => setLoading(false));
  }, [load]);

  async function approve(ev: CampusEvent) {
    const f = approveForm[ev.event_id] ?? { venue_id: ev.venue_id ?? '', notes: '' };
    try {
      await eventsApi.approveEstate(ev.event_id, {
        venue_id: f.venue_id || undefined,
        estate_notes: f.notes || undefined,
      });
      toast.success(ev.is_paid ? 'Sent to Finance for ledger approval' : 'Event is now LIVE');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Approve failed');
    }
  }

  async function reject(eventId: string) {
    if (comment.trim().length < 3) {
      toast.error('Rejection note required');
      return;
    }
    await eventsApi.rejectEstate(eventId, comment.trim());
    setRejectId(null);
    setComment('');
    toast.success('Rejected');
    await load();
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold text-sgvu-navy">Estate & Venue Approvals</h1>
        <p className="text-sm text-muted-foreground">
          Tier 2 — confirm venues, resolve clashes, and release events to Finance or LIVE.
        </p>
      </div>

      {pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">No events awaiting estate approval.</p>
      ) : (
        pending.map((ev) => (
          <Card key={ev.event_id}>
            <CardHeader>
              <CardTitle className="text-lg">{ev.title}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {ev.club_name} · {new Date(ev.event_date).toLocaleString('en-IN')}
              </p>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>Requested: <strong>{ev.venue ?? ev.venue_asset_name ?? 'TBD'}</strong></p>
              {ev.guest_speakers ? <p>Guests: {ev.guest_speakers}</p> : null}
              {ev.venue_clash?.has_clash ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-semibold">Venue clash detected</p>
                    {ev.venue_clash.conflicts.map((c) => (
                      <p key={c.title}>{c.title} — {new Date(c.event_date).toLocaleString('en-IN')}</p>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="grid gap-2 md:grid-cols-2">
                <select
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                  value={approveForm[ev.event_id]?.venue_id ?? ev.venue_id ?? ''}
                  onChange={(e) =>
                    setApproveForm((prev) => ({
                      ...prev,
                      [ev.event_id]: { venue_id: e.target.value, notes: prev[ev.event_id]?.notes ?? '' },
                    }))
                  }
                >
                  <option value="">Select venue</option>
                  {venues.map((v) => (
                    <option key={v.venue_id} value={v.venue_id}>
                      {v.name}
                    </option>
                  ))}
                </select>
                <Input
                  placeholder="Estate notes (e.g. moved to Seminar Hall B)"
                  value={approveForm[ev.event_id]?.notes ?? ''}
                  onChange={(e) =>
                    setApproveForm((prev) => ({
                      ...prev,
                      [ev.event_id]: { venue_id: prev[ev.event_id]?.venue_id ?? ev.venue_id ?? '', notes: e.target.value },
                    }))
                  }
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="bg-emerald-600" onClick={() => void approve(ev)}>
                  <Check className="mr-1 h-4 w-4" />
                  Approve venue
                </Button>
                <Button size="sm" variant="outline" onClick={() => setRejectId(ev.event_id)}>
                  <X className="mr-1 h-4 w-4" />
                  Reject
                </Button>
                {ev.is_paid ? <Badge>→ Finance tier next</Badge> : <Badge className="bg-sgvu-navy">→ Goes LIVE</Badge>}
              </div>
              {rejectId === ev.event_id ? (
                <div className="space-y-2 rounded-lg border p-3">
                  <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Rejection reason" />
                  <Button size="sm" variant="destructive" onClick={() => void reject(ev.event_id)}>
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
