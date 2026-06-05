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
    default: 'border-border/70 bg-white',
    gold: 'border-sgvu-gold/30 bg-gradient-to-br from-sgvu-gold/10 to-white',
    success: 'border-emerald-200/70 bg-gradient-to-br from-emerald-50/80 to-white',
    warning: 'border-amber-200/70 bg-gradient-to-br from-amber-50/80 to-white',
  };

  return (
    <div
      className={cn(
        'group rounded-2xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md',
        toneStyles[tone],
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        {Icon ? (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sgvu-navy/5 text-sgvu-gold transition group-hover:bg-sgvu-gold/20">
            <Icon className="h-4 w-4" />
          </div>
        ) : null}
      </div>
      <p className="mt-3 text-3xl font-black tracking-tight text-sgvu-navy">{value}</p>
      {helper ? <p className="mt-1.5 text-xs font-medium text-muted-foreground">{helper}</p> : null}
    </div>
  );
}
