'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Clock, Headphones, Loader2, MessageSquare, Send, Ticket } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { isValidHelpdeskTicketId } from '@/lib/helpdesk-routes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';
import { isFacultyDemoSmokeId, withFacultyDemoFallback } from '@/lib/faculty-demo-mode';
import { facultyDemoHelpdeskTicketDetail } from '@/lib/mock/faculty-portal-demo-modules';

type TicketDetail = {
  ticket_id: string;
  ticket_ref: string | null;
  category: string;
  subject: string;
  description: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
  rejection_reason: string | null;
  assigned_to_name: string | null;
  conversation: Array<{
    sender_user_id: string;
    sender_role: string;
    message: string;
    sent_at: string;
  }> | null;
};

function statusVariant(status: string): 'success' | 'secondary' | 'outline' | 'destructive' {
  if (status === 'RESOLVED') return 'success';
  if (status === 'IN_PROGRESS') return 'secondary';
  if (status === 'REJECTED') return 'destructive';
  return 'outline';
}

export function MyHelpdeskTicketDetail({
  ticketId,
  backHref,
}: {
  ticketId: string;
  backHref: string;
}) {
  const api = useAuthedApi();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function loadTicket() {
    if (!isValidHelpdeskTicketId(ticketId)) {
      setTicket(null);
      setError('Invalid ticket link.');
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await api.get<TicketDetail>(
        `/api/helpdesk/tickets/${encodeURIComponent(ticketId)}`,
      );
      const resolved = withFacultyDemoFallback(
        data,
        facultyDemoHelpdeskTicketDetail(ticketId) as TicketDetail | null,
        (v) => !v?.ticket_id,
      );
      setTicket(resolved);
      setError(resolved ? null : 'Ticket not found');
    } catch (e) {
      const resolved = withFacultyDemoFallback(
        null,
        facultyDemoHelpdeskTicketDetail(ticketId) as TicketDetail | null,
      );
      setTicket(resolved);
      setError(resolved ? null : e instanceof Error ? e.message : 'Ticket not found');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTicket();
  }, [api, ticketId]);

  async function handleSendMessage() {
    if (!ticket || !message.trim()) {
      toast.error('Please enter a message.');
      return;
    }
    setSubmitting(true);
    try {
      if (isFacultyDemoSmokeId(ticket.ticket_id)) {
        setTicket((prev) =>
          prev
            ? {
                ...prev,
                conversation: [
                  ...(prev.conversation ?? []),
                  {
                    sender_user_id: 'faculty-demo',
                    sender_role: 'FACULTY',
                    message: message.trim(),
                    sent_at: new Date().toISOString(),
                  },
                ],
              }
            : prev,
        );
        toast.success('Message recorded locally (demo ticket)');
        setMessage('');
        return;
      }
      await api.post(`/api/helpdesk/tickets/${ticket.ticket_id}/messages`, {
        message: message.trim(),
      });
      toast.success('Message sent');
      setMessage('');
      await loadTicket();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send message');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading ticket…
      </div>
    );
  }

  if (!ticket) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Ticket className="mx-auto mb-3 h-10 w-10 text-sgvu-navy/40" />
          <h1 className="text-lg font-semibold text-sgvu-navy">Ticket not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error ?? 'This ticket may not exist.'}</p>
          <Button asChild className="mt-6" variant="outline">
            <Link href={backHref}>Back to tickets</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isOpen = ticket.status === 'PENDING' || ticket.status === 'IN_PROGRESS';
  const refLabel = ticket.ticket_ref ?? ticket.ticket_id.slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href={backHref}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to tickets
          </Link>
        </Button>
        <Badge variant="outline" className="font-mono text-xs">
          {refLabel}
        </Badge>
        <Badge variant={statusVariant(ticket.status)}>{ticket.status}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Headphones className="h-5 w-5 text-sgvu-gold" />
            {ticket.subject}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {ticket.category} · Filed on {new Date(ticket.created_at).toLocaleString('en-IN')}
          </p>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {ticket.assigned_to_name && (
            <p className="text-muted-foreground">
              Assigned to <span className="font-medium text-sgvu-navy">{ticket.assigned_to_name}</span>
            </p>
          )}
          <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
            <p className="whitespace-pre-wrap leading-relaxed">{ticket.description}</p>
          </div>
          {ticket.resolved_at && (
            <p className="flex items-center gap-2 text-xs text-emerald-700">
              <Clock className="h-4 w-4" />
              Resolved on {new Date(ticket.resolved_at).toLocaleString('en-IN')}
            </p>
          )}
          {ticket.rejection_reason && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">
              <p className="text-xs font-bold">Rejection reason</p>
              <p className="mt-1">{ticket.rejection_reason}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-5 w-5 text-sgvu-gold" />
            Conversation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {ticket.conversation && ticket.conversation.length > 0 ? (
            <ul className="space-y-3">
              {ticket.conversation.map((msg, i) => (
                <li
                  key={`${msg.sent_at}-${i}`}
                  className="rounded-xl border border-border/60 bg-muted/20 p-3 text-sm"
                >
                  <p className="text-xs font-medium text-muted-foreground">
                    {msg.sender_role} · {new Date(msg.sent_at).toLocaleString('en-IN')}
                  </p>
                  <p className="mt-1">{msg.message}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No replies yet. The team will respond here.</p>
          )}

          {isOpen && (
            <div className="space-y-3 rounded-xl border border-dashed border-sgvu-gold/30 bg-sgvu-gold/5 p-4">
              <textarea
                className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Add a follow-up message…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <Button onClick={() => void handleSendMessage()} disabled={submitting || !message.trim()}>
                {submitting ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-1 h-4 w-4" />
                )}
                Send message
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
