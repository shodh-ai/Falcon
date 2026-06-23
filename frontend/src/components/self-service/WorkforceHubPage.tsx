'use client';

import { Suspense } from 'react';
import { MyCalendarPanel } from '@/components/self-service/MyCalendarPanel';
import { MyLeavesPanel } from '@/components/self-service/MyLeavesPanel';

function WorkforceHubContent({ embedded }: { embedded?: boolean }) {
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

      <div className="space-y-4">
        <MyCalendarPanel />
        <MyLeavesPanel />
      </div>
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
