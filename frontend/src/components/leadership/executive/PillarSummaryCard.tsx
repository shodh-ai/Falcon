'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TRAFFIC_LIGHT_STYLES, type PillarSummary } from './types';

export function PillarSummaryCard({ pillar }: { pillar: PillarSummary }) {
  const styles = TRAFFIC_LIGHT_STYLES[pillar.status];
  return (
    <Link
      href={pillar.href}
      className={cn(
        'group block rounded-[1.25rem] border p-4 shadow-sm transition hover:shadow-md',
        styles.border,
        styles.bg,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', styles.dot)} aria-hidden />
          <h3 className="text-sm font-bold text-sgvu-navy">{pillar.title}</h3>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-sgvu-navy" />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2">
        {pillar.kpis.map((kpi) => (
          <div key={kpi.label}>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{kpi.label}</dt>
            <dd className="font-mono text-2xl font-black tabular-nums text-sgvu-navy md:text-3xl">{kpi.value}</dd>
          </div>
        ))}
      </dl>
    </Link>
  );
}
