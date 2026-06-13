'use client';

import { useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  formatCr,
  MOCK_CASH_FLOW,
  MOCK_DEPT_HEALTH,
  MOCK_RECEIVABLES,
  MOCK_REVENUE_SOURCES,
} from './intelligence-mock-data';

const DARK_TOOLTIP = {
  backgroundColor: 'rgba(15, 23, 42, 0.95)',
  border: '1px solid rgba(51, 65, 85, 0.8)',
  borderRadius: '12px',
  color: '#f1f5f9',
  fontSize: 12,
  backdropFilter: 'blur(8px)',
};

const AXIS = { fill: '#64748b', fontSize: 11 };

export function CashFlowAreaChart() {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={MOCK_CASH_FLOW} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity={0.55} />
            <stop offset="100%" stopColor="#22c55e" stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#ef4444" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
        <XAxis dataKey="month" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${v}Cr`} />
        <Tooltip
          contentStyle={DARK_TOOLTIP}
          formatter={(value: number, name: string) => [`₹${value} Cr`, name === 'income' ? 'Income' : 'Expenses']}
        />
        <Area
          type="monotone"
          dataKey="income"
          stroke="#22c55e"
          strokeWidth={2.5}
          fill="url(#incomeGrad)"
          name="income"
          animationDuration={1200}
        />
        <Area
          type="monotone"
          dataKey="expenses"
          stroke="#ef4444"
          strokeWidth={2}
          fill="url(#expenseGrad)"
          name="expenses"
          animationDuration={1200}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function RevenueDonutChart() {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const total = MOCK_REVENUE_SOURCES.reduce((s, d) => s + d.value, 0);
  const active = activeIndex != null ? MOCK_REVENUE_SOURCES[activeIndex] : null;

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={MOCK_REVENUE_SOURCES}
            cx="50%"
            cy="50%"
            innerRadius={72}
            outerRadius={100}
            paddingAngle={3}
            dataKey="value"
            animationDuration={1000}
            onMouseEnter={(_, i) => setActiveIndex(i)}
            onMouseLeave={() => setActiveIndex(null)}
          >
            {MOCK_REVENUE_SOURCES.map((entry) => (
              <Cell key={entry.name} fill={entry.color} stroke="rgba(8,35,74,0.8)" strokeWidth={2} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={DARK_TOOLTIP}
            formatter={(value: number) => [formatCr(value), '']}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        {active ? (
          <>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{active.name}</p>
            <p className="font-mono text-xl font-black text-white">{formatCr(active.value)}</p>
          </>
        ) : (
          <>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total</p>
            <p className="font-mono text-xl font-black text-white">{formatCr(total)}</p>
          </>
        )}
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        {MOCK_REVENUE_SOURCES.map((s) => (
          <div key={s.name} className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            {s.name}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DefaultersReceivablesChart() {
  const { collected, pending, topDepartments } = MOCK_RECEIVABLES;
  const total = collected + pending;
  const collectedPct = Math.round((collected / total) * 100);

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 flex justify-between text-xs font-semibold">
          <span className="text-emerald-400">{formatCr(collected)} Collected</span>
          <span className="text-red-400">{formatCr(pending)} Pending</span>
        </div>
        <div className="relative h-8 overflow-hidden rounded-full bg-slate-800/80">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 shadow-[0_0_20px_rgba(34,197,94,0.5)] transition-all duration-1000"
            style={{ width: `${collectedPct}%` }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-black text-white drop-shadow-md">{collectedPct}% collected</span>
          </div>
        </div>
      </div>
      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Top pending departments</p>
        <ul className="space-y-2">
          {topDepartments.map((d, i) => (
            <li
              key={d.name}
              className="flex items-center justify-between rounded-lg border border-slate-700/40 bg-slate-800/30 px-3 py-2"
            >
              <span className="flex items-center gap-2 text-sm text-slate-300">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/20 text-[10px] font-bold text-red-400">
                  {i + 1}
                </span>
                {d.name}
              </span>
              <span className="font-mono text-sm font-bold text-red-400">{formatCr(d.due)} Due</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function DepartmentHealthChart() {
  const THRESHOLD = 80;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={MOCK_DEPT_HEALTH} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
        <YAxis type="category" dataKey="name" tick={{ ...AXIS, fill: '#94a3b8' }} width={72} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={DARK_TOOLTIP}
          formatter={(value: number) => [`${value}% utilized`, 'Budget']}
        />
        <ReferenceLine
          x={THRESHOLD}
          stroke="#ef4444"
          strokeDasharray="6 4"
          strokeWidth={2}
          label={{ value: '80% limit', position: 'top', fill: '#ef4444', fontSize: 10 }}
        />
        <Bar dataKey="utilization" radius={[0, 6, 6, 0]} animationDuration={1000} barSize={22}>
          {MOCK_DEPT_HEALTH.map((entry) => (
            <Cell
              key={entry.name}
              fill={entry.utilization >= THRESHOLD ? '#ef4444' : entry.utilization >= 70 ? '#eab308' : '#22c55e'}
              style={
                entry.utilization >= THRESHOLD
                  ? { filter: 'drop-shadow(0 0 8px rgba(239,68,68,0.7))' }
                  : undefined
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
