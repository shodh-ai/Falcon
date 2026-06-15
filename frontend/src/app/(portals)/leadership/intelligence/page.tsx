'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PremiumKPICards, GlassCard } from '@/components/leadership/intelligence/PremiumKPICards';
import {
  CashFlowAreaChart,
  RevenueDonutChart,
  DefaultersReceivablesChart,
  DepartmentHealthChart,
} from '@/components/leadership/intelligence/IntelligenceCharts';
import { LiveFeedColumn } from '@/components/leadership/intelligence/LiveFeedColumn';
import { FalconAiChat } from '@/components/leadership/intelligence/FalconAiChat';
import { useLeadershipIntelligence } from '@/components/leadership/intelligence/LeadershipIntelligenceProvider';
import { useLeadershipApi } from '@/lib/api/api.leadership';

export default function LeadershipIntelligencePage() {
  const { feed, connected } = useLeadershipIntelligence();
  const api = useLeadershipApi();
  const [brief, setBrief] = useState<{ brief_date: string; bullets: string[] } | null>(null);

  useEffect(() => {
    void api.ownerBrief().then(setBrief).catch(() => setBrief(null));
  }, [api]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#061528] text-white">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-0 h-96 w-96 rounded-full bg-blue-900/20 blur-3xl" />
        <div className="absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-[#d6b65d]/5 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '32px 32px',
          }}
        />
      </div>

      <div className="relative mx-auto max-w-[1600px] space-y-6 p-4 lg:p-8">
        {/* Header */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#d6b65d]">Executive Command Center</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-white lg:text-4xl">
              Financial Intelligence Platform
            </h1>
            <p className="mt-1 text-sm text-slate-400">Real-time university treasury · Chairman view</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/leadership/finance"
              className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-2 text-xs font-semibold text-slate-300 backdrop-blur hover:border-[#d6b65d]/40 hover:text-[#d6b65d]"
            >
              Finance Deep Dive →
            </Link>
            <Link
              href="/leadership/overview"
              className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-2 text-xs font-semibold text-slate-300 backdrop-blur hover:border-[#d6b65d]/40 hover:text-[#d6b65d]"
            >
              Campus Overview
            </Link>
          </div>
        </header>

        {/* Massive KPI cards */}
        <PremiumKPICards />

        {brief?.bullets?.length ? (
          <GlassCard title={`Falcon Owner’s Brief · ${brief.brief_date}`} subtitle="Auto-generated at 8:00 AM">
            <ul className="space-y-2">
              {brief.bullets.slice(0, 4).map((b) => (
                <li key={b} className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-3 text-sm text-slate-200">
                  {b}
                </li>
              ))}
            </ul>
          </GlassCard>
        ) : null}

        {/* Main grid: charts + live feed */}
        <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            {/* 4 Quadrants */}
            <div className="grid gap-6 lg:grid-cols-2">
              <GlassCard
                title="Revenue vs. Expenses (Last 6 Months)"
                subtitle="Cash flow trajectory — green = income, red = burn"
                action={
                  <Link href="/leadership/finance" className="text-[10px] font-semibold text-[#d6b65d] hover:underline">
                    Ledger →
                  </Link>
                }
              >
                <CashFlowAreaChart />
              </GlassCard>

              <GlassCard
                title="Revenue Intelligence by Source"
                subtitle="Hover slices to see exact amounts"
                action={
                  <Link href="/leadership/finance" className="text-[10px] font-semibold text-[#d6b65d] hover:underline">
                    Breakdown →
                  </Link>
                }
              >
                <RevenueDonutChart />
              </GlassCard>

              <GlassCard
                title="Pending Dues vs. Collected"
                subtitle="Fee receivables health across departments"
                action={
                  <Link href="/leadership/finance#defaulters" className="text-[10px] font-semibold text-[#d6b65d] hover:underline">
                    Defaulters →
                  </Link>
                }
              >
                <DefaultersReceivablesChart />
              </GlassCard>

              <GlassCard
                title="Budget Utilization & Risk Scores"
                subtitle="Red dashed line = 80% budget threshold"
                action={
                  <Link href="/leadership/finance" className="text-[10px] font-semibold text-[#d6b65d] hover:underline">
                    Budgets →
                  </Link>
                }
              >
                <DepartmentHealthChart />
              </GlassCard>
            </div>

            {/* AI Executive Briefing — elevated, not buried */}
            <FalconAiChat />
          </div>

          {/* Live feed column */}
          <div className="xl:sticky xl:top-6 xl:h-[calc(100vh-3rem)]">
            <LiveFeedColumn events={feed} connected={connected} />
          </div>
        </div>
      </div>
    </div>
  );
}
