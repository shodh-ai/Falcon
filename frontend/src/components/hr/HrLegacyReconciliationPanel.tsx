'use client';

import { useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { useAuth } from '@/context/AuthContext';
import { useHrApi } from '@/lib/api/use-hr-api';
import { useHrEntity } from '@/context/HrEntityContext';
import { useHrSWR } from '@/hooks/useHrSWR';
import { HrPersonCell } from '@/components/hr/HrAvatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type LegacyRequest = {
  leave_id: string;
  employee_name: string;
  employee_id: string | null;
  request_type: string;
  leave_type: string | null;
  start_date: string;
  end_date: string;
  reason: string | null;
  can_reconcile: boolean;
  block_reason?: string | null;
};

export function HrLegacyReconciliationPanel() {
  const { user } = useAuth();
  const api = useHrApi();
  const { entityReady } = useHrEntity();
  const canReconcile = [user?.role, ...(user?.roles ?? [])].some(
    (role) => role === 'HRAdmin' || role === 'SuperAdmin',
  );
  const { data: rows = [], error, isLoading, mutate } = useHrSWR<LegacyRequest[]>(
    canReconcile ? 'hr-legacy-approval-reconciliation' : null,
    '/api/hr/admin/requests/legacy-reconciliation',
    { revalidateOnMount: true, dedupingInterval: 0 },
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!canReconcile) return null;
  if (!entityReady) return null;

  function selectRequest(leaveId: string) {
    setSelectedId(leaveId);
    setReason('');
    setEvidenceReference('');
  }

  async function reconcile(leaveId: string) {
    if (!rows.find((row) => row.leave_id === leaveId)?.can_reconcile) {
      toast.error('This request needs manual workflow triage before it can be sent for approval.');
      return;
    }
    if (reason.trim().length < 10) {
      toast.error('Enter a reconciliation reason of at least 10 characters.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/api/hr/admin/requests/${leaveId}/reconcile-legacy-approval`, {
        reason: reason.trim(),
        evidence_reference: evidenceReference.trim() || undefined,
      });
      toast.success('Sent for fresh manager/HOD approval. No approval was recorded by this action.');
      setSelectedId(null);
      setReason('');
      setEvidenceReference('');
      await mutate();
      window.dispatchEvent(new CustomEvent('falcon:notifications-refresh'));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not reconcile request');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mt-8 space-y-3" aria-labelledby="legacy-reconciliation-heading">
      <div>
        <h2 id="legacy-reconciliation-heading" className="text-lg font-semibold text-sgvu-navy">Legacy approval reconciliation</h2>
        <p className="text-sm text-muted-foreground">
          These older requests show HoD approved but lack a verifiable decision history. They cannot receive final HR sign-off until a manager/HoD reviews them again. This action does not approve a request.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Checking legacy requests…</p>}
      {!!error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error instanceof Error ? error.message : 'Could not load legacy requests'}
          {' '}<Button size="sm" variant="outline" onClick={() => void mutate()}>Retry</Button>
        </div>
      )}
      {!isLoading && !error && rows.length === 0 && (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No legacy approvals need reconciliation.</p>
      )}
      {!error && rows.map((row) => (
        <Card key={row.leave_id}>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <HrPersonCell name={row.employee_name} subtitle={row.employee_id ?? 'Employee'} />
                <p className="text-sm text-muted-foreground">
                  {row.request_type.replaceAll('_', ' ')}{row.leave_type ? ` · ${row.leave_type}` : ''}
                  {' · '}{row.start_date === row.end_date ? row.start_date : `${row.start_date} – ${row.end_date}`}
                </p>
                {row.reason && <p className="text-sm">{row.reason}</p>}
              </div>
              {selectedId !== row.leave_id && (
                <Button size="sm" variant="outline" disabled={!row.can_reconcile} onClick={() => selectRequest(row.leave_id)}>
                  Review reconciliation
                </Button>
              )}
            </div>
            {!row.can_reconcile && (
              <p className="text-sm text-amber-800" role="status">
                Manual triage required: {row.block_reason || 'The original approval route could not be verified.'}
              </p>
            )}
            {selectedId === row.leave_id && (
              <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-medium">Send for fresh manager/HOD approval</p>
                <label className="block space-y-1 text-sm">
                  <span>Reconciliation reason (required, at least 10 characters)</span>
                  <Input maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why must this legacy approval be rechecked?" />
                </label>
                <label className="block space-y-1 text-sm">
                  <span>Evidence reference (optional)</span>
                  <Input maxLength={1000} value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} placeholder="Document or ticket reference" />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={submitting || reason.trim().length < 10} onClick={() => void reconcile(row.leave_id)}>
                    {submitting ? 'Sending…' : 'Send for fresh manager/HOD approval'}
                  </Button>
                  <Button size="sm" variant="outline" disabled={submitting} onClick={() => { setSelectedId(null); setReason(''); setEvidenceReference(''); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
