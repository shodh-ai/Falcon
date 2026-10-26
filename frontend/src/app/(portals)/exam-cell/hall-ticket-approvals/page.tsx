'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';
import { HallTicketWorkflowNotice, type HallTicketWorkflowAvailability } from '@/components/exam-cell/HallTicketWorkflowNotice';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { canExamCellAction, normalizeExamCellRole } from '@/lib/exam-cell-rbac';
import { buildExamBatchLabel, type ExamType } from '@/lib/exam-cell-batch';

type Approval = {
  approval_id: string;
  registration_id?: string | null;
  session_id?: string | null;
  student_user_id: string;
  student_name: string;
  enrollment_number: string | null;
  stage: string;
  eligibility_status: string;
  finance_status: string;
  exam_office_status: string;
  coe_status: string;
  block_reasons: string[];
};

const STAGES = ['REGISTRATION', 'ELIGIBILITY', 'FINANCE', 'EXAM_OFFICE', 'COE', 'APPROVED', 'REJECTED'];
type Session = { session_id: string; session_name: string; semester: number; status: string };
type Readiness = { session_id: string; registration_id: string; student_user_id: string; diagnostic_only: true; ready_to_issue: false; block_reasons: string[]; unresolved_requirements: string[] };

export default function ExamCellHallTicketApprovalsPage() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const activeRole = user?.primaryRole ?? user?.role;
  const scope = `${user?.user_id ?? ''}:${user?.tenant_id ?? ''}:${activeRole ?? ''}`;
  const canApprove = canExamCellAction(activeRole, 'generate_admit_cards') && normalizeExamCellRole(activeRole) !== 'examoperator';
  const canPrepare = canExamCellAction(activeRole, 'manage_sessions');
  const [sessionId, setSessionId] = useState('');
  const [sessionsSnapshot, setSessionsSnapshot] = useState<{ api: typeof api; scope: string; data: Session[]; error?: string } | null>(null);
  const currentSessions = sessionsSnapshot?.api === api && sessionsSnapshot.scope === scope ? sessionsSnapshot : null;
  const selectedSession = currentSessions?.data.find((s) => s.session_id === sessionId);
  const [semester, setSemester] = useState('4');
  const [examType, setExamType] = useState<ExamType>('END_TERM');
  const [stageFilter, setStageFilter] = useState('ALL');
  const [snapshot, setSnapshot] = useState<{ api: typeof api; key: string; rows: Approval[]; workflow?: HallTicketWorkflowAvailability; error?: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const loadRequest = useRef({ id: 0 });
  const [busy, setBusy] = useState(false);
  const [readiness, setReadiness] = useState<{ api: typeof api; key: string; data?: Readiness; error?: string } | null>(null);

  const batchLabel = buildExamBatchLabel(semester, examType);
  const key = `${scope}:${sessionId}:${semester}:${batchLabel}:${stageFilter}`;
  const current = snapshot?.api === api && snapshot.key === key ? snapshot : null;
  const loading = !current || refreshing;
  const rows = current?.rows ?? [];
  const workflow = current?.workflow;
  const error = current?.error;
  const currentReadiness = readiness?.api === api && readiness.key === key ? readiness : null;
  const displayedApprovalIds = [...new Set(rows.filter((row) => row.session_id === sessionId && Boolean(row.registration_id)
    && ['ELIGIBILITY', 'FINANCE', 'EXAM_OFFICE', 'COE'].includes(row.stage)).map((row) => row.approval_id))];
  const validBulkSelection = Boolean(selectedSession) && displayedApprovalIds.length > 0 && displayedApprovalIds.length <= 100;
  // BLOCKED is authoritative even if an older response has permissive flags.
  const approvalActionsBlocked = workflow?.status === 'BLOCKED' || workflow?.can_approve !== true;

  const load = useCallback(() => {
    const request = ++loadRequest.current.id;
    async function fetchQueue() {
      const qs = new URLSearchParams(sessionId ? { session_id: sessionId } : { semester, batch_label: batchLabel });
      if (stageFilter && stageFilter !== 'ALL') qs.set('stage', stageFilter);
      return api.get<{ data: Approval[]; workflow?: HallTicketWorkflowAvailability } | Approval[]>(
        `/api/exam-cell/hall-ticket-approvals?${qs}`,
      );
    }
    return fetchQueue().then((res) => {
      if (request !== loadRequest.current.id) return;
      setSnapshot({ api, key, rows: Array.isArray(res) ? res : (res?.data ?? []), workflow: Array.isArray(res) ? undefined : res.workflow });
    }).catch((e: unknown) => {
      if (request !== loadRequest.current.id) return;
      const message = e instanceof Error ? e.message : 'Failed to load approvals';
      toast.error(message);
      setSnapshot({ api, key, rows: [], error: message });
    }).finally(() => {
      if (request === loadRequest.current.id) setRefreshing(false);
    });
  }, [api, semester, batchLabel, stageFilter, key, sessionId]);

  useEffect(() => {
    let active = true;
    void api.get<Session[]>('/api/exam-cell/sessions').then((data) => {
      if (!Array.isArray(data) || data.some((s) => typeof s.session_id !== 'string' || typeof s.session_name !== 'string')) throw new Error('Invalid examination session response');
      if (active) setSessionsSnapshot({ api, scope, data });
    }).catch((e: unknown) => {
      if (active) setSessionsSnapshot({ api, scope, data: [], error: e instanceof Error ? e.message : 'Failed to load examination sessions' });
    });
    return () => { active = false; };
  }, [api, scope]);

  useEffect(() => {
    const requests = loadRequest.current;
    void load();
    return () => { requests.id++; };
  }, [load]);

  async function syncQueue() {
    if (!canPrepare || !selectedSession || workflow?.can_sync !== true || loading || busy || error) return;
    setBusy(true);
    try {
      const res = await api.post<{ synced: number; total?: number }>('/api/exam-cell/hall-ticket-approvals/sync', {
        session_id: selectedSession.session_id,
      });
      toast.success(`Prepared ${res.synced} new approval records${res.total != null ? ` from ${res.total} approved registrations` : ''}. No stage was approved and no ticket was issued.`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setBusy(false);
    }
  }

  async function inspectRequirements(row: Approval) {
    if (typeof row.session_id !== 'string' || !row.session_id || typeof row.registration_id !== 'string' || !row.registration_id
      || typeof row.student_user_id !== 'string' || !row.student_user_id || busy || loading) return;
    const request = loadRequest.current.id;
    setBusy(true);
    try {
      const qs = new URLSearchParams({ session_id: row.session_id, registration_id: row.registration_id });
      const data = await api.get<Readiness>(`/api/exam-cell/admit-cards/audit?${qs}`);
      if (!data || data.session_id !== row.session_id || data.registration_id !== row.registration_id
        || data.student_user_id !== row.student_user_id || data.diagnostic_only !== true || data.ready_to_issue !== false
        || !Array.isArray(data.block_reasons) || data.block_reasons.some((reason) => typeof reason !== 'string' || !reason.trim())
        || !Array.isArray(data.unresolved_requirements) || data.unresolved_requirements.some((reason) => typeof reason !== 'string' || !reason.trim())) {
        throw new Error('Readiness response could not be verified for this registration');
      }
      if (request !== loadRequest.current.id) return;
      setReadiness({ api, key, data });
    } catch (e) {
      if (request === loadRequest.current.id) setReadiness({ api, key, error: e instanceof Error ? e.message : 'Readiness unavailable' });
    } finally { setBusy(false); }
  }

  async function advance(id: string, action: 'APPROVE' | 'REJECT', reason?: string) {
    if (!canApprove || approvalActionsBlocked || loading || busy || error) return;
    if (action === 'REJECT' && (!reason || reason.trim().length < 3 || reason.trim().length > 2000)) {
      toast.error('A rejection reason is required. Approval actions remain unavailable until the workflow is authorized.');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/api/exam-cell/hall-ticket-approvals/${id}/advance`, { action, ...(reason ? { reason: reason.trim() } : {}) });
      toast.success(action === 'APPROVE' ? 'Advanced the current approval stage' : 'Rejected');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  async function bulkApprove() {
    if (!canApprove || approvalActionsBlocked || !validBulkSelection || !selectedSession || loading || busy || error) return;
    setBusy(true);
    try {
      const res = await api.post<{ approved: number }>('/api/exam-cell/hall-ticket-approvals/bulk-approve', {
        session_id: selectedSession.session_id,
        approval_ids: displayedApprovalIds,
      });
      toast.success(`Advanced the current stage for ${res.approved} displayed approval records`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bulk approve failed');
    } finally {
      setBusy(false);
    }
  }

  const columns: DataTableColumn<Approval>[] = [
    { key: 'student', header: 'Student', render: (r) => (
      <div><p className="font-medium">{r.student_name}</p><p className="text-xs text-muted-foreground">{r.enrollment_number ?? '—'}</p></div>
    ) },
    { key: 'stage', header: 'Current stage', render: (r) => <Badge>{r.stage.replace(/_/g, ' ')}</Badge> },
    { key: 'registration', header: 'Registration', render: (r) => <span title={r.registration_id ?? undefined}>{r.registration_id ? r.registration_id.slice(0, 8) : 'Legacy / unlinked'}</span> },
    { key: 'elig', header: 'Eligibility', render: (r) => r.eligibility_status },
    { key: 'finance', header: 'Finance', render: (r) => r.finance_status },
    { key: 'coe', header: 'COE', render: (r) => r.coe_status },
    { key: 'readiness', header: 'Requirements', render: (r) => <Button size="sm" variant="outline" disabled={busy || loading || !r.session_id || !r.registration_id} onClick={() => void inspectRequirements(r)}>Check requirements</Button> },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) => canApprove && !['APPROVED', 'REJECTED'].includes(r.stage) ? (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy || loading || Boolean(error) || approvalActionsBlocked}
            className="border-[#0B2447] bg-[#0B2447] text-white hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy"
            onClick={() => void advance(r.approval_id, 'APPROVE')}
          >
            Advance current stage
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || loading || Boolean(error) || approvalActionsBlocked}
            className="border-red-600/30 text-red-700 hover:bg-red-50 active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy"
            onClick={() => void advance(r.approval_id, 'REJECT')}
          >
            Reject
          </Button>
        </div>
      ) : null,
    },
  ];

  const filterSelectClass =
    'h-10 w-full rounded-lg border border-sgvu-navy/20 bg-white px-3 text-sm font-medium text-sgvu-navy shadow-none transition-colors hover:border-sgvu-navy/40 focus:border-sgvu-gold focus:outline-none focus:ring-2 focus:ring-sgvu-gold/25 data-[state=open]:border-sgvu-gold data-[state=open]:ring-2 data-[state=open]:ring-sgvu-gold/25';
  const actionBtnClass =
    'h-10 border border-[#0B2447] bg-[#0B2447] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy disabled:opacity-60';

  const workflowSteps = [
    'Registration',
    'Eligibility',
    'Finance',
    'Exam Office',
    'COE',
    'Hall Ticket',
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <ExamCellPageHeader pageId="hall-ticket-approvals" actions={
            <Button asChild variant="outline" size="sm" className={actionBtnClass}>
              <Link href="/exam-cell/admit-cards">Check Hall Ticket readiness</Link>
            </Button>
          } />
        </CardContent>
      </Card>

      <HallTicketWorkflowNotice workflow={workflow} />

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-sgvu-navy/50">Approval workflow</p>
          <div className="flex flex-wrap items-center gap-2">
            {workflowSteps.map((step, index) => (
              <div key={step} className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-sgvu-navy/15 bg-sgvu-navy/[0.04] px-3 py-1.5 text-xs font-semibold text-sgvu-navy">
                  <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#0B2447] text-[10px] font-bold text-white">
                    {index + 1}
                  </span>
                  {step}
                </span>
                {index < workflowSteps.length - 1 ? (
                  <span className="hidden text-sgvu-navy/30 sm:inline" aria-hidden>
                    →
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-5 p-5 md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-sgvu-navy/10 pb-4">
            <div>
              <h2 className="text-lg font-bold text-sgvu-navy">Approval queue</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {loading ? 'Loading records…' : `${rows.length} record${rows.length === 1 ? '' : 's'} · ${selectedSession?.session_name ?? batchLabel}`}
              </p>
            </div>
            {canApprove ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={!canPrepare || !selectedSession || busy || loading || Boolean(error) || workflow?.can_sync !== true} className={actionBtnClass} onClick={() => void syncQueue()}>
                  {busy ? 'Working…' : 'Prepare approval queue'}
                </Button>
                <Button size="sm" disabled={busy || loading || Boolean(error) || approvalActionsBlocked || !validBulkSelection} className={actionBtnClass} onClick={() => void bulkApprove()}>
                  Bulk advance current stage
                </Button>
              </div>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">Bulk actions apply only to the displayed linked pending records in the selected session, up to 100 records. They cannot skip an approval stage.</p>

          <div className="space-y-1.5">
            <label htmlFor="hall-ticket-session" className="text-xs font-bold uppercase tracking-wide text-sgvu-navy/60">Examination session</label>
            <Select id="hall-ticket-session" className={filterSelectClass} value={sessionId} onChange={(e) => setSessionId(e.target.value)} disabled={!currentSessions || Boolean(currentSessions.error)}>
              <option value="">Legacy batch view — read only</option>
              {(currentSessions?.data ?? []).map((s) => <option key={s.session_id} value={s.session_id}>{s.session_name} · Semester {s.semester} · {s.status}</option>)}
            </Select>
            {currentSessions?.error ? <p role="alert" className="text-sm text-red-700">{currentSessions.error}. Reload the page to retry; queue preparation is unavailable.</p> : <p className="text-xs text-muted-foreground">Select the exact session to prepare approved registrations. Existing approval decisions are never reset.</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wide text-sgvu-navy/60">Semester</label>
              <Select className={filterSelectClass} value={semester} onChange={(e) => setSemester(e.target.value)} disabled={Boolean(sessionId)}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                  <option key={s} value={String(s)}>Semester {s}</option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wide text-sgvu-navy/60">Exam type</label>
              <Select className={filterSelectClass} value={examType} onChange={(e) => setExamType(e.target.value as ExamType)} disabled={Boolean(sessionId)}>
                <option value="MID_TERM">Mid Term</option>
                <option value="END_TERM">End Term</option>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wide text-sgvu-navy/60">Stage</label>
              <Select className={filterSelectClass} value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
                <option value="ALL">All stages</option>
                {STAGES.map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                ))}
              </Select>
            </div>
          </div>

          {error ? (
            <div role="alert" className="space-y-2 text-sm text-red-700">
              <p>{error}</p>
              <Button variant="outline" disabled={loading} onClick={() => { setRefreshing(true); void load(); }}>Retry loading approvals</Button>
            </div>
          ) : loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-7 w-7 animate-spin text-sgvu-navy" />
            </div>
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(r) => r.approval_id}
              emptyMessage="No approval records found. Select an OPEN or ACTIVE session to prepare approved registrations; preparation does not grant approval or issue tickets."
            />
          )}
          {currentReadiness ? (
            <div className="rounded-lg border border-sgvu-navy/15 p-4 text-sm" role={currentReadiness.error ? 'alert' : 'status'}>
              <p className="font-semibold">Current requirements — diagnostic only, not authorization to issue</p>
              {currentReadiness.error ? <p className="mt-2 text-red-700">{currentReadiness.error}</p> : (
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {[...(currentReadiness.data?.block_reasons ?? []), ...(currentReadiness.data?.unresolved_requirements ?? [])].map((reason, index) => <li key={`${index}:${reason}`}>{reason}</li>)}
                </ul>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
