'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { EXECUTIVE_CARD, EXECUTIVE_SPACING, EXECUTIVE_TYPO } from './design-tokens';

export function ExecutiveCard({
  title,
  description,
  action,
  children,
  className,
  id,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn(EXECUTIVE_CARD, EXECUTIVE_SPACING.card, className)}>
      {title ? (
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className={EXECUTIVE_TYPO.sectionTitle}>{title}</h2>
            {description ? <p className={cn('mt-2', EXECUTIVE_TYPO.bodySecondary)}>{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function ExecutiveHeroKpi({
  label,
  value,
  sub,
  status,
}: {
  label: string;
  value: string;
  sub?: string;
  status?: 'green' | 'yellow' | 'red' | 'neutral';
}) {
  const valueClass =
    status === 'red'
      ? 'text-red-600'
      : status === 'yellow'
        ? 'text-amber-700'
        : status === 'green'
          ? 'text-emerald-700'
          : 'text-sgvu-navy';

  return (
    <div className={cn(EXECUTIVE_CARD, 'p-6 md:p-8')}>
      <p className={EXECUTIVE_TYPO.cardTitle}>{label}</p>
      <p className={cn(EXECUTIVE_TYPO.heroKpi, 'mt-3', valueClass)}>{value}</p>
      {sub ? <p className={cn('mt-2', EXECUTIVE_TYPO.bodySecondary)}>{sub}</p> : null}
    </div>
  );
}
