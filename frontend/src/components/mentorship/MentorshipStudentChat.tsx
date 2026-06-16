'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, MessageCircle, Send, Ticket } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useAuthedApi } from '@/lib/api';

type ChatMessage = {
  message_id: string;
  sender_type: 'STUDENT' | 'FACULTY';
  message_text: string;
  sent_at: string;
};

export function MentorshipStudentChat() {
  const api = useAuthedApi();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadThread = useCallback(async () => {
    setLoading(true);
    try {
      setMessages(await api.get<ChatMessage[]>('/api/academics/proctor/chat/my'));
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadThread();
  }, [loadThread]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function sendMessage() {
    const text = draft.trim();
    if (text.length < 1) return;
    setSending(true);
    try {
      await api.post('/api/academics/proctor/chat', { message: text });
      setDraft('');
      await loadThread();
      toast.success('Message sent');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to send message');
    } finally {
      setSending(false);
    }
  }

  return (
    <StudentSectionCard
      title="Chat with mentor"
      description="Quick messages — auto-deleted after 7 days"
      icon={MessageCircle}
      tone="gold"
      action={
        <Button variant="outline" size="sm" asChild>
          <Link href="/student/helpdesk">
            <Ticket className="mr-1 h-4 w-4" />
            Raise Formal Ticket
          </Link>
        </Button>
      }
      contentClassName="space-y-3"
    >
        <p className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Note: Mentorship chats are temporary and auto-delete after 7 days. Use the Helpdesk for formal grievances
          (marks disputes, serious complaints, etc.).
        </p>

        <div
          ref={scrollRef}
          className="flex h-64 flex-col gap-3 overflow-y-auto rounded-2xl border border-border/70 bg-background p-3"
        >
          {loading && (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
          {!loading && messages.length === 0 && (
            <p className="flex flex-1 items-center justify-center text-center text-sm text-muted-foreground">
              No messages yet. Send a quick note to your mentor.
            </p>
          )}
          {!loading &&
            messages.map((msg) => {
              const isStudent = msg.sender_type === 'STUDENT';
              return (
                <div key={msg.message_id} className={cn('flex', isStudent ? 'justify-end' : 'justify-start')}>
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-3 py-2 text-sm',
                      isStudent
                        ? 'rounded-br-md bg-sgvu-navy text-white'
                        : 'rounded-bl-md bg-sgvu-gold/25 text-foreground',
                    )}
                  >
                    <p>{msg.message_text}</p>
                    <p
                      className={cn(
                        'mt-1 text-[10px]',
                        isStudent ? 'text-white/70' : 'text-muted-foreground',
                      )}
                    >
                      {isStudent ? 'You' : 'Mentor'} · {new Date(msg.sent_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              );
            })}
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="Type a message…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void sendMessage();
              }
            }}
          />
          <Button onClick={() => void sendMessage()} disabled={sending || !draft.trim()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
    </StudentSectionCard>
  );
}
