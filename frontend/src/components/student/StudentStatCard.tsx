import type { ComponentType } from 'react';
import { cn } from '@/lib/utils';

export function StudentStatCard({
  label,
  value,
  helper,
  icon: Icon,
  tone = 'default',
  className,
}: {
  label: string;
  value: string | number;
  helper?: string;
  icon?: ComponentType<{ className?: string }>;
  tone?: 'default' | 'gold' | 'success' | 'warning';
  className?: string;
}) {
  const toneStyles = {
    default: 'border-sgvu-navy/10 bg-white',
    gold: 'border-sgvu-navy/10 bg-white',
    success: 'border-sgvu-navy/10 bg-white',
    warning: 'border-sgvu-navy/10 bg-white',
  };

  return (
    <div
      className={cn(
        'group h-full min-w-0 rounded-2xl border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-5',
        toneStyles[tone],
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground sm:text-xs">
          {label}
        </p>
        {Icon ? (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sgvu-navy/5 text-sgvu-gold transition group-hover:bg-sgvu-gold/20">
            <Icon className="h-4 w-4" />
          </div>
        ) : null}
      </div>
      <p className="mt-3 break-words text-2xl font-black tracking-tight text-sgvu-navy sm:text-3xl">
        {value}
      </p>
      {helper ? <p className="mt-1.5 text-xs font-medium text-muted-foreground">{helper}</p> : null}
    </div>
  );
}
