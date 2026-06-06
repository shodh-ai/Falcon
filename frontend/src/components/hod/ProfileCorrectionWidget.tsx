'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

  async function resolve(ticketId: string, status: 'RESOLVED' | 'IN_PROGRESS') {
    try {
      await api.patch(`/api/helpdesk/tickets/${ticketId}/status`, { status });
      toast.success(status === 'RESOLVED' ? 'Marked resolved' : 'Marked in progress');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    }
  }

  return (
    <Card className="border-sgvu-gold/30">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Student profile corrections</CardTitle>
        {!loading && (
          <Badge variant="outline">{tickets.length} pending</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loading && tickets.length === 0 && (
          <p className="text-sm text-muted-foreground">No pending profile correction requests.</p>
        )}
        {!loading &&
          tickets.slice(0, limit).map((t) => (
            <div key={t.ticket_id} className="rounded-lg border p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-sgvu-navy">{t.subject}</p>
                  <p className="mt-1 line-clamp-2 text-muted-foreground">{t.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(t.created_at).toLocaleString()} · {t.category}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <Button size="sm" onClick={() => void resolve(t.ticket_id, 'RESOLVED')}>
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void resolve(t.ticket_id, 'IN_PROGRESS')}>
                    Review
                  </Button>
                </div>
              </div>
            </div>
          ))}
        {reviewHref && tickets.length > 0 && (
          <Button asChild variant="link" className="px-0">
            <Link href={reviewHref}>View all tickets</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
