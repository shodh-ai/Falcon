'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Play } from 'lucide-react';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';

type Payslip = {
  payslip_id: string;
  month: string;
  gross_pay: string;
  net_pay: string;
  is_published: boolean;
  staff?: { name?: string };
};

export default function HrPayrollProcessingPage() {
  const api = useAuthedApi();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [running, setRunning] = useState(false);

  const load = () => {
    void api.get<Payslip[]>(`/api/hr/payroll/payslips?month=${month}`).then(setPayslips);
  };

  useEffect(() => {
    load();
  }, [api, month]);

  async function runPayroll() {
    setRunning(true);
    try {
      await api.post('/api/hr/payroll/run', { month });
      toast.success(`Payroll queued for ${month} (LWP + structure deductions applied)`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Payroll run failed');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <HrPageHeader
        title="Payroll Processing"
        description="Month-end engine: biometric LWP + approved leaves → salary structure → payslips."
        actions={
          <div className="flex items-center gap-2">
            <input type="month" className="rounded-md border px-2 py-1 text-sm" value={month} onChange={(e) => setMonth(e.target.value)} />
            <Button size="sm" disabled={running} onClick={() => void runPayroll()}>
              <Play className="mr-1 h-4 w-4" />
              Run payroll
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payout list — {month}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {payslips.map((p) => (
            <div key={p.payslip_id} className="flex justify-between rounded-lg border px-3 py-2 text-sm">
              <span>{p.staff?.name ?? 'Employee'}</span>
              <span>
                Net ₹{Number(p.net_pay).toLocaleString()} · {p.is_published ? 'Published' : 'Draft'}
              </span>
            </div>
          ))}
          {payslips.length === 0 ? <p className="text-sm text-muted-foreground">Run payroll to generate payslips.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
