import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function FacultyPageHeader({
  title,
  description,
  actions,
  meta,
  eyebrow,
  variant = 'compact',
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
  eyebrow?: string;
  /** hero = dashboard welcome card; compact = description only (title lives in top bar) */
  variant?: 'hero' | 'compact';
}) {
  if (variant === 'hero') {
    return (
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
        <div className="relative flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-6">
          <div className="absolute left-0 top-0 h-full w-1 bg-sgvu-gold" />
          <div className="min-w-0 pl-3">
            {eyebrow ? (
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-sgvu-gold">{eyebrow}</p>
            ) : null}
            <h1 className={cn('font-black tracking-tight text-sgvu-navy', eyebrow ? 'mt-1 text-2xl sm:text-3xl' : 'text-2xl sm:text-3xl')}>
              {title ?? ''}
            </h1>
            {description ? (
              <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2 pl-3 shrink-0">{actions}</div> : null}
        </div>
        {meta ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border/50 bg-muted/30 px-4 py-3 sm:gap-3 sm:px-6">
            {meta}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3 border-b border-border/50 pb-4">
      {description ? (
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {meta ? <div className="flex flex-wrap items-center gap-2">{meta}</div> : null}
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
