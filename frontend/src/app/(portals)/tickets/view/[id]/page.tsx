'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Ticket } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';
import { getDashboardPathForRole } from '@/lib/auth-routing';
import { useAuth } from '@/context/AuthContext';

type TicketDetail = {
  ticket_id: string;
  ticket_ref: string;
  category: string;
  subject: string;
  description: string;
  status: string;
  student_name: string;
  assigned_to_name: string | null;
  created_at: string;
  conversation: Array<{
    sender_user_id: string;
    sender_role: string;
    message: string;
    sent_at: string;
  }> | null;
};

export default function TicketViewPage() {
  const { id } = useParams<{ id: string }>();
  const api = useAuthedApi();
  const { user } = useAuth();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    void api
      .get<TicketDetail>(`/api/helpdesk/tickets/ref/${encodeURIComponent(id)}`)
      .then(setTicket)
      .catch((e: Error) => {
        setTicket(null);
        setError(e.message || 'Ticket not found');
      })
      .finally(() => setLoading(false));
  }, [api, id]);

  const home = getDashboardPathForRole(user?.primaryRole ?? user?.role);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading ticket…
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border bg-white p-8 text-center shadow-sm">
        <Ticket className="mx-auto mb-3 h-10 w-10 text-sgvu-navy/40" />
        <h1 className="text-lg font-semibold text-sgvu-navy">Ticket not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error ?? 'This ticket may not exist or you lack permission to view it.'}</p>
        <Button asChild className="mt-6" variant="outline">
          <Link href={home}>Back to dashboard</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href={home}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>
        <Badge variant="outline" className="font-mono text-xs">
          {ticket.ticket_ref}
        </Badge>
        <Badge>{ticket.status}</Badge>
      </div>

      <div className="rounded-2xl border border-sgvu-navy/10 bg-white p-6 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-widest text-sgvu-gold">Helpdesk Issue</p>
        <h1 className="mt-1 text-2xl font-black text-sgvu-navy">{ticket.subject}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {ticket.category} · Filed by {ticket.student_name}
          {ticket.assigned_to_name ? ` · Assigned to ${ticket.assigned_to_name}` : ''}
        </p>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{ticket.description}</p>
      </div>

      {ticket.conversation && ticket.conversation.length > 0 ? (
        <div className="rounded-2xl border border-sgvu-navy/10 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-widest text-sgvu-navy">Conversation</h2>
          <ul className="mt-4 space-y-3">
            {ticket.conversation.map((msg, i) => (
              <li key={`${msg.sent_at}-${i}`} className="rounded-xl border border-border/60 bg-sgvu-surface/50 p-3 text-sm">
                <p className="text-xs font-medium text-muted-foreground">
                  {msg.sender_role} · {new Date(msg.sent_at).toLocaleString()}
                </p>
                <p className="mt-1">{msg.message}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
