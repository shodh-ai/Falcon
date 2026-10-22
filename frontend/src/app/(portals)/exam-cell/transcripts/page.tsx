'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { useAuthedApi } from '@/lib/api';
import { authHeaders, getApiBaseUrl } from '@/lib/api/client';
import { useAuth } from '@/context/AuthContext';
import { canExamCellAction } from '@/lib/exam-cell-rbac';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

type Transcript = {
  transcript_id: string;
  student_user_id: string;
  student_name: string;
  enrollment_no: string | null;
  semester: number;
  status: string;
  pdf_url: string | null;
  verification_code: string | null;
  generated_at: string | null;
  revision?: number;
  downloadable?: boolean;
  needs_reissue?: boolean;
  revocation_reason?: string | null;
  has_open_ufm?: boolean;
};
type TranscriptList = { api: ReturnType<typeof useAuthedApi>; key: string; rows: Transcript[]; error: string | null };
type BatchResult = { semester: number; requested: number; transcript_ids: string[] };
type Action = 'generate' | `pdf:${string}` | `reissue:${string}` | null;

const btnIdle =
  'h-10 border border-[#0B2447] bg-[#0B2447] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy disabled:opacity-60';

export default function ExamCellTranscriptsPage() {
  const api = useAuthedApi();
  const { token, user } = useAuth();
  const canGenerate = canExamCellAction([...(user?.roles ?? []), user?.primaryRole ?? '', user?.role ?? ''], 'publish_results');
  const [semester, setSemester] = useState('4');
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<TranscriptList | null>(null);
  const [action, setAction] = useState<Action>(null);
  const pending = useRef<Action>(null);
  const requestScope = useRef(0);
  const [selection, setSelection] = useState<{ api: typeof api; semester: string; row: Transcript } | null>(null);
  const [reissueReason, setReissueReason] = useState('');
  const selected = selection?.api === api && selection.semester === semester ? selection.row : null;
  const sem = Number(semester);
  const validSemester = Number.isInteger(sem) && sem >= 1;
  const key = `${semester}:${revision}`;
  const current = result?.api === api && result.key === key ? result : null;
  const loading = validSemester && !current;
  const error = validSemester ? current?.error : 'Enter a valid semester';
  const rows = current?.rows ?? [];

  useEffect(() => {
    if (!validSemester) return;
    let active = true;
    void api.get<Transcript[]>(`/api/exam-cell/transcripts?semester=${sem}`)
      .then((data) => {
        if (!Array.isArray(data)) throw new Error('The server did not return a transcript list.');
        if (active) setResult({ api, key, rows: data, error: null });
      })
      .catch((e: unknown) => {
        if (active) setResult({ api, key, rows: [], error: e instanceof Error ? e.message : 'Could not load transcripts' });
      });
    return () => { active = false; requestScope.current += 1; };
  }, [api, key, sem, validSemester]);

  async function generate() {
    if (pending.current || !canGenerate || loading || error || !validSemester) return;
    pending.current = 'generate';
    setAction('generate');
    const scope = requestScope.current;
    try {
      const batch = await api.post<BatchResult>('/api/exam-cell/transcripts/generate', { semester: sem });
      if (scope !== requestScope.current) return;
      if (!Number.isInteger(batch.requested) || !Array.isArray(batch.transcript_ids)) {
        throw new Error('The transcript request returned an unexpected response. Refresh the list before retrying.');
      }
      toast.success(batch.requested === 0 ? 'No new transcripts were needed' : `${batch.requested} transcript${batch.requested === 1 ? '' : 's'} generated`);
      setRevision((value) => value + 1);
    } catch (e) {
      if (scope !== requestScope.current) return;
      toast.error(e instanceof Error ? e.message : 'Could not generate transcripts');
      // A failed batch can still have stored records; read its actual state.
      setRevision((value) => value + 1);
    } finally {
      pending.current = null;
      setAction(null);
    }
  }

  async function download(row: Transcript) {
    if (pending.current || loading || error || !row.pdf_url || row.downloadable === false) return;
    if (!token) { toast.error('Please sign in again to download your transcript.'); return; }
    const operation = `pdf:${row.transcript_id}` as const;
    pending.current = operation;
    setAction(operation);
    const scope = requestScope.current;
    try {
      if (/^https?:\/\//i.test(row.pdf_url)) {
        throw new Error('Official transcripts require protected storage. Contact the Examination Cell.');
      }
      const response = await fetch(`${getApiBaseUrl()}/api/uploads/download?path=${encodeURIComponent(row.pdf_url)}`, {
        headers: authHeaders(token), cache: 'no-store',
      });
      if (scope !== requestScope.current) return;
      if (!response.ok) throw new Error(`Could not download transcript (HTTP ${response.status}).`);
      const pdf = await response.blob();
      if (scope !== requestScope.current) return;
      if (!pdf.size || !pdf.type.toLowerCase().includes('application/pdf')) throw new Error('The server did not return a transcript PDF.');
      const url = URL.createObjectURL(pdf);
      try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `SGVU-Transcript-Semester-${row.semester}-${row.transcript_id.slice(0, 8)}.pdf`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } finally { URL.revokeObjectURL(url); }
      toast.success('Transcript PDF downloaded');
    } catch (e) {
      if (scope !== requestScope.current) return;
      toast.error(e instanceof Error ? e.message : 'Could not download transcript');
    } finally {
      pending.current = null;
      setAction(null);
    }
  }

  async function reissue() {
    if (!selected || !canGenerate || pending.current || loading || error || !reissueReason.trim()) return;
    pending.current = `reissue:${selected.transcript_id}`;
    setAction(pending.current);
    const scope = requestScope.current;
    try {
      const issued = await api.post<{ transcript_id: string; status: string; reissued: boolean }>(`/api/exam-cell/transcripts/${selected.transcript_id}/reissue`, { reason: reissueReason.trim() });
      if (scope !== requestScope.current) return;
      if (!issued.transcript_id || !['ARCHIVED', 'GENERATED'].includes(issued.status)) throw new Error('The transcript reissue returned an unexpected response. Refresh before retrying.');
      toast.success(issued.reissued ? 'New transcript revision issued; the previous copy is invalid' : 'The current transcript revision is already issued');
      setSelection(null); setReissueReason(''); setRevision((value) => value + 1);
    } catch (e) {
      if (scope !== requestScope.current) return;
      toast.error(e instanceof Error ? e.message : 'Could not reissue transcript');
      setRevision((value) => value + 1);
    } finally { pending.current = null; setAction(null); }
  }

  const columns: DataTableColumn<Transcript>[] = [
    { key: 'student', header: 'Student', render: (row) => <div><p className="font-semibold">{row.student_name}</p><p className="text-xs text-muted-foreground">{row.enrollment_no ?? '—'}</p></div> },
    { key: 'semester', header: 'Semester', render: (row) => row.semester },
    { key: 'status', header: 'Status', render: (row) => <div><Badge variant={row.downloadable === false ? 'warning' : row.status === 'ARCHIVED' ? 'success' : 'secondary'}>{row.status}</Badge><p className="mt-1 text-xs text-muted-foreground">Revision {row.revision ?? 1}</p>{row.revocation_reason && <p className="mt-1 text-xs text-muted-foreground">{row.revocation_reason}</p>}</div> },
    { key: 'generated', header: 'Generated', render: (row) => row.generated_at ? new Date(row.generated_at).toLocaleDateString('en-IN') : '—' },
    { key: 'pdf', header: 'Actions', render: (row) => <div className="flex flex-wrap gap-2">{row.pdf_url && row.downloadable !== false && ['GENERATED', 'ARCHIVED'].includes(row.status) ? (
      <Button size="sm" variant="outline" aria-label={`Download transcript PDF for ${row.student_name}`} disabled={action !== null || loading || !!error} onClick={() => void download(row)}>
        {action === `pdf:${row.transcript_id}` ? 'Preparing…' : 'Download PDF'}
      </Button>
    ) : <span className="text-muted-foreground">Unavailable</span>}
      {canGenerate && (row.needs_reissue || ['APPROVED', 'GENERATED', 'ARCHIVED'].includes(row.status)) && <Button size="sm" variant="outline" aria-label={`Reissue transcript for ${row.student_name}`} disabled={action !== null || loading || !!error || row.has_open_ufm} onClick={() => { setSelection({ api, semester, row }); setReissueReason(''); }}>Reissue</Button>}
    </div> },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm"><CardContent className="p-5 md:p-6">
        <ExamCellPageHeader pageId="transcripts" title="Degree & Transcript Generator" subtitle="Generate official transcripts and download stored copies." />
      </CardContent></Card>
      <Card className="border-sgvu-gold/20 bg-amber-50/30"><CardContent className="space-y-2 py-3 text-sm">
        <p><strong>How it works:</strong></p>
        <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>Choose a semester to review its stored official transcripts.</li>
          <li>Generation uses published examination results. Students blocked by open UFM cases are skipped.</li>
          <li>Issued PDF copies are available below. DigiLocker delivery requires a configured external integration.</li>
          <li>Changed results invalidate earlier copies. Authorized staff can issue a new revision; previous records remain in the audit history.</li>
        </ol>
      </CardContent></Card>
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardHeader><CardTitle className="text-base">Official transcripts</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1"><label htmlFor="transcript-semester" className="text-xs font-bold uppercase tracking-wide text-sgvu-navy/55">Semester</label>
              <Input id="transcript-semester" type="number" min={1} value={semester} onChange={(e) => setSemester(e.target.value)} disabled={action !== null} className="h-10 w-32" />
            </div>
            {canGenerate && <Button variant="outline" className={btnIdle} onClick={() => void generate()} disabled={action !== null || loading || !!error}>
              {action === 'generate' ? 'Generating…' : 'Generate transcripts'}
            </Button>}
            <Button variant="outline" onClick={() => setRevision((value) => value + 1)} disabled={action !== null || loading || !validSemester}>Refresh</Button>
          </div>
          {!canGenerate && <p className="text-sm text-muted-foreground">Read-only access: you can review and download issued transcripts.</p>}
          {loading ? <div role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading transcripts…</div> : error ? (
            <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button variant="outline" onClick={() => setRevision((value) => value + 1)} disabled={!validSemester}>Retry transcripts</Button></div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-10 text-center text-muted-foreground"><FileText className="h-8 w-8" /><p className="text-sm">No official transcripts for this semester.</p></div>
          ) : <DataTable columns={columns} rows={rows} rowKey={(row) => row.transcript_id} />}
        </CardContent>
      </Card>
      <Dialog open={!!selected} onOpenChange={(open) => { if (!open && !pending.current) setSelection(null); }}><DialogContent>
        <DialogHeader><DialogTitle>Reissue official transcript</DialogTitle><DialogDescription>Issue a new revision for {selected?.student_name}. Previous copies remain stored and cannot be used for verification or download.</DialogDescription></DialogHeader>
        <label htmlFor="transcript-reissue-reason" className="text-sm font-medium">Reason for reissue</label><Input id="transcript-reissue-reason" maxLength={500} value={reissueReason} disabled={action !== null} onChange={(event) => setReissueReason(event.target.value)} />
        <div className="flex justify-end gap-2"><Button variant="outline" disabled={action !== null} onClick={() => setSelection(null)}>Cancel</Button><Button disabled={action !== null || !reissueReason.trim() || loading || !!error} onClick={() => void reissue()}>{action?.startsWith('reissue:') ? 'Issuing…' : 'Issue new revision'}</Button></div>
      </DialogContent></Dialog>
    </div>
  );
}
