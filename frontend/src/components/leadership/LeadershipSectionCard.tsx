import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function LeadershipPageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-[1.75rem] border border-sgvu-navy/10 bg-white p-5 shadow-sm md:p-6">
      <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-sgvu-gold/15 blur-2xl" />
      <div className="relative">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-sgvu-gold">{eyebrow}</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-sgvu-navy sm:text-3xl">{title}</h1>
        {description ? <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
    </div>
  );
}

export function LeadershipSectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-[1.25rem] border border-sgvu-navy/10 bg-white p-5 shadow-sm', className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-sgvu-navy">{title}</h2>
          {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function LeadershipMetricCard({
  label,
  value,
  sub,
  alert,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  alert?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-[1.25rem] border p-4 shadow-sm',
        alert ? 'border-red-200 bg-red-50' : 'border-sgvu-navy/10 bg-white',
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-2 font-mono text-2xl font-black tabular-nums',
          alert ? 'text-red-600' : highlight ? 'text-sgvu-gold' : 'text-sgvu-navy',
        )}
      >
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}
