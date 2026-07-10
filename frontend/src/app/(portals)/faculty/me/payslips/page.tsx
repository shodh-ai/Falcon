import { MyPayslipsPanel } from '@/components/self-service/MyPayslipsPanel';
import { FacultyPageHeader, FacultyPageShell } from '@/components/faculty';

export default function FacultyPayslipsPage() {
  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="My Payslips & Tax"
        description="Request a salary certificate on official letterpad — download only after HR approval."
      />
      <MyPayslipsPanel />
    </FacultyPageShell>
  );
}
