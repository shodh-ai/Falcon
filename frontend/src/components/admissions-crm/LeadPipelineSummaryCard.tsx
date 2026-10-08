'use client';

import Link from 'next/link';
import { ArrowRight, Kanban, Loader2 } from 'lucide-react';
import { buildPipelineSummary } from '@/components/admissions-crm/admissions-crm-dashboard-data';
import {
  ADMISSIONS_CRM_PIPELINE_HREF,
  BRAND_BTN,
} from '@/components/admissions-crm/admissions-crm-constants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type LeadPipelineSummaryCardProps = {
  stageCounts: Record<string, number>;
  useDemo: boolean;
  loading?: boolean;
  className?: string;
};

export function LeadPipelineSummaryCard({
  stageCounts,
  useDemo,
  loading = false,
  className,
}: LeadPipelineSummaryCardProps) {
  const rows = buildPipelineSummary(stageCounts, useDemo);

  return (
    <Card className={cn('border-sgvu-navy/10 shadow-sm', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-bold text-sgvu-navy">
          <Kanban className="h-4 w-4 text-sgvu-gold" aria-hidden />
          Lead Pipeline Summary
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Stage counts at a glance — open the pipeline for drag-and-drop workflow.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading pipeline…
          </p>
        ) : (
          <ul className="space-y-2.5" aria-label="Pipeline stage counts">
            {rows.map((row) => (
              <li key={row.key} className="flex items-baseline gap-2">
                <span className="shrink-0 text-sm font-medium text-sgvu-navy">{row.label}</span>
                <span
                  className="mb-1 min-w-[1rem] flex-1 border-b border-dotted border-sgvu-navy/25"
                  aria-hidden
                />
                <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-sgvu-navy">
                  {row.count.toLocaleString('en-IN')}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link
          href={ADMISSIONS_CRM_PIPELINE_HREF}
          className={cn(
            'inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold',
            BRAND_BTN,
          )}
        >
          View Full Pipeline
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </CardContent>
    </Card>
  );
}
