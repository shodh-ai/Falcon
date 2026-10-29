'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { FinancePageHeader, formatInr } from '@/components/finance/FinancePageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { useAuthedApi } from '@/lib/api';

type Budget = {
  budget_id: string;
  department_id: number;
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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await api.get<Budget[]>('/finance/budgets');
      setRows(Array.isArray(result) ? result : []);
    } catch (error) {
      setRows([]);
      setLoadError(error instanceof Error ? error.message : 'Could not load department budgets');
    } finally {
      setLoading(false);
    }
  }, [api]);

  const departments = useMemo(() => {
    const unique = new Map<number, string>();
    for (const row of rows) {
      if (Number.isInteger(Number(row.department_id)) && row.department_name?.trim()) {
        unique.set(Number(row.department_id), row.department_name.trim());
      }
    }
    return [...unique.entries()].map(([id, name]) => ({ id, name }));
  }, [rows]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  async function allocate() {
    const departmentId = Number(deptId);
    const allocation = Number(amount);
    if (!departments.some((department) => department.id === departmentId)) {
      toast.error('Select a department in your current finance budget scope');
      return;
    }
    if (!/^\d{4}-\d{4}$/.test(year.trim())) {
      toast.error('Enter the financial year as YYYY-YYYY');
      return;
    }
    if (!Number.isFinite(allocation) || allocation <= 0) {
      toast.error('Enter an allocation amount greater than zero');
      return;
    }
    setSaving(true);
    try {
      await api.post('/finance/budgets', {
        department_id: departmentId,
        financial_year: year.trim(),
        allocated_amount: allocation,
      });
      toast.success('Budget allocated');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
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
        <CardContent className="grid gap-4 md:grid-cols-[1.4fr_1fr_1fr_auto] md:items-end">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Department</span>
            <select
              aria-label="Department"
              className="h-10 w-full rounded-md border bg-background px-3"
              value={deptId}
              onChange={(event) => setDeptId(event.target.value)}
              disabled={loading || departments.length === 0}
              required
            >
              <option value="">Select a department</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
            <span className="block text-xs text-muted-foreground">
              Departments come from this tenant’s current finance budget records.
            </span>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Financial year</span>
            <Input aria-label="Financial year" placeholder="YYYY-YYYY" value={year} onChange={(e) => setYear(e.target.value)} required />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Allocation amount (₹)</span>
            <Input aria-label="Allocation amount" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </label>
          <Button onClick={() => void allocate()} disabled={saving || loading || departments.length === 0}>
            {saving ? 'Saving…' : 'Save allocation'}
          </Button>
        </CardContent>
      </Card>
      {loadError ? (
        <Card role="alert" className="border-red-200 bg-red-50/50">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <p>Could not load the current tenant’s department budget list: {loadError}</p>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>Retry</Button>
          </CardContent>
        </Card>
      ) : !loading && departments.length === 0 ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            No department budgets are available in this tenant yet. Create or activate the department allocation in the authorized budget workflow before adding a legacy annual allocation.
          </CardContent>
        </Card>
      ) : null}
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
