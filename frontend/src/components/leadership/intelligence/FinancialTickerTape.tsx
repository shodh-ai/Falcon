'use client';

import type { IntelligenceTicker } from '@/lib/api/api.leadership';

const GOLD = '#d6b65d';

function formatInr(value: number) {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)}L`;
  return `₹${value.toLocaleString('en-IN')}`;
}

type Props = {
  ticker: IntelligenceTicker | null;
};

export function FinancialTickerTape({ ticker }: Props) {
  const items = [
    { label: "Today's Revenue", value: ticker ? formatInr(ticker.revenue_today) : '—', positive: true },
    { label: "Today's Expense", value: ticker ? formatInr(ticker.expense_today) : '—', positive: false },
    { label: 'Net Profit', value: ticker ? formatInr(ticker.net_profit_today) : '—', positive: (ticker?.net_profit_today ?? 0) >= 0 },
    { label: 'Cash in Bank', value: ticker ? formatInr(ticker.cash_in_bank) : '—', positive: true },
  ];

  const doubled = [...items, ...items];

  return (
    <div className="overflow-hidden border-b border-white/10 bg-[#061a33] py-2">
      <div className="animate-marquee flex w-max gap-8 whitespace-nowrap px-4">
        {doubled.map((item, i) => (
          <div key={`${item.label}-${i}`} className="flex items-center gap-3 px-4">
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/50">{item.label}</span>
            <span
              className="font-mono text-lg font-black tabular-nums"
              style={{ color: item.positive ? '#22c55e' : '#ef4444' }}
            >
              {item.value}
            </span>
            <span className="text-white/20">|</span>
          </div>
        ))}
      </div>
      <style jsx>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
      `}</style>
    </div>
  );
}

export function FinancialTickerGrid({ ticker, variant = 'dark' }: Props & { variant?: 'dark' | 'light' }) {
  const isLight = variant === 'light';
  const items = [
    { label: "Today's Revenue", value: ticker ? formatInr(ticker.revenue_today) : '—', color: '#22c55e' },
    { label: "Today's Expense", value: ticker ? formatInr(ticker.expense_today) : '—', color: '#ef4444' },
    { label: 'Net Profit', value: ticker ? formatInr(ticker.net_profit_today) : '—', color: (ticker?.net_profit_today ?? 0) >= 0 ? '#22c55e' : '#ef4444' },
    { label: 'Cash in Bank', value: ticker ? formatInr(ticker.cash_in_bank) : '—', color: GOLD },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className={isLight ? 'rounded-lg border border-sgvu-navy/10 bg-white px-3 py-2' : 'rounded-lg border border-white/10 bg-white/5 px-3 py-2'}
        >
          <p className={`text-[9px] font-bold uppercase tracking-widest ${isLight ? 'text-muted-foreground' : 'text-white/40'}`}>
            {item.label}
          </p>
          <p className="font-mono text-xl font-black tabular-nums" style={{ color: item.color }}>
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}
