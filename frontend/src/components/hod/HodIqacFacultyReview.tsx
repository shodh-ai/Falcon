'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, RotateCcw } from 'lucide-react';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { getApiBaseUrl } from '@/lib/api-base-url';
import { getSubdomainFromClient } from '@/lib/tenant';
import { toast } from '@/lib/notifications/falcon-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type ReviewAssignment = {
  assignment_id: string;
  submitted_at?: string | null;
  assigned_user?: { name?: string; official_email?: string };
  task?: { task_name?: string; task_description?: string };
  submissions?: Array<{ submission_id: string; file_name?: string; file_path?: string; ai_status?: string | null }>;
};

export function HodIqacFacultyReview() {
  const api = useAuthedApi();
  const { token } = useAuth();
  const [items, setItems] = useState<ReviewAssignment[]>([]);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.get<ReviewAssignment[]>('/tasks/assignments/hod-review');
      setItems(Array.isArray(rows) ? rows : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load faculty evidence');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  async function decide(id: string, decision: 'APPROVED' | 'CHANGES_REQUESTED') {
    if (decision === 'CHANGES_REQUESTED' && !comments[id]?.trim()) {
      toast.error('Add a comment explaining the required correction');
      return;
    }
    setBusy(id);
    try {
      await api.post(`/tasks/assignments/${id}/hod-review`, {
        decision,
        comments: comments[id]?.trim() || undefined,
      });
      toast.success(
        decision === 'APPROVED'
          ? 'HOD approved — evidence sent to IQAC'
          : 'Evidence returned to the assigned faculty',
      );
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Review failed');
    } finally {
      setBusy(null);
    }
  }

  async function openEvidence(path?: string) {
    if (!path || !token) return;
    if (/^https?:\/\//i.test(path)) {
      window.open(path, '_blank', 'noopener,noreferrer');
      return;
    }
    try {
      const response = await fetch(
        `${getApiBaseUrl()}/uploads/download?path=${encodeURIComponent(path)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-tenant-subdomain': getSubdomainFromClient(),
          },
        },
      );
      if (!response.ok) throw new Error('Evidence preview failed');
      const objectUrl = URL.createObjectURL(await response.blob());
      window.open(objectUrl, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not open evidence');
    }
  }

  return (
    <Card className="border-sgvu-navy/10 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">Faculty evidence awaiting HOD review</CardTitle>
          <CardDescription>Only HOD-approved submissions move forward to IQAC.</CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="mr-1 h-4 w-4" /> Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? <p className="text-sm text-muted-foreground">Loading submissions…</p> : null}
        {!loading && items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No faculty evidence is awaiting your review.</p>
        ) : null}
        {items.map((item) => (
          <div key={item.assignment_id} className="rounded-xl border border-border/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-sgvu-navy">{item.task?.task_name ?? 'IQAC task'}</p>
                <p className="text-sm text-muted-foreground">
                  {item.assigned_user?.name ?? 'Assigned faculty'} · {item.assigned_user?.official_email ?? '—'}
                </p>
              </div>
              <Badge variant="outline">{item.submissions?.length ?? 0} document(s)</Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(item.submissions ?? []).map((submission) => (
                <button
                  type="button"
                  key={submission.submission_id}
                  onClick={() => void openEvidence(submission.file_path)}
                  className="rounded-full focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80">
                    {submission.file_name ?? 'Open evidence'}{submission.ai_status ? ` · ${submission.ai_status}` : ''}
                  </Badge>
                </button>
              ))}
            </div>
            <Input
              className="mt-3"
              placeholder="Review comment (required when returning)"
              value={comments[item.assignment_id] ?? ''}
              onChange={(event) => setComments((current) => ({ ...current, [item.assignment_id]: event.target.value }))}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" disabled={busy === item.assignment_id} onClick={() => void decide(item.assignment_id, 'APPROVED')}>
                <CheckCircle2 className="mr-1 h-4 w-4" /> Approve and send to IQAC
              </Button>
              <Button size="sm" variant="outline" disabled={busy === item.assignment_id} onClick={() => void decide(item.assignment_id, 'CHANGES_REQUESTED')}>
                <RotateCcw className="mr-1 h-4 w-4" /> Return for changes
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
