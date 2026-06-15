'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GlassCard } from '@/components/leadership/intelligence/PremiumKPICards';
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

  const loadBoard = useCallback(() => {
    void api
      .budgetAllocation(financialYear)
      .then((board) => {
        if (board.university?.total_allocated) {
          setTotalBudget(Number(board.university.total_allocated));
          setLocked(board.university.status === 'LOCKED');
        }
        if (board.dept_budgets?.length) {
          setDepartments(
            board.dept_budgets.map((d, i) => ({
              dept_id: d.department_id,
              budget_id: d.budget_id,
              dept_name: d.dept_name,
              allocated_amount: Number(d.allocated_amount),
              color: MOCK_DEPARTMENTS[i % MOCK_DEPARTMENTS.length]?.color ?? '#3b82f6',
            })),
          );
        } else if (board.departments?.length) {
          setDepartments(
            board.departments.map((d, i) => ({
              dept_id: d.dept_id,
              dept_name: d.dept_name,
              allocated_amount: MOCK_DEPARTMENTS[i]?.allocated_amount ?? 0,
              color: MOCK_DEPARTMENTS[i % MOCK_DEPARTMENTS.length]?.color ?? '#3b82f6',
            })),
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
      departments.map((d) => ({
        name: d.dept_name,
        value: d.allocated_amount,
        color: d.color,
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

  const selectedDeptRow = departments.find((d) => d.dept_id === selectedDept);

  return (
    <div className="min-h-screen bg-[#061528] p-4 text-white lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#d6b65d]">FP&A Engine</p>
            <h1 className="text-3xl font-black">Budget Allocation Board</h1>
            <p className="mt-1 text-sm text-slate-400">Distribute the master university budget across departments</p>
          </div>
          <div className="flex gap-2">
            <Link href="/leadership/budget-monitor" className="rounded-xl border border-slate-600 px-4 py-2 text-xs font-semibold hover:border-[#d6b65d]">
              Budget Monitor →
            </Link>
            <Link href="/leadership/intelligence" className="rounded-xl border border-slate-600 px-4 py-2 text-xs font-semibold hover:border-[#d6b65d]">
              Intelligence Hub
            </Link>
          </div>
        </header>

        <GlassCard title="Master University Budget" subtitle={`Financial Year ${financialYear}`}>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-400">Total projected budget (₹)</label>
                <Input
                  type="number"
                  disabled={locked}
                  className="mt-1 border-slate-600 bg-slate-800/50 text-2xl font-black text-white"
                  value={totalBudget}
                  onChange={(e) => {
                    setDirty(true);
                    setTotalBudget(Number(e.target.value));
                  }}
                />
                <p className="mt-1 font-mono text-lg text-[#d6b65d]">{formatCr(totalBudget)}</p>
              </div>
              <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Allocated to departments</span>
                  <span className="font-mono font-bold">{formatCr(deptSum)}</span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span className="text-slate-400">Remaining</span>
                  <span className={`font-mono font-bold ${remaining < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {formatCr(Math.max(0, remaining))}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button disabled={locked || saving || !dirty} onClick={() => void saveDraft()} className="bg-[#d6b65d] text-[#08234a]">
                  {saving ? 'Saving…' : dirty ? 'Save Draft' : 'Draft Saved'}
                </Button>
                <Button disabled={locked} variant="outline" className="border-red-500/50 text-red-400" onClick={() => void lockBudget()}>
                  🔒 Lock Financial Year Budget
                </Button>
              </div>
              {locked ? <p className="text-xs text-amber-400">Budget locked — Finance module enforces hard limits.</p> : null}
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2}>
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} stroke="#061528" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatCr(v)} contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard title="Department Sliders" subtitle="Drag or type to allocate — pie chart updates live">
          <div className="space-y-5">
            {departments.map((dept) => {
              const pct = totalBudget > 0 ? Math.round((dept.allocated_amount / totalBudget) * 100) : 0;
              return (
                <div key={dept.dept_id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setSelectedDept(dept.dept_id)}
                      className={`text-sm font-bold ${selectedDept === dept.dept_id ? 'text-[#d6b65d]' : 'text-white'}`}
                    >
                      {dept.dept_name}
                    </button>
                    <div className="flex items-center gap-3">
                      <Input
                        type="number"
                        disabled={locked}
                        className="w-36 border-slate-600 bg-slate-800/50 text-right font-mono text-sm"
                        value={dept.allocated_amount}
                        onChange={(e) => updateDeptAmount(dept.dept_id, Number(e.target.value))}
                      />
                      <span className="w-12 text-right text-xs text-slate-400">{pct}%</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    disabled={locked}
                    min={0}
                    max={totalBudget}
                    step={1000000}
                    value={dept.allocated_amount}
                    onChange={(e) => updateDeptAmount(dept.dept_id, Number(e.target.value))}
                    className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-[#d6b65d]"
                  />
                </div>
              );
            })}
          </div>
        </GlassCard>

        {selectedDeptRow ? (
          <GlassCard
            title={`Program Micro-Allocations · ${selectedDeptRow.dept_name}`}
            subtitle="Carve event/program budgets from department cap"
          >
            <div className="mb-4 grid gap-2 sm:grid-cols-3">
              {programs.map((p) => (
                <div key={p.program_id} className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-3">
                  <p className="text-sm font-semibold">{p.program_name}</p>
                  <p className="font-mono text-xs text-slate-400">
                    {formatL(p.utilized_amount)} / {formatL(p.allocated_amount)}
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-700">
                    <div
                      className="h-full rounded-full bg-[#d6b65d]"
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
                  className="border-slate-600 bg-slate-800/50"
                  value={newProgram.name}
                  onChange={(e) => setNewProgram((s) => ({ ...s, name: e.target.value }))}
                />
                <Input
                  placeholder="Amount ₹"
                  type="number"
                  className="w-40 border-slate-600 bg-slate-800/50"
                  value={newProgram.amount}
                  onChange={(e) => setNewProgram((s) => ({ ...s, amount: e.target.value }))}
                />
                <Button variant="outline" className="border-slate-600" onClick={() => void addProgram()}>
                  Add Program
                </Button>
              </div>
            ) : null}
          </GlassCard>
        ) : null}
      </div>
    </div>
  );
}
