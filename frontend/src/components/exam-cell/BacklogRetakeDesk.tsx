'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { canExamCellAction } from '@/lib/exam-cell-rbac';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { toast } from '@/lib/notifications/falcon-toast';

type Option = { course_id?: string; course_code?: string; course_name?: string; session_id?: string; session_name?: string; cycle_type?: string; exam_schedule_id?: string; subject_name?: string; exam_date?: string; user_id?: string; name?: string; policy_id?: number; policy_name?: string };
type Offering = { offering_id: string; course_code: string; source_exam_type: string; semester: number; status: string; fee_mode: string; fee_amount: number | string; attempt_limit: number; selection_policy: string; exam_date: string; session_name: string; opens_at: string; closes_at: string };
type Attempt = { attempt_id: string; student_name: string; course_code: string; status: string; marks_status: string; marks_obtained: number | null; max_marks: number | string; fee_status: string; demand_status: string | null; result_status: string | null; attempt_number: number };
const blank = { course_id: '', semester: '', source_exam_type: '', exam_session_id: '', exam_schedule_id: '', faculty_user_id: '', academic_year: '', opens_at: '', closes_at: '', payment_due_date: '', fee_mode: '', fee_amount: '', attempt_limit: '', selection_policy: '', grading_policy_id: '', max_marks: '', pass_marks: '' };
type Snapshot = { offerings: Offering[]; attempts: Attempt[]; courses: Option[]; sessions: Option[]; schedules: Option[]; faculty: Option[]; policies: Option[] };

function displayDate(value: string | undefined, withTime = false) {
  if (!value || Number.isNaN(Date.parse(value))) return '—';
  return withTime ? new Date(value).toLocaleString('en-IN') : new Date(value).toLocaleDateString('en-IN');
}

export function BacklogRetakeDesk() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const roles = [...(user?.roles ?? []), user?.role, user?.primaryRole].filter((role): role is string => Boolean(role));
  const manage = canExamCellAction(roles, 'manage_sessions');
  const publish = canExamCellAction(roles, 'publish_results');
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(blank);
  const [reason, setReason] = useState<Record<string, string>>({});
  const generation = useRef(0);
  const pending = useRef(false);
  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true); setError(null);
    try {
      const [offerings, attempts, courses, sessions, schedules, faculty, policies] = await Promise.all([
        api.get<Offering[]>('/api/exam-cell/backlog/offerings'), api.get<Attempt[]>('/api/exam-cell/backlog/attempts'),
        api.get<Option[]>('/api/exam-cell/result-control/courses'), api.get<Option[]>('/api/exam-cell/sessions'),
        api.get<Option[]>('/api/exam-cell/schedules'), api.get<Option[]>('/api/exam-cell/faculty-roster'),
        api.get<Option[]>('/api/exam-cell/result-control/grading-policies'),
      ]);
      if (current === generation.current) setData({ offerings, attempts, courses, sessions, schedules, faculty, policies });
    } catch (e) { if (current === generation.current) { setData(null); setError(e instanceof Error ? e.message : 'Retake service is unavailable'); } }
    finally { if (current === generation.current) setLoading(false); }
  }, [api]);
  useEffect(() => { void Promise.resolve().then(load); return () => { generation.current += 1; }; }, [load]);
  async function mutate(path: string, body: object, message: string) {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    try { await api.post(path, body); toast.success(message); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Retake action failed'); }
    finally { pending.current = false; setBusy(false); }
  }
  function configure(event: React.FormEvent) {
    event.preventDefault();
    if (Object.values(form).some(value => !value.trim())) { toast.error('Every academic, payment and registration rule must be explicitly configured'); return; }
    const body = { ...form, semester: Number(form.semester), fee_amount: Number(form.fee_amount), attempt_limit: Number(form.attempt_limit), grading_policy_id: Number(form.grading_policy_id), max_marks: Number(form.max_marks), pass_marks: Number(form.pass_marks) };
    void mutate('/api/exam-cell/backlog/offerings', body, 'Draft retake offering saved; review its rules before opening registration');
  }
  const select = (key: keyof typeof blank, label: string, options: { value: string; label: string }[]) => <label className="space-y-1 text-sm" key={key}><span>{label}</span><Select aria-label={label} value={form[key]} disabled={busy} onChange={event => setForm(current => ({ ...current, [key]: String(event.target.value), ...(key === 'fee_mode' && event.target.value === 'NO_FEE' ? { fee_amount: '0' } : {}) }))}><option value="">Select…</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></label>;
  const input = (key: keyof typeof blank, label: string, type = 'text') => <label className="space-y-1 text-sm" key={key}><span>{label}</span><Input aria-label={label} type={type} step={type === 'number' ? 'any' : undefined} required disabled={busy} value={form[key]} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} /></label>;
  const offeringColumns: DataTableColumn<Offering>[] = [
    { key: 'course', header: 'Course / exam session', render: row => <div><p>{row.course_code} · {row.source_exam_type} · Semester {row.semester}</p><p className="mt-1 text-xs text-muted-foreground">{row.session_name ?? 'Session unavailable'} · Exam {displayDate(row.exam_date)} · Ref {row.offering_id.slice(0, 8)}</p></div> },
    { key: 'rules', header: 'Explicit rules', render: row => <div>{row.fee_mode === 'NO_FEE' ? 'No fee' : `₹${row.fee_amount}`} · Up to {row.attempt_limit} published retakes<br />{row.selection_policy === 'BEST_ATTEMPT' ? 'Highest published percentage (including original)' : 'Latest published retake'}</div> },
    { key: 'status', header: 'Registration', render: row => <div><p>{row.status}</p><p className="mt-1 text-xs text-muted-foreground">Opens {displayDate(row.opens_at, true)}<br />Closes {displayDate(row.closes_at, true)}</p></div> },
    { key: 'actions', header: 'Actions', render: row => manage ? <Button disabled={busy} variant="outline" onClick={() => void mutate(`/api/exam-cell/backlog/offerings/${row.offering_id}/status`, { status: row.status === 'OPEN' ? 'CLOSED' : 'OPEN' }, 'Registration status updated')}>{row.status === 'OPEN' ? 'Close registration' : 'Open registration'}</Button> : null },
  ];
  const attemptColumns: DataTableColumn<Attempt>[] = [
    { key: 'student', header: 'Student / course', render: row => <div>{row.student_name}<br />{row.course_code} · Retake {row.attempt_number}</div> },
    { key: 'stage', header: 'Workflow', render: row => <div>{row.status}<br />{row.marks_status} · Fee {row.demand_status ?? row.fee_status}</div> },
    { key: 'marks', header: 'Retake marks', render: row => row.marks_obtained === null ? 'Awaiting faculty entry' : `${row.marks_obtained}/${row.max_marks}${row.result_status ? ` · ${row.result_status}` : ''}` },
    { key: 'actions', header: 'Review / publication', render: row => <div className="flex flex-wrap gap-2">
      {manage && ['PAYMENT_PENDING', 'PENDING_REVIEW'].includes(row.status) && <><Input aria-label={`Review reason for ${row.student_name}`} disabled={busy} value={reason[row.attempt_id] ?? ''} onChange={event => setReason(current => ({ ...current, [row.attempt_id]: event.target.value }))} /><Button disabled={busy || !reason[row.attempt_id]?.trim()} onClick={() => void mutate(`/api/exam-cell/backlog/attempts/${row.attempt_id}/review`, { decision: 'APPROVED', reason: reason[row.attempt_id] }, 'Retake registration approved')}>Approve registration</Button><Button disabled={busy || !reason[row.attempt_id]?.trim()} variant="outline" onClick={() => void mutate(`/api/exam-cell/backlog/attempts/${row.attempt_id}/review`, { decision: 'REJECTED', reason: reason[row.attempt_id] }, 'Retake registration rejected')}>Reject registration</Button></>}
      {manage && row.status === 'APPROVED' && row.marks_status === 'SUBMITTED' && <Button disabled={busy} onClick={() => void mutate(`/api/exam-cell/backlog/attempts/${row.attempt_id}/audit`, {}, 'Retake marks audited and locked for Dean approval')}>Audit and lock marks</Button>}
      {row.marks_status === 'COE_APPROVED' && <span className="text-sm">Awaiting Dean approval</span>}
      {publish && row.status === 'APPROVED' && row.marks_status === 'DEAN_APPROVED' && <Button disabled={busy} onClick={() => void mutate(`/api/exam-cell/backlog/attempts/${row.attempt_id}/publish`, {}, 'Retake result published; original marks preserved')}>Publish retake result</Button>}
    </div> },
  ];
  if (loading) return <p role="status">Loading retake configuration and attempts…</p>;
  if (error) return <div role="alert" className="space-y-2"><p>{error}</p><Button onClick={() => void load()}>Retry retake service</Button></div>;
  if (!data) return null;
  return <div className="space-y-5">
    <Card><CardHeader><CardTitle>Retake rules and registration</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">No fees, attempt limits or grade-selection rules are assumed. Original results remain immutable. A best-attempt rule selects the highest published percentage, including the original; ties select the latest retake. Attempt limits count published retakes. Rejections do not issue refunds; Finance handles any refund separately.</p>
      {manage && <form onSubmit={configure} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {select('course_id', 'Retake course', data.courses.map(row => ({ value: row.course_id!, label: `${row.course_code} · ${row.course_name}` })))}
        {input('semester', 'Original semester', 'number')}{select('source_exam_type', 'Original examination type', [{ value: 'END_TERM', label: 'End term course result' }, { value: 'INTERNAL', label: 'Internal course result' }])}
        {select('exam_session_id', 'Supplementary or back-paper session', data.sessions.filter(row => ['SUPPLEMENTARY', 'BACK_PAPER'].includes(row.cycle_type ?? '')).map(row => ({ value: row.session_id!, label: row.session_name! })))}
        {select('exam_schedule_id', 'Retake schedule', data.schedules.map(row => ({ value: row.exam_schedule_id!, label: `${row.subject_name} · ${row.exam_date}` })))}
        {select('faculty_user_id', 'Assigned faculty', data.faculty.map(row => ({ value: row.user_id!, label: row.name! })))}
        {input('academic_year', 'Academic year')}{input('opens_at', 'Registration opens', 'datetime-local')}{input('closes_at', 'Registration closes', 'datetime-local')}{input('payment_due_date', 'Payment due date', 'date')}
        {select('fee_mode', 'Payment rule', [{ value: 'REQUIRED', label: 'Configured payment required' }, { value: 'NO_FEE', label: 'Explicitly no fee' }])}{input('fee_amount', 'Fee amount (INR)', 'number')}{input('attempt_limit', 'Maximum published retakes', 'number')}
        {select('selection_policy', 'Result selection rule', [{ value: 'LATEST_ATTEMPT', label: 'Latest published retake' }, { value: 'BEST_ATTEMPT', label: 'Highest published percentage, including original' }])}
        {select('grading_policy_id', 'Existing grading policy', data.policies.map(row => ({ value: String(row.policy_id), label: row.policy_name! })))}{input('max_marks', 'Retake maximum marks', 'number')}{input('pass_marks', 'Retake pass marks', 'number')}
        <Button type="submit" disabled={busy} className="self-end">Save draft retake offering</Button>
      </form>}
      <DataTable columns={offeringColumns} rows={data.offerings} rowKey={row => row.offering_id} emptyMessage="No retake offerings configured. Registration remains blocked until staff configure and open an offering." />
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Retake approval and results</CardTitle></CardHeader><CardContent><DataTable columns={attemptColumns} rows={data.attempts} rowKey={row => row.attempt_id} emptyMessage="No configured retake applications." /></CardContent></Card>
  </div>;
}
