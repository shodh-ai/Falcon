'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';

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

  const selected = cases.find((item) => item.exam_application_id === selectedId) ?? null;

  const load = useCallback(() => {
    void api.get<ReEvalCase[]>('/api/academics/faculty/re-evaluations').then((rows) => {
      setCases(rows);
      if (selectedId && !rows.some((r) => r.exam_application_id === selectedId)) {
        setSelectedId(rows[0]?.exam_application_id ?? null);
      }
    });
  }, [api, selectedId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    setRevisedMarks(selected.revised_marks != null ? String(selected.revised_marks) : '');
    setReportNotes(selected.report_notes ?? '');
  }, [selected?.exam_application_id]);

  async function submitReport() {
    if (!selected) return;
    const marks = Number(revisedMarks);
    if (!Number.isFinite(marks) || marks < 0) {
      toast.error('Enter valid revised marks');
      return;
    }
    if (!reportNotes.trim()) {
      toast.error('Add reassessment notes');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/api/academics/faculty/re-evaluations/${selected.exam_application_id}/report`, {
        revised_marks: marks,
        report_notes: reportNotes.trim(),
      });
      toast.success('Reassessment report submitted to Exam Cell');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <p className="text-sm font-semibold text-sgvu-gold">Faculty Workspace</p>
        <h1 className="text-2xl font-bold text-sgvu-navy">Re-evaluation Reassessment</h1>
        <p className="text-sm text-muted-foreground">
          Cases assigned by Exam Cell. Submit your report for COE review and publishing.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{cases.length} assigned cases</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {cases.length === 0 ? (
              <p className="text-sm text-muted-foreground">No re-evaluation assignments yet.</p>
            ) : (
              cases.map((item) => (
                <button
                  key={item.exam_application_id}
                  type="button"
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
                    type="number"
                    min={0}
                    placeholder="Revised marks"
                    value={revisedMarks}
                    onChange={(e) => setRevisedMarks(e.target.value)}
                  />
                  <textarea
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
    </div>
  );
}
