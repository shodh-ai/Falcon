'use client';

import { useEffect, useState } from 'react';
import { Activity, Medal } from 'lucide-react';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentStatCard } from '@/components/student/StudentStatCard';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';

type ExtraData = {
  records: { activity_type: string; details: string; credits_awarded: number; event_date: string }[];
  totals: { activity_type: string; credits: number }[];
};

export default function StudentExtracurricularsPage() {
  const api = useAuthedApi();
  const [data, setData] = useState<ExtraData | null>(null);

  useEffect(() => {
    void api.get<ExtraData>('/api/student/extracurriculars').then(setData);
  }, [api]);

  return (
    <StudentPageShell width="5xl">
      <StudentPageHeader
        title="Extra-Curriculars (NCC / NSS / SODECA)"
        description="Centralized log of non-academic university credits — camps, ranks, and SODECA points."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {(data?.totals ?? []).map((t) => (
          <StudentStatCard
            key={t.activity_type}
            label={t.activity_type}
            value={t.credits}
            helper="Credits logged"
            icon={Medal}
            tone="gold"
          />
        ))}
        {!data?.totals?.length && (
          <StudentStatCard label="Total credits" value={0} helper="No activities logged yet" icon={Medal} />
        )}
      </div>

      <StudentSectionCard title="Activity log" description="Chronological record of extracurricular participation" icon={Activity}>
        {(data?.records ?? []).length === 0 ? (
          <StudentEmptyState
            icon={Activity}
            title="No activities yet"
            description="Faculty and admin will log NSS camps, NCC activities, and SODECA events here."
          />
        ) : (
          <div className="space-y-3">
            {(data?.records ?? []).map((r, i) => (
              <div key={i} className="rounded-2xl border border-border/70 bg-white p-4 text-sm transition hover:border-sgvu-gold/40">
                <div className="flex items-center justify-between gap-2">
                  <Badge>{r.activity_type}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {r.event_date ? new Date(r.event_date).toLocaleDateString() : '—'}
                  </span>
                </div>
                <p className="mt-2 font-medium text-sgvu-navy">{r.details}</p>
                <p className="mt-1 text-xs font-semibold text-sgvu-gold">+{r.credits_awarded} credits</p>
              </div>
            ))}
          </div>
        )}
      </StudentSectionCard>
    </StudentPageShell>
  );
}
