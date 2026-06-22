'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export const onboardingInputClass =
  'flex h-11 w-full rounded-lg border border-border/80 bg-white px-3.5 text-sm shadow-sm transition placeholder:text-muted-foreground/70 focus-visible:border-sgvu-navy/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-navy/15';

export const onboardingSelectClass = onboardingInputClass;

export const onboardingTextareaClass =
  'min-h-[108px] w-full resize-y rounded-lg border border-border/80 bg-white px-3.5 py-3 text-sm shadow-sm transition placeholder:text-muted-foreground/70 focus-visible:border-sgvu-navy/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-navy/15';

export function OnboardingPanel({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-border/60 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.06)]',
        className,
      )}
    >
      <div className="border-b border-border/50 bg-gradient-to-br from-sgvu-surface/80 via-white to-white px-6 py-5 sm:px-8">
        <div className="flex items-start gap-4">
          {Icon ? (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sgvu-navy text-white shadow-sm">
              <Icon className="h-5 w-5" />
            </div>
          ) : null}
          <div>
            <h1 className="text-xl font-bold tracking-tight text-sgvu-navy sm:text-2xl">{title}</h1>
            {description ? (
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
      </div>
      <div className="px-6 py-6 sm:px-8 sm:py-8">{children}</div>
    </div>
  );
}

export function OnboardingSection({
  title,
  description,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-4', className)}>
      <div className="flex items-start gap-3 border-l-[3px] border-sgvu-gold/80 pl-3">
        {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0 text-sgvu-gold" /> : null}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-sgvu-navy">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

export function OnboardingField({
  id,
  label,
  required,
  hint,
  children,
  className,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-[13px] font-medium text-foreground/90">
        {label}
        {required ? <span className="text-sgvu-gold"> *</span> : null}
      </label>
      {children}
      {hint ? <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function OnboardingDivider() {
  return <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />;
}

export function OnboardingSidebarCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-sgvu-navy/10 bg-sgvu-navy/[0.02] p-5 shadow-sm',
        className,
      )}
    >
      <h3 className="font-semibold text-sgvu-navy">{title}</h3>
      {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

export function OnboardingAlert({
  title,
  children,
  variant = 'error',
}: {
  title: string;
  children: ReactNode;
  variant?: 'error' | 'info';
}) {
  return (
    <div
      className={cn(
        'rounded-xl border px-4 py-3 text-sm',
        variant === 'error' && 'border-red-200/80 bg-red-50 text-red-900',
        variant === 'info' && 'border-sky-200/80 bg-sky-50 text-sky-900',
      )}
    >
      <p className="font-semibold">{title}</p>
      <div className="mt-1 text-[13px] leading-relaxed opacity-90">{children}</div>
    </div>
  );
}
