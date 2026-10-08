'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { Briefcase, IndianRupee, TrendingUp } from 'lucide-react';
import { FalconLoader } from '@/components/brand/FalconLoader';
import { ExecutiveCard } from '@/components/leadership/executive/ExecutiveCard';
import { EXECUTIVE_SPACING } from '@/components/leadership/executive/design-tokens';
import { LeadershipPageHeader } from '@/components/leadership/LeadershipSectionCard';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { DemoDataBanner } from './DemoDataBanner';
import { DEPARTMENT_PLACEMENTS, PLACEMENTS_KPI, TOP_RECRUITERS } from './mockData';
import { PresidentKpiCard } from './PresidentKpiCard';
import type { DepartmentPlacementRow, PlacementsKpi, TopRecruiter } from './types';

const DepartmentPlacementBarChart = dynamic(
  () => import('./PresidentCharts').then((m) => m.DepartmentPlacementBarChart),
  { ssr: false, loading: () => <div className="h-80 animate-pulse rounded-xl bg-slate-100" /> },
);

const TIER_STYLES = {
  'Tier-1': 'bg-[#0B2447]/10 text-[#0B2447]',
  'Tier-2': 'bg-[#0B2447]/10 text-[#0B2447]',
  'Tier-3': 'bg-slate-100 text-slate-700',
} as const;

type ApiPlacements = {
  eligible_students?: number;
  placed_students?: number;
  placement_pct?: number;
  package_stats?: { highest_lpa?: number; avg_lpa?: number };
  top_recruiters?: Array<{ company: string; hires: number }>;
  department_placements?: Array<{
    department: string;
    eligible: number;
    placed: number;
    placement_pct: number;
  }>;
};

export function PlacementsDashboard() {
  const api = useAuthedApi();
  const [loading, setLoading] = useState(true);
  const [usingSmokeData, setUsingSmokeData] = useState(true);
  const [kpi, setKpi] = useState<PlacementsKpi>(PLACEMENTS_KPI);
  const [departments, setDepartments] = useState<DepartmentPlacementRow[]>(DEPARTMENT_PLACEMENTS);
  const [recruiters, setRecruiters] = useState<TopRecruiter[]>(TOP_RECRUITERS);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const data = await api.get<ApiPlacements>('/api/president/placements');
        const meaningful = Number(data?.placed_students ?? 0) > 0;
        if (meaningful) {
          setKpi({
            overallPlacementPct: Number(data?.placement_pct ?? 0),
            highestPackageLpa: Number(data?.package_stats?.highest_lpa ?? 0),
            averagePackageLpa: Number(data?.package_stats?.avg_lpa ?? 0),
            totalOffers: Number(data?.placed_students ?? 0),
            eligibleStudents: Number(data?.eligible_students ?? 0),
          });
          const liveDepartments = (data?.department_placements ?? []).filter(
            (row) => row.eligible > 0,
          );
          if (liveDepartments.length > 0) {
            setDepartments(
              liveDepartments.map((row) => ({
                department: row.department,
                placementPct: row.placement_pct,
                placed: row.placed,
                eligible: row.eligible,
              })),
            );
          }
          const liveRecruiters = data?.top_recruiters ?? [];
          if (liveRecruiters.length > 0) {
            setRecruiters(
              liveRecruiters.map((row, index) => ({
                company: row.company,
                hires: row.hires,
                avgPackageLpa: 0,
                tier: index < 4 ? 'Tier-1' : 'Tier-2',
              })),
            );
          }
          setUsingSmokeData(false);
        }
      } catch {
        // Keep the demo dataset when the endpoint is unavailable.
      } finally {
        setLoading(false);
      }
    })();
  }, [api]);

  if (loading) return <FalconLoader label="Loading Placement Analytics…" />;

  return (
    <div className={EXECUTIVE_SPACING.page}>
      <LeadershipPageHeader
        eyebrow="Falcon Workspace"
        title="Career Outcomes"
        description="Batch 2025 placement performance, package analytics, and top recruiter engagement."
      />

      {usingSmokeData && (
        <DemoDataBanner message="Showing demo placement data for portal testing (live placement data was empty)." />
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <PresidentKpiCard
          label="Overall Placement %"
          value={`${kpi.overallPlacementPct}%`}
          sub={`${kpi.totalOffers.toLocaleString('en-IN')} offers · ${kpi.eligibleStudents.toLocaleString('en-IN')} eligible`}
          icon={TrendingUp}
          accent="navy"
        />
        <PresidentKpiCard
          label="Highest Package"
          value={`₹${kpi.highestPackageLpa} LPA`}
          sub="Top on-campus offer (Batch 2025)"
          icon={IndianRupee}
          accent="navy"
        />
        <PresidentKpiCard
          label="Average Package"
          value={`₹${kpi.averagePackageLpa} LPA`}
          sub="Across all placed students (Batch 2025)"
          icon={Briefcase}
          accent="navy"
        />
      </div>

      <ExecutiveCard
        title="Department-wise Placement Percentage"
        description="Placement rate by school / department for graduating batch"
      >
        <DepartmentPlacementBarChart data={departments} />
      </ExecutiveCard>

      <ExecutiveCard
        title="Top Recruiters"
        description="Companies with highest student intake this placement season"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {recruiters.map((recruiter) => (
            <div
              key={recruiter.company}
              className="rounded-xl border border-sgvu-navy/10 bg-slate-50/60 p-4 transition hover:border-sgvu-gold/40 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-bold text-[#0B2447]">{recruiter.company}</p>
                <Badge variant="outline" className={TIER_STYLES[recruiter.tier]}>
                  {recruiter.tier}
                </Badge>
              </div>
              <p className="mt-3 font-mono text-2xl font-black text-sgvu-navy">
                {recruiter.hires}
                <span className="ml-1 text-sm font-semibold text-muted-foreground">hires</span>
              </p>
              {recruiter.avgPackageLpa > 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Avg package: ₹{recruiter.avgPackageLpa} LPA
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </ExecutiveCard>
    </div>
  );
}
