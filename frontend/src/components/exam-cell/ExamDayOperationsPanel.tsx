'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { useAuthedApi } from '@/lib/api';
import { canExamCellAction } from '@/lib/exam-cell-rbac';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type ScriptCandidate = {
  student_user_id: string;
  student_name: string;
  enrollment_number: string | null;
  attendance_status: string | null;
  expected: boolean;
  collection_status: string;
  sheets: Array<{ sheet_id: string; sheet_number: string; collected_at: string | null; status: string }>;
  discrepancy: { discrepancy_id: string; status: string; reason: string; resolution: string | null } | null;
};
export type ScriptReconciliation = {
  exam_schedule_id: string;
  summary: {
    roster: number; expected_candidates: number; received_candidates: number;
    received_booklets: number; absent: number; attendance_pending: number;
    registered_booklets: number; outstanding_booklets: number;
    pending_collection: number; missing: number; unlinked_booklets: number; conflicts: number;
  };
  candidates: ScriptCandidate[];
};
type Incident = {
  case_id: string; student_name: string; description: string; status: string;
  marks_locked: boolean; penalty_applied: string | null; exam_day_reference: string | null;
  review_reason: string | null;
};

type Props = {
  api: ReturnType<typeof useAuthedApi>;
  scheduleId: string;
  role?: string;
  onBusyChange: (busy: boolean) => void;
};

export function ExamDayOperationsPanel({ api, scheduleId, role, onBusyChange }: Props) {
  const [snapshot, setSnapshot] = useState<{
    api: typeof api; scheduleId: string; reconciliation: ScriptReconciliation | null;
    incidents: Incident[]; error: string | null;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [sheetNumber, setSheetNumber] = useState('');
  const [reason, setReason] = useState('');
  const [incidentStudentId, setIncidentStudentId] = useState('');
  const [description, setDescription] = useState('');
  const [reviewReason, setReviewReason] = useState('');
  const request = useRef(0);
  const mutation = useRef(false);
  const incidentRetry = useRef<{ signature: string; id: string } | null>(null);
  const canManage = canExamCellAction(role, 'manage_sessions');
  const canReport = canExamCellAction(role, 'approve_ufm');

  const load = useCallback(() => {
    const id = ++request.current;
    const query = `exam_schedule_id=${encodeURIComponent(scheduleId)}`;
    return Promise.all([
      api.get<ScriptReconciliation>(`/api/exam-cell/exam-day/scripts?${query}`),
      api.get<Incident[]>(`/api/exam-cell/exam-day/ufm?${query}`),
    ]).then(([reconciliation, incidents]) => {
      if (id !== request.current) return;
      if (reconciliation.exam_schedule_id !== scheduleId || !Array.isArray(reconciliation.candidates) || !reconciliation.summary || !Array.isArray(incidents))
        throw new Error('Invalid exam-day operations response');
      setSnapshot({ api, scheduleId, reconciliation, incidents, error: null });
    }).catch((error: unknown) => {
      if (id === request.current) setSnapshot({ api, scheduleId, reconciliation: null, incidents: [], error: error instanceof Error ? error.message : 'Exam-day operations are unavailable' });
    }).finally(() => { if (id === request.current) setRefreshing(false); });
  }, [api, scheduleId]);

  useEffect(() => {
    void load();
    return () => { request.current += 1; };
  }, [load]);

  const current = snapshot?.api === api && snapshot.scheduleId === scheduleId ? snapshot : null;
  const data = current?.reconciliation;
  const ready = !!data && !current?.error && !refreshing;
  const selected = data?.candidates.find(c => c.student_user_id === studentId);

  async function run(action: () => Promise<unknown>, message: string) {
    if (!ready || mutation.current) return;
    mutation.current = true;
    setBusy(true);
    onBusyChange(true);
    try {
      await action();
      toast.success(message);
      setRefreshing(true);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The examination record could not be saved');
    } finally {
      mutation.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }

  function collect() {
    if (!canManage || !selected?.expected || !sheetNumber.trim()) return;
    if (selected.discrepancy?.status === 'MISSING' && reason.trim().length < 3) {
      toast.error('Enter a reason explaining how the missing script was found');
      return;
    }
    void run(() => api.post('/api/exam-cell/answer-sheets', {
      exam_schedule_id: scheduleId, student_user_id: selected.student_user_id,
      sheet_number: sheetNumber.trim(), collect: true,
      ...(selected.discrepancy?.status === 'MISSING' ? { resolution_reason: reason.trim() } : {}),
    }), 'Physical booklet receipt saved');
  }

  function reportMissing() {
    if (!canManage || !selected?.expected || reason.trim().length < 3) return;
    void run(() => api.post('/api/exam-cell/exam-day/scripts/missing', {
      exam_schedule_id: scheduleId, student_user_id: selected.student_user_id, reason: reason.trim(),
    }), 'Missing script reported');
  }

  function correctMissingReport() {
    if (!canManage || selected?.discrepancy?.status !== 'MISSING' || reason.trim().length < 3) return;
    void run(() => api.post(`/api/exam-cell/exam-day/scripts/${selected.discrepancy!.discrepancy_id}/resolve`, {
      resolution: 'REPORTED_IN_ERROR', reason: reason.trim(),
    }), 'Missing report corrected; physical collection remains separate');
  }

  function reportIncident() {
    if (!canReport || !data?.candidates.some(c => c.student_user_id === incidentStudentId) || description.trim().length < 3) return;
    const signature = JSON.stringify([scheduleId, incidentStudentId, description.trim()]);
    if (incidentRetry.current?.signature !== signature) incidentRetry.current = { signature, id: crypto.randomUUID() };
    const requestId = incidentRetry.current.id;
    void run(async () => {
      const result = await api.post('/api/exam-cell/exam-day/ufm', {
        exam_schedule_id: scheduleId, student_user_id: incidentStudentId,
        description: description.trim(), request_id: requestId,
      });
      incidentRetry.current = null;
      setDescription('');
      return result;
    }, 'UFM incident recorded for review');
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Script collection and exam-day incidents</CardTitle>
        <Button size="sm" variant="outline" disabled={busy || refreshing} onClick={() => { setRefreshing(true); void load(); }}>Refresh operations</Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {current?.error ? <div role="alert" className="text-sm text-red-700">{current.error}. Use Refresh operations to retry.</div>
          : !ready || !data ? <p role="status" className="text-sm text-muted-foreground">Loading script reconciliation…</p> : <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                ['Candidates who sat', data.summary.expected_candidates],
                ['Candidates with receipts', data.summary.received_candidates],
                ['Booklets received', data.summary.received_booklets],
                ['Registered booklets', data.summary.registered_booklets],
                ['Outstanding booklets', data.summary.outstanding_booklets],
                ['Absent students', data.summary.absent],
                ['Awaiting collection', data.summary.pending_collection],
                ['Reported missing', data.summary.missing],
                ['Attendance not marked', data.summary.attendance_pending],
                ['Records needing review', data.summary.unlinked_booklets + data.summary.conflicts],
              ].map(([label, value]) => <div key={label} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold text-sgvu-navy">{value}</p></div>)}
            </div>
            <p className="text-sm text-muted-foreground">Collection counts come from recorded physical receipts. An unmarked student is not treated as absent. Register all issued and supplementary booklets in <a className="underline" href="/exam-cell/answer-sheets">Answer Sheets</a> so outstanding booklets remain visible.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b"><th className="p-2">Candidate</th><th className="p-2">Attendance</th><th className="p-2">Script</th><th className="p-2">Booklets / discrepancy</th></tr></thead>
                <tbody>{data.candidates.map(c => <tr key={c.student_user_id} className="border-b">
                  <td className="p-2">{c.student_name}<p className="text-xs text-muted-foreground">{c.enrollment_number ?? '—'}</p></td>
                  <td className="p-2">{c.attendance_status ?? 'Not marked'}</td>
                  <td className="p-2"><Badge variant="outline">{c.collection_status.replaceAll('_', ' ')}</Badge></td>
                  <td className="p-2">{c.sheets.length ? c.sheets.map(s => `${s.sheet_number}${s.collected_at ? ' (received)' : ' (receipt unverified)'}`).join(', ') : 'No booklet receipt'}
                    {c.discrepancy ? <p className="text-xs text-muted-foreground">{c.discrepancy.status}: {c.discrepancy.reason}</p> : null}</td>
                </tr>)}</tbody>
              </table>
            </div>
            {canManage ? <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
              <div><label htmlFor="script-candidate" className="text-sm font-medium">Script candidate</label>
                <Select id="script-candidate" disabled={busy} value={selected ? studentId : ''} onChange={e => { setStudentId(e.target.value); setSheetNumber(''); setReason(''); }}>
                  <option value="">Select candidate</option>{data.candidates.map(c => <option key={c.student_user_id} value={c.student_user_id}>{c.student_name} · {c.enrollment_number ?? c.attendance_status ?? 'Not marked'}</option>)}
                </Select></div>
              <div><label htmlFor="script-booklet" className="text-sm font-medium">Actual booklet number</label><Input id="script-booklet" disabled={busy} maxLength={40} value={sheetNumber} onChange={e => setSheetNumber(e.target.value)} /></div>
              <div className="sm:col-span-2"><label htmlFor="script-reason" className="text-sm font-medium">Missing / resolution reason</label><Input id="script-reason" disabled={busy} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></div>
              {selected && !selected.expected ? <p className="text-sm text-amber-800 sm:col-span-2">Record PRESENT or LATE attendance before collecting or reporting a missing script.</p> : null}
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <Button disabled={busy || !selected?.expected || !sheetNumber.trim()} onClick={collect}>Record collected booklet</Button>
                <Button variant="outline" disabled={busy || !selected?.expected || (selected.sheets.length > 0 && selected.sheets.every(s => s.collected_at)) || selected.discrepancy?.status === 'MISSING' || reason.trim().length < 3} onClick={reportMissing}>Report missing script</Button>
                {selected?.discrepancy?.status === 'MISSING' ? <Button variant="outline" disabled={busy || reason.trim().length < 3} onClick={correctMissingReport}>Correct mistaken missing report</Button> : null}
                {selected?.sheets.filter(s => s.collected_at && s.status === 'COLLECTED').map(sheet => <Button key={sheet.sheet_id} variant="outline" disabled={busy || reason.trim().length < 3} onClick={() => void run(() => api.post(`/api/exam-cell/answer-sheets/${sheet.sheet_id}/correct-receipt`, { reason: reason.trim() }), 'Receipt corrected; the original receipt remains in audit history')}>Correct receipt {sheet.sheet_number}</Button>)}
              </div>
            </div> : null}
            <div className="space-y-3 border-t pt-5">
              <h3 className="font-semibold text-sgvu-navy">UFM incidents</h3>
              <p className="text-sm text-muted-foreground">Record and review an incident here. Marks penalties remain in the authorized UFM process.</p>
              {canReport ? <div className="grid gap-3 sm:grid-cols-2">
                <div><label htmlFor="ufm-candidate" className="text-sm font-medium">Incident candidate</label><Select id="ufm-candidate" disabled={busy} value={data.candidates.some(c => c.student_user_id === incidentStudentId) ? incidentStudentId : ''} onChange={e => setIncidentStudentId(e.target.value)}><option value="">Select candidate</option>{data.candidates.map(c => <option key={c.student_user_id} value={c.student_user_id}>{c.student_name} · {c.enrollment_number ?? '—'}</option>)}</Select></div>
                <div><label htmlFor="ufm-description" className="text-sm font-medium">Incident details</label><Input id="ufm-description" disabled={busy} maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} /></div>
                <Button className="sm:col-span-2" disabled={busy || !incidentStudentId || description.trim().length < 3} onClick={reportIncident}>Record UFM incident</Button>
                <div className="sm:col-span-2"><label htmlFor="ufm-review-reason" className="text-sm font-medium">Review / closure reason</label><Input id="ufm-review-reason" disabled={busy} maxLength={2000} value={reviewReason} onChange={e => setReviewReason(e.target.value)} /></div>
              </div> : null}
              {current.incidents.length === 0 ? <p className="text-sm text-muted-foreground">No incidents recorded for this examination.</p> : current.incidents.map(incident => <div key={incident.case_id} className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2 font-medium">{incident.student_name} <Badge variant="outline">{incident.status.replaceAll('_', ' ')}</Badge></div>
                <p className="text-sm">{incident.description}</p>{incident.review_reason ? <p className="text-sm text-muted-foreground">Review: {incident.review_reason}</p> : null}
                {canReport && incident.exam_day_reference && !incident.marks_locked && !incident.penalty_applied && incident.status !== 'CLOSED' ? <Button size="sm" variant="outline" disabled={busy || reviewReason.trim().length < 3} onClick={() => void run(() => api.post(`/api/exam-cell/exam-day/ufm/${incident.case_id}/status`, { status: incident.status === 'OPEN' ? 'UNDER_REVIEW' : 'CLOSED', reason: reviewReason.trim() }), incident.status === 'OPEN' ? 'Incident placed under review' : 'Incident closed')}>{incident.status === 'OPEN' ? 'Start incident review' : 'Close reviewed incident'}</Button> : null}
                {incident.marks_locked || incident.penalty_applied ? <p className="text-xs text-muted-foreground">Sanctioned case — use the UFM Cases workflow.</p> : null}
              </div>)}
            </div>
          </>}
      </CardContent>
    </Card>
  );
}
