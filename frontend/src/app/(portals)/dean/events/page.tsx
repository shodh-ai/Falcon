'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { HodPageFrame, HodPageHeader } from '@/components/hod/HodPagePrimitives';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { createCampusEventsApi, type CampusEvent } from '@/lib/api/api.campus-events';

export default function DeanEventsPage() {
  const api = useAuthedApi();
  const eventsApi = useMemo(() => createCampusEventsApi(api), [api]);
  const [pending, setPending] = useState<CampusEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [comment, setComment] = useState('');

  const load = useCallback(async () => {
    const rows = await eventsApi.deanPending();
    setPending(rows);
  }, [eventsApi]);

  useEffect(() => {
    void load()
      .catch(() => toast.error('Could not load event approval queue'))
      .finally(() => setLoading(false));
  }, [load]);

  async function approve(eventId: string) {
    try {
      await eventsApi.approveDean(eventId);
      toast.success('Dean approval recorded — event proceeds to fund transfer or goes live');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Approve failed');
    }
  }

  async function reject(eventId: string) {
    if (comment.trim().length < 3) {
      toast.error('Rejection reason required (min 3 characters)');
      return;
    }
    try {
      await eventsApi.rejectDean(eventId, comment.trim());
      setRejectId(null);
      setComment('');
      toast.success('Event rejected');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Reject failed');
    }
  }

  if (loading) {
    return (
      <HodPageFrame>
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-sgvu-navy" />
        </div>
      </HodPageFrame>
    );
  }

  return (
    <HodPageFrame>
      <HodPageHeader
        workspaceLabel="Dean Workspace"
        title="Event Approvals"
        description="Review club events after HOD approval. Events with requested funds go to Accountant before registration opens."
      />

      {pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">No events awaiting Dean review.</p>
      ) : (
        <div className="space-y-4">
          {pending.map((ev) => (
            <Card key={ev.event_id}>
              <CardHeader>
                <CardTitle className="text-lg">{ev.title}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {ev.club_name ?? 'Club'} · {new Date(ev.event_date).toLocaleString('en-IN')}
                </p>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {ev.description ? <p>{ev.description}</p> : null}
                {ev.guest_speakers ? <p>Guests: {ev.guest_speakers}</p> : null}
                <p>
                  Venue: <strong>{ev.venue ?? ev.venue_asset_name ?? 'TBD'}</strong>
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{ev.is_paid ? `Paid registration — ₹${ev.ticket_price}` : 'Free registration'}</Badge>
                  {Number(ev.funds_needed ?? 0) > 0 ? (
                    <Badge>Funds requested — ₹{Number(ev.funds_needed)}</Badge>
                  ) : (
                    <Badge variant="success">No funds requested — goes LIVE after approval</Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" className="bg-emerald-600" onClick={() => void approve(ev.event_id)}>
                    <Check className="mr-1 h-4 w-4" />
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setRejectId(ev.event_id)}>
                    <X className="mr-1 h-4 w-4" />
                    Reject
                  </Button>
                </div>
                {rejectId === ev.event_id ? (
                  <div className="space-y-2 rounded-lg border p-3">
                    <Input
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Mandatory rejection reason"
                    />
                    <Button size="sm" variant="destructive" onClick={() => void reject(ev.event_id)}>
                      Confirm reject
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </HodPageFrame>
  );
}
