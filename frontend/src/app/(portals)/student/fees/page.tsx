import { FinancialDuesWidget } from '@/components/student/FinancialDuesWidget';
import { mockFeeDues } from '@/lib/mock/student-dashboard';

export default function StudentFeesPage() {
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h2 className="text-xl font-bold text-sgvu-navy">Fees & Payments</h2>
      <FinancialDuesWidget
        totalPending={mockFeeDues.totalPending}
        dueDate={mockFeeDues.dueDate}
        items={mockFeeDues.items}
      />
      <p className="text-sm text-muted-foreground">Payment gateway integration coming next — Razorpay / PayU webhooks are ready on the API.</p>
    </div>
  );
}
