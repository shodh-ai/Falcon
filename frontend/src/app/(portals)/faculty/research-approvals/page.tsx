'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlaskConical, Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';
import { createAcademicRndApi, type RndApplication } from '@/lib/api/api.academic-rnd';

export default function FacultyResearchApprovalsPage() {
  const api = useAuthedApi();
  const rndApi = useMemo(() => createAcademicRndApi(api), [api]);
  const [queue, setQueue] = useState<RndApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [remarks, setRemarks] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setQueue(await rndApi.guideQueue());
  }, [rndApi]);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  async function approve(id: string) {
    try {
      await rndApi.approveGuide(id, remarks[id]);
      toast.success('Technical review approved — forwarded to Finance');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Approval failed');
    }
  }

  async function reject(id: string) {
    const text = remarks[id]?.trim();
    if (!text) {
      toast.error('Remarks required for rejection');
      return;
    }
    try {
      await rndApi.rejectGuide(id, text);
      toast.success('Application rejected — student notified');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Rejection failed');
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-sgvu-navy" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-sgvu-navy">
          <FlaskConical className="h-7 w-7" />
          R&D Grant — Guide Review
        </h1>
        <p className="text-sm text-muted-foreground">
          Step 1: Verify technical validity of student research proposals.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pending Guide Approvals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {queue.length === 0 ? (
            <p className="text-sm text-muted-foreground">No applications awaiting your review.</p>
          ) : (
            queue.map((app) => (
              <div key={app.application_id} className="space-y-2 rounded-lg border p-4">
                <p className="font-semibold text-sgvu-navy">{app.project_title}</p>
                <p className="text-xs text-muted-foreground">{app.student_name}</p>
                <Input
                  placeholder="Remarks (required for reject)"
                  value={remarks[app.application_id] ?? ''}
                  onChange={(e) => setRemarks((r) => ({ ...r, [app.application_id]: e.target.value }))}
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void approve(app.application_id)}>
                    Approve
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => void reject(app.application_id)}>
                    Reject
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
