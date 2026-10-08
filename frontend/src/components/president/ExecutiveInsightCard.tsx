'use client';

import { EXECUTIVE_TYPO } from '@/components/leadership/executive/design-tokens';
import { cn } from '@/lib/utils';

const DEFAULT_BRIEF =
  'Admissions are performing above target, fee collection has reached 82%, placement performance remains strong, while accreditation compliance requires immediate review.';

type ExecutiveInsightCardProps = {
  brief?: string;
  pendingApprovals?: number;
  criticalAlerts?: number;
  className?: string;
};

function StatusBadge({
  tone,
  label,
}: {
  tone: 'green' | 'amber' | 'red';
  label: string;
}) {
  const styles = {
    green: 'border-emerald-200/80 bg-emerald-50/90 text-emerald-800',
    amber: 'border-amber-200/80 bg-amber-50/90 text-amber-900',
    red: 'border-red-200/80 bg-red-50/90 text-red-800',
  }[tone];

  const dot = {
    green: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
  }[tone];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap',
        styles,
      )}
    >
      <span className={cn('h-2 w-2 shrink-0 rounded-full', dot)} />
      {label}
    </span>
  );
}

export function ExecutiveInsightCard({
  brief = DEFAULT_BRIEF,
  pendingApprovals = 5,
  criticalAlerts = 2,
  className,
}: ExecutiveInsightCardProps) {
  return (
    <section
      className={cn(
        'relative min-h-[100px] overflow-hidden rounded-2xl border border-sgvu-navy/10',
        'bg-gradient-to-r from-white via-[#f8fafc] to-sgvu-gold/5',
        'px-5 py-4 shadow-[0_8px_30px_rgba(8,35,74,0.06)] sm:px-6 sm:py-5',
        className,
      )}
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-sgvu-gold/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-10 left-1/3 h-24 w-24 rounded-full bg-sgvu-navy/5 blur-2xl" />

      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-black tracking-tight text-sgvu-navy sm:text-lg">
            President&apos;s Executive Brief
          </h3>
          <p className={cn('mt-2 max-w-3xl text-sm leading-relaxed', EXECUTIVE_TYPO.bodySecondary)}>
            {brief}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end lg:gap-2.5">
          <StatusBadge
            tone={criticalAlerts > 0 ? 'amber' : 'green'}
            label={criticalAlerts > 0 ? 'Needs Attention' : 'University Healthy'}
          />
          <StatusBadge tone="amber" label={`${pendingApprovals} Pending Approvals`} />
          <StatusBadge tone="red" label={`${criticalAlerts} Critical Alerts`} />
        </div>
      </div>
    </section>
  );
}
