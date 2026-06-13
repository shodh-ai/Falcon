'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, ArrowLeft } from 'lucide-react';
import { BudgetSankeyChart } from '@/components/leadership/budget/BudgetSankeyChart';
import { GlassCard } from '@/components/leadership/intelligence/PremiumKPICards';
import {
  MOCK_CATERING_EXPENSES,
  MOCK_MONITOR_DEPTS,
  MOCK_PROGRAMS,
  MOCK_TECHFEST_BREAKDOWN,
  formatCr,
  formatL,
} from '@/components/leadership/budget/budget-fpa-mock-data';
import { useLeadershipApi } from '@/lib/api/api.leadership';

type DrillLevel = 'departments' | 'programs' | 'ledger' | 'expenses';
type DeptRow = {
  budget_id: string;
  department_id: number;
  department_name: string;
  allocated_amount: number;
  utilized_amount: number;
  encumbered_amount: number;
  utilization_percent: number;
};
type ProgramRow = { program_id: string; program_name: string; allocated_amount: number; utilized_amount: number };
type BreakdownRow = { category: string; amount: number };
type ExpenseRow = (typeof MOCK_CATERING_EXPENSES)[0];

export default function BudgetMonitorPage() {
  const api = useLeadershipApi();
  const [level, setLevel] = useState<DrillLevel>('departments');
  const [depts, setDepts] = useState<DeptRow[]>(MOCK_MONITOR_DEPTS);
  const [selectedDept, setSelectedDept] = useState<DeptRow | null>(null);
  const [selectedProgram, setSelectedProgram] = useState<ProgramRow | null>(null);
  const [breakdown, setBreakdown] = useState<BreakdownRow[]>(MOCK_TECHFEST_BREAKDOWN);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRow[]>(MOCK_CATERING_EXPENSES);
  const [sankey, setSankey] = useState<{ nodes: { name: string }[]; links: { source: string; target: string; value: number }[] } | undefined>();

  useEffect(() => {
    void api.budgetMonitorSankey().then(setSankey).catch(() => setSankey(undefined));
    void api
      .budgetMonitorDepartments()
      .then((rows) => {
        if (rows?.length) setDepts(rows as DeptRow[]);
      })
      .catch(() => undefined);
  }, [api]);

  function selectDept(dept: DeptRow) {
    setSelectedDept(dept);
    setLevel('programs');
  }

  function selectProgram(prog: ProgramRow) {
    setSelectedProgram(prog);
    setLevel('ledger');
    void api
      .budgetProgramLedger(prog.program_id)
      .then((res) => {
        if (res?.breakdown?.length) {
          setBreakdown(
            res.breakdown.map((b: { category: string; total: string }) => ({
              category: b.category ?? 'Other',
              amount: Number(b.total),
            })),
          );
        }
      })
      .catch(() => setBreakdown(MOCK_TECHFEST_BREAKDOWN));
  }

  function selectCategory(cat: string) {
    setSelectedCategory(cat);
    setLevel('expenses');
    if (selectedProgram) {
      void api
        .budgetExpenseGroundTruth(selectedProgram.program_id, cat)
        .then((rows) => {
          if (rows?.length) setExpenses(rows as ExpenseRow[]);
        })
        .catch(() => setExpenses(MOCK_CATERING_EXPENSES));
    }
  }

  function goBack() {
    if (level === 'expenses') {
      setLevel('ledger');
      setSelectedCategory(null);
    } else if (level === 'ledger') {
      setLevel('programs');
      setSelectedProgram(null);
    } else if (level === 'programs') {
      setLevel('departments');
      setSelectedDept(null);
    }
  }

  const programs: ProgramRow[] = selectedDept
    ? MOCK_PROGRAMS[selectedDept.department_id] ?? []
    : [];

  const breadcrumbs = [
    { label: 'All Departments', active: level === 'departments' },
    ...(selectedDept ? [{ label: selectedDept.department_name, active: level === 'programs' }] : []),
    ...(selectedProgram ? [{ label: selectedProgram.program_name, active: level === 'ledger' }] : []),
    ...(selectedCategory ? [{ label: selectedCategory, active: level === 'expenses' }] : []),
  ];

  return (
    <div className="min-h-screen bg-[#061528] p-4 text-white lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#d6b65d]">Ground-Depth Drill-Down</p>
            <h1 className="text-3xl font-black">Budget Monitor</h1>
            <p className="mt-1 text-sm text-slate-400">University → Department → Program → Invoice</p>
          </div>
          <Link href="/leadership/budget-allocation" className="rounded-xl border border-slate-600 px-4 py-2 text-xs font-semibold hover:border-[#d6b65d]">
            ← Allocation Board
          </Link>
        </header>

        <GlassCard title="Budget Flow (Sankey)" subtitle="How ₹100 Cr flows from University to vendors">
          <BudgetSankeyChart data={sankey} />
        </GlassCard>

        <div className="flex flex-wrap items-center gap-1 text-xs text-slate-400">
          {level !== 'departments' ? (
            <button type="button" onClick={goBack} className="mr-2 flex items-center gap-1 text-[#d6b65d] hover:underline">
              <ArrowLeft className="h-3 w-3" /> Back
            </button>
          ) : null}
          {breadcrumbs.map((b, i) => (
            <span key={b.label} className="flex items-center gap-1">
              {i > 0 ? <ChevronRight className="h-3 w-3" /> : null}
              <span className={b.active ? 'font-bold text-white' : ''}>{b.label}</span>
            </span>
          ))}
        </div>

        {level === 'departments' ? (
          <GlassCard title="Department Utilization" subtitle="Click a bar to drill into programs">
            <div className="space-y-3">
              {depts.map((d) => {
                const over80 = d.utilization_percent >= 80;
                return (
                  <button
                    key={d.budget_id}
                    type="button"
                    onClick={() => selectDept(d)}
                    className="group w-full rounded-xl border border-slate-700/50 bg-slate-800/30 p-4 text-left transition hover:border-[#d6b65d]/40"
                  >
                    <div className="mb-2 flex justify-between text-sm">
                      <span className="font-bold group-hover:text-[#d6b65d]">{d.department_name}</span>
                      <span className="font-mono text-slate-300">
                        {formatCr(d.allocated_amount)} Allocated · {d.utilization_percent}% Utilized
                      </span>
                    </div>
                    <div className="relative h-4 overflow-hidden rounded-full bg-slate-700/80">
                      <div
                        className={`absolute inset-y-0 left-0 rounded-full transition-all ${
                          over80 ? 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.6)]' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, d.utilization_percent)}%` }}
                      />
                      {over80 ? (
                        <div className="absolute right-2 top-0 flex h-full items-center text-[9px] font-bold text-white">
                          ⚠ 80%+
                        </div>
                      ) : null}
                    </div>
                    <p className="mt-1 text-[10px] text-slate-500">
                      Paid {formatCr(d.utilized_amount)} · Committed (POs) {formatCr(d.encumbered_amount)}
                    </p>
                  </button>
                );
              })}
            </div>
          </GlassCard>
        ) : null}

        {level === 'programs' && selectedDept ? (
          <GlassCard title={`${selectedDept.department_name} — Program Breakdown`} subtitle="Click a program to view micro-ledger">
            <div className="grid gap-3 sm:grid-cols-2">
              {programs.map((p) => (
                <button
                  key={p.program_id}
                  type="button"
                  onClick={() => selectProgram(p)}
                  className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4 text-left hover:border-[#d6b65d]/40"
                >
                  <p className="font-bold">{p.program_name}</p>
                  <p className="mt-1 font-mono text-sm text-slate-400">
                    {formatL(p.utilized_amount)} / {formatL(p.allocated_amount)}
                  </p>
                </button>
              ))}
            </div>
          </GlassCard>
        ) : null}

        {level === 'ledger' && selectedProgram ? (
          <GlassCard
            title={selectedProgram.program_name}
            subtitle={`Allocated ${formatL(selectedProgram.allocated_amount)} · Utilized ${formatL(selectedProgram.utilized_amount)}`}
          >
            <div className="space-y-2">
              {breakdown.map((b) => (
                <button
                  key={b.category}
                  type="button"
                  onClick={() => selectCategory(b.category)}
                  className="flex w-full items-center justify-between rounded-lg border border-slate-700/40 bg-slate-800/20 px-4 py-3 hover:border-[#d6b65d]/40"
                >
                  <span className="font-semibold">{b.category}</span>
                  <span className="font-mono text-[#d6b65d]">{formatL(b.amount)}</span>
                </button>
              ))}
            </div>
          </GlassCard>
        ) : null}

        {level === 'expenses' && selectedCategory ? (
          <GlassCard title="Ground Truth — Invoices" subtitle={`All ${selectedCategory} expenses for ${selectedProgram?.program_name}`}>
            <ul className="space-y-3">
              {expenses.map((e) => (
                <li key={e.expense_id} className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-4">
                  <p className="font-semibold text-white">{e.description}</p>
                  <p className="mt-1 font-mono text-lg text-emerald-400">{formatL(e.amount)}</p>
                  <p className="mt-2 text-xs text-slate-400">
                    Approved by {e.approved_by_name} on {new Date(e.expense_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}
                  </p>
                </li>
              ))}
            </ul>
          </GlassCard>
        ) : null}
      </div>
    </div>
  );
}
