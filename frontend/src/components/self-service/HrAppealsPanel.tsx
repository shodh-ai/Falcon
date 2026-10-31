'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Appeal = {
  appeal_id: string;
  leave_id: string;
  reason: string;
  status: string;
  requester_user_id: string;
  reviewer_user_id: string;
  requester_name: string;
  created_at: string;
  revision: number;
};

export function HrAppealsPanel({ rejectedRequests = [], onChanged }: {
  rejectedRequests?: Array<{ leave_id: string; request_type?: string; leave_type?: string; status: string }>;
  onChanged?: () => void;
}) {
  const api = useAuthedApi();
  const { user } = useAuth();
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setAppeals(await api.get<Appeal[]>('/api/hr/workforce/appeals'));
      setLoaded(true);
    } catch {
      setLoaded(false);
    }
  }, [api]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function submitAppeal(leaveId: string) {
    const reason = reasons[leaveId]?.trim() || '';
    if (reason.length < 10) return toast.error('Explain the appeal in at least 10 characters');
    setBusy(leaveId);
    try {
      await api.post(`/api/hr/workforce/requests/${leaveId}/appeal`, { reason },
        { 'Idempotency-Key': crypto.randomUUID() });
      toast.success('Appeal sent to the next reporting officer');
      await refresh();
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not submit appeal');
    } finally { setBusy(null); }
  }

  async function decide(appealId: string, action: 'REJECT' | 'RECONSIDER') {
    const reason = reasons[appealId]?.trim() || '';
    if (reason.length < 10) return toast.error('Give a reason of at least 10 characters');
    setBusy(appealId);
    try {
      const appeal = appeals.find((item) => item.appeal_id === appealId);
      await api.post(`/api/hr/workforce/appeals/${appealId}/decision`, { action, reason },
        { 'Idempotency-Key': crypto.randomUUID(), 'If-Match': String(appeal?.revision ?? '') });
      toast.success(action === 'RECONSIDER' ? 'Returned for one reconsideration' : 'Appeal rejected');
      await refresh();
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not review appeal');
    } finally { setBusy(null); }
  }

  const appealed = new Set(appeals.map((item) => item.leave_id));
  const eligible = rejectedRequests.filter((request) => request.status === 'REJECTED' && !appealed.has(request.leave_id));
  const myAppeals = appeals.filter((item) => item.requester_user_id === user?.user_id);
  const reviewQueue = appeals.filter((item) => item.reviewer_user_id === user?.user_id && item.status === 'PENDING_REVIEW');
  if (!loaded || (!eligible.length && !myAppeals.length && !reviewQueue.length)) return null;

  return <section className="space-y-3 rounded-xl border border-border bg-background p-4">
    <h3 className="font-semibold text-sgvu-navy">HR request appeals</h3>
    <p className="text-sm text-muted-foreground">Up to three finally approved leave reconsiderations per appeal submission month. Pending and rejected appeals do not count. Each rejected request has one reconsideration cycle.</p>
    {eligible.map((request) => <div key={request.leave_id} className="space-y-2 border-t pt-3 text-sm">
      <p>Rejected {request.request_type || request.leave_type || 'request'}</p>
      <Input aria-label="Appeal reason" placeholder="Explain why this decision should be reconsidered"
        value={reasons[request.leave_id] || ''}
        onChange={(event) => setReasons((current) => ({ ...current, [request.leave_id]: event.target.value }))} />
      <Button type="button" size="sm" disabled={busy === request.leave_id}
        onClick={() => void submitAppeal(request.leave_id)}>Appeal to next officer</Button>
    </div>)}
    {myAppeals.map((appeal) => <p key={appeal.appeal_id} className="border-t pt-2 text-sm">
      Your appeal: {appeal.status.replaceAll('_', ' ').toLowerCase()} · {appeal.reason}
      <span className="block text-xs text-muted-foreground">Raised on {new Date(appeal.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
    </p>)}
    {reviewQueue.map((appeal) => <div key={appeal.appeal_id} className="space-y-2 border-t pt-3 text-sm">
      <p><strong>{appeal.requester_name}</strong> appealed: {appeal.reason}</p>
      <p className="text-xs text-muted-foreground">Raised on {new Date(appeal.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
      <Input aria-label="Appeal review reason" placeholder="Reason for this appeal decision"
        value={reasons[appeal.appeal_id] || ''}
        onChange={(event) => setReasons((current) => ({ ...current, [appeal.appeal_id]: event.target.value }))} />
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={busy === appeal.appeal_id}
          onClick={() => void decide(appeal.appeal_id, 'RECONSIDER')}>Return for reconsideration</Button>
        <Button type="button" size="sm" variant="outline" disabled={busy === appeal.appeal_id}
          onClick={() => void decide(appeal.appeal_id, 'REJECT')}>Reject appeal</Button>
      </div>
    </div>)}
  </section>;
}
