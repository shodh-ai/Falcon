import { WorkforceHubPage } from '@/components/self-service/WorkforceHubPage';
import { FacultyPageHeader, FacultyPageShell } from '@/components/faculty';

export default function FacultyWorkforcePage() {
  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="Attendance & Leave"
        description="Apply for leave or On Duty, track approvals, and review your attendance calendar."
      />
      <WorkforceHubPage embedded />
    </FacultyPageShell>
  );
}
