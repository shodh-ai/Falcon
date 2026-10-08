'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Bot,
  Copy,
  Loader2,
  Maximize2,
  Paperclip,
  Pencil,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';
import { cn } from '@/lib/utils';
import { FacultyPageHeader } from '@/components/faculty/FacultyPageHeader';
import { FacultyAiMarkdown } from './FacultyAiMarkdown';
import {
  buildFacultyAiLocalAnswer,
  isFacultyAiGenericFallback,
  matchFacultyAiLocalAnswer,
  type FacultyAiLiveClass,
  type FacultyAiLiveContext,
  type FacultyAiLiveMeeting,
} from '@/lib/faculty-ai-local';
import { useAuth } from '@/context/AuthContext';
import {
  type FacultyAiChatResponse,
  type FacultyAiConversationSummary,
  type FacultyAiMessage,
} from './faculty-ai-types';
import {
  isEmptyArray,
  isFacultyDemoModeEnabled,
  withFacultyDemoFallback,
} from '@/lib/faculty-demo-mode';
import {
  facultyDemoAiConversations,
  facultyDemoMeetings,
} from '@/lib/mock/faculty-portal-demo';

function isSameLocalDay(iso: string | undefined | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function normalizeMeetings(raw: unknown): FacultyAiLiveMeeting[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const m = row as Record<string, unknown>;
    return {
      title: typeof m.title === 'string' ? m.title : 'Meeting',
      meeting_at:
        typeof m.meeting_at === 'string'
          ? m.meeting_at
          : typeof m.starts_at === 'string'
            ? m.starts_at
            : undefined,
      starts_at: typeof m.starts_at === 'string' ? m.starts_at : undefined,
      venue: typeof m.venue === 'string' ? m.venue : null,
    };
  });
}

function newLocalId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function readFileAsText(file: File): Promise<string> {
  const mime = file.type || '';
  if (
    mime.startsWith('text/') ||
    mime.includes('json') ||
    mime.includes('markdown') ||
    /\.(txt|md|csv|json)$/i.test(file.name)
  ) {
    return file.text();
  }
  // PDF / binary: send filename note; server prompts for paste if empty extract
  if (mime === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    return `[PDF attached: ${file.name}. Summarize once the user pastes key excerpts, or provide a structured summary checklist for this document.]`;
  }
  return `[File attached: ${file.name} (${mime || 'unknown type'})]`;
}

export function FacultyAiWorkspace({ compact = false }: { compact?: boolean }) {
  const api = useAuthedApi();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const bottomRef = useRef<HTMLDivElement>(null);
  const generationRef = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const prefillsApplied = useRef(false);
  const liveCtxRef = useRef<FacultyAiLiveContext>({});

  const [conversations, setConversations] = useState<FacultyAiConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<FacultyAiMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<{
    name: string;
    mime: string;
    size: number;
    text: string;
  } | null>(null);

  const loadLiveFacultyContext = useCallback(async (): Promise<FacultyAiLiveContext> => {
    const facultyName = user?.name ?? undefined;
    const [todayRes, missingRes, aiCtxRes] = await Promise.allSettled([
      api.get<FacultyAiLiveClass[]>('/api/academics/faculty/timetable/today'),
      api.get<FacultyAiLiveClass[]>('/api/academics/faculty/attendance/missing'),
      api.get<{
        faculty_name?: string;
        today_classes?: FacultyAiLiveClass[];
        pending_attendance?: FacultyAiLiveClass[];
        meetings_today?: unknown[];
      }>('/api/faculty-ai/context'),
    ]);

    const fromAi =
      aiCtxRes.status === 'fulfilled' && aiCtxRes.value
        ? aiCtxRes.value
        : null;

    const todayClasses =
      todayRes.status === 'fulfilled' && Array.isArray(todayRes.value)
        ? todayRes.value
        : Array.isArray(fromAi?.today_classes)
          ? fromAi.today_classes
          : [];

    const missingAttendance =
      missingRes.status === 'fulfilled' && Array.isArray(missingRes.value)
        ? missingRes.value
        : Array.isArray(fromAi?.pending_attendance)
          ? fromAi.pending_attendance
          : [];

    let meetingsToday = normalizeMeetings(fromAi?.meetings_today);
    if (!meetingsToday.length && isFacultyDemoModeEnabled()) {
      meetingsToday = facultyDemoMeetings(user?.user_id)
        .filter((m) => isSameLocalDay(m.starts_at))
        .map((m) => ({
          title: m.title,
          meeting_at: m.starts_at,
          starts_at: m.starts_at,
          venue: m.venue,
        }));
    }

    const ctx: FacultyAiLiveContext = {
      facultyName: fromAi?.faculty_name ?? facultyName,
      todayClasses,
      missingAttendance,
      meetingsToday,
    };
    liveCtxRef.current = ctx;
    return ctx;
  }, [api, user?.user_id, user?.name]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const refreshConversations = useCallback(async () => {
    try {
      const rows = await api.get<FacultyAiConversationSummary[]>('/api/faculty-ai/conversations');
      setConversations(
        withFacultyDemoFallback(
          rows,
          facultyDemoAiConversations() as FacultyAiConversationSummary[],
          isEmptyArray,
        ),
      );
    } catch {
      setConversations(
        withFacultyDemoFallback(
          [],
          facultyDemoAiConversations() as FacultyAiConversationSummary[],
          isEmptyArray,
        ),
      );
    }
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [rows] = await Promise.all([
          api.get<FacultyAiConversationSummary[]>('/api/faculty-ai/conversations').catch(() => []),
          loadLiveFacultyContext().catch(() => liveCtxRef.current),
        ]);
        if (!cancelled) {
          setConversations(
            withFacultyDemoFallback(
              Array.isArray(rows) ? rows : [],
              facultyDemoAiConversations() as FacultyAiConversationSummary[],
              isEmptyArray,
            ),
          );
        }
      } catch {
        if (!cancelled) {
          setConversations(
            withFacultyDemoFallback(
              [],
              facultyDemoAiConversations() as FacultyAiConversationSummary[],
              isEmptyArray,
            ),
          );
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, loadLiveFacultyContext]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, scrollToBottom]);

  useEffect(() => {
    if (compact || prefillsApplied.current) return;
    const q = searchParams.get('q');
    if (q?.trim()) {
      setInput(q.trim());
      prefillsApplied.current = true;
    }
  }, [compact, searchParams]);

  const startNewChat = () => {
    generationRef.current += 1;
    setActiveId(null);
    setMessages([]);
    setAttachment(null);
    setInput('');
    setError(null);
  };

  const stopGeneration = () => {
    generationRef.current += 1;
    setLoading(false);
    setError('Generation stopped. You can send again or regenerate.');
  };

  const send = async (raw?: string, opts?: { regenerate?: boolean; promptType?: string | null }) => {
    const text = (raw ?? input).trim();
    if (!text && !opts?.regenerate) return;
    if (loading) return;

    setError(null);
    setLoading(true);
    const promptType = opts?.promptType ?? null;
    const gen = ++generationRef.current;

    if (!opts?.regenerate) {
      const optimistic: FacultyAiMessage = {
        message_id: newLocalId(),
        role: 'user',
        content: text,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);
      setInput('');
    }

    const promptText =
      text || messages.filter((m) => m.role === 'user').at(-1)?.content || 'Continue';

    const appendAssistant = (assistant: FacultyAiMessage, replaceLastAssistant: boolean) => {
      if (replaceLastAssistant) {
        setMessages((prev) => {
          const withoutLastAssistant = [...prev];
          for (let i = withoutLastAssistant.length - 1; i >= 0; i--) {
            if (withoutLastAssistant[i].role === 'assistant') {
              withoutLastAssistant.splice(i, 1);
              break;
            }
          }
          return [...withoutLastAssistant, assistant];
        });
      } else {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === 'user' && last.message_id.startsWith('local-')) {
            // keep optimistic user bubble
          }
          return [...next, assistant];
        });
      }
    };

    try {
      // Refresh live roster so timetable/attendance answers stay exact.
      const liveCtx = await loadLiveFacultyContext().catch(() => liveCtxRef.current);

      let res: FacultyAiChatResponse | null = null;
      try {
        res = await api.post<FacultyAiChatResponse>('/api/faculty-ai/chat', {
          content: promptText,
          conversation_id: activeId ?? undefined,
          prompt_type: promptType ?? undefined,
          regenerate: opts?.regenerate ?? false,
          attachments: attachment
            ? [{ name: attachment.name, mime: attachment.mime, size: attachment.size, text: attachment.text }]
            : undefined,
        });
      } catch {
        res = null;
      }

      if (gen !== generationRef.current) return;

      // Prefer intent-matched portal answers (works offline + for short phrases).
      const localExact = matchFacultyAiLocalAnswer(promptText, liveCtx);
      const serverContent = res?.assistant_message?.content ?? '';
      const serverUseful =
        Boolean(serverContent.trim()) && !isFacultyAiGenericFallback(serverContent);

      if (localExact) {
        const assistantLocal: FacultyAiMessage = {
          message_id: newLocalId(),
          role: 'assistant',
          content: localExact,
          created_at: new Date().toISOString(),
        };
        appendAssistant(assistantLocal, Boolean(opts?.regenerate));
        setAttachment(null);
        setError(null);
        if (res?.conversation_id) setActiveId(res.conversation_id);
        if (res) await refreshConversations().catch(() => undefined);
        return;
      }

      if (res && serverUseful) {
        setActiveId(res.conversation_id);
        setAttachment(null);
        if (opts?.regenerate) {
          appendAssistant(res.assistant_message, true);
        } else {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === 'user' && last.message_id.startsWith('local-')) {
              next[next.length - 1] = res!.user_message;
            }
            return [...next, res!.assistant_message];
          });
        }
        await refreshConversations();
        return;
      }

      const exact = buildFacultyAiLocalAnswer(promptText, liveCtx);
      const assistantLocal: FacultyAiMessage = {
        message_id: newLocalId(),
        role: 'assistant',
        content: exact,
        created_at: new Date().toISOString(),
      };
      appendAssistant(assistantLocal, Boolean(opts?.regenerate));
      setAttachment(null);
      setError(null);
      if (res?.conversation_id) setActiveId(res.conversation_id);
      if (res) await refreshConversations().catch(() => undefined);
    } catch (err) {
      if (gen !== generationRef.current) return;

      const liveCtx = await loadLiveFacultyContext().catch(() => liveCtxRef.current);
      const localAnswer = buildFacultyAiLocalAnswer(promptText, liveCtx);
      const assistantLocal: FacultyAiMessage = {
        message_id: newLocalId(),
        role: 'assistant',
        content: localAnswer,
        created_at: new Date().toISOString(),
      };
      appendAssistant(assistantLocal, Boolean(opts?.regenerate));

      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('too large')) setError(msg);
      else setError(null);
    } finally {
      if (gen === generationRef.current) setLoading(false);
    }
  };

  const renameActive = async () => {
    if (!activeId) return;
    const current = conversations.find((c) => c.conversation_id === activeId)?.title ?? 'Conversation';
    const title = window.prompt('Rename conversation', current);
    if (!title?.trim()) return;
    try {
      await api.patch(`/api/faculty-ai/conversations/${activeId}`, { title: title.trim() });
      await refreshConversations();
      toast.success('Conversation renamed');
    } catch {
      toast.error('Could not rename conversation');
    }
  };

  const deleteActive = async () => {
    if (!activeId) return;
    if (!window.confirm('Delete this conversation? This cannot be undone.')) return;
    try {
      await api.del(`/api/faculty-ai/conversations/${activeId}`);
      startNewChat();
      await refreshConversations();
      toast.success('Conversation deleted');
    } catch {
      toast.error('Could not delete conversation');
    }
  };

  const copyMessage = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Copy failed');
    }
  };

  const onPickFile = async (file: File | null) => {
    if (!file) return;
    if (file.size > 2_000_000) {
      toast.error('Keep attachments under 2 MB (text extract).');
      return;
    }
    try {
      const text = await readFileAsText(file);
      setAttachment({
        name: file.name,
        mime: file.type || 'application/octet-stream',
        size: file.size,
        text,
      });
      toast.success(`Attached ${file.name}`);
    } catch {
      toast.error('Could not read file');
    }
  };

  const chatPanel = (
    <div
      className={cn(
        'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-white shadow-sm',
        compact ? 'h-full' : 'h-[min(72vh,680px)] min-h-[min(70vh,420px)] sm:min-h-[560px]',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sgvu-navy text-sgvu-gold">
            <Bot className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-sgvu-navy">
              {activeId
                ? conversations.find((c) => c.conversation_id === activeId)?.title || 'Conversation'
                : 'New conversation'}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Ask anything academic or administrative
            </p>
          </div>
        </div>
        {activeId ? (
          <div className="flex flex-wrap gap-1">
            <Button
              type="button"
              size="sm"
              className="h-8 border-0 bg-sgvu-navy px-2 text-sgvu-gold hover:bg-[#123A6D] active:bg-sgvu-gold active:text-sgvu-navy"
              onClick={() => void renameActive()}
              aria-label="Rename"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 border-0 bg-sgvu-navy px-2 text-sgvu-gold hover:bg-[#123A6D] active:bg-sgvu-gold active:text-sgvu-navy"
              onClick={() => void deleteActive()}
              aria-label="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-gradient-to-b from-slate-50/80 to-white px-3 py-4 sm:px-4">
        {booting ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading Faculty AI…
          </div>
        ) : null}

        {messages.map((m) => (
          <div
            key={m.message_id}
            className={cn('flex gap-2', m.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            {m.role === 'assistant' ? (
              <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sgvu-navy text-sgvu-gold">
                <Bot className="h-4 w-4" />
              </div>
            ) : null}
            <div
              className={cn(
                'max-w-[min(100%,42rem)] rounded-2xl px-3.5 py-2.5 shadow-sm',
                m.role === 'user'
                  ? 'rounded-br-md bg-sgvu-navy text-white'
                  : 'rounded-bl-md border border-sgvu-navy/10 bg-white text-sgvu-navy',
              )}
            >
              {m.role === 'assistant' ? (
                <FacultyAiMarkdown content={m.content} />
              ) : (
                <p className="whitespace-pre-wrap text-sm">{m.content}</p>
              )}
              {m.role === 'assistant' ? (
                <div className="mt-2 flex flex-wrap gap-1 border-t border-border/50 pt-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => void copyMessage(m.content)}
                  >
                    <Copy className="mr-1 h-3 w-3" /> Copy
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px]"
                    disabled={loading}
                    onClick={() => void send(undefined, { regenerate: true })}
                  >
                    <RefreshCw className="mr-1 h-3 w-3" /> Regenerate
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        ))}

        {loading ? (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sgvu-navy text-sgvu-gold">
              <Bot className="h-4 w-4" />
            </div>
            <div className="inline-flex items-center gap-2 rounded-2xl rounded-bl-md border border-sgvu-navy/10 bg-white px-3.5 py-2 text-xs font-medium text-muted-foreground shadow-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-sgvu-navy" />
              Thinking…
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {error}
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border/60 bg-white p-3">
        {attachment ? (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-sgvu-gold/30 bg-sgvu-gold/10 px-2.5 py-1.5 text-[11px]">
            <span className="truncate font-semibold text-sgvu-navy">{attachment.name}</span>
            <button type="button" onClick={() => setAttachment(null)} className="text-sgvu-navy" aria-label="Remove attachment">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
        <div className="flex items-center gap-2 rounded-2xl border border-sgvu-navy/15 bg-white p-2 shadow-sm focus-within:border-sgvu-navy/40 focus-within:ring-2 focus-within:ring-sgvu-gold/25">
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".txt,.md,.csv,.json,.pdf,text/*"
            onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0 rounded-xl text-sgvu-navy hover:bg-sgvu-navy/5 hover:text-sgvu-navy"
            onClick={() => fileRef.current?.click()}
            aria-label="Attach file"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <textarea
            value={input}
            rows={1}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Ask Faculty AI — lesson plans, quizzes, research, notices…"
            className="max-h-36 min-h-11 flex-1 resize-none bg-transparent px-1 py-2.5 text-sm leading-6 text-sgvu-navy outline-none placeholder:text-muted-foreground"
            aria-label="Message Faculty AI"
          />
          {loading ? (
            <Button
              type="button"
              onClick={stopGeneration}
              className="h-11 w-11 shrink-0 rounded-xl border-0 bg-rose-700 p-0 text-white hover:bg-rose-800 active:bg-sgvu-gold active:text-sgvu-navy"
              aria-label="Stop generation"
            >
              <Square className="h-4 w-4 fill-current" />
            </Button>
          ) : (
            <Button
              type="button"
              disabled={!input.trim()}
              onClick={() => void send()}
              className={cn(
                'h-11 w-11 shrink-0 rounded-xl border-0 p-0 shadow-sm transition',
                'bg-sgvu-navy text-sgvu-gold',
                'hover:bg-[#123A6D] hover:text-sgvu-gold',
                'active:bg-sgvu-gold active:text-sgvu-navy',
                'disabled:pointer-events-none disabled:bg-sgvu-navy disabled:text-sgvu-gold disabled:opacity-100',
              )}
              aria-label="Send"
            >
              <Send className="h-5 w-5" strokeWidth={2.25} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  if (compact) {
    return (
      <div className="flex h-[min(60vh,480px)] min-w-0 flex-col overflow-hidden rounded-2xl border border-sgvu-navy/15 shadow-xl sm:h-[min(70vh,560px)]">
        {chatPanel}
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden">
      <FacultyPageHeader
        title="Faculty AI Assistant"
        description="Your intelligent academic assistant."
      />
      {chatPanel}
    </div>
  );
}

export function FacultyAiAssistantFab() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (pathname?.startsWith('/faculty/ai-assistant')) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'fixed z-50 flex h-14 w-14 items-center justify-center rounded-full',
          'border-2 border-sgvu-gold/60 bg-[#0B2447] text-[#F0C14B] shadow-xl shadow-sgvu-navy/30',
          'transition hover:scale-105 hover:bg-[#123A6D] hover:text-[#FFD666]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-gold',
          'bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4',
          'lg:bottom-8 lg:right-8',
        )}
        aria-label={open ? 'Close Faculty AI' : 'Open Faculty AI Assistant'}
      >
        {open ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
      </button>

      {open ? (
        <div
          className={cn(
            'fixed z-50 max-w-[calc(100vw-1rem)] w-[min(100vw-1rem,420px)]',
            'bottom-[calc(9.25rem+env(safe-area-inset-bottom))] right-2 left-2 sm:left-auto sm:right-4',
            'lg:bottom-28 lg:right-8 lg:left-auto',
          )}
        >
          <div className="min-w-0 overflow-hidden rounded-2xl border border-sgvu-navy/15 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
              <p className="text-xs font-bold text-sgvu-navy">Faculty AI</p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 gap-1 px-2 text-xs"
                onClick={() => {
                  setOpen(false);
                  router.push('/faculty/ai-assistant');
                }}
              >
                <Maximize2 className="h-3.5 w-3.5" /> Expand
              </Button>
            </div>
            <FacultyAiWorkspace compact />
          </div>
        </div>
      ) : null}
    </>
  );
}

