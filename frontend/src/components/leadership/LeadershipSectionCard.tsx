import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { EXECUTIVE_CARD, EXECUTIVE_SPACING, EXECUTIVE_TYPO } from '@/components/leadership/executive/design-tokens';

export function LeadershipPageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className={cn(EXECUTIVE_CARD, 'relative overflow-hidden p-6 md:p-8')}>
      <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-sgvu-gold/10 blur-2xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className={EXECUTIVE_TYPO.eyebrow}>{eyebrow}</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-sgvu-navy sm:text-3xl">{title}</h1>
          {description ? <p className={cn('mt-3 max-w-3xl leading-relaxed', EXECUTIVE_TYPO.bodySecondary)}>{description}</p> : null}
        </div>
        {action}
      </div>
    </div>
  );
}

export function LeadershipSectionCard({
  title,
  description,
  action,
  children,
  className,
  id,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn(EXECUTIVE_CARD, EXECUTIVE_SPACING.card, className)}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className={EXECUTIVE_TYPO.sectionTitle}>{title}</h2>
          {description ? <p className={cn('mt-2', EXECUTIVE_TYPO.bodySecondary)}>{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function LeadershipMetricCard({
  label,
  value,
  sub,
  alert,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  alert?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        EXECUTIVE_CARD,
        'p-5 md:p-6',
        alert ? 'border-red-200 bg-red-50/80' : '',
      )}
    >
      <p className={EXECUTIVE_TYPO.cardTitle}>{label}</p>
      <p
        className={cn(
          'mt-3 font-mono text-3xl font-black tabular-nums md:text-4xl',
          alert ? 'text-red-600' : highlight ? 'text-sgvu-gold' : 'text-sgvu-navy',
        )}
      >
        {value}
      </p>
      {sub ? <p className={cn('mt-2', EXECUTIVE_TYPO.bodySecondary)}>{sub}</p> : null}
    </div>
  );
}
