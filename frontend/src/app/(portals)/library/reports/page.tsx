'use client';

import { useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';

export default function LibraryReportsPage() {
  const api = useAuthedApi();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

  async function downloadNaac() {
    try {
      const res = await api.get<{ csv: string; row_count: number; month: string }>(
        `/api/library-admin/reports/naac-utilization?month=${month}`,
      );
      const blob = new Blob([res.csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `naac-library-utilization-${res.month}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${res.row_count} patron rows for ${res.month}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <h1 className="text-2xl font-bold text-sgvu-navy">NAAC Library Reports</h1>
      <p className="text-sm text-muted-foreground">
        1-click export of gate walk-in utilization — students and faculty visits by month.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Library utilization (gate register)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground">Month (YYYY-MM)</label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-48" />
          </div>
          <Button className="bg-sgvu-navy" onClick={() => void downloadNaac()}>
            Export CSV for NAAC
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
