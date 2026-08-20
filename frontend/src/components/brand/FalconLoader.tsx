import { cn } from '@/lib/utils';
import { FalconLogo } from '@/components/brand/FalconLogo';

export function FalconLoader({
  label = 'Loading Falcon workspace…',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex min-h-[40vh] flex-col items-center justify-center gap-4', className)}>
      <div className="relative">
        <div className="absolute inset-0 animate-ping rounded-2xl bg-sgvu-gold/20" />
        <div className="relative animate-pulse rounded-2xl shadow-lg ring-2 ring-sgvu-gold/30">
          <FalconLogo size={72} />
        </div>
      </div>
      <p suppressHydrationWarning className="text-sm font-medium text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
