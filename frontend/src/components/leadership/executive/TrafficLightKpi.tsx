'use client';

import { cn } from '@/lib/utils';
import { EXECUTIVE_CARD, EXECUTIVE_TYPO } from './design-tokens';
import type { TrafficLightStatus } from './types';

export function TrafficLightKpi({
  label,
  value,
  sub,
  status: _status = 'green',
  hero = false,
}: {
  label: string;
  value: string;
  sub?: string;
  status?: TrafficLightStatus;
  hero?: boolean;
}) {
  void _status;
  return (
    <div className={cn(EXECUTIVE_CARD, 'bg-white p-5 md:p-6')}>
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-sgvu-navy/40" aria-hidden />
        <p className={EXECUTIVE_TYPO.cardTitle}>{label}</p>
      </div>
      <p
        className={cn(
          hero ? EXECUTIVE_TYPO.heroKpi : 'mt-2 font-mono text-3xl font-black tabular-nums md:text-4xl',
          'mt-3 text-sgvu-navy',
        )}
      >
        {value}
      </p>
      {sub ? <p className={cn('mt-2', EXECUTIVE_TYPO.bodySecondary)}>{sub}</p> : null}
    </div>
  );
}
