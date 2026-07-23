'use client';

import { Select } from '@/components/ui/select';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronRight, Lock, Eye, Send, AlertTriangle, type LucideIcon } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';
import {
  ResultPublishingPipeline,
  PIPELINE_ICONS,
  type PipelineStep,
} from '@/components/exam-cell/ResultPublishingPipeline';
import { PublishConfirmDialog } from '@/components/exam-cell/PublishConfirmDialog';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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
  coe_audit_status?: 'idle' | 'passed' | 'anomaly';
  dean_approved?: boolean;
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
  if (preview?.length) return 'preview';
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
  const [coeAuditStatus, setCoeAuditStatus] = useState<'idle' | 'passed' | 'anomaly'>('idle');
  const [deanApproved, setDeanApproved] = useState(false);
  const [anomalySubjects, setAnomalySubjects] = useState<{ course_code: string; failure_rate: number }[]>([]);
  const [moderationOpen, setModerationOpen] = useState(false);
  const [graceMarks, setGraceMarks] = useState('3');
  const [appliedGrace, setAppliedGrace] = useState<number | null>(null);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishConfirmText, setPublishConfirmText] = useState('');

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
    setAppliedGrace(null);
    void (async () => {
      try {
        const detail = await api.get<ResultSession>(`/api/exam-cell/result-control/sessions/${selected.session_id}`);
        const status = detail.coe_audit_status ?? 'idle';
        setCoeAuditStatus(status);
        setDeanApproved(Boolean(detail.dean_approved));
        if (status === 'anomaly') {
          setAnomalySubjects([{ course_code: detail.course_code, failure_rate: 0 }]);
        } else {
          setAnomalySubjects([]);
        }
      } catch {
        setCoeAuditStatus('idle');
        setDeanApproved(false);
        setAnomalySubjects([]);
      }
    })();
  }, [selected?.session_id, api]);

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
      toast.error('Preview grades before publishing');
      return;
    }
    if (!deanApproved) {
      toast.error('Dean/VC approval is required before publishing');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ declared: number }>(
        `/api/exam-cell/result-control/sessions/${selected.session_id}/declare`,
        { declaration_note: declareNote || undefined },
      );
      toast.success(`Published results for ${res.declared} students`);
      setDeclareNote('');
      setPreview(null);
      setSelectedId(null);
      setPublishDialogOpen(false);
      setPublishConfirmText('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setBusy(false);
    }
  }

  async function runFormulaAudit() {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await api.post<{
        status: 'passed' | 'anomaly';
        failure_rate: number;
        anomaly_subjects: { course_code: string; failure_rate: number }[];
      }>(`/api/exam-cell/result-control/sessions/${selected.session_id}/formula-audit`, {});
      setCoeAuditStatus(res.status);
      setAnomalySubjects(res.anomaly_subjects ?? []);
      if (res.status === 'passed') {
        toast.success('Formula audit passed — no critical anomalies');
      } else {
        toast.error(`High failure rate detected (${res.failure_rate}%)`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Formula audit failed');
    } finally {
      setBusy(false);
    }
  }

  async function recordDeanApproval() {
    if (!selected) return;
    setBusy(true);
    try {
      await api.post(`/api/exam-cell/result-control/sessions/${selected.session_id}/dean-approval`, {});
      setDeanApproved(false);
      toast.success('Submitted to Dean for approval. Results can be declared after Dean approves.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Dean approval failed');
    } finally {
      setBusy(false);
    }
  }

  async function applyModerationPolicy() {
    if (!selected) return;
    const grace = Number(graceMarks);
    if (Number.isNaN(grace) || grace <= 0) {
      toast.error('Enter valid grace marks');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ updated: number; preview: PreviewRow[] }>(
        `/api/exam-cell/result-control/sessions/${selected.session_id}/apply-grace`,
        { grace_marks: grace },
      );
      setAppliedGrace(grace);
      setPreview(res.preview ?? null);
      setModerationOpen(false);
      toast.success(`Applied +${grace} grace marks to ${res.updated} students`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Grace marks application failed');
    } finally {
      setBusy(false);
    }
  }

  const publishingPipeline = useMemo((): PipelineStep[] => {
    const facultyLocked = Boolean(selected?.marks_locked || selected?.entry_status === 'LOCKED');
    return [
      {
        key: 'faculty_lock',
        label: 'Faculty Lock',
        description: 'Marks locked by HOD / faculty before COE review.',
        icon: PIPELINE_ICONS.faculty_lock,
        status: facultyLocked ? 'complete' : selected ? 'active' : 'pending',
        statusLabel: facultyLocked ? 'Locked by HOD/Faculty' : 'Awaiting lock',
      },
      {
        key: 'coe_audit',
        label: 'COE Audit',
        description: 'Run formula audit for anomalous pass/fail patterns.',
        icon: PIPELINE_ICONS.coe_audit,
        status:
          coeAuditStatus === 'passed'
            ? 'complete'
            : coeAuditStatus === 'anomaly'
              ? 'blocked'
              : facultyLocked
                ? 'active'
                : 'pending',
        statusLabel:
          coeAuditStatus === 'passed'
            ? 'Audit passed'
            : coeAuditStatus === 'anomaly'
              ? 'Anomaly detected'
              : 'Run formula audit',
      },
      {
        key: 'dean_approval',
        label: 'Dean / VC Approval',
        description: 'Executive sign-off before public release.',
        icon: PIPELINE_ICONS.dean_approval,
        status: deanApproved ? 'complete' : coeAuditStatus === 'passed' ? 'active' : 'pending',
        statusLabel: deanApproved ? 'Approved' : 'Pending signature',
      },
      {
        key: 'publish',
        label: 'Publish',
        description: 'Push final grades to student portals.',
        icon: PIPELINE_ICONS.publish,
        status: deanApproved && preview?.length ? 'active' : 'pending',
        statusLabel: deanApproved ? 'Ready to publish' : 'Locked',
      },
    ];
  }, [selected, coeAuditStatus, deanApproved, preview?.length]);

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

  const fieldClass =
    'h-10 w-full rounded-lg border border-sgvu-navy/20 bg-white px-3 text-sm font-medium text-sgvu-navy shadow-none transition-colors hover:border-sgvu-navy/40 focus:border-sgvu-gold focus:outline-none focus:ring-2 focus:ring-sgvu-gold/25 data-[state=open]:border-sgvu-gold data-[state=open]:ring-2 data-[state=open]:ring-sgvu-gold/25';
  const labelClass = 'text-xs font-bold uppercase tracking-wide text-sgvu-navy/55';
  const btnPrimary =
    'h-10 border border-[#0B2447] bg-[#0B2447] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy disabled:opacity-60';
  const btnOutline =
    'h-10 border border-[#0B2447] bg-white px-5 text-sm font-semibold text-[#0B2447] transition-colors hover:bg-[#0B2447]/5 active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy disabled:opacity-60';

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <ExamCellPageHeader pageId="results" />
        </CardContent>
      </Card>

      {/* Session setup — create sessions and open faculty entry */}
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-5 p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-sgvu-navy/10 pb-4">
            <div>
              <h2 className="text-lg font-bold text-sgvu-navy">Create result session</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Create sessions and open marks entry before faculty can submit.
              </p>
            </div>
            <Button variant="outline" size="sm" className={btnPrimary} onClick={() => setShowSetup((v) => !v)}>
              {showSetup ? 'Hide' : 'Show'}
            </Button>
          </div>

          {showSetup ? (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label className={labelClass}>Course</label>
                  <Select
                    className={fieldClass}
                    value={createForm.course_id || undefined}
                    placeholder="Select course"
                    onChange={(e) => setCreateForm({ ...createForm, course_id: e.target.value })}
                  >
                    <option value="">Select course</option>
                    {courses.map((c) => (
                      <option key={c.course_id} value={c.course_id}>
                        {c.course_code} — {c.course_name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={labelClass}>Exam type</label>
                  <Select
                    className={fieldClass}
                    value={createForm.exam_type}
                    onChange={(e) => setCreateForm({ ...createForm, exam_type: e.target.value })}
                  >
                    {EXAM_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={labelClass}>Semester</label>
                  <Input
                    className="h-10 rounded-lg border-sgvu-navy/20 focus-visible:ring-sgvu-gold/40"
                    placeholder="4"
                    value={createForm.semester}
                    onChange={(e) => setCreateForm({ ...createForm, semester: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={labelClass}>Max marks</label>
                  <Input
                    className="h-10 rounded-lg border-sgvu-navy/20 focus-visible:ring-sgvu-gold/40"
                    placeholder="50"
                    value={createForm.max_marks}
                    onChange={(e) => setCreateForm({ ...createForm, max_marks: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={labelClass}>Pass marks</label>
                  <Input
                    className="h-10 rounded-lg border-sgvu-navy/20 focus-visible:ring-sgvu-gold/40"
                    placeholder="20"
                    value={createForm.pass_marks}
                    onChange={(e) => setCreateForm({ ...createForm, pass_marks: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-3">
                  <label className={labelClass}>Grading policy</label>
                  <Select
                    className={fieldClass}
                    value={createForm.grading_policy_id || 'DEFAULT'}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        grading_policy_id: e.target.value === 'DEFAULT' ? '' : e.target.value,
                      })
                    }
                  >
                    <option value="DEFAULT">Default grading policy</option>
                    {policies.map((p) => (
                      <option key={p.policy_id} value={p.policy_id}>{p.policy_name}</option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="flex justify-center">
                <Button variant="outline" className={btnPrimary} disabled={busy} onClick={() => void createSession()}>
                  {busy ? 'Creating…' : 'Create session'}
                </Button>
              </div>

              <div className="grid gap-4 border-t border-sgvu-navy/10 pt-5 lg:grid-cols-[320px_1fr]">
                <div className="space-y-2">
                  <p className={labelClass}>{sessions.length} sessions</p>
                  {sessions.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-sgvu-navy/20 px-4 py-8 text-center text-sm text-muted-foreground">
                      No sessions yet
                    </div>
                  ) : (
                    sessions.map((s) => (
                      <button
                        key={s.session_id}
                        type="button"
                        onClick={() => {
                          setSelectedId(s.session_id);
                          scrollToWorkflow();
                        }}
                        className={`w-full rounded-xl border p-3 text-left text-sm transition-colors ${
                          selectedId === s.session_id
                            ? 'border-sgvu-gold bg-sgvu-gold/5 ring-1 ring-sgvu-gold/30'
                            : 'border-sgvu-navy/10 bg-white hover:border-sgvu-navy/25'
                        }`}
                      >
                        <p className="font-semibold text-sgvu-navy">
                          {s.course_code} · {s.exam_type}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Badge variant={statusBadge(s.entry_status)}>{s.entry_status}</Badge>
                          {s.declared_at ? <Badge variant="default">Declared</Badge> : null}
                          {s.pending_coe_count > 0 ? (
                            <Badge variant="outline">{s.pending_coe_count} pending</Badge>
                          ) : null}
                        </div>
                      </button>
                    ))
                  )}
                </div>

                {selected ? (
                  <div className="space-y-4 rounded-xl border border-sgvu-navy/10 bg-sgvu-navy/[0.02] p-4 text-sm">
                    <div>
                      <p className="font-bold text-sgvu-navy">Faculty entry window</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {selected.course_code} · {selected.exam_type}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className={btnPrimary}
                        disabled={busy || !!selected.declared_at}
                        onClick={() => void runAction('open-entry', 'Marks entry opened for faculty')}
                      >
                        Open entry
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className={btnOutline}
                        disabled={busy || !!selected.declared_at}
                        onClick={() => void runAction('close-entry', 'Marks entry closed')}
                      >
                        Close entry
                      </Button>
                    </div>
                    {!selected.declared_at ? (
                      <div className="space-y-2 border-t border-sgvu-navy/10 pt-3">
                        <p className="font-semibold text-sgvu-navy">Reopen for corrections</p>
                        <Input
                          className="h-10 rounded-lg border-sgvu-navy/20 focus-visible:ring-sgvu-gold/40"
                          placeholder="Reason for reopening"
                          value={reopenReason}
                          onChange={(e) => setReopenReason(e.target.value)}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className={btnOutline}
                          disabled={busy}
                          onClick={() => void reopenEntry()}
                        >
                          Reopen entry
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="flex items-center justify-center rounded-xl border border-dashed border-sgvu-navy/20 px-4 py-10 text-sm text-muted-foreground">
                    Select a session to manage faculty entry.
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Actionable pending queue */}
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-5 p-5 md:p-6">
          <div className="border-b border-sgvu-navy/10 pb-4">
            <h2 className="text-lg font-bold text-sgvu-navy">Awaiting declaration</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Faculty marks must be locked before the COE publishing pipeline activates. Each course follows:
              Lock → Audit → Dean approval → Publish.
            </p>
          </div>
          <ResultPublishingPipeline
            compact
            steps={[
              {
                key: 'faculty_lock',
                label: 'Faculty Lock',
                description: 'HOD locks faculty submissions',
                icon: PIPELINE_ICONS.faculty_lock,
                status: 'active',
                statusLabel: 'Required first',
              },
              {
                key: 'coe_audit',
                label: 'COE Audit',
                description: 'Detect anomalous results',
                icon: PIPELINE_ICONS.coe_audit,
                status: 'pending',
                statusLabel: 'After lock',
              },
              {
                key: 'dean_approval',
                label: 'Dean / VC',
                description: 'Executive sign-off',
                icon: PIPELINE_ICONS.dean_approval,
                status: 'pending',
                statusLabel: 'After audit',
              },
              {
                key: 'publish',
                label: 'Publish',
                description: 'Student portals',
                icon: PIPELINE_ICONS.publish,
                status: 'pending',
                statusLabel: 'Final step',
              },
            ]}
          />
          <div className="space-y-4">
            {pendingGroups.length === 0 ? (
              <div className="rounded-xl border border-dashed border-sgvu-navy/20 px-4 py-10 text-center">
                <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-600" />
                <p className="text-sm font-medium text-sgvu-navy">No marks awaiting declaration</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Submitted faculty marks will appear here when ready to declare.
                </p>
              </div>
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
        </CardContent>
      </Card>

      {/* Guided declaration workflow */}
      <div ref={workflowRef}>
        {selected && !selected.declared_at ? (
          <Card className="border-sgvu-navy/10 bg-white shadow-sm ring-1 ring-sgvu-gold/30">
            <CardHeader className="border-b border-sgvu-navy/10 pb-4">
              <CardTitle className="text-lg text-sgvu-navy">
                Declare results — {selected.course_code} · {selected.exam_type}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{selected.course_name}</p>
            </CardHeader>
            <CardContent className="space-y-6 p-5 md:p-6">
              <ResultPublishingPipeline steps={publishingPipeline} />

              {(coeAuditStatus === 'anomaly' || anomalySubjects.length > 0) && (
                <Card className="border-amber-200 bg-amber-50/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base text-amber-900">
                      <AlertTriangle className="h-5 w-5" />
                      Data Anomalies & Moderation
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {anomalySubjects.map((a) => (
                      <div
                        key={a.course_code}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"
                      >
                        <span className="font-semibold text-amber-950">
                          {a.course_code}: {a.failure_rate}% failure rate detected
                        </span>
                        <Button size="sm" variant="outline" onClick={() => setModerationOpen(true)}>
                          Apply Moderation Policy
                        </Button>
                      </div>
                    ))}
                    {appliedGrace !== null && (
                      <p className="text-xs text-emerald-700">
                        Grace +{appliedGrace} marks applied in preview — re-run preview after moderation if needed.
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

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
                  <div className="rounded-lg border border-dashed border-sgvu-navy/20 px-3 py-6 text-center text-sm text-muted-foreground">
                    No pending marks for this session.
                  </div>
                )}
                {!selected.marks_locked && selected.pending_coe_count > 0 ? (
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <Button variant="outline" className={btnPrimary} disabled={busy} onClick={() => void lockSubmissions()}>
                      Lock submissions
                    </Button>
                  </div>
                ) : selected.marks_locked ? (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white p-3">
                    <p className="text-sm text-emerald-800">Faculty marks locked — COE audit unlocked.</p>
                    <Button
                      variant="outline"
                      disabled={busy || coeAuditStatus === 'passed'}
                      onClick={() => void runFormulaAudit()}
                    >
                      Run Formula Audit
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
                  <Select className="rounded-md border px-3 py-2 text-sm" value={rulesForm.grading_policy_id} onChange={(e) => setRulesForm({ ...rulesForm, grading_policy_id: e.target.value })}>
                    <option value="">Default policy</option>
                    {policies.map((p) => (
                      <option key={p.policy_id} value={p.policy_id}>{p.policy_name}</option>
                    ))}
                  </Select>
                </div>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void saveRules()}>
                  Save grade rules
                </Button>

                {(selected.marks_locked || selected.entry_status === 'LOCKED') && !preview?.length ? (
                  <div className="mt-4 flex justify-end">
                    <Button variant="outline" className={btnPrimary} disabled={busy} onClick={() => void processSession()}>
                      Preview grades
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

              {/* Declare / Publish pipeline */}
              <WorkflowSection
                step={3}
                currentIdx={activeStepIdx}
                title="Dean approval & publish"
                description="Record Dean/VC sign-off, then push results to student portals with typed confirmation."
              >
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <Badge variant={deanApproved ? 'default' : 'secondary'}>
                    {deanApproved ? 'Dean/VC Approved' : 'Pending Dean/VC Signature'}
                  </Badge>
                  {!deanApproved && coeAuditStatus === 'passed' && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void recordDeanApproval()}>
                      Submit for Dean Approval
                    </Button>
                  )}
                </div>
                <Input
                  className="max-w-lg"
                  placeholder="Optional note to students"
                  value={declareNote}
                  onChange={(e) => setDeclareNote(e.target.value)}
                />
                <div className="mt-4 flex justify-end">
                  <Button
                    variant="destructive"
                    disabled={busy || !preview?.length || !deanApproved}
                    onClick={() => setPublishDialogOpen(true)}
                  >
                    Push to Student Portals
                  </Button>
                </div>
              </WorkflowSection>
            </CardContent>
          </Card>
        ) : selected?.declared_at ? (
          <Card className="border-sgvu-navy/10 bg-white shadow-sm">
            <CardContent className="flex items-center gap-3 p-5 md:p-6">
              <CheckCircle2 className="h-8 w-8 shrink-0 text-emerald-600" />
              <div>
                <p className="font-semibold text-sgvu-navy">
                  {selected.course_code} · {selected.exam_type} — declared
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Results published to students. Select another item from the queue above.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-xl border border-dashed border-sgvu-navy/20 bg-white px-4 py-12 text-center shadow-sm">
            <p className="text-sm font-medium text-sgvu-navy">No declaration workflow selected</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Select <strong>Start declaration</strong> on a pending submission above to begin the workflow.
            </p>
          </div>
        )}
      </div>

      <PublishConfirmDialog
        open={publishDialogOpen}
        onOpenChange={setPublishDialogOpen}
        confirmText={publishConfirmText}
        onConfirmTextChange={setPublishConfirmText}
        onConfirm={() => void declareResults()}
        busy={busy}
        courseLabel={selected ? `${selected.course_code} · ${selected.exam_type}` : undefined}
      />

      <Dialog open={moderationOpen} onOpenChange={setModerationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply Moderation Policy</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Add flat grace marks to all students in {selected?.course_code} before finalizing SGPA in the preview.
          </p>
          <Input
            type="number"
            min={1}
            max={10}
            value={graceMarks}
            onChange={(e) => setGraceMarks(e.target.value)}
            placeholder="Grace marks (e.g. 3)"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setModerationOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void applyModerationPolicy()}>Apply to preview</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  const btnPrimary =
    'h-10 border border-[#0B2447] bg-[#0B2447] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy disabled:opacity-60';

  useEffect(() => {
    void api
      .get<Distribution[]>(`/api/exam-cell/results/distribution?course_id=${group.course_id}&exam_type=${group.exam_type}`)
      .then((rows) => setDist(rows[0] ?? null));
  }, [api, group.course_id, group.exam_type]);

  return (
    <div className="rounded-xl border border-sgvu-navy/10 bg-white p-4 shadow-sm md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-lg font-bold text-sgvu-navy">
            {group.course_code} — {group.exam_type}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {group.course_name} · {group.rows.length} students submitted
          </p>
          {session ? (
            <Badge className="mt-2" variant={statusBadge(session.entry_status)}>
              {session.entry_status}
            </Badge>
          ) : (
            <Badge className="mt-2" variant="outline">
              No session — will create on start
            </Badge>
          )}
        </div>
        <Button variant="outline" className={btnPrimary} disabled={busy} onClick={onStart}>
          Start declaration
        </Button>
      </div>
      <div className="mt-4 space-y-3">
        {dist ? (
          <div className="flex flex-wrap gap-2">
            <span className="rounded-md bg-sgvu-navy/5 px-2.5 py-1 text-xs font-semibold text-sgvu-navy">
              Avg: {dist.avg_marks}
            </span>
            <span className="rounded-md bg-sgvu-navy/5 px-2.5 py-1 text-xs font-semibold text-sgvu-navy">
              Min–Max: {dist.min_marks}–{dist.max_marks}
            </span>
            <span className="rounded-md bg-sgvu-navy/5 px-2.5 py-1 text-xs font-semibold text-sgvu-navy">
              ≥90%: {dist.above_90pct}
            </span>
            <span className="rounded-md bg-sgvu-navy/5 px-2.5 py-1 text-xs font-semibold text-sgvu-navy">
              &lt;40%: {dist.below_40pct}
            </span>
          </div>
        ) : null}
        {group.rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-sgvu-navy/20 px-3 py-6 text-center text-sm text-muted-foreground">
            No student marks in this group.
          </div>
        ) : (
          <PendingMarksTable
            rows={group.rows}
            compact
            api={api}
            courseId={group.course_id}
            examType={group.exam_type}
          />
        )}
      </div>
    </div>
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
    <div className={`overflow-y-auto rounded-xl border border-sgvu-navy/10 ${compact ? 'max-h-40' : 'max-h-56'}`}>
      {!compact && dist ? (
        <div className="flex flex-wrap gap-2 border-b border-sgvu-navy/10 bg-sgvu-navy/[0.03] px-3 py-2 text-xs font-semibold text-sgvu-navy">
          <span>Avg: {dist.avg_marks}</span>
          <span>Min–Max: {dist.min_marks}–{dist.max_marks}</span>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <div className="px-3 py-6 text-center text-sm text-muted-foreground">No students</div>
      ) : (
        <table className="min-w-full text-sm">
          <thead className="bg-sgvu-navy/[0.04]">
            <tr>
              <th className="px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-sgvu-navy/55">
                Student
              </th>
              <th className="px-3 py-2.5 text-right text-xs font-bold uppercase tracking-wide text-sgvu-navy/55">
                Marks
              </th>
              <th className="px-3 py-2.5 text-right text-xs font-bold uppercase tracking-wide text-sgvu-navy/55">
                %
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.mark_id} className="border-t border-sgvu-navy/5">
                <td className="px-3 py-2 text-sgvu-navy">{r.student_name}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.marks_obtained}/{r.max_marks}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.percent}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
