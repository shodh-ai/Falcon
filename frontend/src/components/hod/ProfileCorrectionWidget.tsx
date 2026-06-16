'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
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
}: {
  reviewHref?: string;
  limit?: number;
}) {
  const api = useAuthedApi();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  async function load() {
    try {
      const data = await api.get<Ticket[]>('/api/helpdesk/tickets/profile-corrections');
      setTickets(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load profile corrections');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [api]);

  async function resolve(ticketId: string, status: 'RESOLVED' | 'REJECTED', rejection_reason?: string) {
    try {
      await api.patch(`/api/helpdesk/tickets/${ticketId}/status`, { status, rejection_reason });
      toast.success(status === 'RESOLVED' ? 'Approved — 15-minute edit window opened' : 'Rejected with reason sent to student');
      setRejectId(null);
      setRejectReason('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    }
  }

  return (
    <Card className="border-sgvu-gold/30">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Student profile corrections</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loading && tickets.length === 0 && (
          <p className="text-sm text-muted-foreground">No pending profile correction requests.</p>
        )}
        {!loading &&
          tickets.slice(0, limit).map((t) => (
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
                      disabled={rejectReason.trim().length < 10}
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
                  <Button size="sm" onClick={() => void resolve(t.ticket_id, 'RESOLVED')}>
                    Approve (15 min unlock)
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setRejectId(t.ticket_id)}>
                    Reject
                  </Button>
                </div>
              )}
            </div>
          ))}
        {reviewHref && tickets.length > 0 && (
          <Button asChild variant="link" className="px-0">
            <a href={reviewHref}>View all tickets</a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
