'use client';

import { useState } from 'react';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { HrStatusBadge } from '@/components/hr/HrStatusBadge';
import { Button } from '@/components/ui/button';
import { useHrSWR } from '@/hooks/useHrSWR';
import { useHrApi } from '@/lib/api/use-hr-api';
import { useHrEntity } from '@/context/HrEntityContext';

type GatePass = {
  pass_id: string;
  created_at?: string | null;
  employee_name: string;
  employee_email: string;
  dept_name: string | null;
  out_time: string;
  expected_in_time: string;
  reason: string;
  status: 'PENDING' | 'PENDING_HR';
  can_review: boolean;
};

function time(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString('en-IN');
}

export default function HrGatePassesPage() {
  const api = useHrApi();
  const { entityReady } = useHrEntity();
  const { data: rows = [], error, isLoading, mutate } = useHrSWR<GatePass[]>(
    'hr-gate-pass-review', '/api/hr/gate-passes/review',
    { dedupingInterval: 0, revalidateOnMount: true, refreshInterval: 30_000 },
  );
  const [acting, setActing] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState('');
  const [message, setMessage] = useState('');

  async function decide(passId: string, status: 'APPROVED' | 'REJECTED') {
    setActing(passId); setDecisionError(''); setMessage('');
    try {
      await api.patch(`/api/hr/gate-passes/${passId}/hr-action`, { status });
      setMessage(`Gate pass ${status === 'APPROVED' ? 'approved' : 'rejected'}.`);
      await mutate();
      window.dispatchEvent(new CustomEvent('falcon:notifications-refresh'));
    } catch (cause) {
      setDecisionError(cause instanceof Error ? cause.message : 'Could not save the gate pass decision.');
    } finally { setActing(null); }
  }

  return <div className="space-y-5">
    <HrPageHeader title="Gate Passes" description="Staff mid-duty exit passes. Reporting officers review first; the assigned independent HR reviewer provides final sign-off." />
    <Button variant="outline" disabled={acting !== null || !entityReady} onClick={() => void mutate()}>Refresh</Button>
    {message && <p role="status" className="rounded-lg bg-green-50 p-3 text-green-800">{message}</p>}
    {decisionError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{decisionError}</p>}
    {!entityReady ? <p>Select an organization entity to view gate passes.</p>
      : error ? <p role="alert">{error instanceof Error ? error.message : 'Could not load gate passes. Refresh to retry.'}</p>
        : isLoading ? <p role="status">Loading gate passes…</p>
          : !rows.length ? <p>No pending gate passes in your selected organization and scope.</p>
            : <ul className="space-y-3">{rows.map((row) => <li key={row.pass_id} className="flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-white p-5">
              <div className="space-y-2">
                <h2 className="font-semibold">{row.employee_name}</h2>
                <p className="text-sm text-muted-foreground">{row.employee_email}{row.dept_name ? ` · ${row.dept_name}` : ''}</p>
                <p className="text-sm">Out: {time(row.out_time)} · Expected return: {time(row.expected_in_time)}</p>
                <p className="whitespace-pre-wrap text-sm">{row.reason}</p>
                <p className="text-xs text-muted-foreground">Raised on {row.created_at ? time(row.created_at) : 'Not recorded'}</p>
                <HrStatusBadge status={row.status} />
              </div>
              {row.status === 'PENDING' ? <p className="max-w-xs text-sm text-muted-foreground">Awaiting reporting-officer approval. HR cannot finalize this pass yet.</p>
                : !row.can_review ? <p className="max-w-xs text-sm text-muted-foreground">Awaiting the assigned independent HR reviewer.</p>
                  : <div className="flex gap-2">
                    <Button disabled={acting !== null} onClick={() => void decide(row.pass_id, 'APPROVED')}>{acting === row.pass_id ? 'Saving…' : 'Final HR Approve'}</Button>
                    <Button variant="outline" disabled={acting !== null} onClick={() => void decide(row.pass_id, 'REJECTED')}>Reject</Button>
                  </div>}
            </li>)}</ul>}
  </div>;
}
