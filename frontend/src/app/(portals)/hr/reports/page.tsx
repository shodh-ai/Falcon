'use client';

import { useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { useHrEntity } from '@/context/HrEntityContext';
import { getSubdomainFromClient } from '@/lib/tenant';

const REPORTS = [
  {
    id: 'muster-roll',
    title: 'Muster Roll (Monthly Attendance)',
    description: 'Rows = employees, columns = days 1–31. Cells: P, A, L, HD.',
    path: (month: string) => `/api/hr/reports/muster-roll?month=${month}`,
    filename: (month: string) => `muster-roll-${month}.xlsx`,
    needsMonth: true,
  },
  {
    id: 'leave-balances',
    title: 'Leave Balance Register',
    description: 'Every employee with remaining CL, SL, and EL balances.',
    path: (year: string) => `/api/hr/reports/leave-balances?year=${year}`,
    filename: (year: string) => `leave-balances-${year}.xlsx`,
    needsYear: true,
  },
  {
    id: 'payroll-register',
    title: 'Payroll Salary Register',
    description: 'Base pay, deductions, taxes, and net pay for all employees.',
    path: (month: string) => `/api/hr/reports/payroll-register?month=${month}`,
    filename: (month: string) => `payroll-register-${month}.xlsx`,
    needsMonth: true,
  },
  {
    id: 'missing-punches',
    title: 'Missing Punches Report',
    description: 'Missing check-outs in the selected month, followed by a check-in the next day.',
    path: (month: string) => `/api/hr/reports/missing-punches?month=${month}`,
    filename: (month: string) => `missing-punches-${month}.xlsx`,
    needsMonth: true,
  },
  {
    id: 'employee-master',
    title: 'Employee Master Data Dump',
    description: 'All staff with departments, roles, joining dates, and encrypted PAN/Aadhaar status.',
    path: () => '/api/hr/reports/employee-master',
    filename: () => 'employee-master.xlsx',
  },
] as const;

export default function HrReportsPage() {
  const { token } = useAuth();
  const { withEntityQuery } = useHrEntity();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [downloading, setDownloading] = useState<string | null>(null);

  async function downloadReport(
    report: (typeof REPORTS)[number],
  ) {
    if (!token) {
      toast.error('Please sign in to download reports');
      return;
    }
    setDownloading(report.id);
    try {
      const api = process.env.NEXT_PUBLIC_API_URL ?? '';
      const rawPath =
        'needsMonth' in report
          ? report.path(month)
          : 'needsYear' in report
            ? report.path(year)
            : report.path();
      const path = withEntityQuery(rawPath);
      const res = await fetch(`${api}${path}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-tenant-subdomain': getSubdomainFromClient(),
        },
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null) as { message?: string | string[] } | null;
        throw new Error(Array.isArray(error?.message) ? error.message.join(', ') : error?.message ?? 'Export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        'needsMonth' in report
          ? report.filename(month)
          : 'needsYear' in report
            ? report.filename(year)
            : report.filename();
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${report.title} downloaded`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setDownloading(null);
    }
  }

  return (
    <>
      <HrPageHeader
        title="Analytics & Reports Hub"
        description="UGC/NAAC audit-ready exports — one-click Excel downloads for HR and Finance."
      />

      <div className="flex flex-wrap gap-4">
        <div>
          <label htmlFor="hr-report-month" className="text-xs font-medium text-muted-foreground">Report month</label>
          <Input id="hr-report-month" type="month" disabled={downloading !== null} value={month} onChange={(e) => setMonth(e.target.value)} className="mt-1 w-44" />
        </div>
        <div>
          <label htmlFor="hr-balance-year" className="text-xs font-medium text-muted-foreground">Balance year</label>
          <Input id="hr-balance-year" type="number" min={1900} max={9999} disabled={downloading !== null} value={year} onChange={(e) => setYear(e.target.value)} className="mt-1 w-28" />
        </div>
      </div>

      <div className="grid gap-4">
        {REPORTS.map((report) => (
          <Card key={report.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
              <div className="flex gap-3">
                <FileSpreadsheet className="mt-0.5 h-5 w-5 text-sgvu-gold" />
                <div>
                  <CardTitle className="text-base">{report.title}</CardTitle>
                  <CardDescription className="mt-1">{report.description}</CardDescription>
                </div>
              </div>
              <Button
                size="sm"
                disabled={downloading !== null || ('needsMonth' in report ? !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) : 'needsYear' in report ? !/^\d{4}$/.test(year) : false)}
                onClick={() => void downloadReport(report)}
              >
                <Download className="mr-1 h-4 w-4" />
                {downloading === report.id ? 'Generating…' : 'Download .xlsx'}
              </Button>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {'needsMonth' in report ? `Selected month: ${month}` : 'needsYear' in report ? `Balance year: ${year}` : 'Current employee master data (not month-specific).'}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
