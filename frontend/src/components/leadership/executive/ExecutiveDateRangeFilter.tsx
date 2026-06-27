'use client';

import { cn } from '@/lib/utils';
import { EXECUTIVE_PERIOD_OPTIONS, type ExecutivePeriod } from './types';

export function ExecutiveDateRangeFilter({
  value,
  onChange,
  className,
}: {
  value: ExecutivePeriod;
  onChange: (period: ExecutivePeriod) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap gap-1 rounded-xl border border-sgvu-navy/10 bg-white p-1', className)}>
      {EXECUTIVE_PERIOD_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
            value === opt.value
              ? 'bg-sgvu-navy text-white'
              : 'text-muted-foreground hover:bg-sgvu-surface hover:text-sgvu-navy',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
