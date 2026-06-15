'use client';

import { UserRound, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

export type WorkforceView = 'self' | 'team';

type Props = {
  value: WorkforceView;
  onChange: (view: WorkforceView) => void;
  showTeam?: boolean;
  className?: string;
};

export function SelfTeamToggle({ value, onChange, showTeam = true, className }: Props) {
  if (!showTeam) return null;

  return (
    <div className={cn('flex justify-center', className)}>
      <div className="inline-flex rounded-xl border border-border/80 bg-muted/40 p-1 shadow-sm">
        <button
          type="button"
          onClick={() => onChange('self')}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
            value === 'self'
              ? 'bg-background text-sgvu-navy shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <UserRound className="h-4 w-4" />
          Self
        </button>
        <button
          type="button"
          onClick={() => onChange('team')}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
            value === 'team'
              ? 'bg-background text-sgvu-navy shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Users className="h-4 w-4" />
          Team
        </button>
      </div>
    </div>
  );
}
