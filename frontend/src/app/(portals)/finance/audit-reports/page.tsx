'use client';

import { FinancePageHeader } from '@/components/finance/FinancePageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import { useAuthedApi } from '@/lib/api';

export default function FinanceAuditReportsPage() {
  const api = useAuthedApi();
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [error, setError] = useState<string | null>(null);

  async function download(path: string, filename: string) {
    setError(null);
    try {
      const blob = await api.getBlob(path);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not download report');
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <FinancePageHeader title="Audit Reports & Compliance" description="Provisional historical CSV exports. The canonical statements are under General Ledger & Statements." />
      <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="max-w-xs" />
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Day Book</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => void download('/finance/audit-reports/day-book', 'day-book.csv')}>
              Download CSV
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Trial Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => void download('/finance/audit-reports/trial-balance', 'trial-balance.csv')}>
              Download CSV
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">GST (GSTR data)</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => void download(`/finance/audit-reports/gst?period=${period}`, `gst-${period}.csv`)}>
              Download CSV
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">TDS deductions</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => void download(`/finance/audit-reports/tds?period=${period}`, `tds-${period}.csv`)}>
              Download CSV
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
