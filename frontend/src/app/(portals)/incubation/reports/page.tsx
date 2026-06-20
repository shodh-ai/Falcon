'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';
import { getApiBaseUrl } from '@/lib/api-base-url';
import { getSubdomainFromClient } from '@/lib/tenant';
import { createEcellApi, type EcellDashboard } from '@/lib/api/api.ecell';

function formatInr(value: string | number | null | undefined) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
    Number(value ?? 0),
  );
}

export default function IncubationReportsPage() {
  const api = useAuthedApi();
  const ecellApi = useMemo(() => createEcellApi(api), [api]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [summary, setSummary] = useState<EcellDashboard | null>(null);

  useEffect(() => {
    void ecellApi
      .dashboard()
      .then(setSummary)
      .catch(() => toast.error('Could not load report summary'))
      .finally(() => setLoading(false));
  }, [ecellApi]);

  async function exportReport() {
    setExporting(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch(`${getApiBaseUrl()}/api/ecell/admin/report/export`, {
        headers: {
          'x-tenant-subdomain': getSubdomainFromClient(),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'incubation-naac-nirf-report.xlsx';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('NAAC / NIRF report downloaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Loading reports…</p>;

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-blue-50 p-3 text-blue-700">
            <FileSpreadsheet className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-sgvu-navy">NAAC / NIRF Exports</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              One-click export for Total Startups & Seed Funding metrics required by accreditation bodies.
            </p>
          </div>
        </div>
        <Button onClick={() => void exportReport()} disabled={exporting}>
          {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          Export Incubation Report
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Report Snapshot</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">Total Startups Funded</p>
            <p className="text-2xl font-bold text-sgvu-navy">{Number(summary?.funded_count ?? 0)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Seed Funding Disbursed</p>
            <p className="text-2xl font-bold text-sgvu-navy">{formatInr(summary?.total_disbursed)}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
