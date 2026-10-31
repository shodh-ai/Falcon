'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { canExamCellAction } from '@/lib/exam-cell-rbac';

type AnswerSheet = {
  sheet_id: string;
  sheet_number: string;
  status: string;
  qr_payload: string;
  student_name: string | null;
  subject_name: string | null;
  exam_date: string | null;
  exam_schedule_id: string | null;
  student_user_id: string | null;
  collected_at: string | null;
};

const STATUS_FLOW = [
  'ISSUED',
  'COLLECTED',
  'PACKED',
  'DISPATCHED',
  'EVALUATOR_ASSIGNED',
  'CHECKED',
  'RETURNED',
  'ARCHIVED',
] as const;

const fieldClass =
  'h-10 w-full rounded-lg border border-sgvu-navy/20 bg-white px-3 text-sm font-medium text-sgvu-navy shadow-none transition-colors hover:border-sgvu-navy/40 focus:border-sgvu-gold focus:outline-none focus:ring-2 focus:ring-sgvu-gold/25 data-[state=open]:border-sgvu-gold data-[state=open]:ring-2 data-[state=open]:ring-sgvu-gold/25';
const labelClass = 'text-xs font-bold uppercase tracking-wide text-sgvu-navy/55';
const btnPrimary =
  'h-10 border border-[#0B2447] bg-[#0B2447] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy disabled:opacity-60';

function statusTone(status: string) {
  const key = status.toUpperCase();
  if (key === 'ISSUED' || key === 'COLLECTED') return 'border-sky-200 bg-sky-50 text-sky-800';
  if (key === 'PACKED' || key === 'DISPATCHED') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (key === 'EVALUATOR_ASSIGNED' || key === 'CHECKED') return 'border-violet-200 bg-violet-50 text-violet-800';
  if (key === 'RETURNED' || key === 'ARCHIVED') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  return 'border-sgvu-navy/15 bg-sgvu-navy/[0.04] text-sgvu-navy';
}

export default function ExamCellAnswerSheetsPage() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const canManage = canExamCellAction(user?.primaryRole ?? user?.role, 'manage_sessions');
  const [context, setContext] = useState<{
    api: typeof api; schedules: Array<{ exam_schedule_id: string; subject_name: string; exam_date: string }>;
    faculty: Array<{ user_id: string; name: string }>;
  } | null>(null);
  const [scheduleId, setScheduleId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [roster, setRoster] = useState<{ api: typeof api; scheduleId: string; rows: Array<{ student_user_id: string; student_name: string }> } | null>(null);
  const [evaluatorId, setEvaluatorId] = useState('');
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [records, setRecords] = useState<{ api: typeof api; filter: string; rows: AnswerSheet[]; error: string | null } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const recordsRequest = useRef(0);
  const [busy, setBusy] = useState(false);
  const [sheetNumber, setSheetNumber] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get<Array<{ exam_schedule_id: string; subject_name: string; exam_date: string }>>('/api/exam-cell/schedules'),
      api.get<Array<{ user_id: string; name: string }>>('/api/exam-cell/faculty-roster'),
    ]).then(([schedules, faculty]) => { if (active) { setContext({ api, schedules, faculty }); setSourceError(null); } })
      .catch((e: unknown) => { if (active) setSourceError(e instanceof Error ? e.message : 'Examination sources are unavailable'); });
    return () => { active = false; };
  }, [api]);

  useEffect(() => {
    if (!scheduleId) return;
    let active = true;
    api.get<Array<{ student_user_id: string; student_name: string }>>(`/api/exam-cell/exam-day/roster?exam_schedule_id=${scheduleId}`)
      .then(rows => { if (active) setRoster({ api, scheduleId, rows }); })
      .catch((e: unknown) => { if (active) { setRoster(null); toast.error(e instanceof Error ? e.message : 'Roster is unavailable'); } });
    return () => { active = false; };
  }, [api, scheduleId]);
  const source = context?.api === api ? context : null;
  const candidates = roster?.api === api && roster.scheduleId === scheduleId ? roster.rows : [];
  const current = records?.api === api && records.filter === statusFilter ? records : null;
  const rows = current?.rows ?? [];
  const error = current?.error;
  const loading = refreshing || !current;

  const load = useCallback(() => {
    const requestId = ++recordsRequest.current;
    const qs = statusFilter !== 'ALL' ? `?status=${statusFilter}` : '';
    return api.get<AnswerSheet[] | { data: AnswerSheet[] }>(`/api/exam-cell/answer-sheets${qs}`).then(res => {
      if (requestId !== recordsRequest.current) return;
      setRecords({ api, filter: statusFilter, rows: Array.isArray(res) ? res : (res?.data ?? []), error: null });
    }).catch((e: unknown) => {
      if (requestId !== recordsRequest.current) return;
      toast.error(e instanceof Error ? e.message : 'Failed to load answer sheets');
      setRecords({ api, filter: statusFilter, rows: [], error: e instanceof Error ? e.message : 'Failed to load answer sheets' });
    }).finally(() => {
      if (requestId === recordsRequest.current) setRefreshing(false);
    });
  }, [api, statusFilter]);

  useEffect(() => {
    void load();
    return () => { recordsRequest.current += 1; };
  }, [load]);

  async function issueSheet() {
    if (!canManage || busy || !sheetNumber.trim() || !source?.schedules.some(s => s.exam_schedule_id === scheduleId) || !candidates.some(c => c.student_user_id === studentId)) {
      toast.error('Select the examination, roster student and actual booklet number');
      return;
    }
    setBusy(true);
    try {
      const row = await api.post<AnswerSheet>('/api/exam-cell/answer-sheets', {
        sheet_number: sheetNumber.trim(),
        exam_schedule_id: scheduleId,
        student_user_id: studentId,
      });
      toast.success(`Issued sheet ${sheetNumber} · QR: ${row.qr_payload.slice(0, 20)}…`);
      setSheetNumber('');
      setRefreshing(true);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Issue failed');
    } finally {
      setBusy(false);
    }
  }

  async function advanceStatus(sheetId: string, current: string) {
    const idx = STATUS_FLOW.indexOf(current as (typeof STATUS_FLOW)[number]);
    const next = STATUS_FLOW[idx + 1];
    if (!next || !canManage || busy) return;
    if (next === 'EVALUATOR_ASSIGNED' && !evaluatorId) { toast.error('Select an evaluator first'); return; }
    setBusy(true);
    try {
      await api.post(`/api/exam-cell/answer-sheets/${sheetId}/status`, { status: next, ...(next === 'EVALUATOR_ASSIGNED' ? { evaluator_user_id: evaluatorId } : {}) });
      toast.success(`Status → ${next.replace(/_/g, ' ')}`);
      setRefreshing(true);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  const columns: DataTableColumn<AnswerSheet>[] = [
    {
      key: 'number',
      header: 'Sheet #',
      render: (r) => (
        <span className="rounded-md bg-sgvu-navy/[0.04] px-2 py-1 font-mono text-sm font-semibold text-sgvu-navy">
          {r.sheet_number}
        </span>
      ),
    },
    {
      key: 'qr',
      header: 'QR',
      render: (r) => (
        <span className="font-mono text-xs text-muted-foreground">
          {r.qr_payload.slice(0, 18)}…
        </span>
      ),
    },
    {
      key: 'student',
      header: 'Student',
      render: (r) => (
        <span className="font-medium text-sgvu-navy">{r.student_name ?? '—'}</span>
      ),
    },
    {
      key: 'exam',
      header: 'Exam',
      render: (r) => (
        <div>
          <p className="text-sm font-medium text-sgvu-navy">{r.subject_name ?? '—'}</p>
          <p className="text-xs text-muted-foreground">
            {r.exam_date ? String(r.exam_date).slice(0, 10) : '—'}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <Badge variant="outline" className={`font-semibold ${statusTone(r.status)}`}>
          {r.status.replace(/_/g, ' ')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Lifecycle',
      render: (r) =>
        canManage && r.exam_schedule_id && r.student_user_id && (r.status === 'ISSUED' || r.collected_at) && STATUS_FLOW.indexOf(r.status as (typeof STATUS_FLOW)[number]) < STATUS_FLOW.length - 1 ? (
          <Button
            size="sm"
            variant="outline"
            className={btnPrimary}
            disabled={busy}
            onClick={() => void advanceStatus(r.sheet_id, r.status)}
          >
            Next stage
          </Button>
        ) : (
          <span className="text-xs font-medium text-muted-foreground">{r.status === 'ARCHIVED' ? 'Archived' : 'Read only'}</span>
        ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <ExamCellPageHeader pageId="answer-sheets" />
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-5 p-5 md:p-6">
          <div className="border-b border-sgvu-navy/10 pb-4">
            <h2 className="text-lg font-bold text-sgvu-navy">Issue answer booklet</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
                Link each actual booklet to its examination and roster student. Record collection and missing scripts on Exam Day.
            </p>
          </div>

          {sourceError ? <p role="alert" className="text-sm text-red-700">{sourceError}</p> : null}
          {canManage ? <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
            <div><label htmlFor="booklet-exam" className={labelClass}>Booklet examination</label><Select id="booklet-exam" disabled={busy} value={scheduleId} onChange={e => { setScheduleId(e.target.value); setStudentId(''); }}><option value="">Select examination</option>{source?.schedules.map(s => <option key={s.exam_schedule_id} value={s.exam_schedule_id}>{s.subject_name} · {s.exam_date}</option>)}</Select></div>
            <div><label htmlFor="booklet-student" className={labelClass}>Booklet student</label><Select id="booklet-student" disabled={busy || !candidates.length} value={studentId} onChange={e => setStudentId(e.target.value)}><option value="">Select roster student</option>{candidates.map(c => <option key={c.student_user_id} value={c.student_user_id}>{c.student_name}</option>)}</Select></div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Sheet number</label>
              <Input
                className="h-10 rounded-lg border-sgvu-navy/20 focus-visible:ring-sgvu-gold/40"
                placeholder="e.g. AS-2026-001"
                value={sheetNumber}
                onChange={(e) => setSheetNumber(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void issueSheet();
                  }
                }}
              />
            </div>
            <Button
              variant="outline"
              className={btnPrimary}
              disabled={busy || !studentId || !sheetNumber.trim()}
              onClick={() => void issueSheet()}
            >
              {busy ? 'Issuing…' : 'Issue & generate QR'}
            </Button>
          </div> : <p className="text-sm text-muted-foreground">Your role can view booklet records.</p>}
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-5 p-5 md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-sgvu-navy/10 pb-4">
            <div>
              <h2 className="text-lg font-bold text-sgvu-navy">Answer sheet tracking</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {loading
                  ? 'Loading sheets…'
                  : `${rows.length} sheet${rows.length === 1 ? '' : 's'}${statusFilter !== 'ALL' ? ' (filtered)' : ''}`}
              </p>
            </div>
            <div className="flex w-full flex-col gap-1.5 sm:w-56">
              <label className={labelClass}>Status</label>
              <Select
                className={fieldClass}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">All statuses</option>
                {STATUS_FLOW.map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                ))}
              </Select>
            </div>
          </div>
          {canManage ? <div className="max-w-sm"><label htmlFor="booklet-evaluator" className={labelClass}>Evaluator for the assignment stage</label><Select id="booklet-evaluator" value={evaluatorId} disabled={busy} onChange={e => setEvaluatorId(e.target.value)}><option value="">Select evaluator</option>{source?.faculty.map(f => <option key={f.user_id} value={f.user_id}>{f.name}</option>)}</Select><p className="mt-1 text-xs text-muted-foreground">The server verifies the evaluator&apos;s current subject assignment.</p></div> : null}

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-7 w-7 animate-spin text-sgvu-navy" />
            </div>
          ) : error ? <p role="alert" className="text-sm text-red-700">Answer-sheet records are unavailable. Reload to retry.</p> : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-sgvu-navy/20 px-6 py-12 text-center">
              <p className="text-sm font-semibold text-sgvu-navy">No answer sheets tracked yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Issue a booklet above to start the QR lifecycle, or clear the status filter.
              </p>
            </div>
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(r) => r.sheet_id}
              emptyMessage="No answer sheets match this status."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
