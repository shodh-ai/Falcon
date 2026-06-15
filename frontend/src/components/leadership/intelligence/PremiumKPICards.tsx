'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { formatCr, MOCK_KPI } from './intelligence-mock-data';

type KpiCardProps = {
  label: string;
  value: string;
  delta?: { value: number; positive: boolean };
  accent?: 'green' | 'red' | 'gold' | 'neutral';
};

function KpiCard({ label, value, delta, accent = 'neutral' }: KpiCardProps) {
  const accentGlow = {
    green: 'shadow-[0_0_40px_-8px_rgba(34,197,94,0.35)]',
    red: 'shadow-[0_0_40px_-8px_rgba(239,68,68,0.35)]',
    gold: 'shadow-[0_0_40px_-8px_rgba(214,182,93,0.35)]',
    neutral: 'shadow-[0_0_40px_-8px_rgba(148,163,184,0.15)]',
  }[accent];

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900/40 p-5 backdrop-blur-xl',
        accentGlow,
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.04] to-transparent pointer-events-none" />
      <p className="relative text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="relative mt-2 font-mono text-3xl font-black tracking-tight text-white lg:text-4xl">{value}</p>
      {delta ? (
        <p
          className={cn(
            'relative mt-2 flex items-center gap-1 text-sm font-bold',
            delta.positive ? 'text-emerald-400' : 'text-red-400',
          )}
        >
          <span>{delta.positive ? '📈' : '📉'}</span>
          <span>
            {delta.value > 0 ? '+' : ''}
            {delta.value}% vs last year
          </span>
        </p>
      ) : null}
    </div>
  );
}

export function PremiumKPICards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label={MOCK_KPI.revenueYtd.label}
        value={formatCr(MOCK_KPI.revenueYtd.value)}
        delta={{ value: MOCK_KPI.revenueYtd.delta, positive: true }}
        accent="green"
      />
      <KpiCard
        label={MOCK_KPI.expensesYtd.label}
        value={formatCr(MOCK_KPI.expensesYtd.value)}
        delta={{ value: MOCK_KPI.expensesYtd.delta, positive: false }}
        accent="red"
      />
      <KpiCard label={MOCK_KPI.netProfit.label} value={formatCr(MOCK_KPI.netProfit.value)} accent="gold" />
      <KpiCard label={MOCK_KPI.liquidCash.label} value={formatCr(MOCK_KPI.liquidCash.value)} accent="neutral" />
    </div>
  );
}

export function GlassCard({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-900/30 p-5 backdrop-blur-xl',
        className,
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] via-transparent to-transparent pointer-events-none" />
      <div className="relative mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold tracking-tight text-white">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      <div className="relative">{children}</div>
    </section>
  );
}
