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
  return (
    <div
      className={cn(
        'group rounded-2xl border border-border/70 bg-white/80 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-sgvu-gold/50 hover:shadow-md',
        className,
      )}
    >
      {Icon ? (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-sgvu-navy/5 text-sgvu-navy transition group-hover:bg-sgvu-gold/20">
          <Icon className="h-5 w-5" />
        </div>
      ) : null}
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold leading-6 text-sgvu-navy">{displayValue(value)}</p>
    </div>
  );
}
