import { cn } from '@/lib/utils';

export type StudentTabItem<T extends string> = {
  id: T;
  label: string;
  count?: number;
};

export function StudentTabBar<T extends string>({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: StudentTabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap gap-2 rounded-2xl border border-border/70 bg-muted/30 p-1.5', className)}>
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition',
              isActive
                ? 'bg-sgvu-navy text-white shadow-sm'
                : 'text-muted-foreground hover:bg-background hover:text-sgvu-navy',
            )}
          >
            {tab.label}
            {tab.count != null ? (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-bold',
                  isActive ? 'bg-white/20 text-white' : 'bg-sgvu-navy/10 text-sgvu-navy',
                )}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
