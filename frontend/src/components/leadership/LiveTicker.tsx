'use client';

import { cn } from '@/lib/utils';

type TickerProps = {
  label: string;
  value: string | number;
  delta?: string;
  alert?: boolean;
};

export function LiveTicker({ label, value, delta, alert }: TickerProps) {
  return (
    <div
      className={cn(
        'rounded-[1.25rem] border px-4 py-4 shadow-sm',
        alert ? 'border-red-200 bg-red-50' : 'border-sgvu-navy/10 bg-white',
      )}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className={cn('mt-1 font-mono text-2xl font-black tabular-nums', alert ? 'text-red-600' : 'text-sgvu-navy')}>
        {value}
      </p>
      {delta ? <p className="mt-0.5 text-xs text-muted-foreground">{delta}</p> : null}
    </div>
  );
}

export function LiveTickerRow({ items }: { items: TickerProps[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <LiveTicker key={item.label} {...item} />
      ))}
    </div>
  );
}
