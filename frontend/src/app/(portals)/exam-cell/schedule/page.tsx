'use client';

import { Select } from '@/components/ui/select';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { canExamCellAction } from '@/lib/exam-cell-rbac';

type Session = { session_id: string; session_name: string; semester: number | null; status: string };
type Schedule = {
  exam_schedule_id: string; session_id: string; exam_type: string;
  subject_name?: string; subject_code?: string; exam_date: string;
  start_time: string; end_time: string; venue: string; status: string;
};
type Subject = { subject_id: number; subject_code: string; subject_name: string; semester: number | null };
type Form = { exam_type: string; subject_id: string; exam_date: string; start_time: string; end_time: string; venue: string; max_marks: string; batch_label: string };
const emptyForm: Form = { exam_type: '', subject_id: '', exam_date: '', start_time: '', end_time: '', venue: '', max_marks: '', batch_label: '' };

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function sessionRows(value: unknown): Session[] {
  if (!Array.isArray(value) || value.some((item: unknown) => !record(item) || typeof item.session_id !== 'string' || !item.session_id
    || typeof item.session_name !== 'string' || !item.session_name || typeof item.status !== 'string'
    || (item.semester !== null && (!Number.isSafeInteger(item.semester) || Number(item.semester) < 1)))
    || new Set(value.map((item: Session) => item.session_id)).size !== value.length) throw new Error('Examination sessions could not be verified');
  return value as Session[];
}

function subjectRows(value: unknown): Subject[] {
  if (!Array.isArray(value) || value.some((item: unknown) => !record(item) || !Number.isSafeInteger(item.subject_id) || Number(item.subject_id) < 1
    || typeof item.subject_code !== 'string' || typeof item.subject_name !== 'string'
    || (item.semester !== null && (!Number.isSafeInteger(item.semester) || Number(item.semester) < 1)))) throw new Error('Subject catalogue could not be verified');
  return value as Subject[];
}

function scheduleRows(value: unknown, sessionId: string): Schedule[] {
  if (!Array.isArray(value) || value.some((item: unknown) => !record(item) || typeof item.exam_schedule_id !== 'string' || !item.exam_schedule_id
    || item.session_id !== sessionId || typeof item.exam_type !== 'string' || typeof item.exam_date !== 'string'
    || typeof item.start_time !== 'string' || typeof item.end_time !== 'string' || typeof item.venue !== 'string' || typeof item.status !== 'string')) {
    throw new Error('Session timetable could not be verified');
  }
  return value as Schedule[];
}

export default function ExamCellSchedulePage() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const role = user?.primaryRole ?? user?.role;
  const canRead = canExamCellAction(role, 'view_dashboard');
  const canManage = canExamCellAction(role, 'manage_schedules');
  const canRelease = canExamCellAction(role, 'release_timetable');
  const scope = [user?.user_id ?? '', user?.tenant_id ?? '', role ?? ''].join(':');
  const hasContext = Boolean(user?.user_id && user?.tenant_id);
  const [catalogue, setCatalogue] = useState<{ api: typeof api; scope: string; sessions: Session[]; subjects: Subject[]; error?: string } | null>(null);
  const [selection, setSelection] = useState({ scope, id: '' });
  const [snapshot, setSnapshot] = useState<{ api: typeof api; key: string; data?: Schedule[]; error?: string } | null>(null);
  const [formState, setFormState] = useState({ key: '', value: emptyForm });
  const [mutation, setMutation] = useState<{ key: string; pending?: boolean; error?: string } | null>(null);
  const [releaseMutation, setReleaseMutation] = useState<{ key: string; pending?: boolean; error?: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const catalogueEpoch = useRef(0);
  const scheduleEpoch = useRef(0);
  const mutationEpoch = useRef(0);
  const pendingMutation = useRef<string | null>(null);
  const currentCatalogue = catalogue?.api === api && catalogue.scope === scope ? catalogue : null;
  const selectedId = selection.scope === scope ? selection.id : '';
  const session = currentCatalogue?.sessions.find((item) => item.session_id === selectedId);
  const key = [scope, selectedId].join(':');
  const current = snapshot?.api === api && snapshot.key === key ? snapshot : null;
  const form = formState.key === key ? formState.value : emptyForm;
  const currentMutation = mutation?.key === key ? mutation : null;
  const catalogueLoading = canRead && hasContext && !currentCatalogue;
  const loading = Boolean(session && (!current || refreshing));
  const subjects = (currentCatalogue?.subjects ?? []).filter((item) => !session?.semester || item.semester === null || item.semester === session.semester);
  const schedules = current?.data ?? [];
  const currentReleaseMutation = releaseMutation?.key === key ? releaseMutation : null;
  const actionPending = Boolean(currentMutation?.pending || currentReleaseMutation?.pending);
  const canEdit = canManage && Boolean(session && ['DRAFT', 'OPEN', 'ACTIVE'].includes(session.status)) && !schedules.some((item) => item.status === 'RELEASED') && !actionPending;

  const loadCatalogue = useCallback(() => {
    if (!canRead || !hasContext) return Promise.resolve();
    const epoch = ++catalogueEpoch.current;
    return Promise.all([
      api.get<unknown>('/api/exam-cell/sessions').then(sessionRows),
      api.get<unknown>('/api/exam-cell/subjects').then(subjectRows),
    ]).then(([sessions, subjects]) => {
      if (catalogueEpoch.current === epoch) setCatalogue({ api, scope, sessions, subjects });
    }).catch((error: unknown) => {
      if (catalogueEpoch.current === epoch) setCatalogue({ api, scope, sessions: [], subjects: [], error: error instanceof Error ? error.message : 'Timetable source data is unavailable' });
    });
  }, [api, scope, canRead, hasContext]);

  const loadSchedules = useCallback(() => {
    if (!canRead || !hasContext || !session) return Promise.resolve();
    const epoch = ++scheduleEpoch.current;
    return api.get<unknown>('/api/exam-cell/schedules?' + new URLSearchParams({ session_id: session.session_id })).then((value) => scheduleRows(value, session.session_id)).then((data) => {
      if (scheduleEpoch.current === epoch) setSnapshot({ api, key, data });
    }).catch((error: unknown) => {
      if (scheduleEpoch.current === epoch) setSnapshot({ api, key, error: error instanceof Error ? error.message : 'Session timetable is unavailable' });
    }).finally(() => {
      if (scheduleEpoch.current === epoch) setRefreshing(false);
    });
  }, [api, canRead, hasContext, session, key]);

  useEffect(() => {
    const requests = catalogueEpoch;
    void loadCatalogue();
    return () => { requests.current++; };
  }, [loadCatalogue]);

  useEffect(() => {
    const requests = scheduleEpoch;
    const mutations = mutationEpoch;
    const pending = pendingMutation;
    void loadSchedules();
    return () => { requests.current++; mutations.current++; pending.current = null; };
  }, [loadSchedules]);

  function update(field: keyof Form, value: string) {
    setFormState({ key, value: { ...form, [field]: value } });
    setMutation(null);
  }

  async function create() {
    if (!canEdit || !session || !hasContext || currentCatalogue?.error || pendingMutation.current === key) return;
    const subject = subjects.find((item) => String(item.subject_id) === form.subject_id);
    let error: string | undefined;
    if (!subject || !['MID_TERM', 'END_TERM', 'PRACTICAL'].includes(form.exam_type) || !form.exam_date || !form.start_time || !form.end_time || !form.venue.trim()) error = 'Select the session, subject and exam type, then enter the exam date, times and venue.';
    else if (form.start_time >= form.end_time) error = 'End time must be after start time.';
    else if (form.max_marks.trim() && (!Number.isSafeInteger(Number(form.max_marks)) || Number(form.max_marks) < 1 || Number(form.max_marks) > 2147483647)) error = 'Maximum marks must be a positive whole number.';
    if (error || !subject) { setMutation({ key, error: error ?? 'Select a valid catalogue subject.' }); return; }
    const epoch = ++mutationEpoch.current;
    pendingMutation.current = key;
    setMutation({ key, pending: true });
    try {
      const result = await api.post<unknown>('/api/exam-cell/schedules', {
        session_id: session.session_id, exam_type: form.exam_type, subject_id: subject.subject_id,
        exam_date: form.exam_date, start_time: form.start_time, end_time: form.end_time, venue: form.venue.trim(),
        ...(form.max_marks.trim() ? { max_marks: Number(form.max_marks) } : {}),
        ...(form.batch_label.trim() ? { batch_label: form.batch_label.trim() } : {}),
      });
      if (mutationEpoch.current !== epoch) return;
      const saved = scheduleRows(result, session.session_id);
      if (saved.length !== 1) throw new Error('Saved timetable response could not be verified. Refresh the session before retrying.');
      toast.success('Exam slot saved');
      setMutation({ key, pending: false });
      setRefreshing(true);
      await loadSchedules();
    } catch (error: unknown) {
      if (mutationEpoch.current === epoch) setMutation({ key, error: error instanceof Error ? error.message : 'Exam slot could not be saved' });
    } finally {
      if (mutationEpoch.current === epoch) pendingMutation.current = null;
    }
  }

  async function releaseTimetable() {
    if (!canRelease || !session || schedules.length === 0 || pendingMutation.current === key || schedules.some((item) => item.status !== 'SCHEDULED')) return;
    const epoch = ++mutationEpoch.current;
    pendingMutation.current = key;
    setReleaseMutation({ key, pending: true });
    try {
      const result = await api.post<unknown>(`/api/exam-cell/sessions/${session.session_id}/timetable/release`, {});
      if (mutationEpoch.current !== epoch) return;
      const released = scheduleRows(result, session.session_id);
      if (released.length !== schedules.length || released.some((item) => item.status !== 'RELEASED')) {
        throw new Error('Released timetable response could not be verified. Refresh the session before retrying.');
      }
      toast.success('Timetable released to students');
      setReleaseMutation({ key });
      setRefreshing(true);
      await loadSchedules();
    } catch (error: unknown) {
      if (mutationEpoch.current === epoch) setReleaseMutation({ key, error: error instanceof Error ? error.message : 'Timetable could not be released' });
    } finally {
      if (mutationEpoch.current === epoch) pendingMutation.current = null;
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm"><CardContent className="p-5 md:p-6"><p className="text-sm font-semibold text-sgvu-gold">Falcon Exam OS</p><h1 className="text-2xl font-bold text-sgvu-navy">Exam Timetable</h1><p className="mt-1 text-sm text-muted-foreground">Session-linked examination slots for Hall Ticket readiness, seating and invigilation.</p></CardContent></Card>
      {!canRead || !hasContext ? <p role="alert" className="text-sm text-red-700">{!canRead ? 'Your active role cannot access the examination timetable.' : 'Authenticated tenant and user context is unavailable. Sign in again.'}</p> : (
        <>
          <Card className="border-sgvu-gold/20 bg-amber-50/30"><CardContent className="py-3 text-sm">Every new slot belongs to the selected examination session. Subject labels come from the academic catalogue; the backend verifies official enrollment and allocation. Saving a slot does not approve or issue a Hall Ticket.</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Examination session</CardTitle></CardHeader><CardContent className="space-y-3">
            <label htmlFor="timetable-session" className="text-sm font-bold leading-5 text-sgvu-navy">Select session</label>
            <Select id="timetable-session" className="h-10 w-full rounded-md border px-3 text-sm" value={session?.session_id ?? ''} disabled={catalogueLoading || Boolean(currentCatalogue?.error) || Boolean(currentMutation?.pending)} onChange={(event) => {
              scheduleEpoch.current++; mutationEpoch.current++; pendingMutation.current = null;
              const nextKey = [scope, event.target.value].join(':');
              setSelection({ scope, id: event.target.value }); setFormState({ key: nextKey, value: emptyForm }); setMutation(null); setReleaseMutation(null); setRefreshing(false);
            }}>
              <option value="">{catalogueLoading ? 'Loading sessions…' : 'Select examination session'}</option>
              {(currentCatalogue?.sessions ?? []).map((item) => <option key={item.session_id} value={item.session_id}>{item.session_name}{item.semester ? ' · Semester ' + item.semester : ''} · {item.status}</option>)}
            </Select>
            {currentCatalogue?.error ? <div role="alert" className="space-y-2 text-sm text-red-700"><p>{currentCatalogue.error}</p><Button variant="outline" onClick={() => void loadCatalogue()}>Retry loading session data</Button></div> : !catalogueLoading && currentCatalogue?.sessions.length === 0 ? <p className="text-sm text-muted-foreground">No examination sessions are available. Configure an authorized session before scheduling.</p> : null}
          </CardContent></Card>
          {canManage ? <Card><CardHeader><CardTitle className="text-base">Add exam slot</CardTitle></CardHeader><CardContent className="space-y-3">
            {!session ? <p className="text-sm text-muted-foreground">Select a real examination session before adding a slot.</p> : schedules.some((item) => item.status === 'RELEASED') ? <p className="text-sm text-muted-foreground">This timetable is officially released. New slots are blocked until an authorized timetable amendment workflow exists.</p> : !canEdit ? <p className="text-sm text-muted-foreground">The selected session is closed or archived. New timetable slots are blocked.</p> : null}
            <fieldset disabled={!canEdit || Boolean(currentMutation?.pending)} className="grid gap-4 sm:grid-cols-2">
              <div className="flex min-h-[4.5rem] flex-col gap-1.5"><label htmlFor="timetable-type" className="text-sm font-bold text-sgvu-navy">Exam type</label><Select id="timetable-type" className="h-10 w-full rounded-md border px-3 text-sm" value={form.exam_type} disabled={!canEdit || Boolean(currentMutation?.pending)} onChange={(event) => update('exam_type', event.target.value)}><option value="">Select exam type</option><option value="MID_TERM">Mid Term</option><option value="END_TERM">End Term</option><option value="PRACTICAL">Practical</option></Select></div>
              <div className="flex min-h-[4.5rem] flex-col gap-1.5"><label htmlFor="timetable-subject" className="text-sm font-bold text-sgvu-navy">Subject</label><Select id="timetable-subject" className="h-10 w-full rounded-md border px-3 text-sm" value={form.subject_id} disabled={!canEdit || Boolean(currentMutation?.pending)} onChange={(event) => update('subject_id', event.target.value)}><option value="">Select subject</option>{subjects.map((item) => <option key={item.subject_id} value={String(item.subject_id)}>{item.subject_code} — {item.subject_name}{item.semester ? ' (Sem ' + item.semester + ')' : ''}</option>)}</Select></div>
              <div className="space-y-1.5"><label htmlFor="timetable-date" className="text-sm font-bold text-sgvu-navy">Exam date</label><Input id="timetable-date" type="date" value={form.exam_date} onChange={(event) => update('exam_date', event.target.value)} /></div>
              <div className="space-y-1.5"><label htmlFor="timetable-label" className="text-sm font-bold text-sgvu-navy">Batch label (optional metadata)</label><Input id="timetable-label" maxLength={80} value={form.batch_label} onChange={(event) => update('batch_label', event.target.value)} /></div>
              <div className="space-y-1.5"><label htmlFor="timetable-start" className="text-sm font-bold text-sgvu-navy">Start time</label><Input id="timetable-start" type="time" value={form.start_time} onChange={(event) => update('start_time', event.target.value)} /></div>
              <div className="space-y-1.5"><label htmlFor="timetable-end" className="text-sm font-bold text-sgvu-navy">End time</label><Input id="timetable-end" type="time" value={form.end_time} onChange={(event) => update('end_time', event.target.value)} /></div>
              <div className="space-y-1.5"><label htmlFor="timetable-venue" className="text-sm font-bold text-sgvu-navy">Venue</label><Input id="timetable-venue" maxLength={120} value={form.venue} onChange={(event) => update('venue', event.target.value)} /></div>
              <div className="space-y-1.5"><label htmlFor="timetable-max" className="text-sm font-bold text-sgvu-navy">Maximum marks (optional)</label><Input id="timetable-max" type="number" min={1} step={1} value={form.max_marks} onChange={(event) => update('max_marks', event.target.value)} /></div>
              <Button className="sm:col-span-2" onClick={() => void create()} disabled={!canEdit || Boolean(currentMutation?.pending)}>{currentMutation?.pending ? 'Saving…' : 'Add to schedule'}</Button>
            </fieldset>
            {session && !currentCatalogue?.error && subjects.length === 0 ? <p className="text-sm text-muted-foreground">No catalogue subjects are available for this semester. The academic source must be reviewed.</p> : null}
            {currentMutation?.error ? <p role="alert" className="text-sm text-red-700">{currentMutation.error}</p> : null}
          </CardContent></Card> : null}
          <Card><CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2"><CardTitle className="text-base">{session && current?.data && !loading ? current.data.length + ' timetable entries · ' + session.session_name : 'Session timetable'}</CardTitle><div className="flex flex-wrap items-center gap-2">{canRelease && session && schedules.length > 0 && schedules.every((item) => item.status === 'SCHEDULED') ? <Button size="sm" disabled={loading || actionPending} onClick={() => void releaseTimetable()}>{currentReleaseMutation?.pending ? 'Releasing…' : 'Release timetable to students'}</Button> : null}{session ? <Button variant="outline" size="sm" disabled={loading || actionPending} onClick={() => { setRefreshing(true); void loadSchedules(); }}>Refresh timetable</Button> : null}</div></CardHeader><CardContent className="space-y-2">
            {session && schedules.some((item) => item.status === 'RELEASED') ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">This timetable is officially released. Students can see its active exam slots, and new slots are locked for this session.</p> : null}
            {currentReleaseMutation?.error ? <p role="alert" className="text-sm text-red-700">{currentReleaseMutation.error}</p> : null}
            {session && schedules.some((item) => item.status === 'SCHEDULED') ? <p className="text-xs text-muted-foreground">Prepared slots are not visible to students. Only ExamCell can release the complete validated session timetable.</p> : null}
            {!session ? <p className="py-8 text-center text-sm text-muted-foreground">Select a session to view its timetable. Unlinked historical schedules are not automatically assigned.</p> : loading ? <div role="status" className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading session timetable…</div> : current?.error ? <p role="alert" className="py-8 text-sm text-red-700">{current.error}. Use Refresh timetable to retry.</p> : schedules.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No exams scheduled for this session.</p> : schedules.map((item) => <div key={item.exam_schedule_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white px-4 py-3 text-sm"><div><p className="font-semibold text-sgvu-navy">{item.subject_name ?? item.subject_code ?? 'Subject'} · {item.exam_type}</p><p className="text-muted-foreground">{item.exam_date.slice(0, 10)} · {item.start_time.slice(0, 5)}–{item.end_time.slice(0, 5)} · {item.venue}</p><p className="text-xs text-muted-foreground">{session.session_name}</p></div><Badge>{item.status}</Badge></div>)}
          </CardContent></Card>
        </>
      )}
    </div>
  );
}
