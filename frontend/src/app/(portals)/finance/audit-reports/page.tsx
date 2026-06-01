'use client';

import { FinancePageHeader } from '@/components/finance/FinancePageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function download(path: string) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const url = `${API_URL}${path}`;
  fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    .then((r) => r.blob())
    .then((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = path.split('/').pop() ?? 'export.csv';
      a.click();
    });
}

export default function FinanceAuditReportsPage() {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <FinancePageHeader title="Audit Reports & Compliance" description="One-click CSV exports for your CA — Day Book, Trial Balance, GST & TDS." />
      <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="max-w-xs" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Day Book</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => download('/finance/audit-reports/day-book')}>
              Download CSV
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Trial Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => download('/finance/audit-reports/trial-balance')}>
              Download CSV
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">GST (GSTR data)</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => download(`/finance/audit-reports/gst?period=${period}`)}>
              Download CSV
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">TDS deductions</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => download(`/finance/audit-reports/tds?period=${period}`)}>
              Download CSV
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
