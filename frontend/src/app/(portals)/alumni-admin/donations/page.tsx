'use client';

import { useEffect, useState } from 'react';
import { AlumniPageHeader } from '@/components/alumni/AlumniPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';

export default function AlumniAdminDonationsPage() {
  const api = useAuthedApi();
  const [summary, setSummary] = useState<{ total_funds_raised_fy: number; financial_year_start: string } | null>(null);
  const [ledger, setLedger] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    void api
      .get<{ total_funds_raised_fy: number; financial_year_start: string }>('/api/alumni-admin/donations/summary')
      .then(setSummary);
    void api.get<Record<string, unknown>[]>('/api/alumni-admin/donations').then(setLedger);
  }, [api]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <AlumniPageHeader title="Donation Management" description="Endowment ledger and financial-year totals." />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Funds raised (FY from {summary?.financial_year_start})</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-black text-sgvu-navy">₹{summary?.total_funds_raised_fy?.toLocaleString() ?? '—'}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <th className="p-3">Alumni</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Purpose</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((row, i) => (
                <tr key={i} className="border-b">
                  <td className="p-3">{(row as { alumni_name?: string }).alumni_name ?? '—'}</td>
                  <td className="p-3">₹{row.amount as string}</td>
                  <td className="p-3">{(row.purpose as string) ?? '—'}</td>
                  <td className="p-3">{(row.payment_status as string) ?? (row.status as string)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
