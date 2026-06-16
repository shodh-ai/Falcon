'use client';

import { Suspense, useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SelfTeamToggle, type WorkforceView } from '@/components/self-service/SelfTeamToggle';
import { MyCalendarPanel } from '@/components/self-service/MyCalendarPanel';
import { MyLeavesPanel } from '@/components/self-service/MyLeavesPanel';
import { TeamAttendancePanel } from '@/components/self-service/TeamAttendancePanel';
import {
  defaultTeamScopeForPrefix,
  workspacePrefixFromPath,
} from '@/lib/workspace-self-service';
import { useAuth } from '@/context/AuthContext';

function WorkforceHubContent({ embedded }: { embedded?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const prefix = workspacePrefixFromPath(pathname ?? '') ?? 'faculty';
  const defaultScope = defaultTeamScopeForPrefix(prefix);

  const rawView = searchParams.get('view') as WorkforceView | null;
  const view: WorkforceView = rawView === 'team' ? 'team' : 'self';

  const showTeam = useMemo(() => {
    const roles = (user?.roles?.length ? user.roles : [user?.role]).filter(Boolean) as string[];
    const normalized = roles.map((r) => r.toLowerCase());
    return normalized.some((r) => ['faculty', 'hod', 'dean', 'hr', 'hradmin'].includes(r));
  }, [user]);

  const setView = useCallback(
    (next: WorkforceView) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('view', next);
      if (next === 'team' && !params.has('scope')) {
        params.set('scope', defaultScope);
      }
      router.replace(`${pathname}?${params.toString()}`);
    },
    [defaultScope, pathname, router, searchParams],
  );

  const body = (
    <>
      {!embedded && (
        <section>
          <h2 className="text-2xl font-bold text-sgvu-navy">My Leaves & Attendance</h2>
          <p className="text-sm text-muted-foreground">
            Personal calendar, leave balances, and team attendance matrix — without leaving your workspace.
          </p>
        </section>
      )}

      <SelfTeamToggle value={view} onChange={setView} showTeam={showTeam} />

      {view === 'self' ? (
        <div className="space-y-4">
          <MyCalendarPanel />
          <MyLeavesPanel />
        </div>
      ) : (
        <TeamAttendancePanel defaultScope={defaultScope} />
      )}
    </>
  );

  if (embedded) {
    return <div className="space-y-6">{body}</div>;
  }

  return <div className="mx-auto w-full max-w-6xl space-y-6">{body}</div>;
}

export function WorkforceHubPage({ embedded }: { embedded?: boolean } = {}) {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <WorkforceHubContent embedded={embedded} />
    </Suspense>
  );
}
