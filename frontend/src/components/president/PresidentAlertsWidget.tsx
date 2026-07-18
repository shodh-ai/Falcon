'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, BellRing, ChevronDown, ChevronRight, ShieldAlert } from 'lucide-react';
import { EXECUTIVE_CARD, EXECUTIVE_TYPO } from '@/components/leadership/executive/design-tokens';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LiveStatusBadge } from './FillStatusBadge';
import { PRESIDENT_ALERTS } from './mockData';
import type { AlertSeverity, PresidentAlert } from './types';

const SEVERITY_STYLES: Record<AlertSeverity, { icon: typeof AlertTriangle }> = {
  critical: { icon: ShieldAlert },
  warning: { icon: AlertTriangle },
  info: { icon: BellRing },
};

function AlertRow({ alert }: { alert: PresidentAlert }) {
  const styles = SEVERITY_STYLES[alert.severity];
  const Icon = styles.icon;

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-sgvu-gold/40 hover:shadow-sm sm:flex-row sm:items-center sm:justify-between',
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-white/80 p-2 shadow-sm">
          <Icon className="h-4 w-4 text-[#0B2447]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-[#0B2447]">{alert.title}</p>
            <LiveStatusBadge status={alert.source === 'sample' ? 'Sample' : alert.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{alert.description}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-md bg-white/70 px-2 py-0.5 font-medium text-[#0B2447]">{alert.category}</span>
            <span>{alert.timestamp}</span>
          </div>
        </div>
      </div>
      <Button
        size="sm"
        className="w-48 shrink-0 justify-center gap-1.5 whitespace-nowrap bg-[#0B2447] px-4 text-white transition-colors hover:bg-[#123A6D] active:bg-sgvu-gold active:text-sgvu-navy focus-visible:ring-sgvu-gold"
        asChild
      >
        <Link href={alert.actionHref}>
          <span className="truncate">{alert.actionLabel}</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}

export function PresidentAlertsWidget({
  alerts = PRESIDENT_ALERTS,
  maxVisible = 3,
  className,
}: {
  alerts?: PresidentAlert[];
  maxVisible?: number;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = alerts.length > maxVisible;
  const visible = expanded ? alerts : alerts.slice(0, maxVisible);

  return (
    <section className={cn(EXECUTIVE_CARD, 'p-6 md:p-8', className)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className={EXECUTIVE_TYPO.sectionTitle}>Action Center & Smart Alerts</h2>
          <p className={cn('mt-1', EXECUTIVE_TYPO.bodySecondary)}>
            High-priority items requiring executive attention
          </p>
        </div>
        {/* Matches the w-48 action-button column inside rows (incl. their px-4 padding) so edges line up. */}
        <div className="flex w-full justify-center sm:w-48 sm:shrink-0 sm:pr-4">
          {hasMore ? (
            <button
              type="button"
              onClick={() => setExpanded((open) => !open)}
              aria-expanded={expanded}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-md py-1 text-xs font-bold text-sgvu-gold transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-gold focus-visible:ring-offset-2"
            >
              {expanded ? 'Show less' : `View all (${alerts.length})`}
              <ChevronDown
                className={cn('h-3.5 w-3.5 shrink-0 transition-transform', expanded && 'rotate-180')}
                aria-hidden="true"
              />
            </button>
          ) : (
            <Link
              href="/president/issues"
              className="inline-flex w-full items-center justify-center py-1 text-xs font-bold text-sgvu-gold hover:underline"
            >
              Open Escalations →
            </Link>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-8 text-center">
          <p className="font-semibold text-emerald-800">All clear — no pending executive alerts</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((alert) => (
            <AlertRow key={alert.id} alert={alert} />
          ))}
        </div>
      )}
    </section>
  );
}
