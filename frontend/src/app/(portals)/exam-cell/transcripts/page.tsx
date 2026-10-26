'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { canExamCellAction } from '@/lib/exam-cell-rbac';

type Transcript = {
  transcript_id: string;
  student_user_id: string;
  student_name: string;
  enrollment_no: string | null;
  semester: number;
  status: 'GENERATED' | 'ARCHIVED';
  generated_at: string;
  approved_at: string | null;
  verification_code: string | null;
};
type BatchSummary = { semester: number; requested: number; transcript_ids: string[] };
const base = '/api/exam-cell/transcripts';

function readTranscripts(value: unknown, semester: number): Transcript[] {
  if (!Array.isArray(value) || value.some((row: unknown) => {
    if (!row || typeof row !== 'object') return true;
    const item = row as Partial<Transcript>;
    return typeof item.transcript_id !== 'string' || !item.transcript_id ||
      typeof item.student_user_id !== 'string' || !item.student_user_id ||
      typeof item.student_name !== 'string' || item.semester !== semester || typeof item.status !== 'string' ||
      (item.enrollment_no != null && typeof item.enrollment_no !== 'string') ||
      (item.verification_code != null && typeof item.verification_code !== 'string') ||
      (item.approved_at != null && (typeof item.approved_at !== 'string' || !Number.isFinite(Date.parse(item.approved_at))));
  })) throw new Error('Invalid transcript records');
  return (value as Transcript[]).filter(row => ['GENERATED', 'ARCHIVED'].includes(row.status) &&
    typeof row.generated_at === 'string' && Number.isFinite(Date.parse(row.generated_at)));
}

function readSummary(value: unknown, semester: number): BatchSummary {
  if (!value || typeof value !== 'object') throw new Error('Invalid generation response');
  const result = value as Partial<BatchSummary>;
  if (result.semester !== semester || !Number.isSafeInteger(result.requested) || result.requested! < 0 ||
    !Array.isArray(result.transcript_ids) || result.transcript_ids.some(id => typeof id !== 'string' || !id) ||
    result.transcript_ids.length !== result.requested) throw new Error('Invalid generation response');
  return result as BatchSummary;
}

const btnIdle =
  'h-10 border border-[#0B2447] bg-[#0B2447] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy disabled:opacity-60';
const btnBusy = 'h-10 border border-sgvu-gold bg-sgvu-gold px-5 text-sm font-semibold text-sgvu-navy';

export default function ExamCellTranscriptsPage() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const activeRole = user?.primaryRole ?? user?.role;
  const canGenerate = canExamCellAction(activeRole, 'publish_results');
  const scope = `${user?.user_id ?? ''}:${user?.tenant_id ?? ''}:${activeRole ?? ''}`;
  const [semester, setSemester] = useState('4');
  const semesterNumber = /^\d+$/.test(semester) ? Number(semester) : 0;
  const validSemester = Number.isSafeInteger(semesterNumber) && semesterNumber > 0;
  const [snapshot, setSnapshot] = useState<{
    api: typeof api; scope: string; semester: number; rows: Transcript[]; error: string | null;
  } | null>(null);
  const [operation, setOperation] = useState<{
    api: typeof api; scope: string; busy: boolean; summary: BatchSummary | null; error: string | null;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const requests = useRef(0);
  const generations = useRef(0);
  const inFlight = useRef(false);

  const load = useCallback((): Promise<boolean> => {
    const request = ++requests.current;
    if (!validSemester) return Promise.resolve(false);
    return api.get<unknown>(base + '?semester=' + semesterNumber)
      .then(data => {
        const rows = readTranscripts(data, semesterNumber);
        if (request !== requests.current) return false;
        setSnapshot({ api, scope, semester: semesterNumber, rows, error: null });
        return true;
      })
      .catch(() => {
        if (request === requests.current) setSnapshot({ api, scope, semester: semesterNumber, rows: [], error: 'Unable to load official transcripts. Please retry.' });
        return false;
      })
      .finally(() => { if (request === requests.current) setRefreshing(false); });
  }, [api, scope, semesterNumber, validSemester]);

  useEffect(() => {
    void load();
    return () => { requests.current += 1; generations.current += 1; inFlight.current = false; };
  }, [load]);

  const current = snapshot?.api === api && snapshot.scope === scope && snapshot.semester === semesterNumber ? snapshot : null;
  const currentOperation = operation?.api === api && operation.scope === scope ? operation : null;
  const busy = currentOperation?.busy ?? false;
  const summary = currentOperation?.summary ?? null;
  const generationError = currentOperation?.error ?? null;
  const loading = validSemester && (!current || refreshing);
  const rows = current?.rows ?? [];

  async function generate() {
    if (!canGenerate || inFlight.current) return;
    if (!validSemester) { toast.error('Enter a valid semester number.'); return; }
    const generation = ++generations.current;
    inFlight.current = true; setOperation({ api, scope, busy: true, summary: null, error: null });
    try {
      const result = readSummary(await api.post<unknown>(base + '/generate', { semester: semesterNumber }), semesterNumber);
      if (generation !== generations.current) return;
      setOperation({ api, scope, busy: true, summary: result, error: null }); setRefreshing(true);
      if (await load() && generation === generations.current) toast.success(result.requested ? `${result.requested} new transcript${result.requested === 1 ? '' : 's'} generated.` : 'No new transcripts were generated. Existing records have been refreshed.');
    } catch {
      if (generation !== generations.current) return;
      const message = 'Transcript generation did not complete. Refresh the list before retrying; some records may have been created.';
      setOperation({ api, scope, busy: true, summary: null, error: message }); toast.error(message);
    } finally {
      if (generation === generations.current) {
        inFlight.current = false;
        setOperation(previous => previous ? { ...previous, busy: false } : null);
      }
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <p className="text-sm font-semibold text-sgvu-gold">Falcon Exam OS</p>
          <h1 className="text-2xl font-bold text-sgvu-navy">Official Transcripts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate and review transcript records from officially declared examination results.
          </p>
        </CardContent>
      </Card>

      <Card className="border-sgvu-gold/20 bg-amber-50/30">
        <CardContent className="space-y-2 py-3 text-sm">
          <p><strong>How it works:</strong></p>
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>Choose a semester to review existing generated transcript records.</li>
            <li>Authorized officers can generate transcripts from <strong>officially declared</strong> results. Open UFM cases with an active marks lock are excluded.</li>
            <li>Generation skips students who already have a non-archived transcript for that semester.</li>
            <li>This register shows document status and verification details; it does not authorize degree issuance.</li>
          </ol>
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Generate batch transcripts</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="transcript-semester" className="text-xs font-bold uppercase tracking-wide text-sgvu-navy/55">Semester</label>
            <Input
              id="transcript-semester"
              value={semester}
              onChange={(e) => { setSemester(e.target.value); setOperation(null); }}
              disabled={busy}
              inputMode="numeric"
              aria-invalid={!validSemester}
              className="h-10 w-32 rounded-lg border-sgvu-navy/20 focus-visible:ring-sgvu-gold/40"
              placeholder="4"
            />
          </div>
          {canGenerate ? <Button
            variant="outline"
            className={busy ? btnBusy : btnIdle}
            onClick={() => void generate()}
            disabled={busy || loading || !validSemester}
          >
            {busy ? 'Generating…' : 'Generate transcripts'}
          </Button> : <p className="text-sm text-muted-foreground">Your role can view transcripts but cannot generate them.</p>}
          <Button variant="outline" className={btnIdle} disabled={busy || loading || !validSemester} onClick={() => { setRefreshing(true); void load(); }}>Refresh list</Button>
          {!validSemester ? <p className="text-sm text-red-700" role="alert">Enter a valid semester number.</p> : null}
        </CardContent>
      </Card>

      {generationError ? <p className="text-sm text-red-700" role="alert">{generationError}</p> : null}
      {summary ? <p className="text-sm text-muted-foreground" role="status">{summary.requested ? `${summary.requested} new transcript${summary.requested === 1 ? '' : 's'} generated for semester ${summary.semester}.` : 'No new transcripts generated. Existing transcripts are retained; students without eligible declared results are not included.'}</p> : null}
      {loading ? <p className="text-sm text-muted-foreground" role="status">Loading official transcripts…</p> : current?.error ? <Card className="border-red-200"><CardContent className="space-y-3 py-5"><p role="alert" className="text-sm text-red-700">{summary ? 'The generation request completed, but transcript records could not be loaded. Retry loading to view them.' : current.error}</p><Button variant="outline" onClick={() => { setRefreshing(true); void load(); }}>Retry loading transcripts</Button></CardContent></Card> : validSemester && rows.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <FileText className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No generated official transcripts are available for semester {semesterNumber}. Authorized officers can generate them when eligible officially declared results are available.
            </p>
          </CardContent>
        </Card>
      ) : rows.length ? (
        <>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="outline">{rows.length} transcript records</Badge>
            <Badge className="bg-emerald-100 text-emerald-800">{rows.filter(row => row.status === 'GENERATED').length} generated</Badge>
            {rows.some(row => row.status === 'ARCHIVED') ? <Badge variant="secondary">{rows.filter(row => row.status === 'ARCHIVED').length} archived</Badge> : null}
          </div>
          {rows.length === 500 ? <p className="text-xs text-muted-foreground">Showing the latest 500 transcript records for this semester.</p> : null}
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.transcript_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-2 text-sm">
                <div>
                  <p className="font-semibold">{r.student_name}</p>
                  <p className="text-muted-foreground">{r.enrollment_no ?? 'Enrollment number unavailable'} · Semester {r.semester}</p>
                  <p className="text-xs text-muted-foreground">Generated {new Date(r.generated_at).toLocaleString()} · Approved {r.approved_at ? new Date(r.approved_at).toLocaleString() : 'Unavailable'}</p>
                  <p className="text-xs text-muted-foreground">Verification: {r.verification_code ?? 'Unavailable'}</p>
                </div>
                <Badge variant={r.status === 'GENERATED' ? 'default' : 'secondary'}>
                  {r.status === 'GENERATED' ? 'Generated' : 'Archived'}
                </Badge>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
