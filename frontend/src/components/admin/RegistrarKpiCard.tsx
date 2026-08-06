'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type RegistrarKpiAccent =
  | 'blue'
  | 'indigo'
  | 'emerald'
  | 'green'
  | 'amber'
  | 'orange'
  | 'purple'
  | 'health';

const ACCENT_STYLES: Record<
  RegistrarKpiAccent,
  { iconWrap: string; icon: string; ring: string }
> = {
  blue: {
    iconWrap: 'bg-blue-500/10',
    icon: 'text-blue-600',
    ring: 'hover:border-blue-200',
  },
  indigo: {
    iconWrap: 'bg-indigo-500/10',
    icon: 'text-indigo-600',
    ring: 'hover:border-indigo-200',
  },
  emerald: {
    iconWrap: 'bg-emerald-500/10',
    icon: 'text-emerald-600',
    ring: 'hover:border-emerald-200',
  },
  green: {
    iconWrap: 'bg-green-500/10',
    icon: 'text-green-600',
    ring: 'hover:border-green-200',
  },
  amber: {
    iconWrap: 'bg-amber-500/10',
    icon: 'text-amber-600',
    ring: 'hover:border-amber-200',
  },
  orange: {
    iconWrap: 'bg-orange-500/10',
    icon: 'text-orange-600',
    ring: 'hover:border-orange-200',
  },
  purple: {
    iconWrap: 'bg-purple-500/10',
    icon: 'text-purple-600',
    ring: 'hover:border-purple-200',
  },
  health: {
    iconWrap: 'bg-gradient-to-br from-blue-500/15 to-emerald-500/15',
    icon: 'text-sgvu-navy',
    ring: 'hover:border-sgvu-gold/40',
  },
};

export function RegistrarKpiCard({
  title,
  value,
  subtitle,
  trendLabel,
  trendPositive = true,
  href,
  icon: Icon,
  accent = 'blue',
  loading = false,
  trailing,
  className,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  trendLabel?: string;
  trendPositive?: boolean;
  href?: string;
  icon: LucideIcon;
  accent?: RegistrarKpiAccent;
  loading?: boolean;
  trailing?: ReactNode;
  className?: string;
}) {
  const styles = ACCENT_STYLES[accent];
  const displayValue =
    typeof value === 'number' ? value.toLocaleString('en-IN') : value;

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
            {title}
          </p>
          {subtitle ? (
            <p className="text-[11px] leading-snug text-muted-foreground/90">{subtitle}</p>
          ) : null}
        </div>
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors',
            styles.iconWrap,
            styles.icon,
          )}
        >
          <Icon className="h-5 w-5" strokeWidth={1.9} aria-hidden />
        </span>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {loading ? (
            <Loader2 className="h-7 w-7 animate-spin text-sgvu-navy/40" />
          ) : (
            <p className="font-mono text-3xl font-black tabular-nums tracking-tight text-sgvu-navy md:text-[2rem]">
              {displayValue}
            </p>
          )}
          {trendLabel ? (
            <p
              className={cn(
                'mt-2 text-sm font-semibold',
                trendPositive ? 'text-emerald-600' : 'text-red-600',
              )}
            >
              <span aria-hidden>{trendPositive ? '▲' : '▼'}</span> {trendLabel}
            </p>
          ) : null}
        </div>
        {trailing}
      </div>
    </>
  );

  const sharedClass = cn(
    'flex h-full flex-col rounded-2xl border border-sgvu-navy/10 bg-white p-5 shadow-[0_8px_30px_rgba(8,35,74,0.06)] transition-all duration-200',
    'hover:-translate-y-0.5 hover:shadow-[0_12px_36px_rgba(8,35,74,0.1)]',
    styles.ring,
    href && 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-gold/50',
    className,
  );

  if (href) {
    return (
      <Link href={href} className={sharedClass} aria-label={`${title}: ${displayValue}`}>
        {body}
      </Link>
    );
  }

  return <div className={sharedClass}>{body}</div>;
}
