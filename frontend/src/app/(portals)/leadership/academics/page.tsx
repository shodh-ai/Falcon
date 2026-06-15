'use client';

import { useEffect, useState } from 'react';
import { PassFailChart } from '@/components/leadership/LeadershipCharts';
import { LeadershipMetricCard, LeadershipPageHeader, LeadershipSectionCard } from '@/components/leadership/LeadershipSectionCard';
import { useLeadershipApi } from '@/lib/api/api.leadership';

export default function LeadershipAcademicsPage() {
  const api = useLeadershipApi();
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    void api.academics().then(setData).catch(() => setData(null));
  }, [api]);

  const schools = (data?.schools as Array<{ school: string; pass_count: number; fail_count: number; avg_cgpa: number }>) ?? [];
  const iqac = (data?.iqac_research as Record<string, number>) ?? {};

  return (
    <div className="space-y-6 p-6">
      <LeadershipPageHeader eyebrow="Academic & Brand Value" title="Academics Intelligence" />

      <div className="grid gap-4 sm:grid-cols-3">
        <LeadershipMetricCard label="Scopus Publications (Month)" value={String(iqac.scopus_publications_this_month ?? '—')} />
        <LeadershipMetricCard label="Patents Filed" value={String(iqac.patents_filed ?? '—')} />
        <LeadershipMetricCard label="NAAC Readiness" value={`${iqac.naac_readiness_score ?? '—'}%`} highlight />
      </div>

      <LeadershipSectionCard title="Pass / Fail by School">
        <PassFailChart data={schools.map((s) => ({ school: s.school, pass_count: s.pass_count, fail_count: s.fail_count }))} />
      </LeadershipSectionCard>

      <LeadershipSectionCard title="Average CGPA by School">
        <div className="space-y-3">
          {schools.map((s) => (
            <div key={s.school} className="flex items-center gap-3">
              <span className="w-40 truncate text-sm font-medium text-sgvu-navy">{s.school}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-sgvu-surface">
                <div className="h-full rounded-full bg-sgvu-gold" style={{ width: `${Math.min((s.avg_cgpa / 10) * 100, 100)}%` }} />
              </div>
              <span className="font-mono text-sm font-semibold text-sgvu-navy">{s.avg_cgpa?.toFixed(2) ?? '—'}</span>
            </div>
          ))}
        </div>
      </LeadershipSectionCard>
    </div>
  );
}
