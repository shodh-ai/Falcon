'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';

type PendingMark = {
  mark_id: string;
  student_name: string;
  course_code: string;
  course_name: string;
  course_id: string;
  exam_type: string;
  marks_obtained: string;
  max_marks: string;
  percent: string;
};

type Distribution = {
  count: number;
  avg_marks: string;
  min_marks: string;
  max_marks: string;
  above_90pct: number;
  below_40pct: number;
};

type ResultSession = {
  session_id: string;
  course_id: string;
  course_code: string;
  course_name: string;
  exam_type: string;
  semester: number;
  max_marks: string | number;
  pass_marks: string | number | null;
  entry_status: 'CLOSED' | 'OPEN' | 'LOCKED';
  marks_locked: boolean;
  declared_at: string | null;
  processed_at: string | null;
  pending_coe_count: number;
  report_count: number;
  grading_policy_id: number | null;
  grading_policy_name?: string | null;
  declaration_note?: string | null;
  reopen_reason?: string | null;
};

type CourseOption = { course_id: string; course_code: string; course_name: string };
type PolicyOption = { policy_id: number; policy_name: string };
type PreviewRow = {
  student_name: string;
  marks_obtained: number;
  max_marks: number;
  percent: number;
  grade: string;
  result_status: string;
};

const EXAM_TYPES = ['INTERNAL', 'CAT1', 'CAT2', 'QUIZ', 'END_TERM', 'PRACTICAL'];

function statusBadge(status: string) {
  if (status === 'OPEN') return 'default';
  if (status === 'LOCKED') return 'secondary';
  return 'outline';
}

export default function ExamCellResultsPage() {
  const api = useAuthedApi();
  const [pending, setPending] = useState<PendingMark[]>([]);
  const [sessions, setSessions] = useState<ResultSession[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [policies, setPolicies] = useState<PolicyOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [createForm, setCreateForm] = useState({
    course_id: '',
    exam_type: 'INTERNAL',
    semester: '4',
    max_marks: '50',
    pass_marks: '20',
    grading_policy_id: '',
  });
  const [rulesForm, setRulesForm] = useState({ pass_marks: '', max_marks: '', grading_policy_id: '' });
  const [declareNote, setDeclareNote] = useState('');
  const [reopenReason, setReopenReason] = useState('');

  const selected = sessions.find((s) => s.session_id === selectedId) ?? null;

  const load = useCallback(async () => {
    const [pendingRows, sessionRows, courseRows, policyRows] = await Promise.all([
      api.get<PendingMark[]>('/api/exam-cell/results/pending'),
      api.get<ResultSession[]>('/api/exam-cell/result-control/sessions'),
      api.get<CourseOption[]>('/api/exam-cell/result-control/courses'),
      api.get<PolicyOption[]>('/api/exam-cell/result-control/grading-policies'),
    ]);
    setPending(pendingRows);
    setSessions(sessionRows);
    setCourses(courseRows);
    setPolicies(policyRows);
    if (selectedId && !sessionRows.some((s) => s.session_id === selectedId)) {
      setSelectedId(sessionRows[0]?.session_id ?? null);
    }
  }, [api, selectedId]);

  useEffect(() => {
    void load().catch(() => toast.error('Could not load result control data'));
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    setRulesForm({
      pass_marks: selected.pass_marks != null ? String(selected.pass_marks) : '',
      max_marks: String(selected.max_marks ?? ''),
      grading_policy_id: selected.grading_policy_id != null ? String(selected.grading_policy_id) : '',
    });
    setPreview(null);
  }, [selected?.session_id]);

  const pendingGroups = useMemo(() => {
    const map = new Map<string, { course_id: string; course_code: string; course_name: string; exam_type: string; rows: PendingMark[] }>();
    for (const row of pending) {
      const key = `${row.course_id}:${row.exam_type}`;
      if (!map.has(key)) {
        map.set(key, { course_id: row.course_id, course_code: row.course_code, course_name: row.course_name, exam_type: row.exam_type, rows: [] });
      }
      map.get(key)!.rows.push(row);
    }
    return [...map.values()];
  }, [pending]);

  async function createSession() {
    if (!createForm.course_id) {
      toast.error('Select a course');
      return;
    }
    setBusy(true);
    try {
      const created = await api.post<ResultSession>('/api/exam-cell/result-control/sessions', {
        course_id: createForm.course_id,
        exam_type: createForm.exam_type,
        semester: Number(createForm.semester),
        max_marks: Number(createForm.max_marks),
        pass_marks: Number(createForm.pass_marks),
        grading_policy_id: createForm.grading_policy_id ? Number(createForm.grading_policy_id) : undefined,
      });
      toast.success('Result session created');
      setSelectedId(created.session_id);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  async function runAction(path: string, success: string) {
    if (!selected) return;
    setBusy(true);
    try {
      await api.post(`/api/exam-cell/result-control/sessions/${selected.session_id}/${path}`, {});
      toast.success(success);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  async function saveRules() {
    if (!selected) return;
    setBusy(true);
    try {
      await api.post(`/api/exam-cell/result-control/sessions/${selected.session_id}/configure-rules`, {
        pass_marks: rulesForm.pass_marks ? Number(rulesForm.pass_marks) : undefined,
        max_marks: rulesForm.max_marks ? Number(rulesForm.max_marks) : undefined,
        grading_policy_id: rulesForm.grading_policy_id ? Number(rulesForm.grading_policy_id) : undefined,
      });
      toast.success('Grade rules saved');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function processSession() {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await api.post<{ preview: PreviewRow[] }>(
        `/api/exam-cell/result-control/sessions/${selected.session_id}/process`,
        {},
      );
      setPreview(res.preview ?? []);
      toast.success('Result preview generated');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Process failed');
    } finally {
      setBusy(false);
    }
  }

  async function declareResults() {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await api.post<{ declared: number }>(
        `/api/exam-cell/result-control/sessions/${selected.session_id}/declare`,
        { declaration_note: declareNote || undefined },
      );
      toast.success(`Declared results for ${res.declared} students`);
      setDeclareNote('');
      setPreview(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Declare failed');
    } finally {
      setBusy(false);
    }
  }

  async function reopenEntry() {
    if (!selected || !reopenReason.trim()) {
      toast.error('Enter a reopen reason');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/api/exam-cell/result-control/sessions/${selected.session_id}/reopen-entry`, {
        reason: reopenReason.trim(),
      });
      toast.success('Marks entry reopened for faculty');
      setReopenReason('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Reopen failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div>
        <p className="text-sm font-semibold text-sgvu-gold">Falcon Exam OS</p>
        <h1 className="text-2xl font-bold text-sgvu-navy">Result Control Centre</h1>
        <p className="text-sm text-muted-foreground">
          Open internal/practical marks entry, lock faculty submissions, apply grade rules, declare results, and publish individual exam reports.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Create result session</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <select className="rounded-md border px-3 py-2 text-sm md:col-span-2" value={createForm.course_id} onChange={(e) => setCreateForm({ ...createForm, course_id: e.target.value })}>
            <option value="">Select course</option>
            {courses.map((c) => (
              <option key={c.course_id} value={c.course_id}>{c.course_code} — {c.course_name}</option>
            ))}
          </select>
          <select className="rounded-md border px-3 py-2 text-sm" value={createForm.exam_type} onChange={(e) => setCreateForm({ ...createForm, exam_type: e.target.value })}>
            {EXAM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <Input placeholder="Semester" value={createForm.semester} onChange={(e) => setCreateForm({ ...createForm, semester: e.target.value })} />
          <Input placeholder="Max marks" value={createForm.max_marks} onChange={(e) => setCreateForm({ ...createForm, max_marks: e.target.value })} />
          <Input placeholder="Pass marks" value={createForm.pass_marks} onChange={(e) => setCreateForm({ ...createForm, pass_marks: e.target.value })} />
          <select className="rounded-md border px-3 py-2 text-sm md:col-span-2" value={createForm.grading_policy_id} onChange={(e) => setCreateForm({ ...createForm, grading_policy_id: e.target.value })}>
            <option value="">Default grading policy</option>
            {policies.map((p) => <option key={p.policy_id} value={p.policy_id}>{p.policy_name}</option>)}
          </select>
          <Button disabled={busy} onClick={() => void createSession()}>Create session</Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader><CardTitle className="text-base">{sessions.length} sessions</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No result sessions yet.</p>
            ) : (
              sessions.map((s) => (
                <button
                  key={s.session_id}
                  type="button"
                  onClick={() => setSelectedId(s.session_id)}
                  className={`w-full rounded-lg border p-3 text-left text-sm ${selectedId === s.session_id ? 'border-sgvu-gold bg-sgvu-gold/5' : 'hover:bg-slate-50'}`}
                >
                  <p className="font-semibold text-sgvu-navy">{s.course_code} · {s.exam_type}</p>
                  <p className="text-muted-foreground">{s.course_name}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant={statusBadge(s.entry_status)}>{s.entry_status}</Badge>
                    {s.declared_at ? <Badge variant="default">Declared</Badge> : null}
                    <Badge variant="outline">{s.pending_coe_count} pending</Badge>
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        {selected ? (
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>{selected.course_code} — {selected.exam_type}</CardTitle></CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge variant={statusBadge(selected.entry_status)}>Entry: {selected.entry_status}</Badge>
                  {selected.marks_locked ? <Badge variant="secondary">Marks locked</Badge> : null}
                  {selected.declared_at ? <Badge>Declared</Badge> : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={busy || !!selected.declared_at} onClick={() => void runAction('open-entry', 'Marks entry opened for faculty')}>Open entry</Button>
                  <Button size="sm" variant="outline" disabled={busy || !!selected.declared_at} onClick={() => void runAction('close-entry', 'Marks entry closed')}>Close entry</Button>
                  <Button size="sm" variant="outline" disabled={busy || !!selected.declared_at} onClick={() => void runAction('lock-marks', 'Marks locked')}>Lock marks</Button>
                </div>

                {!selected.declared_at ? (
                  <div className="space-y-2 rounded-lg border p-3">
                    <p className="font-medium">Reopen for faculty corrections</p>
                    <Input placeholder="Reason for reopening" value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} />
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void reopenEntry()}>Reopen entry</Button>
                  </div>
                ) : null}

                <div className="space-y-2 rounded-lg border p-3">
                  <p className="font-medium">Grade & class rules</p>
                  <div className="grid gap-2 md:grid-cols-3">
                    <Input placeholder="Pass marks" value={rulesForm.pass_marks} onChange={(e) => setRulesForm({ ...rulesForm, pass_marks: e.target.value })} />
                    <Input placeholder="Max marks" value={rulesForm.max_marks} onChange={(e) => setRulesForm({ ...rulesForm, max_marks: e.target.value })} />
                    <select className="rounded-md border px-3 py-2 text-sm" value={rulesForm.grading_policy_id} onChange={(e) => setRulesForm({ ...rulesForm, grading_policy_id: e.target.value })}>
                      <option value="">Default policy</option>
                      {policies.map((p) => <option key={p.policy_id} value={p.policy_id}>{p.policy_name}</option>)}
                    </select>
                  </div>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void saveRules()}>Save rules</Button>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={busy || !!selected.declared_at} onClick={() => void processSession()}>Process & preview</Button>
                  <Input className="max-w-md" placeholder="Declaration note to students" value={declareNote} onChange={(e) => setDeclareNote(e.target.value)} />
                  <Button size="sm" disabled={busy || !!selected.declared_at} onClick={() => void declareResults()}>Declare results</Button>
                </div>

                {preview?.length ? (
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="min-w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-3 py-2 text-left">Student</th>
                          <th className="px-3 py-2 text-right">Marks</th>
                          <th className="px-3 py-2 text-right">%</th>
                          <th className="px-3 py-2 text-right">Grade</th>
                          <th className="px-3 py-2 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((row) => (
                          <tr key={row.student_name} className="border-t">
                            <td className="px-3 py-1.5">{row.student_name}</td>
                            <td className="px-3 py-1.5 text-right">{row.marks_obtained}/{row.max_marks}</td>
                            <td className="px-3 py-1.5 text-right">{row.percent}%</td>
                            <td className="px-3 py-1.5 text-right">{row.grade}</td>
                            <td className="px-3 py-1.5 text-right">{row.result_status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">Select a session to manage entry, rules, and declaration.</CardContent></Card>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-bold text-sgvu-navy">Pending COE submissions</h2>
        {pendingGroups.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground">No marks awaiting COE approval.</CardContent></Card>
        ) : (
          pendingGroups.map((g) => (
            <CourseResultBlock key={`${g.course_id}-${g.exam_type}`} group={g} api={api} />
          ))
        )}
      </div>
    </div>
  );
}

function CourseResultBlock({
  group,
  api,
}: {
  group: { course_id: string; course_code: string; course_name: string; exam_type: string; rows: PendingMark[] };
  api: ReturnType<typeof useAuthedApi>;
}) {
  const [dist, setDist] = useState<Distribution | null>(null);

  useEffect(() => {
    void api
      .get<Distribution[]>(`/api/exam-cell/results/distribution?course_id=${group.course_id}&exam_type=${group.exam_type}`)
      .then((rows) => setDist(rows[0] ?? null));
  }, [api, group.course_id, group.exam_type]);

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-lg">{group.course_code} — {group.exam_type}</CardTitle>
        <p className="text-sm text-muted-foreground">{group.course_name} · {group.rows.length} students submitted</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {dist && (
          <div className="flex flex-wrap gap-3 text-sm">
            <Badge variant="outline">Avg: {dist.avg_marks}</Badge>
            <Badge variant="outline">Min–Max: {dist.min_marks}–{dist.max_marks}</Badge>
            <Badge variant="outline">≥90%: {dist.above_90pct}</Badge>
            <Badge variant="outline">&lt;40%: {dist.below_40pct}</Badge>
          </div>
        )}
        <div className="max-h-48 overflow-y-auto rounded-lg border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left">Student</th>
                <th className="px-3 py-2 text-right">Marks</th>
                <th className="px-3 py-2 text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((r) => (
                <tr key={r.mark_id} className="border-t">
                  <td className="px-3 py-1.5">{r.student_name}</td>
                  <td className="px-3 py-1.5 text-right">{r.marks_obtained}/{r.max_marks}</td>
                  <td className="px-3 py-1.5 text-right">{r.percent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
