'use client';

import { cn } from '@/lib/utils';

type Tab = { id: string; label: string };

export function HrTabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 border-b border-gray-200">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              'relative px-4 py-2.5 text-sm font-semibold transition-colors',
              isActive ? 'text-sgvu-navy' : 'text-muted-foreground hover:text-sgvu-navy',
            )}
          >
            {tab.label}
            {isActive ? (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-sgvu-gold" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
