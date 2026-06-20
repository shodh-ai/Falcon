'use client';

import { useEffect, useMemo, useState } from 'react';
import { Handshake } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { createEcellApi, type EcellMentorMeeting } from '@/lib/api/api.ecell';

export default function IncubationMentorsPage() {
  const api = useAuthedApi();
  const ecellApi = useMemo(() => createEcellApi(api), [api]);
  const [progress, setProgress] = useState<EcellMentorMeeting[]>([]);

  useEffect(() => {
    void api
      .get<EcellMentorMeeting[]>('/api/ecell/admin/mentor-progress')
      .then(setProgress)
      .catch(() => toast.error('Could not load mentor progress'));
  }, [api]);

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
          <Handshake className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-sgvu-navy">Mentor Network</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track mentor sessions and post-meeting feedback to measure startup progress.
          </p>
        </div>
      </div>

      {progress.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No mentor sessions recorded yet.
          </CardContent>
        </Card>
      ) : (
        progress.map((row) => (
          <Card key={row.meeting_id}>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="text-lg">{row.startup_name}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {row.mentor_name} ↔ {row.founder_name}
                </p>
              </div>
              <Badge>{row.status}</Badge>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>{row.topic}</p>
              <p className="text-muted-foreground">{new Date(row.requested_time).toLocaleString()}</p>
              {row.mentor_feedback ? (
                <p className="rounded-md bg-muted/40 px-3 py-2">Feedback: {row.mentor_feedback}</p>
              ) : (
                <p className="text-muted-foreground">Awaiting mentor feedback</p>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
