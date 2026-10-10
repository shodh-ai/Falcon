import { MyPayslipsPanel } from '@/components/self-service/MyPayslipsPanel';
import { HrPageHeader } from '@/components/hr/HrPageHeader';

export default function HrSelfPayslipsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <HrPageHeader
        title="My Payslips & Tax"
        description="View and download your payslips after payroll is published."
      />
      <MyPayslipsPanel />
    </div>
  );
}
