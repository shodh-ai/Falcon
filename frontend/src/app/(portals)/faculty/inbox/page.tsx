'use client';

import { TeamRequestsPanel } from '@/components/self-service/TeamRequestsPanel';
import { FacultyPageHeader, FacultyPageShell, FacultyEmptyState } from '@/components/faculty';
import { defaultTeamScopeForPrefix } from '@/lib/workspace-self-service';
import { useAuth } from '@/context/AuthContext';
import { canSeeFacultyTeamApprovals } from '@/lib/faculty-manager-access';

export default function FacultyInboxPage() {
  const { user } = useAuth();
  const canManageTeam = canSeeFacultyTeamApprovals(user);

  return (
    <FacultyPageShell>
      <FacultyPageHeader
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
