import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function StudentLoadingState({
  label = 'Loading…',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex min-h-[40vh] flex-col items-center justify-center gap-3', className)}>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-sgvu-navy/10 bg-white shadow-sm">
        <Loader2 className="h-7 w-7 animate-spin text-sgvu-navy" />
      </div>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
    </div>
  );
}
