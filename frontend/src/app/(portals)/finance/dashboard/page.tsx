'use client';

import { useEffect, useState } from 'react';
import { FinancePageHeader, formatInr } from '@/components/finance/FinancePageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useAuthedApi } from '@/lib/api';

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
  recent_transactions: Array<{ transaction_id: string; amount: string; payment_mode?: string; created_at: string }>;
};

export default function FinanceDashboardPage() {
  const api = useAuthedApi();
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
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Today&apos;s collection (gateway)</p>
            <p className="text-3xl font-black text-sgvu-navy">{formatInr(data?.todays_collection)}</p>
            <p className="text-xs text-muted-foreground">{data?.transaction_count_today ?? 0} successful payments</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total outstanding dues</p>
            <p className="text-3xl font-black text-sgvu-navy">{formatInr(data?.total_outstanding)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Departments tracked</p>
            <p className="text-3xl font-black text-sgvu-navy">{data?.budget_utilization?.length ?? 0}</p>
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
            <p className="text-sm text-muted-foreground">Allocate budgets under Budget Allocation to see utilization bars.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent successful payments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(data?.recent_transactions ?? []).map((t) => (
            <div key={t.transaction_id} className="flex justify-between border-b py-2">
              <span className="font-mono text-xs">{t.transaction_id.slice(0, 8)}…</span>
              <span>{formatInr(t.amount)}</span>
              <span className="text-muted-foreground">{t.payment_mode ?? '—'}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
