import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function PlacementPageHeader({
  eyebrow = 'Placement Cell',
  title,
  description,
  icon: Icon,
  actions,
  variant = 'hero',
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  variant?: 'hero' | 'simple';
}) {
  if (variant === 'simple') {
    return (
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {Icon ? (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sgvu-gold/20 text-sgvu-navy">
              <Icon className="h-5 w-5" />
            </div>
          ) : null}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{eyebrow}</p>
            <h1 className="text-2xl font-black tracking-tight text-sgvu-navy">{title}</h1>
            {description ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-[2rem] border border-sgvu-navy/10 bg-gradient-to-br from-sgvu-navy via-sgvu-navy to-slate-900 p-6 text-white shadow-xl shadow-sgvu-navy/15 md:p-8">
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-sgvu-gold/20 blur-3xl" />
        <div className="relative min-w-0 flex-1">
          <p className="text-sm font-semibold text-sgvu-gold">{eyebrow}</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
          {description ? <p className="mt-2 max-w-2xl text-sm font-medium text-white/75">{description}</p> : null}
        </div>
        {actions ? <div className="relative flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </section>
  );
}
