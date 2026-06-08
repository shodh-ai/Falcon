'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/** Shared page shell — matches Falcon HR spacing */
export function HodPageFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-h-full space-y-5 px-4 py-5 sm:px-6 sm:py-6', className)}>
      {children}
    </div>
  );
}

export function HodPageHeader({
  title,
  description,
  meta,
  actions,
}: {
  title: string;
  description?: string;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
        <div className="absolute left-0 top-0 h-full w-1 bg-sgvu-gold" />
        <div className="pl-3">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-sgvu-gold">HOD Workspace</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-sgvu-navy">{title}</h1>
          {description ? (
            <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2 pl-3">{actions}</div> : null}
      </div>
      {meta ? (
        <div className="flex flex-wrap items-center gap-4 border-t border-gray-100 bg-slate-50/80 px-5 py-3 text-sm text-muted-foreground sm:px-6">
          {meta}
        </div>
      ) : null}
    </div>
  );
}

export function HodMetricChip({
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
          : 'border-slate-200 bg-white text-sgvu-navy',
      )}
    >
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-base font-bold">{value}</span>
    </span>
  );
}

export function HodPanel({
  title,
  count,
  href,
  children,
  className,
}: {
  title: string;
  count?: number;
  href?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm', className)}>
      <div className="flex items-center justify-between border-b border-gray-100 bg-slate-50/60 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5">
          <span className="h-5 w-1 rounded-full bg-sgvu-gold" />
          <h2 className="text-sm font-bold text-sgvu-navy">{title}</h2>
          {count !== undefined ? (
            <span className="rounded-md bg-sgvu-navy/10 px-2 py-0.5 text-xs font-bold text-sgvu-navy">
              {count}
            </span>
          ) : null}
        </div>
        {href ? (
          <Link href={href} className="text-sm font-medium text-sgvu-navy hover:underline">
            View all →
          </Link>
        ) : null}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

type HodColumn<T> = {
  key: string;
  label: string;
  className?: string;
  render: (row: T) => ReactNode;
};

export function HodDataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  empty,
}: {
  columns: HodColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  empty?: string;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-sgvu-navy" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-muted-foreground">
        {empty ?? 'No records.'}
      </p>
    );
  }

  return (
    <div className="w-full overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
      <table className="w-full min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-sgvu-navy/20 bg-sgvu-navy text-white">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn('px-4 py-3 text-xs font-semibold uppercase tracking-wide', col.className)}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={rowKey(row)}
              className={cn('border-b border-gray-100', i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50')}
            >
              {columns.map((col) => (
                <td key={col.key} className={cn('px-4 py-3 text-sgvu-navy', col.className)}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HodDayTabs({
  days,
  active,
  onChange,
  counts,
}: {
  days: { id: number; label: string }[];
  active: number | 'all';
  onChange: (id: number | 'all') => void;
  counts?: Record<number, number>;
}) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-gray-100 pb-3">
      <button
        type="button"
        onClick={() => onChange('all')}
        className={cn(
          'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
          active === 'all'
            ? 'bg-sgvu-navy text-white shadow-sm'
            : 'text-muted-foreground hover:bg-slate-100 hover:text-sgvu-navy',
        )}
      >
        All days
      </button>
      {days.map((d) => (
        <button
          key={d.id}
          type="button"
          onClick={() => onChange(d.id)}
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            active === d.id
              ? 'bg-sgvu-navy text-white shadow-sm'
              : 'text-muted-foreground hover:bg-slate-100 hover:text-sgvu-navy',
          )}
        >
          {d.label}
          {counts?.[d.id] ? <span className="ml-1.5 opacity-80">({counts[d.id]})</span> : null}
        </button>
      ))}
    </div>
  );
}

export function HodActionButton({
  children,
  href,
  variant = 'primary',
  onClick,
}: {
  children: ReactNode;
  href?: string;
  variant?: 'primary' | 'outline';
  onClick?: () => void;
}) {
  const buttonVariant = variant === 'primary' ? 'urgent' : 'outline';
  const cls = variant === 'primary' ? 'h-9 text-sm font-semibold' : 'h-9 text-sm text-sgvu-navy';

  if (href) {
    return (
      <Link href={href}>
        <Button variant={buttonVariant} size="default" className={cls}>
          {children}
        </Button>
      </Link>
    );
  }

  return (
    <Button variant={buttonVariant} size="default" className={cls} onClick={onClick}>
      {children}
    </Button>
  );
}

/** Standard table chrome for inline editable tables (course allocation, appraisals) */
export function HodTableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-gray-100 shadow-sm">{children}</div>
  );
}

export function HodTableHead({ columns }: { columns: string[] }) {
  return (
    <thead>
      <tr className="border-b border-sgvu-navy/20 bg-sgvu-navy text-white">
        {columns.map((h) => (
          <th key={h || 'action'} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
            {h}
          </th>
        ))}
      </tr>
    </thead>
  );
}
