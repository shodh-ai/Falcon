'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { IndianRupee, Target, Users } from 'lucide-react';
import { FalconLoader } from '@/components/brand/FalconLoader';
import { ExecutiveCard } from '@/components/leadership/executive/ExecutiveCard';
import { EXECUTIVE_SPACING } from '@/components/leadership/executive/design-tokens';
import { LeadershipPageHeader } from '@/components/leadership/LeadershipSectionCard';
import { useAuthedApi } from '@/lib/api';
import { DemoDataBanner } from './DemoDataBanner';
import { FillStatusBadge } from './FillStatusBadge';
import { ADMISSIONS_KPI, ADMISSIONS_TREND, DEPARTMENT_INTAKE } from './mockData';
import { PresidentKpiCard } from './PresidentKpiCard';
import type { AdmissionsKpi, AdmissionsTrendPoint, DepartmentIntakeRow } from './types';

type ApiAdmissions = {
  total_applications?: number;
  seats_filled?: number;
  target_capacity?: number;
  fee_collected?: number;
  monthly_trend?: Array<{ month: string; this_year: number; last_year: number }>;
  department_intake?: Array<{
    program: string;
    program_name: string;
    sanctioned: number;
    filled: number;
  }>;
};

function intakeStatus(fillPercent: number): DepartmentIntakeRow['status'] {
  if (fillPercent >= 85) return 'healthy';
  if (fillPercent >= 60) return 'warning';
  return 'critical';
}

const AdmissionsAreaChart = dynamic(
  () => import('./PresidentCharts').then((m) => m.AdmissionsAreaChart),
  { ssr: false, loading: () => <div className="h-80 animate-pulse rounded-xl bg-slate-100" /> },
);

const AdmissionsYearToggle = dynamic(
  () => import('./PresidentCharts').then((m) => m.AdmissionsYearToggle),
  { ssr: false, loading: () => <div className="h-9 w-64 animate-pulse rounded-full bg-slate-100" /> },
);

function formatInr(value: number): string {
  if (value >= 1e7) return `₹${(value / 1e7).toFixed(2)} Cr`;
  if (value >= 1e5) return `₹${(value / 1e5).toFixed(1)} L`;
  return `₹${value.toLocaleString('en-IN')}`;
}

export function AdmissionsDashboard() {
  const api = useAuthedApi();
  const [selectedYear, setSelectedYear] = useState<'lastYear' | 'thisYear'>('thisYear');
  const [loading, setLoading] = useState(true);
  const [usingSmokeData, setUsingSmokeData] = useState(true);
  const [kpi, setKpi] = useState<AdmissionsKpi>(ADMISSIONS_KPI);
  const [trend, setTrend] = useState<AdmissionsTrendPoint[]>(ADMISSIONS_TREND);
  const [intake, setIntake] = useState<DepartmentIntakeRow[]>(DEPARTMENT_INTAKE);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const data = await api.get<ApiAdmissions>('/api/president/admissions');
        const liveIntake = data?.department_intake ?? [];
        const meaningful =
          Number(data?.total_applications ?? 0) > 0 || liveIntake.length > 0;
        if (meaningful) {
          setKpi({
            totalApplications: Number(data?.total_applications ?? 0),
            seatsFilled: Number(data?.seats_filled ?? 0),
            targetCapacity: Number(data?.target_capacity ?? 0),
            feeCollected: Number(data?.fee_collected ?? 0),
          });
          if ((data?.monthly_trend ?? []).length > 0) {
            setTrend(
              (data?.monthly_trend ?? []).map((point) => ({
                month: point.month,
                thisYear: point.this_year,
                lastYear: point.last_year,
              })),
            );
          }
          setIntake(
            liveIntake.map((row) => {
              const fillPercent = row.sanctioned
                ? Math.round((row.filled / row.sanctioned) * 100)
                : 0;
              return {
                department: row.program_name,
                program: row.program,
                sanctionedIntake: row.sanctioned,
                currentlyFilled: row.filled,
                vacant: Math.max(0, row.sanctioned - row.filled),
                fillPercent,
                status: intakeStatus(fillPercent),
              };
            }),
          );
          setUsingSmokeData(false);
        }
      } catch {
        // Keep the demo dataset when the endpoint is unavailable.
      } finally {
        setLoading(false);
      }
    })();
  }, [api]);

  const fillPct = kpi.targetCapacity
    ? Math.round((kpi.seatsFilled / kpi.targetCapacity) * 100)
    : 0;

  if (loading) return <FalconLoader label="Loading Enrollment Analytics…" />;

  return (
    <div className={EXECUTIVE_SPACING.page}>
      <LeadershipPageHeader
        eyebrow="Falcon Workspace"
        title="Enrollment & Growth"
        description="Application pipeline, seat occupancy, and fee collection across SGVU schools and programmes."
      />

      {usingSmokeData && (
        <DemoDataBanner message="Showing demo enrollment data for portal testing (live admissions data was empty)." />
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <PresidentKpiCard
          label="Total Applications Received"
          value={kpi.totalApplications.toLocaleString('en-IN')}
          sub="Across UG, PG, and diploma programmes (AY 2025-26)"
          icon={Users}
          accent="navy"
        />
        <PresidentKpiCard
          label="Total Seats Filled"
          value={`${kpi.seatsFilled.toLocaleString('en-IN')} / ${kpi.targetCapacity.toLocaleString('en-IN')}`}
          sub={`${fillPct}% of sanctioned intake · ${Math.max(0, kpi.targetCapacity - kpi.seatsFilled)} vacant`}
          icon={Target}
          accent="navy"
        />
        <PresidentKpiCard
          label="Total Fee Collected"
          value={formatInr(kpi.feeCollected)}
          sub="Admission & semester-I fees (provisional)"
          icon={IndianRupee}
          accent="navy"
        />
      </div>

      <ExecutiveCard
        title="Admissions Over Time"
        description="Select an academic year to view its month-wise admissions trend"
        action={<AdmissionsYearToggle value={selectedYear} onChange={setSelectedYear} />}
      >
        <AdmissionsAreaChart data={trend} selectedYear={selectedYear} />
      </ExecutiveCard>

      <ExecutiveCard
        title="Department-wise Intake"
        description="Sanctioned capacity vs current enrollment by school / department"
      >
        <div className="overflow-x-auto">
          {/* aria-label instead of sr-only <caption>: absolutely-positioned captions escape
              the table in Chromium and stretch the document, creating blank scroll space. */}
          <table
            className="w-full min-w-[760px] text-sm"
            aria-label="Sanctioned capacity and current enrollment by department"
          >
            <thead>
              <tr className="border-b border-sgvu-navy/10 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <th scope="col" className="px-4 pb-3 text-left">Department</th>
                <th scope="col" className="px-4 pb-3 text-left">Programme</th>
                <th scope="col" className="w-28 px-4 pb-3 text-right">Sanctioned</th>
                <th scope="col" className="w-24 px-4 pb-3 text-right">Filled</th>
                <th scope="col" className="w-24 px-4 pb-3 text-right">Vacant</th>
                <th scope="col" className="w-24 px-4 pb-3 text-right">Fill %</th>
                <th scope="col" className="w-32 px-4 pb-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {intake.map((row) => (
                <tr
                  key={row.department}
                  className="border-b border-sgvu-navy/5 transition last:border-0 hover:bg-slate-50/80"
                >
                  <td className="px-4 py-3.5 text-left font-semibold text-[#0B2447]">{row.department}</td>
                  <td className="px-4 py-3.5 text-left text-muted-foreground">{row.program}</td>
                  <td className="px-4 py-3.5 text-right font-mono tabular-nums">{row.sanctionedIntake}</td>
                  <td className="px-4 py-3.5 text-right font-mono font-semibold tabular-nums text-sgvu-navy">
                    {row.currentlyFilled}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono tabular-nums text-sgvu-navy">{row.vacant}</td>
                  <td className="px-4 py-3.5 text-right font-mono font-bold tabular-nums text-[#0B2447]">
                    {row.fillPercent}%
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <FillStatusBadge status={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ExecutiveCard>
    </div>
  );
}
