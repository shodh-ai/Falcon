import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { TeamSubNav } from '@/components/ess/TeamSubNav';

export default function EssTeamLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <section>
        <h2 className="text-2xl font-bold text-sgvu-navy">Team Workspace</h2>
        <p className="text-sm text-muted-foreground">
          Track your team, approve requests, and monitor attendance — without Master HR access.
        </p>
      </section>
      <Suspense fallback={null}>
        <TeamSubNav />
      </Suspense>
      {children}
    </div>
  );
}
