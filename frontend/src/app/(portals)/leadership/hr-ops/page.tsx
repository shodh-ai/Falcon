'use client';

import { useEffect, useState } from 'react';
import { LeadershipMetricCard, LeadershipPageHeader } from '@/components/leadership/LeadershipSectionCard';
import { useLeadershipApi } from '@/lib/api/api.leadership';

export default function LeadershipHrOpsPage() {
  const api = useLeadershipApi();
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    void api.hrOps().then(setData).catch(() => setData(null));
  }, [api]);

  return (
    <div className="space-y-6 p-6">
      <LeadershipPageHeader eyebrow="HR & Operations" title="Workforce & Campus Ops" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <LeadershipMetricCard
          label="Faculty-to-Student Ratio"
          value={String(data?.faculty_to_student_ratio ?? '—')}
          sub="Critical for NIRF"
        />
        <LeadershipMetricCard label="Attrition Rate" value={`${data?.attrition_rate_pct ?? '—'}%`} alert />
        <LeadershipMetricCard label="Average API Score" value={String(data?.average_api_score ?? '—')} />
        <LeadershipMetricCard label="Hostel Occupancy" value={`${data?.hostel_occupancy_pct ?? '—'}%`} highlight />
        <LeadershipMetricCard
          label="Unresolved Grievances"
          value={String(data?.unresolved_grievances ?? '—')}
          alert={Number(data?.unresolved_grievances ?? 0) > 0}
        />
      </div>
    </div>
  );
}
