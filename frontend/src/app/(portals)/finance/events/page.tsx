'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Wallet, X } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
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
  const [transferForms, setTransferForms] = useState<Record<string, { amount: string; ref: string }>>({});

  const load = useCallback(async () => {
    const rows = await eventsApi.financePending();
    setPending(Array.isArray(rows) ? rows : []);
  }, [eventsApi]);

  useEffect(() => {
    void load()
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : 'Could not load fund transfer queue');
        setPending([]);
      })
      .finally(() => setLoading(false));
  }, [load]);

  function formFor(eventId: string, requested: number) {
    return transferForms[eventId] ?? { amount: String(requested), ref: '' };
  }

  async function transfer(eventId: string, requested: number) {
    const form = formFor(eventId, requested);
    const amount = Number(form.amount);
    if (Number.isNaN(amount) || amount <= 0) {
      toast.error('Enter a valid transfer amount');
      return;
    }
    if (form.ref.trim().length < 3) {
      toast.error('Transfer reference is required (min 3 characters)');
      return;
    }
    try {
      await eventsApi.approveFinance(eventId, {
        transfer_amount: amount,
        transfer_ref: form.ref.trim(),
        ledger_code: 'EVENTS_CLUB',
      });
      toast.success('Fund transfer recorded — event is now LIVE for registration');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Transfer failed');
    }
  }

  async function reject(eventId: string) {
    if (comment.trim().length < 3) return;
    await eventsApi.rejectFinance(eventId, comment.trim());
    setRejectId(null);
    setComment('');
    toast.success('Event rejected');
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
          Club Event Fund Transfers
        </h1>
        <p className="text-sm text-muted-foreground">
          Transfer approved club funds after Dean sign-off. Events go LIVE for student registration once transfer is recorded.
        </p>
      </div>

      {pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">No events awaiting fund transfer.</p>
      ) : (
        pending.map((ev) => {
          const requested = Number(ev.funds_needed ?? 0);
          const form = formFor(ev.event_id, requested);
          return (
            <Card key={ev.event_id}>
              <CardHeader className="flex flex-row justify-between gap-4">
                <div>
                  <CardTitle>{ev.title}</CardTitle>
                  <p className="text-sm text-muted-foreground">{ev.club_name}</p>
                </div>
                <Badge>Requested ₹{requested}</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {new Date(ev.event_date).toLocaleString('en-IN')} · {ev.venue ?? 'Venue TBD'}
                </p>
                <Badge variant="outline">{ev.is_paid ? `Paid registration — ₹${ev.ticket_price}` : 'Free registration'}</Badge>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Transfer amount (₹)</label>
                    <Input
                      type="number"
                      min={0.01}
                      max={requested}
                      value={form.amount}
                      onChange={(e) =>
                        setTransferForms((prev) => ({
                          ...prev,
                          [ev.event_id]: { ...formFor(ev.event_id, requested), amount: e.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Transfer reference / UTR</label>
                    <Input
                      value={form.ref}
                      onChange={(e) =>
                        setTransferForms((prev) => ({
                          ...prev,
                          [ev.event_id]: { ...formFor(ev.event_id, requested), ref: e.target.value },
                        }))
                      }
                      placeholder="Bank ref, voucher no., etc."
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" className="bg-emerald-600" onClick={() => void transfer(ev.event_id, requested)}>
                    <Check className="mr-1 h-4 w-4" />
                    Confirm fund transfer
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setRejectId(ev.event_id)}>
                    <X className="mr-1 h-4 w-4" />
                    Reject
                  </Button>
                </div>
                {rejectId === ev.event_id ? (
                  <div className="space-y-2">
                    <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Reason" />
                    <Button size="sm" variant="destructive" onClick={() => void reject(ev.event_id)}>
                      Confirm reject
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
