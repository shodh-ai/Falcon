'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';
import { HallTicketWorkflowNotice, type HallTicketWorkflowAvailability } from '@/components/exam-cell/HallTicketWorkflowNotice';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { canExamCellAction } from '@/lib/exam-cell-rbac';

type Session = { session_id: string; session_name: string; semester: number | null; status: string };
type Approval = {
  approval_id: string;
  registration_id: string | null;
  session_id: string;
  student_user_id: string;
  student_name: string;
  enrollment_number: string | null;
  stage: string;
};
type Queue = { data: Approval[]; total: number; workflow?: HallTicketWorkflowAvailability };
type Readiness = {
  session_id: string;
  registration_id: string;
  student_user_id: string;
  diagnostic_only: true;
  ready_to_issue: false;
  block_reasons: string[];
  unresolved_requirements: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function readSessions(value: unknown): Session[] {
  if (!Array.isArray(value) || value.some((session: unknown) => !isRecord(session)
    || typeof session.session_id !== 'string' || !session.session_id
    || typeof session.session_name !== 'string' || !session.session_name
    || typeof session.status !== 'string'
    || (session.semester !== null && (!Number.isSafeInteger(session.semester) || Number(session.semester) < 1)))
    || new Set(value.map((session: Session) => session.session_id)).size !== value.length) {
    throw new Error('Examination session data could not be verified');
  }
  return value as Session[];
}

function readQueue(value: unknown, sessionId: string): Queue {
  if (!isRecord(value) || !Array.isArray(value.data) || !Number.isSafeInteger(value.total)
    || Number(value.total) < value.data.length || value.data.some((row: unknown) => !isRecord(row)
      || typeof row.approval_id !== 'string' || !row.approval_id
      || row.session_id !== sessionId
      || (row.registration_id !== null && typeof row.registration_id !== 'string')
      || typeof row.student_user_id !== 'string' || !row.student_user_id
      || typeof row.student_name !== 'string' || typeof row.stage !== 'string')
    || new Set(value.data.map((row: Approval) => row.approval_id)).size !== value.data.length) {
    throw new Error('Session-linked approval records could not be verified');
  }
  return value as Queue;
}

function readReadiness(value: unknown, row: Approval): Readiness {
  if (!isRecord(value) || value.session_id !== row.session_id || value.registration_id !== row.registration_id
    || value.student_user_id !== row.student_user_id || value.diagnostic_only !== true || value.ready_to_issue !== false
    || !Array.isArray(value.block_reasons) || value.block_reasons.some((reason: unknown) => typeof reason !== 'string')
    || !Array.isArray(value.unresolved_requirements) || value.unresolved_requirements.some((reason: unknown) => typeof reason !== 'string')) {
    throw new Error('Readiness response could not be verified for this registration');
  }
  return value as Readiness;
}

export default function ExamCellAdmitCardsPage() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const activeRole = user?.primaryRole ?? user?.role;
  const canRead = canExamCellAction(activeRole, 'view_dashboard');
  const canGenerate = canExamCellAction(activeRole, 'generate_admit_cards');
  const authScope = [user?.user_id ?? '', user?.tenant_id ?? '', activeRole ?? ''].join(':');
  const hasContext = Boolean(user?.user_id && user?.tenant_id);
  const [sessionsSnapshot, setSessionsSnapshot] = useState<{ api: typeof api; scope: string; data: Session[]; error?: string } | null>(null);
  const [selection, setSelection] = useState({ scope: authScope, id: '' });
  const [page, setPage] = useState(1);
  const [queueSnapshot, setQueueSnapshot] = useState<{ api: typeof api; key: string; data?: Queue; error?: string } | null>(null);
  const [refreshingSessions, setRefreshingSessions] = useState(false);
  const [refreshingQueue, setRefreshingQueue] = useState(false);
  const [readiness, setReadiness] = useState<{ api: typeof api; key: string; registrationId: string; studentName: string; pending?: boolean; data?: Readiness; error?: string } | null>(null);
  const sessionsRequest = useRef(0);
  const queueRequest = useRef(0);
  const readinessRequest = useRef(0);
  const currentSessions = sessionsSnapshot?.api === api && sessionsSnapshot.scope === authScope ? sessionsSnapshot : null;
  const sessionId = selection.scope === authScope ? selection.id : '';
  const selectedSession = currentSessions?.data.find((session) => session.session_id === sessionId);
  const key = [authScope, sessionId, page].join(':');
  const currentQueue = queueSnapshot?.api === api && queueSnapshot.key === key ? queueSnapshot : null;
  const currentReadiness = readiness?.api === api && readiness.key === key ? readiness : null;
  const sessionsLoading = canRead && hasContext && (!currentSessions || refreshingSessions);
  const queueLoading = Boolean(selectedSession && (!currentQueue || refreshingQueue));
  const rows = currentQueue?.data?.data ?? [];

  const loadSessions = useCallback(() => {
    if (!canRead || !hasContext) return Promise.resolve();
    const request = ++sessionsRequest.current;
    return api.get<unknown>('/api/exam-cell/sessions').then(readSessions).then((data) => {
      if (sessionsRequest.current === request) setSessionsSnapshot({ api, scope: authScope, data });
    }).catch((error: unknown) => {
      if (sessionsRequest.current === request) setSessionsSnapshot({ api, scope: authScope, data: [], error: error instanceof Error ? error.message : 'Examination sessions are unavailable' });
    }).finally(() => {
      if (sessionsRequest.current === request) setRefreshingSessions(false);
    });
  }, [api, authScope, canRead, hasContext]);

  const loadQueue = useCallback(() => {
    if (!canRead || !hasContext || !selectedSession) return Promise.resolve();
    const request = ++queueRequest.current;
    const query = new URLSearchParams({ session_id: selectedSession.session_id, page: String(page), limit: '50' });
    return api.get<unknown>('/api/exam-cell/hall-ticket-approvals?' + query).then((value) => readQueue(value, selectedSession.session_id)).then((data) => {
      if (queueRequest.current === request) setQueueSnapshot({ api, key, data });
    }).catch((error: unknown) => {
      if (queueRequest.current === request) setQueueSnapshot({ api, key, error: error instanceof Error ? error.message : 'Session approval records are unavailable' });
    }).finally(() => {
      if (queueRequest.current === request) setRefreshingQueue(false);
    });
  }, [api, canRead, hasContext, selectedSession, page, key]);

  useEffect(() => {
    const requests = sessionsRequest;
    void loadSessions();
    return () => { requests.current++; };
  }, [loadSessions]);

  useEffect(() => {
    const requests = queueRequest;
    const diagnostics = readinessRequest;
    void loadQueue();
    return () => { requests.current++; diagnostics.current++; };
  }, [loadQueue]);

  function inspectRequirements(row: Approval) {
    if (!canRead || !hasContext || queueLoading || currentQueue?.error || !selectedSession
      || row.session_id !== selectedSession.session_id || !row.registration_id || currentReadiness?.pending) return;
    const registrationId = row.registration_id;
    const request = ++readinessRequest.current;
    setReadiness({ api, key, registrationId, studentName: row.student_name, pending: true });
    const query = new URLSearchParams({ session_id: row.session_id, registration_id: registrationId });
    void api.get<unknown>('/api/exam-cell/admit-cards/audit?' + query).then((value) => readReadiness(value, row)).then((data) => {
      if (readinessRequest.current === request) setReadiness({ api, key, registrationId, studentName: row.student_name, data });
    }).catch((error: unknown) => {
      if (readinessRequest.current === request) setReadiness({ api, key, registrationId, studentName: row.student_name, error: error instanceof Error ? error.message : 'Readiness is unavailable' });
    });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm"><CardContent className="p-5 md:p-6"><ExamCellPageHeader pageId="admit-cards" /></CardContent></Card>
      {!canRead || !hasContext ? <p role="alert" className="text-sm text-red-700">{!canRead ? 'Your active role cannot access Hall Ticket readiness.' : 'Authenticated tenant and user context is unavailable. Sign in again.'}</p> : (
        <>
          <HallTicketWorkflowNotice workflow={currentQueue?.data?.workflow} />
          <Card className="border-sgvu-navy/10 shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-base text-sgvu-navy">Audit filters</CardTitle><CardDescription>Select the actual examination session to review its linked registrations. Readiness checks never approve or issue a ticket.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1.5">
                  <label htmlFor="hall-ticket-readiness-session" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Examination session</label>
                  <Select id="hall-ticket-readiness-session" className="h-10 w-full rounded-lg border px-3 text-sm" value={selectedSession?.session_id ?? ''} disabled={sessionsLoading || Boolean(currentSessions?.error)} onChange={(event) => {
                    queueRequest.current++; readinessRequest.current++;
                    setSelection({ scope: authScope, id: event.target.value }); setPage(1); setReadiness(null); setRefreshingQueue(false);
                  }}>
                    <option value="">{sessionsLoading ? 'Loading sessions…' : 'Select examination session'}</option>
                    {(currentSessions?.data ?? []).map((session) => <option key={session.session_id} value={session.session_id}>{session.session_name}{session.semester ? ' · Semester ' + session.semester : ''} · {session.status}</option>)}
                  </Select>
                </div>
                <Button variant="outline" disabled={sessionsLoading || queueLoading} onClick={() => {
                  readinessRequest.current++; setReadiness(null);
                  if (currentSessions?.error || !selectedSession) { setRefreshingSessions(true); void loadSessions(); }
                  else { setRefreshingQueue(true); void loadQueue(); }
                }}>{sessionsLoading || queueLoading ? 'Refreshing…' : 'Refresh'}</Button>
              </div>
              {currentSessions?.error ? <p role="alert" className="text-sm text-red-700">{currentSessions.error}. Use Refresh to retry.</p> : !sessionsLoading && currentSessions?.data.length === 0 ? <p className="text-sm text-muted-foreground">No examination sessions are available.</p> : null}
            </CardContent>
          </Card>
          <Card className="overflow-hidden border-sgvu-navy/10 shadow-sm">
            <CardHeader className="border-b bg-slate-50/80"><CardTitle className="text-base text-sgvu-navy">Session-linked readiness</CardTitle><CardDescription>{queueLoading ? 'Loading linked registrations…' : currentQueue?.error ? 'Registration data unavailable.' : selectedSession && currentQueue?.data ? currentQueue.data.total + ' linked approval records · ' + selectedSession.session_name + '. An approval record is not proof of official issuance.' : 'Select an examination session. No batch-label matching is used.'}</CardDescription></CardHeader>
            <CardContent className="p-0">
              {!selectedSession ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">Select a session to load its registration-linked approval queue.</p> : queueLoading ? <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm" role="status"><Loader2 className="h-5 w-5 animate-spin" /> Loading linked registrations…</div> : currentQueue?.error ? <p role="alert" className="px-4 py-8 text-sm text-red-700">{currentQueue.error}. Use Refresh to retry. No readiness or issuance status is available.</p> : rows.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">No linked approval records for this session. Prepare its approved registrations in the Hall Ticket Approval Workflow.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"><th className="px-4 py-3">Student</th><th className="px-4 py-3">Registration</th><th className="px-4 py-3">Approval stage</th><th className="px-4 py-3">Readiness</th></tr></thead>
                    <tbody className="divide-y">{rows.map((row) => (
                      <tr key={row.approval_id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3.5"><p className="font-medium text-sgvu-navy">{row.student_name}</p><p className="font-mono text-xs text-muted-foreground">{row.enrollment_number ?? '—'}</p></td>
                        <td className="px-4 py-3.5 font-mono text-xs">{row.registration_id ?? 'Unlinked — unavailable'}</td>
                        <td className="px-4 py-3.5"><Badge variant="outline">{row.stage.replace(/_/g, ' ')}</Badge></td>
                        <td className="px-4 py-3.5"><Button size="sm" variant="outline" disabled={!row.registration_id || Boolean(currentReadiness?.pending)} onClick={() => inspectRequirements(row)}>{currentReadiness?.pending && currentReadiness.registrationId === row.registration_id ? 'Checking…' : 'Check readiness'}</Button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
              {currentQueue?.data && currentQueue.data.total > 50 ? <div className="flex items-center justify-between gap-3 border-t p-4 text-sm"><Button variant="outline" disabled={queueLoading || page === 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><span>Page {page} of {Math.ceil(currentQueue.data.total / 50)}</span><Button variant="outline" disabled={queueLoading || page * 50 >= currentQueue.data.total} onClick={() => setPage((value) => value + 1)}>Next</Button></div> : null}
            </CardContent>
          </Card>
          {currentReadiness ? (
            <Card className="border-sgvu-navy/10 shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-base text-sgvu-navy">Readiness — {currentReadiness.studentName}</CardTitle><CardDescription>Diagnostic only. This does not approve a stage, authorize generation or establish that a ticket was issued.</CardDescription></CardHeader>
              <CardContent>
                {currentReadiness.pending ? <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Checking current authoritative records…</p> : currentReadiness.error ? <p role="alert" className="text-sm text-red-700">{currentReadiness.error}. Check readiness again to retry.</p> : (
                  <div className="space-y-3 text-sm">
                    <Badge variant="destructive">Issuance blocked</Badge>
                    {currentReadiness.data?.block_reasons.length ? <ul className="list-disc space-y-1 pl-5">{currentReadiness.data.block_reasons.map((reason, index) => <li key={'block:' + index}>{reason}</li>)}</ul> : <p>No additional diagnostic blockers were reported. Final approval and unresolved issuance requirements still apply.</p>}
                    {currentReadiness.data?.unresolved_requirements.length ? <><p className="font-semibold text-sgvu-navy">Unresolved requirements</p><ul className="list-disc space-y-1 pl-5">{currentReadiness.data.unresolved_requirements.map((reason, index) => <li key={'requirement:' + index}>{reason}</li>)}</ul></> : null}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
          <Card className="border-sgvu-navy/10 shadow-sm">
            <CardContent className="space-y-3 pt-6">
              <p className="text-sm text-muted-foreground">Official issuance remains unavailable until required stage permissions, clearance policy and the durable issuance workflow are verified. This screen cannot generate a PDF.</p>
              <div className="flex flex-col gap-3 sm:flex-row">
                {canGenerate ? <Button size="lg" className="h-11 bg-sgvu-navy" disabled>Issue Hall Tickets — unavailable</Button> : null}
                <Button asChild variant="outline" size="lg" className="h-11"><Link href="/exam-cell/hall-ticket-approvals">Hall Ticket Approval Workflow →</Link></Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
