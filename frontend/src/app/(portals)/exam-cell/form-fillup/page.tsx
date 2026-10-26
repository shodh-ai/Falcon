'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { canExamCellAction } from '@/lib/exam-cell-rbac';

type FormWindow = {
  window_id: string;
  session_id?: string | null;
  title: string;
  semester: number;
  program_label: string | null;
  opens_at: string;
  closes_at: string;
  status: string;
  session_name?: string | null;
};

type ExamSession = {
  session_id: string;
  session_name: string;
  semester: number | null;
  program_label: string | null;
  status: string;
};

type Registration = {
  registration_id: string;
  student_name: string;
  enrollment_number: string | null;
  semester: number;
  fee_status: string;
  status: string;
  eligibility_snapshot?: {
    eligible?: boolean; block_reasons?: string[];
    enrollments?: { enrollment_id: string; course_name: string; course_code: string; subject_name: string }[];
  } | null;
  window_title?: string | null;
};

export default function ExamCellFormFillupPage() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const canManage = canExamCellAction(user?.primaryRole ?? user?.role, 'manage_sessions');
  const [selectedWindow, setSelectedWindow] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [snapshot, setSnapshot] = useState<{
    api: typeof api; window: string; status: string;
    windows: FormWindow[]; registrations: Registration[]; sessions: ExamSession[];
    error: string | null;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [draftApi, setDraftApi] = useState(api);
  const loadRequest = useRef({ id: 0 });
  const mutationInFlight = useRef(false);
  const activeApi = useRef(api);
  const [form, setForm] = useState({
    title: '',
    session_id: '',
    opens_at: '',
    closes_at: '',
  });

  // Reset this component's draft before rendering a different authenticated context.
  if (draftApi !== api) {
    setDraftApi(api);
    setActionError(null);
    setForm({ title: '', session_id: '', opens_at: '', closes_at: '' });
  }

  const load = useCallback(() => {
    const request = ++loadRequest.current.id;
    async function fetchSnapshot() {
      const params = new URLSearchParams();
      if (selectedWindow) params.set('window_id', selectedWindow);
      if (statusFilter) params.set('status', statusFilter);
      return Promise.all([
        api.get<FormWindow[]>('/api/exam-cell/form-windows'),
        api.get<Registration[]>(`/api/exam-cell/registrations${params.size ? `?${params}` : ''}`),
        api.get<ExamSession[]>('/api/exam-cell/sessions'),
      ]);
    }
    return fetchSnapshot().then(([windows, registrations, sessions]) => {
      if (request !== loadRequest.current.id) return;
      setSnapshot({ api, window: selectedWindow, status: statusFilter, windows, registrations, sessions, error: null });
    }).catch((e: unknown) => {
      if (request !== loadRequest.current.id) return;
      const message = e instanceof Error ? e.message : 'Failed to load form fill-up desk';
      setSnapshot({ api, window: selectedWindow, status: statusFilter, windows: [], registrations: [], sessions: [], error: message });
      toast.error(message);
    }).finally(() => {
      if (request === loadRequest.current.id) setRefreshing(false);
    });
  }, [api, selectedWindow, statusFilter]);

  useEffect(() => {
    activeApi.current = api;
  }, [api]);

  useEffect(() => {
    const requests = loadRequest.current;
    void load();
    return () => { requests.id++; };
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
  }

  const current = snapshot?.api === api && snapshot.window === selectedWindow && snapshot.status === statusFilter ? snapshot : null;
  const loading = refreshing || !current;
  const error = current?.error;
  const windows = current?.windows ?? [];
  const registrations = current?.registrations ?? [];
  const sessions = current?.sessions ?? [];
  const selectableSessions = sessions.filter((s) => ['DRAFT', 'OPEN', 'ACTIVE'].includes(s.status) && Number.isInteger(s.semester) && Number(s.semester) > 0 && Boolean(s.program_label?.trim()));
  const selectedSession = selectableSessions.find((s) => s.session_id === form.session_id);
  const selectedFormWindow = windows.find((w) => w.window_id === selectedWindow);
  const disabled = loading || busy || Boolean(error);

  async function mutate(action: () => Promise<string>, fallback: string) {
    if (!canManage || disabled || mutationInFlight.current) return;
    mutationInFlight.current = true;
    setBusy(true);
    setActionError(null);
    try {
      const message = await action();
      if (activeApi.current !== api) return;
      toast.success(message);
      setRefreshing(true);
      await load();
    } catch (e) {
      if (activeApi.current !== api) return;
      const message = e instanceof Error ? e.message : fallback;
      setActionError(message);
      toast.error(message);
    } finally {
      mutationInFlight.current = false;
      setBusy(false);
    }
  }

  async function createWindow() {
    if (!selectedSession || !form.title.trim() || !form.opens_at || !form.closes_at) {
      setActionError('Select an examination session and enter the title and registration dates.');
      return;
    }
    const opensAt = new Date(form.opens_at);
    const closesAt = new Date(form.closes_at);
    if (!Number.isFinite(opensAt.getTime()) || !Number.isFinite(closesAt.getTime())) {
      setActionError('Enter valid opening and closing dates.');
      return;
    }
    if (closesAt.getTime() <= opensAt.getTime()) {
      setActionError('The closing date must be after the opening date.');
      return;
    }
    await mutate(async () => {
      await api.post('/api/exam-cell/form-windows', {
        ...form,
        opens_at: opensAt.toISOString(),
        closes_at: closesAt.toISOString(),
        title: form.title.trim(),
        semester: selectedSession.semester,
        program_label: selectedSession.program_label,
      });
      if (activeApi.current === api) setForm((f) => ({ ...f, title: '' }));
      return 'Form window created';
    }, 'Create failed');
  }

  async function setWindowStatus(windowId: string, status: 'OPEN' | 'CLOSED') {
    await mutate(async () => {
      await api.post(`/api/exam-cell/form-windows/${windowId}/status`, { status });
      return `Window ${status.toLowerCase()}`;
    }, 'Update failed');
  }

  async function syncRegistrations() {
    if (!selectedFormWindow || selectedFormWindow.status !== 'OPEN') return;
    await mutate(async () => {
      const res = await api.post<{ created: number; refreshed?: number; total_students: number }>(
        `/api/exam-cell/form-windows/${selectedWindow}/sync-registrations`,
        { semester: selectedFormWindow.semester },
      );
      return `Synced ${res.created} registrations${res.refreshed != null ? `; refreshed ${res.refreshed}` : ''} from ${res.total_students} students`;
    }, 'Sync failed');
  }

  async function reviewRegistration(id: string, status: 'APPROVED' | 'REJECTED') {
    await mutate(async () => {
      await api.post(`/api/exam-cell/registrations/${id}/review`, { status });
      return `Registration ${status.toLowerCase()}`;
    }, 'Review failed');
  }

  const regColumns: DataTableColumn<Registration>[] = [
    { key: 'student', header: 'Student', render: (r) => (
      <div><p className="font-medium">{r.student_name}</p><p className="text-xs text-muted-foreground">{r.enrollment_number ?? '—'}</p></div>
    ) },
    { key: 'subjects', header: 'Registered courses', render: (r) => (
      r.eligibility_snapshot?.enrollments?.length ? <ul className="space-y-1 text-xs">
        {r.eligibility_snapshot.enrollments.map((e) => <li key={e.enrollment_id}>{e.course_code} — {e.course_name}</li>)}
      </ul> : <span className="text-xs text-muted-foreground">Not verified</span>
    ) },
    { key: 'fee', header: 'Fee', render: (r) => <Badge variant={r.fee_status === 'PAID' ? 'default' : 'secondary'}>{r.fee_status}</Badge> },
    { key: 'eligibility', header: 'Eligibility', render: (r) => (
      <div className="space-y-1">
        <Badge variant={r.eligibility_snapshot?.eligible === true ? 'default' : r.eligibility_snapshot?.eligible === false ? 'destructive' : 'secondary'}>
          {r.eligibility_snapshot?.eligible === true ? 'Eligible' : r.eligibility_snapshot?.eligible === false ? 'Blocked' : 'Not verified'}
        </Badge>
        {r.eligibility_snapshot?.block_reasons?.length ? (
          <ul className="list-inside list-disc text-xs text-muted-foreground">
            {r.eligibility_snapshot.block_reasons.map((reason, i) => <li key={`${i}-${reason}`}>{reason}</li>)}
          </ul>
        ) : null}
      </div>
    ) },
    { key: 'status', header: 'Status', render: (r) => <Badge variant="outline">{r.status}</Badge> },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) => ['PENDING', 'REJECTED'].includes(r.status) && canManage ? (
        <div className="flex gap-1">
          <Button size="sm" variant="outline" disabled={disabled} onClick={() => void reviewRegistration(r.registration_id, 'APPROVED')}>
            {r.eligibility_snapshot?.eligible === true ? 'Approve' : 'Recheck & approve'}
          </Button>
          {r.status === 'PENDING' ? <Button size="sm" variant="ghost" disabled={disabled} onClick={() => void reviewRegistration(r.registration_id, 'REJECTED')}>Reject</Button> : null}
        </div>
      ) : null,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <ExamCellPageHeader pageId="form-fillup" actions={
            <Button
              variant="outline"
              size="sm"
              className="bg-[#0B2447] text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy"
              onClick={() => void refresh()}
              disabled={loading || busy}
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
          } />
        </CardContent>
      </Card>

      <Card className="border-sgvu-gold/20 bg-amber-50/30">
        <CardContent className="py-3 text-sm">
          <strong>Why this page?</strong> Form Fill-up Desk lets authorized staff manage examination registrations.
          Link a window to an existing examination session, sync official enrollments while the window is open, then review eligibility before the hall ticket workflow begins. Every approval rechecks current eligibility on the server; blocked or unverified records are not automatically approved.
        </CardContent>
      </Card>

      {error ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p>{error}</p>
        <Button variant="outline" size="sm" className="mt-2" disabled={loading || busy} onClick={() => void refresh()}>Retry loading registration desk</Button>
      </div> : null}
      {actionError ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{actionError}</div> : null}

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Create form window</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex min-h-[4.5rem] flex-col gap-1.5 sm:col-span-2">
                <label htmlFor="registration-title" className="text-sm font-bold leading-5 text-sgvu-navy">Window title</label>
                <Input
                  id="registration-title"
                  disabled={disabled}
                  className="h-10"
                  placeholder="e.g. End Semester Form Fill-up — Sem 4"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div className="flex min-h-[4.5rem] flex-col gap-1.5 sm:col-span-2">
                <label htmlFor="registration-session" className="text-sm font-bold leading-5 text-sgvu-navy">Examination session</label>
                <Select id="registration-session" className="h-10" value={form.session_id} disabled={disabled} onChange={(e) => setForm((f) => ({ ...f, session_id: e.target.value }))}>
                  <option value="">Select an examination session</option>
                  {selectableSessions.map((s) => <option key={s.session_id} value={s.session_id}>{s.session_name} · Semester {s.semester} · {s.program_label ?? 'All programs'}</option>)}
                </Select>
                {!loading && !error && selectableSessions.length === 0 ? <p className="text-xs text-muted-foreground">No available examination session has a configured semester and program. Configure it in Exam Sessions first.</p> : null}
              </div>
              <div className="flex min-h-[4.5rem] flex-col gap-1.5">
                <label htmlFor="registration-semester" className="text-sm font-bold leading-5 text-sgvu-navy">Semester</label>
                <Input
                  id="registration-semester"
                  className="h-10"
                  readOnly
                  value={selectedSession?.semester ?? ''}
                />
              </div>
              <div className="flex min-h-[4.5rem] flex-col gap-1.5">
                <label htmlFor="registration-program" className="text-sm font-bold leading-5 text-sgvu-navy">Program</label>
                <Input
                  id="registration-program"
                  className="h-10"
                  readOnly
                  value={selectedSession ? selectedSession.program_label ?? 'All programs' : ''}
                />
              </div>
              <div className="flex min-h-[4.5rem] flex-col gap-1.5">
                <label htmlFor="registration-opens" className="text-sm font-bold leading-5 text-sgvu-navy">Opens at</label>
                <Input
                  id="registration-opens"
                  disabled={disabled}
                  className="h-10"
                  type="datetime-local"
                  value={form.opens_at}
                  onChange={(e) => setForm((f) => ({ ...f, opens_at: e.target.value }))}
                />
              </div>
              <div className="flex min-h-[4.5rem] flex-col gap-1.5">
                <label htmlFor="registration-closes" className="text-sm font-bold leading-5 text-sgvu-navy">Closes at</label>
                <Input
                  id="registration-closes"
                  disabled={disabled}
                  className="h-10"
                  type="datetime-local"
                  value={form.closes_at}
                  onChange={(e) => setForm((f) => ({ ...f, closes_at: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex justify-center pt-1">
              <Button onClick={() => void createWindow()} disabled={disabled || !selectedSession}>
                {busy ? 'Creating…' : 'Create window'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Active form windows</CardTitle>
          {canManage && selectedWindow ? (
            <Button size="sm" variant="outline" disabled={disabled || selectedFormWindow?.status !== 'OPEN'} onClick={() => void syncRegistrations()}>Sync / refresh eligibility</Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? <Loader2 aria-label="Loading form windows" className="h-6 w-6 animate-spin" /> : error ? null : windows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No form windows configured. Create one above.</p>
          ) : windows.map((w) => (
            <div key={w.window_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
              <div>
                <p className="font-medium">{w.title}</p>
                <p className="text-xs text-muted-foreground">{w.session_name ?? 'Examination session not linked'}</p>
                <p className="text-xs text-muted-foreground">Sem {w.semester} · {w.program_label ?? 'All programs'} · {new Date(w.opens_at).toLocaleDateString()} – {new Date(w.closes_at).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge>{w.status}</Badge>
                {canManage && w.status === 'DRAFT' ? <Button size="sm" variant="outline" disabled={disabled} onClick={() => void setWindowStatus(w.window_id, 'OPEN')}>Open</Button> : null}
                {canManage && w.status === 'OPEN' ? <Button size="sm" variant="outline" disabled={disabled} onClick={() => void setWindowStatus(w.window_id, 'CLOSED')}>Close</Button> : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Registration queue</CardTitle>
          <div className="flex gap-2">
            <label htmlFor="registration-window-filter" className="sr-only">Registration window</label>
            <Select id="registration-window-filter" className="rounded-md border px-2 py-1 text-sm" value={selectedWindow} disabled={busy} onChange={(e) => setSelectedWindow(e.target.value)}>
              <option value="">All windows</option>
              {windows.map((w) => <option key={w.window_id} value={w.window_id}>{w.title}</option>)}
            </Select>
            <label htmlFor="registration-status-filter" className="sr-only">Registration status</label>
            <Select id="registration-status-filter" className="rounded-md border px-2 py-1 text-sm" value={statusFilter} disabled={busy} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <Loader2 aria-label="Loading registrations" className="h-6 w-6 animate-spin" /> : error ? null : (
            <DataTable columns={regColumns} rows={registrations} rowKey={(r) => r.registration_id} emptyMessage="No registrations yet. Open a window and sync students." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
