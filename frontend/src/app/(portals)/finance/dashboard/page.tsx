'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FinancePageHeader, formatInr } from '@/components/finance/FinancePageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

type Dashboard = {
  todays_collection: number;
  total_outstanding: number;
  transaction_count_today: number;
  budget_utilization: Array<{
    department: string;
    utilization_percent: number;
    allocated_amount: string;
    utilized_amount: string;
  }>;
  recent_transactions: Array<{
    transaction_id: string;
    amount: string;
    payment_mode?: string;
    created_at: string;
    payment_source?: string;
    payment_purpose?: string;
  }>;
  procurement?: {
    cleared_invoice_count: number;
    procurement_invoice_count: number;
    cleared_invoice_amount: number;
    procurement_paid_amount: number;
    procurement_outstanding_amount: number;
    recent_payments: Array<{
      payment_id: string;
      invoice_id: string;
      amount: string | number;
      status: string;
      payment_reference?: string | null;
      payment_date?: string | null;
      vendor_name?: string | null;
    }>;
  };
};

export default function FinanceDashboardPage() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const [data, setData] = useState<Dashboard | null>(null);

  useEffect(() => {
    void api.get<Dashboard>('/finance/dashboard').then(setData).catch(() => setData(null));
  }, [api]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <FinancePageHeader
        title="Finance Dashboard"
        description="Real-time cash flow: gateway collections, outstanding dues, and departmental budget utilization."
      />
      {user?.email?.toLowerCase() === 'finance@mygyanvihar.com' && (
        <Link href="/finance/demo-book" className="block rounded-lg border-2 border-amber-500 bg-amber-50 p-4 text-sm font-semibold text-amber-950 underline underline-offset-2">
          Open SGVU Finance demo book — synthetic invoices, expenses, payments and journals (not official records)
        </Link>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Today&apos;s collection (gateway)</p>
            <p className="text-3xl font-black text-sgvu-navy">{formatInr(data?.todays_collection)}</p>
            <p className="text-xs text-muted-foreground">{data?.transaction_count_today ?? 0} successful payments</p>
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardContent className="min-w-0 p-4">
            <p className="text-xs text-muted-foreground">Total outstanding dues</p>
            <p className="min-w-0 break-words text-[clamp(1.25rem,2vw,1.875rem)] font-black leading-tight tabular-nums text-sgvu-navy" style={{ overflowWrap: 'anywhere' }}>{formatInr(data?.total_outstanding)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Departments tracked</p>
            <p className="text-3xl font-black text-sgvu-navy">{data?.budget_utilization?.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Cleared procurement invoices</p>
            <p className="text-3xl font-black text-sgvu-navy">{data?.procurement?.cleared_invoice_count ?? 0}</p>
            <p className="text-xs text-muted-foreground">of {data?.procurement?.procurement_invoice_count ?? 0} invoices</p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Budget utilization by department</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(data?.budget_utilization ?? []).map((row) => (
            <div key={row.department} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>{row.department ?? 'General'}</span>
                <span className="text-muted-foreground">{row.utilization_percent}% used</span>
              </div>
              <Progress value={Math.min(100, Number(row.utilization_percent))} />
            </div>
          ))}
          {!data?.budget_utilization?.length && (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>No departmental budgets have been allocated yet. Utilization will appear here after allocation.</p>
              <Link href="/finance/budgets" className="inline-flex font-semibold text-sgvu-navy underline underline-offset-2 hover:text-sgvu-gold">Open Budget Allocation</Link>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Progressive Procurement · B2B payments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Cleared value</p>
              <p className="text-lg font-bold">{formatInr(data?.procurement?.cleared_invoice_amount)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Paid</p>
              <p className="text-lg font-bold">{formatInr(data?.procurement?.procurement_paid_amount)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Cleared outstanding</p>
              <p className="text-lg font-bold">{formatInr(data?.procurement?.procurement_outstanding_amount)}</p>
            </div>
          </div>
          {(data?.procurement?.recent_payments ?? []).map((payment) => (
            <div key={payment.payment_id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm">
              <span>{payment.vendor_name ?? 'Vendor'} · invoice {payment.invoice_id.slice(0, 8)}…</span>
              <span>{formatInr(payment.amount)} · {payment.status}</span>
            </div>
          ))}
          {!data?.procurement?.recent_payments?.length && (
            <p className="text-sm text-muted-foreground">No Progressive Procurement payments have been posted.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent successful payments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(data?.recent_transactions ?? []).map((t) => (
            <details key={t.transaction_id} className="group border-b py-2">
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 font-medium">
                <span>{t.payment_purpose ?? 'Payment'} <span className="text-muted-foreground">· {t.payment_source ?? 'Other'}</span></span>
                <span>{formatInr(t.amount)}</span>
              </summary>
              <dl className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                <div><dt className="inline font-semibold">Transaction ID: </dt><dd className="inline break-all font-mono">{t.transaction_id}</dd></div>
                <div><dt className="inline font-semibold">Method: </dt><dd className="inline">{t.payment_mode ?? 'Not recorded'}</dd></div>
                <div><dt className="inline font-semibold">Recorded: </dt><dd className="inline">{new Date(t.created_at).toLocaleString('en-IN')}</dd></div>
              </dl>
            </details>
          ))}
          {!data?.recent_transactions?.length && <p className="text-sm text-muted-foreground">No successful payments recorded yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
