import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function PlacementFormField({
  label,
  hint,
  children,
  className,
  required,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
  required?: boolean;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="text-sm font-medium text-sgvu-navy">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export const selectClassName =
  'flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-gold/40';

export const textareaClassName =
  'min-h-[96px] w-full rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-gold/40';
