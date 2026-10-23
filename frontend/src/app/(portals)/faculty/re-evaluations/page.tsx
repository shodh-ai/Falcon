'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';
import { FacultyPageHeader, FacultyPageShell } from '@/components/faculty';
import {
  isEmptyArray,
  isFacultyDemoSmokeId,
  withFacultyDemoFallback,
} from '@/lib/faculty-demo-mode';
import { facultyDemoReEvaluations } from '@/lib/mock/faculty-portal-demo';
import { reevaluationMaximum, type ExamResultLink } from '@/lib/api/api.exams';
import { isReadOnlySeededReEvaluation } from '@/lib/exams/seeded-re-evaluation-demo';
import { ReEvaluationDemoNotice } from '@/components/exam-cell/ReEvaluationDemoNotice';
import { ReEvaluationQaPanel } from '@/components/exam-cell/ReEvaluationQaPanel';

type ReEvalCase = ExamResultLink & {
  exam_application_id: string;
  student_name: string;
  subject_name: string;
  subject_code: string;
  status: string;
  original_marks?: number | string | null;
  revised_marks?: number | string | null;
  report_notes?: string | null;
};

type ReportDraft = { revisedMarks: string; reportNotes: string };

export default function FacultyReEvaluationsPage() {
  const api = useAuthedApi();
  const [cases, setCases] = useState<ReEvalCase[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ReportDraft>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadRequest = useRef(0);
  const submitting = useRef(false);
  const mounted = useRef(false);
  const activeApi = useRef(api);
  const [loadedApi, setLoadedApi] = useState(() => api);

  const selected = cases.find((item) => item.exam_application_id === selectedId) ?? null;
  const selectedDemo = isReadOnlySeededReEvaluation(selected);
  const draft = selected ? drafts[selected.exam_application_id] ?? {
    revisedMarks: selected.revised_marks != null ? String(selected.revised_marks) : '',
    reportNotes: selected.report_notes ?? '',
  } : { revisedMarks: '', reportNotes: '' };
  const { revisedMarks, reportNotes } = draft;
  const unavailable = loading || Boolean(loadError) || busy || loadedApi !== api;
  const examMaximum = selected ? reevaluationMaximum(selected) : null;
  const examBlockedMessage = selected?.exam_link_message || 'Exam Cell must link this application to a specific exam result with a valid maximum mark before reassessment can be submitted.';

  function updateDraft(change: Partial<ReportDraft>) {
    if (!selected || selectedDemo || unavailable || selected.status !== 'ASSIGNED') return;
    setDrafts((current) => ({
      ...current,
      [selected.exam_application_id]: { ...draft, ...change },
    }));
  }

  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await api.get<ReEvalCase[]>('/api/academics/faculty/re-evaluations');
      if (!Array.isArray(rows)) throw new Error('Could not read re-evaluation assignments');
      if (!mounted.current || requestId !== loadRequest.current) return;
      const resolved = withFacultyDemoFallback(rows, facultyDemoReEvaluations() as ReEvalCase[], isEmptyArray);
      setLoadedApi(api);
      setCases(resolved);
      setSelectedId((current) => resolved.some((row) => row.exam_application_id === current)
        ? current : resolved[0]?.exam_application_id ?? null);
    } catch (error) {
      if (!mounted.current || requestId !== loadRequest.current) return;
      const demo = withFacultyDemoFallback([], facultyDemoReEvaluations() as ReEvalCase[], isEmptyArray);
      if (demo.length) {
        setLoadedApi(api);
        setCases(demo);
        setSelectedId((current) => demo.some((row) => row.exam_application_id === current)
          ? current : demo[0]?.exam_application_id ?? null);
      } else {
        setLoadError(error instanceof Error ? error.message : 'Could not load re-evaluation assignments');
      }
    } finally {
      if (mounted.current && requestId === loadRequest.current) setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    mounted.current = true;
    activeApi.current = api;
    submitting.current = false;
    // Clear the previous account's reassessment drafts before loading its replacement queue.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBusy(false);
    setCases([]);
    setSelectedId(null);
    setDrafts({});
    void load();
    return () => { mounted.current = false; loadRequest.current += 1; };
  }, [api, load]);

  async function submitReport() {
    if (!selected || selectedDemo || unavailable || submitting.current || selected.status !== 'ASSIGNED' || examMaximum === null) return;
    const marks = Number(revisedMarks);
    if (!revisedMarks.trim() || !Number.isFinite(marks) || marks < 0) {
      toast.error('Enter valid revised marks');
      return;
    }
    if (marks > 9999.99 || marks !== Number(marks.toFixed(2))) {
      toast.error('Enter revised marks up to 9999.99 with at most 2 decimal places');
      return;
    }
    if (marks > examMaximum) {
      toast.error(`Revised marks cannot exceed the exam maximum of ${examMaximum}`);
      return;
    }
    const notes = reportNotes.trim();
    if (!notes) {
      toast.error('Add reassessment notes');
      return;
    }
    if (notes.length > 2000) {
      toast.error('Keep reassessment notes within 2000 characters');
      return;
    }
    const applicationId = selected.exam_application_id;
    const isDemo = isFacultyDemoSmokeId(applicationId);
    submitting.current = true;
    setBusy(true);
    try {
      if (!isDemo) {
        await api.post(`/api/academics/faculty/re-evaluations/${applicationId}/report`, {
          revised_marks: marks,
          report_notes: notes,
        });
      }
      if (!mounted.current || activeApi.current !== api) return;
      setCases((prev) =>
        prev.map((c) =>
          c.exam_application_id === applicationId
            ? {
                ...c,
                revised_marks: marks,
                report_notes: notes,
                status: 'UNDER_REVIEW',
              }
            : c,
        ),
      );
      setDrafts((current) => {
        const next = { ...current };
        delete next[applicationId];
        return next;
      });
      toast.success(`Reassessment report submitted to Exam Cell${isDemo ? ' (demo)' : ''}`);
      if (!isDemo) await load();
    } catch (e) {
      if (mounted.current && activeApi.current === api) toast.error(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      if (activeApi.current === api) {
        submitting.current = false;
        if (mounted.current) setBusy(false);
      }
    }
  }

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="Re-evaluation"
        description="Cases assigned by Exam Cell. Submit your report for COE review and publishing."
      />

      {loadError ? (
        <div role="alert" className="space-y-2 rounded-lg border border-destructive/30 p-3 text-sm">
          <p className="text-destructive">{loadError}</p>
          <Button variant="outline" disabled={busy || loading} onClick={() => void load()}>Retry</Button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {loading || (loadError && cases.length === 0) ? 'Assigned cases' : `${cases.length} assigned cases`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? <p role="status" className="text-sm text-muted-foreground">Loading re-evaluation assignments…</p> : null}
            {!loading && !loadError && cases.length === 0 ? (
              <p className="text-sm text-muted-foreground">No re-evaluation assignments yet.</p>
            ) : null}
            {cases.length > 0 ? (
              cases.map((item) => (
                <button
                  key={item.exam_application_id}
                  type="button"
                  disabled={unavailable}
                  aria-pressed={selectedId === item.exam_application_id}
                  onClick={() => setSelectedId(item.exam_application_id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                    selectedId === item.exam_application_id ? 'border-sgvu-gold bg-sgvu-gold/5' : 'hover:bg-slate-50'
                  }`}
                >
                  <p className="font-semibold">{item.student_name}</p>
                  <p className="text-muted-foreground">
                    {item.subject_code} · {item.subject_name}
                  </p>
                  <p className="text-xs text-muted-foreground">{item.exam_session ?? (reevaluationMaximum(item) !== null ? 'Published exam result' : 'Exam not linked')}{item.exam_type ? ` · ${item.exam_type.replaceAll('_', ' ')}` : ''}</p>
                  <Badge className="mt-2" variant="outline">
                    {item.status.replaceAll('_', ' ')}
                  </Badge>
                  {isReadOnlySeededReEvaluation(item) ? <Badge className="ml-2 mt-2" variant="outline">Demo · read only</Badge> : null}
                </button>
              ))
            ) : null}
          </CardContent>
        </Card>

        {selected ? (
          <Card>
            <CardHeader>
              <CardTitle>{selected.student_name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {selectedDemo ? <ReEvaluationDemoNotice /> : null}
              {selectedDemo ? <ReEvaluationQaPanel key={selected.exam_application_id} applicationId={selected.exam_application_id} audience="faculty" /> : null}
              <p>
                <strong>Subject:</strong> {selected.subject_name} ({selected.subject_code})
              </p>
              <p><strong>Original marks:</strong> {selected.original_marks ?? 'Not recorded'}</p>
              <p><strong>Exam:</strong> {selected.exam_session ?? (examMaximum !== null ? 'Published exam result' : 'Not linked')}{selected.exam_type ? ` · ${selected.exam_type.replaceAll('_', ' ')}` : ''}</p>
              <p><strong>Maximum marks:</strong> {examMaximum ?? 'Unavailable'}</p>
              {!selectedDemo && examMaximum === null ? <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">{examBlockedMessage}</p> : null}

              {!selectedDemo && selected.status === 'ASSIGNED' ? (
                <div className="space-y-3 rounded-lg border p-4">
                  <p className="font-medium">Submit reassessment report</p>
                  <p className="text-xs text-muted-foreground">
                    {examMaximum === null
                      ? 'Exam Cell must link the published exam result before you can submit this report.'
                      : `Enter revised marks between 0 and ${examMaximum}. Exam Cell reviews your report before publication.`}
                  </p>
                  <label htmlFor="re-evaluation-marks" className="block font-medium">Revised marks</label>
                  <Input
                    id="re-evaluation-marks"
                    type="number"
                    min={0}
                    max={examMaximum ?? undefined}
                    step="0.01"
                    disabled={unavailable || examMaximum === null}
                    placeholder="Revised marks"
                    value={revisedMarks}
                    onChange={(e) => updateDraft({ revisedMarks: e.target.value })}
                  />
                  <label htmlFor="re-evaluation-notes" className="block font-medium">Reassessment notes</label>
                  <textarea
                    id="re-evaluation-notes"
                    className="min-h-28 w-full rounded-md border px-3 py-2"
                    placeholder="Reassessment notes, observations, and justification"
                    value={reportNotes}
                    maxLength={2000}
                    disabled={unavailable}
                    onChange={(e) => updateDraft({ reportNotes: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">{reportNotes.length}/2000 characters</p>
                  <Button disabled={unavailable || examMaximum === null} onClick={() => void submitReport()}>
                    {busy ? 'Submitting report…' : 'Submit report to Exam Cell'}
                  </Button>
                </div>
              ) : null}

              {selected.status === 'UNDER_REVIEW' ? (
                <div className="space-y-2 rounded-lg border bg-amber-50 p-3 text-amber-900">
                  <p className="font-medium">{selectedDemo ? 'Saved demo report' : 'Submitted report'}</p>
                  <p>{selectedDemo ? 'Shown for reference only. This demo report is not awaiting official publication.' : 'Report submitted. Awaiting Exam Cell publish to student and parent.'}</p>
                  <p>Revised marks: {selected.revised_marks ?? 'Not recorded'}</p>
                  {selected.report_notes ? <p className="whitespace-pre-wrap">{selected.report_notes}</p> : null}
                </div>
              ) : null}

              {selected.status === 'COMPLETED' ? (
                <div className="rounded-lg border bg-green-50 p-3">
                  <p className="font-medium text-green-900">Published report</p>
                  <p className="mt-1 text-green-900">
                    Revised marks: {selected.revised_marks ?? 'Not recorded'}
                  </p>
                  {selected.report_notes ? <p className="mt-2 whitespace-pre-wrap text-green-800">{selected.report_notes}</p> : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              {loading ? 'Please wait while your assignments load.' : loadError
                ? 'Assignments are unavailable. Use Retry to reload.' : cases.length === 0
                  ? 'Exam Cell will assign re-evaluation cases here.'
                  : 'Select a case to submit your reassessment report.'}
            </CardContent>
          </Card>
        )}
      </div>
    </FacultyPageShell>
  );
}
