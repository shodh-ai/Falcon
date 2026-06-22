import type { ComponentType } from 'react';
import { cn } from '@/lib/utils';

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Not on file';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return JSON.stringify(value);
}

export function StudentInfoTile({
  label,
  value,
  icon: Icon,
  className,
}: {
  label: string;
  value: unknown;
  icon?: ComponentType<{ className?: string }>;
  className?: string;
}) {
  const shown = displayValue(value);
  return (
    <div
      className={cn(
        'group flex h-full flex-col rounded-2xl border border-border/70 bg-white/80 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-sgvu-gold/50 hover:shadow-md',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
        {Icon ? (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sgvu-navy/5 text-sgvu-navy transition group-hover:bg-sgvu-gold/20">
            <Icon className="h-4 w-4" />
          </div>
        ) : null}
      </div>
      <p className="mt-auto pt-3 text-sm font-semibold leading-snug text-sgvu-navy" title={shown}>
        {shown}
      </p>
    </div>
  );
}
