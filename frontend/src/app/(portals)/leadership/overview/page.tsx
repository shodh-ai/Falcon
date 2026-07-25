'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AttendanceDrillDown } from '@/components/leadership/AttendanceDrillDown';
import { LiveTickerRow } from '@/components/leadership/LiveTicker';
import { FinancialTickerGrid } from '@/components/leadership/intelligence/FinancialTickerTape';
import {
  ExecutiveActionInbox,
  ExecutiveDrillDown,
  ExecutiveFeatureGrid,
  ExecutiveHeroKpi,
  PillarSummaryCard,
  RedFlagsWidget,
  type PillarSummary,
  type RedFlag,
} from '@/components/leadership/executive';
import { EXECUTIVE_SPACING } from '@/components/leadership/executive/design-tokens';
import { LeadershipPageHeader, LeadershipSectionCard } from '@/components/leadership/LeadershipSectionCard';
import { useLeadershipApi, type IntelligenceTicker, type LeadershipOverview } from '@/lib/api/api.leadership';
import { getLeadershipHubRoutes } from '@/lib/leadership-hub-routes';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatCr(n: number) {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return `₹${n.toLocaleString('en-IN')}`;
}

export default function LeadershipOverviewPage() {
  const api = useLeadershipApi();
  const [data, setData] = useState<LeadershipOverview | null>(null);
  const [flags, setFlags] = useState<RedFlag[]>([]);
  const [pillars, setPillars] = useState<PillarSummary[]>([]);
  const [brief, setBrief] = useState<{ brief_date: string; bullets: string[] } | null>(null);
  const [actionSummary, setActionSummary] = useState<Record<string, unknown> | null>(null);
  const [ticker, setTicker] = useState<IntelligenceTicker | null>(null);
  const [pillarsOpen, setPillarsOpen] = useState(false);

  const dashboardHub = getLeadershipHubRoutes('dashboard');

  useEffect(() => {
    void api.overview().then(setData).catch(() => setData(null));
    void api.ownerBrief().then(setBrief).catch(() => setBrief(null));
    void api.actionSummary().then(setActionSummary).catch(() => setActionSummary(null));
    void api.ticker().then(setTicker).catch(() => setTicker(null));
  }, [api]);

  useEffect(() => {
    void api.redFlags('year').then((r) => setFlags(r.flags)).catch(() => setFlags([]));
    void api.pillarSummary('year').then((r) => setPillars(r.pillars)).catch(() => setPillars([]));
  }, [api]);

  const tickers = data?.tickers;
  const inboxPreview = useMemo(
    () =>
      ((actionSummary?.inbox_preview as Array<Record<string, unknown>>) ?? []).map((item) => ({
        id: String(item.id),
        category: String(item.category),
        title: String(item.title),
        subtype: item.subtype != null ? String(item.subtype) : undefined,
        amount: item.amount != null ? Number(item.amount) : undefined,
      })),
    [actionSummary],
  );

  const admissionsPillar = pillars.find((p) => p.id === 'admissions' || p.title.toLowerCase().includes('admission'));
  const financePillar = pillars.find((p) => p.id === 'finance' || p.title.toLowerCase().includes('financial'));

  return (
    <div className={EXECUTIVE_SPACING.page}>
      <LeadershipPageHeader
        eyebrow={new Date().toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' })}
        title={`${greeting()}, Chairman`}
        description={
          brief?.bullets?.[0] ??
          (data?.refreshed_at
            ? `Your daily briefing · Last sync ${new Date(data.refreshed_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
            : 'Your daily briefing — key numbers, urgent approvals, and flags')
        }
        action={
          <Link
            href="/leadership/intelligence"
            className="rounded-xl border border-sgvu-navy/15 px-4 py-2 text-xs font-semibold text-sgvu-navy hover:border-sgvu-gold"
          >
            Financial Intelligence →
          </Link>
        }
      />

      {brief && brief.bullets.length > 0 ? (
        <LeadershipSectionCard title="Today's Brief" description="Proactive strategy summary — not reactive firefighting">
          <ul className="space-y-2">
            {brief.bullets.slice(0, 5).map((bullet) => (
              <li key={bullet} className="text-sm leading-relaxed text-sgvu-navy">
                {bullet}
              </li>
            ))}
          </ul>
        </LeadershipSectionCard>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        <ExecutiveHeroKpi
          label="Revenue Today"
          value={tickers ? formatCr(tickers.revenue_today) : '—'}
          sub={`${tickers?.total_students?.toLocaleString() ?? '—'} students enrolled`}
        />
        <ExecutiveHeroKpi
          label="Campus Attendance"
          value={tickers ? `${tickers.campus_attendance_today}%` : '—'}
          status={(tickers?.campus_attendance_today ?? 100) < 75 ? 'red' : (tickers?.campus_attendance_today ?? 100) < 85 ? 'yellow' : 'green'}
        />
        <ExecutiveHeroKpi
          label="Pending Approvals"
          value={String(actionSummary?.pending_approvals ?? inboxPreview.length ?? '0')}
          status={Number(actionSummary?.pending_approvals ?? 0) > 0 ? 'yellow' : 'green'}
          sub="Across finance, HR, and budget"
        />
        <ExecutiveHeroKpi
          label="Admissions Progress"
          value={admissionsPillar?.kpis?.[0]?.value ?? '—'}
          sub={admissionsPillar?.kpis?.[1]?.label ? `${admissionsPillar.kpis[1].label}: ${admissionsPillar.kpis[1].value}` : undefined}
        />
        <ExecutiveHeroKpi
          label="Fee Defaulters"
          value={String(data?.fee_defaulter_count ?? '—')}
          status={Number(data?.fee_defaulter_count ?? 0) > 100 ? 'red' : 'green'}
          sub="Students with outstanding dues"
        />
        <ExecutiveHeroKpi
          label="Collection Health"
          value={financePillar?.kpis?.[0]?.value ?? '—'}
          sub={financePillar?.kpis?.[1]?.value}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ExecutiveActionInbox
          items={inboxPreview}
          compact
          onReviewed={() => {
            void api.actionSummary().then(setActionSummary).catch(() => setActionSummary(null));
          }}
        />
        <RedFlagsWidget flags={flags} maxItems={3} />
      </div>

      <ExecutiveDrillDown
        label="Campus Pulse"
        value={tickers ? `${tickers.campus_attendance_today}% attendance` : '—'}
        sub="Live counters, treasury pulse, and campus operations"
        status={
          (tickers?.campus_attendance_today ?? 100) < 75
            ? 'red'
            : (tickers?.campus_attendance_today ?? 100) < 85
              ? 'yellow'
              : 'green'
        }
        chart={
          <div className="space-y-6">
            {ticker ? (
              <div className="rounded-xl border border-sgvu-navy/10 bg-slate-50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Live Financial Pulse
                  </p>
                  <Link href="/leadership/intelligence" className="text-[10px] font-bold text-sgvu-gold hover:underline">
                    Intelligence Hub →
                  </Link>
                </div>
                <FinancialTickerGrid ticker={ticker} variant="light" />
              </div>
            ) : null}
            <LiveTickerRow
              items={[
                { label: 'Total Students', value: tickers?.total_students?.toLocaleString() ?? '—' },
                { label: 'Total Faculty', value: tickers?.total_faculty?.toLocaleString() ?? '—' },
                {
                  label: 'Revenue Collected Today',
                  value: tickers ? formatCr(tickers.revenue_today) : '—',
                },
                {
                  label: 'Campus Attendance Today',
                  value: tickers ? `${tickers.campus_attendance_today}%` : '—',
                  alert: (tickers?.campus_attendance_today ?? 100) < 75,
                },
              ]}
            />
            <LeadershipSectionCard title="Live Campus Feed" description="Redis-backed counters">
              <ul className="space-y-3 text-sm">
                <li className="flex justify-between">
                  <span className="text-muted-foreground">Library scans today</span>
                  <span className="font-mono font-semibold text-sgvu-navy">{data?.live.library_scans_today ?? '—'}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-muted-foreground">Buses on route</span>
                  <span className="font-mono font-semibold text-sgvu-navy">{data?.live.buses_on_route ?? '—'}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-muted-foreground">Fee defaulters</span>
                  <span className="font-mono font-semibold text-red-600">{data?.fee_defaulter_count ?? '—'}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-muted-foreground">Avg enrollment attendance</span>
                  <span className="font-mono font-semibold text-sgvu-navy">{data?.avg_attendance ?? '—'}%</span>
                </li>
              </ul>
            </LeadershipSectionCard>
          </div>
        }
      />

      <ExecutiveDrillDown
        label="Attendance Drill-Down"
        value={data?.avg_attendance != null ? `${data.avg_attendance}% avg` : '—'}
        sub="School → program → section hierarchy"
        status={(data?.avg_attendance ?? 100) < 75 ? 'red' : (data?.avg_attendance ?? 100) < 85 ? 'yellow' : 'green'}
        chart={<AttendanceDrillDown />}
      />

      <LeadershipSectionCard
        title="Pillar Health"
        description={`${pillars.length} pillars · tap any to drill down`}
        action={
          <button
            type="button"
            onClick={() => setPillarsOpen((v) => !v)}
            className="text-xs font-bold uppercase tracking-wider text-sgvu-gold hover:underline"
          >
            {pillarsOpen ? 'Collapse' : `Expand all ${pillars.length} pillars`}
          </button>
        }
      >
        {pillarsOpen ? (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {pillars.map((pillar) => (
              <PillarSummaryCard key={pillar.id} pillar={pillar} />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pillars.slice(0, 3).map((pillar) => (
              <PillarSummaryCard key={pillar.id} pillar={pillar} />
            ))}
          </div>
        )}
        {!pillarsOpen && pillars.length > 3 ? (
          <button
            type="button"
            onClick={() => setPillarsOpen(true)}
            className="mt-4 text-xs font-bold text-sgvu-gold hover:underline"
          >
            Show {pillars.length - 3} more pillars →
          </button>
        ) : null}
      </LeadershipSectionCard>

      <ExecutiveFeatureGrid
        title={dashboardHub.title}
        description={dashboardHub.description}
        routes={dashboardHub.routes}
        compact
      />
    </div>
  );
}
