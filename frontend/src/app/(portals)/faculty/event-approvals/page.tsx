'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { isFacultyDemoSmokeId } from '@/lib/faculty-demo-mode';

function registrationBadge(ev: CampusEvent) {
  return ev.is_paid ? `Paid registration — ₹${ev.ticket_price}` : 'Free registration';
}

function fundsBadge(ev: CampusEvent) {
  const amount = Number(ev.funds_needed ?? 0);
  return amount > 0 ? `Funds requested — ₹${amount}` : 'No university funds requested';
}

export default function FacultyEventApprovalsPage() {
  const api = useAuthedApi();
  const eventsApi = useMemo(() => createCampusEventsApi(api), [api]);
  const [pending, setPending] = useState<CampusEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeApi = useRef(eventsApi);
  useLayoutEffect(() => { activeApi.current = eventsApi; }, [eventsApi]);
  const mounted = useRef(false);
  const requestId = useRef(0);
  const mutation = useRef<symbol | null>(null);
  const handled = useRef(new Set<string>());

  const load = useCallback(async () => {
    const id = ++requestId.current;
    const current = () => mounted.current && activeApi.current === eventsApi && requestId.current === id;
    setLoading(true);
    setError(null);
    try {
      const rows = await eventsApi.facultyPending();
      if (current()) setPending((Array.isArray(rows) ? rows : []).filter((row) => !handled.current.has(row.event_id)));
    } catch (e) {
      if (current()) setError(e instanceof Error ? e.message : 'Could not load approvals');
    } finally {
      if (current()) setLoading(false);
    }
  }, [eventsApi]);

  useEffect(() => {
    mounted.current = true;
    handled.current = new Set();
    mutation.current = null;
    // Account changes invalidate both the approval queue and any unfinished decision draft.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBusy(null);
    setPending([]);
    setRejectId(null);
    setComment('');
    void load();
    return () => { mounted.current = false; requestId.current += 1; };
  }, [load]);

  async function decide(eventId: string, decision: 'approve' | 'reject') {
    if (mutation.current || loading || error || !pending.some((row) => row.event_id === eventId)) return;
    const reason = comment.trim();
    if (decision === 'reject' && (reason.length < 3 || reason.length > 500)) {
      toast.error('Enter a rejection reason between 3 and 500 characters');
      return;
    }
    const operation = Symbol();
    mutation.current = operation;
    const current = () => mounted.current && activeApi.current === eventsApi && mutation.current === operation;
    setBusy(eventId);
    try {
      const demo = isFacultyDemoSmokeId(eventId);
      if (!demo) {
        if (decision === 'approve') await eventsApi.approveAdvisor(eventId);
        else await eventsApi.rejectAdvisor(eventId, reason);
      }
      if (!current()) return;
      handled.current.add(eventId);
      setPending((prev) => prev.filter((ev) => ev.event_id !== eventId));
      setRejectId(null);
      setComment('');
      toast.success(`${decision === 'approve' ? 'Approved — sent to HOD for review' : 'Event rejected'}${demo ? ' (demo)' : ''}`);
      if (!demo) await load();
    } catch (e) {
      if (current()) toast.error(e instanceof Error ? e.message : 'Could not save event decision');
    } finally {
      if (current()) {
        mutation.current = null;
        setBusy(null);
      }
    }
  }

  if (loading) {
    return <FacultyPageLoading label="Loading event approvals…" branded />;
  }

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="Event Approvals"
        description="Review club event proposals before HOD and Dean sign-off."
      />

      {error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p>Could not refresh event approvals. {error}</p>
          <Button variant="outline" onClick={() => void load()}>Retry</Button>
        </div>
      ) : null}

      {!error && pending.length === 0 ? (
        <FacultyEmptyState description="No pending event proposals for your clubs." />
      ) : (
        pending.map((ev) => (
          <Card key={ev.event_id} className="border-border/60 shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="text-lg">{ev.title}</CardTitle>
                <p className="text-sm text-muted-foreground">{ev.club_name}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge variant="outline">{registrationBadge(ev)}</Badge>
                <Badge>{fundsBadge(ev)}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                {ev.venue ?? 'Venue TBD'} · {new Date(ev.event_date).toLocaleString('en-IN')} · {ev.total_slots}{' '}
                slots
              </p>
              {ev.description ? <p className="text-muted-foreground">{ev.description}</p> : null}
              {ev.guest_speakers ? <p>Guests: {ev.guest_speakers}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  disabled={Boolean(busy) || Boolean(error)}
                  onClick={() => void decide(ev.event_id, 'approve')}
                >
                  <Check className="mr-1 h-4 w-4" />
                  Approve
                </Button>
                <Button size="sm" variant="outline" disabled={Boolean(busy) || Boolean(error)} onClick={() => { setRejectId(ev.event_id); setComment(''); }}>
                  <X className="mr-1 h-4 w-4" />
                  Reject
                </Button>
                <Badge className="bg-sgvu-navy">→ HOD review next</Badge>
              </div>
              {rejectId === ev.event_id ? (
                <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                  <label className="text-sm font-medium">Rejection reason (required)</label>
                  <Input aria-label="Rejection reason" maxLength={500} disabled={Boolean(busy) || Boolean(error)} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Explain why…" />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={Boolean(busy) || Boolean(error) || comment.trim().length < 3}
                      onClick={() => void decide(ev.event_id, 'reject')}
                    >
                      Confirm reject
                    </Button>
                    <Button size="sm" variant="ghost" disabled={Boolean(busy)} onClick={() => { setRejectId(null); setComment(''); }}>
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
