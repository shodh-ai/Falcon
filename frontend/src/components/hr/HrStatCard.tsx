import type { LucideIcon } from 'lucide-react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export function HrStatCard({
  label,
  value,
  sub,
  trend,
  trendLabel,
  icon: Icon,
  accent = 'gold',
  alert,
}: {
  label: string;
  value: string | number;
  sub?: string;
  trend?: number;
  trendLabel?: string;
  icon?: LucideIcon;
  accent?: 'gold' | 'navy';
  alert?: boolean;
}) {
  const trendUp = (trend ?? 0) >= 0;

  return (
    <div
      className={cn(
        'rounded-xl border border-gray-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md',
        accent === 'gold' ? 'border-l-4 border-l-sgvu-gold' : 'border-l-4 border-l-sgvu-navy',
        alert && 'ring-1 ring-amber-200',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon ? (
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sgvu-navy/5 text-sgvu-navy">
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-3xl font-black tracking-tight text-sgvu-navy">{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
      {trendLabel ? (
        <p
          className={cn(
            'mt-2 flex items-center gap-1 text-sm font-medium',
            trendUp ? 'text-emerald-600' : 'text-red-600',
          )}
        >
          {trendUp ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          {trendLabel}
        </p>
      ) : null}
    </div>
  );
}
