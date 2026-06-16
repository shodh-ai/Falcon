'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { FinancePageHeader, formatInr } from '@/components/finance/FinancePageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { useAuthedApi } from '@/lib/api';

type Budget = {
  budget_id: string;
  department_name: string;
  financial_year: string;
  allocated_amount: string;
  utilized_amount: string;
  encumbered_amount?: string;
  utilization_percent: number;
};

export default function FinanceBudgetsPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<Budget[]>([]);
  const [deptId, setDeptId] = useState('1');
  const [year, setYear] = useState('2026-2027');
  const [amount, setAmount] = useState('5000000');

  const load = () => void api.get<Budget[]>('/finance/budgets').then(setRows).catch(() => setRows([]));

  useEffect(() => {
    load();
  }, [api]);

  async function allocate() {
    try {
      await api.post('/finance/budgets', {
        department_id: Number(deptId),
        financial_year: year,
        allocated_amount: Number(amount),
      });
      toast.success('Budget allocated');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <FinancePageHeader
        title="Budget Allocation & Tracking"
        description="Departmental caps with encumbrance — POs + paid invoices count against limits."
      />

      <Card className="border-amber-200 bg-amber-50/50">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
          <p>
            Chairman-level FP&A allocation and drill-down live in the Executive portal.
          </p>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/leadership/budget-allocation">Allocation Board</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/leadership/budget-monitor">Budget Monitor</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Allocate annual budget (legacy)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input placeholder="Department ID" value={deptId} onChange={(e) => setDeptId(e.target.value)} />
          <Input placeholder="FY e.g. 2026-2027" value={year} onChange={(e) => setYear(e.target.value)} />
          <Input placeholder="Amount (₹)" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Button onClick={() => void allocate()}>Save allocation</Button>
        </CardContent>
      </Card>
      {rows.map((r) => (
        <Card key={r.budget_id}>
          <CardContent className="space-y-2 p-4">
            <div className="flex justify-between text-sm">
              <span className="font-semibold">{r.department_name ?? `Dept ${deptId}`}</span>
              <span>
                {formatInr(r.utilized_amount)} / {formatInr(r.allocated_amount)} ({r.utilization_percent}%)
              </span>
            </div>
            {r.encumbered_amount ? (
              <p className="text-xs text-muted-foreground">Encumbered (POs): {formatInr(r.encumbered_amount)}</p>
            ) : null}
            <Progress value={Math.min(100, Number(r.utilization_percent))} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
