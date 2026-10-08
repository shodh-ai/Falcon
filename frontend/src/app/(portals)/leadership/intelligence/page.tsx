'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ExecutiveFeatureGrid, EXECUTIVE_SPACING } from '@/components/leadership/executive';
import { PremiumKPICards, GlassCard } from '@/components/leadership/intelligence/PremiumKPICards';
import { LiveFeedColumn } from '@/components/leadership/intelligence/LiveFeedColumn';
import { FalconAiChat } from '@/components/leadership/intelligence/FalconAiChat';
import { useLeadershipIntelligence } from '@/components/leadership/intelligence/LeadershipIntelligenceProvider';
import { useLeadershipApi, type IntelligenceQuadrants } from '@/lib/api/api.leadership';
import { getLeadershipHubRoutes } from '@/lib/leadership-hub-routes';

const CashFlowAreaChart = dynamic(
  () => import('@/components/leadership/intelligence/IntelligenceCharts').then((m) => m.CashFlowAreaChart),
  { ssr: false, loading: () => <div className="h-64 animate-pulse rounded-xl bg-slate-100" /> },
);
const RevenueDonutChart = dynamic(
  () => import('@/components/leadership/intelligence/IntelligenceCharts').then((m) => m.RevenueDonutChart),
  { ssr: false, loading: () => <div className="h-64 animate-pulse rounded-xl bg-slate-100" /> },
);
const DefaultersReceivablesChart = dynamic(
  () =>
    import('@/components/leadership/intelligence/IntelligenceCharts').then((m) => m.DefaultersReceivablesChart),
  { ssr: false, loading: () => <div className="h-64 animate-pulse rounded-xl bg-slate-100" /> },
);
const DepartmentHealthChart = dynamic(
  () => import('@/components/leadership/intelligence/IntelligenceCharts').then((m) => m.DepartmentHealthChart),
  { ssr: false, loading: () => <div className="h-64 animate-pulse rounded-xl bg-slate-100" /> },
);

export default function LeadershipIntelligencePage() {
  const { feed, connected } = useLeadershipIntelligence();
  const api = useLeadershipApi();
  const [brief, setBrief] = useState<{ brief_date: string; bullets: string[] } | null>(null);
  const [ticker, setTicker] = useState<{
    revenue_today: number;
    expense_today: number;
    net_profit_today: number;
    cash_in_bank: number;
  } | null>(null);
  const [quadrants, setQuadrants] = useState<IntelligenceQuadrants | null>(null);
  const [forecast, setForecast] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    void api.ownerBrief().then(setBrief).catch(() => setBrief(null));
    void api.ticker().then(setTicker).catch(() => setTicker(null));
    void api.quadrants('year').then(setQuadrants).catch(() => setQuadrants(null));
    void api.predictiveForecast().then(setForecast).catch(() => setForecast(null));
  }, [api]);

  const [charts, setCharts] = useState<ReturnType<
    typeof import('@/components/leadership/intelligence/IntelligenceCharts').quadrantsToChartData
  > | null>(null);
  useEffect(() => {
    void import('@/components/leadership/intelligence/IntelligenceCharts').then((mod) => {
      setCharts(mod.quadrantsToChartData(quadrants));
    });
  }, [quadrants]);

  const reportsHub = getLeadershipHubRoutes('reports');
  const intake = (forecast?.intake_analysis as Record<string, unknown>) ?? {};
  const resource = (forecast?.resource_forecasting as Record<string, unknown>) ?? {};

  return (
    <div className={EXECUTIVE_SPACING.page}>
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-sgvu-gold">Reports & Analytics</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-sgvu-navy lg:text-4xl">
          Financial Intelligence Platform
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {connected ? 'Live feed connected · Chairman view' : 'Analytics dashboard — Chairman view'}
        </p>
      </header>

      <ExecutiveFeatureGrid title={reportsHub.title} description={reportsHub.description} routes={reportsHub.routes} />

      <PremiumKPICards
        variant="light"
        data={
          ticker
            ? {
                revenueToday: ticker.revenue_today,
                expenseToday: ticker.expense_today,
                netProfitToday: ticker.net_profit_today,
                cashInBank: ticker.cash_in_bank,
              }
            : null
        }
      />

      {brief?.bullets?.length ? (
        <GlassCard title={`Falcon Owner's Brief · ${brief.brief_date}`} subtitle="Proactive morning summary — strategy before firefighting" variant="light">
          <ul className="space-y-2">
            {brief.bullets.slice(0, 4).map((b) => (
              <li key={b} className="rounded-xl border border-sgvu-navy/10 bg-slate-50 px-4 py-3 text-sm text-sgvu-navy">
                {b}
              </li>
            ))}
          </ul>
        </GlassCard>
      ) : null}

      <GlassCard title="Predictive Forecast" subtitle="Intake conversion and resource planning" variant="light">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-sgvu-navy/10 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Avg conversion</p>
            <p className="mt-1 text-2xl font-bold text-sgvu-navy">{String(intake.avg_conversion_rate_pct ?? '—')}%</p>
          </div>
          <div className="rounded-xl border border-sgvu-navy/10 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Faculty:student ratio</p>
            <p className="mt-1 text-2xl font-bold text-sgvu-navy">{String(resource.current_faculty_student_ratio ?? '—')}</p>
          </div>
          <div className="rounded-xl border border-sgvu-navy/10 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Faculty needed (+500 intake)</p>
            <p className="mt-1 text-2xl font-bold text-sgvu-navy">
              {String((resource.if_admit_500_more as Record<string, unknown>)?.additional_faculty_needed ?? '—')}
            </p>
          </div>
        </div>
        <Link href="/leadership/forecasting" className="mt-3 inline-block text-xs font-bold text-sgvu-gold hover:underline">
          Full forecasting model →
        </Link>
      </GlassCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <GlassCard title="Q1 · Revenue vs Expenses" subtitle="Ledger trend by period" variant="light">
          <CashFlowAreaChart data={charts?.cashFlow} variant="light" />
        </GlassCard>
        <GlassCard title="Q2 · Revenue by Source" subtitle="Tuition, hostel, transport, and other" variant="light">
          <RevenueDonutChart data={charts?.revenueSources} variant="light" />
        </GlassCard>
        <GlassCard title="Q3 · Receivables & Collection" subtitle="Outstanding vs collected fees" variant="light">
          <DefaultersReceivablesChart data={charts?.receivables} variant="light" />
        </GlassCard>
        <GlassCard title="Q4 · Department Health Scores" subtitle="Budget adherence and ROI composite" variant="light">
          <DepartmentHealthChart data={charts?.deptHealth} variant="light" />
        </GlassCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <GlassCard title="Live Campus Feed" subtitle="Real-time treasury and campus events" variant="light">
          <LiveFeedColumn events={feed} connected={connected} />
        </GlassCard>
        <GlassCard title="Falcon AI Analyst" subtitle="Ask about cash flow, anomalies, and forecasts" variant="light">
          <FalconAiChat />
        </GlassCard>
      </div>
    </div>
  );
}
