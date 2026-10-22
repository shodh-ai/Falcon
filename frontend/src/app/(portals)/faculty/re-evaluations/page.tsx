'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';
import { FacultyPageHeader, FacultyPageShell } from '@/components/faculty';

type ReEvalCase = {
  exam_application_id: string;
  student_name: string;
  subject_name: string;
  subject_code: string;
  status: string;
  original_marks?: number | string | null;
  revised_marks?: number | string | null;
  report_notes?: string | null;
};

export default function FacultyReEvaluationsPage() {
  const api = useAuthedApi();
  const [cases, setCases] = useState<ReEvalCase[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [revisedMarks, setRevisedMarks] = useState('');
  const [reportNotes, setReportNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestGeneration = useRef(0);
  const mutationPending = useRef(false);

  const selected = cases.find((item) => item.exam_application_id === selectedId) ?? null;

  const load = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await api.get<ReEvalCase[]>('/api/academics/faculty/re-evaluations');
      if (generation !== requestGeneration.current) return;
      setCases(rows);
      setSelectedId((current) => rows.some((row) => row.exam_application_id === current) ? current : rows[0]?.exam_application_id ?? null);
    } catch (error) {
      if (generation !== requestGeneration.current) return;
      setCases([]);
      setSelectedId(null);
      const message = error instanceof Error ? error.message : 'Could not load re-evaluation assignments';
      setLoadError(message);
      toast.error(message);
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void Promise.resolve().then(load);
    return () => { requestGeneration.current += 1; };
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      setRevisedMarks(selected.revised_marks != null ? String(selected.revised_marks) : '');
      setReportNotes(selected.report_notes ?? '');
    });
    return () => { active = false; };
  }, [selected]);

  async function submitReport() {
    if (!selected || mutationPending.current) return;
    const marks = Number(revisedMarks);
    if (!revisedMarks.trim() || !Number.isFinite(marks) || marks < 0) {
      toast.error('Enter valid revised marks');
      return;
    }
    if (!reportNotes.trim()) {
      toast.error('Add reassessment notes');
      return;
    }
    mutationPending.current = true;
    setBusy(true);
    try {
      await api.post(`/api/academics/faculty/re-evaluations/${selected.exam_application_id}/report`, {
        revised_marks: marks,
        report_notes: reportNotes.trim(),
      });
      toast.success('Reassessment report submitted to Exam Cell');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      mutationPending.current = false;
      setBusy(false);
    }
  }

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="Re-evaluation"
        description="Cases assigned by Exam Cell. Submit your report for COE review and publishing."
        actions={<Button asChild variant="outline"><Link href="/faculty/backlog">Backlog & supplementary marks</Link></Button>}
      />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{cases.length} assigned cases</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? <p role="status" className="text-sm text-muted-foreground">Loading assignments…</p> : loadError ? (
              <div role="alert" className="space-y-2 text-sm text-destructive"><p>{loadError}</p><Button variant="outline" onClick={() => void load()}>Retry</Button></div>
            ) : cases.length === 0 ? (
              <p className="text-sm text-muted-foreground">No re-evaluation assignments yet.</p>
            ) : (
              cases.map((item) => (
                <button
                  key={item.exam_application_id}
                  type="button"
                  disabled={busy}
                  onClick={() => setSelectedId(item.exam_application_id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                    selectedId === item.exam_application_id ? 'border-sgvu-gold bg-sgvu-gold/5' : 'hover:bg-slate-50'
                  }`}
                >
                  <p className="font-semibold">{item.student_name}</p>
                  <p className="text-muted-foreground">
                    {item.subject_code} · {item.subject_name}
                  </p>
                  <Badge className="mt-2" variant="outline">
                    {item.status.replace('_', ' ')}
                  </Badge>
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
              <p>
                <strong>Subject:</strong> {selected.subject_name} ({selected.subject_code})
              </p>
              {selected.original_marks != null ? (
                <p>
                  <strong>Original marks:</strong> {selected.original_marks}
                </p>
              ) : null}

              {selected.status === 'ASSIGNED' ? (
                <div className="space-y-3 rounded-lg border p-4">
                  <p className="font-medium">Submit reassessment report</p>
                  <Input
                    aria-label="Revised marks"
                    type="number"
                    min={0}
                    placeholder="Revised marks"
                    value={revisedMarks}
                    onChange={(e) => setRevisedMarks(e.target.value)}
                  />
                  <textarea
                    aria-label="Reassessment report notes"
                    className="min-h-28 w-full rounded-md border px-3 py-2"
                    placeholder="Reassessment notes, observations, and justification"
                    value={reportNotes}
                    onChange={(e) => setReportNotes(e.target.value)}
                  />
                  <Button disabled={busy} onClick={() => void submitReport()}>
                    Submit report to Exam Cell
                  </Button>
                </div>
              ) : null}

              {selected.status === 'UNDER_REVIEW' ? (
                <p className="rounded-lg border bg-amber-50 p-3 text-amber-900">
                  Report submitted. Awaiting Exam Cell publish to student and parent.
                </p>
              ) : null}

              {selected.status === 'COMPLETED' && selected.report_notes ? (
                <div className="rounded-lg border bg-green-50 p-3">
                  <p className="font-medium text-green-900">Published report</p>
                  <p className="mt-1 text-green-900">
                    Revised marks: {selected.revised_marks ?? '—'}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-green-800">{selected.report_notes}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              Select a case to submit your reassessment report.
            </CardContent>
          </Card>
        )}
      </div>
    </FacultyPageShell>
  );
}
