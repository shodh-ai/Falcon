'use client';

import { useEffect, useState } from 'react';
import { Briefcase, Building2 } from 'lucide-react';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';

type PlacementsData = {
  open_jobs: { jd_id: string; job_title: string; company_name: string; min_cgpa: string; application_deadline: string }[];
  my_applications: { application_id: string; job_title: string; company_name: string; status: string; applied_at: string }[];
};

export default function StudentPlacementsPage() {
  const api = useAuthedApi();
  const [data, setData] = useState<PlacementsData | null>(null);

  useEffect(() => {
    void api.get<PlacementsData>('/api/student/placements').then(setData);
  }, [api]);

  return (
    <StudentPageShell width="5xl">
      <StudentPageHeader
        title="Placements & Internships"
        description="Open campus drives and your application status. Apply via the placement cell when drives open."
      />

      <StudentSectionCard title="My applications" description="Track status of your submitted applications" icon={Briefcase}>
        {(data?.my_applications ?? []).length === 0 ? (
          <StudentEmptyState title="No applications yet" description="Apply to open positions below when campus drives are active." />
        ) : (
          <div className="space-y-3">
            {(data?.my_applications ?? []).map((a) => (
              <div
                key={a.application_id}
                className="flex items-center justify-between rounded-2xl border border-border/70 bg-white p-4 text-sm transition hover:border-sgvu-gold/40"
              >
                <div>
                  <p className="font-semibold text-sgvu-navy">{a.job_title}</p>
                  <p className="text-muted-foreground">{a.company_name}</p>
                </div>
                <Badge>{a.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </StudentSectionCard>

      <StudentSectionCard title="Open positions" description="Active campus recruitment drives" icon={Building2}>
        {(data?.open_jobs ?? []).length === 0 ? (
          <StudentEmptyState title="No open drives" description="New placement opportunities will appear here when announced." />
        ) : (
          <div className="space-y-3">
            {(data?.open_jobs ?? []).map((j) => (
              <div key={j.jd_id} className="rounded-2xl border border-border/70 bg-white p-4 text-sm transition hover:border-sgvu-gold/40">
                <p className="font-semibold text-sgvu-navy">{j.job_title}</p>
                <p className="text-muted-foreground">
                  {j.company_name} · Min CGPA {j.min_cgpa}
                </p>
                {j.application_deadline && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Deadline {new Date(j.application_deadline).toLocaleDateString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </StudentSectionCard>
    </StudentPageShell>
  );
}
