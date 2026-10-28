import { MyPayslipsPanel } from '@/components/self-service/MyPayslipsPanel';

export default function ExamCellPayslipsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section>
        <h1 className="text-2xl font-bold text-sgvu-navy">My Payslips & Tax</h1>
        <p className="text-sm text-muted-foreground">View published salary periods and request a salary certificate for HR approval.</p>
      </section>
      <MyPayslipsPanel />
    </div>
  );
}
