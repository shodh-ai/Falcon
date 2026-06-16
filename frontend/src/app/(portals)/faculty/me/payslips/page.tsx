import { MyPayslipsPanel } from '@/components/self-service/MyPayslipsPanel';
import { FacultyPageHeader, FacultyPageShell } from '@/components/faculty';

export default function FacultyPayslipsPage() {
  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="My Payslips & Tax"
        description="Download monthly payslips after payroll is published."
      />
      <MyPayslipsPanel />
    </FacultyPageShell>
  );
}
