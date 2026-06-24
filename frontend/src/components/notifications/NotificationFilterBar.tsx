'use client';

import { cn } from '@/lib/utils';

type FilterOption<T extends string> = {
  id: T;
  label: string;
  count?: number;
};

export function NotificationFilterBar<T extends string>({
  options,
  active,
  onChange,
  size = 'md',
  className,
}: {
  options: FilterOption<T>[];
  active: T;
  onChange: (id: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border/70 bg-muted/30 p-1.5',
        className,
      )}
    >
      <div className="scrollbar-none -mx-0.5 flex gap-1.5 overflow-x-auto px-0.5">
        {options.map((opt) => {
          const selected = opt.id === active;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl font-semibold transition-colors',
                size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm',
                selected
                  ? 'bg-sgvu-navy text-white shadow-sm'
                  : 'text-muted-foreground hover:bg-background hover:text-sgvu-navy',
              )}
            >
              {opt.label}
              {opt.count != null && opt.count > 0 ? (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                    selected ? 'bg-white/20 text-white' : 'bg-sgvu-navy/10 text-sgvu-navy',
                  )}
                >
                  {opt.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
