import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function ParentPageHeader({
  title,
  description,
  eyebrow = 'Parent Portal',
  actions,
  className,
}: {
  title: string;
  description: string;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[1.75rem] border border-sgvu-navy/10 bg-white p-5 shadow-sm md:p-6',
        className,
      )}
    >
      <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-sgvu-gold/15 blur-2xl" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-sgvu-gold">{eyebrow}</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-sgvu-navy sm:text-3xl">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
