'use client';

import { cn } from '@/lib/utils';
import { EXECUTIVE_CARD, EXECUTIVE_TYPO } from './design-tokens';
import { TRAFFIC_LIGHT_STYLES, type TrafficLightStatus } from './types';

export function TrafficLightKpi({
  label,
  value,
  sub,
  status = 'green',
  hero = false,
}: {
  label: string;
  value: string;
  sub?: string;
  status?: TrafficLightStatus;
  hero?: boolean;
}) {
  const styles = TRAFFIC_LIGHT_STYLES[status];
  return (
    <div className={cn(EXECUTIVE_CARD, 'p-5 md:p-6', styles.border, styles.bg)}>
      <div className="flex items-center gap-2">
        <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', styles.dot)} aria-hidden />
        <p className={EXECUTIVE_TYPO.cardTitle}>{label}</p>
      </div>
      <p
        className={cn(
          hero ? EXECUTIVE_TYPO.heroKpi : 'mt-2 font-mono text-3xl font-black tabular-nums md:text-4xl',
          'mt-3',
          status === 'red' ? 'text-red-600' : status === 'yellow' ? 'text-amber-700' : 'text-sgvu-navy',
        )}
      >
        {value}
      </p>
      {sub ? <p className={cn('mt-2', EXECUTIVE_TYPO.bodySecondary)}>{sub}</p> : null}
    </div>
  );
}
