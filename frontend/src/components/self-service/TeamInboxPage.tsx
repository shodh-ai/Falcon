'use client';

import { usePathname } from 'next/navigation';
import { TeamRequestsPanel } from '@/components/self-service/TeamRequestsPanel';
import {
  defaultTeamScopeForPrefix,
  workspacePrefixFromPath,
} from '@/lib/workspace-self-service';

export function TeamInboxPage() {
  const pathname = usePathname();
  const prefix = workspacePrefixFromPath(pathname ?? '') ?? 'faculty';
  const defaultScope = defaultTeamScopeForPrefix(prefix);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section>
        <h2 className="text-2xl font-bold text-sgvu-navy">Pending Approvals</h2>
        <p className="text-sm text-muted-foreground">
          Leaves, regularisation, on-duty, comp-off, and document approvals awaiting your action.
        </p>
      </section>
      <TeamRequestsPanel defaultScope={defaultScope} />
    </div>
  );
}
