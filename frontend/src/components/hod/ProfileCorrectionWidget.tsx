'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from '@/lib/notifications/falcon-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';

type Ticket = {
  ticket_id: string;
  subject: string;
  description: string;
  category: string;
  status: string;
  created_at: string;
};

export function ProfileCorrectionWidget({
  reviewHref,
  limit = 5,
  showBulkActions = false,
}: {
  reviewHref?: string;
  limit?: number;
  showBulkActions?: boolean;
}) {
  const api = useAuthedApi();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);
  const [bulkRejectReason, setBulkRejectReason] = useState('');
  const [bulkWorking, setBulkWorking] = useState(false);

  async function load() {
    setLoadError(null);
    try {
      const data = await api.get<Ticket[]>('/api/helpdesk/tickets/profile-corrections');
      // The endpoint is a pending queue. Keep the client defensive if an
      // older backend returns a resolved row during a rolling deployment.
      setTickets((data ?? []).filter((ticket) =>
        ticket.status === 'PENDING' || ticket.status === 'IN_PROGRESS',
      ));
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      setLoadError(message || 'Failed to load profile corrections');
      const forbidden =
        /^Forbidden resource$/i.test(message) ||
        /API 403|status 403|forbidden/i.test(message);
      if (!forbidden) {
        toast.error(message || 'Failed to load profile corrections');
      } else {
        // A stale queue must never be presented as actionable after a 403.
        setTickets([]);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [api]);

  async function resolve(ticketId: string, status: 'RESOLVED' | 'REJECTED', rejection_reason?: string) {
    if (actingId) return;
    setActingId(ticketId);
    setLoadError(null);
    try {
      const saved = await api.patch<Ticket>(`/api/helpdesk/tickets/${ticketId}/status`, {
        status,
        rejection_reason,
      });
      // Remove the item optimistically only after the API has acknowledged the
      // committed transition. The subsequent reload confirms persistence.
      if (saved?.status === status || status === 'RESOLVED' || status === 'REJECTED') {
        setTickets((current) => current.filter((ticket) => ticket.ticket_id !== ticketId));
      }
      toast.success(status === 'RESOLVED' ? 'Approved — 15-minute edit window opened' : 'Rejected with reason sent to student');
      setRejectId(null);
      setRejectReason('');
      await load();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Action failed';
      setLoadError(message);
      toast.error(message);
    } finally {
      setActingId(null);
    }
  }

  async function bulkResolve(status: 'RESOLVED' | 'REJECTED', rejection_reason?: string) {
    const pending = tickets.slice(0, limit);
    if (!pending.length) return;
    setBulkWorking(true);
    try {
      const results = await Promise.allSettled(
        pending.map((t) =>
          api.patch(`/api/helpdesk/tickets/${t.ticket_id}/status`, {
            status,
            rejection_reason,
          }),
        ),
      );
      const ok = results.filter((result) => result.status === 'fulfilled').length;
      const failed = results.length - ok;
      const bulkError = failed > 0
        ? `${failed} request${failed === 1 ? '' : 's'} could not be updated. Refresh and retry.`
        : null;
      if (ok > 0) {
        toast.success(
          status === 'RESOLVED'
            ? `Approved ${ok} request${ok === 1 ? '' : 's'} — edit windows opened${failed ? ` (${failed} already handled or failed)` : ''}`
            : `Rejected ${ok} request${ok === 1 ? '' : 's'}${failed ? ` (${failed} already handled or failed)` : ''}`,
        );
      }
      if (failed > 0) {
        setLoadError(bulkError);
        if (ok === 0) toast.error('No requests were updated. Refresh and retry.');
      }
      setBulkRejectOpen(false);
      setBulkRejectReason('');
      await load();
      // `load` clears transient fetch errors; retain a partial-batch warning so
      // the operator does not mistake a partial commit for full success.
      if (bulkError) setLoadError(bulkError);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Bulk action failed';
      setLoadError(message);
      toast.error(message);
    } finally {
      setBulkWorking(false);
    }
  }

  const visibleTickets = tickets.slice(0, limit);

  return (
    <Card className="border-sgvu-gold/30">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Student profile corrections</CardTitle>
        {showBulkActions && !loading && visibleTickets.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={bulkWorking}
              onClick={() => void bulkResolve('RESOLVED')}
            >
              Bulk Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkWorking}
              onClick={() => setBulkRejectOpen((v) => !v)}
            >
              Bulk Reject
            </Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {bulkRejectOpen && showBulkActions ? (
          <div className="rounded-lg border border-rose-100 bg-rose-50/50 p-3 space-y-2">
            <textarea
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="Rejection reason for all selected requests (10+ chars)"
              value={bulkRejectReason}
              onChange={(e) => setBulkRejectReason(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                disabled={bulkWorking || bulkRejectReason.trim().length < 10}
                onClick={() => void bulkResolve('REJECTED', bulkRejectReason.trim())}
              >
                Confirm bulk reject
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setBulkRejectOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loading && loadError ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
            {loadError}
            <Button size="sm" variant="outline" className="ml-3 h-7" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        ) : null}
        {!loading && !loadError && tickets.length === 0 && (
          <p className="text-sm text-muted-foreground">No pending profile correction requests.</p>
        )}
        {!loading &&
          visibleTickets.map((t) => (
            <div key={t.ticket_id} className="rounded-lg border p-3 text-sm">
              <p className="font-medium text-sgvu-navy">{t.subject}</p>
              <p className="mt-1 line-clamp-2 text-muted-foreground">{t.description}</p>
              {rejectId === t.ticket_id ? (
                <div className="mt-3 space-y-2">
                  <textarea
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    placeholder="Rejection reason (shown to student, 10+ chars)"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={actingId !== null || rejectReason.trim().length < 10}
                      onClick={() => void resolve(t.ticket_id, 'REJECTED', rejectReason.trim())}
                    >
                      Confirm reject
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setRejectId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" disabled={actingId !== null} onClick={() => void resolve(t.ticket_id, 'RESOLVED')}>
                    Approve (15 min unlock)
                  </Button>
                  <Button size="sm" variant="outline" disabled={actingId !== null} onClick={() => setRejectId(t.ticket_id)}>
                    Reject
                  </Button>
                </div>
              )}
            </div>
          ))}
        {reviewHref ? (
          <Button asChild variant="link" className="h-auto px-0 text-sgvu-navy">
            <Link href={reviewHref}>
              {tickets.length > limit
                ? `View all tickets (${tickets.length})`
                : 'View all tickets'}
            </Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
