'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useAuthedApi } from '@/lib/api';
import { FacultyAccountScope } from '@/components/faculty/FacultyAccountScope';
import {
  isEmptyArray,
  isFacultyDemoSmokeId,
  withFacultyDemoFallback,
} from '@/lib/faculty-demo-mode';
import { facultyDemoChatMentees, getFacultyPortalDemoPack } from '@/lib/mock/faculty-portal-demo';

type MenteeSummary = {
  student_user_id: string;
  student_name: string;
  student_email: string | null;
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
};

type ChatMessage = {
  message_id: string;
  sender_type: 'STUDENT' | 'FACULTY';
  message_text: string;
  sent_at: string;
};

export function MentorshipChatMessenger() {
  const api = useAuthedApi();
  return <FacultyAccountScope scope={api}><MentorshipChatContent api={api} /></FacultyAccountScope>;
}

function MentorshipChatContent({ api }: { api: ReturnType<typeof useAuthedApi> }) {
  const [mentees, setMentees] = useState<MenteeSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const selectedMenteeId = useRef<string | null>(null);
  const listRequest = useRef(0);
  const threadRequest = useRef(0);
  const sendLock = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      listRequest.current += 1;
      threadRequest.current += 1;
    };
  }, []);

  const selectMentee = useCallback((studentUserId: string | null) => {
    if (selectedMenteeId.current === studentUserId) return;
    selectedMenteeId.current = studentUserId;
    threadRequest.current += 1;
    setSelectedId(studentUserId);
    setMessages([]);
    setDraft('');
    setLoadingThread(Boolean(studentUserId));
  }, []);

  const loadMentees = useCallback(async () => {
    const request = ++listRequest.current;
    setLoadingList(true);
    try {
      const data = await api.get<MenteeSummary[]>('/api/academics/proctor/chat/mentees');
      if (!mounted.current || request !== listRequest.current) return;
      const resolved = withFacultyDemoFallback(
        data,
        facultyDemoChatMentees().map((m) => ({
          ...m,
          last_message_at: null,
          last_message_preview: null,
        })),
        isEmptyArray,
      );
      setMentees(resolved);
      if (!resolved.some((mentee) => mentee.student_user_id === selectedMenteeId.current)) {
        selectMentee(resolved[0]?.student_user_id ?? null);
      }
    } catch (err) {
      if (!mounted.current || request !== listRequest.current) return;
      const resolved = withFacultyDemoFallback(
        [],
        facultyDemoChatMentees().map((m) => ({
          ...m,
          last_message_at: null,
          last_message_preview: null,
        })),
        isEmptyArray,
      );
      setMentees(resolved);
      if (!resolved.some((mentee) => mentee.student_user_id === selectedMenteeId.current)) {
        selectMentee(resolved[0]?.student_user_id ?? null);
      }
      if (resolved.length === 0) {
        toast.error(err instanceof Error ? err.message : 'Failed to load mentees');
      }
    } finally {
      if (mounted.current && request === listRequest.current) setLoadingList(false);
    }
  }, [api, selectMentee]);

  const loadThread = useCallback(
    async (studentUserId: string) => {
      const request = ++threadRequest.current;
      const current = () => mounted.current && request === threadRequest.current
        && selectedMenteeId.current === studentUserId;
      setLoadingThread(true);
      try {
        const data = await api.get<ChatMessage[]>(
          `/api/academics/proctor/chat/thread/${encodeURIComponent(studentUserId)}`,
        );
        if (!current()) return;
        const demoThread =
          getFacultyPortalDemoPack().messages[1]?.messages.map((m, i) => ({
            message_id: m.message_id || `demo-chat-${i}`,
            sender_type: (m.sender === 'self' ? 'FACULTY' : 'STUDENT') as 'STUDENT' | 'FACULTY',
            message_text: m.body,
            sent_at: m.sent_at,
          })) ?? [];
        setMessages(withFacultyDemoFallback(data, demoThread, isEmptyArray));
        void loadMentees();
      } catch (err) {
        if (!current()) return;
        const demoThread =
          getFacultyPortalDemoPack().messages[1]?.messages.map((m, i) => ({
            message_id: m.message_id || `demo-chat-${i}`,
            sender_type: (m.sender === 'self' ? 'FACULTY' : 'STUDENT') as 'STUDENT' | 'FACULTY',
            message_text: m.body,
            sent_at: m.sent_at,
          })) ?? [];
        const resolved = withFacultyDemoFallback([], demoThread, isEmptyArray);
        setMessages(resolved);
        if (resolved.length === 0) {
          toast.error(err instanceof Error ? err.message : 'Failed to load chat');
        }
      } finally {
        if (current()) setLoadingThread(false);
      }
    },
    [api, loadMentees],
  );

  useEffect(() => {
    // Start the remote mentee-list request and its loading boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMentees();
  }, [loadMentees]);

  useEffect(() => {
    // A selected mentee starts a separate remote conversation request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selectedId) void loadThread(selectedId);
    return () => { threadRequest.current += 1; };
  }, [selectedId, loadThread]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function sendMessage() {
    const text = draft.trim();
    const studentUserId = selectedId;
    if (!text || !studentUserId || !mounted.current || loadingThread || sendLock.current) return;
    sendLock.current = true;
    setSending(true);
    try {
      if (isFacultyDemoSmokeId(studentUserId)) {
        setMessages((prev) => [
          ...prev,
          {
            message_id: `msg-demo-${Date.now()}`,
            sender_type: 'FACULTY',
            message_text: text,
            sent_at: new Date().toISOString(),
          },
        ]);
        setDraft('');
        toast.success('Message sent (demo)');
        await Promise.resolve();
        return;
      }
      await api.post('/api/academics/proctor/chat', {
        message: text,
        student_user_id: studentUserId,
      });
      if (!mounted.current || selectedMenteeId.current !== studentUserId) return;
      setDraft('');
      await loadThread(studentUserId);
    } catch (err) {
      if (mounted.current && selectedMenteeId.current === studentUserId) {
        toast.error(err instanceof Error ? err.message : 'Send failed');
      }
    } finally {
      sendLock.current = false;
      if (mounted.current) setSending(false);
    }
  }

  const selectedMentee = mentees.find((m) => m.student_user_id === selectedId);

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Mentorship Chat</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="flex flex-col border-t md:h-[420px] md:flex-row">
          <aside className="flex min-h-0 w-full shrink-0 flex-col border-b md:w-56 md:border-b-0 md:border-r">
            <p className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Mentees
            </p>
            <div className="max-h-48 min-h-0 flex-1 overflow-y-auto md:max-h-none">
              {loadingList && (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              )}
              {!loadingList && mentees.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">No mentees assigned.</p>
              )}
              {mentees.map((mentee) => (
                <button
                  key={mentee.student_user_id}
                  type="button"
                  onClick={() => selectMentee(mentee.student_user_id)}
                  className={cn(
                    'flex w-full items-center gap-2 border-b px-3 py-3 text-left transition hover:bg-muted/50',
                    selectedId === mentee.student_user_id && 'bg-muted',
                  )}
                >
                  <span className="relative">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">
                        {mentee.student_name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {mentee.unread_count > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{mentee.student_name}</span>
                    {mentee.last_message_preview && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {mentee.last_message_preview}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <div className="flex h-[420px] min-h-0 min-w-0 flex-col md:h-auto md:flex-1">
            {!selectedMentee ? (
              <p className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                Select a mentee to open the chat thread.
              </p>
            ) : (
              <>
                <div className="shrink-0 border-b px-4 py-2 break-words">
                  <p className="font-medium text-sgvu-navy">{selectedMentee.student_name}</p>
                  <p className="text-xs text-muted-foreground">{selectedMentee.student_email}</p>
                </div>

                <p className="shrink-0 border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
                  Note: Mentorship chats are temporary and auto-delete after 7 days. Use the Helpdesk for formal
                  grievances.
                </p>

                <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 break-words">
                  {loadingThread && (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  )}
                  {!loadingThread && messages.length === 0 && (
                    <p className="py-8 text-center text-sm text-muted-foreground">No messages yet. Say hello!</p>
                  )}
                  {!loadingThread &&
                    messages.map((msg) => {
                      const isFaculty = msg.sender_type === 'FACULTY';
                      return (
                        <div
                          key={msg.message_id}
                          className={cn('flex', isFaculty ? 'justify-end' : 'justify-start')}
                        >
                          <div
                            className={cn(
                              'max-w-[80%] rounded-2xl px-3 py-2 text-sm',
                              isFaculty
                                ? 'rounded-br-md bg-sgvu-navy text-white'
                                : 'rounded-bl-md bg-muted text-foreground',
                            )}
                          >
                            <p>{msg.message_text}</p>
                            <p
                              className={cn(
                                'mt-1 text-[10px]',
                                isFaculty ? 'text-white/70' : 'text-muted-foreground',
                              )}
                            >
                              {new Date(msg.sent_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                </div>

                <div className="flex shrink-0 gap-2 border-t p-3">
                  <Input
                    placeholder="Type a message…"
                    disabled={sending || loadingThread}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void sendMessage();
                      }
                    }}
                  />
                  <Button aria-label="Send message" onClick={() => void sendMessage()} disabled={sending || loadingThread || !draft.trim()}>
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
