'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { canExamCellAction } from '@/lib/exam-cell-rbac';

type Paper = {
  qp_id: string; subject_name: string | null; subject_code: string | null;
  exam_date: string | null; exam_type: string | null; status: string;
  notes: string | null; version_number: number | null; has_file: boolean;
};
type Schedule = { exam_schedule_id: string; subject_name?: string; subject_code?: string; exam_date: string; exam_type: string };
type Version = { version_id: string; version_number: number; uploaded_at: string; document_bytes: number; reason: string | null };
const NEXT: Record<string, { status: string; label: string }> = {
  UPLOADED: { status: 'UNDER_MODERATION', label: 'Send to moderation' },
  UNDER_MODERATION: { status: 'COE_APPROVED', label: 'Approve moderated paper' },
  COE_APPROVED: { status: 'PRINT_AUTHORIZED', label: 'Authorize printing' },
};
const base = '/api/exam-cell/question-papers';

export default function ExamCellQuestionPapersPage() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const canManage = canExamCellAction([...(user?.roles ?? []), user?.primaryRole ?? '', user?.role ?? ''], 'manage_qp');
  const [snapshot, setSnapshot] = useState<{
    api: typeof api; papers: Paper[]; schedules: Schedule[]; error: string | null;
  } | null>(null);
  const [detail, setDetail] = useState<{ api: typeof api; id: string; versions: Version[] } | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scheduleId, setScheduleId] = useState('');
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const requests = useRef(0);
  const detailsRequest = useRef(0);

  const load = useCallback(() => {
    const request = ++requests.current;
    return Promise.all([api.get<Paper[]>(base), api.get<Schedule[]>('/api/exam-cell/schedules')])
      .then(([papers, schedules]) => {
        if (request === requests.current) setSnapshot({ api, papers, schedules, error: null });
      }).catch((error: unknown) => {
        if (request === requests.current) setSnapshot({ api, papers: [], schedules: [], error: error instanceof Error ? error.message : 'Question papers are unavailable' });
      }).finally(() => { if (request === requests.current) setRefreshing(false); });
  }, [api]);
  useEffect(() => {
    void load();
    return () => { requests.current += 1; detailsRequest.current += 1; };
  }, [load]);
  const current = snapshot?.api === api ? snapshot : null;
  const loading = !current || refreshing;
  const rows = current?.papers ?? [];
  const selected = detail?.api === api ? rows.find(p => p.qp_id === detail.id) : undefined;
  const schedule = current?.schedules.find(s => s.exam_schedule_id === scheduleId);

  async function openFiles(id: string) {
    const request = ++detailsRequest.current;
    setDetail(null); setDetailError(null); setReason(''); setFile(null);
    if (input.current) input.current.value = '';
    try {
      const versions = await api.get<Version[]>(base + '/' + id + '/versions');
      if (request === detailsRequest.current) setDetail({ api, id, versions });
    } catch (error) {
      if (request === detailsRequest.current) setDetailError(error instanceof Error ? error.message : 'Paper versions are unavailable');
    }
  }

  async function run(action: () => Promise<unknown>, message: string, paperId?: string) {
    if (!canManage || inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try {
      await action();
      toast.success(message); setRefreshing(true); await load();
      if (paperId) await openFiles(paperId);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Question-paper operation failed'); }
    finally { inFlight.current = false; setBusy(false); }
  }

  function register() {
    if (!schedule) { toast.error('Select the actual examination schedule'); return; }
    void run(async () => {
      const paper = await api.post<{ qp_id: string }>(base, { exam_schedule_id: scheduleId, notes: notes.trim() || undefined });
      setNotes(''); return paper;
    }, 'Paper registered; upload its PDF before moderation');
  }

  function upload() {
    if (!selected || !file) return;
    if (file.type !== 'application/pdf' || !file.size || file.size > 25 * 1024 * 1024) { toast.error('Choose a PDF up to 25 MB'); return; }
    if (detail!.versions.length && reason.trim().length < 3) { toast.error('Explain why a new version is required'); return; }
    const body = new FormData(); body.append('file', file);
    if (reason.trim()) body.append('reason', reason.trim());
    void run(() => api.post(base + '/' + selected.qp_id + '/file', body), 'Secure paper version saved; previous versions retained', selected.qp_id);
  }

  async function download(paper: Paper, version?: Version) {
    const path = version ? '/' + paper.qp_id + '/versions/' + version.version_id + '/review-file' : '/' + paper.qp_id + '/file';
    await run(async () => {
      const blob = await api.getBlob(base + path);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = 'question-paper-' + paper.qp_id + '-v' + (version?.version_number ?? paper.version_number) + '.pdf';
      link.click(); URL.revokeObjectURL(url);
    }, version ? 'Authorized review copy downloaded' : 'Print-authorized paper downloaded');
  }

  const columns: DataTableColumn<Paper>[] = [
    { key: 'subject', header: 'Subject', render: p => <div><p className="font-medium">{p.subject_name ?? 'Unlinked legacy paper'}</p><p className="text-xs text-muted-foreground">{p.subject_code}</p></div> },
    { key: 'exam', header: 'Exam', render: p => (p.exam_type ?? 'Unlinked') + ' · ' + (p.exam_date?.slice(0, 10) ?? '—') },
    { key: 'status', header: 'Status / file', render: p => <div className="space-y-1"><Badge variant={p.status === 'PRINT_AUTHORIZED' && p.has_file ? 'default' : 'outline'}>{p.status === 'UPLOADED' && !p.has_file ? 'Awaiting PDF upload' : p.status.replaceAll('_', ' ')}</Badge><p className="text-xs text-muted-foreground">{p.has_file ? 'Verified version ' + p.version_number : 'No verified file — advancement and release blocked'}</p></div> },
    { key: 'actions', header: 'Workflow', render: p => canManage ? <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void openFiles(p.qp_id)}>Manage files</Button>
      {NEXT[p.status] ? <Button size="sm" variant="outline" disabled={busy || !p.has_file} onClick={() => void run(() => api.post(base + '/' + p.qp_id + '/status', { status: NEXT[p.status].status }), 'Workflow stage saved', detail?.id === p.qp_id ? p.qp_id : undefined)}>{NEXT[p.status].label}</Button> : null}
      {p.status === 'PRINT_AUTHORIZED' ? <Button size="sm" disabled={busy || !p.has_file} onClick={() => void download(p)}>Download for printing</Button> : null}
    </div> : <span className="text-xs text-muted-foreground">Metadata only</span> },
  ];

  return <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
    <Card className="border-sgvu-navy/10 bg-white shadow-sm"><CardContent className="p-5 md:p-6"><ExamCellPageHeader pageId="question-papers" /></CardContent></Card>
    {canManage ? <Card><CardHeader><CardTitle className="text-base">Register question paper</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
      <div><label htmlFor="qp-schedule" className="mb-1 block text-xs font-medium text-muted-foreground">Examination schedule</label><Select id="qp-schedule" disabled={busy || loading || !!current?.error} value={scheduleId} onChange={e => setScheduleId(e.target.value)}>
        <option value="">Select examination</option>{current?.schedules.map(s => <option key={s.exam_schedule_id} value={s.exam_schedule_id}>{s.subject_name ?? s.subject_code ?? 'Exam'} · {s.exam_date.slice(0, 10)} · {s.exam_type}</option>)}
      </Select></div>
      <div><label htmlFor="qp-subject" className="mb-1 block text-xs font-medium text-muted-foreground">Subject from examination</label><Input id="qp-subject" readOnly value={schedule?.subject_name ?? schedule?.subject_code ?? ''} /></div>
      <Input aria-label="Paper registration notes" placeholder="Setter reference or registration notes" value={notes} maxLength={2000} disabled={busy} onChange={e => setNotes(e.target.value)} className="sm:col-span-2" />
      <Button disabled={busy || !schedule || !!current?.error} onClick={register} className="sm:col-span-2">Add record</Button>
    </CardContent></Card> : null}
    <Card><CardHeader><CardTitle className="text-base">Question paper control — audit trail enabled</CardTitle></CardHeader><CardContent>
      {loading ? <Loader2 aria-label="Loading question papers" className="h-6 w-6 animate-spin" /> : current?.error ? <div role="alert" className="space-y-2 text-sm text-red-700"><p>{current.error}</p><Button variant="outline" onClick={() => { setRefreshing(true); void load(); }}>Retry loading papers</Button></div> : <DataTable columns={columns} rows={rows} rowKey={p => p.qp_id} emptyMessage="No question papers registered for your tenant." />}
    </CardContent></Card>
    {detailError ? <p role="alert" className="text-sm text-red-700">{detailError}</p> : null}
    {selected && detail?.api === api && canManage ? <Card><CardHeader><CardTitle className="text-base">Secure files — {selected.subject_name ?? 'legacy paper'}</CardTitle></CardHeader><CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">Review copies are restricted to authorized question-paper managers. Printing downloads require the final Print Authorized stage. No public file links are provided.</p>
      {['UPLOADED', 'REJECTED'].includes(selected.status) ? <div className="space-y-3">
        <label htmlFor="qp-file" className="block text-sm font-medium">PDF paper (maximum 25 MB)</label><Input ref={input} id="qp-file" type="file" accept="application/pdf,.pdf" disabled={busy} onChange={e => setFile(e.target.files?.[0] ?? null)} />
        <Button disabled={busy || !file} onClick={upload}>Upload PDF version</Button>
      </div> : <p className="text-sm">This version is locked against replacement. A rejected paper must be uploaded again and pass every approval stage.</p>}
      <div><label htmlFor="qp-reason" className="block text-sm font-medium">Rejection / new version reason</label><Input id="qp-reason" value={reason} maxLength={2000} disabled={busy} onChange={e => setReason(e.target.value)} /></div>
      {NEXT[selected.status] ? <Button variant="outline" disabled={busy || reason.trim().length < 3} onClick={() => void run(() => api.post(base + '/' + selected.qp_id + '/status', { status: 'REJECTED', reason: reason.trim() }), 'Paper returned for correction; approvals invalidated', selected.qp_id)}>Reject / return for correction</Button> : null}
      <h3 className="font-medium">Retained versions</h3>
      {!detail.versions.length ? <p className="text-sm text-muted-foreground">No verified PDF versions. Legacy paths are not accepted as secure uploads.</p> : detail.versions.map(v => <div key={v.version_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
        <div><p className="font-medium">Version {v.version_number}</p><p className="text-xs text-muted-foreground">{new Date(v.uploaded_at).toLocaleString('en-IN')} · {v.document_bytes} bytes</p>{v.reason ? <p className="text-sm">{v.reason}</p> : null}</div>
        <Button variant="outline" size="sm" disabled={busy || !selected.has_file} onClick={() => void download(selected, v)}>Download review copy v{v.version_number}</Button>
      </div>)}
    </CardContent></Card> : null}
  </div>;
}
