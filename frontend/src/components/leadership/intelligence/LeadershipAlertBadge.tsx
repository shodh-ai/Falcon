'use client';

import Link from 'next/link';
import { useLeadershipIntelligenceOptional } from '@/components/leadership/intelligence/LeadershipIntelligenceProvider';
import { FinancialTickerGrid } from '@/components/leadership/intelligence/FinancialTickerTape';

export function LeadershipAlertBadge() {
  const ctx = useLeadershipIntelligenceOptional();
  const count = ctx?.alertCount ?? 0;
  if (count === 0) return null;
  return (
    <Link
      href="/leadership/intelligence"
      className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white"
    >
      {count} alert{count !== 1 ? 's' : ''}
    </Link>
  );
}

export function LeadershipMiniTicker() {
  const ctx = useLeadershipIntelligenceOptional();
  if (!ctx?.ticker) return null;
  return (
    <div className="rounded-xl border border-sgvu-navy/10 bg-slate-50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Live Financial Pulse</p>
        <Link href="/leadership/intelligence" className="text-[10px] font-bold text-sgvu-gold hover:underline">
          God-Mode →
        </Link>
      </div>
      <FinancialTickerGrid ticker={ctx.ticker} variant="light" />
    </div>
  );
}
