import { TeamRequestsPanel } from '@/components/self-service/TeamRequestsPanel';
import { FacultyPageHeader, FacultyPageShell } from '@/components/faculty';
import { defaultTeamScopeForPrefix } from '@/lib/workspace-self-service';

export default function FacultyInboxPage() {
  return (
    <FacultyPageShell>
      <FacultyPageHeader
        description="Leaves, regularisation, on-duty, comp-off, and document approvals awaiting your action."
      />
      <TeamRequestsPanel defaultScope={defaultTeamScopeForPrefix('faculty')} />
    </FacultyPageShell>
  );
}
