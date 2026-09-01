'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import {
  REG_BRAND_BTN,
  REG_OUTLINE_BTN,
  RegistrarDeskChrome,
} from '@/components/admin/registrar-desk/RegistrarDeskChrome';
import { REGISTRAR_DESK } from '@/lib/api/api.registrar-desk';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PaginationBar } from '@/components/ui/PaginationBar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { isCampusAdminFamilyRole } from '@/lib/campus-admin.roles';
import { toast } from '@/lib/notifications/falcon-toast';
import { cn } from '@/lib/utils';

type QueueRow = {
  lead_id: string;
  full_name: string;
  email?: string;
  phone?: string;
  stage: string;
  source?: string;
  fee_verified: boolean;
  student_user_id?: string;
  preferred_program?: string;
  preferred_department?: string;
  preferred_school?: string;
  preferred_batch?: string;
  created_at?: string;
  updated_at?: string;
};

type RuleRow = {
  rule_id: string;
  rule_name: string;
  template?: string;
};

type HistoryRow = {
  run_id: string;
  lead_id?: string;
  student_user_id?: string;
  student_name?: string;
  lead_name?: string;
  enrollment_no?: string;
  fee_verified?: boolean;
  program_name?: string;
  department_name?: string;
  school_name?: string;
  batch?: string;
  semester?: number;
  section_code?: string;
  degree_name?: string;
  status?: string;
  remarks?: string;
  created_at?: string;
};

const STAGES = [
  'FEE_PAID',
  'DOCUMENT_VERIFICATION',
  'OFFERED',
  'APPLICATION_SUBMITTED',
  'ENROLLED',
] as const;

const PAGE = 10;

export function EnrollmentDeskWorkspace() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const canForceEnroll = useMemo(() => {
    const roles = user?.roles?.length ? user.roles : user?.role ? [user.role] : [];
    return roles.some(
      (r) => isCampusAdminFamilyRole(r) || r === 'SuperAdmin' || r === 'Registrar',
    );
  }, [user]);

  const [tab, setTab] = useState('queue');
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [q, setQ] = useState('');
  const [stage, setStage] = useState('all');
  const [historyQ, setHistoryQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [enrollTarget, setEnrollTarget] = useState<QueueRow | null>(null);
  const [forceEnroll, setForceEnroll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    rule_id: '',
    school_name: '',
    department_name: '',
    program_name: '',
    degree_name: '',
    batch: '',
    semester: '',
    section_code: '',
    advisor_name: '',
    remarks: '',
  });

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (stage !== 'all') params.set('status', stage);
      const data = await api.get<QueueRow[]>(`${REGISTRAR_DESK.enrollmentQueue}?${params}`);
      setQueue(
        Array.isArray(data)
          ? data.map((row) => ({
              ...row,
              fee_verified: Boolean(row.fee_verified),
              stage: String(row.stage ?? ''),
            }))
          : [],
      );
      setOffset(0);
    } catch (e) {
      toast.error('Could not load enrollment queue', {
        description: e instanceof Error ? e.message : 'Request failed',
      });
      setQueue([]);
    } finally {
      setLoading(false);
    }
  }, [api, q, stage]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams();
      if (historyQ.trim()) params.set('q', historyQ.trim());
      const data = await api.get<HistoryRow[]>(`${REGISTRAR_DESK.enrollmentHistory}?${params}`);
      setHistory(Array.isArray(data) ? data : []);
      setHistoryOffset(0);
    } catch (e) {
      toast.error('Could not load enrollment history', {
        description: e instanceof Error ? e.message : 'Request failed',
      });
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [api, historyQ]);

  const loadRules = useCallback(async () => {
    try {
      const data = await api.get<RuleRow[]>(REGISTRAR_DESK.enrollmentRules);
      setRules(Array.isArray(data) ? data : []);
    } catch {
      setRules([]);
    }
  }, [api]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    if (tab === 'history') void loadHistory();
  }, [tab, loadHistory]);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  const pageRows = useMemo(() => {
    // Default "all" queue is actionable candidates only — already enrolled leads
    // previously rendered as greyed-out Enroll buttons and looked broken.
    const actionable =
      stage === 'all' ? queue.filter((r) => String(r.stage).toUpperCase() !== 'ENROLLED') : queue;
    return actionable.slice(offset, offset + PAGE);
  }, [queue, offset, stage]);

  const queueTotal = useMemo(() => {
    if (stage === 'all') {
      return queue.filter((r) => String(r.stage).toUpperCase() !== 'ENROLLED').length;
    }
    return queue.length;
  }, [queue, stage]);

  useEffect(() => {
    if (offset > 0 && offset >= queueTotal) setOffset(0);
  }, [offset, queueTotal]);

  const historyPageRows = useMemo(
    () => history.slice(historyOffset, historyOffset + PAGE),
    [history, historyOffset],
  );

  function isAlreadyEnrolled(row: QueueRow): boolean {
    return String(row.stage).toUpperCase() === 'ENROLLED';
  }

  function openEnroll(row: QueueRow) {
    if (isAlreadyEnrolled(row)) return;
    setEnrollTarget(row);
    // Registrar can force-enroll fee-pending leads; enable that path by default
    // so Confirm enrollment is not stuck disabled.
    const needsForce = !row.fee_verified && canForceEnroll;
    setForceEnroll(needsForce);
    setForm({
      rule_id: rules[0]?.rule_id || '',
      school_name: row.preferred_school ?? '',
      department_name: row.preferred_department ?? '',
      program_name: row.preferred_program ?? '',
      degree_name: '',
      batch: row.preferred_batch ?? String(new Date().getFullYear()),
      semester: '1',
      section_code: '',
      advisor_name: '',
      remarks: '',
    });
  }

  function canConfirmEnroll(row: QueueRow): boolean {
    if (isAlreadyEnrolled(row)) return false;
    if (row.fee_verified) return true;
    return canForceEnroll && forceEnroll;
  }

  async function submitEnroll() {
    if (!enrollTarget) return;
    if (isAlreadyEnrolled(enrollTarget)) {
      toast.info('This candidate is already enrolled');
      return;
    }
    if (!enrollTarget.fee_verified && !forceEnroll) {
      toast.warning('Fee must be verified before enrollment', {
        description: 'Verify fee in Admissions, or enable force enroll with remarks.',
      });
      return;
    }
    if (!enrollTarget.fee_verified && forceEnroll && !form.remarks.trim()) {
      toast.warning('Add remarks', {
        description: 'Force enrollment without fee verification requires an audit remark.',
      });
      return;
    }
    setSaving(true);
    try {
      const result = await api.post<{
        enrollment_no: string;
        credentials_provisioned?: boolean;
        temp_password?: string;
        student_user_id?: string;
      }>(REGISTRAR_DESK.enrollmentEnroll, {
        lead_id: enrollTarget.lead_id,
        rule_id: form.rule_id || undefined,
        school_name: form.school_name.trim() || undefined,
        department_name: form.department_name.trim() || undefined,
        program_name: form.program_name.trim() || undefined,
        degree_name: form.degree_name.trim() || undefined,
        batch: form.batch.trim() || undefined,
        semester: form.semester.trim() ? Number(form.semester) : undefined,
        section_code: form.section_code.trim() || undefined,
        advisor_name: form.advisor_name.trim() || undefined,
        remarks: form.remarks.trim() || undefined,
        require_fee_paid: forceEnroll ? false : true,
      });
      toast.success(`Enrolled — ${result.enrollment_no}`, {
        description: result.credentials_provisioned
          ? 'Student portal account was provisioned. Check Enrollment history for the record.'
          : 'Student record activated with enrollment number.',
      });
      setEnrollTarget(null);
      await loadQueue();
      void loadHistory();
      setTab('history');
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : typeof e === 'object' && e && 'message' in e
            ? String((e as { message: unknown }).message)
            : 'Enrollment failed';
      toast.error('Enrollment failed', {
        description: message.replace(/^Internal server error:?\s*/i, '') || message,
      });
    } finally {
      setSaving(false);
    }
  }

  function exportQueueCsv() {
    const header = ['Name', 'Email', 'Phone', 'Stage', 'Fee verified', 'Source', 'Updated'];
    const body = queue.map((r) =>
      [
        r.full_name,
        r.email ?? '',
        r.phone ?? '',
        r.stage,
        r.fee_verified ? 'Yes' : 'No',
        r.source ?? '',
        r.updated_at ?? '',
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(','),
    );
    const blob = new Blob([[header.join(','), ...body].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'enrollment-queue.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportHistoryCsv() {
    const header = [
      'Student',
      'Enrollment No',
      'Program',
      'Department',
      'Batch',
      'Semester',
      'Status',
      'Enrolled at',
    ];
    const body = history.map((r) =>
      [
        r.student_name ?? r.lead_name ?? '',
        r.enrollment_no ?? '',
        r.program_name ?? '',
        r.department_name ?? '',
        r.batch ?? '',
        r.semester ?? '',
        r.status ?? '',
        r.created_at ?? '',
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(','),
    );
    const blob = new Blob([[header.join(','), ...body].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'enrollment-history.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <RegistrarDeskChrome
      title="Guided Student Enrollment"
      subtitle="Review fee-verified admissions leads, assign academic placement, and provision student accounts with enrollment numbers."
    >
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="border border-sgvu-navy/10 bg-white">
          <TabsTrigger value="queue">Enrollment queue</TabsTrigger>
          <TabsTrigger value="history">Enrollment history</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-4 space-y-4">
          <Card className="border-sgvu-navy/10 bg-white shadow-sm">
            <CardContent className="grid gap-3 p-4 md:grid-cols-4">
              <label className="md:col-span-2 space-y-1">
                <span className="text-xs text-muted-foreground">Search</span>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-10 pl-9"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Name, email, or phone…"
                  />
                </div>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Stage</span>
                <Select value={stage} onValueChange={setStage}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All stages</SelectItem>
                    {STAGES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  className={cn('h-10 w-full rounded-lg px-3 text-sm font-semibold', REG_OUTLINE_BTN)}
                  onClick={exportQueueCsv}
                >
                  Export CSV
                </button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-sgvu-navy/10 bg-white shadow-sm">
            <CardHeader className="border-b border-sgvu-navy/10 pb-3">
              <CardTitle className="text-base font-bold text-sgvu-navy">Candidates ready to enroll</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading queue…
                </div>
              ) : queue.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  No candidates match your filters.
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table className="min-w-[880px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Candidate</TableHead>
                          <TableHead>Stage</TableHead>
                          <TableHead>Fee</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead>Updated</TableHead>
                          <TableHead>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pageRows.map((r) => (
                          <TableRow key={r.lead_id}>
                            <TableCell>
                              <p className="font-medium text-sgvu-navy">{r.full_name}</p>
                              <p className="text-xs text-muted-foreground">{r.email ?? r.phone ?? '—'}</p>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="border-transparent bg-sgvu-navy/5 text-sgvu-navy">
                                {r.stage.replace(/_/g, ' ')}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn(
                                  'border-transparent',
                                  r.fee_verified
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-amber-50 text-amber-700',
                                )}
                              >
                                {r.fee_verified ? 'Verified' : 'Pending'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{r.source ?? '—'}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {r.updated_at ? new Date(r.updated_at).toLocaleString() : '—'}
                            </TableCell>
                            <TableCell>
                              {isAlreadyEnrolled(r) ? (
                                <Badge
                                  variant="outline"
                                  className="border-transparent bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800"
                                >
                                  Enrolled
                                </Badge>
                              ) : (
                                <Button
                                  type="button"
                                  size="sm"
                                  className={cn(
                                    'h-8 min-w-[4.75rem] px-3 text-xs font-semibold shadow-none',
                                    REG_BRAND_BTN,
                                    'disabled:opacity-100',
                                  )}
                                  onClick={() => openEnroll(r)}
                                >
                                  Enroll
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="border-t border-sgvu-navy/10 p-4">
                    <PaginationBar total={queueTotal} limit={PAGE} offset={offset} onPageChange={setOffset} />
                    {stage === 'all' ? (
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Already enrolled candidates are hidden here. Choose stage{' '}
                        <span className="font-semibold text-sgvu-navy">ENROLLED</span> to review them, or open
                        Enrollment history.
                      </p>
                    ) : null}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-4">
          <Card className="border-sgvu-navy/10 bg-white shadow-sm">
            <CardContent className="grid gap-3 p-4 md:grid-cols-3">
              <label className="md:col-span-2 space-y-1">
                <span className="text-xs text-muted-foreground">Search history</span>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-10 pl-9"
                    value={historyQ}
                    onChange={(e) => setHistoryQ(e.target.value)}
                    placeholder="Enrollment no or student name…"
                  />
                </div>
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  className={cn('h-10 w-full rounded-lg px-3 text-sm font-semibold', REG_OUTLINE_BTN)}
                  onClick={exportHistoryCsv}
                >
                  Export CSV
                </button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-sgvu-navy/10 bg-white shadow-sm">
            <CardHeader className="border-b border-sgvu-navy/10 pb-3">
              <CardTitle className="text-base font-bold text-sgvu-navy">Past enrollment runs</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {historyLoading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading history…
                </div>
              ) : history.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">No enrollment history yet.</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table className="min-w-[900px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Student</TableHead>
                          <TableHead>Enrollment</TableHead>
                          <TableHead>Program</TableHead>
                          <TableHead>Batch / Sem</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {historyPageRows.map((r) => (
                          <TableRow key={r.run_id}>
                            <TableCell>
                              <p className="font-medium text-sgvu-navy">{r.student_name ?? r.lead_name ?? '—'}</p>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{r.enrollment_no ?? '—'}</TableCell>
                            <TableCell className="text-sm">
                              {r.program_name ?? '—'}
                              {r.department_name ? (
                                <span className="block text-xs text-muted-foreground">{r.department_name}</span>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {r.batch ?? '—'} · Sem {r.semester ?? '—'}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn(
                                  'border-transparent',
                                  r.status === 'COMPLETED'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-red-50 text-red-700',
                                )}
                              >
                                {r.status ?? '—'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="border-t border-sgvu-navy/10 p-4">
                    <PaginationBar
                      total={history.length}
                      limit={PAGE}
                      offset={historyOffset}
                      onPageChange={setHistoryOffset}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!enrollTarget} onOpenChange={(o) => !o && setEnrollTarget(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Enroll {enrollTarget?.full_name}</DialogTitle>
          </DialogHeader>
          {enrollTarget ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-sgvu-navy/10 bg-slate-50/80 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Fee:</span>
                <Badge
                  variant="outline"
                  className={cn(
                    'border-transparent',
                    enrollTarget.fee_verified ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
                  )}
                >
                  {enrollTarget.fee_verified ? 'Verified' : 'Not verified'}
                </Badge>
                <span className="text-muted-foreground">· Stage {enrollTarget.stage.replace(/_/g, ' ')}</span>
              </div>

              {!enrollTarget.fee_verified && canForceEnroll ? (
                <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2.5">
                  <label className="flex cursor-pointer items-start gap-2 text-sm text-sgvu-navy">
                    <input
                      type="checkbox"
                      checked={forceEnroll}
                      onChange={(e) => setForceEnroll(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-sgvu-navy/30"
                    />
                    <span>
                      Force enroll without fee verification
                      <span className="mt-0.5 block text-xs font-normal text-amber-900/80">
                        Audit remarks are required. This still creates the student account and enrollment number.
                      </span>
                    </span>
                  </label>
                </div>
              ) : null}

              {!enrollTarget.fee_verified && !canForceEnroll ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
                  Fee is not verified. Mark fee paid in Admissions before enrollment, or ask a Registrar with force-enroll rights.
                </p>
              ) : null}

              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">Enrollment ID rule</span>
                <Select
                  value={form.rule_id || undefined}
                  onValueChange={(v) => setForm((f) => ({ ...f, rule_id: v }))}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select rule" />
                  </SelectTrigger>
                  <SelectContent>
                    {rules.map((rule) => (
                      <SelectItem key={rule.rule_id} value={rule.rule_id}>
                        {rule.rule_name}
                        {rule.template ? ` (${rule.template})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ['school_name', 'School'],
                    ['department_name', 'Department'],
                    ['program_name', 'Program'],
                    ['degree_name', 'Degree'],
                    ['batch', 'Batch'],
                    ['section_code', 'Section'],
                    ['advisor_name', 'Advisor'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="block space-y-1">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <Input
                      className="h-10"
                      value={form[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    />
                  </label>
                ))}
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">Semester</span>
                  <Input
                    className="h-10"
                    type="number"
                    min={1}
                    value={form.semester}
                    onChange={(e) => setForm((f) => ({ ...f, semester: e.target.value }))}
                  />
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">
                  Remarks
                  {!enrollTarget.fee_verified && forceEnroll ? (
                    <span className="font-semibold text-amber-800"> (required for force enroll)</span>
                  ) : null}
                </span>
                <Textarea
                  rows={2}
                  value={form.remarks}
                  onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
                  placeholder={
                    !enrollTarget.fee_verified && forceEnroll
                      ? 'Why is enrollment allowed without fee verification?'
                      : 'Optional notes for the enrollment run'
                  }
                />
              </label>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnrollTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              className={cn(REG_BRAND_BTN, 'disabled:opacity-60')}
              disabled={saving || !enrollTarget || !canConfirmEnroll(enrollTarget)}
              onClick={() => void submitEnroll()}
            >
              {saving ? 'Enrolling…' : 'Confirm enrollment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RegistrarDeskChrome>
  );
}
