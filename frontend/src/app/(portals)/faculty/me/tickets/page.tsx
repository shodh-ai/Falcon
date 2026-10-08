import { MyHelpdeskPanel } from '@/components/self-service/MyHelpdeskPanel';
import { FacultyPageHeader, FacultyPageShell } from '@/components/faculty';

export default function FacultyTicketsPage() {
  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="Help Desk"
        description="Raise and track IT, HR, and facilities requests."
      />
      <MyHelpdeskPanel />
    </FacultyPageShell>
  );
}
