'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';
import type { ThresholdRequest } from '@/lib/attendance-policy';

function statusVariant(status: ThresholdRequest['status']) {
  if (status === 'APPROVED') return 'success' as const;
  if (status === 'REJECTED') return 'destructive' as const;
  return 'secondary' as const;
}

export default function HodAttendancePolicyPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<ThresholdRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [percent, setPercent] = useState('70');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<ThresholdRequest[]>('/api/attendance-policy/hod/threshold-requests');
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    const pct = Number(percent);
    if (!Number.isFinite(pct) || pct < 1 || pct > 100) {
      toast.error('Enter a percentage between 1 and 100');
      return;
    }
    if (!reason.trim()) {
      toast.error('A justification is required');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/attendance-policy/hod/threshold-requests', {
        requested_min_percent: pct,
        reason: reason.trim(),
      });
      toast.success('Sent to Dean for approval');
      setReason('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-sgvu-navy">Attendance Policy</h1>
        <p className="text-sm text-muted-foreground">
          Request lowering the department minimum attendance (default 75%). Takes effect once the Dean approves.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Request a policy change</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end gap-3">
            <div>
              <label className="text-xs text-muted-foreground">New minimum %</label>
              <Input
                type="number"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                className="mt-1 w-28"
              />
            </div>
          </div>
          <textarea
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            rows={3}
            placeholder="Justification (e.g. exam disruption, strike, weather closure)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button onClick={() => void submit()} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Send to Dean'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">My requests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No requests yet.</p>
          ) : (
            rows.map((r) => (
              <div
                key={r.request_id}
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-medium">Minimum {r.requested_min_percent}%</span>
                  <span className="text-muted-foreground"> · {r.dept_name ?? 'Department'}</span>
                  {r.decision_remarks ? (
                    <p className="text-xs text-muted-foreground">Dean: {r.decision_remarks}</p>
                  ) : null}
                </div>
                <Badge variant={statusVariant(r.status)}>
                  {r.status === 'PENDING_DEAN' ? 'With Dean' : r.status === 'APPROVED' ? 'Approved' : 'Rejected'}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
