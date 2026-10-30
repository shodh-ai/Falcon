'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type PendingRequest = {
  leave_id: string;
  request_type: string;
  leave_type: string | null;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: string;
  current_step_order: number;
  employee: { name: string; department: string | null };
};

export function DepartmentHrApprovalsPanel() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<PendingRequest[]>([]);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      setRows(await api.get<PendingRequest[]>('/api/hr/workforce/team/pending'));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load approvals');
    }
  }, [api]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function decide(leaveId: string, action: 'APPROVE' | 'REJECT') {
    const comment = comments[leaveId]?.trim() || '';
    if (action === 'REJECT' && comment.length < 10)
      return toast.error('Give a rejection reason of at least 10 characters');
    setBusy(leaveId);
    try {
      const row = rows.find((item) => item.leave_id === leaveId);
      await api.patch(`/api/hr/workforce/team/${leaveId}/action`, { action, comment }, {
        'If-Match': String(row?.current_step_order ?? ''),
        'Idempotency-Key': crypto.randomUUID(),
      });
      toast.success(action === 'APPROVE' ? 'Decision recorded' : 'Request rejected');
      await refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not record decision');
    } finally { setBusy(null); }
  }

  return <section className="space-y-3 rounded-xl border bg-background p-4">
    <h2 className="text-lg font-semibold text-sgvu-navy">Staff HR approval inbox</h2>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {!error && rows.length === 0 && <p className="text-sm text-muted-foreground">No staff HR requests assigned to you.</p>}
    {rows.map((row) => <article key={row.leave_id} className="space-y-2 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap justify-between gap-2">
        <strong>{row.employee.name} · {row.request_type.replaceAll('_', ' ')}</strong>
        <span>{row.employee.department || 'Department'} · {row.start_date} to {row.end_date}</span>
      </div>
      {row.reason && <p>{row.reason}</p>}
      <Input aria-label={`Decision comment for ${row.employee.name}`} placeholder="Decision reason or note"
        value={comments[row.leave_id] || ''}
        onChange={(event) => setComments((current) => ({ ...current, [row.leave_id]: event.target.value }))} />
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={busy === row.leave_id}
          onClick={() => void decide(row.leave_id, 'APPROVE')}>Approve</Button>
        <Button type="button" size="sm" variant="outline" disabled={busy === row.leave_id}
          onClick={() => void decide(row.leave_id, 'REJECT')}>Reject</Button>
      </div>
    </article>)}
  </section>;
}
