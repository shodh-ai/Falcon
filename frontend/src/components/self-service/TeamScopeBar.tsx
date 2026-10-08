'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuthedApi } from '@/lib/api';

const SCOPES = [
  { id: 'direct', label: 'Direct Reports' },
  { id: 'indirect', label: 'Indirect Reports' },
  { id: 'dept', label: 'Department' },
] as const;

export type TeamScope = (typeof SCOPES)[number]['id'];

type Props = {
  defaultScope?: TeamScope;
};

export function TeamScopeBar({ defaultScope = 'direct' }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = searchParams.get('scope') as TeamScope | null;
  const active =
    raw === 'indirect' || raw === 'dept' || raw === 'direct' ? raw : defaultScope;

  function setScope(scope: TeamScope) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('scope', scope);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
      {SCOPES.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => setScope(s.id)}
          className={cn(
            'rounded-md px-3 py-2 text-sm font-medium transition-colors',
            active === s.id ? 'bg-background text-sgvu-navy shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

export function useTeamScope(defaultScope: TeamScope = 'direct'): TeamScope {
  const searchParams = useSearchParams();
  const raw = searchParams.get('scope');
  if (raw === 'indirect' || raw === 'dept') return raw;
  if (raw === 'direct') return 'direct';
  return defaultScope;
}

export type TeamScopeCounts = { direct: number; indirect: number; dept: number };

/** Stable headcount per scope — fetched once, does not change when switching tabs. */
export function useTeamScopeCounts() {
  const api = useAuthedApi();
  const [counts, setCounts] = useState<TeamScopeCounts | null>(null);

  useEffect(() => {
    void api
      .get<TeamScopeCounts>('/api/hr/ess/team/scope-counts')
      .then(setCounts)
      .catch(() => setCounts({ direct: 0, indirect: 0, dept: 0 }));
  }, [api]);

  return counts;
}

function formatMemberCount(n: number): string {
  return n === 1 ? '1 member' : `${n} members`;
}

export function scopeTabLabel(
  scope: TeamScope,
  counts: TeamScopeCounts | null,
): string {
  const n = counts?.[scope];
  const suffix =
    n === undefined || n === null ? '…' : formatMemberCount(n);
  switch (scope) {
    case 'direct':
      return `Direct Reporting · ${suffix}`;
    case 'indirect':
      return `Indirect Reporting · ${suffix}`;
    case 'dept':
      return `Department Faculty · ${suffix}`;
  }
}
