'use client';

import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EXECUTIVE_CARD, EXECUTIVE_TYPO } from '@/components/leadership/executive/design-tokens';

export function PresidentKpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = 'navy',
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: LucideIcon;
  accent?: 'navy' | 'gold' | 'green' | 'red';
  className?: string;
}) {
  const valueColor = {
    navy: 'text-sgvu-navy',
    gold: 'text-sgvu-gold',
    green: 'text-emerald-700',
    red: 'text-red-600',
  }[accent];

  return (
    <div
      className={cn(
        EXECUTIVE_CARD,
        'group p-6 transition hover:-translate-y-0.5 hover:shadow-[0_12px_40px_rgba(8,35,74,0.1)] md:p-8',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className={EXECUTIVE_TYPO.cardTitle}>{label}</p>
        {Icon ? (
          <div className="rounded-xl bg-[#0B2447]/5 p-2.5 text-[#0B2447] transition group-hover:bg-sgvu-gold/15 group-hover:text-sgvu-gold">
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
      </div>
      <p className={cn('mt-4 font-mono text-3xl font-black tabular-nums md:text-4xl', valueColor)}>{value}</p>
      {sub ? <p className={cn('mt-2', EXECUTIVE_TYPO.bodySecondary)}>{sub}</p> : null}
    </div>
  );
}
