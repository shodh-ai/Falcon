'use client';

import { useId } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export type StudentTabItem<T extends string> = {
  id: T;
  label: string;
  count?: number;
  /** Shorter label for narrow screens */
  shortLabel?: string;
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
  const pillLayoutId = useId();

  return (
    <div
      className={cn(
        'rounded-2xl border border-border/70 bg-muted/30 p-1.5',
        className,
      )}
    >
      <div className="scrollbar-none -mx-0.5 flex gap-2 overflow-x-auto px-0.5">
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={cn(
                'relative inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors touch-target sm:px-4',
                isActive ? 'text-white' : 'text-muted-foreground hover:bg-background hover:text-sgvu-navy',
              )}
            >
              {isActive && (
                <motion.span
                  layoutId={pillLayoutId}
                  className="absolute inset-0 rounded-xl bg-sgvu-navy shadow-sm"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
              <span className="relative z-10">
                {tab.shortLabel ? (
                  <>
                    <span className="sm:hidden">{tab.shortLabel}</span>
                    <span className="hidden sm:inline">{tab.label}</span>
                  </>
                ) : (
                  tab.label
                )}
              </span>
              {tab.count != null ? (
                <span
                  className={cn(
                    'relative z-10 rounded-full px-2 py-0.5 text-xs font-bold',
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
    </div>
  );
}
