'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LeadershipLineChart, NAVY } from '@/components/leadership/LeadershipCharts';
import { LeadershipPageHeader, LeadershipSectionCard } from '@/components/leadership/LeadershipSectionCard';
import {
  ExecutiveDateRangeFilter,
  ExecutiveExportButton,
  EXECUTIVE_SPACING,
  TrafficLightKpi,
  type ExecutivePeriod,
} from '@/components/leadership/executive';
import { useLeadershipApi } from '@/lib/api/api.leadership';

export default function LeadershipHrOpsPage() {
  const api = useLeadershipApi();
  const [period, setPeriod] = useState<ExecutivePeriod>('year');
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    void api.hrOps().then(setData).catch(() => setData(null));
  }, [api]);

  const research = (data?.research as Record<string, number>) ?? {};
  const rating = (data?.faculty_rating as { avg_score?: number; responses?: number }) ?? {};
  const attritionTrend = (data?.attrition_trend as Array<{ month: string; resignations: number }>) ?? [];
  const ratio = Number(data?.faculty_to_student_ratio ?? 0);
  const ratioStatus = data?.ratio_compliant ? 'green' : ratio > 0 ? 'yellow' : 'red';

  return (
    <div className={EXECUTIVE_SPACING.page}>
      <LeadershipPageHeader
        eyebrow="Faculty & HR Operations"
        title="Workforce & Campus Ops"
        action={
          <div className="flex flex-col gap-2 sm:items-end">
            <ExecutiveDateRangeFilter value={period} onChange={setPeriod} />
            <ExecutiveExportButton targetId="hr-dashboard" filename="hr-analytics" />
          </div>
        }
      />

      <div id="hr-dashboard" className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TrafficLightKpi
            label="Faculty-to-Student Ratio"
            value={String(data?.faculty_to_student_ratio ?? '—')}
            sub={data?.ratio_compliant ? 'UGC/AICTE compliant (≤30:1)' : 'Above recommended threshold'}
            status={ratioStatus}
          />
          <TrafficLightKpi
            label="Attrition Rate"
            value={`${data?.attrition_rate_pct ?? '—'}%`}
            status={(Number(data?.attrition_rate_pct ?? 0)) <= 5 ? 'green' : 'yellow'}
          />
          <TrafficLightKpi label="Hostel Occupancy" value={`${data?.hostel_occupancy_pct ?? '—'}%`} status="green" />
          <TrafficLightKpi
            label="Faculty Rating"
            value={rating.avg_score ? `${rating.avg_score}/5` : '—'}
            sub={`${rating.responses ?? 0} student responses`}
            status={(rating.avg_score ?? 0) >= 4 ? 'green' : (rating.avg_score ?? 0) >= 3 ? 'yellow' : 'red'}
          />
          <TrafficLightKpi
            label="Unresolved Grievances"
            value={String(data?.unresolved_grievances ?? '—')}
            status={Number(data?.unresolved_grievances ?? 0) > 0 ? 'red' : 'green'}
          />
          <TrafficLightKpi label="Publications (Month)" value={String(research.scopus_publications_this_month ?? '—')} status="green" />
        </div>

        <LeadershipSectionCard title="Faculty Attrition Trend (12 Months)">
          <LeadershipLineChart
            data={attritionTrend as Record<string, unknown>[]}
            xKey="month"
            lines={[{ key: 'resignations', color: NAVY, name: 'Resignations' }]}
          />
        </LeadershipSectionCard>

        <LeadershipSectionCard title="Research & Publications">
          <div className="grid gap-4 sm:grid-cols-3">
            <TrafficLightKpi label="Scopus Publications" value={String(research.scopus_publications_this_month ?? '—')} status="green" />
            <TrafficLightKpi label="Patents Filed" value={String(research.patents_filed ?? '—')} status="green" />
            <TrafficLightKpi label="NAAC Readiness" value={`${research.naac_readiness_score ?? '—'}%`} status="green" />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Full IQAC research metrics also on{' '}
            <Link href="/leadership/academics" className="font-semibold text-sgvu-gold hover:underline">
              Academics Intelligence
            </Link>
          </p>
        </LeadershipSectionCard>
      </div>
    </div>
  );
}
