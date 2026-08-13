import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function FacultyPageHeader({
  title,
  description,
  subtitle,
  actions,
  meta,
  eyebrow = 'Faculty Portal',
  className,
  /** @deprecated Always renders the white header card; kept for call-site compatibility. */
  variant: _variant = 'hero',
}: {
  title?: string;
  /** Preferred description prop (existing call sites). */
  description?: string;
  /** Alias for description (spec / newer call sites). */
  subtitle?: string;
  actions?: ReactNode;
  meta?: ReactNode;
  eyebrow?: string;
  className?: string;
  variant?: 'hero' | 'compact';
}) {
  const body = description ?? subtitle ?? '';

  return (
    <div
      className={cn(
        'relative min-h-[100px] overflow-hidden rounded-xl border border-border/70 bg-white p-4 shadow-sm sm:min-h-[110px] sm:p-5 md:min-h-[120px] md:p-6',
        className,
      )}
    >
      <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-sgvu-gold/10 blur-2xl" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-sgvu-gold sm:text-xs">
            {eyebrow}
          </p>
          {title ? (
            <h1 className="mt-1 text-xl font-black tracking-tight text-sgvu-navy sm:text-2xl md:text-3xl">
              {title}
            </h1>
          ) : null}
          {body ? (
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{body}</p>
          ) : null}
          {meta ? <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div> : null}
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
