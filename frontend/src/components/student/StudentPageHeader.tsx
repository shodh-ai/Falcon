import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function StudentPageHeader({
  title,
  description,
  eyebrow = 'Student Portal',
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
        'relative overflow-hidden rounded-2xl border border-sgvu-navy/10 bg-white p-4 shadow-sm sm:overflow-visible sm:rounded-[1.75rem] sm:p-5 md:p-6',
        className,
      )}
    >
      <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-sgvu-gold/15 blur-2xl" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-sgvu-gold sm:text-xs">
            {eyebrow}
          </p>
          <h1 className="mt-1 text-xl font-black tracking-tight text-sgvu-navy sm:text-2xl md:text-3xl">
            {title}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
        {actions ? (
          <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap [&_button]:w-full sm:[&_button]:w-auto">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
