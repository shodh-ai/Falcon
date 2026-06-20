'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { createEcellApi, type EcellProject } from '@/lib/api/api.ecell';

function formatInr(value: string | number | null | undefined) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
    Number(value ?? 0),
  );
}

export default function IncubationApplicationsPage() {
  const api = useAuthedApi();
  const ecellApi = useMemo(() => createEcellApi(api), [api]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [queue, setQueue] = useState<EcellProject[]>([]);

  const load = useCallback(async () => {
    setQueue(await ecellApi.triageQueue());
  }, [ecellApi]);

  useEffect(() => {
    void load()
      .catch(() => toast.error('Could not load applications'))
      .finally(() => setLoading(false));
  }, [load]);

  async function runAction(id: string, action: () => Promise<unknown>) {
    setBusy(id);
    try {
      await action();
      toast.success('Application updated');
      setRejectId(null);
      setComment('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Loading new applications…</p>;

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-black text-sgvu-navy">New Applications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Triage inbox for student pitches. Push valid startups into Level 1 review or reject spam.
        </p>
      </div>

      {queue.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No new applications.</CardContent>
        </Card>
      ) : (
        queue.map((project) => (
          <Card key={project.project_id}>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="text-lg">{project.startup_name}</CardTitle>
                <p className="text-sm text-muted-foreground">{project.student_name}</p>
              </div>
              <Badge>SUBMITTED</Badge>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">{project.innovation_description}</p>
              <p>Requested {formatInr(project.requested_funding)}</p>
              {project.pitch_deck_url ? (
                <a href={project.pitch_deck_url} target="_blank" rel="noreferrer" className="font-medium underline">
                  Open pitch deck
                </a>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={busy === project.project_id}
                  onClick={() => void runAction(project.project_id, () => ecellApi.pushToL1(project.project_id))}
                >
                  <Check className="mr-1 h-4 w-4" /> Push to L1 Review
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setRejectId(project.project_id)}>
                  <X className="mr-1 h-4 w-4" /> Reject
                </Button>
              </div>
              {rejectId === project.project_id ? (
                <div className="space-y-2 rounded-lg border p-3">
                  <Input placeholder="Rejection remarks" value={comment} onChange={(e) => setComment(e.target.value)} />
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={!comment.trim()}
                    onClick={() =>
                      void runAction(project.project_id, () => ecellApi.triageReject(project.project_id, comment))
                    }
                  >
                    Confirm Reject
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
