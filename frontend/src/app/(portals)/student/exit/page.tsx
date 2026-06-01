'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';

type ExitData = {
  no_dues: { key: string; label: string; cleared: boolean }[];
  progress_percent: number;
  degree_issued_date: string | null;
  degree_award_status: string;
  final_result: string | null;
  alumni_converted: boolean;
  linkedin_url: string | null;
  placement_organization: string | null;
  clearance_tasks: { task_name: string; owner_department: string; status: string }[];
};

export default function StudentExitPage() {
  const api = useAuthedApi();
  const [data, setData] = useState<ExitData | null>(null);
  const [linkedin, setLinkedin] = useState('');
  const [org, setOrg] = useState('');

  const load = () => void api.get<ExitData>('/api/student/exit').then(setData);

  useEffect(() => {
    load();
  }, [api]);

  async function registerAlumni() {
    try {
      await api.post('/api/alumni/register', {
        linkedin_url: linkedin,
        placement_organization: org,
      });
      toast.success('Alumni portal registration submitted');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Registration failed');
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <StudentPageHeader
        title="Exit & Alumni Transition"
        description="No-dues clearance, degree issuance status, and alumni portal registration for final-semester students."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">No-dues tracker</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={data?.progress_percent ?? 0} className="h-3" />
          <p className="text-sm text-muted-foreground">{data?.progress_percent ?? 0}% departments cleared</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(data?.no_dues ?? []).map((step) => (
              <div key={step.key} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                <span>{step.label}</span>
                <Badge variant={step.cleared ? 'default' : 'secondary'}>{step.cleared ? 'Cleared' : 'Pending'}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Final result & degree</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <p>Result: {data?.final_result ?? 'In progress'}</p>
          <p>Degree status: {data?.degree_award_status ?? '—'}</p>
          <p>Degree issued: {data?.degree_issued_date ? new Date(data.degree_issued_date).toLocaleDateString() : 'Not yet issued'}</p>
          <Button variant="outline" size="sm" className="mt-2" disabled>
            Download provisional certificate (when issued)
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alumni conversion</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data?.alumni_converted ? (
            <p className="text-sm text-emerald-700">You are registered for the Alumni Portal.</p>
          ) : (
            <>
              <Input placeholder="LinkedIn profile URL" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} />
              <Input placeholder="Placement organization" value={org} onChange={(e) => setOrg(e.target.value)} />
              <Button onClick={() => void registerAlumni()}>Register for Alumni Portal</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
