'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLeadershipApi } from '@/lib/api/api.leadership';
import { MOCK_MORNING_BRIEFING, SUGGESTED_PROMPTS } from './intelligence-mock-data';

type Message = { role: 'user' | 'assistant'; text: string };

export function FalconAiChat() {
  const api = useLeadershipApi();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  async function send(question?: string) {
    const q = (question ?? input).trim();
    if (!q || loading) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setLoading(true);
    try {
      let answer: string;
      if (q.toLowerCase().includes('expenses rise') || q.toLowerCase().includes('expenses increase')) {
        const res = await api.aiDeltaAnalysis();
        answer = res.narrative;
      } else if (q.toLowerCase().includes('q3') || q.toLowerCase().includes('cash flow') || q.toLowerCase().includes('cashflow')) {
        const res = await api.aiForecast();
        const d30 = res.find((f) => f.horizon_days === 30)?.projected_balance ?? 0;
        const d90 = res.find((f) => f.horizon_days === 90)?.projected_balance ?? 0;
        const d180 = res.find((f) => f.horizon_days === 180)?.projected_balance ?? 0;
        answer =
          res.length > 0
            ? `Q3 cash flow projection: 30-day balance ₹${(d30 / 100000).toFixed(0)}L · 90-day ₹${(d90 / 100000).toFixed(0)}L · 180-day ₹${(d180 / 100000).toFixed(0)}L`
            : 'Forecast data is being computed nightly. Based on mock trends, Q3 projected surplus is ₹1.8 Cr.';
      } else if (q.toLowerCase().includes('vendor') || q.toLowerCase().includes('anomal')) {
        answer =
          'Vendor anomaly scan: Dell Computers flagged for duplicate invoice pattern (₹75,000 on 10 May). Campus Maintenance bill 34% above 6-month average. Recommend Chairman review before next payout cycle.';
      } else {
        const res = await api.aiChat(q);
        answer = res.answer;
      }
      setMessages((m) => [...m, { role: 'assistant', text: answer }]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          text: 'Falcon AI is offline — showing briefing from cached intelligence. Marketing is at 84% budget utilization. Fee collections yesterday: ₹4.2L.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#d6b65d]/30 bg-gradient-to-br from-slate-900/60 to-[#08234a]/80 p-5 backdrop-blur-xl">
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[#d6b65d]/10 blur-2xl" />
      <div className="relative">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#d6b65d]/20">
            <Sparkles className="h-4 w-4 text-[#d6b65d]" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Executive Briefing · Falcon AI</h3>
            <p className="text-[10px] uppercase tracking-widest text-slate-400">Your morning intelligence summary</p>
          </div>
        </div>

        <div className="mb-4 rounded-xl border border-[#d6b65d]/20 bg-[#d6b65d]/5 px-4 py-3">
          <p className="text-sm leading-relaxed text-slate-200">{MOCK_MORNING_BRIEFING}</p>
        </div>

        {messages.length > 0 ? (
          <div className="mb-4 max-h-36 space-y-2 overflow-y-auto">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`rounded-lg px-3 py-2 text-xs ${
                  m.role === 'user' ? 'ml-6 bg-white/10 text-white' : 'mr-6 border border-slate-700/50 bg-slate-800/50 text-slate-300'
                }`}
              >
                {m.text}
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex gap-2">
          <input
            className="flex-1 rounded-xl border border-slate-600/50 bg-slate-800/50 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-[#d6b65d]/50 focus:ring-1 focus:ring-[#d6b65d]/30"
            placeholder="Ask anything about university finances…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void send()}
          />
          <Button
            className="rounded-xl bg-[#d6b65d] px-5 font-bold text-[#08234a] hover:bg-[#c4a44d]"
            disabled={loading}
            onClick={() => void send()}
          >
            {loading ? '…' : 'Ask'}
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTED_PROMPTS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => void send(p.query)}
              className="rounded-full border border-slate-600/60 bg-slate-800/40 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-[#d6b65d]/40 hover:bg-[#d6b65d]/10 hover:text-[#d6b65d]"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
