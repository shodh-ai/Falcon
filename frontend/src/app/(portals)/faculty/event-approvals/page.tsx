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
import {
  FacultyPageHeader,
  FacultyPageShell,
  FacultyPageLoading,
  FacultyEmptyState,
} from '@/components/faculty';

export default function FacultyEventApprovalsPage() {
  const api = useAuthedApi();
  const eventsApi = useMemo(() => createCampusEventsApi(api), [api]);
  const [pending, setPending] = useState<CampusEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const rows = await eventsApi.pendingApprovals();
    setPending(rows);
  }, [eventsApi]);

  useEffect(() => {
    void load()
      .catch(() => toast.error('Could not load approvals'))
      .finally(() => setLoading(false));
  }, [load]);

  async function approve(eventId: string) {
    setBusy(eventId);
    try {
      await eventsApi.approveAdvisor(eventId);
      toast.success('Tier 1 approved — sent to Estate');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Approve failed');
    } finally {
      setBusy(null);
    }
  }

  async function reject(eventId: string) {
    if (comment.trim().length < 3) {
      toast.error('Rejection comment is required');
      return;
    }
    setBusy(eventId);
    try {
      await eventsApi.rejectAdvisor(eventId, comment.trim());
      toast.success('Event rejected');
      setRejectId(null);
      setComment('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Reject failed');
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <FacultyPageLoading label="Loading event approvals…" branded />;
  }

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="Event Approvals"
        description="Tier 1 — review content and relevance before Estate and Finance sign off."
      />

      {pending.length === 0 ? (
        <FacultyEmptyState description="No pending event proposals." />
      ) : (
        pending.map((ev) => (
          <Card key={ev.event_id} className="border-border/60 shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="text-lg">{ev.title}</CardTitle>
                <p className="text-sm text-muted-foreground">{ev.club_name}</p>
              </div>
              <Badge>{ev.is_paid ? `₹${ev.ticket_price}` : 'Free'}</Badge>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                {ev.venue ?? 'Venue TBD'} · {new Date(ev.event_date).toLocaleString('en-IN')} · {ev.total_slots}{' '}
                slots
              </p>
              {ev.description ? <p className="text-muted-foreground">{ev.description}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  disabled={busy === ev.event_id}
                  onClick={() => void approve(ev.event_id)}
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
                <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                  <label className="text-sm font-medium">Rejection reason (required)</label>
                  <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Explain why…" />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy === ev.event_id}
                      onClick={() => void reject(ev.event_id)}
                    >
                      Confirm reject
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setRejectId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))
      )}
    </FacultyPageShell>
  );
}
