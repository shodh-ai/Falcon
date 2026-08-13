import { WorkforceHubPage } from '@/components/self-service/WorkforceHubPage';
import { FacultyPageHeader, FacultyPageShell } from '@/components/faculty';

export default function FacultyWorkforcePage() {
  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="Work Calendar"
        description="View attendance, leave balances, and workforce self-service."
      />
      <WorkforceHubPage embedded />
    </FacultyPageShell>
  );
}
