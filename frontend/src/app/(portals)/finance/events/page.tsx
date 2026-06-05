'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Wallet, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { createCampusEventsApi, type CampusEvent } from '@/lib/api/api.campus-events';

export default function FinanceEventsPage() {
  const api = useAuthedApi();
  const eventsApi = useMemo(() => createCampusEventsApi(api), [api]);
  const [pending, setPending] = useState<CampusEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [comment, setComment] = useState('');

  const load = useCallback(async () => {
    setPending(await eventsApi.financePending());
  }, [eventsApi]);

  useEffect(() => {
    void load()
      .catch(() => toast.error('Could not load finance queue'))
      .finally(() => setLoading(false));
  }, [load]);

  async function approve(eventId: string) {
    try {
      await eventsApi.approveFinance(eventId, 'EVENTS_CLUB');
      toast.success('Ledger mapped — event is LIVE');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Approve failed');
    }
  }

  async function reject(eventId: string) {
    if (comment.trim().length < 3) return;
    await eventsApi.rejectFinance(eventId, comment.trim());
    setRejectId(null);
    setComment('');
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
        <h1 className="flex items-center gap-2 text-2xl font-bold text-sgvu-navy">
          <Wallet className="h-7 w-7" />
          Club Event Finance Approvals
        </h1>
        <p className="text-sm text-muted-foreground">
          Tier 3 — map paid events to the Events/Clubs ledger before tickets go live.
        </p>
      </div>

      {pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">No paid events awaiting finance approval.</p>
      ) : (
        pending.map((ev) => (
          <Card key={ev.event_id}>
            <CardHeader className="flex flex-row justify-between">
              <div>
                <CardTitle>{ev.title}</CardTitle>
                <p className="text-sm text-muted-foreground">{ev.club_name}</p>
              </div>
              <Badge>₹{Number(ev.ticket_price)}</Badge>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button size="sm" className="bg-emerald-600" onClick={() => void approve(ev.event_id)}>
                <Check className="mr-1 h-4 w-4" />
                Approve ledger (EVENTS_CLUB)
              </Button>
              <Button size="sm" variant="outline" onClick={() => setRejectId(ev.event_id)}>
                <X className="mr-1 h-4 w-4" />
                Reject
              </Button>
              {rejectId === ev.event_id ? (
                <div className="w-full space-y-2">
                  <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Reason" />
                  <Button size="sm" variant="destructive" onClick={() => void reject(ev.event_id)}>
                    Confirm
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
