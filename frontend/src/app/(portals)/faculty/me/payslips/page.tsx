import { MyPayslipsPanel } from '@/components/self-service/MyPayslipsPanel';
import { FacultyPageHeader, FacultyPageShell } from '@/components/faculty';

export default function FacultyPayslipsPage() {
  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="Salary & Tax"
        description="View salary slips and tax information."
      />
      <MyPayslipsPanel />
    </FacultyPageShell>
  );
}
