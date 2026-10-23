'use client';

import { Select } from '@/components/ui/select';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, CheckCircle2, UserPlus, Send, XCircle } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { reevaluationMaximum, type ExamResultLink, type ReEvaluationResult } from '@/lib/api/api.exams';
import { isReadOnlySeededReEvaluation } from '@/lib/exams/seeded-re-evaluation-demo';
import { ReEvaluationDemoNotice } from '@/components/exam-cell/ReEvaluationDemoNotice';
import { ReEvaluationQaPanel } from '@/components/exam-cell/ReEvaluationQaPanel';

type ReEval = ExamResultLink & {
  exam_application_id: string;
  student_name: string;
  student_email?: string;
  subject_name: string;
  subject_code: string;
  fee_status: string;
  status: string;
  original_marks?: number | string | null;
  revised_marks?: number | string | null;
  report_notes?: string | null;
  faculty_name?: string | null;
  assigned_faculty_user_id?: string | null;
  created_at: string;
  report_submitted_at?: string | null;
};

type Faculty = { user_id: string; name: string };

function statusVariant(status: string) {
  if (status === 'COMPLETED') return 'default';
  if (status === 'UNDER_REVIEW') return 'default';
  if (status === 'REJECTED') return 'destructive';
  return 'secondary';
}

export default function ExamCellReEvaluationsPage() {
  const api = useAuthedApi();
  const [items, setItems] = useState<ReEval[]>([]);
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [facultyId, setFacultyId] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [examResults, setExamResults] = useState<ReEvaluationResult[]>([]);
  const [resultsForCaseId, setResultsForCaseId] = useState<string | null>(null);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [resultId, setResultId] = useState('');
  const requestId = useRef(0);
  const resultsRequest = useRef(0);
  const mounted = useRef(false);
  const activeApi = useRef(api);
  const [loadedApi, setLoadedApi] = useState(() => api);
  const mutating = useRef(false);

  const filteredItems = statusFilter ? items.filter((i) => i.status === statusFilter) : items;
  const selected = filteredItems.find((item) => item.exam_application_id === selectedId)
    ?? filteredItems[0]
    ?? null;
  const selectedCaseId = selected?.exam_application_id;
  const selectedStatus = selected?.status;
  const selectedDemo = isReadOnlySeededReEvaluation(selected);
  const unavailable = loading || busy || Boolean(loadError) || loadedApi !== api;
  const examMaximum = selected ? reevaluationMaximum(selected) : null;
  const revised = selected?.revised_marks == null || String(selected.revised_marks).trim() === '' ? null : Number(selected.revised_marks);
  const canPublish = !selectedDemo && selected?.status === 'UNDER_REVIEW' && examMaximum !== null && revised !== null && Number.isFinite(revised) && revised >= 0 && revised <= examMaximum && revised <= 9999.99 && revised === Number(revised.toFixed(2));
  const repairable = Boolean(!selectedDemo && selected && ['PENDING', 'ASSIGNED', 'UNDER_REVIEW'].includes(selected.status));
  const candidateResults = resultsForCaseId === selectedCaseId ? examResults : [];
  const chosenResult = candidateResults.find((result) => result.result_id === resultId);
  function candidateIssue(result: ReEvaluationResult) {
    if (!result.is_valid || result.max_marks == null || !Number.isFinite(Number(result.max_marks)) || Number(result.max_marks) <= 0) return result.validation_message || 'Invalid exam result';
    if (result.link_verified !== true) return result.link_validation_message || 'The official result source has not been verified by Exam Cell';
    if (selected && ['ASSIGNED', 'UNDER_REVIEW'].includes(selected.status) && selected.exam_link_status === 'linked' && result.result_id !== selected.exam_result_id) return 'Reassessment is already linked to a different exam result';
    const original = selected?.original_marks == null || String(selected.original_marks).trim() === '' ? null : Number(selected.original_marks);
    if (original === null || !Number.isFinite(original)) return 'Original marks are unavailable; linking must preserve the existing request';
    if (result.marks_obtained == null || original !== Number(result.marks_obtained)) return 'Original marks do not match this request; linking cannot change marks';
    if (selected?.status === 'UNDER_REVIEW') {
      if (revised === null || !Number.isFinite(revised) || revised < 0) return 'Submitted revised marks are unavailable or invalid';
    }
    if (revised !== null && (!Number.isFinite(revised) || revised < 0 || revised > Number(result.max_marks) || revised > 9999.99 || revised !== Number(revised.toFixed(2)))) return 'Revised marks must be within this exam maximum with at most two decimal places';
    return null;
  }
  const candidateAllowed = (result: ReEvaluationResult) => candidateIssue(result) === null;

  const steps = [
    { key: 'PENDING', label: 'Fee paid', icon: CheckCircle2 },
    { key: 'ASSIGNED', label: 'Faculty assigned', icon: UserPlus },
    { key: 'UNDER_REVIEW', label: 'Report ready', icon: Send },
    { key: 'COMPLETED', label: 'Published', icon: CheckCircle2 },
  ];

  function stepIndex(status: string) {
    if (status === 'REJECTED') return -1;
    const order = ['PENDING', 'ASSIGNED', 'UNDER_REVIEW', 'COMPLETED'];
    return order.indexOf(status);
  }

  const load = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await api.get<ReEval[]>('/api/exam-cell/re-evaluations');
      if (!mounted.current || activeApi.current !== api || current !== requestId.current) return;
      if (!Array.isArray(rows)) throw new Error('Could not read re-evaluations');
      setLoadedApi(api);
      setItems(rows);
      setSelectedId((prev) => {
        if (prev && rows.some((r) => r.exam_application_id === prev)) return prev;
        return rows[0]?.exam_application_id ?? null;
      });
    } catch (e) {
      if (mounted.current && activeApi.current === api && current === requestId.current) setLoadError(e instanceof Error ? e.message : 'Could not load re-evaluations');
    } finally {
      if (mounted.current && activeApi.current === api && current === requestId.current) setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    mounted.current = true;
    activeApi.current = api;
    mutating.current = false;
    // Reset account-owned selections before loading the new account's queue.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBusy(false);
    setItems([]);
    setFaculty([]);
    setSelectedId(null);
    void load();
    void api.get<Faculty[]>('/api/exam-cell/faculty-roster').then((rows) => {
      if (mounted.current && activeApi.current === api) setFaculty(rows);
    }).catch(() => { if (mounted.current && activeApi.current === api) setFaculty([]); });
    return () => { mounted.current = false; requestId.current += 1; resultsRequest.current += 1; };
  }, [api, load]);

  const loadResults = useCallback(async () => {
    if (selectedDemo || !selectedCaseId || !['PENDING', 'ASSIGNED', 'UNDER_REVIEW'].includes(selectedStatus ?? '')) return;
    const current = ++resultsRequest.current;
    setResultsLoading(true);
    setResultsError(null);
    setExamResults([]);
    setResultsForCaseId(selectedCaseId);
    setResultId('');
    try {
      const rows = await api.get<ReEvaluationResult[]>(`/api/exam-cell/re-evaluations/${selectedCaseId}/exam-results`);
      if (!mounted.current || current !== resultsRequest.current || activeApi.current !== api) return;
      if (!Array.isArray(rows)) throw new Error('Could not read exam results');
      setExamResults(rows);
    } catch (e) {
      if (mounted.current && current === resultsRequest.current && activeApi.current === api) setResultsError(e instanceof Error ? e.message : 'Could not load exam results');
    } finally {
      if (mounted.current && current === resultsRequest.current && activeApi.current === api) setResultsLoading(false);
    }
  }, [api, selectedCaseId, selectedStatus, selectedDemo]);

  useEffect(() => {
    // A new case/status owns a fresh decision draft and an independently cancellable result lookup.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFacultyId('');
    setRejectReason('');
    setResultId('');
    void loadResults();
    return () => { resultsRequest.current += 1; };
  }, [loadResults]);

  async function mutate(action: string, payload: Record<string, unknown>, patch: Partial<ReEval>, message: string) {
    if (!selected || selectedDemo || unavailable || mutating.current) return;
    const id = selected.exam_application_id;
    mutating.current = true;
    setBusy(true);
    try {
      const updated = await api.post<Partial<ReEval>>(`/api/exam-cell/re-evaluations/${id}/${action}`, payload);
      if (!mounted.current || activeApi.current !== api) return;
      setItems((current) => current.map((item) => item.exam_application_id === id ? { ...item, ...patch, ...updated } : item));
      if (action === 'exam-result') setResultId('');
      toast.success(message);
      await load();
    } catch (e) {
      if (mounted.current && activeApi.current === api) toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      if (activeApi.current === api) { mutating.current = false; if (mounted.current) setBusy(false); }
    }
  }

  async function assign() {
    if (!selected || unavailable || selected.status !== 'PENDING' || examMaximum === null) return;
    if (!facultyId) {
      toast.error('Select a faculty member');
      return;
    }
    await mutate('assign', { faculty_user_id: facultyId }, { status: 'ASSIGNED', assigned_faculty_user_id: facultyId, faculty_name: faculty.find((item) => item.user_id === facultyId)?.name }, 'Faculty assigned for reassessment');
  }

  async function publish() {
    if (!canPublish) return;
    await mutate('publish', {}, { status: 'COMPLETED' }, 'Report published to student and parent');
  }

  async function reject() {
    if (!repairable) return;
    await mutate('reject', { reason: rejectReason.trim() || undefined }, { status: 'REJECTED' }, 'Application rejected');
  }

  async function linkExamResult() {
    if (!repairable || resultsLoading || resultsError || !chosenResult || !candidateAllowed(chosenResult)) return;
    await mutate('exam-result', { exam_result_id: chosenResult.result_id }, {
      exam_result_id: chosenResult.result_id, exam_session: chosenResult.exam_session, exam_type: chosenResult.exam_type,
      exam_max_marks: chosenResult.max_marks, exam_link_status: 'linked', exam_link_message: null,
    }, 'Specific exam result linked');
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <p className="text-sm font-semibold text-sgvu-gold">Falcon Exam OS</p>
          <h1 className="text-2xl font-bold text-sgvu-navy">Re-evaluations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Workflow: Student pays fee → Assign faculty → Faculty submits report → Publish to student & parent.
          </p>
        </CardContent>
      </Card>

      {loadError ? <div role="alert" className="space-y-2 rounded-lg border border-destructive/30 p-3 text-sm"><p>{loadError}</p><Button variant="outline" disabled={loading || busy} onClick={() => void load()}>Retry queue</Button></div> : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {steps.map((step, i) => (
          <div key={step.key} className="rounded-lg border bg-white px-3 py-2 text-center text-xs">
            <step.icon className="mx-auto mb-1 h-4 w-4 text-sgvu-gold" />
            <span className="font-medium text-sgvu-navy">{i + 1}. {step.label}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">{loading ? 'Loading…' : `${filteredItems.length} applications`}</CardTitle>
            <select aria-label="Application status" disabled={unavailable} className="rounded-md border px-2 py-1 text-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              <option value="PENDING">Pending</option>
              <option value="ASSIGNED">Assigned</option>
              <option value="UNDER_REVIEW">Under review</option>
              <option value="COMPLETED">Completed</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading queue…
              </div>
            ) : loadError ? <p className="text-sm text-muted-foreground">Queue unavailable. Use Retry queue to reload.</p> : filteredItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No re-evaluation requests in this filter.</p>
            ) : (
              filteredItems.map((r) => (
                <button
                  key={r.exam_application_id}
                  type="button"
                  disabled={unavailable}
                  aria-pressed={selected?.exam_application_id === r.exam_application_id}
                  onClick={() => setSelectedId(r.exam_application_id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                    selected?.exam_application_id === r.exam_application_id ? 'border-sgvu-gold bg-sgvu-gold/5' : 'hover:bg-slate-50'
                  }`}
                >
                  <p className="font-semibold text-sgvu-navy">{r.student_name}</p>
                  <p className="text-muted-foreground">
                    {r.subject_code} · {r.subject_name}
                  </p>
                  <p className="text-xs text-muted-foreground">{r.exam_session ?? (reevaluationMaximum(r) !== null ? 'Published exam result' : 'Exam not linked')}{r.exam_type ? ` · ${r.exam_type.replaceAll('_', ' ')}` : ''}</p>
                  <Badge className="mt-2" variant={statusVariant(r.status)}>
                    {r.status.replace('_', ' ')}
                  </Badge>
                  {isReadOnlySeededReEvaluation(r) ? <Badge className="ml-2 mt-2" variant="outline">Demo · read only</Badge> : null}
                </button>
              ))
            )}
          </CardContent>
        </Card>

        {selected ? (
          <Card>
            <CardHeader>
              <CardTitle>{selected.student_name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {selectedDemo ? <ReEvaluationDemoNotice /> : null}
              {selectedDemo ? <ReEvaluationQaPanel key={selected.exam_application_id} applicationId={selected.exam_application_id} audience="exam-cell" /> : null}
              <div className="flex flex-wrap gap-1">
                {steps.map((step, i) => {
                  const active = stepIndex(selected.status) >= i;
                  const rejected = selected.status === 'REJECTED';
                  return (
                    <Badge key={step.key} variant={rejected ? 'destructive' : active ? 'default' : 'outline'}>
                      {step.label}
                    </Badge>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{selected.subject_code}</Badge>
                <Badge variant={statusVariant(selected.status)}>{selected.status.replace('_', ' ')}</Badge>
                <Badge variant="outline">{selected.fee_status}</Badge>
              </div>
              <p>
                <strong>Subject:</strong> {selected.subject_name}
              </p>
              <p><strong>Exam:</strong> {selected.exam_session ?? (examMaximum !== null ? 'Published exam result' : 'Not linked')}{selected.exam_type ? ` · ${selected.exam_type.replaceAll('_', ' ')}` : ''}</p>
              <p><strong>Maximum marks:</strong> {examMaximum ?? 'Unavailable'}</p>
              {!selectedDemo && examMaximum === null ? <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">{selected.exam_link_message || 'Link a specific valid exam result before assignment or publication. No exam maximum can be inferred from the subject.'}</p> : null}
              {selected.faculty_name ? (
                <p>
                  <strong>Assigned faculty:</strong> {selected.faculty_name}
                </p>
              ) : null}
              <p><strong>Original marks:</strong> {selected.original_marks ?? 'Not recorded'}</p>
              {selected.revised_marks != null ? (
                <p>
                  <strong>Revised marks:</strong> {selected.revised_marks}
                </p>
              ) : null}
              {selected.report_notes ? (
                <div className="rounded-lg border bg-slate-50 p-3">
                  <p className="font-medium">Reassessment report</p>
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{selected.report_notes}</p>
                </div>
              ) : null}

              {repairable ? <div className="space-y-2 rounded-lg border p-3">
                <p className="font-medium">Link a specific exam result</p>
                <p className="text-xs text-muted-foreground">Choose the exact session and exam. Only verified official results matching this request’s original marks can be linked. All marks stay unchanged and the report is not published.</p>
                {resultsLoading ? <p role="status">Loading exam results…</p> : resultsError ? <div role="alert" className="space-y-2"><p>{resultsError}</p><Button variant="outline" disabled={unavailable} onClick={() => void loadResults()}>Retry exam results</Button></div> : <>
                  <label htmlFor="re-evaluation-exam-result" className="block font-medium">Exam result</label>
                  <Select id="re-evaluation-exam-result" value={chosenResult ? resultId : ''} disabled={unavailable || candidateResults.length === 0} onChange={(e) => setResultId(e.target.value)}>
                    <option value="">{candidateResults.length ? 'Select the exact exam result' : 'No matching exam results'}</option>
                    {candidateResults.map((result) => <option key={result.result_id} value={result.result_id} disabled={!candidateAllowed(result)}>{result.exam_session ?? 'Session unavailable'} · {result.exam_type?.replaceAll('_', ' ') ?? 'Type unavailable'} · {result.marks_obtained ?? 'Not recorded'} / {result.max_marks ?? 'Unavailable'}{candidateIssue(result) ? ` · ${candidateIssue(result)}` : ''}</option>)}
                  </Select>
                  {!candidateResults.length ? <p className="text-xs text-muted-foreground">A published result for this student and subject is required. Contact the results administrator.</p> : null}
                  <Button disabled={unavailable || !chosenResult || !candidateAllowed(chosenResult)} onClick={() => void linkExamResult()}>Link selected exam result</Button>
                </>}
              </div> : null}

              {!selectedDemo && selected.status === 'PENDING' ? (
                <div className="space-y-2 rounded-lg border p-3">
                  <p className="font-medium">Assign faculty</p>
                  <Select
                    className="w-full rounded-md border px-3 py-2"
                    value={facultyId}
                    disabled={unavailable || examMaximum === null}
                    onChange={(e) => setFacultyId(e.target.value)}
                  >
                    <option value="">Select faculty</option>
                    {faculty.map((f) => (
                      <option key={f.user_id} value={f.user_id}>
                        {f.name}
                      </option>
                    ))}
                  </Select>
                  <Button disabled={unavailable || examMaximum === null || !facultyId} onClick={() => void assign()}>
                    Assign for reassessment
                  </Button>
                </div>
              ) : null}

              {!selectedDemo && selected.status === 'UNDER_REVIEW' ? (
                <div className="space-y-2">
                  {!canPublish && examMaximum !== null ? <p role="alert" className="text-destructive">A valid revised mark between 0 and {examMaximum} is required before publication.</p> : null}
                  <Button disabled={unavailable || !canPublish} onClick={() => void publish()}>
                    Publish report to student & parent
                  </Button>
                </div>
              ) : null}

              {!selectedDemo && ['PENDING', 'ASSIGNED', 'UNDER_REVIEW'].includes(selected.status) ? (
                <div className="space-y-2 rounded-lg border border-destructive/30 p-3">
                  <p className="flex items-center gap-1 font-medium text-destructive"><XCircle className="h-4 w-4" /> Reject application</p>
                  <textarea
                    className="min-h-16 w-full rounded-md border px-3 py-2"
                    placeholder="Reason (optional)"
                    value={rejectReason}
                    disabled={unavailable}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                  <Button variant="destructive" disabled={unavailable} onClick={() => void reject()}>
                    Reject
                  </Button>
                </div>
              ) : null}

              {selected.status === 'COMPLETED' ? (
                <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-green-900">
                  Report published and shared with the student and linked parents.
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              {loading ? 'Loading applications…' : 'Select an application to assign faculty or publish a report.'}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
