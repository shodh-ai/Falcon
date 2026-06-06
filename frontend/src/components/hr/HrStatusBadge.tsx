import { cn } from '@/lib/utils';
import { hrStatusLabel, hrStatusTone, type HrStatusTone } from '@/lib/hr-status';

const TONE_CLASS: Record<HrStatusTone, string> = {
  success: 'bg-emerald-50 text-emerald-800 ring-emerald-200/60',
  warning: 'bg-amber-50 text-amber-900 ring-amber-200/60',
  danger: 'bg-red-50 text-red-800 ring-red-200/60',
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200/60',
};

export function HrStatusBadge({
  status,
  label,
  className,
}: {
  status: string | boolean;
  label?: string;
  className?: string;
}) {
  const tone = hrStatusTone(status);
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONE_CLASS[tone],
        className,
      )}
    >
      {label ?? hrStatusLabel(status)}
    </span>
  );
}
