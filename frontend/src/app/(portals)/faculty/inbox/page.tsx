'use client';

import { TeamRequestsPanel } from '@/components/self-service/TeamRequestsPanel';
import { FacultyPageHeader, FacultyPageShell, FacultyEmptyState } from '@/components/faculty';
import { defaultTeamScopeForPrefix } from '@/lib/workspace-self-service';
import { useAuth } from '@/context/AuthContext';
import { canSeeFacultyTeamApprovals } from '@/lib/faculty-manager-access';
import { isFacultyDemoModeEnabled } from '@/lib/faculty-demo-mode';

export default function FacultyInboxPage() {
  const { user } = useAuth();
  const canManageTeam = canSeeFacultyTeamApprovals(user) || isFacultyDemoModeEnabled();

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="DOFA Requests"
        description="Leaves, regularisation, on-duty, comp-off, and document approvals awaiting your action."
      />
      {canManageTeam ? (
        <TeamRequestsPanel defaultScope={defaultTeamScopeForPrefix('faculty')} />
      ) : (
        <FacultyEmptyState
          title="Team approvals not enabled"
          description="This inbox is only available when you are assigned as a reporting officer with direct reports."
        />
      )}
    </FacultyPageShell>
  );
}
