'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  Bot,
  Loader2,
  Maximize2,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { localStudentFaqAnswer, personalStudentAnswer } from '@/lib/student-ai-local-faq';
import {
  loadStudentAiContext,
  type StudentAiContext,
} from '@/lib/student-ai-context';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  href?: string | null;
};

type ChatbotResponse = {
  answer?: string;
  href?: string | null;
  source?: string;
  data?: { answer?: string; href?: string | null };
};

const SUGGESTIONS = [
  'What is my CGPA?',
  'How much fee do I owe?',
  'What is my attendance?',
  "What are today's classes?",
];

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatAssistantText(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function looksGenericGuide(answer: string): boolean {
  const a = answer.toLowerCase();
  return (
    a.includes('open my financial ledger') ||
    a.includes('open marks & grade') ||
    a.includes('i never invent') ||
    a.includes('cannot invent') ||
    a.includes("don't invent") ||
    a.includes('do not invent') ||
    (a.includes('open ') && a.includes(' to see') && !/\d+(\.\d+)?%/.test(a) && !/₹|rs\.?\s*\d/i.test(a))
  );
}

async function resolveAnswer(
  api: ReturnType<typeof useAuthedApi>,
  q: string,
  ctx: StudentAiContext | null,
): Promise<{ text: string; href: string | null }> {
  // Prefer personal answers with exact student numbers.
  const personal = personalStudentAnswer(q, ctx);
  if (personal?.personalized) {
    return { text: formatAssistantText(personal.answer), href: personal.href };
  }

  try {
    const res = await api.post<ChatbotResponse>('/api/integrations/chatbot/ask', {
      question: q,
    });
    const rawAnswer = res.answer ?? res.data?.answer;
    const href = res.href ?? res.data?.href ?? null;
    if (rawAnswer?.trim() && !looksGenericGuide(rawAnswer)) {
      return { text: formatAssistantText(rawAnswer), href };
    }
    // If API only returned a generic "open this page" guide, keep personal fallback.
    if (personal) {
      return { text: formatAssistantText(personal.answer), href: personal.href };
    }
    if (rawAnswer?.trim()) {
      return { text: formatAssistantText(rawAnswer), href };
    }
  } catch {
    // fall through to local FAQ
  }

  const local = localStudentFaqAnswer(q, ctx);
  return {
    text: formatAssistantText(
      local?.answer ||
        'I can help with your CGPA, fees, attendance, exams, timetable, and placements. Ask a specific question like “What is my CGPA?”',
    ),
    href: local?.href ?? '/student/helpdesk',
  };
}

export function StudentAiAssistantPanel({
  className,
  compact = false,
  onExpand,
}: {
  className?: string;
  compact?: boolean;
  onExpand?: () => void;
}) {
  const api = useAuthedApi();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [ctx, setCtx] = useState<StudentAiContext | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: "Hi — I'm Falcon AI. Ask about your CGPA, fees, attendance, today's classes, or exams and I'll answer with your actual portal data.",
    },
  ]);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const ctxRef = useRef<StudentAiContext | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadStudentAiContext(api).then((data) => {
      if (cancelled) return;
      setCtx(data);
      ctxRef.current = data;
      setMessages((prev) => {
        if (prev.length !== 1 || prev[0]?.id !== 'welcome') return prev;
        return [
          {
            id: 'welcome',
            role: 'assistant',
            text: `Hi ${data.name.split(' ')[0]} — I'm Falcon AI. Your CGPA is ${data.cgpa.toFixed(2)}, attendance ${data.attendance_percent}%, and pending fees ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(data.fee_outstanding)}. Ask me anything about your academics or campus services.`,
          },
        ];
      });
    });
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function send(question?: string) {
    const q = (question ?? input).trim();
    if (!q || loading) return;
    setInput('');
    setMessages((m) => [...m, { id: newId(), role: 'user', text: q }]);
    setLoading(true);
    // Reuse cached context (60s TTL); force refresh only when stale/missing.
    const fresh = await loadStudentAiContext(api).catch(() => ctxRef.current);
    if (fresh) {
      setCtx(fresh);
      ctxRef.current = fresh;
    }
    const result = await resolveAnswer(api, q, fresh ?? ctxRef.current);
    setMessages((m) => [
      ...m,
      { id: newId(), role: 'assistant', text: result.text, href: result.href },
    ]);
    setLoading(false);
  }

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-2xl border border-sgvu-navy/10 bg-white shadow-sm',
        compact ? 'h-[min(70vh,540px)]' : 'h-[min(72vh,680px)]',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-sgvu-navy px-4 py-3.5 text-white">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sgvu-gold/20 text-sgvu-gold">
            <Sparkles className="h-5 w-5" />
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-sgvu-navy bg-emerald-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold tracking-tight">Falcon AI</p>
            <p className="text-[11px] text-white/65">
              Online · {ctx ? `${ctx.name.split(' ')[0]}'s campus guide` : 'Campus guide'}
            </p>
          </div>
        </div>
        {onExpand ? (
          <button
            type="button"
            onClick={onExpand}
            className="rounded-xl p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
            aria-label="Open full assistant page"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_45%)] p-4 md:p-5">
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              'flex gap-2.5',
              m.role === 'user' ? 'justify-end' : 'justify-start',
            )}
          >
            {m.role === 'assistant' ? (
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sgvu-navy text-sgvu-gold">
                <Bot className="h-4 w-4" />
              </div>
            ) : null}
            <div
              className={cn(
                'max-w-[min(100%,34rem)] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap shadow-sm',
                m.role === 'user'
                  ? 'rounded-br-md bg-sgvu-navy text-white'
                  : 'rounded-bl-md border border-sgvu-navy/10 bg-white text-sgvu-navy',
              )}
            >
              <p>{m.text}</p>
              {m.role === 'assistant' && m.href ? (
                <Link
                  href={m.href}
                  className="mt-2.5 inline-flex items-center gap-1 rounded-full bg-sgvu-navy/5 px-2.5 py-1 text-[11px] font-semibold text-sgvu-navy transition hover:bg-sgvu-gold/20"
                >
                  Open related page
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
              ) : null}
            </div>
          </div>
        ))}

        {loading ? (
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sgvu-navy text-sgvu-gold">
              <Bot className="h-4 w-4" />
            </div>
            <div className="inline-flex items-center gap-2 rounded-2xl rounded-bl-md border border-sgvu-navy/10 bg-white px-3.5 py-2 text-xs font-medium text-muted-foreground shadow-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-sgvu-navy" />
              Checking your student record…
            </div>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {!compact && messages.length <= 2 ? (
        <div className="flex flex-wrap gap-2 border-t border-sgvu-navy/5 bg-slate-50/60 px-3 py-2.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={loading}
              onClick={() => void send(s)}
              className="rounded-full border border-sgvu-navy/10 bg-white px-3 py-1.5 text-[11px] font-semibold text-sgvu-navy transition hover:border-sgvu-gold/40 hover:bg-sgvu-gold/10 disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      <div className="border-t border-sgvu-navy/10 bg-white p-3 md:p-4">
        <div className="flex items-end gap-2 rounded-2xl border border-sgvu-navy/12 bg-slate-50/80 p-1.5 shadow-inner focus-within:border-sgvu-gold/50 focus-within:ring-2 focus-within:ring-sgvu-gold/20">
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
            placeholder="Ask: What is my CGPA? How much fee do I owe?"
            className="max-h-28 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-sgvu-navy outline-none placeholder:text-muted-foreground"
            disabled={loading}
            aria-label="Ask Falcon AI"
          />
          <Button
            type="button"
            disabled={loading || !input.trim()}
            onClick={() => void send()}
            className="h-11 w-11 shrink-0 rounded-xl border-0 bg-[#0B2447] p-0 text-[#F0C14B] shadow-md hover:bg-[#123A6D] hover:text-[#FFD666] disabled:pointer-events-none disabled:bg-[#0B2447] disabled:opacity-100 disabled:text-[#D4A84B]"
          >
            <Send className="h-5 w-5" strokeWidth={2.25} />
            <span className="sr-only">Send</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

export function StudentAiAssistantFab() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (pathname?.startsWith('/student/ai-assistant')) return null;

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
        aria-label={open ? 'Close Falcon AI' : 'Open Falcon AI Assistant'}
      >
        {open ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
      </button>

      {open ? (
        <div
          className={cn(
            'fixed z-50 w-[min(100vw-2rem,400px)]',
            'bottom-[calc(9.25rem+env(safe-area-inset-bottom))] right-4',
            'lg:bottom-28 lg:right-8',
          )}
        >
          <StudentAiAssistantPanel
            compact
            className="shadow-2xl shadow-sgvu-navy/20"
            onExpand={() => {
              setOpen(false);
              router.push('/student/ai-assistant');
            }}
          />
        </div>
      ) : null}
    </>
  );
}

export function StudentAiAssistantPageHero() {
  return (
    <section className="rounded-2xl border border-sgvu-navy/10 bg-white p-5 shadow-sm md:p-6">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sgvu-gold/20 text-sgvu-navy">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Campus AI
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-sgvu-navy sm:text-[1.75rem]">
            Falcon AI
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Ask about your CGPA, fees, attendance, exams, and timetable — answers use your student record, with a link to the full page when you need details.
          </p>
        </div>
      </div>
    </section>
  );
}
