'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FalconLoader } from '@/components/brand/FalconLoader';

export function FacultyStatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = 'navy',
  alert,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: LucideIcon;
  accent?: 'gold' | 'navy' | 'alert';
  alert?: boolean;
}) {
  const accentClass =
    accent === 'gold'
      ? 'border-l-sgvu-gold'
      : accent === 'alert'
        ? 'border-l-red-500'
        : 'border-l-sgvu-navy';

  return (
    <div
      className={cn(
        'rounded-xl border border-border/60 bg-card p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5',
        'border-l-4',
        accentClass,
        alert && 'ring-1 ring-amber-200/80',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground sm:text-sm">{label}</p>
        {Icon ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sgvu-navy/5 text-sgvu-navy">
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-black tracking-tight text-sgvu-navy sm:text-3xl">{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export function FacultyMetricChip({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string | number;
  emphasis?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 tabular-nums',
        emphasis
          ? 'border-sgvu-gold/40 bg-sgvu-gold/10 text-sgvu-navy'
          : 'border-border/60 bg-card text-sgvu-navy shadow-sm',
      )}
    >
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-base font-bold">{value}</span>
    </span>
  );
}

export function FacultyPanel({
  id,
  title,
  count,
  href,
  children,
  className,
  description,
}: {
  id?: string;
  title: string;
  count?: number;
  href?: string;
  children: ReactNode;
  className?: string;
  description?: string;
}) {
  return (
    <section
      id={id}
      className={cn('overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm', className)}
    >
      <div className="flex items-center justify-between border-b border-border/50 bg-muted/30 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="h-5 w-1 shrink-0 rounded-full bg-sgvu-gold" />
            <h2 className="text-sm font-bold text-sgvu-navy">{title}</h2>
            {count !== undefined ? (
              <span className="rounded-md bg-sgvu-navy/10 px-2 py-0.5 text-xs font-bold text-sgvu-navy">
                {count}
              </span>
            ) : null}
          </div>
          {description ? (
            <p className="mt-1 pl-3.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {href ? (
          <Link href={href} className="shrink-0 text-sm font-medium text-sgvu-navy hover:underline">
            View all →
          </Link>
        ) : null}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

export function FacultyEmptyState({
  title,
  description,
  className,
}: {
  title?: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-dashed border-border/80 bg-muted/20 px-6 py-10 text-center',
        className,
      )}
    >
      {title ? <p className="text-sm font-semibold text-sgvu-navy">{title}</p> : null}
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}

export function FacultyPageLoading({
  label = 'Loading…',
  branded = false,
  className,
}: {
  label?: string;
  branded?: boolean;
  className?: string;
}) {
  if (branded) {
    return <FalconLoader label={label} className={className} />;
  }

  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-16', className)}>
      <Loader2 className="h-8 w-8 animate-spin text-sgvu-navy" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

export function FacultyInlineLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin text-sgvu-navy" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function FacultyErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      {message}
    </div>
  );
}

export function FacultyTabBar<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string; icon?: LucideIcon }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border/60 bg-muted/30 p-1 scrollbar-thin">
      <div className="flex min-w-0 gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={cn(
                'inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                active === tab.id
                  ? 'bg-background text-sgvu-navy shadow-sm ring-1 ring-border/50'
                  : 'text-muted-foreground hover:bg-background/60 hover:text-sgvu-navy',
              )}
            >
              {Icon ? <Icon className="h-4 w-4 shrink-0 opacity-80" /> : null}
              <span className="whitespace-nowrap">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
