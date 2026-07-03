'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from '@/lib/notifications/falcon-toast';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ExecutiveCard } from '@/components/leadership/executive';
import { LeadershipPageHeader } from '@/components/leadership/LeadershipSectionCard';
import {
  EXECUTIVE_CHART_SERIES,
  EXECUTIVE_CHART_TOOLTIP,
  EXECUTIVE_SPACING,
} from '@/components/leadership/executive/design-tokens';
import {
  MOCK_DEPARTMENTS,
  MOCK_FINANCIAL_YEAR,
  MOCK_PROGRAMS,
  MOCK_UNIVERSITY_BUDGET,
  formatCr,
  formatL,
} from '@/components/leadership/budget/budget-fpa-mock-data';
import { useLeadershipApi } from '@/lib/api/api.leadership';

type DeptRow = {
  dept_id: number;
  budget_id?: string;
  dept_name: string;
  allocated_amount: number;
  capex_allocated?: number;
  opex_allocated?: number;
  consumed?: number;
  remaining?: number;
  limit_mode?: string;
  color: string;
};

type ProgramRow = {
  program_id: string;
  program_name: string;
  allocated_amount: number;
  utilized_amount: number;
};

export default function BudgetAllocationPage() {
  const api = useLeadershipApi();
  const [financialYear, setFinancialYear] = useState(MOCK_FINANCIAL_YEAR);
  const [totalBudget, setTotalBudget] = useState(MOCK_UNIVERSITY_BUDGET);
  const [departments, setDepartments] = useState<DeptRow[]>(MOCK_DEPARTMENTS);
  const [selectedDept, setSelectedDept] = useState<number | null>(6);
  const [locked, setLocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newProgram, setNewProgram] = useState({ name: '', amount: '' });
  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [dirty, setDirty] = useState(false);
  const [reappropriation, setReappropriation] = useState({
    from_budget_id: '',
    to_budget_id: '',
    amount: '',
    reason: '',
  });
  const [movingFunds, setMovingFunds] = useState(false);

  const loadBoard = useCallback(() => {
    void Promise.all([
      api.budgetAllocation(financialYear),
      api.financialMacroBudget(financialYear).catch(() => null),
    ])
      .then(([board, macro]) => {
        if (board.university?.total_allocated) {
          setTotalBudget(Number(board.university.total_allocated));
          setLocked(board.university.status === 'LOCKED');
        }
        const macroDepts = (macro?.departments as Array<Record<string, unknown>>) ?? [];
        const macroByDept = new Map(macroDepts.map((d) => [String(d.budget_id), d]));
        if (board.dept_budgets?.length) {
          setDepartments(
            board.dept_budgets.map((d, i) => {
              const m = macroByDept.get(String(d.budget_id));
              const allocated = Number(d.allocated_amount);
              return {
                dept_id: d.department_id,
                budget_id: d.budget_id,
                dept_name: d.dept_name,
                allocated_amount: allocated,
                capex_allocated: m ? Number(m.capex_allocated ?? 0) : allocated * 0.35,
                opex_allocated: m ? Number(m.opex_allocated ?? 0) : allocated * 0.65,
                consumed: m ? Number(m.consumed ?? 0) : undefined,
                remaining: m ? Number(m.remaining ?? allocated) : undefined,
                limit_mode: m ? String(m.limit_mode ?? 'SOFT_WARNING') : undefined,
                color: MOCK_DEPARTMENTS[i % MOCK_DEPARTMENTS.length]?.color ?? '#3b82f6',
              };
            }),
          );
        } else if (board.departments?.length) {
          setDepartments(
            board.departments.map((d, i) => {
              const allocated = MOCK_DEPARTMENTS[i]?.allocated_amount ?? 0;
              return {
                dept_id: d.dept_id,
                dept_name: d.dept_name,
                allocated_amount: allocated,
                capex_allocated: allocated * 0.35,
                opex_allocated: allocated * 0.65,
                color: MOCK_DEPARTMENTS[i % MOCK_DEPARTMENTS.length]?.color ?? '#3b82f6',
              };
            }),
          );
        }
      })
      .catch(() => {
        /* keep mock */
      });
  }, [api, financialYear]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  const deptSum = departments.reduce((s, d) => s + d.allocated_amount, 0);
  const remaining = totalBudget - deptSum;

  const pieData = useMemo(
    () =>
      departments.map((d, i) => ({
        name: d.dept_name,
        value: d.allocated_amount,
        color: EXECUTIVE_CHART_SERIES[i % EXECUTIVE_CHART_SERIES.length],
      })),
    [departments],
  );

  function updateDeptAmount(deptId: number, amount: number) {
    setDirty(true);
    setDepartments((prev) => prev.map((d) => (d.dept_id === deptId ? { ...d, allocated_amount: amount } : d)));
  }

  const loadPrograms = useCallback(
    (budgetId?: string, deptId?: number) => {
      if (!budgetId) {
        setPrograms(deptId ? (MOCK_PROGRAMS[deptId] ?? []) : []);
        return;
      }
      void api
        .budgetPrograms(budgetId)
        .then((rows) => {
          if (rows.length) {
            setPrograms(
              rows.map((p) => ({
                program_id: p.program_id,
                program_name: p.program_name,
                allocated_amount: Number(p.allocated_amount),
                utilized_amount: Number(p.utilized_amount),
              })),
            );
          } else if (deptId) {
            setPrograms(MOCK_PROGRAMS[deptId] ?? []);
          }
        })
        .catch(() => {
          if (deptId) setPrograms(MOCK_PROGRAMS[deptId] ?? []);
        });
    },
    [api],
  );

  useEffect(() => {
    const row = departments.find((d) => d.dept_id === selectedDept);
    loadPrograms(row?.budget_id, selectedDept ?? undefined);
  }, [departments, selectedDept, loadPrograms]);

  async function saveDraft() {
    if (deptSum > totalBudget) {
      toast.error('Department allocations exceed university budget');
      return;
    }
    setSaving(true);
    try {
      await api.saveBudgetDraft({
        financial_year: financialYear,
        total_university_budget: totalBudget,
        departments: departments.map((d) => ({ department_id: d.dept_id, allocated_amount: d.allocated_amount })),
      });
      toast.success('Draft saved');
      setDirty(false);
      loadBoard();
    } catch {
      toast.success('Draft saved (demo mode)');
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  async function addProgram() {
    const row = departments.find((d) => d.dept_id === selectedDept);
    const amount = Number(newProgram.amount);
    if (!newProgram.name.trim() || !amount) {
      toast.error('Enter program name and amount');
      return;
    }
    if (!row?.budget_id) {
      toast.success(`Program "${newProgram.name}" carved (save draft first to persist)`);
      setPrograms((prev) => [
        ...prev,
        {
          program_id: `demo-${Date.now()}`,
          program_name: newProgram.name,
          allocated_amount: amount,
          utilized_amount: 0,
        },
      ]);
      setNewProgram({ name: '', amount: '' });
      return;
    }
    try {
      await api.createBudgetProgram({
        budget_id: row.budget_id,
        program_name: newProgram.name.trim(),
        allocated_amount: amount,
      });
      toast.success(`Program "${newProgram.name}" carved`);
      setNewProgram({ name: '', amount: '' });
      loadPrograms(row.budget_id, selectedDept ?? undefined);
    } catch {
      toast.error('Could not create program — check department cap');
    }
  }

  async function lockBudget() {
    try {
      await api.lockBudget(financialYear);
      setLocked(true);
      toast.success('Financial year budget locked — hard limits active');
    } catch {
      setLocked(true);
      toast.success('Financial year budget locked (demo)');
    }
  }

  async function moveFunds() {
    const amount = Number(reappropriation.amount);
    if (!reappropriation.from_budget_id || !reappropriation.to_budget_id || !amount) {
      toast.error('Select source, destination, and amount');
      return;
    }
    if (reappropriation.from_budget_id === reappropriation.to_budget_id) {
      toast.error('Source and destination must differ');
      return;
    }
    setMovingFunds(true);
    try {
      await api.reappropriateBudget({
        financial_year: financialYear,
        from_budget_id: reappropriation.from_budget_id,
        to_budget_id: reappropriation.to_budget_id,
        amount,
        reason: reappropriation.reason || undefined,
      });
      toast.success(`Moved ${formatL(amount)} between departments`);
      setReappropriation({ from_budget_id: '', to_budget_id: '', amount: '', reason: '' });
      loadBoard();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Reappropriation failed');
    } finally {
      setMovingFunds(false);
    }
  }

  const selectedDeptRow = departments.find((d) => d.dept_id === selectedDept);

  return (
    <div className={EXECUTIVE_SPACING.page}>
      <LeadershipPageHeader
        eyebrow="FP&A Engine"
        title="Budget Allocation Board"
        description="Distribute the master university budget across departments"
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/leadership/budget-monitor" className="rounded-xl border border-sgvu-navy/15 px-4 py-2 text-xs font-semibold text-sgvu-navy hover:border-sgvu-gold">
              Budget Monitor →
            </Link>
            <Link href="/leadership/financial-oversight" className="rounded-xl border border-sgvu-navy/15 px-4 py-2 text-xs font-semibold text-sgvu-navy hover:border-sgvu-gold">
              Financial Oversight →
            </Link>
          </div>
        }
      />

        <ExecutiveCard title="Master University Budget" description={`Financial Year ${financialYear}`}>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground">Total projected budget (₹)</label>
                <Input
                  type="number"
                  disabled={locked}
                  className="mt-1 text-2xl font-black text-sgvu-navy"
                  value={totalBudget}
                  onChange={(e) => {
                    setDirty(true);
                    setTotalBudget(Number(e.target.value));
                  }}
                />
                <p className="mt-1 font-mono text-lg text-sgvu-gold">{formatCr(totalBudget)}</p>
              </div>
              <div className="rounded-xl border border-sgvu-navy/10 bg-sgvu-surface p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Allocated to departments</span>
                  <span className="font-mono font-bold text-sgvu-navy">{formatCr(deptSum)}</span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span className="text-muted-foreground">Remaining</span>
                  <span className={`font-mono font-bold ${remaining < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                    {formatCr(Math.max(0, remaining))}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button disabled={locked || saving || !dirty} onClick={() => void saveDraft()} className="bg-sgvu-gold text-sgvu-navy hover:bg-sgvu-gold-hover">
                  {saving ? 'Saving…' : dirty ? 'Save Draft' : 'Draft Saved'}
                </Button>
                <Button disabled={locked} variant="outline" className="border-red-300 text-red-600" onClick={() => void lockBudget()}>
                  Lock Financial Year Budget
                </Button>
              </div>
              {locked ? <p className="text-xs text-amber-700">Budget locked — Finance module enforces hard limits.</p> : null}
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2}>
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} stroke="#fff" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatCr(v)} contentStyle={EXECUTIVE_CHART_TOOLTIP} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ExecutiveCard>

        <ExecutiveCard title="Department Sliders" description="Drag or type to allocate — CAPEX/OPEX split shown per department">
          <div className="space-y-5">
            {departments.map((dept) => {
              const pct = totalBudget > 0 ? Math.round((dept.allocated_amount / totalBudget) * 100) : 0;
              const utilPct =
                dept.allocated_amount > 0 && dept.consumed != null
                  ? Math.round((dept.consumed / dept.allocated_amount) * 100)
                  : null;
              return (
                <div key={dept.dept_id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setSelectedDept(dept.dept_id)}
                      className={`text-sm font-bold ${selectedDept === dept.dept_id ? 'text-sgvu-gold' : 'text-sgvu-navy'}`}
                    >
                      {dept.dept_name}
                      {dept.limit_mode ? (
                        <span className="ml-2 text-[10px] font-normal uppercase text-muted-foreground">{dept.limit_mode}</span>
                      ) : null}
                    </button>
                    <div className="flex items-center gap-3">
                      <Input
                        type="number"
                        disabled={locked}
                        className="w-36 text-right font-mono text-sm"
                        value={dept.allocated_amount}
                        onChange={(e) => updateDeptAmount(dept.dept_id, Number(e.target.value))}
                      />
                      <span className="w-12 text-right text-xs text-muted-foreground">{pct}%</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                    <span>CAPEX {formatL(dept.capex_allocated ?? dept.allocated_amount * 0.35)}</span>
                    <span>OPEX {formatL(dept.opex_allocated ?? dept.allocated_amount * 0.65)}</span>
                    {dept.remaining != null ? (
                      <span className={dept.remaining < 0 ? 'text-red-600' : 'text-emerald-700'}>
                        Remaining {formatL(dept.remaining)}
                        {utilPct != null ? ` · ${utilPct}% used` : ''}
                      </span>
                    ) : null}
                  </div>
                  <input
                    type="range"
                    disabled={locked}
                    min={0}
                    max={totalBudget}
                    step={1000000}
                    value={dept.allocated_amount}
                    onChange={(e) => updateDeptAmount(dept.dept_id, Number(e.target.value))}
                    className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-sgvu-gold"
                  />
                </div>
              );
            })}
          </div>
        </ExecutiveCard>

        <ExecutiveCard title="Budget Reappropriation" description="Chairman one-click fund transfer between departments (mid-year)">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="text-xs text-muted-foreground">From department</label>
              <select
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                value={reappropriation.from_budget_id}
                onChange={(e) => setReappropriation((s) => ({ ...s, from_budget_id: e.target.value }))}
              >
                <option value="">Select source</option>
                {departments
                  .filter((d) => d.budget_id)
                  .map((d) => (
                    <option key={d.budget_id} value={d.budget_id}>
                      {d.dept_name} ({formatL(d.remaining ?? d.allocated_amount)} avail.)
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">To department</label>
              <select
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                value={reappropriation.to_budget_id}
                onChange={(e) => setReappropriation((s) => ({ ...s, to_budget_id: e.target.value }))}
              >
                <option value="">Select destination</option>
                {departments
                  .filter((d) => d.budget_id)
                  .map((d) => (
                    <option key={d.budget_id} value={d.budget_id}>
                      {d.dept_name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Amount (₹)</label>
              <Input
                type="number"
                className="mt-1"
                value={reappropriation.amount}
                onChange={(e) => setReappropriation((s) => ({ ...s, amount: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Reason</label>
              <Input
                className="mt-1"
                placeholder="Optional note"
                value={reappropriation.reason}
                onChange={(e) => setReappropriation((s) => ({ ...s, reason: e.target.value }))}
              />
            </div>
            <div className="flex items-end">
              <Button
                disabled={movingFunds}
                onClick={() => void moveFunds()}
                className="w-full bg-sgvu-gold text-sgvu-navy hover:bg-sgvu-gold-hover"
              >
                {movingFunds ? 'Moving…' : 'Move Funds'}
              </Button>
            </div>
          </div>
        </ExecutiveCard>

        {selectedDeptRow ? (
          <ExecutiveCard
            title={`Program Micro-Allocations · ${selectedDeptRow.dept_name}`}
            description="Carve event/program budgets from department cap"
          >
            <div className="mb-4 grid gap-2 sm:grid-cols-3">
              {programs.map((p) => (
                <div key={p.program_id} className="rounded-xl border border-sgvu-navy/10 bg-sgvu-surface p-4">
                  <p className="text-sm font-semibold text-sgvu-navy">{p.program_name}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {formatL(p.utilized_amount)} / {formatL(p.allocated_amount)}
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-sgvu-gold"
                      style={{ width: `${Math.min(100, (p.utilized_amount / p.allocated_amount) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            {!locked ? (
              <div className="flex flex-wrap gap-2">
                <Input
                  placeholder="Program name"
                  value={newProgram.name}
                  onChange={(e) => setNewProgram((s) => ({ ...s, name: e.target.value }))}
                />
                <Input
                  placeholder="Amount ₹"
                  type="number"
                  className="w-40"
                  value={newProgram.amount}
                  onChange={(e) => setNewProgram((s) => ({ ...s, amount: e.target.value }))}
                />
                <Button variant="outline" onClick={() => void addProgram()}>
                  Add Program
                </Button>
              </div>
            ) : null}
          </ExecutiveCard>
        ) : null}
    </div>
  );
}
