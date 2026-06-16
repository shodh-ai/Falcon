'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';

type ProctorMessage = {
  interaction_id: string;
  student_user_id: string;
  student_name: string | null;
  message: string;
  replies: Array<{ from: string; message: string; sent_at: string }>;
  helpdesk_ticket_id: string | null;
  status: string;
  created_at: string;
};

type HelpdeskTicket = {
  ticket_id: string;
  category: string;
  status: string;
  subject: string;
  description: string;
  student_user_id: string;
  created_at: string;
  conversation?: Array<{ sender_role: string; message: string; sent_at: string }>;
};

type InboxItem =
  | { kind: 'proctor'; id: string; sortAt: string; data: ProctorMessage }
  | { kind: 'helpdesk'; id: string; sortAt: string; data: HelpdeskTicket };

export function StudentInboxPanel() {
  const api = useAuthedApi();
  const [messages, setMessages] = useState<ProctorMessage[]>([]);
  const [tickets, setTickets] = useState<HelpdeskTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyingId, setReplyingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [inbox, assigned] = await Promise.all([
        api.get<ProctorMessage[]>('/api/academics/proctor/messages/inbox'),
        api.get<HelpdeskTicket[]>('/api/helpdesk/tickets/assigned'),
      ]);
      setMessages(inbox);
      setTickets(assigned.filter((t) => t.category !== 'MENTORSHIP' || !inbox.some((m) => m.helpdesk_ticket_id === t.ticket_id)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load inbox');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [api]);

  const items = useMemo<InboxItem[]>(() => {
    const merged: InboxItem[] = [
      ...messages.map((m) => ({
        kind: 'proctor' as const,
        id: m.interaction_id,
        sortAt: m.created_at,
        data: m,
      })),
      ...tickets.map((t) => ({
        kind: 'helpdesk' as const,
        id: t.ticket_id,
        sortAt: t.created_at,
        data: t,
      })),
    ];
    return merged.sort((a, b) => new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime());
  }, [messages, tickets]);

  async function replyProctor(interactionId: string) {
    const reply = (replyDrafts[interactionId] ?? '').trim();
    if (!reply) {
      toast.error('Enter a reply');
      return;
    }
    setReplyingId(interactionId);
    try {
      await api.post(`/api/academics/proctor/messages/${interactionId}/reply`, { reply });
      toast.success('Reply sent');
      setReplyDrafts((d) => ({ ...d, [interactionId]: '' }));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reply failed');
    } finally {
      setReplyingId(null);
    }
  }

  async function replyTicket(ticketId: string) {
    const reply = (replyDrafts[ticketId] ?? '').trim();
    if (!reply) {
      toast.error('Enter a reply');
      return;
    }
    setReplyingId(ticketId);
    try {
      await api.post(`/api/helpdesk/tickets/${ticketId}/messages`, { message: reply });
      toast.success('Reply sent');
      setReplyDrafts((d) => ({ ...d, [ticketId]: '' }));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reply failed');
    } finally {
      setReplyingId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Student Inbox / Grievances</CardTitle>
        <Badge variant="secondary">{items.length} open</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
        {!loading && items.length === 0 && (
          <p className="text-sm text-muted-foreground">No student messages or assigned tickets yet.</p>
        )}
        {!loading &&
          items.map((item) => {
            if (item.kind === 'proctor') {
              const m = item.data;
              return (
                <div key={item.id} className="rounded-xl border p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-sgvu-navy">{m.student_name ?? 'Student'}</p>
                    <Badge variant="outline">{m.status}</Badge>
                  </div>
                  <p className="text-sm">{m.message}</p>
                  {m.replies?.map((r, i) => (
                    <p key={i} className="rounded-md bg-muted p-2 text-sm text-muted-foreground">
                      You: {r.message}
                    </p>
                  ))}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Reply to student…"
                      value={replyDrafts[m.interaction_id] ?? ''}
                      onChange={(e) => setReplyDrafts((d) => ({ ...d, [m.interaction_id]: e.target.value }))}
                    />
                    <Button
                      size="sm"
                      disabled={replyingId === m.interaction_id}
                      onClick={() => void replyProctor(m.interaction_id)}
                    >
                      {replyingId === m.interaction_id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reply'}
                    </Button>
                  </div>
                </div>
              );
            }

            const t = item.data;
            return (
              <div key={item.id} className="rounded-xl border p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-sgvu-navy">{t.subject}</p>
                  <Badge variant="outline">{t.category} · {t.status}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{t.description}</p>
                {t.conversation?.map((c, i) => (
                  <p key={i} className="rounded-md bg-muted p-2 text-sm">
                    {c.sender_role}: {c.message}
                  </p>
                ))}
                <div className="flex gap-2">
                  <Input
                    placeholder="Reply on ticket…"
                    value={replyDrafts[t.ticket_id] ?? ''}
                    onChange={(e) => setReplyDrafts((d) => ({ ...d, [t.ticket_id]: e.target.value }))}
                  />
                  <Button
                    size="sm"
                    disabled={replyingId === t.ticket_id}
                    onClick={() => void replyTicket(t.ticket_id)}
                  >
                    {replyingId === t.ticket_id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reply'}
                  </Button>
                </div>
              </div>
            );
          })}
      </CardContent>
    </Card>
  );
}
