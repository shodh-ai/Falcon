'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ReactECharts from 'echarts-for-react';
import {
  QuadrantChart,
  buildDefaulterGauge,
  buildLedgerChart,
} from '@/components/leadership/intelligence/QuadrantChart';
import { DefaulterHeatmap } from '@/components/leadership/LeadershipCharts';
import { LeadershipPageHeader, LeadershipSectionCard } from '@/components/leadership/LeadershipSectionCard';
import {
  ExecutiveDateRangeFilter,
  ExecutiveExportButton,
  EXECUTIVE_SPACING,
  TrafficLightKpi,
  type ExecutivePeriod,
} from '@/components/leadership/executive';
import { useLeadershipApi } from '@/lib/api/api.leadership';
import { CashFlowSankeyChart } from '@/components/leadership/owners/CashFlowSankeyChart';
import { DailyCashWaterfallChart } from '@/components/leadership/owners/DailyCashWaterfallChart';

export default function LeadershipFinancePage() {
  const api = useLeadershipApi();
  const [period, setPeriod] = useState<ExecutivePeriod>('year');
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [brief, setBrief] = useState<{ brief_date: string; bullets: string[] } | null>(null);
  const [sankey, setSankey] = useState<{ nodes: { name: string }[]; links: { source: string; target: string; value: number }[] } | null>(null);
  const [waterfall, setWaterfall] = useState<{
    date: string;
    bank_account_key: string;
    starting_balance: number;
    steps: Array<{ label: string; value: number }>;
    ending_balance: number;
  } | null>(null);

  useEffect(() => {
    void api.finance().then(setData).catch(() => setData(null));
    void api.financeSummary().then(setSummary).catch(() => setSummary(null));
    void api.ownerBrief().then(setBrief).catch(() => setBrief(null));
    void api.cashFlowSankey().then((r) => setSankey({ nodes: r.nodes, links: r.links })).catch(() => setSankey(null));
    void api.dailyCashWaterfall().then(setWaterfall).catch(() => setWaterfall(null));
  }, [api]);

  const revenueVsExpenses = (data?.revenue_vs_expenses as Record<string, unknown>[]) ?? [];
  const defaulters = (data?.defaulters_by_department as Array<{ department: string; outstanding: number }>) ?? [];
  const topDefaulters = (summary?.top_defaulter_departments as Array<{ department: string; outstanding: number }>) ?? defaulters.slice(0, 5);
  const revenueBySource = (data?.revenue_by_source as Array<{ source: string; amount: number }>) ?? [];

  const collected = Number(summary?.collected_revenue ?? 0);
  const outstanding = Number(summary?.outstanding ?? 0);
  const collectionRate = Number(summary?.collection_rate_pct ?? 0);

  const gaugeOption = useMemo(
    () => buildDefaulterGauge(collected, outstanding),
    [collected, outstanding],
  );

  const ledgerData = revenueVsExpenses.map((r) => ({
    period: String(r.month ?? ''),
    revenue: Number(r.revenue ?? 0),
    expenses: Number(r.expenses ?? 0),
  }));

  return (
    <div className={EXECUTIVE_SPACING.page}>
      <LeadershipPageHeader
        eyebrow="Financial Health"
        title="Owner Cash Flow"
        description="Fee collection status, defaulters, scholarships, and budget utilization"
        action={
          <div className="flex flex-col gap-2 sm:items-end">
            <ExecutiveDateRangeFilter value={period} onChange={setPeriod} />
            <ExecutiveExportButton targetId="finance-dashboard" filename="financial-health" />
          </div>
        }
      />

      <div className="flex justify-end">
        <Link href="/leadership/budget-monitor" className="text-xs font-bold text-sgvu-gold hover:underline">
          Budget utilization drill-down →
        </Link>
      </div>

      <div id="finance-dashboard" className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TrafficLightKpi
            label="Collection Rate"
            value={`${collectionRate}%`}
            status={collectionRate >= 85 ? 'green' : collectionRate >= 70 ? 'yellow' : 'red'}
          />
          <TrafficLightKpi label="Collected" value={`₹${(collected / 100000).toFixed(1)}L`} status="green" />
          <TrafficLightKpi label="Outstanding" value={`₹${(outstanding / 100000).toFixed(1)}L`} status={outstanding > 0 ? 'red' : 'green'} />
          <TrafficLightKpi
            label="Scholarships & Waivers"
            value={`₹${(Number(summary?.scholarship_waiver_total ?? 0) / 100000).toFixed(1)}L`}
            status="yellow"
            sub="Impact on profit margins"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <LeadershipSectionCard title="Fee Collection Status">
            <ReactECharts option={gaugeOption} style={{ height: 260, width: '100%' }} opts={{ renderer: 'canvas' }} />
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Expected ₹{Number(summary?.expected_revenue ?? 0).toLocaleString('en-IN')} · Collected ₹
              {collected.toLocaleString('en-IN')}
            </p>
          </LeadershipSectionCard>
          <LeadershipSectionCard title="Operations Snapshot">
            <div className="grid gap-3 sm:grid-cols-1">
              <TrafficLightKpi label="Salary Disbursement (MTD)" value={`₹${Number(data?.salary_disbursement ?? 0).toLocaleString()}`} status="green" />
              <TrafficLightKpi label="Hostel/Mess Revenue" value={`₹${Number(data?.hostel_mess_revenue ?? 0).toLocaleString()}`} status="green" />
              <TrafficLightKpi label="Hostel Ops Cost" value={`₹${Number(data?.hostel_ops_cost ?? 0).toLocaleString()}`} status="yellow" />
            </div>
          </LeadershipSectionCard>
        </div>

        {brief?.bullets?.length ? (
          <LeadershipSectionCard title={`Falcon Owner’s Brief · ${brief.brief_date}`}>
            <ul className="space-y-2">
              {brief.bullets.slice(0, 4).map((b) => (
                <li key={b} className="rounded-lg border bg-white/70 px-4 py-3 text-sm text-sgvu-navy">
                  {b}
                </li>
              ))}
            </ul>
          </LeadershipSectionCard>
        ) : null}

        {sankey ? (
          <LeadershipSectionCard title="The Money River (Sankey)">
            <CashFlowSankeyChart data={{ from: '', to: '', ...sankey }} />
          </LeadershipSectionCard>
        ) : null}

        {waterfall ? (
          <LeadershipSectionCard title="Daily Net Cash (Waterfall)">
            <DailyCashWaterfallChart data={waterfall} />
          </LeadershipSectionCard>
        ) : null}

        <LeadershipSectionCard title="Revenue vs Expenses (Ledger)">
          <QuadrantChart option={buildLedgerChart(ledgerData)} height={280} />
        </LeadershipSectionCard>

        {revenueBySource.length > 0 ? (
          <LeadershipSectionCard title="Revenue by Source">
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {revenueBySource.map((r) => (
                <li key={r.source} className="rounded-lg border px-4 py-3">
                  <p className="text-xs text-muted-foreground">{r.source}</p>
                  <p className="font-mono text-lg font-bold text-sgvu-navy">₹{r.amount.toLocaleString('en-IN')}</p>
                </li>
              ))}
            </ul>
          </LeadershipSectionCard>
        ) : null}

        <LeadershipSectionCard title="Top 5 Defaulter Departments" id="defaulters">
          <DefaulterHeatmap data={topDefaulters} />
        </LeadershipSectionCard>
      </div>
    </div>
  );
}
