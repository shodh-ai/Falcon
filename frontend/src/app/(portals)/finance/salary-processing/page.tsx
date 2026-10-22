'use client';

import { useEffect, useState } from 'react';
import { FinancePageHeader, formatInr } from '@/components/finance/FinancePageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function FinanceSalaryProcessingPage() {
  const api = useAuthedApi();
  const [month, setMonth] = useState('');
  const [summary, setSummary] = useState<{ staff_count: number; total_payout: number } | null>(null);

  useEffect(() => {
    if (!month) return;
    void api.get<{ staff_count: number; total_payout: number }>(`/finance/salary-processing?month=${month}`)
      .then(setSummary).catch((e) => { setSummary(null); toast.error(e instanceof Error ? e.message : 'Could not load payroll'); });
  }, [api, month]);

  function downloadExport() {
    if (!month || !summary?.staff_count || !summary.total_payout) {
      toast.error('Select a payroll month with approved data before exporting.');
      return;
    }
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    fetch(`${API_URL}/finance/salary-processing/bank-export?month=${month}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => {
        if (!r.ok) throw new Error(`Bank export failed (${r.status})`);
        return r.blob();
      })
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `salary-neft-${month}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      }).catch((e) => toast.error(e instanceof Error ? e.message : 'Bank export failed'));
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <FinancePageHeader
        title="Salary Processing"
        description="Review HR payroll totals and generate NEFT/RTGS bank export files for disbursement."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payroll month</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <label className="text-sm">Select payroll month (YYYY-MM) <Input type="month" value={month} onChange={(e) => { setMonth(e.target.value); setSummary(null); }} /></label>
          <p className="w-full text-xs text-muted-foreground">Select a month to view staff payroll totals and generate the bank transfer CSV.</p>
          <div>
            <p className="text-xs text-muted-foreground">Staff on payroll</p>
            <p className="text-2xl font-bold text-sgvu-navy">{summary?.staff_count ?? 0}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total payout</p>
            <p className="text-2xl font-bold text-sgvu-navy">{formatInr(summary?.total_payout)}</p>
          </div>
          <Button disabled={!month || !summary?.staff_count || !summary.total_payout} onClick={downloadExport}>Generate bank export (CSV)</Button>
        </CardContent>
      </Card>
      {month && !summary?.staff_count ? <p className="text-sm text-muted-foreground">No payroll data available for this month. Run payroll in the HR workspace first.</p> : null}
      <p className="text-sm text-muted-foreground">
        Run payroll in the HR workspace first. Finance disburses funds after reviewing net pay totals here.
      </p>
    </div>
  );
}
