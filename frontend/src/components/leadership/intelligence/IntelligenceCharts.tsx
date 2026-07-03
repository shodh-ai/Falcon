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
  EXECUTIVE_CHART_COLORS,
  EXECUTIVE_CHART_TOOLTIP,
} from '@/components/leadership/executive/design-tokens';
import type { IntelligenceQuadrants } from '@/lib/api/api.leadership';
import { cn } from '@/lib/utils';
import {
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

const LIGHT_AXIS = { fill: EXECUTIVE_CHART_COLORS.slate, fontSize: 11 };
const DARK_AXIS = { fill: '#64748b', fontSize: 11 };

function toCr(n: number) {
  return n / 1e7;
}

function formatInrCr(n: number) {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return `₹${n.toLocaleString('en-IN')}`;
}

type ChartVariant = 'dark' | 'light';

function chartTooltip(variant: ChartVariant) {
  return variant === 'light' ? { contentStyle: EXECUTIVE_CHART_TOOLTIP } : { contentStyle: DARK_TOOLTIP };
}

function axisStyle(variant: ChartVariant) {
  return variant === 'light' ? LIGHT_AXIS : DARK_AXIS;
}

function gridStroke(variant: ChartVariant) {
  return variant === 'light' ? '#e2e8f0' : '#1e293b';
}

export type CashFlowPoint = { month: string; income: number; expenses: number };

export function CashFlowAreaChart({
  data,
  variant = 'light',
}: {
  data?: CashFlowPoint[];
  variant?: ChartVariant;
}) {
  const chartData =
    data ??
    MOCK_CASH_FLOW.map((d) => ({
      month: d.month,
      income: d.income,
      expenses: d.expenses,
    }));

  const axis = axisStyle(variant);
  const tooltip = chartTooltip(variant);

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={EXECUTIVE_CHART_COLORS.green} stopOpacity={0.45} />
            <stop offset="100%" stopColor={EXECUTIVE_CHART_COLORS.green} stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#ef4444" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke(variant)} vertical={false} />
        <XAxis dataKey="month" tick={axis} axisLine={false} tickLine={false} />
        <YAxis
          tick={axis}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => (data ? `₹${Number(v).toFixed(1)}Cr` : `₹${v}Cr`)}
        />
        <Tooltip
          {...tooltip}
          formatter={(value: number, name: string) => [
            data ? formatInrCr(value * 1e7) : `₹${value} Cr`,
            name === 'income' ? 'Revenue' : 'Expenses',
          ]}
        />
        <Area
          type="monotone"
          dataKey="income"
          stroke={EXECUTIVE_CHART_COLORS.green}
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

export type RevenueSourcePoint = { name: string; value: number; color: string };

export function RevenueDonutChart({
  data,
  variant = 'light',
}: {
  data?: RevenueSourcePoint[];
  variant?: ChartVariant;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const sources =
    data ??
    MOCK_REVENUE_SOURCES.map((s) => ({ name: s.name, value: s.value, color: s.color }));
  const total = sources.reduce((s, d) => s + d.value, 0);
  const active = activeIndex != null ? sources[activeIndex] : null;
  const tooltip = chartTooltip(variant);
  const centerText = variant === 'light' ? 'text-sgvu-navy' : 'text-white';
  const subText = variant === 'light' ? 'text-muted-foreground' : 'text-slate-400';

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={sources}
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
            {sources.map((entry) => (
              <Cell
                key={entry.name}
                fill={entry.color}
                stroke={variant === 'light' ? '#ffffff' : 'rgba(8,35,74,0.8)'}
                strokeWidth={2}
              />
            ))}
          </Pie>
          <Tooltip {...tooltip} formatter={(value: number) => [formatInrCr(value), '']} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        {active ? (
          <>
            <p className={cn('text-[10px] font-bold uppercase tracking-widest', subText)}>{active.name}</p>
            <p className={cn('font-mono text-xl font-black', centerText)}>{formatInrCr(active.value)}</p>
          </>
        ) : (
          <>
            <p className={cn('text-[10px] font-bold uppercase tracking-widest', subText)}>Total</p>
            <p className={cn('font-mono text-xl font-black', centerText)}>{formatInrCr(total)}</p>
          </>
        )}
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        {sources.map((s) => (
          <div key={s.name} className={cn('flex items-center gap-1.5 text-xs', subText)}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            {s.name}
          </div>
        ))}
      </div>
    </div>
  );
}

export type ReceivablesData = {
  collected: number;
  pending: number;
  topDepartments?: Array<{ name: string; due: number }>;
};

export function DefaultersReceivablesChart({
  data,
  variant = 'light',
}: {
  data?: ReceivablesData;
  variant?: ChartVariant;
}) {
  const { collected, pending, topDepartments = MOCK_RECEIVABLES.topDepartments } = data ?? MOCK_RECEIVABLES;
  const total = collected + pending || 1;
  const collectedPct = Math.round((collected / total) * 100);
  const collectedClass = variant === 'light' ? 'text-emerald-700' : 'text-emerald-400';
  const pendingClass = variant === 'light' ? 'text-red-600' : 'text-red-400';
  const trackBg = variant === 'light' ? 'bg-slate-100' : 'bg-slate-800/80';
  const rowBg = variant === 'light' ? 'border-sgvu-navy/10 bg-white' : 'border-slate-700/40 bg-slate-800/30';
  const rowText = variant === 'light' ? 'text-sgvu-navy' : 'text-slate-300';

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 flex justify-between text-xs font-semibold">
          <span className={collectedClass}>{formatInrCr(collected)} Collected</span>
          <span className={pendingClass}>{formatInrCr(pending)} Pending</span>
        </div>
        <div className={cn('relative h-8 overflow-hidden rounded-full', trackBg)}>
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-1000"
            style={{ width: `${collectedPct}%` }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={cn('text-xs font-black drop-shadow-md', variant === 'light' ? 'text-sgvu-navy' : 'text-white')}>
              {collectedPct}% collected
            </span>
          </div>
        </div>
      </div>
      {topDepartments.length > 0 ? (
        <div>
          <p className={cn('mb-2 text-[10px] font-bold uppercase tracking-widest', variant === 'light' ? 'text-muted-foreground' : 'text-slate-500')}>
            Top pending departments
          </p>
          <ul className="space-y-2">
            {topDepartments.map((d, i) => (
              <li key={d.name} className={cn('flex items-center justify-between rounded-lg border px-3 py-2', rowBg)}>
                <span className={cn('flex items-center gap-2 text-sm', rowText)}>
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/20 text-[10px] font-bold text-red-500">
                    {i + 1}
                  </span>
                  {d.name}
                </span>
                <span className={cn('font-mono text-sm font-bold', pendingClass)}>{formatInrCr(d.due)} Due</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export type DeptHealthPoint = { name: string; utilization: number };

export function DepartmentHealthChart({
  data,
  variant = 'light',
}: {
  data?: DeptHealthPoint[];
  variant?: ChartVariant;
}) {
  const chartData = data ?? MOCK_DEPT_HEALTH;
  const THRESHOLD = 80;
  const axis = axisStyle(variant);
  const tooltip = chartTooltip(variant);

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke(variant)} horizontal={false} />
        <XAxis
          type="number"
          domain={[0, 100]}
          tick={axis}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}%`}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ ...axis, fill: variant === 'light' ? EXECUTIVE_CHART_COLORS.slate : '#94a3b8' }}
          width={72}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip {...tooltip} formatter={(value: number) => [`${value}%`, 'Score']} />
        <ReferenceLine
          x={THRESHOLD}
          stroke="#ef4444"
          strokeDasharray="6 4"
          strokeWidth={2}
          label={{ value: '80% limit', position: 'top', fill: '#ef4444', fontSize: 10 }}
        />
        <Bar dataKey="utilization" radius={[0, 6, 6, 0]} animationDuration={1000} barSize={22}>
          {chartData.map((entry) => (
            <Cell
              key={entry.name}
              fill={
                entry.utilization >= THRESHOLD
                  ? '#ef4444'
                  : entry.utilization >= 70
                    ? '#eab308'
                    : EXECUTIVE_CHART_COLORS.green
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function quadrantsToChartData(quadrants: IntelligenceQuadrants | null) {
  if (!quadrants) return null;

  const cashFlow: CashFlowPoint[] = quadrants.q1_ledger.map((row) => ({
    month: row.period,
    income: toCr(row.revenue),
    expenses: toCr(row.expenses),
  }));

  const palette = [
    EXECUTIVE_CHART_COLORS.navy,
    EXECUTIVE_CHART_COLORS.slate,
    EXECUTIVE_CHART_COLORS.green,
    EXECUTIVE_CHART_COLORS.gold,
  ];
  const revenueSources: RevenueSourcePoint[] = quadrants.q2_revenue.map((row, i) => ({
    name: row.source,
    value: row.amount,
    color: palette[i % palette.length],
  }));

  const receivables: ReceivablesData = {
    collected: quadrants.q3_defaulters.total_collected,
    pending: quadrants.q3_defaulters.total_due,
  };

  const deptHealth: DeptHealthPoint[] = quadrants.q4_dept_scores.map((row) => ({
    name: row.department_name,
    utilization: row.total_score,
  }));

  return { cashFlow, revenueSources, receivables, deptHealth };
}
