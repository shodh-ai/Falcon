'use client';

import { cn } from '@/lib/utils';

type Tab = { id: string; label: string };

type Props = {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
};

export function CourseWorkspaceTabs({ tabs, active, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl border border-border/60 bg-muted/40 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            active === tab.id
              ? 'bg-background text-sgvu-navy shadow-sm'
              : 'text-muted-foreground hover:text-sgvu-navy',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
