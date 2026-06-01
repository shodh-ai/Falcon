'use client';

import { useEffect, useState } from 'react';
import { FinancePageHeader, formatInr } from '@/components/finance/FinancePageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function FinanceSalaryProcessingPage() {
  const api = useAuthedApi();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [summary, setSummary] = useState<{ staff_count: number; total_payout: number } | null>(null);

  useEffect(() => {
    void api.get<{ staff_count: number; total_payout: number }>(`/finance/salary-processing?month=${month}`).then(setSummary);
  }, [api, month]);

  function downloadExport() {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    fetch(`${API_URL}/finance/salary-processing/bank-export?month=${month}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `salary-neft-${month}.csv`;
        a.click();
      });
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
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <div>
            <p className="text-xs text-muted-foreground">Staff on payroll</p>
            <p className="text-2xl font-bold text-sgvu-navy">{summary?.staff_count ?? 0}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total payout</p>
            <p className="text-2xl font-bold text-sgvu-navy">{formatInr(summary?.total_payout)}</p>
          </div>
          <Button onClick={downloadExport}>Generate bank export (CSV)</Button>
        </CardContent>
      </Card>
      <p className="text-sm text-muted-foreground">
        Run payroll in the HR workspace first. Finance disburses funds after reviewing net pay totals here.
      </p>
    </div>
  );
}
