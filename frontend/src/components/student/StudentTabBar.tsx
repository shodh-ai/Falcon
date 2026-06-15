'use client';

import { motion } from 'framer-motion';
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
              'relative inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors',
              isActive ? 'text-white' : 'text-muted-foreground hover:bg-background hover:text-sgvu-navy',
            )}
          >
            {isActive && (
              <motion.span
                layoutId="student-tab-pill"
                className="absolute inset-0 rounded-xl bg-sgvu-navy shadow-sm"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
            <span className="relative z-10">{tab.label}</span>
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
  );
}
