'use client';

import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock3,
  FileText,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

type RequestStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';

type PayslipRequest = {
  id: string;
  employeeName: string;
  employeeId: string;
  fromMonth: string;
  toMonth: string;
  reason: string;
  requestedAt: string;
  status: RequestStatus;
};

const requests: PayslipRequest[] = [];

function monthLabel(month: string) {
  const [year, value] = month.split('-').map(Number);
  if (!year || !value) return month;
  return new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' }).format(
    new Date(year, value - 1, 1),
  );
}

function statusVariant(status: RequestStatus) {
  if (status === 'APPROVED') return 'success' as const;
  if (status === 'REJECTED') return 'destructive' as const;
  return 'warning' as const;
}

export default function HrPayslipDownloadRequestsPage() {
  const [status, setStatus] = useState<'ALL' | RequestStatus>('ALL');
  const [query, setQuery] = useState('');

  const filteredRequests = useMemo(
    () =>
      requests.filter((request) => {
        const matchesStatus = status === 'ALL' || request.status === status;
        const value = `${request.employeeName} ${request.employeeId}`.toLowerCase();
        return matchesStatus && value.includes(query.trim().toLowerCase());
      }),
    [query, status],
  );

  const pendingCount = requests.filter((request) => request.status === 'PENDING_REVIEW').length;
  const approvedCount = requests.filter((request) => request.status === 'APPROVED').length;

  return (
    <div className="space-y-6">
      <HrPageHeader
        title="Payslip download requests"
        description="Review employee requests and approve a consolidated, single-page payslip PDF for the selected month range."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-xl bg-amber-100 p-2 text-amber-700"><Clock3 className="h-5 w-5" /></div>
            <div><p className="text-xs text-muted-foreground">Pending review</p><p className="text-2xl font-bold text-sgvu-navy">{pendingCount}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-xl bg-emerald-100 p-2 text-emerald-700"><CheckCircle2 className="h-5 w-5" /></div>
            <div><p className="text-xs text-muted-foreground">Approved requests</p><p className="text-2xl font-bold text-sgvu-navy">{approvedCount}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-xl bg-blue-100 p-2 text-blue-700"><ShieldCheck className="h-5 w-5" /></div>
            <div><p className="text-xs text-muted-foreground">Payroll source</p><p className="text-sm font-semibold text-sgvu-navy">Published payslips only</p></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-bold text-sgvu-navy">Review queue</h2>
              <p className="mt-1 text-sm text-muted-foreground">Approve only after checking the employee, date range, reason, and published payroll status.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-sgvu-navy" />
                <input aria-label="Search employee" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employee" className="h-10 w-full rounded-xl border-2 border-gray-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-sgvu-gold focus:ring-2 focus:ring-sgvu-gold/30 sm:w-52" />
              </label>
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-sgvu-navy" />
                <select aria-label="Search by request status" value={status} onChange={(event) => setStatus(event.target.value as 'ALL' | RequestStatus)} className="h-10 w-full appearance-none rounded-xl border-2 border-sgvu-gold bg-white pl-9 pr-8 text-sm font-semibold text-sgvu-navy shadow-sm outline-none focus:ring-2 focus:ring-sgvu-gold/30 sm:w-48">
                  <option value="ALL">All statuses</option>
                  <option value="PENDING_REVIEW">Pending review</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </label>
            </div>
          </div>

          {filteredRequests.length > 0 ? (
            <div className="mt-5 space-y-3">
              {filteredRequests.map((request) => (
                <div key={request.id} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-sgvu-navy">{request.employeeName}</p>
                      <p className="text-xs text-muted-foreground">{request.employeeId} · {monthLabel(request.fromMonth)} – {monthLabel(request.toMonth)}</p>
                      <p className="mt-2 text-sm">{request.reason}</p>
                    </div>
                    <Badge variant={statusVariant(request.status)}>{request.status.replace('_', ' ')}</Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-gray-300 bg-gray-50/70 px-6 py-10 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-sgvu-gold shadow-sm"><FileText className="h-6 w-6" /></div>
              <h3 className="mt-4 font-semibold text-sgvu-navy">No pending payslip download requests</h3>
              <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">When an employee requests a payslip, it will appear here for identity, month-range, and payroll-publication checks.</p>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
