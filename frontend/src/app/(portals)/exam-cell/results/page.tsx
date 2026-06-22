'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronRight, Lock, Eye, Send, type LucideIcon } from 'lucide-react';
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
  session_id?: string | null;
  semester: number | null;
  faculty_name: string | null;
  status?: string;
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

type PendingGroup = {
  course_id: string;
  course_code: string;
  course_name: string;
  exam_type: string;
  session_id: string | null;
  rows: PendingMark[];
};

const EXAM_TYPES = ['INTERNAL', 'CAT1', 'CAT2', 'END_TERM', 'PRACTICAL'];

type WorkflowStep = 'review' | 'lock' | 'declare' | 'preview' | 'done';

const WORKFLOW_STEPS: { key: WorkflowStep; label: string; icon: LucideIcon }[] = [
  { key: 'review', label: 'Review Pending', icon: Eye },
  { key: 'lock', label: 'Lock Submissions', icon: Lock },
  { key: 'declare', label: 'Apply Rules', icon: Send },
  { key: 'preview', label: 'Preview & Publish', icon: Eye },
  { key: 'done', label: 'Results Declared', icon: CheckCircle2 },
];
function statusBadge(status: string) {
  if (status === 'OPEN') return 'default';
  if (status === 'LOCKED') return 'secondary';
  return 'outline';
}

function deriveWorkflowStep(session: ResultSession | null, preview: PreviewRow[] | null): WorkflowStep {
  if (!session) return 'review';
  if (session.declared_at) return 'done';
  if (preview?.length) return 'declare';
  if (session.marks_locked || session.entry_status === 'LOCKED') return 'preview';
  if (session.pending_coe_count > 0) return 'lock';
  return 'review';
}

function stepIndex(step: WorkflowStep) {
  if (step === 'done') return WORKFLOW_STEPS.length;
  return WORKFLOW_STEPS.findIndex((s) => s.key === step);
}

export default function ExamCellResultsPage() {
  const api = useAuthedApi();
  const workflowRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<PendingMark[]>([]);
  const [sessions, setSessions] = useState<ResultSession[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [policies, setPolicies] = useState<PolicyOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [showSetup, setShowSetup] = useState(true);
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
  const workflowStep = deriveWorkflowStep(selected, preview);
  const activeStepIdx = stepIndex(workflowStep);

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
    const map = new Map<string, PendingGroup>();
    for (const row of pending) {
      const key = `${row.course_id}:${row.exam_type}`;
      if (!map.has(key)) {
        map.set(key, {
          course_id: row.course_id,
          course_code: row.course_code,
          course_name: row.course_name,
          exam_type: row.exam_type,
          session_id: row.session_id ?? null,
          rows: [],
        });
      }
      map.get(key)!.rows.push(row);
    }
    return [...map.values()];
  }, [pending]);

  const selectedPendingRows = useMemo(() => {
    if (!selected) return [];
    return pending.filter(
      (r) => r.course_id === selected.course_id && r.exam_type === selected.exam_type,
    );
  }, [pending, selected]);

  function scrollToWorkflow() {
    workflowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function findSession(courseId: string, examType: string) {
    return sessions.find((s) => s.course_id === courseId && s.exam_type === examType) ?? null;
  }

  async function ensureSession(group: PendingGroup): Promise<string> {
    const existing = findSession(group.course_id, group.exam_type);
    if (existing) return existing.session_id;

    const maxMarks = Number(group.rows[0]?.max_marks ?? 50);
    const created = await api.post<ResultSession>('/api/exam-cell/result-control/sessions', {
      course_id: group.course_id,
      exam_type: group.exam_type,
      semester: 4,
      max_marks: maxMarks,
      pass_marks: Math.round(maxMarks * 0.4),
    });
    return created.session_id;
  }

  async function startDeclaration(group: PendingGroup) {
    setBusy(true);
    try {
      const sessionId = group.session_id ?? (await ensureSession(group));
      setSelectedId(sessionId);
      await load();
      scrollToWorkflow();
      toast.success(`Ready to declare ${group.course_code} · ${group.exam_type}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not start declaration');
    } finally {
      setBusy(false);
    }
  }

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
      toast.success('Result session created — open entry when faculty should enter marks');
      setSelectedId(created.session_id);
      setShowSetup(true);
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

  async function lockSubmissions() {
    if (!selected) return;
    setBusy(true);
    try {
      await api.post(
        `/api/exam-cell/result-control/sessions/${selected.session_id}/prepare-declaration`,
        {},
      );
      toast.success('Submissions locked — preview grades next');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lock failed');
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
      toast.success('Grade preview ready — declare when satisfied');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setBusy(false);
    }
  }

  async function declareResults() {
    if (!selected) return;
    if (!preview?.length) {
      toast.error('Preview grades before declaring');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ declared: number }>(
        `/api/exam-cell/result-control/sessions/${selected.session_id}/declare`,
        { declaration_note: declareNote || undefined },
      );
      toast.success(`Declared and published results for ${res.declared} students`);
      setDeclareNote('');
      setPreview(null);
      setSelectedId(null);
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
      setPreview(null);
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
          Review faculty submissions, lock marks, preview grades, and declare results to students.
        </p>
      </div>

      {/* Session setup — create sessions and open faculty entry */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Create result session</CardTitle>
            <p className="text-sm text-muted-foreground">
              Create sessions and open marks entry before faculty can submit.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowSetup((v) => !v)}>
            {showSetup ? 'Hide' : 'Show'}
          </Button>
        </CardHeader>
        {showSetup ? (
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
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
            </div>

            <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
              <div className="space-y-2">
                <p className="text-sm font-medium text-sgvu-navy">{sessions.length} sessions</p>
                {sessions.map((s) => (
                  <button
                    key={s.session_id}
                    type="button"
                    onClick={() => {
                      setSelectedId(s.session_id);
                      scrollToWorkflow();
                    }}
                    className={`w-full rounded-lg border p-3 text-left text-sm ${selectedId === s.session_id ? 'border-sgvu-gold bg-sgvu-gold/5' : 'hover:bg-slate-50'}`}
                  >
                    <p className="font-semibold text-sgvu-navy">{s.course_code} · {s.exam_type}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant={statusBadge(s.entry_status)}>{s.entry_status}</Badge>
                      {s.declared_at ? <Badge variant="default">Declared</Badge> : null}
                      {s.pending_coe_count > 0 ? <Badge variant="outline">{s.pending_coe_count} pending</Badge> : null}
                    </div>
                  </button>
                ))}
              </div>

              {selected ? (
                <div className="space-y-3 rounded-lg border p-4 text-sm">
                  <p className="font-medium">Faculty entry window</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={busy || !!selected.declared_at} onClick={() => void runAction('open-entry', 'Marks entry opened for faculty')}>
                      Open entry
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy || !!selected.declared_at} onClick={() => void runAction('close-entry', 'Marks entry closed')}>
                      Close entry
                    </Button>
                  </div>
                  {!selected.declared_at ? (
                    <div className="space-y-2 border-t pt-3">
                      <p className="font-medium">Reopen for corrections</p>
                      <Input placeholder="Reason for reopening" value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} />
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => void reopenEntry()}>
                        Reopen entry
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </CardContent>
        ) : null}
      </Card>

      {/* Actionable pending queue */}
      <div>
        <h2 className="mb-1 text-lg font-bold text-sgvu-navy">Awaiting declaration</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Faculty submissions ready for Exam Cell review. Start declaration to walk through lock → preview → publish.
        </p>
        {pendingGroups.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-600" />
              No marks awaiting declaration.
            </CardContent>
          </Card>
        ) : (
          pendingGroups.map((g) => (
            <PendingDeclarationCard
              key={`${g.course_id}-${g.exam_type}`}
              group={g}
              session={findSession(g.course_id, g.exam_type)}
              busy={busy}
              onStart={() => void startDeclaration(g)}
            />
          ))
        )}
      </div>

      {/* Guided declaration workflow */}
      <div ref={workflowRef}>
        {selected && !selected.declared_at ? (
          <Card className="border-sgvu-gold/40">
            <CardHeader>
              <CardTitle>
                Declare results — {selected.course_code} · {selected.exam_type}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{selected.course_name}</p>
            </CardHeader>
            <CardContent className="space-y-6">
              <WorkflowStepper currentIdx={activeStepIdx} />

              {/* Review */}
              <WorkflowSection
                step={0}
                currentIdx={activeStepIdx}
                title="Review submissions"
                description="Check marks and distribution before locking. Send back to faculty via reopen if corrections are needed."
              >
                {selectedPendingRows.length > 0 ? (
                  <PendingMarksTable rows={selectedPendingRows} api={api} courseId={selected.course_id} examType={selected.exam_type} />
                ) : (
                  <p className="text-sm text-muted-foreground">No pending marks for this session.</p>
                )}
                {!selected.marks_locked && selected.pending_coe_count > 0 ? (
                  <div className="mt-4 flex justify-end">
                    <Button disabled={busy} onClick={() => void lockSubmissions()}>
                      <Lock className="mr-2 h-4 w-4" />
                      Lock submissions
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
              </WorkflowSection>

              {/* Preview */}
              <WorkflowSection
                step={2}
                currentIdx={activeStepIdx}
                title="Preview grades"
                description="Apply grading policy and pass marks. Confirm letter grades before publishing to students."
              >
                <div className="mb-3 grid gap-2 md:grid-cols-3">
                  <Input placeholder="Pass marks" value={rulesForm.pass_marks} onChange={(e) => setRulesForm({ ...rulesForm, pass_marks: e.target.value })} />
                  <Input placeholder="Max marks" value={rulesForm.max_marks} onChange={(e) => setRulesForm({ ...rulesForm, max_marks: e.target.value })} />
                  <select className="rounded-md border px-3 py-2 text-sm" value={rulesForm.grading_policy_id} onChange={(e) => setRulesForm({ ...rulesForm, grading_policy_id: e.target.value })}>
                    <option value="">Default policy</option>
                    {policies.map((p) => (
                      <option key={p.policy_id} value={p.policy_id}>{p.policy_name}</option>
                    ))}
                  </select>
                </div>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void saveRules()}>
                  Save grade rules
                </Button>

                {(selected.marks_locked || selected.entry_status === 'LOCKED') && !preview?.length ? (
                  <div className="mt-4 flex justify-end">
                    <Button disabled={busy} onClick={() => void processSession()}>
                      <Eye className="mr-2 h-4 w-4" />
                      Preview grades
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                ) : null}

                {preview?.length ? (
                  <div className="mt-4 overflow-x-auto rounded-lg border">
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
                            <td className="px-3 py-1.5 text-right font-medium">{row.grade}</td>
                            <td className="px-3 py-1.5 text-right">{row.result_status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </WorkflowSection>

              {/* Declare */}
              <WorkflowSection
                step={3}
                currentIdx={activeStepIdx}
                title="Declare & publish to students"
                description="This publishes marks, creates student exam reports, and sends notifications. This step cannot be undone without reopening."
              >
                <Input
                  className="max-w-lg"
                  placeholder="Optional note to students"
                  value={declareNote}
                  onChange={(e) => setDeclareNote(e.target.value)}
                />
                <div className="mt-4 flex justify-end">
                  <Button disabled={busy || !preview?.length} onClick={() => void declareResults()}>
                    <Send className="mr-2 h-4 w-4" />
                    Declare results
                  </Button>
                </div>
              </WorkflowSection>
            </CardContent>
          </Card>
        ) : selected?.declared_at ? (
          <Card>
            <CardContent className="flex items-center gap-3 py-8">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              <div>
                <p className="font-semibold text-sgvu-navy">
                  {selected.course_code} · {selected.exam_type} — declared
                </p>
                <p className="text-sm text-muted-foreground">
                  Results published to students. Select another item from the queue above.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Select <strong>Start declaration</strong> on a pending submission above to begin the workflow.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function WorkflowStepper({ currentIdx }: { currentIdx: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {WORKFLOW_STEPS.map((step, idx) => {
        const Icon = step.icon;
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        return (
          <div key={step.key} className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${done
                  ? 'bg-emerald-100 text-emerald-800'
                  : active
                    ? 'bg-sgvu-gold/20 text-sgvu-navy ring-1 ring-sgvu-gold/50'
                    : 'bg-muted text-muted-foreground'
                }`}
            >
              {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
              {step.label}
            </div>
            {idx < WORKFLOW_STEPS.length - 1 ? (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function WorkflowSection({
  step,
  currentIdx,
  title,
  description,
  children,
}: {
  step: number;
  currentIdx: number;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const isPast = step < currentIdx;
  const isActive = step <= currentIdx;
  if (!isActive && step > currentIdx + 1) return null;

  return (
    <div className={`rounded-lg border p-4 ${step === currentIdx ? 'border-sgvu-gold/50 bg-sgvu-gold/5' : isPast ? 'opacity-80' : 'opacity-50'}`}>
      <p className="font-semibold text-sgvu-navy">{title}</p>
      <p className="mb-3 text-xs text-muted-foreground">{description}</p>
      {children}
    </div>
  );
}

function PendingDeclarationCard({
  group,
  session,
  busy,
  onStart,
}: {
  group: PendingGroup;
  session: ResultSession | null;
  busy: boolean;
  onStart: () => void;
}) {
  const api = useAuthedApi();
  const [dist, setDist] = useState<Distribution | null>(null);

  useEffect(() => {
    void api
      .get<Distribution[]>(`/api/exam-cell/results/distribution?course_id=${group.course_id}&exam_type=${group.exam_type}`)
      .then((rows) => setDist(rows[0] ?? null));
  }, [api, group.course_id, group.exam_type]);

  return (
    <Card className="mb-4">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-lg">{group.course_code} — {group.exam_type}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {group.course_name} · {group.rows.length} students submitted
          </p>
          {session ? (
            <Badge className="mt-2" variant={statusBadge(session.entry_status)}>{session.entry_status}</Badge>
          ) : (
            <Badge className="mt-2" variant="outline">No session — will create on start</Badge>
          )}
        </div>
        <Button disabled={busy} onClick={onStart}>
          Start declaration
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {dist ? (
          <div className="flex flex-wrap gap-3 text-sm">
            <Badge variant="outline">Avg: {dist.avg_marks}</Badge>
            <Badge variant="outline">Min–Max: {dist.min_marks}–{dist.max_marks}</Badge>
            <Badge variant="outline">≥90%: {dist.above_90pct}</Badge>
            <Badge variant="outline">&lt;40%: {dist.below_40pct}</Badge>
          </div>
        ) : null}
        <PendingMarksTable rows={group.rows} compact api={api} courseId={group.course_id} examType={group.exam_type} />
      </CardContent>
    </Card>
  );
}

function PendingMarksTable({
  rows,
  api,
  courseId,
  examType,
  compact,
}: {
  rows: PendingMark[];
  api: ReturnType<typeof useAuthedApi>;
  courseId: string;
  examType: string;
  compact?: boolean;
}) {
  const [dist, setDist] = useState<Distribution | null>(null);

  useEffect(() => {
    if (compact) return;
    void api
      .get<Distribution[]>(`/api/exam-cell/results/distribution?course_id=${courseId}&exam_type=${examType}`)
      .then((rows) => setDist(rows[0] ?? null));
  }, [api, courseId, examType, compact]);

  return (
    <div className={`overflow-y-auto rounded-lg border ${compact ? 'max-h-40' : 'max-h-56'}`}>
      {!compact && dist ? (
        <div className="flex flex-wrap gap-2 border-b bg-muted/30 px-3 py-2 text-xs">
          <span>Avg: {dist.avg_marks}</span>
          <span>Min–Max: {dist.min_marks}–{dist.max_marks}</span>
        </div>
      ) : null}
      <table className="min-w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-3 py-2 text-left">Student</th>
            <th className="px-3 py-2 text-right">Marks</th>
            <th className="px-3 py-2 text-right">%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.mark_id} className="border-t">
              <td className="px-3 py-1.5">{r.student_name}</td>
              <td className="px-3 py-1.5 text-right">{r.marks_obtained}/{r.max_marks}</td>
              <td className="px-3 py-1.5 text-right">{r.percent}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
