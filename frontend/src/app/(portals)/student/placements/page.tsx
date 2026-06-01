'use client';

import { useEffect, useState } from 'react';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <StudentPageHeader
        title="Placements & Internships"
        description="Open campus drives and your application status. Apply via the placement cell when drives open."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">My applications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(data?.my_applications ?? []).map((a) => (
            <div key={a.application_id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
              <div>
                <p className="font-medium">{a.job_title}</p>
                <p className="text-muted-foreground">{a.company_name}</p>
              </div>
              <Badge>{a.status}</Badge>
            </div>
          ))}
          {!data?.my_applications?.length && (
            <p className="text-muted-foreground">No applications yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Open positions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(data?.open_jobs ?? []).map((j) => (
            <div key={j.jd_id} className="rounded-lg border p-3 text-sm">
              <p className="font-medium">{j.job_title}</p>
              <p className="text-muted-foreground">{j.company_name} · Min CGPA {j.min_cgpa}</p>
              {j.application_deadline && (
                <p className="text-xs text-muted-foreground">
                  Deadline {new Date(j.application_deadline).toLocaleDateString()}
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
