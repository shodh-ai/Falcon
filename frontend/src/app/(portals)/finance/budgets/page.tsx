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
  const [deptId, setDeptId] = useState('');
  const [year, setYear] = useState('');
  const [amount, setAmount] = useState('');

  const load = () => void api.get<Budget[]>('/finance/budgets').then(setRows).catch(() => setRows([]));

  useEffect(() => {
    load();
  }, [api]);

  async function allocate() {
    if (!Number.isSafeInteger(Number(deptId)) || Number(deptId) <= 0 || !/^\d{4}-\d{4}$/.test(year) || !amount.trim() || !Number.isFinite(Number(amount)) || Number(amount) < 0) {
      toast.error('Enter a valid department ID, financial year and non-negative allocation.');
      return;
    }
    try {
      await api.post('/finance/budgets', {
        department_id: Number(deptId),
        financial_year: year,
        allocated_amount: Number(amount),
      });
      toast.success('Department budget saved');
      setDeptId('');
      setYear('');
      setAmount('');
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
          <CardTitle className="text-base">Edit draft department allocation</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input aria-label="Department ID" type="number" min="1" placeholder="Department ID" value={deptId} onChange={(e) => setDeptId(e.target.value)} />
          <Input aria-label="Financial year" placeholder="FY e.g. 2026-2027" value={year} onChange={(e) => setYear(e.target.value)} />
          <Input aria-label="Total allocation in rupees" type="number" min="0" step="0.01" placeholder="Total allocation (₹)" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Button onClick={() => void allocate()}>Save allocation</Button>
          <p className="w-full text-xs text-muted-foreground">Saving an existing draft department/year replaces its total allocation; it does not add to the current amount. First create a university budget in the Allocation Board. Locked budgets require a reviewed expansion request there.</p>
        </CardContent>
      </Card>
      {rows.map((r) => (
        <Card key={r.budget_id}>
          <CardContent className="space-y-2 p-4">
            <div className="flex justify-between text-sm">
              <span className="font-semibold">{r.department_name ?? 'Department'} · {r.financial_year}</span>
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
