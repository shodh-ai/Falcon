'use client';

import { Select } from '@/components/ui/select';
import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';

type ReEval = {
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
  const [busy, setBusy] = useState(false);

  const selected = items.find((item) => item.exam_application_id === selectedId) ?? null;

  const load = useCallback(() => {
    void api.get<ReEval[]>('/api/exam-cell/re-evaluations').then((rows) => {
      setItems(rows);
      if (selectedId && !rows.some((r) => r.exam_application_id === selectedId)) {
        setSelectedId(rows[0]?.exam_application_id ?? null);
      }
    });
  }, [api, selectedId]);

  useEffect(() => {
    load();
    void api.get<Faculty[]>('/api/exam-cell/faculty-roster').then(setFaculty);
  }, [api, load]);

  async function assign() {
    if (!selected || !facultyId) {
      toast.error('Select a faculty member');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/api/exam-cell/re-evaluations/${selected.exam_application_id}/assign`, {
        faculty_user_id: facultyId,
      });
      toast.success('Faculty assigned for reassessment');
      setFacultyId('');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Assign failed');
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!selected) return;
    setBusy(true);
    try {
      await api.post(`/api/exam-cell/re-evaluations/${selected.exam_application_id}/publish`, {});
      toast.success('Report published to student and parent');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!selected) return;
    setBusy(true);
    try {
      await api.post(`/api/exam-cell/re-evaluations/${selected.exam_application_id}/reject`, {
        reason: rejectReason || undefined,
      });
      toast.success('Application rejected');
      setRejectReason('');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Reject failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div>
        <p className="text-sm font-semibold text-sgvu-gold">Falcon Exam OS</p>
        <h1 className="text-2xl font-bold text-sgvu-navy">Re-evaluations</h1>
        <p className="text-sm text-muted-foreground">
          Assign faculty after fee payment, review reassessment reports, then publish to students and parents.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{items.length} applications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No paid re-evaluation requests yet.</p>
            ) : (
              items.map((r) => (
                <button
                  key={r.exam_application_id}
                  type="button"
                  onClick={() => setSelectedId(r.exam_application_id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                    selectedId === r.exam_application_id ? 'border-sgvu-gold bg-sgvu-gold/5' : 'hover:bg-slate-50'
                  }`}
                >
                  <p className="font-semibold text-sgvu-navy">{r.student_name}</p>
                  <p className="text-muted-foreground">
                    {r.subject_code} · {r.subject_name}
                  </p>
                  <Badge className="mt-2" variant={statusVariant(r.status)}>
                    {r.status.replace('_', ' ')}
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
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{selected.subject_code}</Badge>
                <Badge variant={statusVariant(selected.status)}>{selected.status.replace('_', ' ')}</Badge>
                <Badge variant="outline">{selected.fee_status}</Badge>
              </div>
              <p>
                <strong>Subject:</strong> {selected.subject_name}
              </p>
              {selected.faculty_name ? (
                <p>
                  <strong>Assigned faculty:</strong> {selected.faculty_name}
                </p>
              ) : null}
              {selected.original_marks != null ? (
                <p>
                  <strong>Original marks:</strong> {selected.original_marks}
                </p>
              ) : null}
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

              {selected.status === 'PENDING' ? (
                <div className="space-y-2 rounded-lg border p-3">
                  <p className="font-medium">Assign faculty</p>
                  <Select
                    className="w-full rounded-md border px-3 py-2"
                    value={facultyId}
                    onChange={(e) => setFacultyId(e.target.value)}
                  >
                    <option value="">Select faculty</option>
                    {faculty.map((f) => (
                      <option key={f.user_id} value={f.user_id}>
                        {f.name}
                      </option>
                    ))}
                  </Select>
                  <Button disabled={busy} onClick={() => void assign()}>
                    Assign for reassessment
                  </Button>
                </div>
              ) : null}

              {selected.status === 'UNDER_REVIEW' ? (
                <div className="flex flex-wrap gap-2">
                  <Button disabled={busy} onClick={() => void publish()}>
                    Publish report to student & parent
                  </Button>
                </div>
              ) : null}

              {['PENDING', 'ASSIGNED', 'UNDER_REVIEW'].includes(selected.status) ? (
                <div className="space-y-2 rounded-lg border border-destructive/30 p-3">
                  <p className="font-medium text-destructive">Reject application</p>
                  <textarea
                    className="min-h-16 w-full rounded-md border px-3 py-2"
                    placeholder="Reason (optional)"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                  <Button variant="destructive" disabled={busy} onClick={() => void reject()}>
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
              Select an application to assign faculty or publish a report.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
