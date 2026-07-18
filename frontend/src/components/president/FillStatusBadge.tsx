'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type FillStatus = 'healthy' | 'warning' | 'critical';

const STATUS_CONFIG: Record<
  FillStatus,
  { label: string; variant: 'success' | 'warning' | 'destructive'; className: string }
> = {
  healthy: { label: 'On Track', variant: 'success', className: 'bg-emerald-100 text-emerald-800' },
  warning: { label: 'At Risk', variant: 'warning', className: 'bg-amber-100 text-amber-800' },
  critical: { label: 'Critical', variant: 'destructive', className: 'bg-red-100 text-red-800' },
};

export function fillStatusFromPercent(percent: number): FillStatus {
  if (percent >= 85) return 'healthy';
  if (percent >= 50) return 'warning';
  return 'critical';
}

export function FillStatusBadge({ status }: { status: FillStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge variant={config.variant} className={cn('font-semibold', config.className)}>
      {config.label}
    </Badge>
  );
}

export function LiveStatusBadge({ status }: { status: 'Live' | 'Pending' | 'Escalated' | 'Sample' }) {
  const styles = {
    Live: 'bg-red-100 text-red-800 border-red-200',
    Pending: 'bg-amber-100 text-amber-800 border-amber-200',
    Escalated: 'bg-sky-100 text-sky-800 border-sky-200',
    Sample: 'bg-slate-100 text-slate-700 border-slate-200',
  }[status];

  return (
    <Badge variant="outline" className={cn('text-[10px] font-bold uppercase tracking-wide', styles)}>
      {status}
    </Badge>
  );
}
