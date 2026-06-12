'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  QuadrantChart,
  buildLedgerChart,
} from '@/components/leadership/intelligence/QuadrantChart';
import { DefaulterHeatmap } from '@/components/leadership/LeadershipCharts';
import { LeadershipMetricCard, LeadershipPageHeader, LeadershipSectionCard } from '@/components/leadership/LeadershipSectionCard';
import { useLeadershipApi } from '@/lib/api/api.leadership';
import { CashFlowSankeyChart } from '@/components/leadership/owners/CashFlowSankeyChart';
import { DailyCashWaterfallChart } from '@/components/leadership/owners/DailyCashWaterfallChart';

export default function LeadershipFinancePage() {
  const api = useLeadershipApi();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
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
    void api.ownerBrief().then(setBrief).catch(() => setBrief(null));
    void api.cashFlowSankey().then((r) => setSankey({ nodes: r.nodes, links: r.links })).catch(() => setSankey(null));
    void api.dailyCashWaterfall().then(setWaterfall).catch(() => setWaterfall(null));
  }, [api]);

  const revenueVsExpenses = (data?.revenue_vs_expenses as Record<string, unknown>[]) ?? [];
  const defaulters = (data?.defaulters_by_department as Array<{ department: string; outstanding: number }>) ?? [];
  const revenueBySource = (data?.revenue_by_source as Array<{ source: string; amount: number }>) ?? [];

  const ledgerData = revenueVsExpenses.map((r) => ({
    period: String(r.month ?? ''),
    revenue: Number(r.revenue ?? 0),
    expenses: Number(r.expenses ?? 0),
  }));

  return (
    <div className="space-y-6 p-6">
      <LeadershipPageHeader
        eyebrow="Financial Health"
        title="Owner Cash Flow"
        description="Automated double-entry · Sankey money river + daily cash waterfall"
      />

      <div className="flex justify-end">
        <Link href="/leadership/intelligence" className="text-xs font-bold text-sgvu-gold hover:underline">
          ← Back to God-Mode Dashboard
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <LeadershipMetricCard label="Salary Disbursement (MTD)" value={`₹${Number(data?.salary_disbursement ?? 0).toLocaleString()}`} />
        <LeadershipMetricCard label="Hostel/Mess Revenue" value={`₹${Number(data?.hostel_mess_revenue ?? 0).toLocaleString()}`} highlight />
        <LeadershipMetricCard label="Hostel Ops Cost" value={`₹${Number(data?.hostel_ops_cost ?? 0).toLocaleString()}`} />
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

      <LeadershipSectionCard title="Outstanding Fee Defaulters by Department" id="defaulters">
        <DefaulterHeatmap data={defaulters} />
      </LeadershipSectionCard>
    </div>
  );
}
