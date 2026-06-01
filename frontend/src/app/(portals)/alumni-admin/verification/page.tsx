'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlumniPageHeader } from '@/components/alumni/AlumniPageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';

type Row = {
  alumni_id: string;
  name: string;
  email: string;
  enrollment_number: string | null;
  student_enrollment: string | null;
  batch_year: number;
  linkedin_url: string | null;
};

export default function AlumniVerificationPage() {
  const api = useAuthedApi();
  const [queue, setQueue] = useState<Row[]>([]);

  const load = () => void api.get<Row[]>('/api/alumni-admin/verification-queue').then(setQueue).catch(() => setQueue([]));

  useEffect(() => {
    load();
  }, [api]);

  async function verify(alumniId: string, action: 'approve' | 'reject') {
    try {
      await api.patch(`/api/alumni-admin/profiles/${alumniId}/verify`, { action });
      toast.success(action === 'approve' ? 'Alumni verified' : 'Registration rejected');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <AlumniPageHeader
        title="Alumni Verification"
        description="Cross-check enrollment numbers before granting portal access."
      />
      {queue.map((row) => (
        <Card key={row.alumni_id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <div>
              <p className="font-semibold">{row.name}</p>
              <p className="text-muted-foreground">{row.email}</p>
              <p>
                Enrollment: {row.enrollment_number ?? row.student_enrollment ?? '—'} · Batch {row.batch_year}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void verify(row.alumni_id, 'approve')}>
                Approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => void verify(row.alumni_id, 'reject')}>
                Reject
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      {!queue.length && <p className="text-sm text-muted-foreground">No pending verifications.</p>}
    </div>
  );
}
