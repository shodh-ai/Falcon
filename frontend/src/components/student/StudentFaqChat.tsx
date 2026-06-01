'use client';

import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';

export function StudentFaqChat() {
  const api = useAuthedApi();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);

  async function ask() {
    if (!q.trim()) return;
    const res = await api.post<{ answer: string }>('/api/integrations/chatbot/ask', { question: q });
    setAnswer(res.answer);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-sgvu-navy text-white shadow-lg"
        aria-label="Open FAQ chat"
      >
        <MessageCircle className="h-6 w-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 rounded-xl border bg-card p-4 shadow-xl">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-semibold text-sgvu-navy">Falcon FAQ</p>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          ×
        </Button>
      </div>
      <textarea
        className="mb-2 w-full rounded-md border p-2 text-sm"
        rows={3}
        placeholder="e.g. What is the minimum attendance required?"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <Button size="sm" className="w-full" onClick={() => void ask()}>
        Ask
      </Button>
      {answer && <p className="mt-3 text-sm text-muted-foreground">{answer}</p>}
    </div>
  );
}
