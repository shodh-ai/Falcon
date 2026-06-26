'use client';

import { useEffect, useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { LeadershipMetricCard, LeadershipPageHeader, LeadershipSectionCard } from '@/components/leadership/LeadershipSectionCard';
import { EXECUTIVE_SPACING } from '@/components/leadership/executive/design-tokens';
import { useLeadershipApi } from '@/lib/api/api.leadership';

type CompareMode = 'MoM' | 'YoY' | 'BUDGET';

function formatPct(p: number | null) {
  if (p == null || Number.isNaN(p)) return '—';
  const sign = p >= 0 ? '+' : '';
  return `${sign}${p.toFixed(1)}%`;
}

export default function LeadershipVersusPage() {
  const api = useLeadershipApi();
  const [compare, setCompare] = useState<CompareMode>('MoM');

  const [tuition, setTuition] = useState<{ current: number; delta_pct: number | null } | null>(null);
  const [vendorSpend, setVendorSpend] = useState<{ current: number; delta_pct: number | null } | null>(null);
  const [budget, setBudget] = useState<{ allocated: number; actual: number; variance: number } | null>(null);
  const [ratios, setRatios] = useState<{
    cac: number | null;
    faculty_roi: number | null;
    opex_ratio: number | null;
    fee_collection_efficiency: number | null;
    ratio_date: string;
  } | null>(null);
  const [scatter, setScatter] = useState<Array<{ department: string; revenue: number; cost: number }>>([]);

  useEffect(() => {
    void api
      .versusVariance({ metric: 'TUITION_REVENUE', compare })
      .then((r) => {
        if ('current' in r) setTuition({ current: r.current, delta_pct: r.delta_pct });
      })
      .catch(() => setTuition(null));

    void api
      .versusVariance({ metric: 'VENDOR_SPEND', compare })
      .then((r) => {
        if ('current' in r) setVendorSpend({ current: r.current, delta_pct: r.delta_pct });
      })
      .catch(() => setVendorSpend(null));

    void api
      .versusVariance({ metric: 'BUDGET_UTILIZATION', compare: 'BUDGET' })
      .then((r) => {
        if ('allocated' in r) setBudget({ allocated: r.allocated, actual: r.actual, variance: r.variance });
      })
      .catch(() => setBudget(null));

    void api
      .ownerRatios()
      .then((r) => setRatios({
        ratio_date: r.ratio_date,
        cac: r.cac,
        faculty_roi: r.faculty_roi,
        opex_ratio: r.opex_ratio,
        fee_collection_efficiency: r.fee_collection_efficiency,
      }))
      .catch(() => setRatios(null));

    void api.deptScatter().then((r) => setScatter(r.points)).catch(() => setScatter([]));
  }, [api, compare]);

  const scatterOption = useMemo(() => {
    const data = scatter.map((p) => ({ name: p.department, value: [p.cost, p.revenue] }));
    return {
      backgroundColor: 'transparent',
      grid: { left: 46, right: 24, top: 20, bottom: 40 },
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(15,23,42,0.95)',
        borderColor: '#334155',
        textStyle: { color: '#f1f5f9', fontSize: 12 },
        formatter: (p: { name: string; value: [number, number] }) =>
          `${p.name}<br/>Cost: ₹${Number(p.value[0] ?? 0).toLocaleString('en-IN')}<br/>Revenue: ₹${Number(p.value[1] ?? 0).toLocaleString('en-IN')}`,
      },
      xAxis: {
        name: 'Total Cost (₹)',
        nameTextStyle: { color: '#94a3b8' },
        axisLabel: { color: '#94a3b8' },
        splitLine: { lineStyle: { color: 'rgba(148,163,184,0.12)' } },
      },
      yAxis: {
        name: 'Total Revenue (₹)',
        nameTextStyle: { color: '#94a3b8' },
        axisLabel: { color: '#94a3b8' },
        splitLine: { lineStyle: { color: 'rgba(148,163,184,0.12)' } },
      },
      series: [
        {
          type: 'scatter',
          symbolSize: 12,
          itemStyle: { color: '#d6b65d' },
          data,
        },
      ],
    };
  }, [scatter]);

  return (
    <div className={EXECUTIVE_SPACING.page}>
      <LeadershipPageHeader
        eyebrow="Versus Engine"
        title="Comparative Analytics"
        description="MoM / YoY / Budget vs Actual + Department quadrants"
      />

      <div className="flex gap-2">
        {(['MoM', 'YoY', 'BUDGET'] as CompareMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setCompare(m)}
            className={
              m === compare
                ? 'rounded-lg border bg-sgvu-navy px-3 py-2 text-xs font-bold text-white'
                : 'rounded-lg border bg-white/60 px-3 py-2 text-xs font-bold text-sgvu-navy hover:bg-white'
            }
          >
            {m}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <LeadershipMetricCard
          label="Tuition Revenue (30d)"
          value={`₹${Number(tuition?.current ?? 0).toLocaleString('en-IN')}`}
          highlight={Boolean(tuition?.delta_pct != null && tuition.delta_pct >= 0)}
        />
        <LeadershipMetricCard
          label={`Variance (${compare})`}
          value={formatPct(tuition?.delta_pct ?? null)}
        />
        <LeadershipMetricCard
          label="Vendor Spend (30d)"
          value={`₹${Number(vendorSpend?.current ?? 0).toLocaleString('en-IN')}`}
        />
      </div>

      {budget ? (
        <LeadershipSectionCard title="Budget vs Actual">
          <div className="grid gap-4 sm:grid-cols-3">
            <LeadershipMetricCard label="Allocated" value={`₹${budget.allocated.toLocaleString('en-IN')}`} />
            <LeadershipMetricCard label="Actual" value={`₹${budget.actual.toLocaleString('en-IN')}`} />
            <LeadershipMetricCard label="Variance" value={`₹${budget.variance.toLocaleString('en-IN')}`} highlight={budget.variance >= 0} />
          </div>
        </LeadershipSectionCard>
      ) : null}

      {ratios ? (
        <LeadershipSectionCard title={`Vital Signs · ${ratios.ratio_date}`}>
          <div className="grid gap-4 sm:grid-cols-4">
            <LeadershipMetricCard label="CAC" value={ratios.cac != null ? `₹${Math.round(ratios.cac).toLocaleString('en-IN')}` : '—'} />
            <LeadershipMetricCard label="Faculty ROI" value={ratios.faculty_roi != null ? `${ratios.faculty_roi.toFixed(2)}x` : '—'} highlight />
            <LeadershipMetricCard label="OpEx Ratio" value={ratios.opex_ratio != null ? `${(ratios.opex_ratio * 100).toFixed(1)}%` : '—'} />
            <LeadershipMetricCard label="Collection Efficiency" value={ratios.fee_collection_efficiency != null ? `${(ratios.fee_collection_efficiency * 100).toFixed(1)}%` : '—'} />
          </div>
        </LeadershipSectionCard>
      ) : null}

      <LeadershipSectionCard title="Department Quadrants (Revenue vs Cost)">
        <ReactECharts option={scatterOption} style={{ height: 420, width: '100%' }} opts={{ renderer: 'canvas' }} />
      </LeadershipSectionCard>
    </div>
  );
}
