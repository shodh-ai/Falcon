import { MyPayslipsPanel } from '@/components/self-service/MyPayslipsPanel';

export default function DeanPayslipsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section>
        <h2 className="text-2xl font-bold text-sgvu-navy">My Payslips & Tax</h2>
        <p className="text-sm text-muted-foreground">Download monthly payslips after payroll is published.</p>
      </section>
      <MyPayslipsPanel />
    </div>
  );
}
