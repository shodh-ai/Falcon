'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EXECUTIVE_CARD, EXECUTIVE_TYPO } from './design-tokens';

type Props = {
  label: string;
  value: string;
  sub?: string;
  status?: 'green' | 'yellow' | 'red' | 'neutral';
  chart?: ReactNode;
  details?: ReactNode;
  defaultExpanded?: boolean;
};

export function ExecutiveDrillDown({
  label,
  value,
  sub,
  status = 'neutral',
  chart,
  details,
  defaultExpanded = false,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showDetails, setShowDetails] = useState(false);

  const valueColor =
    status === 'red'
      ? 'text-red-600'
      : status === 'yellow'
        ? 'text-amber-700'
        : status === 'green'
          ? 'text-emerald-700'
          : 'text-sgvu-navy';

  return (
    <div className={cn(EXECUTIVE_CARD, 'overflow-hidden p-0')}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-4 p-6 text-left md:p-8"
      >
        <div>
          <p className={EXECUTIVE_TYPO.cardTitle}>{label}</p>
          <p className={cn('mt-2 font-mono text-4xl font-black tabular-nums md:text-5xl', valueColor)}>{value}</p>
          {sub ? <p className={cn('mt-2', EXECUTIVE_TYPO.bodySecondary)}>{sub}</p> : null}
        </div>
        {expanded ? (
          <ChevronUp className="h-5 w-5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" />
        )}
      </button>

      {expanded && chart ? (
        <div className="border-t border-sgvu-navy/10 px-6 pb-6 md:px-8 md:pb-8">{chart}</div>
      ) : null}

      {expanded && details ? (
        <div className="border-t border-sgvu-navy/10 px-6 pb-6 md:px-8 md:pb-8">
          {!showDetails ? (
            <button
              type="button"
              onClick={() => setShowDetails(true)}
              className="text-xs font-bold uppercase tracking-wider text-sgvu-gold hover:underline"
            >
              Show detail table →
            </button>
          ) : (
            <div className="mt-4">{details}</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
