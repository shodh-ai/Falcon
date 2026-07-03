'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { LeadershipPageHeader, LeadershipSectionCard } from '@/components/leadership/LeadershipSectionCard';
import {
  ExecutiveDrillDown,
  ExecutiveExportButton,
  ExecutiveFeatureGrid,
  EXECUTIVE_CHART_COLORS,
  EXECUTIVE_CHART_TOOLTIP,
  EXECUTIVE_SPACING,
  TrafficLightKpi,
} from '@/components/leadership/executive';
import { useLeadershipApi } from '@/lib/api/api.leadership';
import { getLeadershipHubRoutes } from '@/lib/leadership-hub-routes';

function formatL(n: number) {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return `₹${n.toLocaleString('en-IN')}`;
}

function bucketLabel(bucket: string) {
  const map: Record<string, string> = {
    current: 'Not yet due',
    '0_30_days': '0–30 days',
    '31_60_days': '31–60 days',
    '61_90_days': '61–90 days',
    '90_plus_days': '90+ days',
  };
  return map[bucket] ?? bucket;
}

export default function FinancialOversightPage() {
  const api = useLeadershipApi();
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void api
      .financialOverview()
      .then(setOverview)
      .catch(() => setOverview(null))
      .finally(() => setLoading(false));
  }, [api]);

  const macro = (overview?.macro_budget as Record<string, unknown>) ?? {};
  const revenue = (overview?.revenue as Record<string, unknown>) ?? {};
  const expenses = (overview?.expenses as Record<string, unknown>) ?? {};
  const waivers = (overview?.waivers as Record<string, unknown>) ?? {};
  const grants = (overview?.grants as Record<string, unknown>) ?? {};
  const wealth = (overview?.wealth as Record<string, unknown>) ?? {};
  const audit = (overview?.audit as Record<string, unknown>) ?? {};

  const departments = (macro.departments as Array<Record<string, unknown>>) ?? [];
  const treasury = (revenue.treasury as Record<string, unknown>) ?? {};
  const aging = (revenue.receivables_aging as Array<Record<string, unknown>>) ?? [];
  const payrollTrend = (expenses.payroll_trend as Array<Record<string, unknown>>) ?? [];
  const topVendors = (expenses.top_vendors as Array<Record<string, unknown>>) ?? [];
  const grantRows = (grants.grants as Array<Record<string, unknown>>) ?? [];
  const recon = (audit.bank_reconciliation as Record<string, unknown>) ?? {};
  const ledgerMods = (audit.ledger_modifications as Array<Record<string, unknown>>) ?? [];

  const totalAllocated = departments.reduce((s, d) => s + Number(d.allocated ?? 0), 0);
  const totalConsumed = departments.reduce((s, d) => s + Number(d.consumed ?? 0), 0);
  const utilizationPct = totalAllocated ? Math.round((totalConsumed / totalAllocated) * 100) : 0;

  const payrollChart = useMemo(
    () =>
      payrollTrend.map((r) => ({
        month: String(r.month ?? ''),
        payroll: Number(r.total ?? 0),
      })),
    [payrollTrend],
  );

  const agingChart = useMemo(
    () =>
      aging.map((r) => ({
        bucket: bucketLabel(String(r.bucket)),
        outstanding: Number(r.outstanding ?? 0),
      })),
    [aging],
  );

  const costPerStudent = (expenses.cost_per_student as Record<string, unknown>) ?? {};

  return (
    <div id="financial-oversight" className={EXECUTIVE_SPACING.page}>
      <LeadershipPageHeader
        eyebrow="Financial Oversight"
        title="Chairman Financial Command"
        description="Macro budget, revenue inflows, expense controls, waivers, grants, wealth, and audit shield"
        action={
          <div className="flex flex-col gap-2 sm:items-end">
            <ExecutiveExportButton targetId="financial-oversight" filename="financial-oversight" />
            <div className="flex flex-wrap gap-2 text-xs">
              <Link href="/leadership/budget-allocation" className="font-semibold text-sgvu-gold hover:underline">
                Budget Allocation →
              </Link>
              <Link href="/leadership/budget-monitor" className="font-semibold text-sgvu-gold hover:underline">
                Budget Monitor →
              </Link>
              <Link href="/leadership/finance" className="font-semibold text-sgvu-gold hover:underline">
                Cash Flow Pillar →
              </Link>
            </div>
          </div>
        }
      />

      <ExecutiveFeatureGrid
        title={getLeadershipHubRoutes('financials').title}
        description={getLeadershipHubRoutes('financials').description}
        routes={getLeadershipHubRoutes('financials').routes}
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading financial oversight…</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <TrafficLightKpi
          label="Budget Utilization"
          value={`${utilizationPct}%`}
          status={utilizationPct > 90 ? 'red' : utilizationPct > 75 ? 'yellow' : 'green'}
        />
        <TrafficLightKpi
          label="Cash in Bank"
          value={formatL(Number(treasury.cash_in_bank ?? 0))}
          status={Number(treasury.net_liquidity ?? 0) < 0 ? 'red' : 'green'}
        />
        <TrafficLightKpi
          label="Receivables Outstanding"
          value={formatL(Number(treasury.outstanding_receivables ?? 0))}
          status={Number(treasury.outstanding_receivables ?? 0) > Number(treasury.cash_in_bank ?? 0) ? 'red' : 'yellow'}
        />
        <TrafficLightKpi
          label="Waiver Impact"
          value={formatL(Number(waivers.total_waiver_impact ?? 0))}
          status={Number(waivers.total_waiver_impact ?? 0) > 1e7 ? 'yellow' : 'green'}
        />
        <TrafficLightKpi
          label="Total Debt"
          value={formatL(Number(wealth.total_debt ?? 0))}
          status={Number(wealth.total_debt ?? 0) > Number(wealth.total_corpus_fd ?? 0) ? 'red' : 'yellow'}
        />
        <TrafficLightKpi
          label="Bank Recon Flag"
          value={recon.flagged ? 'Variance' : 'OK'}
          status={recon.flagged ? 'red' : 'green'}
        />
      </div>

      {/* 1. Macro Budget */}
      <ExecutiveDrillDown
        label="Budget Utilization"
        value={`${utilizationPct}%`}
        sub={`${formatL(totalAllocated)} allocated · ${formatL(totalConsumed)} consumed`}
        status={utilizationPct > 90 ? 'red' : utilizationPct > 75 ? 'yellow' : 'green'}
        details={
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-4">Department</th>
                  <th className="py-2 pr-4">Allocated</th>
                  <th className="py-2 pr-4">CAPEX</th>
                  <th className="py-2 pr-4">OPEX</th>
                  <th className="py-2 pr-4">Consumed</th>
                  <th className="py-2 pr-4">Remaining</th>
                  <th className="py-2 pr-4">Util %</th>
                  <th className="py-2">Limit</th>
                </tr>
              </thead>
              <tbody>
                {departments.map((d) => {
                  const pct = Number(d.utilization_pct ?? 0);
                  return (
                    <tr key={String(d.budget_id)} className="border-b border-sgvu-navy/5">
                      <td className="py-2 pr-4 font-medium">{String(d.department ?? '—')}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{formatL(Number(d.allocated ?? 0))}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{formatL(Number(d.capex_allocated ?? 0))}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{formatL(Number(d.opex_allocated ?? 0))}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{formatL(Number(d.consumed ?? 0))}</td>
                      <td className="py-2 pr-4 font-mono text-xs text-emerald-700">{formatL(Number(d.remaining ?? 0))}</td>
                      <td className="py-2 pr-4">{pct}%</td>
                      <td className="py-2 text-xs uppercase">{String(d.limit_mode ?? 'SOFT_WARNING')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        }
      />

      {/* 2. Revenue */}
      <LeadershipSectionCard title="2 · Revenue Stream Oversight" description="Tuition vs non-tuition, ancillary P&L, receivables aging, treasury">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase text-sgvu-navy">Tuition vs Non-Tuition</h4>
            {(() => {
              const tv = (revenue.tuition_vs_non_tuition as Record<string, unknown>) ?? {};
              return (
                <ul className="space-y-2 text-sm">
                  <li className="flex justify-between">
                    <span>Tuition collected</span>
                    <span className="font-mono">{formatL(Number(tv.tuition_collected ?? 0))}</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Tuition expected</span>
                    <span className="font-mono">{formatL(Number(tv.tuition_expected ?? 0))}</span>
                  </li>
                  {((tv.non_tuition as Array<Record<string, unknown>>) ?? []).map((n) => (
                    <li key={String(n.source)} className="flex justify-between text-muted-foreground">
                      <span>{String(n.source)}</span>
                      <span className="font-mono">{formatL(Number(n.collected ?? 0))}</span>
                    </li>
                  ))}
                </ul>
              );
            })()}
            <h4 className="pt-2 text-xs font-bold uppercase text-sgvu-navy">Ancillary (Hostel · Mess · Transport)</h4>
            {(() => {
              const anc = (revenue.ancillary_pl as Record<string, Record<string, number>>) ?? {};
              return (
                <ul className="space-y-1 text-sm">
                  {(['hostel', 'mess', 'transport'] as const).map((k) => (
                    <li key={k} className="flex justify-between capitalize">
                      <span>{k}</span>
                      <span className="font-mono">{formatL(Number(anc[k]?.revenue ?? 0))}</span>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </div>
          <div>
            <h4 className="mb-2 text-xs font-bold uppercase text-sgvu-navy">Receivables Aging</h4>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={agingChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={(v) => `${(v / 1e5).toFixed(0)}L`} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => formatL(v)} />
                <Bar dataKey="outstanding" fill={EXECUTIVE_CHART_COLORS.navy} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-4 rounded-lg border bg-slate-50 p-3 text-sm">
              <div className="flex justify-between">
                <span>Cash in bank</span>
                <span className="font-mono font-bold">{formatL(Number(treasury.cash_in_bank ?? 0))}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span>Upcoming payroll (est.)</span>
                <span className="font-mono">{formatL(Number(treasury.upcoming_payroll_estimate ?? 0))}</span>
              </div>
              <div className="mt-1 flex justify-between font-semibold">
                <span>Net liquidity</span>
                <span className="font-mono">{formatL(Number(treasury.net_liquidity ?? 0))}</span>
              </div>
            </div>
          </div>
        </div>
      </LeadershipSectionCard>

      {/* 3. Expenses */}
      <LeadershipSectionCard title="3 · Expense Management & Approvals" description="PO tiers, payroll trend, vendor spend, cost per student">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h4 className="mb-2 text-xs font-bold uppercase text-sgvu-navy">Payroll Trend (6 months)</h4>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={payrollChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={(v) => `${(v / 1e7).toFixed(1)}Cr`} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => formatL(v)} />
                <Bar dataKey="payroll" fill={EXECUTIVE_CHART_COLORS.gold} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-4">
            <div>
              <h4 className="text-xs font-bold uppercase text-sgvu-navy">Top 5 Vendors by Spend</h4>
              <ul className="mt-2 space-y-1 text-sm">
                {topVendors.map((v) => (
                  <li key={String(v.vendor)} className="flex justify-between">
                    <span>{String(v.vendor)}</span>
                    <span className="font-mono">{formatL(Number(v.spend ?? 0))}</span>
                  </li>
                ))}
                {topVendors.length === 0 ? <li className="text-muted-foreground">No vendor spend data</li> : null}
              </ul>
            </div>
            <div className="rounded-lg border p-3">
              <h4 className="text-xs font-bold uppercase text-sgvu-navy">Cost Per Student</h4>
              <p className="mt-1 text-2xl font-black text-sgvu-navy">
                {formatL(Number(costPerStudent.cost_per_student ?? 0))}
              </p>
              <p className="text-xs text-muted-foreground">
                {Number(costPerStudent.student_count ?? 0).toLocaleString()} students ·{' '}
                {formatL(Number(costPerStudent.total_operational_cost ?? 0))} total ops cost
              </p>
            </div>
            <Link href="/leadership/approvals" className="text-xs font-bold text-sgvu-gold hover:underline">
              Pending PO approvals →
            </Link>
          </div>
        </div>
      </LeadershipSectionCard>

      {/* 4. Waivers */}
      <LeadershipSectionCard title="4 · Scholarships, Waivers & Concessions" description="Revenue leak dashboard and pending executive overrides">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-3xl font-black text-sgvu-navy">{formatL(Number(waivers.total_waiver_impact ?? 0))}</p>
            <p className="text-xs text-muted-foreground">Total waiver impact this year</p>
            <ul className="mt-4 space-y-1 text-sm">
              {((waivers.by_category as Array<Record<string, unknown>>) ?? []).map((c) => (
                <li key={String(c.category)} className="flex justify-between">
                  <span>{String(c.category)}</span>
                  <span className="font-mono">{formatL(Number(c.amount ?? 0))}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase text-sgvu-navy">Pending Executive Overrides</h4>
            <ul className="mt-2 space-y-2">
              {((waivers.pending_executive_overrides as Array<Record<string, unknown>>) ?? []).map((w) => (
                <li key={String(w.request_id)} className="rounded-lg border px-3 py-2 text-sm">
                  <span className="font-mono font-bold">{formatL(Number(w.waiver_amount ?? 0))}</span>
                  <span className="ml-2 text-muted-foreground">{String(w.reason ?? '')}</span>
                </li>
              ))}
              {((waivers.pending_executive_overrides as unknown[]) ?? []).length === 0 ? (
                <li className="text-sm text-muted-foreground">No pending waiver requests</li>
              ) : null}
            </ul>
            <Link href="/leadership/approvals" className="mt-2 inline-block text-xs font-bold text-sgvu-gold hover:underline">
              Review in Approvals Inbox →
            </Link>
          </div>
        </div>
      </LeadershipSectionCard>

      {/* 5. Grants */}
      <LeadershipSectionCard title="5 · Research Grants & External Funding" description="Utilization tracker and fund expiry alerts">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-4">Grant</th>
                <th className="py-2 pr-4">Agency</th>
                <th className="py-2 pr-4">Sanctioned</th>
                <th className="py-2 pr-4">Spent</th>
                <th className="py-2 pr-4">Remaining</th>
                <th className="py-2 pr-4">Util %</th>
                <th className="py-2">Alert</th>
              </tr>
            </thead>
            <tbody>
              {grantRows.map((g) => (
                <tr key={String(g.grant_id)} className="border-b border-sgvu-navy/5">
                  <td className="py-2 pr-4 font-medium">{String(g.title ?? '—')}</td>
                  <td className="py-2 pr-4">{String(g.agency ?? '—')}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{formatL(Number(g.sanctioned ?? 0))}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{formatL(Number(g.spent ?? 0))}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{formatL(Number(g.remaining ?? 0))}</td>
                  <td className="py-2 pr-4">{Number(g.utilization_pct ?? 0)}%</td>
                  <td className="py-2">
                    {g.expiry_alert ? (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">Expiry ≤90d</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {grantRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-4 text-muted-foreground">
                    No research grants on file
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </LeadershipSectionCard>

      {/* 6. Wealth */}
      <LeadershipSectionCard title="6 · Debt, Investments & Corpus" description="Loans, EMIs, fixed deposits, and endowment tracking">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h4 className="text-xs font-bold uppercase text-sgvu-navy">Loans & EMIs</h4>
            <ul className="mt-2 space-y-2 text-sm">
              {((wealth.loans as Array<Record<string, unknown>>) ?? []).map((l, i) => (
                <li key={i} className="rounded-lg border px-3 py-2">
                  <p className="font-medium">{String(l.lender ?? '—')}</p>
                  <p className="font-mono text-xs">
                    Principal {formatL(Number(l.principal_remaining ?? 0))} · EMI {formatL(Number(l.emi_amount ?? 0))}
                  </p>
                  {l.next_emi_date ? (
                    <p className="text-xs text-muted-foreground">Next EMI: {String(l.next_emi_date)}</p>
                  ) : null}
                </li>
              ))}
              {((wealth.loans as unknown[]) ?? []).length === 0 ? (
                <li className="text-muted-foreground">No active loans recorded</li>
              ) : null}
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase text-sgvu-navy">Fixed Deposits & Corpus</h4>
            <ul className="mt-2 space-y-2 text-sm">
              {((wealth.fixed_deposits as Array<Record<string, unknown>>) ?? []).map((f, i) => (
                <li key={i} className="rounded-lg border px-3 py-2">
                  <p className="font-medium">{String(f.bank ?? '—')}</p>
                  <p className="font-mono text-xs">
                    {formatL(Number(f.principal ?? 0))} @ {Number(f.interest_rate_pct ?? 0)}%
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Maturity {String(f.maturity_date ?? '—')} · Yield {formatL(Number(f.interest_yielded ?? 0))}
                  </p>
                </li>
              ))}
              {((wealth.fixed_deposits as unknown[]) ?? []).length === 0 ? (
                <li className="text-muted-foreground">No FDs recorded</li>
              ) : null}
            </ul>
            <div className="mt-4 flex gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Total debt</p>
                <p className="font-mono font-bold">{formatL(Number(wealth.total_debt ?? 0))}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">FD corpus</p>
                <p className="font-mono font-bold">{formatL(Number(wealth.total_corpus_fd ?? 0))}</p>
              </div>
            </div>
          </div>
        </div>
      </LeadershipSectionCard>

      {/* 7. Audit Shield */}
      <LeadershipSectionCard title="7 · Audit, Fraud Detection & Compliance" description="Modified ledger alerts, bank reconciliation, tax reminders">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h4 className="text-xs font-bold uppercase text-sgvu-navy">Deleted / Modified Ledger (30 days)</h4>
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm">
              {ledgerMods.map((l) => (
                <li key={String(l.log_id)} className="rounded border px-2 py-1 text-xs">
                  <span className="font-bold uppercase text-red-700">{String(l.action)}</span>{' '}
                  {String(l.table_name)} · {String(l.changed_at)}
                </li>
              ))}
              {ledgerMods.length === 0 ? <li className="text-muted-foreground">No suspicious modifications</li> : null}
            </ul>
            <Link href="/leadership/audit-log" className="mt-2 inline-block text-xs font-bold text-sgvu-gold hover:underline">
              Full audit trail →
            </Link>
          </div>
          <div className="space-y-4">
            <div className={`rounded-lg border p-3 ${recon.flagged ? 'border-red-300 bg-red-50' : 'bg-slate-50'}`}>
              <h4 className="text-xs font-bold uppercase text-sgvu-navy">Bank Reconciliation</h4>
              <div className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>CRM collections (MTD)</span>
                  <span className="font-mono">{formatL(Number(recon.month_collections_crm ?? 0))}</span>
                </div>
                <div className="flex justify-between">
                  <span>Latest bank snapshot</span>
                  <span className="font-mono">{formatL(Number(recon.latest_bank_balance ?? 0))}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Variance</span>
                  <span className="font-mono">{formatL(Number(recon.variance ?? 0))}</span>
                </div>
              </div>
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase text-sgvu-navy">Tax & Compliance Reminders</h4>
              <ul className="mt-2 space-y-1 text-sm">
                {((audit.tax_compliance_reminders as Array<Record<string, unknown>>) ?? []).map((t) => (
                  <li key={String(t.event_id)} className="flex justify-between rounded border px-2 py-1">
                    <span>{String(t.title)}</span>
                    <span className="text-xs text-muted-foreground">{String(t.due_date)}</span>
                  </li>
                ))}
              </ul>
              <Link href="/leadership/compliance-calendar" className="mt-2 inline-block text-xs font-bold text-sgvu-gold hover:underline">
                Compliance calendar →
              </Link>
            </div>
          </div>
        </div>
      </LeadershipSectionCard>
    </div>
  );
}
